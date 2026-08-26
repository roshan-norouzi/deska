/** Entity type → label and detail page path for cross-module links */

export interface EntityRelationSpec {
  label: string;
  detailPath: (id: string) => string;
  moduleId?: string;
}

export const ENTITY_RELATIONS: Record<string, EntityRelationSpec> = {
  Contact: { label: 'مخاطب', detailPath: (id) => `/contacts/${id}`, moduleId: 'contacts' },
  Employee: { label: 'کارمند', detailPath: (id) => `/hr/employees/${id}`, moduleId: 'hr' },
  Department: { label: 'دپارتمان', detailPath: (id) => `/hr/departments`, moduleId: 'hr' },
  JobOpening: { label: 'آگهی استخدام', detailPath: (id) => `/hr/recruitment/${id}`, moduleId: 'hr' },
};

export function getEntityDetailHref(entityType: string, entityId: string): string | null {
  const spec = ENTITY_RELATIONS[entityType];
  if (!spec) return null;
  return spec.detailPath(entityId);
}

export function getEntityLabel(entityType: string): string {
  return ENTITY_RELATIONS[entityType]?.label ?? entityType;
}

/** Quick links from a contact to related modules */
export const CONTACT_RELATED_LINKS = [
  { href: (id: string) => `/hr/employees?contactId=${id}`, label: 'کارمندان HR' },
] as const;
