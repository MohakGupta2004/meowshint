# API

Production-grade Express 5 API on Bun, with Prisma (PostgreSQL) and Redis.

## Stack

- **Runtime:** Bun · **Framework:** Express 5 · **Language:** TypeScript
- **Database:** PostgreSQL via Prisma 7 (pg driver adapter)
- **Cache/Store:** Redis (ioredis)
- **Validation:** Zod · **Logging:** Pino · **Security:** Helmet, CORS, rate limiting

## Getting started

```bash
bun install
cp .env.example .env   # fill in DATABASE_URL and REDIS_URL
bun run db:generate    # generate the Prisma client
bun run db:migrate     # apply migrations
bun run dev            # start with hot reload
```

## Scripts

| Script                | Description                   |
| --------------------- | ----------------------------- |
| `bun run dev`         | Start with file watching      |
| `bun run start`       | Start in production mode      |
| `bun run check-types` | Type-check with `tsc`         |
| `bun run db:migrate`  | Create/apply a dev migration  |
| `bun run db:deploy`   | Apply migrations (production) |
| `bun run db:studio`   | Open Prisma Studio            |

## Project structure

```
src/
  config/env.ts        Environment loading & validation (Zod)
  lib/                 Shared: prisma, redis, logger, http helpers
  middleware/          validate (Zod), error (404 + error handler)
  modules/
    health/routes.ts   Liveness & readiness probes
    users/             Reference resource: schema, service, routes
  errors.ts            AppError base + typed HTTP errors
  app.ts               Express app factory (no side effects — testable)
  server.ts            Bootstrap: connect deps, listen, graceful shutdown
index.ts               Entrypoint
```

Each module is a thin flow: **routes** (wiring + Zod validation) → **service**
(business rules, talks to Prisma directly).

## Endpoints

| Method | Path                | Description                  |
| ------ | ------------------- | ---------------------------- |
| GET    | `/api/health`       | Liveness (process up)        |
| GET    | `/api/health/ready` | Readiness (Postgres + Redis) |
| GET    | `/api/users`        | List users (paginated)       |
| POST   | `/api/users`        | Create user                  |
| GET    | `/api/users/:id`    | Get user by id               |
| PATCH  | `/api/users/:id`    | Update user                  |
| DELETE | `/api/users/:id`    | Delete user                  |

### Response envelope

```jsonc
// success
{ "success": true, "data": { /* ... */ }, "meta": { /* optional */ } }
// error
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." }, "requestId": "..." }
```

## Docker

```bash
docker compose up --build
```

Runs `prisma migrate deploy` then boots the server; includes an `/api/health` healthcheck.
