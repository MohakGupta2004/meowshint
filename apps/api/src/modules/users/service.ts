import { ConflictError, NotFoundError } from '../../errors';
import { prisma } from '../../lib/prisma';

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

export const usersService = {
  async list({ page, limit }: { page: number; limit: number }) {
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' },
        select: userSelect,
      }),
      prisma.user.count(),
    ]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  },

  async get(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundError('User not found');
    return user;
  },

  async create(data: { email: string; name?: string; password?: string }) {
    await this.ensureEmailFree(data.email);
    const passwordHash = await Bun.password.hash(data.password ?? 'DefaultTempPass123!');

    return prisma.user.create({
      data: {
        email: data.email.trim().toLowerCase(),
        name: data.name?.trim() ?? null,
        passwordHash,
      },
      select: userSelect,
    });
  },

  async update(id: number, data: { email?: string; name?: string | null }) {
    await this.get(id);
    if (data.email) await this.ensureEmailFree(data.email, id);
    return prisma.user.update({
      where: { id },
      data: {
        ...(data.email && { email: data.email.trim().toLowerCase() }),
        ...(data.name !== undefined && { name: data.name?.trim() ?? null }),
      },
      select: userSelect,
    });
  },

  async remove(id: number) {
    await this.get(id);
    await prisma.user.delete({ where: { id } });
  },

  async ensureEmailFree(email: string, exceptId?: number) {
    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictError('A user with this email already exists');
    }
  },
};
