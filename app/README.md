# Fabriik: app package

The React editor package for [Fabriik](../README.md): canvas and code editing, viewport-aware styling, AI proposals, real-time collaboration, and import/export. The product overview, architecture, and security model live in the [root README](../README.md).

## Quick start

**Requires Node.js 24+** (see `.nvmrc`) and npm.

```bash
npm install
npm run dev        # http://localhost:5173
```

No API keys or network calls are required: the default AI demo is deterministic and fully offline, and documents persist to IndexedDB. Real-time sharing needs the worker (`cd ../worker && npm run dev`); the app connects to `ws://localhost:8787` when `VITE_COLLAB_URL` is unset.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm test` | Run the Vitest suite once (`test:watch` for watch mode) |
| `npm run typecheck` | Type-check with `tsc -b` |
| `npm run lint` | oxlint |
| `npm run lint:tailwind` | ESLint with the Tailwind readability rules |
| `npm run format` / `format:check` | Prettier |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |

## Source layout

| Path | Responsibility |
|---|---|
| `src/types/` | The contract: template model, edit commands, viewport, proposals |
| `src/engine/` | Pure, React-free logic: viewport resolution, Zod + semantic validation, URL safety, document diffs → granular commands, template JSON import/export, single-file HTML export |
| `src/engine/ai/` | Proposal engines (deterministic demo, BYOK), prompt + example catalog, parsing/building, provider adapters (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, OpenAI-compatible) |
| `src/store/` | Zustand stores: template projection + room ops + undo/redo + import, editor UI state, AI review queue, AI settings |
| `src/collab/` | Y.Doc schema and projection, command adapter, room provider (commands up / binary down), presence, IndexedDB persistence, wire frames, room id/URL helpers |
| `src/template/` | Built-in templates, registry, fixture integrity suites |
| `src/components/` | `canvas/`, `code/`, `collab/`, `compare/`, `panels/`, `renderer/`, `shell/`, `ui/` |
| `src/lib/` | Vault crypto, key storage/masking, downloads, undo/redo keys, class utilities |

Every change, whether it comes from a canvas interaction, a code edit, or an accepted AI proposal, flows through the same validated `EditCommand` pipeline.

## Templates

Seven built-ins, all expressed through the same typed model:

| Template | Description |
|---|---|
| Editorial Atelier | Warm bento magazine: asymmetric cards, archive list, seasonal subscription |
| Landing Page | Classic product landing page (adapted from Tailwind Toolbox, MIT) |
| Creative Portfolio | Dark personal portfolio with work cards, skills list, contact CTA |
| SaaS Launch | Indigo SaaS landing with capability cards, pricing tiers, testimonial |
| Neighborhood Bistro | Warm restaurant page with story, weekly menu cards, reservation CTA |
| Noir Signal | Brutalist conference site: sharp grid, mono labels, caution yellow |
| Horizon Retreat | Twilight boutique retreat: immersive imagery, coastal cabins |

`src/template/templates.test.ts` validates schema conformance, parent/child symmetry, reachability from the root, and viewport resolution for every registered template.

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `VITE_COLLAB_URL` | WebSocket origin of the collab worker (build-time) | `ws://localhost:8787` |

## Testing

Vitest + Testing Library, with `fake-indexeddb` and jsdom. Suites live next to their modules (`*.test.ts`, `*.test.tsx`); cross-cutting journeys (canvas/code consistency, template lifecycle, room ops, undo/redo, import) live in `src/journey.test.tsx`, `src/templates.journey.test.tsx`, and the store/collab suites. `src/config/vercelCsp.test.ts` asserts the deployed Content-Security-Policy matches the provider allowlist.
