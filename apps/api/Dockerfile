# ---------------------------------------------------
# Stage 1: Install ALL dependencies (including devDeps like Prisma)
# ---------------------------------------------------
FROM oven/bun:1-slim AS deps
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# ---------------------------------------------------
# Stage 2: Generate Prisma Client
# ---------------------------------------------------
FROM oven/bun:1-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma Client (outputs to ./generated/prisma).
RUN ./node_modules/.bin/prisma generate

# ---------------------------------------------------
# Stage 3: Production Runner
# ---------------------------------------------------
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy the built app and its dependencies (incl. generated Prisma Client).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/index.ts ./index.ts
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Overridden by docker-compose to run migrations first.
CMD ["bun", "run", "index.ts"]
