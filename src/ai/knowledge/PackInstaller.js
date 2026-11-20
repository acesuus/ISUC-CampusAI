import { verifyPack } from './verify.js';
import { loadTrustedKeys } from './trustedKeys.js';

/**
 * Downloads, checks and installs a knowledge pack.
 *
 * Nothing is stored unless the signature and every file hash pass, so a tampered or half-downloaded
 * pack leaves the previously installed one in place and answering (README 16.7).
 */
const VERSION_KEY = 'campusai.pack';

/** Remember that a pack was installed, so its disappearance can be told from never having one. */
function remember(version) {
  try {
    if (version) localStorage.setItem(VERSION_KEY, version);
    else localStorage.removeItem(VERSION_KEY);
  } catch {
    /* storage unavailable; recovery advice is the only thing lost */
  }
}

function remembered() {
  try {
    return localStorage.getItem(VERSION_KEY);
  } catch {
    return null;
  }
}

/**
 * A pack lists its own files, and that list is read before the signature has been checked, so it is
 * treated as hostile input: at most MAX_FILES plain names, no paths that climb out of the pack.
 * Whatever is fetched is still verified against the signed manifest afterwards.
 */
const MAX_FILES = 24;
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$/i;

export function safeFileNames(files) {
  const names = Object.keys(files ?? {});
  if (!names.length) throw new Error('the pack lists no files');
  if (names.length > MAX_FILES) throw new Error(`the pack lists ${names.length} files, more than CampusAI installs`);
  for (const name of names) {
    if (name === 'manifest.json' || name === 'manifest.sig') continue;
    if (!SAFE_NAME.test(name) || name.includes('..')) throw new Error(`the pack lists an unexpected file name: ${name}`);
  }
  return names.filter((name) => name !== 'manifest.json' && name !== 'manifest.sig');
}

async function fetchPackFiles(base) {
  const get = async (name, as) => {
    const res = await fetch(`${base}knowledge/${name}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    return as === 'bytes' ? new Uint8Array(await res.arrayBuffer()) : res.text();
  };
  const [manifestBytes, signature] = await Promise.all([get('manifest.json', 'bytes'), get('manifest.sig', 'text')]);

  let listed;
  try {
    listed = safeFileNames(JSON.parse(new TextDecoder().decode(manifestBytes)).files);
  } catch (err) {
    throw new Error(err?.message ?? 'the pack description could not be read');
  }

  const files = {};
  await Promise.all(listed.map(async (name) => void (files[name] = await get(name, 'bytes'))));
  return { manifestBytes, signature, files };
}

/** Split verified pack files into the documents, the records each page renders, and the assets. */
export function readPackFiles(files) {
  const decode = (bytes) => JSON.parse(new TextDecoder().decode(bytes));
  const documents = decode(files['documents.json']);
  if (!Array.isArray(documents)) throw new Error('documents.json is not a list');

  const records = {};
  const assets = {};
  for (const [name, bytes] of Object.entries(files)) {
    if (name === 'documents.json') continue;
    if (name.startsWith('assets/')) {
      assets[name.slice('assets/'.length)] = bytes;
    } else if (name.endsWith('.json')) {
      const list = decode(bytes);
      if (!Array.isArray(list)) throw new Error(`${name} is not a list`);
      records[name.slice(0, -'.json'.length)] = list;
    }
  }
  return { documents, records, assets };
}

export class PackInstaller {
  constructor({ store, keys = loadTrustedKeys, fetchFiles = fetchPackFiles, base = null } = {}) {
    this.store = store;
    this.keys = keys;
    this.fetchFiles = fetchFiles;
    this.base = base;
  }

  #base() {
    return this.base ?? import.meta.env.BASE_URL;
  }

  /**
   * What is installed, what the site offers, and whether the browser dropped a pack that was
   * installed before. Offline, `available` stays null and nothing is reported as missing.
   */
  async check() {
    const stored = await this.store.get('current').catch(() => null);
    const installed = stored?.manifest?.packVersion ?? null;
    const state = {
      installed,
      documentCount: stored?.manifest?.documentCount ?? 0,
      available: null,
      upToDate: null,
      // A remembered version with nothing stored means the browser cleared the data (README 9.3).
      lost: !installed && Boolean(remembered()),
    };
    if (!installed) remember(null);

    try {
      const res = await fetch(`${this.#base()}knowledge/manifest.json`, { cache: 'no-store' });
      if (res.ok) {
        // Untrusted until verifyPack runs; read only to show a version and offer the install.
        state.available = (await res.json())?.packVersion ?? null;
        state.upToDate = Boolean(installed) && state.available === installed;
      }
    } catch {
      /* offline, or the site serves no pack: leave `available` null */
    }
    return state;
  }

  /** Returns { ok, reason, version }. */
  async install() {
    let downloaded;
    try {
      downloaded = await this.fetchFiles(this.#base());
    } catch (err) {
      return { ok: false, reason: `The pack could not be downloaded: ${err?.message ?? err}` };
    }

    const result = await verifyPack(downloaded, await this.keys());
    if (!result.ok) return { ok: false, reason: result.reason };

    let content;
    try {
      content = readPackFiles(downloaded.files);
    } catch (err) {
      return { ok: false, reason: `The pack contents could not be read: ${err?.message ?? err}` };
    }

    try {
      await this.store.install(result.manifest, content.documents, { records: content.records, assets: content.assets });
    } catch (err) {
      return { ok: false, reason: `The pack could not be saved: ${err?.message ?? err}` };
    }
    remember(result.manifest.packVersion);
    return { ok: true, reason: '', version: result.manifest.packVersion };
  }

  async remove() {
    await this.store.clear();
    remember(null);
  }
}
