import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(tenantId: string) {
    const now = new Date();
    const [
      contacts,
      employees,
      upcomingEvents,
    ] = await Promise.all([
      this.prisma.contact.count({ where: { tenantId, isActive: true } }),
      this.prisma.employee.count({ where: { tenantId, status: 'active' } }),
      this.prisma.calendarEvent.count({
        where: { tenantId, startAt: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) } },
      }),
    ]);

    return {
      contacts,
      employees: { active: employees },
      core: { upcomingEvents },
      generatedAt: now.toISOString(),
    };
  }
}
