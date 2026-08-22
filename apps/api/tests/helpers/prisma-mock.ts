import { mock } from 'bun:test';

// Shared superset mock factory for the prisma singleton — every field every
// test file needs, in one place, so mock.module('../../src/lib/prisma', ...)
// registers an identical shape everywhere. Bun's module mock registry is
// process-global; divergent partial mocks across files caused cross-file
// pollution when the whole suite ran together (only the last-registered
// mock.module call for a given path actually wins for files loaded after it).
export function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUnique: mock(),
      findMany: mock(),
      create: mock(),
      update: mock(),
      count: mock(),
      delete: mock(),
    },
    refreshToken: {
      findUnique: mock(),
      create: mock(),
      update: mock(),
      updateMany: mock(),
    },
    osintSession: {
      findUnique: mock(),
      findFirst: mock(),
      findMany: mock(),
      update: mock(),
      create: mock(),
      count: mock(),
    },
    candidate: {
      findUnique: mock(),
      findMany: mock(),
      update: mock(),
      create: mock(),
      createMany: mock(),
      deleteMany: mock(),
    },
    sessionTask: {
      findUnique: mock(),
      findUniqueOrThrow: mock(),
      findMany: mock(),
      update: mock(),
      updateMany: mock(),
      create: mock(),
      createMany: mock(),
      deleteMany: mock(),
    },
    creditTransaction: {
      create: mock(),
      count: mock(),
      findMany: mock(),
    },
    report: {
      findUnique: mock(),
      upsert: mock(),
    },
    webSearchResult: { create: mock(), upsert: mock() },
    instagramResult: { create: mock(), upsert: mock() },
    linkedInResult: { create: mock(), upsert: mock() },
    socialProfileResult: { create: mock(), upsert: mock() },
    $transaction: mock(),
    $queryRaw: mock(),
    ...overrides,
  };
}
