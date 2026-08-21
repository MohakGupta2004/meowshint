import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createHash } from 'crypto';

import { NotFoundError } from '../../src/errors';
import { prisma } from '../../src/lib/prisma';
import { reportsService } from '../../src/modules/reports/service';
import { makePrismaMock } from '../helpers/prisma-mock';

// Minimal RFC4180-compliant CSV parser — proves round-tripping without trusting escapeCSV
function parseCSV(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function makeSession(overrides: any = {}) {
  return {
    id: 'session-1',
    agentId: 1,
    query: 'John Doe',
    status: 'COMPLETED',
    createdAt: new Date('2024-01-01'),
    targetProfile: null,
    candidates: [],
    tasks: [],
    ...overrides,
  };
}

const PLATFORM_COLUMNS = [
  'WEB_SEARCH',
  'INSTAGRAM',
  'LINKEDIN',
  'GITHUB',
  'TWITCH',
  'YOUTUBE',
  'TIKTOK',
  'PINTEREST',
  'LINKTREE',
];

mock.module('../../src/lib/prisma', () => {
  const prismaMock: any = makePrismaMock();
  return { prisma: prismaMock, connectDatabase: mock(), disconnectDatabase: mock() };
});

describe('reportsService', () => {
  beforeEach(() => {
    (prisma.osintSession.findFirst as any).mockClear();
    (prisma.report.findUnique as any).mockClear();
    (prisma.report.upsert as any).mockClear();
  });

  describe('renderMD', () => {
    it('R1: MD header content', () => {
      const session = makeSession({ query: 'John Doe', id: 's1', status: 'COMPLETED' });
      const md = reportsService.renderMD(session);
      expect(md).toContain('John Doe');
      expect(md).toContain('s1');
      expect(md).toContain('COMPLETED');
    });

    it('R2: target profile block conditional', () => {
      const withProfile = makeSession({
        targetProfile: {
          legalName: 'Johnny',
          knownAliases: ['J'],
          primaryEmail: 'j@x.com',
          locationLabel: 'Berlin',
        },
      });
      expect(reportsService.renderMD(withProfile)).toContain('## Target Profile');

      const withoutProfile = makeSession({ targetProfile: null });
      expect(reportsService.renderMD(withoutProfile)).not.toContain('## Target Profile');
    });

    it('R3: one section per summarized task', () => {
      const session = makeSession({
        tasks: [
          {
            platform: 'WEB_SEARCH',
            webResult: { summaryText: 'web summary' },
            igResult: null,
            liResult: null,
            socialResult: null,
          },
          {
            platform: 'INSTAGRAM',
            webResult: null,
            igResult: null,
            liResult: null,
            socialResult: null,
          },
        ],
      });
      const md = reportsService.renderMD(session);
      expect(md).toContain('## WEB_SEARCH');
      expect(md).not.toContain('## INSTAGRAM');
    });
  });

  describe('renderCSV', () => {
    it('R4: CSV headers are session-independent', () => {
      const a = makeSession({
        id: 'a',
        tasks: [
          {
            platform: 'WEB_SEARCH',
            webResult: { summaryText: 'x' },
            igResult: null,
            liResult: null,
            socialResult: null,
          },
        ],
      });
      const b = makeSession({
        id: 'b',
        tasks: [
          {
            platform: 'INSTAGRAM',
            webResult: null,
            igResult: null,
            liResult: null,
            socialResult: { summaryText: 'y' },
          },
        ],
      });
      const ra = reportsService.renderCSV(a).split('\n')[0];
      const rb = reportsService.renderCSV(b).split('\n')[0];
      expect(ra).toBe(rb);
      const expected = [
        'sessionId',
        'query',
        'status',
        'legalName',
        'email',
        'location',
        ...PLATFORM_COLUMNS.map((p) => `${p}_summary`),
      ].join(',');
      expect(ra).toBe(expected);
    });

    it('R5: CSV escaping, table-driven', () => {
      const cases: [string, string][] = [
        ['a,b', '"a,b"'],
        ['he said "hi"', '"he said ""hi"""'],
        ['line1\nline2', '"line1\nline2"'],
        ['plain', 'plain'],
      ];
      for (const [input, expected] of cases) {
        const out = reportsService.escapeCSV(input);
        expect(out).toBe(expected);
      }
    });

    it('R6: CSV round-trips', () => {
      const summaryText = 'a,b\nhe said "hi"\nline1\nline2';
      const session = makeSession({
        targetProfile: {
          legalName: 'John, "J"',
          knownAliases: [],
          primaryEmail: 'j@x.com',
          locationLabel: 'Ber',
        },
        tasks: [
          {
            platform: 'WEB_SEARCH',
            webResult: { summaryText },
            igResult: null,
            liResult: null,
            socialResult: null,
          },
        ],
      });
      const csv = reportsService.renderCSV(session);
      const rows = parseCSV(csv);
      expect(rows.length).toBe(2);
      expect(rows[1].length).toBe(rows[0].length);
    });
  });

  describe('getOrGenerate', () => {
    it('R7: cache hit skips regeneration', async () => {
      const session = makeSession();
      const cached = {
        id: 'r1',
        sessionId: 's1',
        format: 'MD' as any,
        content: '# cached',
        checksum: 'abc',
        sizeBytes: 8,
      };
      (prisma.osintSession.findFirst as any).mockResolvedValue(session);
      (prisma.report.findUnique as any).mockResolvedValue(cached);

      const result = await reportsService.getOrGenerate('s1', 1, 'MD');
      expect(result).toBe(cached);
      expect((prisma.report.upsert as any).mock.calls.length).toBe(0);
    });

    it('R8: cache miss generates', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(makeSession());
      (prisma.report.findUnique as any).mockResolvedValue(null);
      (prisma.report.upsert as any).mockResolvedValue({});

      await reportsService.getOrGenerate('s1', 1, 'MD');
      expect((prisma.report.upsert as any).mock.calls.length).toBe(1);
      const content = (prisma.report.upsert as any).mock.calls[0][0].create.content;
      expect(content.length).toBeGreaterThan(0);
    });

    it('R9: checksum is real', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(makeSession());
      (prisma.report.findUnique as any).mockResolvedValue(null);
      (prisma.report.upsert as any).mockResolvedValue({});

      await reportsService.getOrGenerate('s1', 1, 'MD');
      const create = (prisma.report.upsert as any).mock.calls[0][0].create;
      const expected = createHash('sha256').update(create.content).digest('hex');
      expect(create.checksum).toBe(expected);
    });

    it('R10: agent-scoped', async () => {
      (prisma.osintSession.findFirst as any).mockResolvedValue(null);
      await expect(reportsService.getOrGenerate('s1', 2, 'MD')).rejects.toThrow(NotFoundError);
    });
  });
});
