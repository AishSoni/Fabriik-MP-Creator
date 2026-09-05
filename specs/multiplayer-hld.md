# Spec: Multiplayer Collaboration — High-Level Design (HLD)

Status: Draft v1 — for review and iteration
Scope: `app/` (Fabriik editor) + new `worker/` package (Cloudflare Worker + Durable Objects)

## 1. Purpose

Turn Fabriik from a single-player, localStorage-persisted editor into a real-time
multiplayer editor. Multiplayer is the product direction and the USP of this portfolio
project; Figma is the primary inspiration for the collaboration experience.

## 2. Goals

| # | Goal |
|---|---|
| G1 | Multiple users edit the same template document simultaneously; remote changes visible within ~100 ms |
| G2 | Preserve Fabriik's core guarantee — *"invalid code cannot damage state"* — now enforced against buggy or malicious peers, not just the local user |
| G3 | Local-first single-player: zero infrastructure, zero network latency, offline-capable when alone |
| G4 | Figma-like presence: live cursors, remote selection outlines, avatar stack |
| G5 | Keep the validated command pipeline as the **only** write path for canvas, code panel, and AI edits |

## 3. Non-goals (Phase 1)

- Character-level live text co-editing (Y.Text migration deferred; text fields start as
  whole-string last-write-wins, matching the existing commit-on-blur UX).
- Semantic conflict transformation for concurrent structural ops beyond Yjs' native
  array/map semantics.
- Dedicated multi-device offline-conflict UI (CRDT merge happens automatically).
- Full auth/permission model beyond room-level access (placeholder, see Open Questions).

## 4. Approved architectural decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Hybrid architecture: Yjs CRDT + one Cloudflare Durable Object per document.** Every browser holds a full Y.Doc replica; the DO holds the authoritative copy and acts as single-threaded sequencer ("editor-in-chief") | Pure Yjs (unvalidated client-side merge) guarantees *convergence* but not *correctness* — malformed updates (orphaned elements, `widthPercent: 999`) would merge flawlessly and destroy the validation-gate USP. Pure server-sequencing (no CRDT) forces either +50–200 ms pessimistic latency or hand-rolled OT-style rebasing for structural commands, forecloses offline, and is a local maximum: every future goal (offline, live text, P2P) would require tearing it out. The hybrid gets Figma's UX with Yjs doing the sync heavy lifting |
| D2 | **Commands up, binary down.** Clients send `EditCommand` JSON to the DO; the DO broadcasts Yjs binary updates. The server never re-translates binary into commands | Commands carry intent + stay auditable; Yjs binary gives free late-joiner full sync, reconnect deltas, and deterministic merging. Keeping the two channels separate means the existing command/validation/history machinery survives almost intact |
| D3 | **DO-gated validation.** The DO runs the existing `validateCommand` rules against the authoritative doc *before* applying. Invalid commands are rejected to the sender only; all other clients only ever receive valid state | This is what makes the gate a real multi-user **trust boundary** instead of a client-side courtesy. One shared validation module runs both client-side (UX) and DO-side (authority) |
| D4 | **Local-first single-player.** Solo documents live entirely in the browser (Y.Doc + `y-indexeddb`); no DO is created. Collaboration is **user-initiated** ("Share" creates a room), never auto-detected by player count | Auto-detection is chicken-and-egg: a joiner needs the room URL before they can be counted. Explicit sharing is also the Figma-like UX. DOs instantiate on demand and hibernate when idle, so cost is not the driver — offline-first architecture is. Solo→shared promotion needs **no migration code**: the Yjs sync protocol uploads the local doc into the fresh empty DO on first connect |
| D5 | **Presence via Yjs awareness** (live cursors, remote selection, avatars) | Awareness is an ephemeral broadcast channel beside the doc, relayed by every Yjs provider over the same WebSocket, auto-expiring on disconnect (~30 s). It is never stored in the document — exactly the right semantics for presence |
| D6 | **`doc.revision` / `baseRevision` staleness machinery is deleted.** Merging replaces rejection as the outcome of concurrent edits | In a CRDT world "stale" stops existing: concurrent valid edits merge. The four subsystems keyed on revision (staleness check in `validateCommand`, `RevisionEntry.baseRevision`/`commandIdFor` in `engine/commit.ts`, the AI staleness block and rebase-on-accept in `store/reviewStore.ts`, `dispatchMany` re-stamping in `store/templateStore.ts`) are removed or reworked (see DLD §3) |

> Note: Figma itself is centralized server-sequenced, not CRDT-based. The hybrid
> deliberately reproduces Figma's *UX* while letting Yjs do the sync work — a defensible
> and well-understood portfolio narrative: "a CRDT for convergence, a command pipeline
> for correctness, and a pure translation layer between them."

## 5. System architecture

```
 Browser A                        Cloudflare                         Browser B
┌─────────────────────┐        ┌──────────────────────────┐        ┌─────────────────────┐
│ Y.Doc (replica)     │◄──────►│  Worker: routes          │◄──────►│ Y.Doc (replica)     │
│  ├─ projection ──► Zustand   │  /doc/:id WS upgrades    │        │  ├─ projection ──► Zustand
│  ├─ commandAdapter  │  WSS   │        │                 │  WSS   │  ├─ commandAdapter  │
│  └─ awareness       │◄──────►│        ▼                 │◄──────►│  └─ awareness       │
│ y-indexeddb (cache) │        │  Durable Object (1/doc)  │        │ y-indexeddb (cache) │
└─────────────────────┘        │  ├─ authoritative Y.Doc  │        └─────────────────────┘
                               │  ├─ validateCommand gate │
                               │  ├─ history writer       │
                               │  └─ DO storage persist   │
                               └──────────────────────────┘
```

Roles:

- **Browser replica** — full Y.Doc; projection layer materializes it into the existing
  React/Zustand read path; command adapter turns validated `EditCommand`s into Y.Doc
  transactions (optimistic local apply); awareness carries presence.
- **Durable Object (one per document)** — authoritative Y.Doc; the only place where
  commands become *committed* state; appends history; owns persistence; WebSocket hub.
- **Worker** — thin router mapping `/doc/:id` WebSocket upgrades to the DO instance.

## 6. Edit lifecycle

1. User edits → UI constructs an `EditCommand` (unchanged from today).
2. **Optimistic apply**: command adapter mutates the local Y.Doc → UI updates instantly.
3. Command JSON is sent to the DO over the WebSocket (uplink).
4. DO validates against the authoritative doc using the shared validation module.
5. **Valid** → applied to the authoritative Y.Doc in one transaction → Yjs emits a
   compact binary diff → broadcast to **all** clients → DO appends the history entry.
   **Invalid** → rejection message to the **sender only** → sender rolls back to the
   last-known-good authoritative state → existing `lastErrors` error toast.
6. Remote browsers merge the binary update automatically; React projection re-renders.

> Note: the DO is single-threaded, so it never observes a conflict. CRDT merging happens
> **in browsers**, when an optimistic local edit and an inbound authoritative update
> cross in flight. The DO's job is gating, not merging.

## 7. Conflict semantics

| Situation | Outcome |
|---|---|
| Edits to different elements / properties / viewport scopes | Merge automatically (disjoint Y.Map keys) |
| Same property, same scope | Last-write-wins per key (Figma property-panel behavior) |
| `childIds` concurrency | Y.Array positional merge |
| Two valid commands whose *combination* is invalid (e.g., reorder X into a container + concurrent delete of X) | Caught: DO validates each command against current authoritative state; the loser is rejected to its sender |
| Any malformed/invalid command | Never enters any doc; sender-only rejection |

## 8. Impact on existing modules (summary — detail in DLD)

| Module | Change class |
|---|---|
| `engine/commit.ts`, `engine/restore.ts` | Repurposed: logic moves behind the command adapter; run in DO (authoritative) and client (optimistic) |
| `engine/validate.ts` | Unchanged code, new deployment target (shared client + DO); becomes the trust boundary |
| `store/templateStore.ts` | Rewritten as a **projection/view cache** of the Y.Doc; revision machinery deleted |
| `store/editorStore.ts` | Unchanged (per-user UI state); selection gains an awareness broadcast hook |
| `store/reviewStore.ts` | Local-only until accept; staleness block replaced by re-validation on accept |
| `engine/resolve.ts`, `engine/exportHtml.ts`, code panel | Unchanged — consume the projected `TemplateDoc` |
| Canvas / `ElementNode.tsx` | Unchanged rendering; gains remote-selection rings + cursor overlay |
| Persistence | Zustand persist (`fabriik-template-v1`) replaced by `y-indexeddb` |

## 9. Deployment topology

- Frontend stays on Vercel (existing `app/.vercel/`); Worker + DOs on Cloudflare.
  Cross-origin WSS is fine.
- Optional later consolidation onto Cloudflare Pages to collapse origins (not required).

## 10. Phased roadmap

| Phase | Deliverable | Exit criteria |
|---|---|---|
| P1 | Rooms & identity: `/doc/:id` URLs, DO-per-document skeleton (`y-partyserver` or `y-durableobjects`) | Two browser tabs connect to one DO and exchange a raw Yjs update |
| P2 | Y.Doc schema + React projection (replaces Zustand doc as source of truth) | Existing canvas/code-panel/export features work unchanged off the projection; test suite green |
| P3 | Hybrid core: commands → DO validation → authoritative apply → broadcast; rejection + rollback | Two clients editing concurrently converge; invalid commands rejected sender-only |
| P4 | Presence: avatar stack + remote selection rings | Selections of remote users visible, tinted per user |
| P5 | Live cursors overlay | Document-space cursors render correctly across different device-frame viewports |
| P6 | History & restore on the DO | Shared history visible to all; restore round-trips through the command gate |
| P7 | Polish: `y-indexeddb` offline hardening; optional Y.Text live text | Offline edits survive reload and merge on reconnect |

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Optimistic apply + rejection leaves client dirty | Roll back by re-syncing from last-known-good authoritative state (not surgical undo); DLD §13 |
| Two mechanisms (CRDT merge + command gate) raise conceptual load | Strict boundary rule: *Yjs owns what the document IS; JSON owns everything said ABOUT the document.* One translation layer, pure and unit-tested |
| Whole-doc ops (`importDoc`, `loadTemplate`, `resetDoc`) disrupt peers | Redefined as room-scoped operations with confirmation UX; DLD §3.4 |
| Doc growth from history Y.Array | Compaction policy + optional R2 snapshots; DLD §5.4 |
| Malicious client bypassing the client-side gate | DO-side validation is the trust boundary; client gate is UX only |

## 12. Open questions

1. Room auth & sharing permissions (invite links vs accounts) — Phase 1 placeholder.
2. Per-command-kind optimistic vs ack-wait policy defaults (style/text → optimistic;
   structural remove/reorder may wait ~50–150 ms for DO ack) — decide in P3.
3. History compaction cadence and snapshot strategy.
4. Whether `importDoc`/`loadTemplate` in a shared room require consensus or are
   first-actor-wins with notification.
