import { Platform, TaskStatus } from '../../../generated/prisma/client';
import { ConflictError, NotFoundError, SessionLockedError } from '../../errors';
import { prisma } from '../../lib/prisma';
import { creditsService } from '../credits/service';

// Type for Prisma transaction client (subset of PrismaClient)
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Credit cost per platform type
const CREDIT_COSTS: Record<Platform, number> = {
  WEB_SEARCH: 5,
  INSTAGRAM: 10,
  LINKEDIN: 10,
  GITHUB: 10,
  TWITCH: 10,
  YOUTUBE: 10,
  TIKTOK: 10,
  PINTEREST: 10,
  LINKTREE: 10,
};

// Session service — CRUD and lifecycle management for OSINT sessions
export const sessionsService = {
  // Create a new session in DISAMBIGUATION status — scrapes cannot run yet
  async create(
    agentId: number,
    data: { query: string; queryContext?: string; platforms: Platform[] }
  ) {
    return prisma.osintSession.create({
      data: {
        agentId,
        query: data.query.trim(),
        queryContext: data.queryContext?.trim() ?? null,
        platforms: data.platforms,
      },
      include: { candidates: true },
    });
  },

  // Get a single session by ID — verifies the agent owns it
  async get(sessionId: string, agentId: number) {
    const session = await prisma.osintSession.findFirst({
      where: { id: sessionId, agentId },
      include: {
        candidates: { orderBy: { rank: 'asc' } },
        tasks: { orderBy: { queuedAt: 'asc' } },
        targetProfile: true,
      },
    });
    if (!session) throw new NotFoundError('Session not found');
    return session;
  },

  // List all sessions for an agent with pagination
  async list(agentId: number, { page = 1, limit = 20 }: { page: number; limit: number }) {
    const [items, total] = await prisma.$transaction([
      prisma.osintSession.findMany({
        where: { agentId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          query: true,
          status: true,
          platforms: true,
          totalTasks: true,
          completedTasks: true,
          failedTasks: true,
          creditsSpent: true,
          createdAt: true,
          closedAt: true,
        },
      }),
      prisma.osintSession.count({ where: { agentId } }),
    ]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  },

  // Select a candidate — transitions session from DISAMBIGUATION to ENRICHING
  // Also enqueues task rows for all requested platforms
  async selectCandidate(sessionId: string, candidateId: string, agentId: number) {
    const session = await this.get(sessionId, agentId);
    this.assertNotLocked(session);

    if (session.status !== 'DISAMBIGUATION') {
      throw new ConflictError('Session is not in DISAMBIGUATION status');
    }

    const candidate = session.candidates.find((c) => c.id === candidateId);
    if (!candidate) throw new NotFoundError('Candidate not found in this session');

    return prisma.$transaction(async (tx) => {
      // Mark the selected candidate
      await tx.candidate.update({
        where: { id: candidateId },
        data: { selected: true },
      });

      // Create task rows for each requested platform
      const taskData = session.platforms.map((platform) => ({
        sessionId,
        platform,
        status: 'PENDING' as TaskStatus,
      }));
      await tx.sessionTask.createMany({ data: taskData });

      // Transition session to ENRICHING and set task count
      return tx.osintSession.update({
        where: { id: sessionId },
        data: {
          status: 'ENRICHING',
          selectedCandidateId: candidateId,
          totalTasks: session.platforms.length,
        },
      });
    });
  },

  // Create a task row for a single platform (used when adding tasks dynamically)
  async createTask(sessionId: string, platform: Platform, agentId: number) {
    const session = await this.get(sessionId, agentId);
    this.assertNotLocked(session);

    if (session.status !== 'ENRICHING') {
      throw new ConflictError('Session must be in ENRICHING status to create tasks');
    }

    // Check for duplicate platform
    const existing = await prisma.sessionTask.findUnique({
      where: { sessionId_platform: { sessionId, platform } },
    });
    if (existing) throw new ConflictError(`Task for ${platform} already exists`);

    return prisma.sessionTask.create({
      data: { sessionId, platform },
    });
  },

  // Mark a task as RUNNING — records start time and charges credits
  // Credits are charged upfront; refunded only on failure
  async startTask(taskId: string, agentId: number) {
    const task = await prisma.sessionTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task not found');

    const session = await prisma.osintSession.findUnique({ where: { id: task.sessionId } });
    if (!session) throw new NotFoundError('Session not found');
    if (session.agentId !== agentId) throw new NotFoundError('Task does not belong to this agent');
    this.assertNotLocked(session);
    if (task.status !== 'PENDING') {
      throw new ConflictError('Task can only be started from PENDING status');
    }

    return prisma.$transaction(async (tx) => {
      // Charge credits upfront for this platform scrape
      const creditCost = CREDIT_COSTS[task.platform];
      const kind = task.platform === 'WEB_SEARCH' ? 'WEB_SEARCH' : 'SCRAPE';

      await creditsService.spend(tx, session.agentId, creditCost, {
        sessionId: task.sessionId,
        taskId,
        platform: task.platform,
        kind,
        reason: `${task.platform} scrape`,
      });

      // Mark task as running
      return tx.sessionTask.update({
        where: { id: taskId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
    });
  },

  // Mark a task as FOUND with result data — no credit action (already charged at start)
  async completeTask(taskId: string, agentId: number, resultData: Record<string, any>) {
    const task = await prisma.sessionTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task not found');

    const session = await prisma.osintSession.findUnique({ where: { id: task.sessionId } });
    if (!session) throw new NotFoundError('Session not found');
    if (session.agentId !== agentId) throw new NotFoundError('Task does not belong to this agent');
    this.assertNotLocked(session);

    return prisma.$transaction(async (tx) => {
      // Write the platform-specific result
      await this.writeResult(tx, task.id, task.platform, resultData);

      // Update task status
      const updatedTask = await tx.sessionTask.update({
        where: { id: taskId },
        data: { status: 'FOUND', finishedAt: new Date() },
      });

      // Increment completedTasks counter
      await tx.osintSession.update({
        where: { id: task.sessionId },
        data: { completedTasks: { increment: 1 } },
      });

      // Check if all tasks are done
      await this.checkSessionCompletion(tx, task.sessionId);

      return updatedTask;
    });
  },

  // Mark a task as FAILED — records error and refunds credits only if it was charged
  async failTask(taskId: string, agentId: number, errorCode: string, errorMessage: string) {
    const task = await prisma.sessionTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task not found');

    const session = await prisma.osintSession.findUnique({ where: { id: task.sessionId } });
    if (!session) throw new NotFoundError('Session not found');
    if (session.agentId !== agentId) throw new NotFoundError('Task does not belong to this agent');
    this.assertNotLocked(session);

    return prisma.$transaction(async (tx) => {
      // Refund credits only for a task that was previously charged (RUNNING)
      if (task.status === 'RUNNING') {
        const creditCost = CREDIT_COSTS[task.platform];
        await creditsService.refund(tx, session.agentId, creditCost, {
          sessionId: task.sessionId,
          taskId,
          platform: task.platform,
          reason: `Refund for failed ${task.platform} task: ${errorMessage}`,
        });
      }

      // Update task with error info
      const updatedTask = await tx.sessionTask.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          errorCode,
          errorMessage,
          finishedAt: new Date(),
        },
      });

      // Increment failedTasks counter
      await tx.osintSession.update({
        where: { id: task.sessionId },
        data: { failedTasks: { increment: 1 } },
      });

      // Check if all tasks are done
      await this.checkSessionCompletion(tx, task.sessionId);

      return updatedTask;
    });
  },

  // Mark a task as NOT_FOUND — legitimate outcome (person has no profile on this platform)
  // No credit action — charges were already made at startTask
  async notFoundTask(taskId: string, agentId: number, reason: string) {
    const task = await prisma.sessionTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task not found');

    const session = await prisma.osintSession.findUnique({ where: { id: task.sessionId } });
    if (!session) throw new NotFoundError('Session not found');
    if (session.agentId !== agentId) throw new NotFoundError('Task does not belong to this agent');
    this.assertNotLocked(session);

    return prisma.$transaction(async (tx) => {
      const updatedTask = await tx.sessionTask.update({
        where: { id: taskId },
        data: { status: 'NOT_FOUND', errorMessage: reason, finishedAt: new Date() },
      });

      // Check if all tasks are done
      await this.checkSessionCompletion(tx, updatedTask.sessionId);

      return updatedTask;
    });
  },

  // Mark a task as SKIPPED — platform unavailable, refund credits
  async skipTask(taskId: string, agentId: number, reason: string) {
    const task = await prisma.sessionTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task not found');

    const session = await prisma.osintSession.findUnique({ where: { id: task.sessionId } });
    if (!session) throw new NotFoundError('Session not found');
    if (session.agentId !== agentId) throw new NotFoundError('Task does not belong to this agent');
    this.assertNotLocked(session);

    return prisma.$transaction(async (tx) => {
      // Refund credits for skipped task (was charged at startTask)
      const creditCost = CREDIT_COSTS[task.platform];
      await creditsService.refund(tx, session.agentId, creditCost, {
        sessionId: task.sessionId,
        taskId,
        platform: task.platform,
        reason: `Refund for skipped ${task.platform} task: ${reason}`,
      });

      const updatedTask = await tx.sessionTask.update({
        where: { id: taskId },
        data: { status: 'SKIPPED', errorMessage: reason, finishedAt: new Date() },
      });

      // Check if all tasks are done
      await this.checkSessionCompletion(tx, updatedTask.sessionId);

      return updatedTask;
    });
  },

  // Write platform-specific result to the appropriate table
  async writeResult(
    tx: TransactionClient,
    taskId: string,
    platform: Platform,
    data: Record<string, any>
  ) {
    const baseData = { taskId, summaryText: data.summaryText ?? null, raw: data.raw ?? null };

    switch (platform) {
      case 'WEB_SEARCH':
        return tx.webSearchResult.create({
          data: {
            ...baseData,
            query: data.query ?? '',
            engine: data.engine ?? null,
            totalResults: data.totalResults ?? null,
            results: data.results ?? [],
            discoveredHandles: data.discoveredHandles ?? null,
          },
        });
      case 'INSTAGRAM':
        return tx.instagramResult.create({
          data: {
            ...baseData,
            username: data.username ?? '',
            fullName: data.fullName ?? null,
            biography: data.biography ?? null,
            followers: data.followers ?? null,
            following: data.following ?? null,
            postCount: data.postCount ?? null,
            isPrivate: data.isPrivate ?? false,
            isVerified: data.isVerified ?? false,
            avatarUrl: data.avatarUrl ?? null,
            externalUrl: data.externalUrl ?? null,
            extractedEmails: data.extractedEmails ?? [],
            extractedPhones: data.extractedPhones ?? [],
          },
        });
      case 'LINKEDIN':
        return tx.linkedInResult.create({
          data: {
            ...baseData,
            publicId: data.publicId ?? '',
            fullName: data.fullName ?? null,
            headline: data.headline ?? null,
            currentCompany: data.currentCompany ?? null,
            currentTitle: data.currentTitle ?? null,
            location: data.location ?? null,
            about: data.about ?? null,
            experience: data.experience ?? null,
            education: data.education ?? null,
            skills: data.skills ?? [],
            connections: data.connections ?? null,
            avatarUrl: data.avatarUrl ?? null,
          },
        });
      default:
        // GITHUB, TWITCH, YOUTUBE, TIKTOK, PINTEREST, LINKTREE
        return tx.socialProfileResult.create({
          data: {
            ...baseData,
            platform,
            username: data.username ?? '',
            displayName: data.displayName ?? null,
            bio: data.bio ?? null,
            followers: data.followers ?? null,
            following: data.following ?? null,
            itemCount: data.itemCount ?? null,
            avatarUrl: data.avatarUrl ?? null,
            profileUrl: data.profileUrl ?? null,
            socials: data.socials ?? null,
          },
        });
    }
  },

  // Check if all tasks in a session are done and update status accordingly
  // NOT_FOUND is success (person doesn't have that platform)
  // SKIPPED counts as done (platform unavailable, credits refunded)
  async checkSessionCompletion(tx: TransactionClient, sessionId: string) {
    const tasks = await tx.sessionTask.findMany({ where: { sessionId } });
    const allDone = tasks.every((t: any) =>
      ['FOUND', 'NOT_FOUND', 'FAILED', 'SKIPPED'].includes(t.status)
    );
    if (!allDone) return;

    const failedCount = tasks.filter((t: any) => t.status === 'FAILED').length;
    const foundCount = tasks.filter((t: any) => t.status === 'FOUND').length;
    const notFoundCount = tasks.filter((t: any) => t.status === 'NOT_FOUND').length;
    const skippedCount = tasks.filter((t: any) => t.status === 'SKIPPED').length;

    // Only FAILED is a failure. NOT_FOUND and SKIPPED are legitimate outcomes.
    // COMPLETED = no failures. PARTIAL = some succeeded, some failed. FAILED = all failed.
    let finalStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED';
    if (failedCount === 0) {
      finalStatus = 'COMPLETED';
    } else if (foundCount > 0 || notFoundCount > 0) {
      finalStatus = 'PARTIAL';
    } else {
      finalStatus = 'FAILED';
    }

    await tx.osintSession.update({
      where: { id: sessionId },
      data: { status: finalStatus },
    });
  },

  // Close a session — locks it permanently, no further writes allowed
  async close(sessionId: string, agentId: number) {
    const session = await this.get(sessionId, agentId);
    this.assertNotLocked(session);

    return prisma.osintSession.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        lockedAt: new Date(),
      },
    });
  },

  // Helper: throw if session is already locked
  assertNotLocked(session: { lockedAt: Date | null }) {
    if (session.lockedAt) {
      throw new SessionLockedError('Cannot modify a locked session');
    }
  },
};
