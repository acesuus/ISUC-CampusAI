#!/usr/bin/env node
/**
 * Makes a throwaway signing key for testing the install flow on your own machine.
 *
 *   node scripts/make-dev-key.mjs
 *
 * The private key goes to dev-keys/ and the public key into the pack directory. Both are
 * git-ignored. The app trusts a key found there ONLY in a dev build (see src/ai/knowledge/
 * trustedKeys.js): Vite removes that branch from a production build, so a key made here can never
 * be used to publish a pack that students would accept.
 *
 * The real university key is created and kept by the publisher, never by this script.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { webcrypto as crypto } from 'node:crypto';
import { keyIdFor } from './pack-crypto.mjs';

const KEY_DIR = 'dev-keys';
const PACK_DIR = process.argv.includes('--pack') ? process.argv[process.argv.indexOf('--pack') + 1] : 'public/knowledge';

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
const keyId = await keyIdFor(publicJwk);

await mkdir(KEY_DIR, { recursive: true });
await mkdir(PACK_DIR, { recursive: true });
await writeFile(`${KEY_DIR}/signing-key.json`, `${JSON.stringify({ keyId, privateJwk, publicJwk }, null, 2)}\n`, { mode: 0o600 });
await writeFile(`${PACK_DIR}/dev-key.json`, `${JSON.stringify({ keyId, publicKeyJwk: publicJwk }, null, 2)}\n`);

console.log(`dev key ${keyId}`);
console.log(`  private: ${KEY_DIR}/signing-key.json  (never commit this)`);
console.log(`  public:  ${PACK_DIR}/dev-key.json     (trusted only in a dev build)`);
