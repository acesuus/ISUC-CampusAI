/**
 * Checks that a downloaded knowledge pack really comes from the university publisher and arrived
 * intact (README 16.4, 16.7).
 *
 * The file hashes in the manifest catch corruption, but on their own they prove nothing: anyone who
 * could replace the pack could replace the hashes too. So the manifest is signed, the signature is
 * checked first, and only then are the hashes it carries trusted.
 *
 * Web Crypto only; it works offline and needs no sign-in.
 */
const ALGORITHM = 'ECDSA-P256-SHA256';

const fail = (reason) => ({ ok: false, reason });

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(base64) {
  const binary = atob(String(base64).trim());
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * `manifestBytes` and each entry of `files` are the exact downloaded bytes (Uint8Array).
 * `signature` is base64. `keys` is the trusted list: [{ keyId, publicKeyJwk }].
 * Returns { ok, reason, manifest }.
 */
export async function verifyPack({ manifestBytes, signature, files = {} }, keys = []) {
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    return fail('The pack description could not be read. The download may be damaged.');
  }

  if (manifest.algorithm !== ALGORITHM) {
    return fail('This pack uses a signature type this version of CampusAI does not know.');
  }
  const key = keys.find((k) => k.keyId && k.keyId === manifest.keyId);
  if (!key) {
    return fail('This pack was signed with a key CampusAI does not trust, so it was not installed.');
  }
  if (!signature) return fail('This pack has no signature, so it was not installed.');

  let valid = false;
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      key.publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64ToBytes(signature),
      manifestBytes
    );
  } catch {
    return fail('The signature on this pack could not be checked, so it was not installed.');
  }
  if (!valid) return fail('The signature on this pack does not match its contents, so it was not installed.');

  const hashes = manifest.files;
  if (!hashes || typeof hashes !== 'object' || !Object.keys(hashes).length) {
    return fail('This pack lists no files to check, so it was not installed.');
  }
  for (const [name, expected] of Object.entries(hashes)) {
    const bytes = files[name];
    if (!bytes) return fail(`The pack is missing ${name}, so it was not installed.`);
    if ((await sha256Hex(bytes)) !== expected) {
      return fail(`The file ${name} does not match the pack description, so it was not installed.`);
    }
  }

  return { ok: true, reason: '', manifest };
}
