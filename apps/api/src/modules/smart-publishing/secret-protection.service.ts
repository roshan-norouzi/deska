import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

@Injectable()
export class SecretProtectionService {
  private readonly key = createHash('sha256')
    .update(process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'deska-development-secret')
    .digest();

  encrypt(value: string): string {
    if (!value || value.startsWith(PREFIX)) return value;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(value: string): string {
    if (!value.startsWith(PREFIX)) return value;
    try {
      const [ivValue, tagValue, encryptedValue] = value.slice(PREFIX.length).split('.');
      if (!ivValue || !tagValue || !encryptedValue) return '';
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }
}
