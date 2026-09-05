# Spec: Multiplayer Collaboration — Detailed Design (DLD)

Status: Draft v1 — for review and iteration
Companion to: `specs/multiplayer-hld.md`

## 1. Y.Doc schema

```
Y.Doc
├── "meta"      Y.Map
│    ├── templateId   : string
│    ├── templateName : string
│    └── rootId       : string
├── "elements"  Y.Map<ElementId, Y.Map>          ← the document itself
│    └── <element> Y.Map
│         ├── id       : string
│         ├── type     : string
│         ├── parentId : string | null
│         ├── childIds : Y.Array<ElementId>      ← positional, reorder-aware
│         ├── content  : Y.Map
│         │    ├── base      : Y.Map<contentKey, value>
│         │    └── overrides : Y.Map<Viewport, Y.Map<contentKey, value>>
│         └── style    : Y.Map
│              ├── base      : Y.Map<StyleProp, value>
│              └── overrides : Y.Map<Viewport, Y.Map<StyleProp, value>>
└── "history"   Y.Array<RevisionEntry-as-JSON>   ← append-only, DO-written
```

Mapping rationale:

| Fabriik construct | Yjs type | Why |
|---|---|---|
| `elements: Record<ElementId, TemplateElement>` | `Y.Map<ElementId, Y.Map>` | Stable element IDs → concurrent edits to *different* elements touch disjoint keys → zero-conflict merges for free |
| `childIds` | `Y.Array` | Positional semantics; reorder/insert merge correctly for concurrent ops on different positions |
| Scoped content/style layers | Nested `Y.Map`s (`style.overrides.mobile.fontSize`) | Conflict isolation per **property per viewport**: two users editing the same element in different viewports, or different properties in the same viewport, never collide; same-key → last-write-wins |
| `templateName` / `rootId` / `templateId` | Plain string fields in `meta` Y.Map | LWW is correct semantics; no Y.Text needed |
| `HistoryLog` (`Record<ElementId, RevisionEntry[]>`) | Single append-only `Y.Array` of immutable JSON entries | Entries are immutable audit records — shared *container*, immutable *contents*; only the DO appends |
| `HeadingContent.text`, `TextContent.text` | **Plain strings in Phase 1** | Whole-string LWW matches the commit-on-blur UX. Deliberate, documented exception: upgrade to `Y.Text` later for char-level co-editing — the only planned field-level type change |

> Note: never store a whole `TemplateElement` as one opaque JSON blob inside a Y.Map —
> that would collapse conflict granularity to the whole element. The nested-Y.Map shape
> is what makes two users editing one element pleasant.

> Note: Yjs shared types cannot be validated by Zod directly. Anything that must pass
> `templateDocSchema` is validated on the **materialized snapshot** (`.toJSON()`), never
> on live Y types.

## 2. Translation layer (the pure core)

Two pure, framework-free modules. Everything else is plumbing around them.

### 2.1 Projection: `projectDoc(ydoc): TemplateDoc`

- Materializes a plain `TemplateDoc` from the Y.Doc via `.toJSON()` + light reshaping.
- Subscribes via `ydoc.on('observeDeep', …)` (or per-top-level-map observers).
- Batches: coalesce bursts into one projection per animation frame (or microtask);
  push the result into the Zustand view cache in one `set()`.
- Full re-materialization per change is fine at Fabriik scale (<200 KB docs, few
  collaborators). No incremental projection in Phase 1.

### 2.2 Command adapter: `applyCommandToYDoc(ydoc, command)`

Converts one validated `EditCommand` into a Y.Doc transaction. Runs in **two places,
same code**: in the DO (authoritative apply) and in the browser (optimistic apply).

| Command kind | Y.Doc mutations |
|---|---|
| `set-content` | Write payload keys into `content.base` or `content.overrides[scope]` |
| `set-style` | Write payload keys into `style.base` or `style.overrides[scope]` |
| `insert` | Create element Y.Map (recursive for subtrees); push id into parent `childIds` Y.Array at index |
| `remove` | Remove id from parent `childIds`; delete element (and subtree) from `elements`; capture removed subtree for restore (mirrors `engine/commit.ts` behavior) |
| `reorder` | Move id within `childIds` Y.Array (delete + insert) |

Each apply is wrapped in `ydoc.transact(() => …)` so one command = one atomic update.

> Note: before/after snapshots for history are taken from materialized views
> (`element.toJSON()` before and after the transaction), keeping `RevisionEntry`
> shape identical to today.

## 3. Store changes

### 3.1 `templateStore` becomes a projection cache

- No longer the source of truth. It holds the latest `projectDoc()` output, `lastErrors`,
  and history for rendering.
- `dispatch(command)` new flow:
  1. Client-side `validateCommand` (UX gate; also the *only* gate in solo mode).
  2. Optimistic `applyCommandToYDoc` on the local Y.Doc.
  3. Send command JSON to the DO (if connected to a room).
  4. On rejection: re-sync from last-known-good authoritative state + set `lastErrors`.

### 3.2 Deleted machinery

- `baseRevision` staleness check in `validateCommand`.
- `dispatchMany` re-stamping (`templateStore.ts:56–72`).
- `RevisionEntry.baseRevision` bookkeeping and `commandIdFor` usage (`engine/commit.ts:24–25`).
- AI staleness block + rebase-on-accept (`reviewStore.ts:39–47`) → replaced by
  re-validation at accept time (DLD §8).
- `doc.revision` as concurrency control. Optional cosmetic DO-assigned sequence number
  on history entries for display ordering only.

### 3.3 `editorStore`

Unchanged, except `selectedIds` changes are mirrored into awareness (DLD §9). Selection
sync is awareness's job — it never enters the document.

### 3.4 Whole-doc operations in a shared room

`replaceDoc` / `importDoc` / `loadTemplate` / `resetDoc`
(`templateStore.ts:95–207`) become **room-scoped operations**: they replace the
authoritative Y.Doc contents through the DO (delete-all + rebuild in one transaction),
broadcast like any other change. Phase 1: first-actor-wins with a confirmation dialog
("This will replace the document for everyone"). Consensus UX is an open question
(HLD §12.4).

## 4. Validation layer placement

- **One shared module** (`engine/validate.ts` and command rules) — already React-free —
  bundled both into the app and into the Worker.
- Client: instant feedback, `lastErrors` toasts (existing UX).
- DO: the **trust boundary**. Validates each command against the current authoritative
  materialized snapshot before apply. A malicious client bypassing the client gate still
  cannot inject invalid state.
- Zod (`templateDocSchema`) applies to command payloads and materialized snapshots,
  never to live Y types (see §1 note).

## 5. Durable Object design

### 5.1 Library choice

| Option | Notes |
|---|---|
| `y-partyserver` (cloudflare/partykit monorepo) | Official Cloudflare path; DO wrapper with WebSocket lifecycle hooks + Yjs load/save hooks; pairs with `partysocket` client (auto-reconnect). **Default choice** |
| `y-durableobjects` (napolab, v2) | Hono-friendly, `getYDoc`/`updateYDoc` RPC, rooms API; good alternative if we adopt Hono routing |

### 5.2 DO responsibilities

1. Hold the authoritative Y.Doc (loaded from DO storage on first message; hibernation-safe).
2. Accept WebSocket connections at `/doc/:id`; relay Yjs sync + awareness frames.
3. Receive command JSON → validate → apply via command adapter → Yjs broadcast happens
   automatically; append history entry.
4. Reject invalid commands to sender only.
5. Persist Y.Doc state via provider save hooks (debounced) into DO storage.

### 5.3 Wire protocol

| Direction | Frame | Content |
|---|---|---|
| client → DO | Yjs sync/awareness binary | Standard y-protocols frames |
| client → DO | `{ type: "command", commandId, command: EditCommand }` | JSON uplink |
| DO → client | Yjs sync/awareness binary | Standard frames (doc diffs) |
| DO → client | `{ type: "ack", commandId }` | Commit confirmation |
| DO → client | `{ type: "reject", commandId, errors: CommandError[] }` | Sender-only rejection |

> Note: the server never translates Yjs binary back into commands. Downlink is binary,
> always. Commands are fire-and-forget proposals; the *doc diff* is the confirmation.

### 5.4 Persistence & growth

- Y.Doc state in DO storage (strongly consistent, survives hibernation).
- History Y.Array is append-only → doc grows monotonically. Phase 1: cap entries per
  element (trim oldest beyond N) at the DO. Later: periodic R2 snapshots + compaction.

## 6. Sync & lifecycle

| Event | Behavior |
|---|---|
| First load (solo) | Y.Doc from `y-indexeddb`; no provider attached; fully offline |
| "Share" clicked | Room created → `/doc/:id` URL; provider attaches; Yjs sync uploads the entire local doc into the fresh empty DO — **no migration code** |
| Join via URL | Provider connects; standard Yjs handshake (SyncStep 1/2) transfers full state |
| Reconnect after drop | `partysocket` auto-reconnect; Yjs delta sync from state vectors; offline edits merge automatically |
| Solo → shared promotion | Same as "Share" — one local-first mode with an optional authoritative peer, not two modes |

## 7. History & restore in multiplayer

- DO appends `RevisionEntry` JSON blobs to the history Y.Array at commit time
  (one validated command = one commit = N entries, as today).
- Entries keep existing shape; `baseRevision` field dropped; optional DO sequence number
  + timestamp for ordering/display.
- Restore flows through the normal command path (`restore` → command → gate), so it is
  validated and broadcast like any edit.

> Note (honest caveat): `before`-snapshots can interleave with concurrent edits from
> other users, so a restore may not reproduce the exact historical visual context. This
> is inherent to multiplayer undo and is accepted; per-user undo stacks are a later
> enhancement (cf. Y.UndoManager patterns).

## 8. AI proposals (`reviewStore`)

- Proposals remain **private local drafts** (never in the doc, never broadcast).
- Generated against the current projection.
- On accept: convert to `EditCommand` and re-validate against current state (replaces
  the old `baseRevision < generatedAt` staleness block at `reviewStore.ts:39–45` and the
  rebase at `:46`). If now-invalid → surface errors, keep the draft.

## 9. Presence (awareness)

### 9.1 State shape

```ts
type FabriikAwarenessState = {
  user: { id: string; name: string; color: string };
  cursor?: { xPct: number; yPct: number };   // DOCUMENT space, % of canvas root
  selectedIds?: ElementId[];
};
```

### 9.2 Rules

- `pointermove` on canvas → throttle ~30/s → `awareness.setLocalStateField('cursor', …)`.
- **Cursor is broadcast in document space (percentages of the canvas root), never screen
  pixels.** Fabriik renders inside device frames (desktop/tablet/mobile differ) and each
  collaborator has a different window; every viewer converts doc-space → own pixels.
  (Figma does the same.)
- `editorStore.selectedIds` changes → `setLocalStateField('selectedIds', …)`; remote
  selections render as element outlines reusing the existing selection ring styling
  (`ElementNode.tsx:91–93`), tinted per user color.
- Toolbar avatar stack from awareness states.
- Stale states auto-expire (~30 s, y-protocols default); states removed on disconnect.
- Optional helper: `y-presence` (`useSelf`/`useUsers` React hooks).

### 9.3 New component

`<CursorsOverlay/>` — absolutely-positioned layer over the canvas frame; one SVG arrow +
name pill per remote user; converts doc-space percentages to local pixels for the active
device frame.

## 10. Persistence migration

- Remove Zustand persist (`fabriik-template-v1`, version 2; `templateStore.ts:209–244`).
- Replace with `y-indexeddb` (Yjs binary, per-doc).
- One-time migration: on first load after upgrade, if `localStorage['fabriik-template-v1']`
  exists, parse it, load it into the Y.Doc, then delete the key.

## 11. New modules

| File | Responsibility |
|---|---|
| `app/src/collab/schema.ts` | Y.Doc shape constants, element Y.Map builders, `projectDoc` |
| `app/src/collab/commandAdapter.ts` | Pure: `applyCommandToYDoc(ydoc, command)` (+ snapshot helpers for history) |
| `app/src/collab/provider.ts` | Room connection lifecycle (partysocket + y-protocols), command uplink, rejection handling |
| `app/src/collab/presence.ts` | Awareness state helpers, throttling, color/name assignment |
| `app/src/components/collab/CursorsOverlay.tsx` | Remote cursor rendering (doc-space → pixels) |
| `app/src/components/collab/RemoteSelection.tsx` | Tinted remote selection rings |
| `app/src/components/collab/AvatarStack.tsx` | Presence avatars in TopBar |
| `worker/src/index.ts` | Worker router: `/doc/:id` WS upgrade → DO |
| `worker/src/docObject.ts` | DO: authoritative Y.Doc, validation gate, history writer, persistence |
| `worker/src/validate/` | Shared validation module (re-exported from `app/src/engine`) |

## 12. Testing strategy

- **Command adapter** (pure): per-kind mutation tests; transaction atomicity.
- **Projection**: schema round-trip — `projectDoc` output must pass `templateDocSchema`
  and equal the original `TemplateDoc` for representative docs.
- **Convergence**: two in-memory Y.Docs exchanging updates through a fake transport,
  applying concurrent commands (different elements; same property; reorder+delete
  combination) → assert identical materialized docs.
- **DO gate**: invalid commands never mutate the authoritative doc; rejection is
  sender-only.
- **Port existing suite**: the 59 engine/validate/export tests remain valid against the
  shared modules; store tests are rewritten around the projection cache.

## 13. Error handling & edge cases

| Case | Handling |
|---|---|
| Command rejected after optimistic apply | Re-sync local Y.Doc from last-known-good authoritative state (re-apply sync handshake), show `lastErrors` toast. No surgical undo |
| Desync suspected (shouldn't happen) | Full re-sync via state-vector handshake; log for diagnostics |
| Malicious client | DO gate rejects; doc never damaged; optional disconnect on repeated violations |
| DO hibernation mid-session | Load hooks rehydrate Y.Doc from storage; clients auto-reconnect and delta-sync |
| Very long-lived docs | History trimming (§5.4); monitor doc size in dev |

## 14. Implementation notes (small print)

- Keep `engine/` 100% React-free — it now also ships to the Worker.
- The command adapter must produce **identical** Y.Doc mutations client-side and
  DO-side; divergence causes phantom rollbacks. Property-order-independent by design
  (Y.Map keys), but write order within a transaction should still mirror
  `engine/commit.ts` for history-snapshot parity.
- Awareness updates are *not* persisted and *not* validated — treat as untrusted UI
  hints; sanitize before rendering (name length, color format).
- Throttle cursor sends hard (≤30/s) — awareness traffic is the main bandwidth cost of
  presence.
- `y-indexeddb` + provider can race on first load: render from the indexeddb doc
  immediately, let the provider reconcile — never block first paint on the network.
