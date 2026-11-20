#!/usr/bin/env node
/**
 * Signs a built knowledge pack (README 16.7).
 *
 *   node scripts/sign-pack.mjs --key dev-keys/signing-key.json --pack public/knowledge
 *
 * It writes the signing key id and the algorithm into manifest.json, then signs the exact bytes of
 * that file and writes manifest.sig beside it. Signing the written bytes, rather than a
 * re-serialized object, means the app verifies precisely what it downloaded.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { signBytes } from './pack-crypto.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

async function main() {
  const keyFile = arg('key');
  const pack = arg('pack', 'public/knowledge');
  if (!keyFile) throw new Error('pass --key <file with the private signing key>');

  const { keyId, privateJwk } = JSON.parse(await readFile(keyFile, 'utf8'));
  if (!keyId || !privateJwk) throw new Error(`${keyFile}: expected { keyId, privateJwk }`);

  const manifestPath = join(pack, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!manifest.files) throw new Error(`${manifestPath}: no file hashes; build the pack first`);

  manifest.keyId = keyId;
  manifest.algorithm = 'ECDSA-P256-SHA256';
  const bytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(manifestPath, bytes);
  await writeFile(join(pack, 'manifest.sig'), `${await signBytes(privateJwk, bytes)}\n`);

  console.log(`signed ${manifestPath} with key ${keyId} -> ${join(pack, 'manifest.sig')}`);
}

main().catch((err) => {
  console.error(`sign-pack: ${err.message}`);
  process.exit(1);
});
