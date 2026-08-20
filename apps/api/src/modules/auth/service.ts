import jwt from 'jsonwebtoken';

import { env } from '../../config/env';
import { BadRequestError, ConflictError, UnauthorizedError } from '../../errors';
import { prisma } from '../../lib/prisma';
import type {
  AuthResult,
  AuthUserContext,
  ChangePasswordInput,
  LoginInput,
  RefreshResult,
  RegisterInput,
  TokenPayload,
  UserResponse,
} from './types';

function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;

  const value = parseInt(match[1]!, 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const name = input.name ? input.name.trim() : null;

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await Bun.password.hash(input.password);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const accessToken = this.generateAccessToken(user.id, user.role);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      user,
      accessToken,
      refreshToken,
    };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const validPassword = await Bun.password.verify(input.password, user.passwordHash);

    if (!validPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const accessToken = this.generateAccessToken(user.id, user.role);
    const refreshToken = await this.generateRefreshToken(user.id);

    const userResponse: UserResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return {
      user: userResponse,
      accessToken,
      refreshToken,
    };
  },

  async refresh(providedToken?: string): Promise<RefreshResult> {
    if (!providedToken) {
      throw new UnauthorizedError('Refresh token is required');
    }

    try {
      this.verifyRefreshToken(providedToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: providedToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const newRefreshToken = await this.generateRefreshToken(storedToken.userId);

    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        revokedAt: new Date(),
        replacedByToken: newRefreshToken,
      },
    });

    const accessToken = this.generateAccessToken(storedToken.user.id, storedToken.user.role);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  },

  async logout(providedToken?: string, userId?: number): Promise<void> {
    if (providedToken) {
      await prisma.refreshToken.updateMany({
        where: { token: providedToken, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else if (userId) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  },

  async getMe(userId: number): Promise<UserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return user;
  },

  async changePassword(userId: number, input: ChangePasswordInput): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const validPassword = await Bun.password.verify(input.currentPassword, user.passwordHash);

    if (!validPassword) {
      throw new BadRequestError('Current password is incorrect');
    }

    const newPasswordHash = await Bun.password.hash(input.newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Password changed successfully' };
  },

  generateAccessToken(userId: number, role = 'USER'): string {
    const options: jwt.SignOptions = {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
      issuer: 'boilerplate-api',
    };

    return jwt.sign(
      {
        sub: String(userId),
        role,
        type: 'access',
      },
      env.JWT_ACCESS_SECRET,
      options
    );
  },

  async generateRefreshToken(userId: number): Promise<string> {
    const expiresMs = parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + expiresMs);

    const options: jwt.SignOptions = {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
      issuer: 'boilerplate-api',
    };

    const token = jwt.sign(
      {
        sub: String(userId),
        type: 'refresh',
      },
      env.JWT_REFRESH_SECRET,
      options
    );

    await prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });

    return token;
  },

  verifyAccessToken(token: string): AuthUserContext {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'boilerplate-api',
    }) as unknown as TokenPayload;

    if (!payload.sub || payload.type !== 'access') {
      throw new UnauthorizedError('Invalid access token');
    }

    return {
      userId: Number(payload.sub),
      role: payload.role ?? 'USER',
    };
  },

  verifyRefreshToken(token: string): TokenPayload {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: 'boilerplate-api',
    }) as unknown as TokenPayload;

    if (!payload.sub || payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid refresh token');
    }

    return payload;
  },
};
