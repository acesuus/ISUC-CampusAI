# Phase 6 spec: offline storage and pack updates

Status: draft. Builds on `phase-4-knowledge-base.md` (pack layout, `KnowledgeBase`). Requirements: README 9.1 to 9.4, 16.3, 16.4, 16.7.

## Goal
Make the offline experience reliable: chats survive a reload, the knowledge pack is installed on the device
only after its integrity and publisher are verified, and the student can see, remove and re-download
what is stored.

## In scope
- Chat history in IndexedDB: list, open, delete one, clear all (README 16.3).
- Knowledge pack install from the network: download, hash check, signature check, store, keep the previous verified pack on any failure (README 16.7).
- A version check against the published manifest, only while online and only when the student asks or opens Settings.
- Storage controls in Settings: clear history, clear pack, remove model (exists), clear all app data.
- Recovery: tell the student when the browser removed stored data, and offer to download it again.
- Service worker change so pack files are never served from its cache.

## Out of scope
- Account sign-in, sync between devices, any server-side storage (README 9.4).
- Incremental pack updates (v0.1 installs the full pack only).
- The admin publishing interface (README 17). Publishing here means one command run by the publisher.
- Moving theme or model choice out of `localStorage` (see open question 3).
- Embedding indexes. The BM25 index is rebuilt at start-up from the stored documents.

## Data and interfaces

### IndexedDB: database `campusai`, version 1
| Store | Key | Fields |
|---|---|---|
| `conversations` | `id` | `title, createdAt, updatedAt` |
| `messages` | `id` (index `conversationId`) | `conversationId, role, content, timestamp, citations, stopped, truncated, error` |
| `packs` | `slot` = `"current"` or `"previous"` | `manifest, documents, installedAt` |

### New modules
| File | Job |
|---|---|
| `src/storage/db.js` | About 30 lines. `open()`, and promise wrappers `get, put, delete, getAll, clear` for one store. Every storage user takes this as a parameter so tests can pass an in-memory fake. |
| `src/storage/ChatStore.js` | `list()`, `load(id)`, `save(conversation, messages)`, `remove(id)`, `clear()`. |
| `src/storage/PackStore.js` | `get(slot)`, `install(manifest, documents)` (moves `current` to `previous`, writes `current`, in one transaction), `clear()`. |
| `src/ai/knowledge/verify.js` | `verifyPack({ manifestBytes, signature, files }, trustedKeys)`: checks the signature on `manifestBytes`, then the SHA-256 of each file named in the manifest. Web Crypto only. |
| `src/ai/knowledge/trustedKeys.js` | `[{ keyId, algorithm, publicKeyJwk }]`. Public keys only. |
| `src/ai/knowledge/PackInstaller.js` | `check()` returns `{ installed, available, upToDate }`. `install()` fetches, verifies, then calls `PackStore.install`. Any failure leaves the stored packs untouched and returns a message a student can read. |
| `scripts/sign-pack.mjs` | Run by the publisher: `node scripts/sign-pack.mjs --key <private key file>`. Writes `manifest.sig`. The private key is never in the repo. |

### Pack files (extends Phase 4)
```
manifest.json   { packVersion, campus, createdAt, documentCount, appVersion,
                  keyId, algorithm: "ECDSA-P256-SHA256",
                  files: { "documents.json": "<sha256 hex>" } }
manifest.sig    base64 signature over the exact bytes of manifest.json
documents.json  unchanged from Phase 4
```
Signing the file bytes (not a re-serialized object) avoids JSON canonicalization mistakes.

### Existing code that changes
- `src/ai/conversation/ConversationManager.js`: takes a `store`. Saves after a reply finishes, not on every token. New methods `open(id)`, `remove(id)`, `list()`. On start it opens the most recent conversation. `clear()` now means "start a new conversation"; deleting is separate.
- `src/ai/session.js`: wires the store.
- `src/ai/knowledge/KnowledgeBase.js` (Phase 4): `load()` reads `PackStore.get("current")` instead of fetching static files, then builds the index.
- `src/pages/assistant/assistant.js`: the History sidebar lists saved conversations with delete, replacing the "arrive in a later phase" text. A "Install knowledge pack" button appears when none is stored.
- `src/pages/settings/settings.js`: pack version and install or update button, plus the four clear actions. Each destructive action asks for confirmation, as "Remove download" does today.
- `src/pages/home/home.js`: the "history is stored locally" line becomes true; keep it.
- `public/sw.js`: skip `/knowledge/` requests so the page always fetches them from the network. Today every same-origin GET is cache-first, which would make updates invisible.

### Rules the code must enforce
1. Nothing is stored unless hash and signature both pass. An unknown `keyId` or a hash mismatch rejects the pack.
2. A failed install keeps the previous pack and the app keeps answering from it.
3. A stored pack that fails to read (corrupt, removed) is treated as "not installed", never as an empty pack that "verifies".
4. No network request is made unless the student starts an install or opens Settings while online. Offline, the version check is skipped silently.
5. Clearing history deletes messages and conversations in one transaction.
6. Recovery: when `localStorage` says a pack or model was installed but the data is missing, show "Your browser removed saved data. Download it again" with the button.

## Acceptance criteria
Tests run with `npm test`. Storage tests use the in-memory fake; Web Crypto is built into Node 22.
1. `verifyPack` accepts a fixture pack signed with a test key, and rejects: a changed `documents.json` byte, a changed manifest byte, a signature from another key, an unknown `keyId`.
2. `PackInstaller.install` with a failing verify leaves `current` and `previous` unchanged.
3. A successful install moves the old `current` to `previous`.
4. `ChatStore` saves, lists (newest first), loads, deletes one conversation and clears all; deleting removes that conversation's messages.
5. `ConversationManager` saves once per finished reply, restores a conversation with citations intact, and keeps working if the store throws (the chat still answers; a notice says history was not saved).
6. `sign-pack.mjs` output verifies with the matching public key (round trip).
7. Manual, real browser: send a message, reload, history is there. Install the pack online, switch to offline, ask a covered question, get a cited answer. Delete site data in dev tools, reopen, see the recovery message.
8. Manual: serve a tampered `documents.json` and confirm the install is refused with a readable message.

## Open questions (decide before coding)
1. **Signature algorithm.** Recommendation: ECDSA P-256. Web Crypto supports it in every current browser. Ed25519 is simpler but newer in browser support and should be checked first.
2. **Key rotation (README 16.7).** The README asks for rotation through an update signed by the previous key. v0.1 here covers one key list shipped in the app. Rotation by app update is possible because the site updates through the service worker. Recommendation: accept that as v0.1 and record the signed-rotation message as a known gap.
3. **Settings storage.** README 9.3 says settings live in IndexedDB. Theme and model choice work in `localStorage` today and are read before first paint. Recommendation: leave them, and note the deviation.
4. **History limits.** Titles are the first 40 characters of the first question. Cap at 50 conversations and delete the oldest, or keep all until the student deletes? Recommendation: cap at 50, since browser storage is shared with the model files.
5. **Where packs are hosted.** Same origin as the site (simplest, and the service worker rule above covers it) or a separate address? A separate address needs a host entry for any content security policy later.
6. **Pack size.** Fine for plain-text documents. If a pack grows past a few megabytes, `documents.json` should be split per document, which the manifest `files` map already allows.
