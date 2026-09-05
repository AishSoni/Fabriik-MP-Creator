# Spec: AI BYOK (Bring Your Own Key) — Providers & Key Security

Status: Approved — ready for implementation
Scope: `app/` (Fabriik — lightweight browser-based website editor)

## 1. Purpose

Give users two ways to use the AI editing feature:

1. **Free demo mode** (existing) — the deterministic in-browser engine, no key needed.
2. **BYOK mode** — users paste their own LLM provider API key and get full AI
   capabilities. Calls go **directly from the user's browser to the provider**; there is
   no backend and no proxy. The key never leaves the user's machine.

Because an API key is a **spending credential** (a leak = a bill), key security is a
first-class requirement of this feature, not an afterthought. This spec defines the
provider architecture *and* the security model; the storage decisions in §2 were
approved explicitly:

- **Keys live in `sessionStorage` only, by default.**
- **`localStorage` is used only when the user clicks "Remember this key"**, and then
  only as an **encrypted vault** (AES-256-GCM, passphrase-derived key).

## 2. Approved design decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Default storage: `sessionStorage` only** (plaintext key map, survives reload, dies with the tab) | Nothing sensitive persists beyond the browser session unless the user explicitly opts in; covers the shared-machine case |
| 2 | **"Remember this key" opt-in → encrypted `localStorage` vault**: AES-256-GCM, key derived from a user passphrase via PBKDF2; passphrase never stored | Persistence without plaintext at rest; a stolen profile dir / casual localStorage scrape yields ciphertext only |
| 3 | **No backend/proxy** — direct browser→provider calls | Eliminates the biggest breach class (server-side key store) by architecture; honest privacy claim: "your key never leaves your browser" |
| 4 | **Header-based auth only** (Gemini `x-goog-api-key`; OpenAI/OpenRouter `Authorization: Bearer`; Anthropic `x-api-key`) | Query-param keys (Gemini's `?key=`) leak into proxy logs and browser history |
| 5 | **CSP `connect-src` allowlist** naming exactly the provider endpoints + localhost | Even a successful XSS cannot exfiltrate the key to an attacker origin — the browser blocks the request |
| 6 | **Protocol allowlist for `href`/`src` at the Zod document gate** (`validate.ts`) | `exportHtml.ts` already sanitizes (`safeHref`, lines 190–199); the gap is that unsafe URLs can live in the document. Close it at the schema so it applies to import, commands, and future surfaces |
| 7 | New `ProposalEngine` interface; existing `runDemoEngine` wrapped as the demo engine; everything downstream of `RawProposal[]` (buildProposals → validateCommand → reviewStore → ProposalCard) reused unchanged | The pipeline seam is already engine-agnostic; minimal intrusion |
| 8 | **Structured output, not regex**: provider-native JSON Schema for `{ proposals: RawProposal[] }`; adapter = parse → `safeParse` → `buildProposals`; malformed output surfaces as *invalid proposals* in the existing review UI | Validation failures become reviewable UI states instead of silent corruption |
| 9 | Secrets are **never** in a Zustand `persist` store; only non-secret prefs (mode, provider, model) are persisted via `partialize` | `templateStore`/`editorStore` persist to localStorage today — a persisted key store would silently defeat decisions 1–2 |
| 10 | Extend `DemoErrorCode` with `provider-auth` / `provider-rate-limit` / `provider-network` / `provider-parse` | Provider failures render through the existing proposal-error UI |
| 11 | Recommend provider-side damage caps in the UI (dedicated named key per app; OpenAI project budget, OpenRouter per-key spend limit, AI Studio API-restricted key) | Backstop for threats we cannot control (malicious extensions, device malware); caps worst case at a small revocable loss |

## 3. Current-state references

- AI pipeline seam: `runDemoEngine` (`app/src/engine/ai/scenarioEngine.ts:13`) →
  `RawProposal[]` → `buildProposals` (`app/src/engine/ai/buildProposals.ts:23`) →
  `validateCommand` (`app/src/engine/validate.ts:181`; Zod `editCommandSchema` at
  :109–151) → `useReviewStore` (`app/src/store/reviewStore.ts`) →
  `ProposalCard`/`AiDemoPanel` (`app/src/components/panels/AiDemoPanel.tsx`).
- `RawProposal.command` = `EditCommand` minus `baseRevision` (5 kinds: `set-content`,
  `set-style`, `reorder`, `insert`, `remove`).
- `DemoErrorCode` union: `app/src/types/proposal.ts`; `ERROR_TITLES` map:
  `AiDemoPanel.tsx:9`.
- Style allowlist: 13 props in `app/src/types/template.ts:27–41`. Content shapes per
  element type: heading/text `{text}`, button `{label,href}`, image `{src,alt}`,
  list `{items}`, nav `{brand,links[]}`, section `{}`.
- Rendering safety (verified): no `dangerouslySetInnerHTML` anywhere; all AI-set text
  rendered as escaped React children (`app/src/components/renderer/leafViews.tsx`);
  canvas links are inert via `e.preventDefault()` (lines 19, 45).
- Export sanitization already exists: `safeHref`/`safeSrc` in
  `app/src/engine/exportHtml.ts:190–199` reject `javascript:`; the **document-level**
  schemas do not (`validate.ts:28` `href: z.string()`, :34–35) — see §8.
- Persisted stores (non-sensitive today): `templateStore.ts:212`, `editorStore.ts:58`
  (Zustand `persist` → localStorage). Keys must never join these (decision 9).
- Zod `^4.4.3` available for schema validation and JSON-Schema derivation.

## 4. Threat model

| Threat | Severity | Control |
|---|---|---|
| Server-side breach leaks all users' keys | — | **Eliminated by architecture** (decision 3): no server copy exists |
| Key persisting on a shared/public computer | Medium | Decision 1: sessionStorage default; tab close wipes it |
| At-rest theft of localStorage (profile copy, casual extension scrape) | Medium | Decision 2: vault is AES-GCM ciphertext; useless without passphrase |
| XSS in our code reads/exfiltrates key | High impact | No-`dangerouslySetInnerHTML` codebase + escaped rendering (existing); CSP `script-src 'self'` (§7); CSP `connect-src` allowlist blocks exfiltration even if XSS fires (decision 5) |
| Supply-chain (compromised npm dep in bundle) | Medium | Same CSP controls; `npm audit` hygiene |
| Malicious browser extension / device malware | Medium | Out of app control; mitigated by decision 11 (capped, dedicated, revocable keys) |
| Shoulder-surfing / accidental UI or log exposure | Low–Med | §9 hygiene: password input, masked display, no logging, header auth, `Referrer-Policy: no-referrer` |
| Prompt injection via imported template text | Low | Blast radius small by design: output Zod-constrained to 5 command kinds, allowlisted styles, human review gate; model text rendered as plain text only |
| `javascript:` URLs entering the document (import, LLM proposal) | Low | Decision 6 / §8 (canvas is inert; export sanitizes; now blocked at the gate too) |

Honest limits (state in README, don't oversell): vault encryption defends **at-rest**
theft, not an active XSS that hooks the decrypt call; sessionStorage plaintext is
readable by any same-origin script — the defense for that layer is CSP + the
no-XSS posture, plus capped keys as backstop.

## 5. Key storage

### 5.1 Tiers

| Tier | Trigger | Location | Lifetime |
|---|---|---|---|
| **Session (default)** | Any key entry | `sessionStorage['fabriik-byok-keys-v1']` + in-memory store | Tab/session end |
| **Vault (opt-in)** | "Remember this key" checked | `localStorage['fabriik-byok-vault-v1']` (encrypted envelope) | Until "Forget saved keys" |
| **Prefs (non-secret)** | Always | `localStorage` via `persist` + `partialize` | Mode, provider id, model id only — **never keys** |

### 5.2 Session format

```json
{ "version": 1, "keys": { "gemini": "AIza…", "openai": "sk-…" } }
```

Runtime source of truth is the in-memory `aiSettingsStore`; sessionStorage is a
reload-survival mirror written on every key set/remove and read once at startup.

### 5.3 Vault envelope (`fabriik-byok-vault-v1`)

```json
{
  "format": "fabriik-byok-vault",
  "version": 1,
  "kdf":    { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<b64, 16 bytes>" },
  "cipher": { "name": "AES-GCM", "iv": "<b64, 12 bytes>", "data": "<b64>" }
}
```

Decrypted payload: `{ "version": 1, "keys": { "<providerId>": "<key>" }, "updatedAt": "<ISO>" }`.

### 5.4 Crypto (Web Crypto API only — no dependencies)

- `deriveKey(passphrase, kdf)`: `crypto.subtle.importKey('raw', …)` →
  `deriveKey({ name: 'PBKDF2', hash: 'SHA-256', iterations, salt }, …,
  { name: 'AES-GCM', length: 256 }, /* extractable */ false, ['encrypt','decrypt'])`.
  Iterations per current OWASP PBKDF2-HMAC-SHA256 guidance; salt random 16 B.
- `encryptVault(keys, cryptoKey)`: plaintext = payload JSON; random 12 B IV per write;
  output = envelope above. Every write rotates salt and IV.
- `decryptVault(envelope, passphrase)`: GCM authentication failure ⇒ wrong passphrase
  (or tampering) → surface "Incorrect passphrase", offer retry. No client-side lockout —
  an offline attacker bypasses it anyway; the mitigations are KDF cost + key revocation.
- The derived `CryptoKey` (extractable: false) is cached **in memory only** for the
  session after a successful unlock, so adding/removing remembered keys doesn't
  re-prompt. The passphrase itself is dropped immediately after derivation.
- Tests: Node ≥ 20 exposes `crypto.subtle` globally, so `vaultCrypto` is unit-testable
  under Vitest without mocks; keep the `crypto` object injectable for edge-case tests.

### 5.5 Flows

- **Set key (default)**: validate non-empty → memory + session mirror.
- **Remember**: if no vault exists → prompt "Create a vault passphrase" (with a second
  confirm field; strength hint); if vault exists but locked → prompt passphrase to
  unlock; then re-encrypt the full key map and write the envelope.
- **Startup**: hydrate session mirror → if empty and a vault envelope exists → show
  "Unlock saved keys" prompt in the AI panel (dismissible; dismissal = session-only
  mode, vault untouched).
- **Forget key**: remove from memory + session; if the provider is in the vault,
  re-encrypt vault without it (requires unlocked vault; if locked, prompt once or skip
  with a note — implementation choice, must be stated in UI).
- **Forget saved keys** (separate, destructive): deletes the vault envelope outright;
  session keys unaffected until tab closes.
- **Provider switch**: other providers' keys are retained; only the *displayed* input
  clears. Keys are shown masked (`sk-…a1b2`) when present.

### 5.6 Store shape

```ts
// app/src/store/aiSettingsStore.ts — NOT wrapped in persist for secrets
interface AiSettingsState {
  mode: 'demo' | 'byok';                      // persisted (partialize)
  providerId: ProviderId | null;              // persisted (partialize)
  modelId: string | null;                     // persisted (partialize)
  keys: Partial<Record<ProviderId, string>>;  // memory only
  vaultState: 'none' | 'locked' | 'unlocked'; // memory only
  vaultKey: CryptoKey | null;                 // memory only, non-extractable
  setKey / forgetKey / rememberKey / unlockVault / forgetVault / setMode / setProvider …
}
```

## 6. Provider layer

### New modules

| File | Responsibility |
|---|---|
| `app/src/engine/ai/proposalEngine.ts` | `ProposalEngine { id, label, run(input, doc): Promise<DemoResult> }`; shared types |
| `app/src/engine/ai/demoEngine.ts` | Async wrapper over `runDemoEngine` (demo mode) |
| `app/src/engine/ai/outputSchema.ts` | JSON Schema for `{ proposals: RawProposal[] }` derived from the Zod schemas (single source of truth) |
| `app/src/engine/ai/parseProposals.ts` | Pure adapter: provider text/JSON → `JSON.parse` → `safeParse` → `RawProposal[]`; failures → `provider-parse` error result |
| `app/src/engine/ai/providers/{gemini,openai,openrouter,anthropic,ollama}.ts` | One file per provider: endpoint, headers, structured-output request, response extraction, error mapping to `DemoErrorCode` |
| `app/src/engine/ai/prompt.ts` | Prompt assembly: instruction, scope, selected elements via `resolvedForScope` (`buildProposals.ts:68`), rules (id targeting, 13-prop style allowlist, exact content keys per type, hex colors) |
| `app/src/lib/keyStorage.ts` | Browser-only session/vault IO (§5.2–5.3); isolated for test mocking |
| `app/src/lib/vaultCrypto.ts` | §5.4 |
| `app/src/store/aiSettingsStore.ts` | §5.6 |
| `app/src/components/panels/AiSettingsSection.tsx` | BYOK settings UI (§9), rendered at the top of `AiDemoPanel` |

### Providers (v1)

| Provider | Endpoint | Auth header | Notes |
|---|---|---|---|
| Google Gemini | `generativelanguage.googleapis.com` | `x-goog-api-key` | CORS-friendly, free tier → best default |
| OpenAI | `api.openai.com` | `Authorization: Bearer` | `response_format: json_schema` |
| OpenRouter | `openrouter.ai` | `Authorization: Bearer` | One key → many models incl. free; best spend caps |
| Anthropic | `api.anthropic.com` | `x-api-key` + `anthropic-dangerous-direct-browser-access: true` | Header explicitly opt-in |
| Ollama / LM Studio | `localhost:11434` / `localhost:1234` | none | Zero-cost local-model story; hint if model not pulled |

Transport rules: HTTPS only (except localhost); key in header, never URL/body-log;
`AbortController` timeout; single in-flight request with loading state; input caps on
instruction length; `fetch` constructed once per provider module so endpoints are
grep-able for CSP parity.

## 7. Content Security Policy

Ship as a `<meta http-equiv="Content-Security-Policy">` in `index.html` (works on
static hosting e.g. GitHub Pages), plus `<meta name="referrer" content="no-referrer">`:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com
  https://openrouter.ai https://api.anthropic.com http://localhost:11434 http://localhost:1234;
object-src 'none'; base-uri 'self'; form-action 'none'
```

- `style-src 'unsafe-inline'` is required: the renderer sets inline `style` attributes.
- `img-src https:` is required: templates use hosted image URLs.
- Roll out **Report-Only first**, then enforce. Dev-server note: the CSP must not break
  Vite HMR in development — apply to the production build (document the mechanism:
  e.g. meta tag injected only for prod, or accepted dev-only loosening).
- Adding a provider = endpoint here **and** in its provider module, in the same commit.

## 8. Document-level URL allowlist

Tighten `href`/`src` in `validate.ts` (`linkSchema` :26–28, button/image :34–35) with
the **same policy as `safeHref`** (`exportHtml.ts:190–199`) — single shared predicate,
e.g. `isSafeUrl`: allow `https:`, `http:`, `mailto:`, `tel:`, relative URLs, `#`;
reject `javascript:`, `data:`, everything else. Applies to template JSON import,
`editCommandSchema` content commands, and any future surface. Existing export
sanitizer stays as defense-in-depth.

## 9. UX & hygiene

- Mode toggle **Demo | BYOK** atop `AiDemoPanel`; provider + model selects; review UI
  unchanged (proposals look identical regardless of engine).
- Key input: `type="password"`, `autocomplete="off"`, masked display when set, visible
  **Forget key** and **Forget saved keys** buttons, **Test connection** action.
- "Remember this key" checkbox — checking it triggers the vault passphrase flow (§5.5).
- Privacy caption: *"Your key is stored only in this browser (session-only by default)
  and sent directly to the provider — never to our servers."*
- Spend-limit hints panel linking to provider docs (decision 11).
- Never `console.log` keys/headers; if telemetry is ever added, scrub
  `Authorization`/`x-goog-api-key`/`x-api-key` (CSP also blocks exfil as a bonus).

## 10. Error codes

Extend `DemoErrorCode` (`types/proposal.ts`) and `ERROR_TITLES` (`AiDemoPanel.tsx:9`):

| Code | When |
|---|---|
| `provider-auth` | 401/403 from provider (bad or revoked key) |
| `provider-rate-limit` | 429 |
| `provider-network` | fetch failure / timeout / CORS |
| `provider-parse` | response not JSON, or fails `RawProposal[]` schema |

Vault errors (wrong passphrase, corrupt envelope) are local to the settings UI — they
are not proposal errors.

## 11. Tests (Vitest, colocated, existing conventions)

- `lib/vaultCrypto.test.ts` — round-trip encrypt/decrypt; wrong passphrase → auth
  failure; envelope shape/version; salt/IV rotation across writes; tampered ciphertext
  rejected.
- `lib/keyStorage.test.ts` — session mirror write/read/remove; vault envelope IO;
  corrupt JSON handling (mocked `sessionStorage`/`localStorage`).
- `store/aiSettingsStore.test.ts` — hydration from session; unlock flow hydrates keys
  + caches CryptoKey; forgetKey re-encrypts vault; forgetVault deletes envelope;
  **secrets never appear in persisted partialize output**.
- `engine/validate` additions — `javascript:`/`data:` rejected for href/src at schema
  gate; safe schemes accepted (mirror `safeHref` cases).
- `engine/ai/parseProposals.test.ts` — valid fixture → RawProposal[]; malformed JSON,
  schema-mismatch, and non-array payloads → `provider-parse`.
- Provider modules — fixture-based (recorded responses), **never live calls**; error
  mapping 401/429/network → codes; header contains key, URL does not.
- Build check — built `index.html` contains the CSP meta with `connect-src` parity
  against provider endpoints (script or test assertion).

## 12. Execution order

1. Security primitives: `vaultCrypto` + `keyStorage` + tests
2. URL allowlist in `validate.ts` + tests (independent, tiny)
3. `ProposalEngine` interface + demo wrapper + `AiDemoPanel.run()` async
4. Output schema + `parseProposals` adapter + Gemini provider (fixtures)
5. `aiSettingsStore` + settings UI (toggle, key input, remember/unlock/forget, test
   connection) + privacy caption + spend-limit hints
6. CSP meta (Report-Only) + referrer meta; verify; enforce
7. OpenAI / OpenRouter / Anthropic / Ollama providers (fixtures)
8. Error-code extension + `ERROR_TITLES`
9. Docs: README architecture map + honest security statement (§4 limits)
10. Verification: `npm test`, `npm run build` (includes tsc)

## 13. Out of scope (v1)

- Backend key proxy, OAuth flows, server-side anything (decision 3).
- Key rotation automation, multi-device sync, hardware key storage.
- Session-key encryption (sessionStorage plaintext is the accepted trade-off — §4).
