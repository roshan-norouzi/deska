import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  DOCUMENT_SYSTEM_FOLDERS,
  ENTITY_DOCUMENT_SYSTEM_FOLDER,
} from '@deska/shared';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  private storagePath: string;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    this.storagePath = config.get<string>('STORAGE_PATH', './storage');
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  // --- Folders ---

  async findFolders(tenantId: string, parentId?: string | null) {
    if (parentId === undefined || parentId === null) {
      await this.ensureSystemFolder(
        tenantId,
        DOCUMENT_SYSTEM_FOLDERS.CONTACT_DOCUMENTS.systemKey,
        DOCUMENT_SYSTEM_FOLDERS.CONTACT_DOCUMENTS.name,
      );
      await this.ensureSystemFolder(
        tenantId,
        DOCUMENT_SYSTEM_FOLDERS.EMPLOYEE_DOCUMENTS.systemKey,
        DOCUMENT_SYSTEM_FOLDERS.EMPLOYEE_DOCUMENTS.name,
      );
    }

    return this.prisma.documentFolder.findMany({
      where: { tenantId, parentId: parentId ?? null },
      include: { _count: { select: { files: true, children: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createFolder(tenantId: string, data: { name: string; parentId?: string }) {
    const name = data.name?.trim();
    if (!name || name.length > 120) throw new BadRequestException('نام پوشه باید بین ۱ تا ۱۲۰ کاراکتر باشد');
    if (data.parentId) await this.findFolder(tenantId, data.parentId);
    return this.prisma.documentFolder.create({
      data: { tenantId, name, parentId: data.parentId },
    });
  }

  async ensureSystemFolder(tenantId: string, systemKey: string, name: string) {
    const existing = await this.prisma.documentFolder.findFirst({
      where: { tenantId, systemKey },
    });
    if (existing) return existing;

    return this.prisma.documentFolder.create({
      data: { tenantId, name, systemKey, isSystem: true, parentId: null },
    });
  }

  private async resolveFolderIdForUpload(
    tenantId: string,
    meta: { folderId?: string; entityType?: string },
  ): Promise<string | undefined> {
    if (meta.folderId) return meta.folderId;
    if (!meta.entityType) return undefined;

    const systemKey = ENTITY_DOCUMENT_SYSTEM_FOLDER[meta.entityType];
    if (!systemKey) return undefined;

    const folderDef = Object.values(DOCUMENT_SYSTEM_FOLDERS).find((f) => f.systemKey === systemKey);
    if (!folderDef) return undefined;

    const folder = await this.ensureSystemFolder(tenantId, systemKey, folderDef.name);
    return folder.id;
  }

  async updateFolder(tenantId: string, id: string, data: { name?: string; parentId?: string }) {
    const folder = await this.findFolder(tenantId, id);
    if (folder.isSystem) {
      throw new BadRequestException('پوشه سیستمی قابل ویرایش نیست');
    }
    if (data.name !== undefined && !data.name.trim()) {
      throw new BadRequestException('نام پوشه الزامی است');
    }
    return this.prisma.documentFolder.update({
      where: { id },
      data: {
        ...data,
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      },
    });
  }

  async removeFolder(tenantId: string, id: string) {
    const folder = await this.findFolder(tenantId, id);
    if (folder.isSystem) {
      throw new BadRequestException('پوشه سیستمی قابل حذف نیست');
    }

    const children = await this.prisma.documentFolder.findMany({
      where: { tenantId, parentId: id },
    });
    for (const child of children) {
      await this.removeFolder(tenantId, child.id);
    }

    const files = await this.prisma.documentFile.findMany({
      where: { tenantId, folderId: id },
    });
    for (const file of files) {
      await this.removeFile(tenantId, file.id);
    }

    return this.prisma.documentFolder.delete({ where: { id } });
  }

  async findFolder(tenantId: string, id: string) {
    const folder = await this.prisma.documentFolder.findFirst({ where: { id, tenantId } });
    if (!folder) throw new NotFoundException('پوشه یافت نشد');
    return folder;
  }

  // --- Files ---

  async findFiles(
    tenantId: string,
    params: { folderId?: string; entityType?: string; entityId?: string },
  ) {
    const { folderId, entityType, entityId } = params;
    const files = await this.prisma.documentFile.findMany({
      where: {
        tenantId,
        ...(folderId !== undefined ? { folderId: folderId || null } : {}),
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.enrichFilesWithEntityNames(tenantId, files);
  }

  private async enrichFilesWithEntityNames(
    tenantId: string,
    files: Array<{
      id: string;
      entityType: string | null;
      entityId: string | null;
      [key: string]: unknown;
    }>,
  ) {
    const contactIds = [
      ...new Set(
        files
          .filter((f) => f.entityType === 'Contact' && f.entityId)
          .map((f) => f.entityId as string),
      ),
    ];

    const contacts =
      contactIds.length > 0
        ? await this.prisma.contact.findMany({
            where: { tenantId, id: { in: contactIds } },
            select: { id: true, name: true },
          })
        : [];

    const contactMap = new Map(contacts.map((c) => [c.id, c.name]));

    return files.map((file) => ({
      ...file,
      entityName:
        file.entityType === 'Contact' && file.entityId
          ? contactMap.get(file.entityId) ?? null
          : null,
    }));
  }

  async findFile(tenantId: string, id: string) {
    const file = await this.prisma.documentFile.findFirst({ where: { id, tenantId } });
    if (!file) throw new NotFoundException('فایل یافت نشد');
    return file;
  }

  async saveUploadedFile(
    tenantId: string,
    file: Express.Multer.File,
    meta: {
      folderId?: string;
      entityType?: string;
      entityId?: string;
      uploadedById?: string;
      displayName?: string;
    },
  ) {
    if (!file?.buffer || !file.size) throw new BadRequestException('فایل برای آپلود انتخاب نشده است');
    if (file.size > 25 * 1024 * 1024) throw new BadRequestException('حداکثر حجم فایل ۲۵ مگابایت است');
    if (!file.originalname || file.originalname.length > 255) throw new BadRequestException('نام فایل معتبر نیست');
    if (meta.displayName && meta.displayName.trim().length > 255) {
      throw new BadRequestException('نام نمایشی فایل بیش از حد طولانی است');
    }
    if (meta.folderId) await this.findFolder(tenantId, meta.folderId);
    const tenantDir = path.join(this.storagePath, tenantId);
    if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true });

    const safeOriginalName = path.basename(file.originalname).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const filename = `${Date.now()}-${safeOriginalName}`;
    const destPath = path.resolve(path.join(tenantDir, filename));
    fs.writeFileSync(destPath, file.buffer);

    const originalName = this.resolveDisplayName(file.originalname, meta.displayName);
    const folderId = await this.resolveFolderIdForUpload(tenantId, meta);

    return this.prisma.documentFile.create({
      data: {
        tenantId,
        name: filename,
        originalName,
        mimeType: file.mimetype,
        size: file.size,
        path: destPath,
        folderId,
        entityType: meta.entityType,
        entityId: meta.entityId,
        uploadedById: meta.uploadedById,
      },
    });
  }

  private resolveDisplayName(fileOriginalName: string, displayName?: string): string {
    const trimmed = displayName?.trim();
    if (!trimmed) return fileOriginalName;

    const fileExt = path.extname(fileOriginalName);
    const inputExt = path.extname(trimmed);

    if (inputExt) return trimmed;
    if (fileExt) return `${trimmed}${fileExt}`;
    return trimmed;
  }

  async attachToEntity(
    tenantId: string,
    id: string,
    entityType: string,
    entityId: string,
  ) {
    await this.findFile(tenantId, id);
    return this.prisma.documentFile.update({
      where: { id },
      data: { entityType, entityId },
    });
  }

  async updateFile(
    tenantId: string,
    id: string,
    data: { originalName?: string; folderId?: string | null },
  ) {
    await this.findFile(tenantId, id);

    const payload: Prisma.DocumentFileUpdateInput = {};

    if (data.originalName !== undefined) {
      const trimmed = data.originalName.trim();
      if (!trimmed) throw new BadRequestException('نام سند الزامی است');
      payload.originalName = trimmed;
    }

    if (data.folderId !== undefined) {
      if (data.folderId) {
        await this.findFolder(tenantId, data.folderId);
        payload.folder = { connect: { id: data.folderId } };
      } else {
        payload.folder = { disconnect: true };
      }
    }

    return this.prisma.documentFile.update({ where: { id }, data: payload });
  }

  async removeFile(tenantId: string, id: string) {
    const file = await this.findFile(tenantId, id);
    const diskPath = this.resolveDiskPath(file);
    if (fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath);
    }
    return this.prisma.documentFile.delete({ where: { id } });
  }

  resolveDiskPath(file: { path: string; tenantId: string; name: string }): string {
    const candidates = [
      file.path,
      path.resolve(file.path),
      path.join(this.storagePath, file.tenantId, file.name),
      path.join(process.cwd(), file.path),
      path.join(process.cwd(), 'apps', 'api', file.path),
      path.join(process.cwd(), 'uploads', file.tenantId, file.name),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    return path.resolve(file.path);
  }

  getFilePath(tenantId: string, id: string) {
    return this.findFile(tenantId, id).then((file) => ({
      ...file,
      path: this.resolveDiskPath(file),
    }));
  }
}
