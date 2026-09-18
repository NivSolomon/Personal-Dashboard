import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
// Prefixed so a future algorithm change can be told apart from existing values.
const VERSION = 'v1';

let cachedKey = null;

function key() {
  if (cachedKey) return cachedKey;
  const raw = Buffer.from(config.encryptionKey, 'hex');
  if (raw.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  cachedKey = raw;
  return cachedKey;
}

/**
 * Provider refresh tokens are long-lived credentials to someone else's mailbox,
 * so they are encrypted before they reach the database and decrypted only at the
 * moment of an API call. A database dump on its own is therefore not enough.
 */
export function encryptSecret(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('hex'), tag.toString('hex'), ciphertext.toString('hex')].join(':');
}

export function decryptSecret(value) {
  if (!value) return null;
  const [version, ivHex, tagHex, dataHex] = String(value).split(':');
  if (version !== VERSION || !ivHex || !tagHex || !dataHex) {
    throw new Error('Stored secret is not in the expected encrypted format');
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

/** Token sets are stored as one encrypted blob rather than field by field. */
export function encryptJson(value) {
  return value ? encryptSecret(JSON.stringify(value)) : null;
}

export function decryptJson(value) {
  const plain = decryptSecret(value);
  return plain ? JSON.parse(plain) : null;
}
