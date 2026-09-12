# Spec: CI/CD — PR Checks & Gated Worker Deploy

Status: Shipped (PR #2) — describes implemented behavior
Scope: `.github/workflows/ci.yml`, `app/.nvmrc`, `worker/.nvmrc`, `engines` in both
`package.json`s
Companion to: `OPS_NOTES.md` (private), `specs/worker-hardening.md`

## 1. Purpose

One GitHub Actions workflow gates changes and deploys the worker. The app deploys
separately through Vercel's Git integration. Every PR check is reproducible locally
with the same Node version and lockfiles.

## 2. Pipeline at a glance

| Event | `app` | `worker` | `deploy-worker` |
|---|---|---|---|
| Pull request (any branch) | runs | runs | skipped (`if` requires main push) |
| Push to `main`, paths `worker/**`, `app/src/**`, or the workflow | runs | runs | runs, only after `worker` passes |
| Push to `main`, other paths | not triggered | not triggered | not triggered |

- App CD: Vercel Git integration (auto-deploys main). `VITE_COLLAB_URL` is set in the
  Vercel dashboard and inlined at build time — no GitHub Actions deploy for the app.
- Worker CD: third job in `ci.yml`, folded in rather than a standalone workflow so it
  cannot race CI (`needs: worker`).

## 3. `ci.yml`

Triggers: `pull_request` (all) plus `push` to `main` filtered by the paths above.
`permissions: contents: read`; concurrency group per workflow+ref with
`cancel-in-progress` only on PRs (main runs are never cancelled mid-deploy).

| Job | Steps |
|---|---|
| `app` (`working-directory: app`) | `npm ci` → `typecheck` → `lint` (oxlint) → `test` → `build` |
| `worker` (`working-directory: worker`) | `npm ci` in `app`, then `npm ci` → `typecheck` → `lint` → `test` → `npx wrangler deploy --dry-run --outdir dist` |
| `deploy-worker` (`needs: worker`) | `npm ci` in `app`, `npm ci` in `worker`, then `cloudflare/wrangler-action@v3` |

- Node 24 via `node-version-file` pointing at each package's `.nvmrc`; npm cache keyed
  on lockfiles (the `worker` job caches both lockfiles).
- `wrangler deploy --dry-run` runs without auth and exercises the build-time alias map
  (`@app/*`, `yjs`, `y-protocols`, `lib0`, `zod`) — the load-bearing resolution that,
  if broken, silently bundles two Yjs copies.
- `deploy-worker` passes `apiToken: secrets.CLOUDFLARE_API_TOKEN` and
  `accountId: secrets.CLOUDFLARE_ACCOUNT_ID`; wrangler-action uses the workspace's
  exact-pinned `wrangler@4.105.0` (`workingDirectory: worker`).
- Worker e2e suites (`SMOKE_E2E_URL` / `SCEN_E2E_URL` / `PERSIST_E2E_URL` gates)
  self-skip in CI — no prod credentials on PRs.

## 4. Why the worker jobs install app dependencies

`worker/tsconfig.json` maps `@app/*` to `../app/src/*`, and those app sources import
`yjs`, `zod`, `lib0/*`, `y-protocols/*`, and `y-partyserver/provider`. Locally they
resolve through `app/node_modules`; on a clean runner they do not. The wrangler alias
map also omits `y-partyserver/provider`, so the deploy job needs app deps too.
Installing `app/package-lock.json` in both worker jobs mirrors local resolution instead
of teaching tsconfig/esbuild separate rules.

## 5. Repo prerequisites

- Secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must exist before the
  first main push, or `deploy-worker` fails (PR CI is unaffected).
- `worker/package-lock.json` is tracked via `git add -f`; `.gitignore` keeps the
  `package-lock.json` rule with a comment explaining why. Both lockfiles must stay
  committed for `npm ci` and the Actions npm cache.
- Node 24 pinned in both `.nvmrc` files and enforced by `"engines": { "node": ">=24" }`.
- Durable Object config needs no CI changes: binding, SQLite storage, and the `v1`
  migration all live in `worker/wrangler.jsonc`. Future migration tags (`v2`) ship as
  their own PR; watch the deploy log.

## 6. Deliberately excluded checks

| Check | Why it is not in CI | Follow-up |
|---|---|---|
| `format:check` | Fails on ~141 files from real prettier drift (not just CRLF); would red every PR | One-shot `prettier --write` cleanup PR, then add |
| `lint:tailwind` | Flat config in `app/eslint.config.js` has no TypeScript parser (`typescript-eslint` not installed) → parse errors | Add parser, fix warnings, then add |
| Prod e2e / smoke | e2e env hooks exist but need live-URL secrets; deliberately kept out of PR runs | Optional post-deploy job: `SCEN_E2E_URL` with a `github.run_id` room suffix |

## 7. Open items

1. Branch protection requiring `app` + `worker` checks on `main` (GitHub settings, no
   code change).
2. Post-deploy smoke run wired to the `deploy-worker` job (see §6).
