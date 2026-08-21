import { createHash } from 'crypto';

import { Platform } from '../../../generated/prisma/client';
import { NotFoundError } from '../../errors';
import { prisma } from '../../lib/prisma';

// Fixed set of platform columns for consistent CSV headers across all sessions
const PLATFORM_COLUMNS: Platform[] = [
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

// Reports service — on-demand generation and caching
// Renders session data into MD/CSV/PDF format, caches after first generation
export const reportsService = {
  // Get or generate a report for a session in the requested format
  async getOrGenerate(sessionId: string, agentId: number, format: string) {
    // Verify the agent owns this session
    const session = await prisma.osintSession.findFirst({
      where: { id: sessionId, agentId },
      include: {
        tasks: {
          include: {
            webResult: true,
            igResult: true,
            liResult: true,
            socialResult: true,
          },
        },
        targetProfile: true,
        candidates: { where: { selected: true } },
      },
    });
    if (!session) throw new NotFoundError('Session not found');

    // Check cache first — use content, not filePath
    const existing = await prisma.report.findUnique({
      where: { sessionId_format: { sessionId, format: format as any } },
    });
    if (existing?.content) return existing;

    // Generate the report content
    const content = format === 'CSV' ? this.renderCSV(session) : this.renderMD(session);
    const checksum = createHash('sha256').update(content).digest('hex');

    // Upsert the cached report
    return prisma.report.upsert({
      where: { sessionId_format: { sessionId, format: format as any } },
      create: {
        sessionId,
        format: format as any,
        content,
        checksum,
        sizeBytes: Buffer.byteLength(content),
      },
      update: {
        content,
        checksum,
        sizeBytes: Buffer.byteLength(content),
        generatedAt: new Date(),
      },
    });
  },

  // Render session data as Markdown
  renderMD(session: any): string {
    const lines: string[] = [];
    const selected = session.candidates?.[0];

    lines.push(`# OSINT Report — ${session.query}`);
    lines.push('');
    lines.push(`**Session:** ${session.id}`);
    lines.push(`**Status:** ${session.status}`);
    lines.push(`**Created:** ${session.createdAt.toISOString()}`);
    if (selected) lines.push(`**Target:** ${selected.displayName}`);
    lines.push('');

    if (session.targetProfile) {
      const tp = session.targetProfile;
      lines.push('## Target Profile');
      lines.push(`- **Name:** ${tp.legalName}`);
      if (tp.knownAliases.length) lines.push(`- **Aliases:** ${tp.knownAliases.join(', ')}`);
      if (tp.primaryEmail) lines.push(`- **Email:** ${tp.primaryEmail}`);
      if (tp.locationLabel) lines.push(`- **Location:** ${tp.locationLabel}`);
      lines.push('');
    }

    // Render each task's summary
    for (const task of session.tasks) {
      const result = task.webResult ?? task.igResult ?? task.liResult ?? task.socialResult;
      if (result?.summaryText) {
        lines.push(`## ${task.platform}`);
        lines.push(result.summaryText);
        lines.push('');
      }
    }

    return lines.join('\n');
  },

  // Render session data as CSV with consistent headers and proper escaping
  renderCSV(session: any): string {
    const tp = session.targetProfile;
    const baseHeaders = ['sessionId', 'query', 'status', 'legalName', 'email', 'location'];
    const baseValues = [
      session.id,
      session.query,
      session.status,
      tp?.legalName ?? '',
      tp?.primaryEmail ?? '',
      tp?.locationLabel ?? '',
    ];

    // Use fixed platform columns for consistent headers across all sessions
    const platformHeaders = PLATFORM_COLUMNS.map((p) => `${p}_summary`);
    const taskMap = new Map(session.tasks.map((t: any) => [t.platform, t]));
    const platformValues = PLATFORM_COLUMNS.map((platform) => {
      const task: any = taskMap.get(platform);
      const result = task?.webResult ?? task?.igResult ?? task?.liResult ?? task?.socialResult;
      return result?.summaryText ?? '';
    });

    const headers = [...baseHeaders, ...platformHeaders];
    const values = [...baseValues, ...platformValues];

    return [headers.join(','), values.map((v) => this.escapeCSV(String(v))).join(',')].join('\n');
  },

  // Escape a CSV value: wrap in quotes if it contains comma, quote, or newline
  // Double any existing quotes
  escapeCSV(value: string): string {
    if (
      value.includes(',') ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  },
};
