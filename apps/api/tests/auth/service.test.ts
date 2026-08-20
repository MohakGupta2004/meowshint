import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mock } from 'bun:test';

import { prisma } from '../../src/lib/prisma';
import { authService } from '../../src/modules/auth/service';

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

describe('authService', () => {
  const mockUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    role: 'USER',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockRefreshToken = {
    id: 'token-1',
    token: 'refresh-token-1',
    userId: 1,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    revokedAt: null,
    replacedByToken: '',
    user: { ...mockUser },
  };

  beforeEach(() => {
    (prisma.user.findUnique as any).mockClear();
    (prisma.user.create as any).mockClear();
    (prisma.user.update as any).mockClear();
    (prisma.user.delete as any).mockClear();
    (prisma.refreshToken.findUnique as any).mockClear();
    (prisma.refreshToken.create as any).mockClear();
    (prisma.refreshToken.update as any).mockClear();
    (prisma.refreshToken.updateMany as any).mockClear();
    (prisma.$transaction as any).mockClear();
  });

  describe('register', () => {
    it('should register a new user with normalized email and trimmed name', async () => {
      const createdUser = { ...mockUser, name: 'Test Name' };
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue(createdUser);
      (prisma.refreshToken.create as any).mockResolvedValue({
        id: 'token-1',
        token: 'refresh-token-1',
      });

      const result = await authService.register({
        email: '  Test@Example.COM  ',
        password: 'password123',
        name: '  Test Name  ',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          name: 'Test Name',
          passwordHash: expect.any(String),
        },
        select: expect.any(Object),
      });
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.name).toBe('Test Name');
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it('should register without name', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({ ...mockUser, name: null });
      (prisma.refreshToken.create as any).mockResolvedValue({
        id: 'token-1',
        token: 'refresh-token-1',
      });

      const result = await authService.register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          name: null,
        }),
        select: expect.any(Object),
      });
      expect(result.user.name).toBeNull();
    });

    it('should throw ConflictError if email already exists', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      expect(async () => {
        await authService.register({
          email: 'test@example.com',
          password: 'password123',
        });
      }).toThrow('Email already registered');
    });

    it('should hash password before creating user', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as any).mockResolvedValue({
        id: 'token-1',
        token: 'refresh-token-1',
      });

      const hashSpy = spyOn(Bun.password, 'hash').mockResolvedValue('hashed-password' as never);

      await authService.register({
        email: 'test@example.com',
        password: 'securePassword123!',
      });

      expect(hashSpy).toHaveBeenCalledWith('securePassword123!');
      hashSpy.mockRestore();
    });
  });

  describe('login', () => {
    it('should login successfully and return tokens', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ ...mockUser, passwordHash: 'hashed' });
      const verifySpy = spyOn(Bun.password, 'verify').mockResolvedValue(true);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      verifySpy.mockRestore();
    });

    it('should throw UnauthorizedError if user not found', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      expect(async () => {
        await authService.login({
          email: 'nonexistent@example.com',
          password: 'password123',
        });
      }).toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedError if password is wrong', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ ...mockUser, passwordHash: 'hashed' });
      const verifySpy = spyOn(Bun.password, 'verify').mockResolvedValue(false);

      expect(async () => {
        await authService.login({
          email: 'test@example.com',
          password: 'wrongpassword',
        });
      }).toThrow('Invalid email or password');
      verifySpy.mockRestore();
    });

    it('should normalize email to lowercase on login', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ ...mockUser, passwordHash: 'hashed' });
      const verifySpy = spyOn(Bun.password, 'verify').mockResolvedValue(true);

      await authService.login({
        email: '  TEST@EXAMPLE.COM  ',
        password: 'password123',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      verifySpy.mockRestore();
    });

    it('should verify password with Bun.password.verify', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ ...mockUser, passwordHash: 'hashed' });
      const verifySpy = spyOn(Bun.password, 'verify').mockResolvedValue(true);

      await authService.login({
        email: 'test@example.com',
        password: 'myPassword',
      });

      expect(verifySpy).toHaveBeenCalledWith('myPassword', 'hashed');
      verifySpy.mockRestore();
    });
  });

  describe('refresh', () => {
    it('should rotate refresh token successfully', async () => {
      const realToken = await authService.generateRefreshToken(1);
      const storedToken = { ...mockRefreshToken, token: realToken };
      (prisma.refreshToken.findUnique as any).mockResolvedValue(storedToken);
      (prisma.refreshToken.create as any).mockResolvedValue({
        ...mockRefreshToken,
        token: 'new-refresh-token',
      });
      (prisma.refreshToken.update as any).mockResolvedValue({
        ...mockRefreshToken,
        revokedAt: new Date(),
      });

      const result = await authService.refresh(realToken);

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(typeof result.refreshToken).toBe('string');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: mockRefreshToken.id },
        data: {
          revokedAt: expect.any(Date),
          replacedByToken: realToken,
        },
      });
    });

    it('should throw UnauthorizedError if no token provided', async () => {
      expect(async () => {
        await authService.refresh(undefined);
      }).toThrow('Refresh token is required');
    });

    it('should throw UnauthorizedError if token is invalid', async () => {
      expect(async () => {
        await authService.refresh('invalid-token');
      }).toThrow('Invalid or expired refresh token');
    });

    it('should throw UnauthorizedError if token is revoked', async () => {
      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        ...mockRefreshToken,
        revokedAt: new Date(),
      });

      expect(async () => {
        await authService.refresh('valid-token');
      }).toThrow('Invalid or expired refresh token');
    });

    it('should throw UnauthorizedError if token is expired', async () => {
      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      expect(async () => {
        await authService.refresh('expired-token');
      }).toThrow('Invalid or expired refresh token');
    });

    it('should throw UnauthorizedError if token not found in DB', async () => {
      (prisma.refreshToken.findUnique as any).mockResolvedValue(null);

      expect(async () => {
        await authService.refresh('unknown-token');
      }).toThrow('Invalid or expired refresh token');
    });
  });

  describe('logout', () => {
    it('should revoke by token', async () => {
      (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 1 });

      await authService.logout('token-1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { token: 'token-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should revoke all tokens for user', async () => {
      (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 3 });

      await authService.logout(undefined, 1);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should do nothing if no token or userId provided', async () => {
      await authService.logout();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('getMe', () => {
    it('should return user by id', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      const result = await authService.getMe(1);

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

    it('should throw UnauthorizedError if user not found', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      expect(async () => {
        await authService.getMe(999);
      }).toThrow('User not found');
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ ...mockUser, passwordHash: 'old-hash' });
      (prisma.user.update as any).mockResolvedValue(mockUser);
      (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 1 });
      const verifySpy = spyOn(Bun.password, 'verify').mockResolvedValue(true);
      const hashSpy = spyOn(Bun.password, 'hash').mockResolvedValue('new-hash' as never);

      const result = await authService.changePassword(1, {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword123!',
      });

      expect(result.message).toBe('Password changed successfully');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { passwordHash: 'new-hash' },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(verifySpy).toHaveBeenCalledWith('oldPassword', 'old-hash');
      expect(hashSpy).toHaveBeenCalledWith('newPassword123!');
      verifySpy.mockRestore();
      hashSpy.mockRestore();
    });

    it('should throw UnauthorizedError if user not found', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      expect(async () => {
        await authService.changePassword(999, {
          currentPassword: 'oldPassword',
          newPassword: 'newPassword123!',
        });
      }).toThrow('User not found');
    });

    it('should throw BadRequestError if current password is wrong', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ ...mockUser, passwordHash: 'old-hash' });
      const verifySpy = spyOn(Bun.password, 'verify').mockResolvedValue(false);

      expect(async () => {
        await authService.changePassword(1, {
          currentPassword: 'wrongPassword',
          newPassword: 'newPassword123!',
        });
      }).toThrow('Current password is incorrect');
      verifySpy.mockRestore();
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT with correct payload', () => {
      const token = authService.generateAccessToken(1, 'USER');
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('should generate JWT with custom role', () => {
      const token = authService.generateAccessToken(1, 'ADMIN');
      expect(token).toBeTruthy();
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid token and return user context', () => {
      const token = authService.generateAccessToken(1, 'USER');
      const context = authService.verifyAccessToken(token);
      expect(context.userId).toBe(1);
      expect(context.role).toBe('USER');
    });

    it('should throw UnauthorizedError for invalid token', () => {
      expect(() => {
        authService.verifyAccessToken('invalid-token');
      }).toThrow();
    });

    it('should throw UnauthorizedError for token with wrong type', async () => {
      const refreshToken = await authService.generateRefreshToken(1);
      expect(() => {
        authService.verifyAccessToken(refreshToken);
      }).toThrow();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate token and persist to DB', async () => {
      (prisma.refreshToken.create as any).mockResolvedValue({
        id: 'token-1',
        token: 'refresh-token-1',
      });

      const token = await authService.generateRefreshToken(1);

      expect(token).toBeTruthy();
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          token,
          userId: 1,
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', async () => {
      const token = await authService.generateRefreshToken(1);
      const payload = authService.verifyRefreshToken(token);
      expect(payload.sub).toBe('1');
      expect(payload.type).toBe('refresh');
    });

    it('should throw UnauthorizedError for invalid token', () => {
      expect(() => {
        authService.verifyRefreshToken('invalid-token');
      }).toThrow();
    });

    it('should throw UnauthorizedError for token with wrong type', async () => {
      const accessToken = authService.generateAccessToken(1);
      expect(() => {
        authService.verifyRefreshToken(accessToken);
      }).toThrow();
    });
  });
});
