import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import type { RivalProfile } from './types';

const scrypt = promisify(scryptCallback);
const FORMAT = 'rival-shift-backup-v1';

type EncryptedBackup = {
  format: typeof FORMAT;
  salt: string;
  iv: string;
  tag: string;
  data: string;
};

export async function encryptProfileBackup(profiles: Record<string, RivalProfile>, passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new Error('Use a backup passphrase with at least 8 characters.');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await scrypt(passphrase, salt, 32) as Buffer;
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), profiles }), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return JSON.stringify({ format: FORMAT, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') } satisfies EncryptedBackup, null, 2);
}

export async function decryptProfileBackup(input: string, passphrase: string): Promise<Record<string, RivalProfile>> {
  try {
    const backup = JSON.parse(input) as EncryptedBackup;
    if (backup.format !== FORMAT) throw new Error('Unsupported backup format.');
    const key = await scrypt(passphrase, Buffer.from(backup.salt, 'base64'), 32) as Buffer;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(backup.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(backup.tag, 'base64'));
    const payload = JSON.parse(Buffer.concat([decipher.update(Buffer.from(backup.data, 'base64')), decipher.final()]).toString('utf8')) as { profiles?: Record<string, RivalProfile> };
    if (!payload.profiles || typeof payload.profiles !== 'object') throw new Error('Backup does not contain profiles.');
    return payload.profiles;
  } catch (error) {
    if (error instanceof Error && /^(?:Unsupported backup format|Backup does not contain)/.test(error.message)) throw error;
    throw new Error('Could not decrypt the backup. Check the passphrase and file.');
  }
}
