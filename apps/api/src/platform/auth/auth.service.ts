import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

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
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user?.isActive) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }

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
    const user = await this.registerUser({
      email: dto.email,
      name: dto.name,
      password: dto.password,
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

  async registerUser(data: { email: string; name: string; password: string }) {
    const email = data.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: data.name,
      },
    });
  }

  async refresh(dto: RefreshDto) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('توکن بازنشانی نامعتبر است');
    }

    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('توکن بازنشانی منقضی شده است');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const tokens = await this.issueTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role,
    );

    return {
      user: {
        id: stored.user.id,
        email: stored.user.email,
        name: stored.user.name,
        role: stored.user.role,
        avatarUrl: stored.user.avatarUrl,
      },
      ...tokens,
    };
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
      isActive: user.isActive,
      createdAt: user.createdAt,
      tenants: user.tenantMembers.map((m: { tenant: { id: string; name: string; slug: string; plan: string; locale: string }; role: string; joinedAt: Date }) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        plan: m.tenant.plan,
        locale: m.tenant.locale,
        memberRole: m.role,
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
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { success: true, message: 'رمز عبور با موفقیت تغییر کرد' };
  }

  async setPassword(userId: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessExpires = this.config.get<string>('JWT_ACCESS_EXPIRES', '15m');
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES', '7d');

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessExpires as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    const refreshToken = randomUUID();
    const refreshExpiresAt = this.parseDuration(refreshExpires);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpires,
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
}
