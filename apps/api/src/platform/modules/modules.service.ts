import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canDisableModule,
  canEnableModule,
  getEnabledDependents,
  getModuleDependencies,
  getCoreModuleIds,
  MODULE_CATALOG,
  MODULE_DOMAIN_LABELS,
  PLATFORM_PLANS,
} from '@deska/shared';
import { compareModuleVersions, validateModuleManifest, type DeskaModuleManifest } from '@deska/module-sdk';
import { createHash } from 'crypto';
import { mkdir, rm, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { ToggleModuleDto } from './dto/toggle-module.dto';

@Injectable()
export class ModulesService {
  constructor(private prisma: PrismaService) {}

  async listInstalledModules() {
    return this.prisma.moduleDefinition.findMany({
      orderBy: [{ isCore: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        domain: true,
        version: true,
        dependencies: true,
        isCore: true,
        source: true,
        packagePath: true,
        checksum: true,
        manifest: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private parseManifest(raw: string): DeskaModuleManifest {
    try {
      return validateModuleManifest(JSON.parse(raw));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'manifest ماژول معتبر نیست');
    }
  }

  private async savePackage(manifest: DeskaModuleManifest, file: { buffer: Buffer; originalname: string }) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('فایل بسته ماژول ارسال نشده است');
    }
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('بسته ماژول باید با فرمت ZIP باشد');
    }
    if (file.buffer.length > 50 * 1024 * 1024) {
      throw new BadRequestException('حجم بسته ماژول نباید بیشتر از ۵۰ مگابایت باشد');
    }
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const relativePath = join('modules', manifest.id, manifest.version, 'package.zip');
    const absolutePath = join(process.env.STORAGE_PATH ?? join(process.cwd(), 'uploads'), relativePath);
    await mkdir(join(absolutePath, '..'), { recursive: true });
    await writeFile(absolutePath, file.buffer, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    return { relativePath, checksum };
  }

  private packageRoot(moduleId: string) {
    return join(process.env.STORAGE_PATH ?? join(process.cwd(), 'uploads'), 'modules', moduleId);
  }

  private async validateDependencies(manifest: DeskaModuleManifest) {
    const available = new Set([
      ...MODULE_CATALOG.map((module) => module.id),
      ...(await this.prisma.moduleDefinition.findMany({ select: { id: true } })).map((module) => module.id),
    ]);
    const missing = manifest.dependencies.filter((dependency) => dependency !== manifest.id && !available.has(dependency));
    if (manifest.dependencies.includes(manifest.id) || missing.length > 0) {
      throw new BadRequestException(`وابستگی‌های ناموجود یا چرخه‌ای: ${[...missing, ...(manifest.dependencies.includes(manifest.id) ? [manifest.id] : [])].join('، ')}`);
    }
  }

  async installPackage(rawManifest: string, file: { buffer: Buffer; originalname: string }) {
    const manifest = this.parseManifest(rawManifest);
    if (MODULE_CATALOG.some((module) => module.id === manifest.id)) {
      throw new BadRequestException('ماژول‌های داخلی قابل نصب مجدد نیستند');
    }
    const existing = await this.prisma.moduleDefinition.findUnique({ where: { id: manifest.id } });
    if (existing) throw new BadRequestException('این ماژول قبلاً نصب شده است؛ برای نسخه جدید از به‌روزرسانی استفاده کنید');
    await this.validateDependencies(manifest);
    const stored = await this.savePackage(manifest, file);
    return this.prisma.moduleDefinition.create({
      data: {
        id: manifest.id,
        name: manifest.name,
        domain: manifest.domain,
        version: manifest.version,
        dependencies: manifest.dependencies,
        isCore: false,
        source: 'plugin',
        packagePath: stored.relativePath,
        checksum: stored.checksum,
        manifest: manifest as object,
      },
    });
  }

  async updatePackage(moduleId: string, rawManifest: string, file: { buffer: Buffer; originalname: string }) {
    const current = await this.prisma.moduleDefinition.findUnique({ where: { id: moduleId } });
    if (!current) throw new NotFoundException('ماژول یافت نشد');
    if (current.isCore || current.source !== 'plugin') throw new ForbiddenException('ماژول داخلی قابل به‌روزرسانی بسته‌ای نیست');
    const manifest = this.parseManifest(rawManifest);
    if (manifest.id !== moduleId) throw new BadRequestException('شناسه manifest با ماژول مقصد یکسان نیست');
    if (compareModuleVersions(manifest.version, current.version) <= 0) {
      throw new BadRequestException('نسخه جدید باید از نسخه نصب‌شده بالاتر باشد');
    }
    await this.validateDependencies(manifest);
    const stored = await this.savePackage(manifest, file);
    const updated = await this.prisma.moduleDefinition.update({
      where: { id: moduleId },
      data: {
        name: manifest.name,
        domain: manifest.domain,
        version: manifest.version,
        dependencies: manifest.dependencies,
        packagePath: stored.relativePath,
        checksum: stored.checksum,
        manifest: manifest as object,
      },
    });
    if (current.packagePath && current.packagePath !== stored.relativePath) {
      const oldPath = join(process.env.STORAGE_PATH ?? join(process.cwd(), 'uploads'), current.packagePath);
      await unlink(oldPath).catch(() => undefined);
    }
    return updated;
  }

  async uninstallPackage(moduleId: string) {
    const current = await this.prisma.moduleDefinition.findUnique({ where: { id: moduleId }, include: { tenantModules: true } });
    if (!current) throw new NotFoundException('ماژول یافت نشد');
    if (current.isCore || current.source !== 'plugin') throw new ForbiddenException('ماژول داخلی قابل حذف نیست');
    if (current.tenantModules.some((module) => module.enabled)) throw new BadRequestException('ابتدا ماژول را برای همه سازمان‌ها غیرفعال کنید');
    await this.prisma.moduleDefinition.delete({ where: { id: moduleId } });
    await rm(this.packageRoot(moduleId), { recursive: true, force: true });
    return { id: moduleId, removed: true };
  }

  async listCatalog() {
    return MODULE_CATALOG.map((mod) => ({
      ...mod,
      domainLabel: MODULE_DOMAIN_LABELS[mod.domain] ?? mod.domain,
    }));
  }

  async listTenantModules(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        modules: {
          include: { module: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    const enabledIds = tenant.modules
      .filter((tm: { enabled: boolean }) => tm.enabled)
      .map((tm: { moduleId: string }) => tm.moduleId);
    const effectiveEnabledIds = [...new Set([...enabledIds, ...getCoreModuleIds()])];

    const catalogById = Object.fromEntries(MODULE_CATALOG.map((mod) => [mod.id, mod]));

    const builtinModules = MODULE_CATALOG.map((catalogMod) => {
      const tenantMod = tenant.modules.find(
        (tm: { moduleId: string }) => tm.moduleId === catalogMod.id,
      );
      const isCore = 'isCore' in catalogMod ? catalogMod.isCore : false;
      const canEnable = isCore || canEnableModule(catalogMod.id, effectiveEnabledIds);
      const canDisable = isCore ? false : canDisableModule(catalogMod.id, effectiveEnabledIds);
      const missingDependencyIds = getModuleDependencies(catalogMod.id).filter(
        (depId) => !effectiveEnabledIds.includes(depId),
      );
      const blockingDependentIds = getEnabledDependents(catalogMod.id, effectiveEnabledIds);

      return {
        id: catalogMod.id,
        name: catalogMod.name,
        domain: catalogMod.domain,
        domainLabel: MODULE_DOMAIN_LABELS[catalogMod.domain] ?? catalogMod.domain,
        version: catalogMod.version,
        dependencies: [...catalogMod.dependencies],
        dependencyLabels: catalogMod.dependencies.map(
          (depId) => catalogById[depId]?.name ?? depId,
        ),
        missingDependencyLabels: missingDependencyIds.map(
          (depId) => catalogById[depId]?.name ?? depId,
        ),
        blockingDependentLabels: blockingDependentIds.map(
          (depId) => catalogById[depId]?.name ?? depId,
        ),
        isCore,
        enabled: isCore || (tenantMod?.enabled ?? false),
        canEnable,
        canDisable,
        settings: tenantMod?.settings ?? {},
      };
    });

    const installedPlugins = await this.prisma.moduleDefinition.findMany({
      where: { source: 'plugin' },
      orderBy: { name: 'asc' },
    });
    const pluginModules = installedPlugins.map((plugin) => {
      const tenantMod = tenant.modules.find((tm: { moduleId: string }) => tm.moduleId === plugin.id);
      const missingDependencyLabels = plugin.dependencies.filter((dependency) => !effectiveEnabledIds.includes(dependency));
      return {
        id: plugin.id,
        name: plugin.name,
        domain: plugin.domain,
        domainLabel: MODULE_DOMAIN_LABELS[plugin.domain] ?? plugin.domain,
        version: plugin.version,
        dependencies: [...plugin.dependencies],
        dependencyLabels: [...plugin.dependencies],
        missingDependencyLabels,
        blockingDependentLabels: [],
        isCore: false,
        enabled: tenantMod?.enabled ?? false,
        canEnable: missingDependencyLabels.length === 0,
        canDisable: true,
        settings: tenantMod?.settings ?? {},
      };
    });
    return [...builtinModules, ...pluginModules];
  }

  async toggleModule(tenantId: string, moduleId: string, dto: ToggleModuleDto) {
    const catalogMod = MODULE_CATALOG.find((m) => m.id === moduleId);
    const pluginMod = catalogMod
      ? null
      : await this.prisma.moduleDefinition.findFirst({ where: { id: moduleId, source: 'plugin' } });
    if (!catalogMod && !pluginMod) throw new NotFoundException('ماژول یافت نشد');
    if (pluginMod) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { modules: true } });
      if (!tenant) throw new NotFoundException('سازمان یافت نشد');
      const enabledIds = tenant.modules.filter((module) => module.enabled).map((module) => module.moduleId);
      const missing = pluginMod.dependencies.filter((dependency) => !enabledIds.includes(dependency) && !getCoreModuleIds().includes(dependency));
      if (dto.enabled && missing.length > 0) {
        throw new BadRequestException(`ابتدا وابستگی‌های افزونه را فعال کنید: ${missing.join('، ')}`);
      }
      const tenantModule = await this.prisma.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        create: { tenantId, moduleId, enabled: dto.enabled },
        update: { enabled: dto.enabled },
      });
      return { id: moduleId, name: pluginMod.name, enabled: tenantModule.enabled, settings: tenantModule.settings };
    }
    if (!catalogMod) throw new NotFoundException('ماژول یافت نشد');

    const isCore = 'isCore' in catalogMod ? catalogMod.isCore : false;

    if (isCore && !dto.enabled) {
      throw new ForbiddenException('ماژول‌های هسته قابل غیرفعال‌سازی نیستند');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { modules: true },
    });

    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    const planModules = PLATFORM_PLANS[tenant.plan]?.modules ?? [];
    if (dto.enabled && !isCore && !planModules.includes(moduleId)) {
      throw new ForbiddenException('این ماژول در پلن فعلی سازمان موجود نیست');
    }

    const enabledIds = tenant.modules
      .filter((tm: { enabled: boolean }) => tm.enabled)
      .map((tm: { moduleId: string }) => tm.moduleId);
    const effectiveEnabledIds = [...new Set([...enabledIds, ...getCoreModuleIds()])];

    if (dto.enabled && !isCore && !canEnableModule(moduleId, effectiveEnabledIds)) {
      const deps = catalogMod.dependencies.filter((d) => !effectiveEnabledIds.includes(d));
      throw new BadRequestException(
        `برای فعال‌سازی این ماژول، ابتدا وابستگی‌های زیر را فعال کنید: ${deps.join(', ')}`,
      );
    }

    if (!dto.enabled && !isCore && !canDisableModule(moduleId, effectiveEnabledIds)) {
      const dependents = MODULE_CATALOG.filter(
        (m) =>
          (m.dependencies as readonly string[]).includes(moduleId) &&
          effectiveEnabledIds.includes(m.id),
      );

      throw new BadRequestException(
        `ابتدا ماژول‌های وابسته را غیرفعال کنید: ${dependents.map((d) => d.name).join(', ')}`,
      );
    }

    await this.prisma.moduleDefinition.upsert({
      where: { id: moduleId },
      create: {
        id: catalogMod.id,
        name: catalogMod.name,
        domain: catalogMod.domain,
        version: catalogMod.version,
        dependencies: [...catalogMod.dependencies],
        isCore,
      },
      update: {},
    });

    const tenantModule = await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId } },
      create: {
        tenantId,
        moduleId,
        enabled: dto.enabled,
      },
      update: {
        enabled: dto.enabled,
      },
      include: { module: true },
    });

    return {
      id: tenantModule.moduleId,
      name: tenantModule.module.name,
      enabled: tenantModule.enabled,
      settings: tenantModule.settings,
    };
  }
}
