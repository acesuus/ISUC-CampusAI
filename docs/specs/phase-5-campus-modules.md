# Phase 5 spec: campus modules

Status: built. Requirements: README 6.2 to 6.9, 10.1.

## Goal
Give the Campus Directory, Campus Map, Student Guide and Announcements pages real content, without
putting unverified ISU information in the repo.

## How
The pages render **structured records carried in the signed knowledge pack**, so campus information
follows the same path as the documents the assistant quotes: built by a publisher, signed, verified
on the device, then stored. A page with no pack installed says so and points at Settings. Nothing in
this repo claims to be ISU information; the only records committed are an obviously fake fixture
under `tests/fixtures/knowledge-src/records/`.

Decisions taken with the user: the map is an image with markers, with no new dependency and no map
tile provider, and the optional README 6.3 checklist is included.

## Record format
`knowledge-src/records/<kind>.json` holds a list of records; `scripts/build-knowledge.mjs` validates
them and hashes each file into the manifest, so `src/ai/knowledge/verify.js` already covers them.

Every record carries the README 8.4 metadata: `id`, `status`, `source`, `lastVerified`, and
optionally `effectiveDate` and `expirationDate`. Only `verified`, in-date records are shown, through
`isCurrent()` in `src/ai/knowledge/KnowledgeBase.js`.

| Kind | Required beyond the metadata | Optional |
|---|---|---|
| `offices` | `name` | `unit`, `description`, `location`, `schedule`, `contact`, `services[]`, `procedures` |
| `places` | `name`, `category`, `x`, `y` | `description`, `accessibility` |
| `guides` | `title`, `category` | `purpose`, `requirements[]`, `procedure`, `steps[{id,text}]`, `office`, `fees`, `processingTime`, `reference` |
| `announcements` | `title`, `publicationDate` | `body`, `category`, `office`, `effectiveDate`, `expirationDate` |

`x` and `y` are percentages of the campus image (0 to 100), so markers do not depend on a projection
or a tile scheme. The campus image goes in `knowledge-src/assets/` and is published under
`assets/` in the pack.

## Rules the code enforces
1. Only verified, in-date records reach a page. Draft, pending, superseded, expired and archived are
   dropped at load.
2. Announcements are the exception README 6.8 asks for: an expired notice is listed but marked, and
   sorted after current ones. Drafts are still dropped.
3. Record text is publisher data, not app code: pages write it with `textContent`.
4. A checklist tick is remembered against the pack's own step `id`, so a pack that reorders or
   rewords steps does not move anybody's ticks. Ticks never leave the device, and the page states
   that ticking a box is not admission, enrolment or approval.
5. The file list in a manifest is read before the signature is checked, so it is treated as hostile:
   plain names only, nothing that climbs out of the pack, and at most 24 files.

## As built
- New pages: `src/pages/directory/`, `src/pages/announcements/`, `src/pages/map/`, `src/pages/guide/`.
  `src/pages/placeholders.js` now holds only the About page.
- Shared loading and filtering: `src/pages/shared/records.js`. Field rendering reuses `fieldList()`
  in `src/utils/dom.js`.
- Checklists: `src/storage/ChecklistStore.js`, on database version 2, which adds a `checklists`
  store and upgrades an existing version 1 database in place.
- Scholarships and student life (README 6.6, 6.7) are guide categories rather than their own pages,
  because they are the same shape of record. The campus decides the category names.

## Not built
- Walking directions and starting-point selection (README 6.5). They need mapped paths, which no
  verified source provides yet; the markers and the place list come first.
- A guide detail route of its own. Guides expand in place on one page, which is enough while a pack
  holds a handful of them.

## Verification
`npm test` covers record validation, the current-only filter, announcement expiry marking, search,
marker coordinate checks, the hostile file list and the checklist store. Checked in a browser with
the fixture pack and a dev key: each page lists its records, search and category filters narrow
them, drafts and expired records never appear (except a marked expired announcement), a marker
selects its place, a checklist tick survives a reload, and with the pack removed all four pages
explain themselves instead of showing an empty screen.
