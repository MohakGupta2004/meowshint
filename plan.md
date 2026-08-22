# Scrape Worker — Queue Wiring (remaining half)

## Context

The previous revision of this file (a red-first test spec for the sessions/credits/reports
bug fixes) is done and superseded — recoverable at `git show 59ea746:plan.md`. Since then,
the scrape-worker build (full spec in
`~/.claude/plans/according-to-the-plan-snoopy-gem.md`) has landed its first half:

**Built and tested (193 passing, 0 regressions):**

- `packages/scrapers` — GitHub, Instagram, and web-search handlers, HTTP client, contact/handle
  extraction, summary rendering. 42 tests, all against mocked responses — never run against the
  real internet yet (`SCOUT_LIVE=1` live tests exist but are gated off).
- `apps/api/src/worker/classify.ts`, `contracts.ts`, `queue-specs.ts` — pure logic, fully tested.
- `apps/api/src/modules/sessions/task-runner.ts` — claim/finish/fail/release/skip/notFound.
  Fixes the claim race, double-charge, and phase-guard bugs. All 6 required mutations verified
  to break their target test.
- `apps/api/src/config/env.ts` — boolean-coercion fix, new `RUN_API`/`RUN_WORKER`/`SCOUT_*` vars.
- Schema migration `task_charge_idempotency` (`SessionTask.chargedAt` + index) — applied.

**Not built — this is what's left:** nothing actually triggers a scrape yet. The tools exist;
nothing calls them. `POST /sessions` still creates a session and nothing else. This plan covers
the queue/dispatch wiring that closes that gap.

**Also out of scope, noted for later:** the reference project at `../Scout/app` has 6 more
platform scrapers (TikTok, Twitch, LinkedIn, YouTube, Pinterest, Linktree) and a 584-line
`enrichment.py` lead-enrichment engine. Neither is touched here — this plan only wires up the
3 platforms already built (WEB_SEARCH, GITHUB, INSTAGRAM).

## Risk to verify first — do not skip

BullMQ v5 depends on `ioredis@^5`; this repo hoists `ioredis@6.0.0` for its own Redis client.
Before writing any queue code:

```bash
bun add bullmq --filter api
bun pm ls | grep -A1 ioredis
```

Expect **two** entries: `6.0.0` at root, a `5.x` nested under `bullmq`. If BullMQ instead
resolves to the hoisted `6.0.0`, stop and pin via `overrides` in root `package.json` before
proceeding — handing BullMQ a v6 client risks running its Lua/blocking-command machinery
against a client version it isn't tested with.

## `apps/api/src/worker/queue.ts`

Lazy, memoized `getQueue(name)` — must not open a Redis socket at import time, or `bun test`
with no Redis running will hang. Connection built from `env.REDIS_URL` as **plain options**,
never a `Redis` instance, with `maxRetriesPerRequest: null` and `enableReadyCheck: false` — this
sidesteps the ioredis version conflict entirely (BullMQ builds its own client) and avoids
touching `src/lib/redis.ts`, which the API's `/health/ready` route already depends on.

Job options on enqueue: `jobId: taskId` (uses `SessionTask`'s existing `@@unique([sessionId,
platform])` for natural idempotency while the job is retained), `attempts`/`backoff` from
`queue-specs.ts`, `removeOnComplete: {age: 3600, count: 1000}`, `removeOnFail: {age: 86400,
count: 5000}`.

**Verify:** `bun test` (no Redis running) still passes and does not hang.

## `apps/api/src/modules/sessions/dispatch.ts`

`dispatchTasks(rows)` — the only file that imports `worker/queue`. Early-returns on an empty
array before ever calling `getQueue`, so callers with no rows to dispatch never touch Redis
(this is what keeps the additions below from breaking existing tests that stub `findMany` to
`[]`). Builds a `JobData` payload per row via `contracts.ts` and calls `queue.add`.

## `sessions/service.ts` changes — S30–S36

Additive changes only; **S1–S29 in `tests/sessions/service.test.ts` must not be touched.**

| #   | Change                                                                                | Test                                           | Assertion                                                                                                        |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| S30 | `create` forces `WEB_SEARCH` into `platforms` if the caller omitted it (dedup, first) | `create(7, {query:'x', platforms:['GITHUB']})` | `osintSession.create` data.platforms is `['WEB_SEARCH','GITHUB']`; one `WEB_SEARCH` task created; `totalTasks:1` |
| S31 | doesn't duplicate `WEB_SEARCH` if the caller already included it                      | platforms `['WEB_SEARCH','GITHUB']`            | data.platforms stays exactly `['WEB_SEARCH','GITHUB']`                                                           |
| S32 | `create` dispatches **after** the transaction commits, not inside it                  | spy `dispatchTasks`                            | called once, after `$transaction` resolves (assert via call-order)                                               |
| S33 | `selectCandidate`'s `sessionTask.createMany` gains `skipDuplicates:true`              | inspect call args                              | `.mock.calls[0][0].skipDuplicates === true`                                                                      |
| S34 | `selectCandidate` dispatches only `PENDING` rows, never re-dispatches `WEB_SEARCH`    | stub `findMany` → 2 GITHUB/INSTAGRAM rows      | `dispatchTasks` called with exactly those 2; no `WEB_SEARCH` row                                                 |
| S35 | `createTask` increments `totalTasks` (previously a dead spot)                         | `createTask('s1','TIKTOK',7)`                  | `osintSession.update` `{totalTasks:{increment:1}}`                                                               |
| S36 | `createTask` dispatches the new task after commit                                     |                                                | `dispatchTasks` called once                                                                                      |

**Verify:** `bun test tests/sessions` — S1–S29 unchanged and green, S30–S36 new and green.

## `apps/api/src/worker/processor.ts` + `handlers/`

The seam: `claim()` → run handler from `@repo/scrapers` registry → `finish()`/`fail()`/`release()`/
`skip()`/`notFound()` per `classify()`'s disposition. `RateLimitError` calls `worker.rateLimit(ms)`
then throws `Worker.RateLimitError()` (requeues without consuming an attempt — this is why
each platform gets its own BullMQ queue, so a 429 only pauses that platform).

`handlers/index.ts` wires `@repo/scrapers`' `createScraperHandlers(searchEngine)` registry to
`JobKind` — `WEB_SEARCH` and `SCRAPE` map in; `ENRICH`/`SUMMARIZE`/`EXPORT` are `notImplemented`
stubs for now.

**Verify:** unit tests with a mocked scraper registry — no real network, no real Redis. Table:
claim fails → handler never called; handler throws `RateLimitError` → `finish`/`fail` never
called, `rateLimit` called with the right delay; handler resolves `FOUND` → `finish` called
with that outcome.

## Worker bootstrap — `apps/api/src/worker/index.ts` + `server.ts`

`startWorkers()` constructs one BullMQ `Worker` per queue in `queue-specs.ts`; `closeWorkers()`
awaits graceful drain. `server.ts` gains `if (env.RUN_WORKER) await startWorkers()` in
`bootstrap()`, and `closeWorkers()` runs **first** in `registerShutdownHandlers()`, before
`disconnectDatabase()`/`disconnectRedis()`, with its own slice of `SHUTDOWN_TIMEOUT_MS`.

**Verify:** `docker compose up -d && RUN_WORKER=true bun run dev` — logs show a `worker started`
line per queue.

## Integration tests (gated, real Postgres/Redis)

Same `describe.skipIf(!db)` pattern as the existing `tests/integration/ledger.test.ts`.

| File                  | Gate                | Proves                                                                                                                                                                              |
| --------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task-claim.test.ts`  | `TEST_DATABASE_URL` | two concurrent `claim()` calls on one task → exactly one `ok:true`, exactly one `CreditTransaction` row. The only thing that actually proves the claim race is fixed — mocks can't. |
| `task-finish.test.ts` | `TEST_DATABASE_URL` | `finish()` called twice → one result row (no unique-constraint violation), `completedTasks === 1`.                                                                                  |
| `task-reaper.test.ts` | `TEST_DATABASE_URL` | a task stuck `RUNNING` for 2h gets reaped to `FAILED` + refunded + session finalized. _(needs `maintenance.ts`'s `reapStaleTasks()`, not yet written — add it here.)_               |
| `queue.test.ts`       | `TEST_REDIS_URL`    | adding the same `jobId` twice → one waiting job. `afterAll` must close the worker+queue or `bun test` hangs on the open connection.                                                 |

## Deploy fix

`apps/api/Dockerfile` builds from the `apps/api/` context alone — it will **not** see
`packages/scrapers`. Either build from the repo root with a multi-stage copy of `packages/`, or
restructure the COPY steps to pull in the workspace package. Verify: `docker build -t
meowshint-api apps/api` succeeds and the container boots with `RUN_WORKER=true`.

## Order

1. ioredis risk check (above) — stop-the-line if it fails.
2. `queue.ts` — verify lazy, no-Redis-needed test pass.
3. `dispatch.ts`.
4. `sessions/service.ts` S30–S36 — verify S1–S29 untouched.
5. `processor.ts` + `handlers/index.ts`.
6. Worker bootstrap in `server.ts`.
7. Integration tests (needs Docker Postgres + Redis running).
8. Dockerfile fix.
9. End-to-end: `POST /sessions` → poll `GET /sessions/:id` → candidates non-empty → select →
   GitHub/Instagram tasks reach `FOUND` → session `COMPLETED` → report renders both sections.
