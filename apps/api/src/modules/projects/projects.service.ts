import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}
  list(tenantId: string) { return this.prisma.project.findMany({ where: { tenantId }, include: { _count: { select: { tasks: true } } }, orderBy: { updatedAt: 'desc' } }); }
  create(tenantId: string, data: any) { return this.prisma.project.create({ data: { tenantId, name: data.name, description: data.description, status: data.status ?? 'active', startDate: data.startDate ? new Date(data.startDate) : undefined, dueDate: data.dueDate ? new Date(data.dueDate) : undefined } }); }
  update(tenantId: string, id: string, data: any) { return this.prisma.project.updateMany({ where: { id, tenantId }, data: { name: data.name, description: data.description, status: data.status, dueDate: data.dueDate ? new Date(data.dueDate) : undefined } }).then(() => this.prisma.project.findFirst({ where: { id, tenantId } })); }
  tasks(tenantId: string, projectId?: string) { return this.prisma.task.findMany({ where: { tenantId, ...(projectId ? { projectId } : {}) }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] }); }
  createTask(tenantId: string, data: any) { return this.prisma.task.create({ data: { tenantId, projectId: data.projectId, title: data.title, description: data.description, status: data.status ?? 'todo', priority: data.priority ?? 'normal', assigneeId: data.assigneeId, dueDate: data.dueDate ? new Date(data.dueDate) : undefined } }); }
  async updateTask(tenantId: string, id: string, data: any) { const task = await this.prisma.task.findFirst({ where: { id, tenantId } }); if (!task) throw new NotFoundException('تسک یافت نشد'); return this.prisma.task.update({ where: { id }, data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : undefined } }); }
  addChecklist(tenantId: string, taskId: string, data: any) { return this.prisma.task.findFirst({ where: { id: taskId, tenantId } }).then(async task => { if (!task) throw new NotFoundException('تسک یافت نشد'); return this.prisma.checklistItem.create({ data: { taskId, title: data.title, sortOrder: data.sortOrder ?? 0 } }); }); }
  toggleChecklist(tenantId: string, id: string, isDone: boolean) { return this.prisma.checklistItem.updateMany({ where: { id, task: { tenantId } }, data: { isDone } }); }
  listApprovals(tenantId: string, taskId: string) { return this.prisma.approvalStep.findMany({ where: { taskId, task: { tenantId } }, orderBy: { stepOrder: 'asc' } }); }
  decideApproval(tenantId: string, id: string, data: any) { return this.prisma.approvalStep.updateMany({ where: { id, task: { tenantId } }, data: { status: data.status, comment: data.comment, decidedAt: new Date() } }); }
}
