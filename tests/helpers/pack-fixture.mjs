/** Builds a signed knowledge pack in memory, the way scripts/build-knowledge + sign-pack do. */
import { webcrypto as crypto } from 'node:crypto';
import { createHash } from 'node:crypto';
import { keyIdFor, signBytes } from '../../scripts/pack-crypto.mjs';

export async function makeKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { keyId: await keyIdFor(publicKeyJwk), privateJwk, publicKeyJwk };
}

export const DOCUMENTS = [
  {
    id: 'fixture-doc',
    title: 'Example Document (test fixture)',
    status: 'verified',
    sections: [{ id: 's1', heading: 'Shifting', text: 'A student files a shifting form at the example window.' }],
  },
];

/** `signWith` lets a test sign with a different key than the one named in the manifest. */
export async function signedPack({ key, signWith = key, documents = DOCUMENTS, version = '1.0.0', manifestExtra = {} } = {}) {
  const documentsJson = `${JSON.stringify(documents)}\n`;
  const manifest = {
    packVersion: version,
    campus: 'test',
    createdAt: '2026-01-01',
    documentCount: documents.length,
    appVersion: '0.1.0',
    files: { 'documents.json': createHash('sha256').update(documentsJson).digest('hex') },
    keyId: key.keyId,
    algorithm: 'ECDSA-P256-SHA256',
    ...manifestExtra,
  };
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  return {
    manifest,
    downloaded: {
      manifestBytes,
      signature: await signBytes(signWith.privateJwk, manifestBytes),
      files: { 'documents.json': new TextEncoder().encode(documentsJson) },
    },
  };
}

/** Flip one byte of a file, as a damaged download or an edited pack would. */
export function tamper(bytes, index = 0) {
  const copy = Uint8Array.from(bytes);
  copy[index] = copy[index] === 32 ? 33 : 32;
  return copy;
}
