// Web Crypto API helpers for local PIN hashing (PBKDF2) and optional backup encryption (AES-GCM)

const PBKDF2_ITERATIONS = 120000;
const ENCRYPTED_MAGIC = 'MYLIBENC1';

function getSubtle(): SubtleCrypto {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }
  return globalThis.crypto.subtle;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function generateSalt(length = 16): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

async function derivePbkdf2Bits(secret: string, saltBytes: Uint8Array, bitLength = 256): Promise<Uint8Array> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer.slice(saltBytes.byteOffset, saltBytes.byteOffset + saltBytes.byteLength) as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    bitLength
  );
  return new Uint8Array(bits);
}

async function deriveAesGcmKey(passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer.slice(saltBytes.byteOffset, saltBytes.byteOffset + saltBytes.byteLength) as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function hashPin(pin: string, existingSalt?: string): Promise<{ hash: string; salt: string }> {
  const salt = existingSalt ?? generateSalt(16);
  const saltBytes = base64ToBytes(salt);
  const derived = await derivePbkdf2Bits(pin, saltBytes, 256);
  return {
    hash: bytesToBase64(derived),
    salt,
  };
}

export async function verifyPin(pin: string, expectedHash: string, salt: string): Promise<boolean> {
  const { hash } = await hashPin(pin, salt);
  if (hash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

export async function encryptBytesWithPassphrase(
  plainBytes: Uint8Array,
  passphrase: string
): Promise<Uint8Array> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Encryption passphrase must be at least 4 characters.');
  }
  const subtle = getSubtle();
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(salt);
  globalThis.crypto.getRandomValues(iv);

  const key = await deriveAesGcmKey(passphrase, salt);
  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plainBytes.buffer.slice(plainBytes.byteOffset, plainBytes.byteOffset + plainBytes.byteLength) as ArrayBuffer
  );
  const cipherBytes = new Uint8Array(cipherBuffer);
  const header = new TextEncoder().encode(ENCRYPTED_MAGIC);

  // Layout: [9B magic][16B salt][12B iv][ciphertext...]
  const output = new Uint8Array(header.length + salt.length + iv.length + cipherBytes.length);
  output.set(header, 0);
  output.set(salt, header.length);
  output.set(iv, header.length + salt.length);
  output.set(cipherBytes, header.length + salt.length + iv.length);
  return output;
}

export function isEncryptedBackupEnvelope(bytes: Uint8Array): boolean {
  const header = new TextEncoder().encode(ENCRYPTED_MAGIC);
  if (bytes.length <= header.length + 28) return false;
  for (let i = 0; i < header.length; i++) {
    if (bytes[i] !== header[i]) return false;
  }
  return true;
}

export async function decryptBytesWithPassphrase(
  envelopeBytes: Uint8Array,
  passphrase: string
): Promise<Uint8Array> {
  if (!isEncryptedBackupEnvelope(envelopeBytes)) {
    throw new Error('File is not a valid encrypted My Library archive.');
  }
  const subtle = getSubtle();
  const headerLen = ENCRYPTED_MAGIC.length;
  const salt = envelopeBytes.subarray(headerLen, headerLen + 16);
  const iv = envelopeBytes.slice(headerLen + 16, headerLen + 28);
  const cipherBytes = envelopeBytes.subarray(headerLen + 28);

  const key = await deriveAesGcmKey(passphrase, salt);
  try {
    const plainBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBytes.buffer.slice(cipherBytes.byteOffset, cipherBytes.byteOffset + cipherBytes.byteLength) as ArrayBuffer
    );
    return new Uint8Array(plainBuffer);
  } catch {
    throw new Error('Incorrect passphrase or corrupted encrypted archive.');
  }
}
