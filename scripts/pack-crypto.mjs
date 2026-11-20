/** Key id and signing helpers shared by the pack scripts. */
import { webcrypto as crypto } from 'node:crypto';

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A short, stable id for a public key: the hash of the curve point. */
export async function keyIdFor(publicJwk) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${publicJwk.crv}.${publicJwk.x}.${publicJwk.y}`));
  return hex(digest).slice(0, 16);
}

export function importPrivateKey(privateJwk) {
  return crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Sign the exact bytes given. Returns the raw r||s signature as base64. */
export async function signBytes(privateJwk, bytes) {
  const key = await importPrivateKey(privateJwk);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes);
  return Buffer.from(signature).toString('base64');
}
