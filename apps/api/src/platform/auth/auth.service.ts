import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (!user?.isActive || user.status !== 'active' || (user.lockedUntil && user.lockedUntil > now)) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.prisma.$transaction(async (tx) => {
        const failedLogin = await tx.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: { increment: 1 } },
          select: { failedLoginAttempts: true },
        });

        if (failedLogin.failedLoginAttempts >= 5) {
          await tx.user.update({
            where: { id: user.id },
            data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
          });
        }
      });
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('رمز عبور و تکرار آن یکسان نیست');
    }
    const user = await this.registerUser({
      email: dto.email,
      name: dto.name,
      password: dto.password,
      phone: dto.phone,
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async registerUser(data: { email: string; name: string; password: string; phone?: string }) {
    const email = data.email.trim().toLowerCase();
    const phone = data.phone?.trim() || undefined;

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    });
    if (existing) {
      throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    return this.prisma.user.create({
      data: {
        email,
        phone,
        passwordHash,
        name: data.name.trim(),
        status: 'active',
      },
    });
  }

  async refresh(dto: { refreshToken: string }) {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    }) ?? await this.prisma.refreshToken.findUnique({
      // Compatibility with refresh tokens issued before token hashing was enabled.
      where: { token: dto.refreshToken },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('توکن بازنشانی نامعتبر است');
    }

    const now = new Date();
    if (stored.expiresAt < now) {
      await this.prisma.refreshToken.deleteMany({ where: { id: stored.id } });
      throw new UnauthorizedException('توکن بازنشانی منقضی شده است');
    }

    if (!stored.user.isActive || stored.user.status !== 'active') {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }

    const tokenPair = this.createTokenPair(
      stored.user.id,
      stored.user.email,
      stored.user.role,
    );

    await this.prisma.$transaction(async (tx) => {
      const activeUser = await tx.user.findFirst({
        where: { id: stored.user.id, isActive: true, status: 'active' },
        select: { id: true },
      });
      if (!activeUser) {
        throw new UnauthorizedException('حساب کاربری غیرفعال است');
      }

      const consumed = await tx.refreshToken.deleteMany({
        where: { id: stored.id, expiresAt: { gte: now } },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('توکن بازنشانی نامعتبر است');
      }

      await tx.refreshToken.create({ data: tokenPair.persisted });
    });

    return {
      user: {
        id: stored.user.id,
        email: stored.user.email,
        name: stored.user.name,
        role: stored.user.role,
        avatarUrl: stored.user.avatarUrl,
      },
      ...tokenPair.response,
    };
  }

  async logout(dto: { refreshToken: string }) {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    await this.prisma.refreshToken.deleteMany({
      where: { token: { in: [tokenHash, dto.refreshToken] } },
    });
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        isActive: true,
        createdAt: true,
        tenantMembers: {
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
                locale: true,
                status: true,
                primaryOwnerUserId: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('کاربر یافت نشد');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      isActive: user.isActive,
      createdAt: user.createdAt,
      tenants: user.tenantMembers.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        plan: m.tenant.plan,
        locale: m.tenant.locale,
        status: m.tenant.status,
        primaryOwnerUserId: m.tenant.primaryOwnerUserId,
        memberRole: m.role,
        membershipStatus: m.status,
        joinedAt: m.joinedAt,
      })),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('رمز عبور فعلی نادرست است');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);

    return { success: true, message: 'رمز عبور با موفقیت تغییر کرد' };
  }

  async setPassword(userId: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const tokenPair = this.createTokenPair(userId, email, role);

    await this.prisma.refreshToken.create({
      data: tokenPair.persisted,
    });

    return tokenPair.response;
  }

  private createTokenPair(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };
    const accessExpires = this.config.get<string>('JWT_ACCESS_EXPIRES', '15m');
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES', '7d');
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessExpires as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
    const refreshToken = randomUUID();

    return {
      persisted: {
        token: this.hashRefreshToken(refreshToken),
        userId,
        expiresAt: this.parseDuration(refreshExpires),
      },
      response: { accessToken, refreshToken, expiresIn: accessExpires },
    };
  }

  private parseDuration(duration: string): Date {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }

  async logoutAll(userId: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { sessionsInvalidatedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
    return { success: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    const generic = { message: 'اگر حسابی با این ایمیل وجود داشته باشد، راهنمای بازیابی ارسال می‌شود' };
    if (!user || !user.isActive || user.status !== 'active') return generic;

    const token = randomUUID();
    const tokenHash = this.hashRefreshToken(token);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      this.prisma.passwordResetToken.create({
        data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      }),
    ]);

    // An email provider can consume this value in production. Never expose it there.
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      return { ...generic, developmentToken: token };
    }
    return generic;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const invalidTokenMessage = 'توکن بازیابی نامعتبر یا منقضی شده است';
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('رمز عبور و تکرار آن یکسان نیست');
    }
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashRefreshToken(dto.token) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
      throw new BadRequestException(invalidTokenMessage);
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const consumedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gte: consumedAt },
        },
        data: { usedAt: consumedAt },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(invalidTokenMessage);
      }

      const updatedUser = await tx.user.updateMany({
        where: { id: record.userId, isActive: true },
        data: {
          passwordHash,
          passwordChangedAt: consumedAt,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      if (updatedUser.count !== 1) {
        throw new BadRequestException(invalidTokenMessage);
      }

      await tx.refreshToken.deleteMany({ where: { userId: record.userId } });
    });
    return { success: true, message: 'رمز عبور با موفقیت بازنشانی شد' };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
