import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/metadata.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('پایگاه داده در دسترس نیست');
    }

    return {
      status: 'ok',
      version: process.env.APP_VERSION ?? '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        database: 'ok',
      },
    };
  }
}
