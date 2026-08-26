export interface PermissionDef {
  key: string;
  label: string;
  moduleId: string;
}

export interface DeskaModuleDefinition {
  id: string;
  name: string;
  domain: string;
  version: string;
  dependencies: string[];
  isCore?: boolean;
  permissions: PermissionDef[];
}

export interface ModuleNavItem {
  href: string;
  label: string;
  permission?: string;
  icon?: string;
}

export interface DeskaModuleManifest extends DeskaModuleDefinition {
  navItems?: ModuleNavItem[];
}

export const MODULE_MANIFEST_VERSION = 1 as const;

export function isValidModuleId(value: string): boolean {
  return /^[a-z][a-z0-9-]{1,63}$/.test(value);
}

export function compareModuleVersions(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/, '').split('.').map((part) => {
    const match = part.match(/^\d+/);
    return match ? Number(match[0]) : 0;
  });
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0) ? 1 : -1;
  }
  return 0;
}

export function validateModuleManifest(value: unknown): DeskaModuleManifest {
  if (!value || typeof value !== 'object') throw new Error('manifest باید یک شیء JSON باشد');
  const manifest = value as Partial<DeskaModuleManifest>;
  if (!manifest.id || !isValidModuleId(manifest.id)) throw new Error('شناسه ماژول معتبر نیست');
  if (!manifest.name || typeof manifest.name !== 'string') throw new Error('نام ماژول الزامی است');
  if (!manifest.version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error('نسخه ماژول باید به شکل semver باشد');
  }
  if (!Array.isArray(manifest.dependencies) || manifest.dependencies.some((id) => typeof id !== 'string' || !isValidModuleId(id))) {
    throw new Error('وابستگی‌های ماژول معتبر نیستند');
  }
  if (!Array.isArray(manifest.permissions) || manifest.permissions.some((permission) => !permission?.key || permission.moduleId !== manifest.id)) {
    throw new Error('مجوزهای manifest معتبر نیستند');
  }
  return {
    id: manifest.id,
    name: manifest.name,
    domain: manifest.domain || 'productivity',
    version: manifest.version,
    dependencies: [...manifest.dependencies],
    isCore: false,
    permissions: [...manifest.permissions],
    navItems: Array.isArray(manifest.navItems) ? manifest.navItems : [],
  };
}
