# Fabriik

A browser-based website-builder prototype where a non-technical business owner can edit a responsive landing page through **canvas or code**, target edits to **desktop / tablet / mobile**, run a **deterministic text-driven AI demo** confined to the current selection, and **recover any element independently** — without ever losing unrelated work.

Built with React 19 + TypeScript + Vite, Tailwind CSS v4, Zustand (+persist) & Immer, Zod, CodeMirror, Vitest + Testing Library.

## Quick start

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # 59 focused unit/integration tests
npm run build      # production build
```

Requires Node.js >= 20. No API keys, no network calls (the AI demo is fully deterministic and offline).

## Template source

Four built-in templates ship in `src/template/`, all expressed through the same typed model:

| Template | Origin |
|---|---|
| **Landing Page** | Adapted from the Tailwind Toolbox **“Landing Page” starter** ([github.com/tailwindtoolbox/Landing-Page](https://github.com/tailwindtoolbox/Landing-Page), MIT License): nav → hero → features → testimonial → CTA → footer, converted into typed JSON elements. |
| **Creative Portfolio**, **SaaS Launch**, **Neighborhood Bistro** | Original fixtures authored for this exercise, following the same structural conventions (stable IDs, base + viewport overrides). |

Visual styling in all of them is driven entirely by the model’s style properties — no hardcoded CSS per template. A cross-fixture integrity suite (`src/template/templates.test.ts`) validates schema conformance, parent/child symmetry, reachability from root, resolution at all viewports and the presence of responsive overrides for every registered template.

## Architecture

```
src/
├── types/            # The contract: template model, edit commands, revisions, proposals
├── engine/           # Pure functions, zero React — the safety core
│   ├── resolve.ts        # Viewport resolution: override[vp] ?? base
│   ├── validate.ts       # Zod schemas + semantic checks (IDs, staleness, bounds)
│   ├── commit.ts         # applyCommand via immer → new doc + per-element revisions
│   ├── restore.ts        # Per-element/per-scope recovery as a NEW revision
│   ├── diffCommands.ts   # Whole-document diffs → granular command streams
│   └── ai/               # Deterministic scenario engine (no network, no model)
├── store/
│   ├── templateStore.ts  # Canonical state: Zustand + persist(doc, history, activeTemplateId)
│   ├── editorStore.ts    # Ephemeral UI: selection, viewport, scope
│   └── reviewStore.ts    # Pending AI proposals + accept/reject status machine
├── template/             # Built-in fixtures + registry (index.ts) + integrity tests
└── components/
    ├── canvas/       # ElementNode renderer/wrapper, marquee Canvas
    ├── renderer/     # Leaf views per ElementType (registry pattern)
    ├── panels/       # Layers, Properties, AI Demo, History
    ├── code/         # CodeMirror JSON surface (whole template | selection)
    └── shell/        # TopBar (viewport/scope/reset), EditorShell, error toasts
```

### Where this application owns the hard parts

The assignment allows libraries; everything that makes it *safe* is owned here:

| Concern | Owner | Notes |
|---|---|---|
| Canonical model | `types/template.ts` + `templateStore` | Typed, JSON-serializable, stable element IDs. Libraries never touch state shape. |
| Validation pipeline | `engine/validate.ts` | One gate for canvas, code and AI commands: schema (Zod), known IDs, type/content match, index bounds, root protection, base-revision freshness. |
| Responsive resolution | `engine/resolve.ts` | `resolved(vp) = {...base, ...overrides[vp]}` for both content and style. Scope `all` writes to base; scope `x` writes only to `overrides.x` — so one view can never change by accident, and shared edits still respect existing overrides. |
| History & recovery | `engine/commit.ts` + `restore.ts` | One committed command = one revision per affected element × scope, capturing before/after of exactly the layer(s) touched (including structural info). Restore re-applies `before` through the same scoped-write semantics and records a new `restore` revision. |
| Deterministic AI | `engine/ai/*` | Pure `(instruction, selection, scope, doc) → proposals`. Same input + same state ⇒ byte-identical output (asserted in tests). |

Libraries used: **Zustand** (state + persistence), **Immer** (immutable doc updates), **Zod** (schema validation), **CodeMirror** (code surface), **Tailwind CSS v4** (editor chrome), **Vitest/RTL** (tests).

### The edit-command contract

Every change — canvas click, inline text edit, properties input, code Apply, AI acceptance — becomes an `EditCommand`:

```ts
{ kind, source: 'canvas'|'code'|'ai', targetIds, scope: 'all'|'desktop'|'tablet'|'mobile',
  baseRevision, payload }
```

`dispatch()` validates against the *current* document and rejects anything unknown, out-of-bounds, forbidden, or stale (`baseRevision !== doc.revision`). Accepted multi-element operations produce independent revisions per element, which is what makes partial acceptance and independent recovery possible.

### Commit boundary & trade-off

**Commit boundary:** one validated command = one commit = N revision entries (N = affected elements), each scoped to the operation’s viewport scope.

**Trade-off documented:** revision entries store small before/after *layer snapshots* rather than inverse patches. This makes restore trivially correct (re-apply values, no patch inversion math) at the cost of some redundancy in storage (~KBs; the whole persisted document+history serializes well under 200 KB). A second deliberate trade-off: when the code surface removes a viewport override, the engine writes the resolved base value into that override slot instead of deleting the key — visually identical, keeps the command vocabulary minimal.

### Requirement mapping

| Requirement | Where |
|---|---|
| Responsive template(s), stable IDs | `template/` fixtures + `template/index.ts` registry; integrity suite in `templates.test.ts` |
| Desktop/tablet/mobile previews | `TopBar` radiogroup + `Canvas` device frame widths |
| Click/additive/marquee selection, keyboard operable | `canvas/ElementNode.tsx` (click/Shift/Ctrl, Tab/Enter/Esc), `canvas/Canvas.tsx` (marquee) |
| Manual editing: content/style/order/structure | Inline editor + `PropertiesPanel` + `LayersPanel` reorder/delete |
| Canvas ⇄ code same state | Both dispatch commands; `diffCommands.ts` turns doc-JSON edits into granular commands; consistency asserted in tests |
| Invalid code cannot damage state | `replaceDoc` validates first; failures leave last valid doc intact |
| Scope: All vs single view | Scoped writes in `commit.ts`; isolation tests |
| Deterministic AI inside selection/scope | `engine/ai/scenarioEngine.ts`; containment + determinism tests |
| One-click prompt autofill | `engine/ai/exampleCatalog.ts` (categorized, selection-aware ordering) + gallery in `AiDemoPanel` |
| Proposal review, partial accept/reject | `AiDemoPanel` + `reviewStore`; acceptance re-based safely against current revision, genuinely stale proposals stay blocked |
| Per-element × scope recovery | `HistoryPanel` + `engine/restore.ts`; independence tested |
| Persistence + reset | `templateStore` persist middleware (localStorage, versioned, per-template reset); Reset button |
| Tests (AI scope, canvas-code consistency, view isolation, independent recovery) | `src/engine/ai/*.test.ts`, `src/engine/diffCommands.test.ts`, `src/engine/commit.test.ts`, `src/engine/restore.test.ts`, `src/journey.test.tsx`, `src/templates.journey.test.tsx` |

See also: [`../PRODUCT_NOTES.md`](../PRODUCT_NOTES.md) for product decisions and [`../AI_USAGE.md`](../AI_USAGE.md) for how AI tools were used.
