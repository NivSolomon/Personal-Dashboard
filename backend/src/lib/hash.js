import { createHash } from 'node:crypto';

/** Short, stable fingerprint used to tell whether an input has actually changed. */
export function hashText(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}
