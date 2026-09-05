# Spec: Multiplayer — Command Adapter (EditCommand → Y.Doc Transactions)

Status: Draft v1 — for review and iteration
Scope: `app/src/collab/commandAdapter.ts`; bundled identically into `worker/` (runs both
client-side and inside the DO)
Companion to: `specs/multiplayer-hld.md`, `specs/multiplayer-dld.md` (§2.2)

## 1. Purpose

The pure translation layer between Fabriik's `EditCommand`s and Y.Doc mutations — the
only place where "JSON said something about the document" becomes "the document IS
something" (HLD boundary rule). One codebase, two execution sites:

- **Browser** — optimistic apply, before the DO verdict.
- **DO** — authoritative apply, after validation passes.

Identical input must produce identical mutations at both sites. Any divergence makes
the authoritative update land differently from the optimistic one, causing visible
jumps or phantom rollbacks.

## 2. Design decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | One pure function `applyCommandToYDoc(ydoc, command, opts)`; no I/O, no React, no network | Must bundle into the Worker; must be unit-testable without a WebSocket |
| 2 | Every command applies inside a single `ydoc.transact(…)` | One command = one atomic Yjs update = one broadcast diff = one history commit |
| 3 | Adapter assumes the command is **already validated**; it performs no rule checks | Validation is the gate's job (client UX / DO trust boundary). Duplicating rules here creates drift between two validation sources |
| 4 | Before/after snapshots via `element.toJSON()` inside the transaction | `RevisionEntry` keeps today's exact shape; Zod can only check materialized JSON, never live Y types |
| 5 | Text fields stay plain-string writes in Phase 1 | Whole-string LWW matches the commit-on-blur UX (`ElementNode.tsx:76–89`). Y.Text upgrade remains the only planned field-level type change |
| 6 | Rollback is **not** the adapter's job | Provider owns rollback via re-sync (DO protocol spec §6). The adapter never undoes |
| 7 | History is written only by `origin: 'authoritative'` applies | Optimistic applies would double-write entries when the ack lands |

## 3. Contract

```ts
type AdapterOrigin = 'optimistic' | 'authoritative';

type ApplyResult = {
  entries: RevisionEntry[];       // one per affected element; exact engine/commit.ts shape
  changedElementIds: ElementId[];
};

function applyCommandToYDoc(
  ydoc: Y.Doc,
  command: EditCommand,
  opts: { origin: AdapterOrigin; commandId: string; serverSeq?: number; now?: () => number }
): ApplyResult
```

Preconditions (guaranteed by the caller, never re-checked here):

- `command` passed `validateCommand` against the current materialized state of `ydoc`.
- `ydoc` is the same replica the command was validated against (client: local replica;
  DO: authoritative doc).

Postconditions:

- Y.Doc mutated per §5; `entries` describe exactly those mutations.
- No intermediate state observable outside the transaction.
- If `origin === 'authoritative'`: entries appended to the `history` Y.Array inside the
  same transaction.

## 4. Write targets (Y.Doc paths)

Recap of DLD §1, stated as paths the adapter touches:

- `elements` Y.Map → element Y.Maps keyed by ElementId.
- Element Y.Map: `id` / `type` / `parentId` plain fields; `childIds` Y.Array;
  `content` / `style` as nested Y.Maps (`base`, `overrides.<viewport>`).
- `meta` Y.Map for `templateName` / `rootId` / `templateId` (only via replace-doc, §7).
- `history` Y.Array — authoritative origin only (Decision 7).

## 5. Per-kind mutation spec

Common preamble for all kinds:

1. Resolve each target element Y.Map via `elements.get(targetId)`.
2. Capture `before` snapshot (`toJSON()` of every affected element).
3. Run all mutations inside one `transact(() => …, originTag)` so observers fire once
   and the provider broadcasts one diff.
4. Capture `after` snapshots; build `entries` (see §6).

Loop over `targetIds` — Fabriik commands may address multiple elements (e.g. a style
change applied to a selection); one transaction covers the whole command.

### 5.1 `set-content`

```
for each targetId:
  layer = scope === 'all'
    ? element.content.base
    : element.content.overrides.get(scope)     // create the Y.Map if absent
  for each [key, value] in payload: layer.set(key, value)
```

> Note: `scope: 'all'` writes `base` only; overrides are untouched — exact parity with
> `engine/commit.ts`. Key *deletion* is not expressible in Phase 1 (parity with the
> current engine); revisit if scoped override clearing becomes a feature.

### 5.2 `set-style`

Identical shape to §5.1, targeting `style.base` / `style.overrides[scope]`.

> Note: `style.overrides.mobile.fontSize` and `style.base.fontSize` are disjoint Y.Map
> key paths — two users editing the same element in different scopes never collide.
> Same key + same scope → last-write-wins, decided by Yjs, no code needed.

### 5.3 `insert`

Payload carries the new element (or subtree) definition, target parent, and index.

```
1. Build the new element Y.Map(s) recursively BEFORE insertion:
   set id/type/parentId, create childIds Y.Array, populate content/style nested maps
2. elements.set(newId, elementMap) for every new element
3. parent.childIds.insert(index, [newId])
4. Snapshots: before = parent element; after = parent element + each new element
5. entries flagged structural: true
```

> Note: building the full subtree before any `elements.set` means no observer — even a
> future one reading mid-transaction — can ever see "element exists but is empty".

### 5.4 `remove`

```
1. Capture removedSubtree: toJSON() of target + all descendants (BEFORE any deletion)
2. parent.childIds: delete the index of targetId
3. elements.delete(id) for target + all descendants (depth-first)
4. entries flagged structural: true, carrying removedSubtree
```

> Note: mirroring `engine/commit.ts` exactly here means `engine/restore.ts` keeps
> working unchanged — restore re-inserts the captured subtree via an `insert` command
> through the normal gate. Restore is never a special path.

### 5.5 `reorder`

```
1. Same parent:   fromIndex = childIds.indexOf(targetId)
                  childIds.delete(fromIndex, 1); childIds.insert(toIndex, [targetId])
2. Cross-parent:  delete from source parent's childIds; insert into destination's;
                  set element.parentId = destinationId
3. entries flagged structural: true
```

> Note: concurrent reorders of *different* items merge positionally via Y.Array. Two
> valid concurrent moves of the *same* item resolve per Y.Array semantics (the item
> settles where both ops land it). The DO gate catches invalid *combinations*
> (reorder X + concurrent remove X — the loser is rejected); pure positional races are
> accepted in Phase 1. If they ever bite, add the §9 invariant sweep as a repair pass.

## 6. History entries

- Shape: today's `RevisionEntry` minus `baseRevision` (DLD §3.2), plus optional
  `serverSeq` (DO-assigned, cosmetic display ordering only).
- `commandId` comes from `opts.commandId` (client-generated, carried in the envelope —
  DO protocol spec §3), preserving the command ↔ entries correlation from today.
- One validated command = one commit = N entries (one per affected element) — unchanged.
- Appended to the `history` Y.Array inside the same transaction as the doc mutation,
  so history and document state can never disagree, even across hibernation.

## 7. Whole-doc replacement

For `importDoc` / `loadTemplate` / `resetDoc` (HLD §12.4, DLD §3.4):

```ts
function replaceYDoc(ydoc: Y.Doc, newDoc: TemplateDoc, opts): ApplyResult
// one transaction:
//   elements: delete every key, rebuild from newDoc
//   meta:     rewrite all fields
//   history:  clear (import/reset semantics, per json-import-and-html-export spec §2.1)
```

Peers receive it as ordinary Yjs deletions/insertions — one atomic swap, no special
client code beyond the `notice` toast (DO protocol spec §4.3).

## 8. Parity table with engine/commit.ts

| Behavior today | Adapter equivalent |
|---|---|
| `draft.revision += 1` | Removed (HLD D6) |
| Scoped write `base` vs `overrides[scope]` | §5.1 / §5.2 nested-map selection |
| Before/after `RevisionEntry` capture | §4 preamble + §6 (`toJSON()` snapshots) |
| `remove` captures `removedSubtree` | §5.4 |
| `dispatchMany` sequential re-stamping | Deleted — commands apply independently (DLD §3.2) |

During migration keep `engine/commit.ts` alive behind a feature flag for the legacy
store; delete once P3 exit criteria (HLD §10) are met.

## 9. Invariants (assert in dev; sweep in tests)

1. Every id inside any `childIds` exists in `elements`.
2. `parentId` ↔ `childIds` symmetry, both directions.
3. No cycles; everything reachable from `meta.rootId`.
4. Content shape matches element type.
5. No duplicate ids inside any `childIds` array.

These are exactly the `validateTemplateSemantics` checks from
`specs/json-import-and-html-export.md` §4 — reuse that function as a post-merge sweep
on `observeDeep` (debounced; report-only in Phase 1, repair pass later if needed).

## 10. Test cases

Pure unit tests (in-memory Y.Docs, no network):

1. **Parity oracle** — for each kind: apply to a Y.Doc → `projectDoc()` equals the
   result of applying the same command via legacy `engine/commit.ts` to the same
   starting doc. (Keeps the migration honest.)
2. **Atomicity** — deep observers fire exactly once per command.
3. **History gating** — entries appended only when `origin: 'authoritative'`.
4. **Convergence** — two docs apply the same command set in different orders →
   identical materialized docs.
5. **Disjoint merge** — concurrent edits to different elements / properties / scopes
   all survive.
6. **Same-key LWW** — concurrent writes to one key converge; result still passes §9.
7. **Race combo** — reorder(X) on doc A + remove(X) on doc B, updates exchanged both
   ways → no crash, §9 invariants hold (the *invalid* combination is prevented by the
   DO gate; this test pins the CRDT floor beneath it).
8. **Replace** — after `replaceYDoc`, peers converge to the replaced doc in one
   observer tick; history cleared.

## 11. Non-responsibilities

Validation (`engine/validate.ts`), networking and rollback (`collab/provider.ts` +
DO), persistence (`y-indexeddb`, DO storage), presence (awareness). The adapter is a
pure state transition — that purity is what lets one implementation serve both the
optimistic client and the authoritative server.
