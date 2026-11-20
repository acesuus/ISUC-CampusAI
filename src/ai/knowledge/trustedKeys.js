/**
 * The public keys whose signatures CampusAI accepts on a knowledge pack (README 16.7).
 *
 * The list is empty: the university has no publishing key yet, so no pack can be installed. Add the
 * campus public key here when the publishing component exists. Only public keys belong in this
 * file; the private signing key stays with the publisher and never reaches the app.
 *
 * shortcut: rotation happens by shipping a new app version, which the service worker already
 * delivers. README 16.7 also asks that a new key be trustable through an update signed by the
 * previous key; that needs the publishing component and is not built yet.
 */
export const TRUSTED_KEYS = [];

/**
 * In a development build only, also trust the key written by scripts/make-dev-key.mjs, so the
 * install, tamper and recovery paths can be exercised by hand. `import.meta.env.DEV` is replaced
 * with false in a production build, so this whole branch is removed from what students run.
 */
export async function loadTrustedKeys() {
  const keys = [...TRUSTED_KEYS];
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}knowledge/dev-key.json`);
      if (res.ok) {
        const key = await res.json();
        if (key?.keyId && key?.publicKeyJwk) keys.push(key);
      }
    } catch {
      /* no dev key present, which is the normal case */
    }
  }
  return keys;
}
