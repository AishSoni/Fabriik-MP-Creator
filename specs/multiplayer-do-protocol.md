# Spec: Multiplayer — Durable Object Protocol & Room Lifecycle

Status: Draft v1 — for review and iteration
Scope: `worker/src/docObject.ts`, `worker/src/index.ts`, command/rollback handling in
`app/src/collab/provider.ts`
Companion to: `specs/multiplayer-hld.md`, `specs/multiplayer-dld.md` (§5),
`specs/multiplayer-command-adapter.md`

## 1. Purpose

Define the exact wire protocol between Fabriik clients and the per-document Durable
Object, the client-side command state machine (optimistic apply → ack/reject →
rollback), and the DO lifecycle (startup, processing loop, persistence, hibernation).

## 2. Design decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | One WebSocket per room per tab; binary Yjs frames and tagged JSON control frames share it | One transport for sync + commands + awareness; no second connection to manage |
| 2 | Frame tagging follows the y-websocket message-number convention; custom JSON frames use tags ≥ 100 | Standard y-protocols sync/awareness handlers compose untouched; custom frames cannot collide with protocol tags |
| 3 | Commands are JSON uplink only; downlink doc changes are always Yjs binary | "Commands up, binary down" (HLD D2) — the doc diff is the real confirmation |
| 4 | DO processes commands strictly in receive order; ack/reject carry the client `commandId` | Single-threaded DO = total order per room; correlation without server-generated ids |
| 5 | Rejection is sender-only and triggers client re-sync | Others never see invalid state; re-sync is simple and always correct — and rejections are rare because the client ran the same validation module |
| 6 | `serverSeq` on acks and history entries is cosmetic | Display ordering only; Yjs state vectors are the real ordering mechanism |

## 3. Frame formats

Binary frames (unchanged y-protocols): `messageSync` (0), `messageAwareness` (1).

JSON control frames on the same socket, encoded as `[tag: uint8][utf8 JSON]`:

```ts
// client → DO — tag 100
type CommandFrame = {
  v: 1;
  commandId: string;          // client-generated UUID
  command: EditCommand;       // existing Fabriik command JSON (incl. replace-doc kind, §4.3)
};

// DO → client — tag 101
type AckFrame = { v: 1; type: 'ack'; commandId: string; serverSeq: number };

// DO → client — tag 102 (sender only, never broadcast)
type RejectFrame = { v: 1; type: 'reject'; commandId: string; errors: CommandError[] };

// DO → client — tag 103 (broadcast)
type NoticeFrame = {
  v: 1; type: 'notice'; event: 'room-replaced';
  reason: 'import' | 'load-template' | 'reset'; by: string;
};
```

> Note: `CommandError` reuses the existing engine error shape so `lastErrors` toasts
> render unchanged.

Malformed JSON or unknown tags: the DO drops the frame and logs; it never disconnects
a client over a single bad frame.

## 4. Connection lifecycle

### 4.1 Connect

```
client: wss://<worker>/doc/:id      (?token=… reserved — Phase 1 rooms are open)
DO onStart: load authoritative Y.Doc from DO storage (load hook) BEFORE serving frames
Yjs sync handshake (SyncStep 1/2) → late joiner receives full doc + history
                                   (history lives in the doc, so it syncs for free)
awareness exchange → presence (avatars, cursors, selections) renders
```

### 4.2 Steady state

Yjs binary frames are relayed automatically by the provider library. Command frames
(tag 100) are handled per §5. Nothing else is scheduled while the DO is active.

### 4.3 Whole-doc operations

`importDoc` / `loadTemplate` / `resetDoc` travel as a `CommandFrame` whose command is
the `replace-doc` kind (wraps the adapter's `replaceYDoc`, command-adapter spec §7).
The DO validates the envelope and payload Zod schema, applies `replaceYDoc` with
`origin: 'authoritative'`, and emits a `NoticeFrame` so clients can toast ("Document
replaced by <name>"). The doc swap itself arrives as ordinary Yjs updates.
Phase 1 policy: first-actor-wins, with a client-side confirmation dialog before
sending (HLD §12.4).

### 4.4 Disconnect & hibernation

Client closes → provider removes its awareness state → remote cursors/selections
vanish (~30 s staleness timeout at worst). Zero connections → DO idles and hibernates
(WebSocket hibernation API keeps sockets logically attached); the Y.Doc is already
persisted by the save hook (§8).

## 5. Command processing (DO side)

```
on CommandFrame:
 1. Zod-parse the envelope (v, commandId, command payload)
      malformed → RejectFrame with schema errors
 2. snapshot = projectDoc(authoritative ydoc)            // materialize
 3. validateCommand(snapshot, command)                   // shared module — the trust boundary
 4a. invalid → RejectFrame to SENDER ONLY; authoritative state untouched
 4b. valid   → serverSeq = ++seq
               applyCommandToYDoc(ydoc, command, { origin: 'authoritative', commandId, serverSeq })
               // Yjs broadcasts the diff to ALL connected clients automatically;
               // history entries are written inside the same transaction
               → AckFrame to sender
```

> Note: the broadcast in 4b also reaches the sender, whose replica already holds the
> optimistic apply. The authoritative update then merges as a no-op **only if the
> adapter is perfectly identical at both sites** — this is why command-adapter parity
> (that spec's §1 and test case 1) is load-bearing.

> Note: processing is synchronous and sequential — no awaits between steps 2–4 — so
> receive order is commit order, and every validation runs against the state left by
> the previous command. This is what makes the "valid-but-combination-invalid" case
> (reorder X + concurrent remove X) catchable: the loser fails validation against the
> winner's result.

## 6. Client-side command state machine

```
                 client validate FAIL
  ┌─────────┐ ───────────────────────► rejected-local: lastErrors toast; never applied
  │ created │
  └────┬────┘ validate PASS
       ▼
┌────────────────────┐  send   ┌─────────┐  AckFrame    ┌───────────┐
│ applied-optimistic │ ──────► │ pending │ ───────────► │ committed │ drop from pending
└────────────────────┘         └────┬────┘              └───────────┘
                                    │ RejectFrame
                                    ▼
                            ┌─────────────────┐
                            │ rollback: re-sync│ toast errors; drop ALL pending
                            └─────────────────┘
```

State held in `collab/provider.ts`:

```ts
pending: Map<commandId, { command: EditCommand; sentAt: number }>
queue:   CommandFrame[]   // unsent (offline/disconnected), flushed in order on reconnect
```

Rules:

1. **Solo (no room)**: the client gate is final; commands apply locally; nothing is
   queued or sent.
2. **Online**: send immediately after optimistic apply; user order is preserved.
   Retries reuse the same `commandId` (DO dedupes, §7).
3. **On RejectFrame**: discard `pending` entirely, run re-sync (§6.3), toast the
   errors. Pending commands that were built on top of the rejected one cannot be
   replayed safely — their base state no longer exists. The user redoes them; this is
   acceptable because rejections are rare in practice.
4. **On reconnect**: Yjs delta-sync first, then flush `queue` in order. The DO may now
   reject commands that were valid when written (state moved on) — rule 3 handles it.

### 6.3 Rollback / re-sync procedure

Phase 1 (default): **full re-sync** — re-run the sync handshake against the DO to pull
the authoritative state over the local replica, replay nothing. Simple, always
correct, cheap at Fabriik doc sizes (<200 KB).

Post-Phase-1 alternative: a scoped `Y.UndoManager` with `trackedOrigins` set to the
optimistic origin, undoing exactly the rejected transaction. More elegant, but
subtler under interleaved remote updates; adopt only if re-sync churn becomes visible.

> Note: `editorStore` (selection, viewport, dark mode) is untouched by re-sync — the
> user keeps their place in the canvas; only document state is re-pulled.

## 7. Ordering & guarantees

| Guarantee | Mechanism |
|---|---|
| Total commit order per room | DO single-threaded, sequential processing (§5) |
| Convergence of all replicas | Yjs merge semantics |
| No invalid state ever broadcast | DO gate runs before apply (§5 step 3) |
| Exactly-once command effect | `commandId` dedupe at the DO (bounded in-memory LRU; see Open Q2) |
| History ↔ document consistency | Same transaction (command-adapter spec §6) |
| Ack order = commit order | Sequential processing, no async gaps in §5 |

## 8. DO lifecycle & persistence

| Event | Behavior |
|---|---|
| First request for `/doc/:id` | DO instantiates on demand with an empty Y.Doc; the first client's sync handshake uploads its local doc — solo→shared promotion with zero migration code (HLD D4) |
| Wake from hibernation | `onStart` loads Y.Doc bytes from DO storage before any frame is served |
| Save policy | Debounced ~2 s after last mutation + periodic alarm flush; save = provider save hook / `encodeStateAsUpdate` snapshot into DO storage |
| Hibernation | WebSocket hibernation API (partyserver): connections survive, memory freed, billed per message |
| Doc growth | Trim `history` Y.Array beyond N entries at save time (DLD §5.4); later: R2 snapshots + compaction |

> Note: DO storage is strongly consistent and single-writer (the DO itself) — no extra
> locking. The DO storage copy is the only server-side source of truth; never mirror it
> elsewhere for writes.

## 9. Sequences (abridged)

Happy path:

```
A ──CommandFrame──► DO
                    DO: validate ✓, apply, history += entries
DO ──Yjs diff─────► A, B            (A's optimistic state merges as no-op)
DO ──AckFrame─────► A
```

Invalid command (bypassed client gate):

```
A ──CommandFrame──► DO
                    DO: validate ✗
DO ──RejectFrame──► A               (B never sees anything)
A: re-sync, toast errors
```

Combination-invalid race:

```
A ──reorder(X)──► DO   validate ✓ → apply → Ack(A)
B ──remove(X)───► DO   validate ✗ (X already moved) → Reject(B)
```

## 10. Test scenarios (integration, fake transport)

1. Happy path: A edits → ack → B receives diff; both projections equal.
2. Invalid command bypassing the client gate → sender-only reject; authoritative
   snapshot passes `templateDocSchema` + semantic checks before and after.
3. Disjoint concurrent edits → both acked; replicas converge.
4. Combination-invalid: reorder(X) acked; concurrent remove(X) rejected with the
   structural error.
5. Late joiner: full doc + history via handshake, no extra API.
6. Reconnect: delta-sync applies remote changes made offline; queued local commands
   flush in order.
7. Rejection rollback: sender's optimistic state returns to authoritative; no residue;
   `editorStore` untouched.
8. Whole-doc replace: `NoticeFrame` received; all clients converge on the new doc;
   history cleared.
9. Duplicate `commandId` (retry after timeout): applied exactly once.
10. Hibernation wake: doc reloaded from storage; sync continues without loss.

## 11. Open questions

1. Auth/token format for rooms (HLD §12.1) — `?token=` is reserved but unused.
2. `commandId` dedupe window vs DO restarts: persist recent ids, or accept the tiny
   duplicate risk across a restart?
3. Rate-limiting policy for pathological command floods per connection.
4. Whether structural commands (`remove`, `reorder`) should default to ack-wait before
   applying optimistically (HLD §12.2) — decide during P3 with real latency numbers.
