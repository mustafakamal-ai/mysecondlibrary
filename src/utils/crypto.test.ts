import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptBytesWithPassphrase,
  encryptBytesWithPassphrase,
  hashPin,
  isEncryptedBackupEnvelope,
  verifyPin,
} from './crypto';

test('hashPin and verifyPin validate correct PIN and reject incorrect PIN without plaintext storage', async () => {
  const { hash, salt } = await hashPin('4829');
  assert.notEqual(hash, '4829');
  assert.equal(hash.includes('4829'), false);
  assert.equal(await verifyPin('4829', hash, salt), true);
  assert.equal(await verifyPin('0000', hash, salt), false);
});

test('AES-GCM encryption round-trip succeeds with right passphrase and fails with wrong passphrase', async () => {
  const plain = new TextEncoder().encode('My Library private backup payload');
  const encrypted = await encryptBytesWithPassphrase(plain, 'amber-walnut-key');
  assert.equal(isEncryptedBackupEnvelope(encrypted), true);

  const decrypted = await decryptBytesWithPassphrase(encrypted, 'amber-walnut-key');
  assert.equal(new TextDecoder().decode(decrypted), 'My Library private backup payload');

  await assert.rejects(() => decryptBytesWithPassphrase(encrypted, 'wrong-passphrase'));
});
