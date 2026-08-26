/** پوشه‌های سیستمی ماژول اسناد */
export const DOCUMENT_SYSTEM_FOLDERS = {
  CONTACT_DOCUMENTS: {
    systemKey: 'contact-documents',
    name: 'اسناد مخاطبان',
  },
  EMPLOYEE_DOCUMENTS: {
    systemKey: 'employee-documents',
    name: 'اسناد کارکنان',
  },
} as const;

/** entityType آپلود → کلید پوشه سیستمی */
export const ENTITY_DOCUMENT_SYSTEM_FOLDER: Record<string, string> = {
  Contact: DOCUMENT_SYSTEM_FOLDERS.CONTACT_DOCUMENTS.systemKey,
  Employee: DOCUMENT_SYSTEM_FOLDERS.EMPLOYEE_DOCUMENTS.systemKey,
};
