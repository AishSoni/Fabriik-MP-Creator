# Spec: Worker Hardening — Abuse Bounds & Room Lifecycle

Status: Shipped — describes implemented behavior
Scope: `worker/src/{docObject,index,rateLimit,frameLimit,roomLimits,roomTtl}.ts`,
app-side counterparts in `app/src/collab/frames.ts` and `app/src/collab/presence.ts`
Companion to: `specs/multiplayer-do-protocol.md` (§4.5, §8), `specs/ci-cd.md`

## 1. Purpose

Anyone holding a room URL can join it by design. These controls bound the damage a
hostile or buggy client can do to a room and its neighbors, without building
authentication. They are cheap, unit-testable, and each one has an explicit failure
behavior — drop, close, refuse, or prune — chosen to be visible rather than silent.

## 2. Trust model

- Access control is the capability URL: a 10-hex room ID (~40 bits) is the credential,
  the same model as Figma link sharing. `?token=` is reserved in the protocol but
  unused in Phase 1 — possession of the link is access.
- No per-user identity or authorization. The controls below bound abuse; they do not
  authenticate users. Per-user enforcement is deferred to an auth phase.
- Command frames cross a trust boundary and are Zod-validated against the projected
  doc (`worker/src/validate.ts`). Yjs doc-space updates are trusted by design — the
  CRDT link-share trade-off, same as Figma.

## 3. Controls

| # | Control | Module | Limit | On violation |
|---|---|---|---|---|
| 1 | Command rate limit | `rateLimit.ts` | Token bucket: burst 100, refill 20/s, per connection | Command frame dropped with `console.warn`; connection stays open; bucket forgotten on close |
| 2 | Room connection cap | `roomLimits.ts`, `docObject.ts` | `MAX_ROOM_CONNECTIONS` default 16, clamped to 1–256 | `room-full` notice then `close(4003, 'room full')`; app stops auto-reconnect and toasts (`ROOM_FULL_CLOSE_CODE = 4003`) |
| 3 | Frame size cap | `frameLimit.ts` | `FRAME_SIZE_LIMIT_BYTES` = 256 KiB | Oversized binary frame dropped with `console.warn`; sender stays connected; string messages bypass binary handling |
| 4 | Origin allowlist | `index.ts` | `ALLOWED_ORIGINS` (comma-separated) | Request with a present, non-allowlisted `Origin` → 403 before routing; absent `Origin` (Node tests, curl) allowed by design |
| 5 | Room TTL prune | `roomTtl.ts`, `docObject.ts` | `ROOM_TTL_MS` = 30 days idle | Alarm fires, re-arms, or prunes when connection count is 0: `deleteAlarm()` → `deleteAll()` → `prunedAt` tombstone |
| 6 | Command dedupe | `docObject.ts` | Latest 512 `commandId`s persisted with the snapshot | Retried duplicate is re-acked without re-applying |

### 3.1 Room connection cap

Bounds awareness fan-out, which is O(N²) (cursor traffic); doc updates are O(N). The
check uses the hibernation-aware connection count in `onConnect`, so a full room is
rejected on join rather than by fighting existing peers. The client treats close code
4003 as terminal — no reconnect loop.

### 3.2 Room TTL prune

Each save writes `lastActiveAt` and pushes a storage alarm out 30 days. On alarm,
`shouldPruneRoom` prunes iff there are 0 connections ∧ a finite activity marker ∧ age
≥ 30 days; otherwise it re-arms. `deleteAlarm()` runs first (workerd #2993 SQLite
workaround). The tombstone distinguishes *expired* from *brand new*, so a joiner of a
pruned room gets the `room-expired` notice and a fresh document; the next save revives
the room and deletes the tombstone. Activity means doc mutations — joins alone do not
renew. No cron is possible (DOs cannot be enumerated); per-room alarms are the
distributed alternative. Rooms that never save have no marker or alarm: eviction
reclaims them for free.

## 4. Failure behavior philosophy

Default to **drop, don't close**: rate-limited and oversized frames are discarded while
the connection survives, so a buggy client can recover and a flood cannot churn
reconnects. The only close is the connection cap (4003), where the connection itself is
the resource being protected — and the client is told why.

## 5. Accepted risks

- **Rate limiter is in-memory**: state resets on DO eviction. Eviction requires
  idleness, so an actively abusive object stays warm and keeps its bucket.
- **Dedupe window spans DO restarts only via persistence**: the latest 512 IDs are
  saved with the snapshot; an extreme replay outside that window could double-apply.
  Accepted in Phase 1; the room's own lifetime bounds it.
- **Capability URL is the only access control**: uninvited join is possible with the
  link; `?token=` remains reserved for a future shared-secret handshake.
- **Trusted doc-space**: a malicious peer can inject arbitrary Yjs updates. Inherent to
  the link-share CRDT model; command frames remain validated.

## 6. Test coverage

- Unit: `rateLimit.test.ts`, `frameLimit.test.ts`, `roomLimits.test.ts`,
  `roomTtl.test.ts` (constants pinned in tests).
- Worker e2e: room-full cap (`10a6e3f`), expired-room notice, origin allowlist.
- App: `frames.test.ts` (notice round-trips, close code) and `presence.test.ts`
  (room-full → toast mapping).

## 7. Deferred

1. Auth phase: `?token=` handshake, then per-user connection eviction (userId →
   connection map, "opened in another tab" notice) — only meaningful once identity is
   unspoofable.
2. KV registry + cron scan for room observability, if ever needed (alarms handle
   pruning without it).
3. R2 snapshots and compaction for very large or long-lived docs.
