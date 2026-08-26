import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateApplicantDto,
  CreateDepartmentDto,
  CreateEmployeeDto,
  CreateJobOpeningDto,
  UpdateApplicantDto,
  UpdateDepartmentDto,
  UpdateEmployeeDto,
  UpdateJobOpeningDto,
} from './dto/hr.dto';

const employeeInclude = {
  department: true,
  user: { select: { id: true, name: true, email: true } },
  contact: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EmployeeInclude;

const employeeNestedInclude = {
  include: employeeInclude,
} satisfies Prisma.EmployeeDefaultArgs;

@Injectable()
export class HrService {
  constructor(private prisma: PrismaService) {}

  private async verifyContactBelongsToTenant(tenantId: string, contactId?: string) {
    if (!contactId) return;
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, tenantId }, select: { id: true } });
    if (!contact) throw new BadRequestException('مخاطب انتخاب‌شده متعلق به این سازمان نیست');
  }

  private async verifyUserBelongsToTenant(tenantId: string, userId?: string) {
    if (!userId) return;
    const member = await this.prisma.tenantMember.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
    if (!member) throw new BadRequestException('کاربر انتخاب‌شده عضو این سازمان نیست');
  }

  // --- Dashboard ---

  async getDashboardStats(tenantId: string) {
    const [employeeCount, departmentCount, openJobs, applicantCount] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId, status: 'active' } }),
      this.prisma.department.count({ where: { tenantId } }),
      this.prisma.jobOpening.count({ where: { tenantId, status: 'open' } }),
      this.prisma.applicant.count({ where: { opening: { tenantId } } }),
    ]);
    return { employeeCount, departmentCount, openJobs, applicantCount };
  }

  // --- Departments ---

  async findDepartments(tenantId: string) {
    return this.prisma.department.findMany({
      where: { tenantId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findDepartment(tenantId: string, id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, tenantId },
      include: { employees: { include: employeeInclude } },
    });
    if (!dept) throw new NotFoundException('دپارتمان یافت نشد');
    return dept;
  }

  async createDepartment(tenantId: string, data: CreateDepartmentDto) {
    if (data.parentId) await this.findDepartment(tenantId, data.parentId);
    if (data.managerId) await this.findEmployee(tenantId, data.managerId);
    return this.prisma.department.create({
      data: { ...data, tenantId },
      include: { _count: { select: { employees: true } } },
    });
  }

  async updateDepartment(tenantId: string, id: string, data: UpdateDepartmentDto) {
    await this.findDepartment(tenantId, id);
    if (data.parentId === id) throw new BadRequestException('دپارتمان نمی‌تواند والد خودش باشد');
    if (data.parentId) await this.findDepartment(tenantId, data.parentId);
    if (data.managerId) await this.findEmployee(tenantId, data.managerId);
    return this.prisma.department.update({
      where: { id },
      data,
      include: { _count: { select: { employees: true } } },
    });
  }

  async removeDepartment(tenantId: string, id: string) {
    await this.findDepartment(tenantId, id);
    return this.prisma.department.delete({ where: { id } });
  }

  // --- Employees ---

  async findEmployees(tenantId: string, status?: string) {
    return this.prisma.employee.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: employeeInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findEmployee(tenantId: string, id: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: employeeInclude,
    });
    if (!emp) throw new NotFoundException('کارمند یافت نشد');
    return emp;
  }

  async findEmployeeProfile(tenantId: string, id: string) {
    const employee = await this.findEmployee(tenantId, id);
    return { employee };
  }

  async createEmployee(tenantId: string, data: CreateEmployeeDto) {
    if (data.departmentId) await this.findDepartment(tenantId, data.departmentId);
    await this.verifyContactBelongsToTenant(tenantId, data.contactId);
    await this.verifyUserBelongsToTenant(tenantId, data.userId);
    return this.prisma.employee.create({
      data: {
        tenantId,
        employeeCode: data.employeeCode,
        userId: data.userId,
        contactId: data.contactId,
        departmentId: data.departmentId,
        jobTitle: data.jobTitle,
        hireDate: data.hireDate ? new Date(data.hireDate) : undefined,
        status: data.status,
      },
      include: employeeInclude,
    });
  }

  async updateEmployee(tenantId: string, id: string, data: UpdateEmployeeDto) {
    await this.findEmployee(tenantId, id);
    if (data.departmentId) await this.findDepartment(tenantId, data.departmentId);
    await this.verifyContactBelongsToTenant(tenantId, data.contactId);
    return this.prisma.employee.update({
      where: { id },
      data: {
        employeeCode: data.employeeCode,
        contactId: data.contactId,
        departmentId: data.departmentId,
        jobTitle: data.jobTitle,
        hireDate: data.hireDate ? new Date(data.hireDate) : undefined,
        status: data.status,
      },
      include: employeeInclude,
    });
  }

  async removeEmployee(tenantId: string, id: string) {
    await this.findEmployee(tenantId, id);
    return this.prisma.employee.delete({ where: { id } });
  }


  // --- Job Openings ---

  async findJobOpenings(tenantId: string, status?: string) {
    return this.prisma.jobOpening.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: {
        departmentRef: true,
        _count: { select: { applicants: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findJobOpening(tenantId: string, id: string) {
    const opening = await this.prisma.jobOpening.findFirst({
      where: { id, tenantId },
      include: {
        departmentRef: true,
        applicants: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!opening) throw new NotFoundException('موقعیت شغلی یافت نشد');
    return opening;
  }

  async createJobOpening(tenantId: string, data: CreateJobOpeningDto) {
    if (data.departmentId) await this.findDepartment(tenantId, data.departmentId);
    return this.prisma.jobOpening.create({
      data: {
        tenantId,
        title: data.title,
        department: data.department,
        departmentId: data.departmentId,
        description: data.description,
        status: data.status ?? 'open',
      },
      include: { departmentRef: true },
    });
  }

  async updateJobOpening(tenantId: string, id: string, data: UpdateJobOpeningDto) {
    await this.findJobOpening(tenantId, id);
    if (data.departmentId) await this.findDepartment(tenantId, data.departmentId);
    return this.prisma.jobOpening.update({
      where: { id },
      data: {
        title: data.title,
        department: data.department,
        departmentId: data.departmentId,
        description: data.description,
        status: data.status,
      },
      include: { departmentRef: true },
    });
  }

  async removeJobOpening(tenantId: string, id: string) {
    await this.findJobOpening(tenantId, id);
    return this.prisma.jobOpening.delete({ where: { id } });
  }

  // --- Applicants (tenant-scoped) ---

  private async verifyOpeningBelongsToTenant(tenantId: string, openingId: string) {
    const opening = await this.prisma.jobOpening.findFirst({
      where: { id: openingId, tenantId },
    });
    if (!opening) throw new NotFoundException('موقعیت شغلی یافت نشد');
    return opening;
  }

  private async findApplicantForTenant(tenantId: string, applicantId: string) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
      include: { opening: true },
    });
    if (!applicant || applicant.opening.tenantId !== tenantId) {
      throw new NotFoundException('متقاضی یافت نشد');
    }
    return applicant;
  }

  async findApplicants(tenantId: string, openingId: string) {
    await this.verifyOpeningBelongsToTenant(tenantId, openingId);
    return this.prisma.applicant.findMany({
      where: { openingId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApplicant(tenantId: string, openingId: string, data: CreateApplicantDto) {
    await this.verifyOpeningBelongsToTenant(tenantId, openingId);
    return this.prisma.applicant.create({
      data: {
        openingId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        resumeUrl: data.resumeUrl,
        status: data.status ?? 'new',
        notes: data.notes,
      },
    });
  }

  async updateApplicant(tenantId: string, id: string, data: UpdateApplicantDto) {
    await this.findApplicantForTenant(tenantId, id);
    return this.prisma.applicant.update({ where: { id }, data });
  }

  async removeApplicant(tenantId: string, id: string) {
    await this.findApplicantForTenant(tenantId, id);
    return this.prisma.applicant.delete({ where: { id } });
  }

  async hireApplicant(tenantId: string, applicantId: string) {
    const applicant = await this.findApplicantForTenant(tenantId, applicantId);
    const opening = applicant.opening;
    const codeSuffix = applicantId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'HIRE';
    const employee = await this.prisma.employee.create({
      data: {
        tenantId,
        employeeCode: `EMP-${codeSuffix}`,
        jobTitle: opening.title,
        departmentId: opening.departmentId ?? undefined,
        hireDate: new Date(),
        status: 'active',
      },
      include: employeeInclude,
    });
    await this.prisma.applicant.update({
      where: { id: applicantId },
      data: { status: 'hired' },
    });
    return employee;
  }

}

