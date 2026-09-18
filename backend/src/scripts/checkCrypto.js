/**
 * Proves the token-at-rest guarantees without needing a database:
 *   npm --workspace backend run check:crypto
 */
import { decryptJson, decryptSecret, encryptJson, encryptSecret } from '../lib/crypto.js';

const tokens = { refresh_token: '1//0gAbCdEf', access_token: 'ya29.a0Ae', expiry_date: 1789650000000 };
const blob = encryptJson(tokens);

console.log('stored value:      ', `${blob.slice(0, 40)}…`);
console.log('contains plaintext:', blob.includes('1//0gAbCdEf'));
console.log('round trip equal:  ', JSON.stringify(decryptJson(blob)) === JSON.stringify(tokens));

// Two encryptions of the same input must differ, or equal tokens would be linkable.
console.log('nonce is random:   ', encryptSecret('same') !== encryptSecret('same'));

// Flip one ciphertext byte; GCM's auth tag must reject it rather than return junk.
const parts = blob.split(':');
const flipped = parts[3].slice(0, -2) + (parts[3].endsWith('00') ? '11' : '00');
try {
  decryptSecret([parts[0], parts[1], parts[2], flipped].join(':'));
  console.log('tampering rejected: NO — this is a bug');
  process.exitCode = 1;
} catch {
  console.log('tampering rejected: yes');
}

try {
  decryptSecret('plain-text-not-encrypted');
  console.log('legacy plaintext rejected: NO — this is a bug');
  process.exitCode = 1;
} catch {
  console.log('legacy plaintext rejected: yes');
}
