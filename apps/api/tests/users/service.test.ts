import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mock } from 'bun:test';

import { prisma } from '../../src/lib/prisma';
import { usersService } from '../../src/modules/users/service';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';

mock.module('../../src/lib/prisma', () => {
  const prismaMock = {
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
    $transaction: mock(),
  };

  return {
    prisma: prismaMock,
    connectDatabase: mock(),
    disconnectDatabase: mock(),
  };
});

describe('usersService', () => {
  const mockUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    role: 'USER',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    (prisma.user.findMany as any).mockClear();
    (prisma.user.count as any).mockClear();
    (prisma.user.findUnique as any).mockClear();
    (prisma.user.create as any).mockClear();
    (prisma.user.update as any).mockClear();
    (prisma.user.delete as any).mockClear();
    (prisma.$transaction as any).mockClear();
  });

  describe('list', () => {
    it('should return paginated users with correct totalPages', async () => {
      const users = [
        { ...mockUser, id: 1 },
        { ...mockUser, id: 2 },
      ];
      (prisma.$transaction as any).mockResolvedValue([users, 25]);

      const result = await usersService.list({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should handle empty results', async () => {
      (prisma.$transaction as any).mockResolvedValue([[], 0]);

      const result = await usersService.list({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should calculate totalPages correctly with exact division', async () => {
      (prisma.$transaction as any).mockResolvedValue([[], 20]);

      const result = await usersService.list({ page: 1, limit: 10 });

      expect(result.totalPages).toBe(2);
    });

    it('should calculate totalPages correctly with remainder', async () => {
      (prisma.$transaction as any).mockResolvedValue([[], 21]);

      const result = await usersService.list({ page: 1, limit: 10 });

      expect(result.totalPages).toBe(3);
    });

    it('should use $transaction for atomic count and find', async () => {
      (prisma.$transaction as any).mockResolvedValue([[], 0]);

      await usersService.list({ page: 1, limit: 10 });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('get', () => {
    it('should return user by id', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      const result = await usersService.get(1);

      expect(result.id).toBe(1);
      expect(result.email).toBe('test@example.com');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: expect.objectContaining({
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        }),
      });
    });

    it('should throw NotFoundError if user does not exist', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      expect(async () => {
        await usersService.get(999);
      }).toThrow('User not found');
    });
  });

  describe('create', () => {
    it('should create user with hashed password', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      const createdUser = { ...mockUser, email: 'new@example.com', name: 'New User' };
      (prisma.user.create as any).mockResolvedValue(createdUser);

      const result = await usersService.create({
        email: 'new@example.com',
        name: 'New User',
      });

      expect(result.email).toBe('new@example.com');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
          name: 'New User',
          passwordHash: expect.any(String),
        }),
        select: expect.any(Object),
      });
    });

    it('should use default temp password if none provided', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({ ...mockUser, name: null });
      const hashSpy = spyOn(Bun.password, 'hash').mockResolvedValue('hashed' as never);

      await usersService.create({
        email: 'new@example.com',
      });

      expect(hashSpy).toHaveBeenCalledWith('DefaultTempPass123!');
      hashSpy.mockRestore();
    });

    it('should normalize email to lowercase', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({ ...mockUser, name: null });

      await usersService.create({
        email: '  NEW@EXAMPLE.COM  ',
        name: 'New User',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
        }),
        select: expect.any(Object),
      });
    });

    it('should throw ConflictError if email already exists', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      expect(async () => {
        await usersService.create({
          email: 'test@example.com',
          name: 'Test User',
        });
      }).toThrow('A user with this email already exists');
    });

    it('should trim name', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({ ...mockUser });

      await usersService.create({
        email: 'new@example.com',
        name: '  New Name  ',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'New Name',
        }),
        select: expect.any(Object),
      });
    });
  });

  describe('update', () => {
    it('should update user email and name', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);
      (prisma.user.update as any).mockResolvedValue({
        ...mockUser,
        email: 'updated@example.com',
        name: 'Updated Name',
      });

      const result = await usersService.update(1, {
        email: 'updated@example.com',
        name: 'Updated Name',
      });

      expect(result.email).toBe('updated@example.com');
      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundError if user does not exist', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      expect(async () => {
        await usersService.update(999, { email: 'updated@example.com' });
      }).toThrow('User not found');
    });

    it('should normalize email to lowercase on update', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);
      (prisma.user.update as any).mockResolvedValue({ ...mockUser, email: 'updated@example.com' });

      await usersService.update(1, { email: '  UPDATED@EXAMPLE.COM  ' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          email: 'updated@example.com',
        }),
        select: expect.any(Object),
      });
    });

    it('should throw ConflictError if new email is taken by another user', async () => {
      (prisma.user.findUnique as any)
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ ...mockUser, id: 2 });

      expect(async () => {
        await usersService.update(1, { email: 'taken@example.com' });
      }).toThrow('A user with this email already exists');
    });

    it('should allow user to keep their own email', async () => {
      (prisma.user.findUnique as any)
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockUser);

      (prisma.user.update as any).mockResolvedValue({ ...mockUser, email: 'test@example.com' });

      await usersService.update(1, { email: 'test@example.com' });

      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete user', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);
      (prisma.user.delete as any).mockResolvedValue(mockUser);

      await usersService.remove(1);

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw NotFoundError if user does not exist', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      expect(async () => {
        await usersService.remove(999);
      }).toThrow('User not found');
    });
  });

  describe('ensureEmailFree', () => {
    it('should throw ConflictError if email is taken', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      expect(async () => {
        await usersService.ensureEmailFree('test@example.com');
      }).toThrow('A user with this email already exists');
    });

    it('should not throw if email is free', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await expect(usersService.ensureEmailFree('free@example.com')).resolves.toBeUndefined();
    });

    it('should normalize email to lowercase before checking', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await usersService.ensureEmailFree('  FREE@EXAMPLE.COM  ');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'free@example.com' },
      });
    });

    it('should allow same user to keep their email (exceptId)', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      await expect(usersService.ensureEmailFree('test@example.com', 1)).resolves.toBeUndefined();
    });

    it('should still throw if another user has the email (exceptId)', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ ...mockUser, id: 2 });

      expect(async () => {
        await usersService.ensureEmailFree('test@example.com', 1);
      }).toThrow('A user with this email already exists');
    });
  });
});
