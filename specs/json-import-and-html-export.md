# Spec: JSON Template Import/Export & Single-File HTML Export

Status: Approved — ready for implementation
Scope: `app/` (Fabriik — lightweight browser-based website editor)

## 1. Purpose

Add two related I/O capabilities to the editor:

1. **JSON template import/export** — users can save the current template document as a
   `.json` template file and re-open it later (or share it), with full validation.
2. **Single-file HTML export** — users can export the current page as one self-contained
   `.html` file with inline CSS and (when needed) JavaScript, suitable for a lightweight
   editor that produces deployable output.

### Dependency policy for HTML export

The "no external dependencies" goal targets **heavy JS/CSS libraries**, not all network
references:

- **Allowed**: the Tailwind Play CDN (`https://cdn.tailwindcss.com`) and image `src` URLs.
  Hand-rolling CSS equivalents of Tailwind utilities is an anti-pattern and is out of scope.
- **Disallowed**: any other `<link>` or `<script src>` reference.
- The export HTML UI includes a tooltip advising users that hosted **image URLs are
  preferred**, so they do not have to manage image files locally alongside the exported file.

## 2. Approved design decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Import applies as **full replacement**: swap doc, reset history (mirrors `loadTemplate`) | Cleanest semantics for "opening a template file"; consistent with template switching |
| 2 | Exported JSON uses a **versioned envelope** `{ format, version, exportedAt, doc }`; import also accepts a bare `TemplateDoc` | Forward compatibility + self-identifying files; bare-doc fallback round-trips CodePanel JSON |
| 3 | UI = **dropdown attached to the "Fabriik" brand text** in the TopBar containing *Import JSON…*, *Export JSON*, *Export HTML* | Keeps the crowded TopBar tidy; groups file actions |
| 4 | HTML export uses the **Tailwind Play CDN**; markup reuses the exact utility classes from `leafViews.tsx` | Avoids hand-rolled CSS; structural parity with canvas for free |
| 5 | Per-element **data-driven styles** (model `StyleProps`) go in a generated inline `<style>` block | Arbitrary user values (e.g. `fontSize: 37px`) cannot be utility classes; this is page data, not hand-rolled CSS |
| 6 | Import shows an **unconditional save-first prompt** before the file picker | Change detection is unreliable for imported docs (no registered base to diff against) |
| 7 | Media-query strategy: **full resolved styles per viewport** inside `max-width` blocks | Engine resolution is per-viewport, not stacked (`{...base, ...overrides[vp]}`); naive media cascades would deviate |

## 3. Current-state references

- Document model: `app/src/types/template.ts` (`TemplateDoc`, `TemplateElement`, scoped
  content/style with viewport overrides).
- Whole-doc schema gate: `templateDocSchema` in `app/src/engine/validate.ts` (Zod, strict).
- Full-replacement precedent: `loadTemplate` in `app/src/store/templateStore.ts`.
- Viewport resolution: `resolveElement` / `resolveTree` in `app/src/engine/resolve.ts` —
  `resolved(vp) = {...base, ...overrides[vp]}`; viewports desktop (1440), tablet (768), mobile (375).
- Canvas leaf views whose classes the export must mirror: `app/src/components/renderer/leafViews.tsx`.
- Toasts: `editorStore.setToastMessage`; validation failures surface via `lastErrors` → `ErrorToasts`.

## 4. New modules

| File | Responsibility |
|---|---|
| `app/src/engine/exportTemplate.ts` | Pure: `exportTemplateJson(doc: TemplateDoc, now?: Date): string` → pretty-printed (2-space) envelope JSON; `parseTemplateJson(text: string): { ok: true; doc: TemplateDoc } \| { ok: false; errors: CommandError[] }` — handles `JSON.parse` failures, envelope-or-bare detection, envelope format/version checks |
| `app/src/engine/styleToCssText.ts` | Pure: `styleToCssText(style: StyleProps): string` — raw CSS declaration text (parallel to `styleToCss.ts`; engine stays React-free) |
| `app/src/engine/exportHtml.ts` | Pure: `exportHtml(doc: TemplateDoc): string` — deterministic, byte-identical for identical docs; full document assembly (§6) |
| `app/src/lib/download.ts` | Browser-only: `downloadFile(filename: string, mime: string, contents: string): void` — Blob + object URL + anchor click + revoke; isolated so tests can mock `URL.createObjectURL` |
| `app/src/components/shell/FileMenu.tsx` | Fabriik brand dropdown: trigger styled as the brand text, `aria-haspopup`/`aria-expanded`, Enter/Space/Esc keyboard support, `role="menu"`/`menuitem` items, hidden `<input type="file" accept=".json,application/json">` |

### Store changes

New action in `app/src/store/templateStore.ts`:

```ts
importDoc: (doc: unknown) => CommandError[] | null
```

Pipeline:
1. Zod `templateDocSchema` parse → schema gate.
2. **New** `validateTemplateSemantics(doc): CommandError[]` in `app/src/engine/validate.ts`:
   - `rootId` exists in `elements`
   - parent/child symmetry (`parentId` ↔ `childIds` agree, both directions)
   - no cycles
   - every element reachable from `rootId`
   - content shape matches element type
   *(This closes a real gap: the Zod schema alone does not catch dangling `childIds`.)*
3. On success: `set({ doc, history: {}, activeTemplateId: doc.templateId, lastErrors: [] })`
   — persist middleware saves automatically.
4. On any failure: **state untouched**, errors set into `lastErrors` and returned.

## 5. Feature 1 — JSON template import/export

### Export flow

1. File menu → *Export JSON*.
2. `exportTemplateJson(useTemplateStore.doc)` → envelope:
   ```json
   { "format": "fabriik-template", "version": 1, "exportedAt": "<ISO>", "doc": { ...TemplateDoc } }
   ```
   `exportedAt` comes from the injectable clock (keeps determinism testable).
3. `downloadFile(\`${slug(templateName)}.json\`, 'application/json', …)` — slug:
   lowercase, non-alphanumerics → `-`, trimmed dashes (e.g. "Landing Page" → `landing-page.json`).
4. Success toast.

### Import flow

1. File menu → *Import JSON…*.
2. **Save-first prompt** (unconditional, native `window.confirm`):
   *"Importing will replace your current template and its history. Export your current work as JSON first?"*
   - OK → run the Export JSON flow, then open the file picker.
   - Cancel → open the file picker directly (user can still abort there).
3. File read → `parseTemplateJson` → `importDoc` validation pipeline (§4).
4. Second confirm at apply time (after validation succeeds):
   *"Import '<templateName>'? Your current edits and revision history will be discarded."*
   (matches template-switch wording).
5. Apply → success toast; failures → `ErrorToasts`.

### Imported-template edge cases

- `activeTemplateId` will not match the registry. TopBar's template `<select>` renders a
  synthetic option `"{templateName} (imported)"` when the id is not registered.
- `resetDoc` already falls back (`getTemplateById(activeTemplateId) ?? FALLBACK_TEMPLATE_ID`),
  so Reset on an imported doc returns to the Landing fallback — documented behavior.
- Compare view already falls back gracefully (`getTemplateById(...)?.create() ?? doc`).

## 6. Feature 2 — Single-file HTML export

### Document structure

```
<!doctype html>
<html lang="en">
  <head>
    <meta charset>, <meta viewport>
    <title>  ← templateName
    <script src="https://cdn.tailwindcss.com"></script>   <!-- Tailwind Play CDN -->
    <style>  <!-- neat, comment-separated blocks: /* Element styles */ /* Tablet */ /* Mobile */ -->
  </head>
  <body>
    <!-- element tree from doc.rootId, childIds order -->
    <!-- <script> block only if needed; v1: omitted, assembler keeps a scripts slot -->
  </body>
</html>
```

### Element mapping (mirrors `leafViews.tsx` + `ElementNode.tsx`)

| Type | HTML | Utility classes (from leafViews) |
|---|---|---|
| section | `<div>` | — |
| nav | `<nav>` wrapper + inner flex | `flex items-center justify-between gap-4`; brand `text-lg font-bold`; links `flex min-w-0 flex-wrap items-center justify-end gap-4 overflow-hidden`; link `opacity-90 hover:opacity-100` |
| heading | `<h2>` | — |
| text | `<p>` | — |
| button | `<div>` flex wrapper + `<a>` | wrapper `justify-content` per `textAlign` (mirrors `centerAlign`); anchor `inline-block cursor-pointer no-underline` |
| image | `<img>` (+ `alt`) | Tailwind preflight handles `display:block; max-width:100%` |
| list | `<ul>` / `<li>` per item | — |

### CSS strategy

- Base rule per element uses **desktop-resolved** styles (`resolveElement(el, 'desktop')`),
  emitted as class `fx-{sanitized-id}` plus semantic `fx-{type}`; deterministic dedupe pass
  for sanitization collisions.
- Tailwind CDN injects preflight (reset) — no hand-written base CSS.
- **Fidelity-correct media queries** (decision #7):
  - `@media (max-width: 1023px)` → **full tablet-resolved** styles
  - `@media (max-width: 767px)` → **full mobile-resolved** styles, emitted **after** the
    tablet block so it wins on overlap
  - Elements without overrides get no media block.

### Security

- HTML-escape all text and attributes.
- `href` sanitizer rejects `javascript:` URLs; allows `http(s):`, `mailto:`, `tel:`,
  relative URLs, `#`.
- Style values are schema-constrained (numbers / hex colors / `textAlign` enum) and flow
  through one formatter (`styleToCssText`).

### Known limitations (documented, not blockers)

- Per-viewport **content** overrides are exported as base content only (no built-in template
  uses content overrides today).
- The Play CDN is Tailwind's dev-oriented runtime (~100 KB, generates CSS on load) — accepted
  trade-off for a lightweight editor prototype (approved decision #4).

## 7. UI integration

- `TopBar.tsx`: replace the `<span>Fabriik</span>` brand with `<FileMenu />`.
- Menu items: *Import JSON…*, *Export JSON*, *Export HTML*.
- *Export HTML* item carries the tooltip (native `title`):
  hosted **image URLs are preferred** so you don't have to manage image files locally.

## 8. Tests (Vitest, colocated, existing conventions)

- `app/src/engine/exportTemplate.test.ts`
  - envelope shape; version; injected-clock determinism
  - `parseTemplateJson`: accepts envelope; accepts bare doc; rejects malformed JSON,
    schema-invalid docs, semantic violations (broken `childIds`, missing root)
- `app/src/engine/exportHtml.test.ts`
  - byte-determinism; escaping; `javascript:` href blocked
  - dependency policy: exactly one allowed `<script src>` (Tailwind CDN); no `<link>`
  - viewport override placement in correct media blocks; no media block without overrides
  - element mapping (section/nav/heading/text/button/image/list)
  - golden snapshot of the default template
- Store test
  - `importDoc` success: doc replaced, history reset, persisted
  - failure paths leave doc untouched
- `FileMenu` component test
  - open/close + keyboard; mocked downloads; import via jsdom `File`; save-first prompt;
    apply confirm; toasts; error path
- Journey addition
  - export → capture blob → import → doc round-trips equal

## 9. Execution order

1. Engine: `styleToCssText` + `validateTemplateSemantics` + `exportTemplate` + tests
2. Engine: `exportHtml` + tests
3. Store: `importDoc` + tests
4. UI: `lib/download.ts`, `FileMenu.tsx`, TopBar integration (brand → menu, synthetic
   imported option) + tests
5. Docs: README (architecture map + requirement mapping) — include dependency policy,
   image-URL guidance, imported-template behavior
6. Verification: `npm test`, `npm run build` (includes tsc)

## 10. Code hygiene follow-up — Tailwind class readability (PS)

> PS: ugly `className="..."` strings in TSX were cleaned up as a separate hygiene pass
> (no spec change). See commits `refactor(tailwind): phase 1b/1c/2/3`.

**Problem:** long single-line `className="flex ... bg-[#141416] text-[#9A9996] ..."` with
arbitrary hex (`bg-[#141416]`, `text-[#9A9996]`, `border-[#0E0E10]/[0.06]`) and repeated
`darkMode ? '...' : '...'` ternaries — hard to read, not token-driven.

**Approach (mirrors community consensus — `cn` + `cva` + tokens + formatting):**

1. **Tokens, not hex** — add semantic `@theme` tokens in `app/src/index.css` (`--color-surface-dark`,
   `--color-muted`, `--color-muted-dark`, `--color-muted-strong`, `--color-ink` etc) and
   replace arbitrary `bg-[#...]` / `text-[#...]` with `bg-surface-dark`, `text-muted`, `border-ink/6` etc.
   Stays within the warm stone / ink / paper / accent palette.

2. **`cn` helper** — `app/src/lib/cn.ts` = `clsx` + `tailwind-merge` (shadcn pattern).
   Conditional `darkMode` branches now go through `cn("base", darkMode ? "dark" : "light")`
   instead of template-literal ternaries, so Tailwind merge deduplicates correctly.

3. **`cva` variants** — `app/src/lib/variants.ts` (`pillTriggerVariants`, `editorTabVariants`,
   `viewportPillVariants`, `historyBadgeVariants`, `cardVariants`, `inputVariants`, `buttonVariants`)
   + primitives `app/src/components/ui/{button,card,input,badge}.tsx`.
   Repeated pill/tab/badge/input patterns collapsed to `cva` — props `active` / `dark` / `shape`
   replace 80+ char ternaries.

4. **Multiline formatting** — long `cn(...)` and `className={`...`}` calls are wrapped:
   ```tsx
   // before
   className={`flex flex-col gap-5 p-4 text-sm animate-in ${darkMode ? 'text-stone' : 'text-ink'}`}
   // after
   className={cn(
     "flex flex-col gap-5 p-4 text-sm animate-in",
     darkMode ? "text-stone" : "text-ink",
   )}
   ```
   Each Tailwind arg on its own line, ternary on its own line — `printWidth` 80 friendly.
   `PropertiesPanel` (20 sites) and `HistoryPanel` fully use multiline `cn`; other shells
   (`Dropdown`, `EditorShell`, `TopBar`, `Canvas`, `FileMenu`) already use `cn` + tokens.

5. **Tooling** — `prettier-plugin-tailwindcss` (via `.prettierrc.json`, `tailwindFunctions: ["cn","cva","clsx"]`)
   auto-sorts classes; `eslint-plugin-readable-tailwind` (`eslint.config.js`) lints:
   `readable-tailwind/multiline`, `sort-classes`, `no-unnecessary-whitespace`.
   `oxlint` stays primary (`npm run lint`); Tailwind readability is opt-in via
   `npm run lint:tailwind` / `npm run format`. No `@apply` — community advises
   extracting components/variants instead (keeps utilities grep-able).

**Files touched:** `app/src/index.css`, `app/src/lib/{cn,variants}.ts`, `app/src/components/ui/*`,
`app/src/components/{shell,panel,canvas,code,compare}/*` (token + cn + cva migration +
multiline wrapping), `app/.prettierrc.json`, `app/.prettierignore`, `app/eslint.config.js`.

**Verification:** `npm run typecheck` and `npm run build` pass; `npm run lint:tailwind`
and `npm run format:check` enforce going forward. No visual change — purely readability/tokens.
