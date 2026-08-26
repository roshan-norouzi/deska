import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user?.isActive) return null;

    let permissions: string[] = [];
    if (user.role === 'super_admin') {
      permissions = ['*'];
    } else {
      const roleDefs = await this.prisma.roleDefinition.findMany({
        where: { tenant: { members: { some: { userId: user.id } } } },
        include: { permissions: true },
      });
      permissions = [...new Set(roleDefs.flatMap((r) => r.permissions.map((p) => p.permission)))];
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: user.role === 'super_admin' ? ['*'] : permissions,
    };
  }
}
