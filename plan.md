# OSINT Feature — Test Suite Spec (red-first) + Bug Fixes

## Context

The OSINT schema and modules (`sessions`, `credits`, `reports`) are implemented and the
migrations are applied (`bunx prisma migrate status` → up to date). **Zero tests cover any
of it** — `bun test` reports 85 passing, but grep for
`sessionsService|creditsService|reportsService|osintSession|creditTransaction|sessionTask`
across `tests/` returns nothing.

That gap is why a credit-direction inversion shipped unnoticed: `completeTask` calls
`creditsService.refund()` under a comment reading "Charge credits", so successful scrapes
_pay the agent_. `creditsService.spend()` has no caller anywhere in `src/`.

This plan writes the suite **red-first** — every test below is specified with a literal
expected value and the exact failure it must produce against today's code — then fixes
the source until green. The point is a suite that pins behavior, not one that has been
shaped to agree with whatever the code currently does.

---

## Rules for whoever implements this

These are binding. A test violating any of them is rejected regardless of whether it passes.

- **R1 — Red-first proof.** Every test marked 🔴 MUST FAIL against unmodified `src/`, with
  the failure named in its spec. Run it, capture the output, then fix `src/`. A 🔴 test that
  passes before any source change is a broken test — it is not asserting what it claims.
- **R2 — Fixes go in `src/`, never in the assertion.** The literal values in this spec
  (`-10`, `90`, `'COMPLETED'`) are the contract. If code disagrees with the spec, the code
  is wrong. Do not edit an expected value to match observed output.
- **R3 — No bare call assertions.** `expect(m).toHaveBeenCalled()` on its own is banned.
  Always assert arguments: `toHaveBeenCalledWith(...)` or inspect `m.mock.calls[0][0]`.
- **R4 — Assert the negative.** Every error-path test asserts _no write occurred_
  (`expect(tx.creditTransaction.create).not.toHaveBeenCalled()`), not merely that it threw.
- **R5 — No snapshot tests.** A snapshot records current behavior, bugs included.
- **R6 — Parse, don't eyeball.** CSV assertions parse the output and check structure.
  No hand-written expected blob for escaping cases.
- **R7 — No filler.** No `expect(true).toBe(true)`, no empty bodies, no `it.skip` / `it.todo`
  left behind. A test that cannot fail does not count.
- **R8 — Name the mutation.** Each test carries a one-line comment naming the single source
  change that breaks it. If you cannot name one, delete the test.
- **R9 — Never mock the unit under test.** Collaborators (`creditsService` inside session
  tests) may be spied on. `sessionsService` methods must not be mocked inside
  `sessions/service.test.ts`.
- **R10 — Mutation check before declaring done.** Manually apply each of these to `src/`,
  confirm ≥1 test fails, then revert:
  1. `amount: -amount` → `amount: amount` in `credits/service.ts`
  2. delete the `assertNotLocked` call in `startTask`
  3. `finalStatus = 'COMPLETED'` → `'PARTIAL'` in `checkSessionCompletion`

## Test infrastructure

Follow the existing pattern exactly — `tests/users/service.test.ts:10` uses
`mock.module('../../src/lib/prisma', …)` with a hand-built mock object and no live database.

Two additions needed beyond that pattern:

- `$transaction(cb)` mock must **invoke the callback** with a `tx` mock, so transactional
  code paths actually execute: `mock(async (cb) => cb(txMock))`.
- `$queryRaw` mock returns a fixed row: `[{ id: 1, creditBalance: <n> }]`.

`tests/integration/ledger.test.ts` is the one exception and needs real Postgres. Gate the
whole file on `process.env.TEST_DATABASE_URL` — when unset, the suite skips so plain
`bun test` still runs clean without Docker.

---

## `tests/credits/service.test.ts`

### `spend()`

| #   | Test                                               | Assertion                                                                                                                                       |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | debits, does not credit                            | balance 100, amount 10 → `creditTransaction.create` arg has `amount: -10` **and** `balanceAfter: 90`; `user.update` arg has `creditBalance: 90` |
| C2  | insufficient balance rejects with no partial write | balance 5, amount 10 → rejects `InsufficientCreditsError`; `user.update` **and** `creditTransaction.create` both not called                     |
| C3  | exact-balance boundary succeeds                    | balance 10, amount 10 → resolves, `balanceAfter: 0`. Pins `<` vs `<=`                                                                           |
| C4  | honors caller-supplied kind                        | pass `kind: 'PREMIUM_QUERY'` → create arg `kind === 'PREMIUM_QUERY'`. Regression guard on the old hardcoded ternary                             |
| C5  | increments session total                           | `osintSession.update` called with `{ creditsSpent: { increment: 10 } }`                                                                         |
| C6  | increments task cost only when taskId given        | with `taskId` → `sessionTask.update` `{ creditCost: { increment: 10 } }`; without → `sessionTask.update` not called                             |
| C7  | takes a row lock before reading                    | `$queryRaw` called, and its assembled SQL contains `FOR UPDATE`                                                                                 |
| C8  | never touches the module singleton                 | after `spend(txMock, …)`, the mocked `prisma.user.update` (not `tx`) is not called. Proves the write went through the passed transaction        |

### `refund()`

| #      | Test                         | Assertion                                                                                                                                                                                                                                        |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C9     | credits positively           | balance 90, amount 10 → create arg `amount: 10`, `kind: 'REFUND'`, `balanceAfter: 100`                                                                                                                                                           |
| C10    | no balance check             | balance 0, refund 10 → resolves (never throws `InsufficientCreditsError`)                                                                                                                                                                        |
| C11 🔴 | **decrements session total** | `osintSession.update` called with `{ creditsSpent: { decrement: 10 } }`.<br>**Fails now:** `refund()` never touches `creditsSpent` — a charged-then-refunded task leaves the session total permanently inflated. Bug #5, not previously reported |

### `grant()`

| #   | Test                             | Assertion                                                         |
| --- | -------------------------------- | ----------------------------------------------------------------- |
| C12 | positive, kind GRANT, no session | create arg `amount: 10`, `kind: 'GRANT'`, `sessionId` absent/null |
| C13 | opens its own transaction        | `prisma.$transaction` called once                                 |

---

## `tests/sessions/service.test.ts`

### `selectCandidate()`

| #   | Test                                     | Assertion                                                                                                                                                                                                                                         |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | wrong status rejects                     | status `ENRICHING` → `ConflictError`; `sessionTask.createMany` not called                                                                                                                                                                         |
| S2  | foreign candidate rejects                | candidateId absent from session → `NotFoundError`                                                                                                                                                                                                 |
| S3  | locked session rejects                   | `lockedAt` set → `SessionLockedError`; `candidate.update` not called                                                                                                                                                                              |
| S4  | happy path transition                    | `candidate.update` `{ selected: true }`; session update `{ status: 'ENRICHING', selectedCandidateId, totalTasks: 3 }` for a 3-platform session                                                                                                    |
| S5  | one task per requested platform, no more | session platforms `['WEB_SEARCH','INSTAGRAM','GITHUB']` → `createMany` arg has exactly 3 rows, each `status: 'PENDING'`, and the set of `platform` values equals the input set (order-insensitive). Catches "created tasks for all 9 enum values" |

### `startTask()` — charge point

| #     | Test                                   | Assertion                                                                                                                            |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| S6 🔴 | **charges credits here**               | `creditsService.spend` called exactly once.<br>**Fails now:** `startTask` only sets status/`startedAt`; nothing charges              |
| S7 🔴 | per-platform cost and kind             | `WEB_SEARCH` → spend amount `5`, kind `'WEB_SEARCH'`; `INSTAGRAM` → amount `10`, kind `'SCRAPE'`.<br>**Fails now:** same as S6       |
| S8 🔴 | locked session rejects                 | `lockedAt` set → `SessionLockedError`; `sessionTask.update` not called.<br>**Fails now:** `startTask` has no `assertNotLocked` call  |
| S9 🔴 | double-start rejects, no double charge | task already `RUNNING` → `ConflictError`; `spend` not called.<br>**Fails now:** no status guard exists — calling twice charges twice |
| S10   | sets RUNNING + startedAt               | update arg `status: 'RUNNING'`, `startedAt` is a `Date`                                                                              |

### `completeTask()`

| #      | Test                             | Assertion                                                                                                                                                                                                                                                                                       |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S11 🔴 | **does not move credits**        | `creditsService.refund` called **0** times **and** `creditsService.spend` called **0** times.<br>**Fails now:** `sessions/service.ts:147` calls `refund()`, paying the agent 10 credits per successful scrape. This is the headline bug                                                         |
| S12    | routes result to the right table | Parametrize all 9 platforms. For each, exactly one of `webSearchResult` / `instagramResult` / `linkedInResult` / `socialProfileResult` `.create` is called and the other three are not. `GITHUB`/`TWITCH`/`YOUTUBE`/`TIKTOK`/`PINTEREST`/`LINKTREE` → `socialProfileResult` with `platform` set |
| S13    | marks FOUND and counts           | update arg `status: 'FOUND'`, `finishedAt` a `Date`; `osintSession.update` `{ completedTasks: { increment: 1 } }`                                                                                                                                                                               |
| S14 🔴 | locked session rejects           | `lockedAt` set → `SessionLockedError`; no result-table `.create` called.<br>**Fails now:** no `assertNotLocked` in `completeTask`                                                                                                                                                               |

### `failTask()`

| #      | Test                               | Assertion                                                                                                                                                      |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S15    | refunds what was charged           | task previously `RUNNING`, platform `INSTAGRAM` → `refund` called with amount `10`; `WEB_SEARCH` → `5`                                                         |
| S16 🔴 | never-charged task is not refunded | task status `PENDING` (never started) → `refund` called 0 times.<br>**Fails now:** `failTask` refunds unconditionally, minting credits for work never paid for |
| S17    | records the error                  | update arg `status: 'FAILED'`, `errorCode`, `errorMessage` all present; `osintSession.update` `{ failedTasks: { increment: 1 } }`                              |

### `checkSessionCompletion()` — table-driven, one case per row

| #      | Task statuses                      | Expected session status                                                                                                              |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| S18    | all `FOUND`                        | `COMPLETED`                                                                                                                          |
| S19 🔴 | all `NOT_FOUND`                    | `COMPLETED` — **fails now**, current code yields `FAILED`. A target genuinely having no TikTok is a successful scrape, not a failure |
| S20 🔴 | `FOUND` + `NOT_FOUND`              | `COMPLETED` — **fails now**, current code yields `PARTIAL`                                                                           |
| S21    | `FOUND` + `FAILED`                 | `PARTIAL`                                                                                                                            |
| S22    | all `FAILED`                       | `FAILED`                                                                                                                             |
| S23 🔴 | `NOT_FOUND` + `FAILED`, no `FOUND` | `PARTIAL` — **fails now**, current code yields `FAILED`                                                                              |
| S24    | all `SKIPPED`                      | `COMPLETED` (skipped excluded from classification)                                                                                   |
| S25    | any `PENDING` or `RUNNING` present | `osintSession.update` **not called** — no premature completion                                                                       |

### `close()` and ownership

| #      | Test                            | Assertion                                                                                                                                                                                              |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S26    | close locks                     | update arg `status: 'CLOSED'`, `closedAt` and `lockedAt` both `Date`                                                                                                                                   |
| S27    | double-close rejects            | already-locked → `SessionLockedError`                                                                                                                                                                  |
| S28    | reads are agent-scoped          | `get()` with a different `agentId` → `NotFoundError`, and the `findFirst` where-clause includes that `agentId`                                                                                         |
| S29 🔴 | task mutations are agent-scoped | `startTask` / `completeTask` / `failTask` called with a non-owning `agentId` → `NotFoundError`.<br>**Fails now:** these three take no `agentId` parameter at all. Fixing this changes their signatures |

---

## `tests/reports/service.test.ts`

| #   | Test                                | Assertion                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | MD header content                   | output contains session `query`, `id`, and `status`                                                                                                                                                                                                                                                        |
| R2  | target profile block conditional    | present when `targetProfile` set; the string `## Target Profile` absent when null                                                                                                                                                                                                                          |
| R3  | one section per summarized task     | tasks `[WEB_SEARCH(summary), INSTAGRAM(no summary)]` → contains `## WEB_SEARCH`, does not contain `## INSTAGRAM`                                                                                                                                                                                           |
| R4  | CSV headers are session-independent | render two sessions with different task sets; assert line 1 of each is byte-identical, and equals the 6 base columns + 9 `<PLATFORM>_summary` columns                                                                                                                                                      |
| R5  | CSV escaping, table-driven          | `a,b` → wrapped in quotes; `he said "hi"` → quotes doubled _and_ wrapped; `line1\nline2` → wrapped; `plain` → **not** wrapped (catches over-quoting)                                                                                                                                                       |
| R6  | CSV round-trips                     | Parse the rendered output with a real CSV parser. Assert row count is 2 and the data row's field count equals the header field count, using a `summaryText` containing a comma, a quote, and a newline. **This is the assertion that cannot be faked** — a broken escaper produces a different field count |
| R7  | cache hit skips regeneration        | existing report with `content` → `report.upsert` not called, cached row returned                                                                                                                                                                                                                           |
| R8  | cache miss generates                | no existing row → `upsert` called once with non-empty `content`                                                                                                                                                                                                                                            |
| R9  | checksum is real                    | compute `sha256` of the returned `content` independently in the test; assert equality with the stored `checksum`                                                                                                                                                                                           |
| R10 | agent-scoped                        | non-owning `agentId` → `NotFoundError`                                                                                                                                                                                                                                                                     |

---

## `tests/integration/ledger.test.ts` — real Postgres

Gated on `TEST_DATABASE_URL`; skipped when unset. Mocks cannot prove any of these.

| #   | Test                                      | Assertion                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | concurrent spend does not oversell        | balance 10; fire two `spend(…, 10)` in parallel via `Promise.allSettled` → exactly one fulfilled, one rejected with `InsufficientCreditsError`; final `creditBalance` is `0`, and exactly one `CreditTransaction` row exists. Proves `FOR UPDATE` actually serializes |
| I2  | ledger invariant holds                    | run a mixed sequence (grant 100, spend 10, spend 5, refund 10, grant 20) → `SUM(CreditTransaction.amount) === User.creditBalance`                                                                                                                                     |
| I3  | `balanceAfter` tracks the running sum     | ordered by `createdAt`, each row's `balanceAfter` equals the cumulative sum of `amount` up to and including it                                                                                                                                                        |
| I4  | failed transaction rolls back both writes | force a throw after `user.update` inside the transaction → `creditBalance` unchanged **and** no new ledger row                                                                                                                                                        |

---

## Fixes (apply only after the matching 🔴 test is confirmed failing)

| Bug                         | Location                                            | Fix                                                                                     | Turns green                                   |
| --------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| Credit direction inverted   | `sessions/service.ts:147`                           | Delete the `refund` call from `completeTask` entirely                                   | S11                                           |
| Charge point missing        | `sessions/service.ts` `startTask`                   | Call `creditsService.spend` inside a `$transaction`; guard against non-`PENDING` status | S6, S7, S9                                    |
| Refund without charge       | `sessions/service.ts` `failTask`                    | Refund only when the task was `RUNNING` (i.e. previously charged)                       | S16                                           |
| Lock not enforced on writes | `startTask`, `completeTask`, `failTask`, `skipTask` | Load the session, call `assertNotLocked`                                                | S8, S14                                       |
| No ownership check          | same four methods                                   | Add an `agentId` parameter; scope the task lookup through its session                   | S29                                           |
| Completion misclassified    | `checkSessionCompletion`                            | Treat `NOT_FOUND` as success; `FAILED` only when every non-skipped task failed          | S19, S20, S23                                 |
| `creditsSpent` inflated     | `credits/service.ts` `refund`                       | Decrement `osintSession.creditsSpent`                                                   | C11                                           |
| Dangling FK                 | `schema.prisma:326`                                 | Add `task SessionTask? @relation(fields:[taskId], references:[id])`; new migration      | — (schema-level; verify via `migrate status`) |

---

## Files

| Path                                            | Change                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/api/tests/credits/service.test.ts`        | new — C1–C13                                                                    |
| `apps/api/tests/sessions/service.test.ts`       | new — S1–S29                                                                    |
| `apps/api/tests/reports/service.test.ts`        | new — R1–R10                                                                    |
| `apps/api/tests/integration/ledger.test.ts`     | new — I1–I4, gated on `TEST_DATABASE_URL`                                       |
| `apps/api/src/modules/sessions/service.ts`      | credit direction, charge point, lock guards, `agentId` params, completion logic |
| `apps/api/src/modules/credits/service.ts`       | `creditsSpent` decrement in `refund`                                            |
| `apps/api/prisma/schema.prisma` + new migration | `CreditTransaction.taskId` relation                                             |

Reuse: `tests/users/service.test.ts` mock-module setup verbatim; `src/errors.ts`
(`InsufficientCreditsError`, `SessionLockedError`, `ConflictError`, `NotFoundError`).

## Verification

1. **Red pass** — write all tests, run `bun test` before touching `src/`. Every 🔴 test
   fails with its documented failure; every unmarked test passes. Capture the output.
   Any 🔴 that passes here means the test is wrong — fix the test, not the code.
2. **Green pass** — apply the fixes table in order, `bun test` → all green.
3. **Mutation check** — apply R10's three mutations one at a time; each must break ≥1 test;
   revert each.
4. **Integration** — `docker compose up -d postgres`, create the test database, run with
   `TEST_DATABASE_URL` set → I1–I4 pass. Confirm they skip cleanly when it is unset.
5. `bunx tsc --noEmit` clean across `src/` (pre-existing `tests/middleware/*` `'body' is of
type 'unknown'` errors are out of scope).
6. Existing 85 tests still pass.
