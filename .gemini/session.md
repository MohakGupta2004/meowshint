# ElysiaJS Learning Progress & Codebase Session Summary

This file tracks the concepts learned, codebase structure explored, and modifications made during our ElysiaJS sessions. Use this as a reference to resume learning or transfer context to a new session.

---

## 💡 Key ElysiaJS Concepts Learned

### 1. Schema Validation (`t` vs `Zod`)

- **Concept:** Instead of using Express validation libraries like `Zod` or `Joi`, Elysia comes with its own high-performance, compile-time validation builder named `t`.
- **Dual Validation Pattern:** The codebase uses Zod for the internal database/service layers, and Elysia's `t` builder for HTTP-level endpoint validation.
- **Type Inference:** Elysia automatically infers types from the `t.Object(...)` schema. Explicit type casting (like `as ListQuery` or `as CreateUserInput`) is redundant in route handlers.

### 2. Middleware via Lifecycle Hooks

- **Concept:** Express uses a sequential middleware chain (`(req, res, next) => {}`). Elysia uses discrete **Lifecycle Hooks** (like `onRequest`, `beforeHandle`, and `onError`) that execute at specific stages of a request.
- **Request ID Hook Example:** In [`app.ts`](file:///Users/mohakgupta/Projects/meowshint/apps/api/src/app.ts), `onRequest` generates a UUID for request tracing.

### 3. Context Injection with `.derive()`

- **Concept:** Instead of modifying the `request` object directly (e.g., `req.userId = ...` in Express), Elysia uses `.derive()`.
- **Usage:** Any object returned by a function passed to `.derive()` (like `{ userId, role }`) is dynamically typed and injected directly into the route handler's context argument.

### 4. Route Scoping with `.guard()`

- **Concept:** You can scope middleware/validation to a subset of routes using `.guard()`.
- **Usage:**
  ```typescript
  .guard(
    { beforeHandle() { ... } },
    (protectedRoute) => protectedRoute.derive(authMiddleware).get(...)
  )
  ```
  This allows mixing public endpoints (like `GET /`) and private endpoints (like `POST /` or `PATCH /:id`) within the same controller file.

### 5. Centralized Error Handling

- **Concept:** Elysia catches thrown errors globally using the `.onError()` listener. Uncaught custom errors (like `NotFoundError` or `UnauthorizedError`) are mapped directly to HTTP responses.

---

## 🛠️ Codebase Modifications Made

### 1. Refactored Auth Cookies (`apps/api/src/modules/auth/`)

- **Action:** Extracted cookie-setting functions and authentication verification logic from `routes.ts` into a new `utils.ts` file to keep the route definitions clean and readable.

### 2. Secured & Cleaned User Routes (`apps/api/src/modules/users/routes.ts`)

- **Action:** Imported `authMiddleware` and integrated it using `.derive()`.
- **Action:** Wrapped state-changing endpoints inside a `.guard()` block so that:
  - `GET /users` is **public** (unauthenticated).
  - `GET /users/:id`, `POST /`, `PATCH /:id`, and `DELETE /:id` are **private** and require a valid token.
- **Action:** Removed redundant type assertions (`as ListQuery`, `as CreateUserInput`, `as UpdateUserInput`) and cleaned up unused imports since Elysia automatically infers parameter types from route validation schemas.

---

## 🗄️ Database & Concurrency Concepts Learned

### 1. Database-Level Locking (Mutex) via `FOR UPDATE`

- **Concept:** When dealing with account balances or finite resources, standard read-then-write patterns (`findUnique` followed by `update`) are vulnerable to race conditions (dirty reads / lost updates) if multiple requests hit concurrently.
- **Implementation:** Using raw PostgreSQL `FOR UPDATE` locks the specific user row in the transaction, queueing subsequent credit deduction/refund requests.

### 2. Disambiguation State Machine

- **Concept:** OSINT searches first return a set of candidates (`DISAMBIGUATION` status). Scrapes are held back until the user confirms the precise candidate to prevent credit wastage and incorrect profile enrichment.

### 3. Credit Transaction Ledger

- **Concept:** Credit balances use an audit-safe ledger pattern (`CreditTransaction` model). `User.creditBalance` serves as a denormalized fast-read cache updated in sync inside transaction blocks (`$transaction`) alongside ledger writes.

### 4. Report Caching & Header Consistency

- **Concept:** Reports are generated on-demand and cached in `Report` with a `checksum` (SHA-256) to save CPU and storage.
- **CSV Header Consistency:** Using static headers (`PLATFORM_COLUMNS`) ensures the CSV structure remains predictable (no shifting columns), preventing failures in automated downstream client integrations.
