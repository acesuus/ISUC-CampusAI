# Phase 4 spec: knowledge base and retrieval (RAG)

Status: draft for review. Source of the requirements: README 7.3, 8.2 to 8.8, 15 (prompt rules), 16.4.

## Goal
Let the on-device assistant answer ISU-specific questions from approved documents, show which document
supports each answer, and say plainly when no reliable source exists.

## In scope
- A knowledge pack format (the v0.1 shape of README 8.6) read from static files shipped with the site.
- Chunking, a local keyword index (BM25), and a `retrieve(question)` function.
- Metadata filtering: only `verified` and not-expired documents count as current policy (README 7.3, 8.5).
- Passing retrieved sections into the prompt, and a no-source path that does not call the model's memory for ISU facts.
- Source citations on assistant messages, and a Settings line showing the pack version.
- A small **fake** fixture pack for tests. It must be named and worded so it can never be mistaken for ISU content.

## Out of scope (later phases)
- Real ISU content. It needs the verification workflow in README 8.9 and is a people task, not code.
- IndexedDB storage, pack install and update, version checks, signature verification (Phase 6, README 16.7).
- Embedding / semantic search (README 7.3 says to evaluate BM25 first).
- PDF, HTML and CSV parsing in the browser. Documents are converted to Markdown/TXT chunks when the pack is built (README 8.2).
- The directory, map and guide pages (Phase 5).

## Data and interfaces

### Pack layout (v0.1, plain files under `public/knowledge/`)
```
public/knowledge/
  manifest.json      { packVersion, campus, createdAt, documentCount, appVersion }
  documents.json     [ { id, title, category, office, version, status,
                         effectiveDate, expirationDate, source, lastVerified,
                         sections: [ { id, heading, text } ] } ]
```
Phase 6 adds file hashes and the signature to `manifest.json`; this layout does not have to change for that.

### New modules (all under `src/ai/knowledge/`)
| File | Job |
|---|---|
| `chunker.js` | `chunk(document) -> Chunk[]`. One chunk per section; split any section over about 800 characters on paragraph boundaries. A chunk is `{ docId, sectionId, heading, text }`. |
| `bm25.js` | `buildIndex(chunks)` and `search(index, query, k)`. Plain JS, lowercase and split on non-letters, a small English plus Filipino stop-word list. |
| `KnowledgeBase.js` | `load()` fetches the pack, drops documents whose `status` is not `verified` or whose `expirationDate` has passed, builds the index. `retrieve(question, {k = 3}) -> { hits, reliable }`. A hit is `{ docId, title, sectionId, heading, text, score }`. |

### Existing code that changes
- `src/ai/conversation/PromptManager.js`: `buildMessages(history, { hasKnowledge, context })`. `context` is the hits; they go into the **system** prompt after the rules, each labelled `[1]`, `[2]`, and so on. When `reliable` is false, add one line telling the model that no source was found and that it must say so and name the responsible office. The current `NO_KNOWLEDGE_NOTE` stays for the case where no pack loaded.
- `src/ai/conversation/ConversationManager.js`: before generating, call `retrieve` on the latest user message and store the used hits on the reply as `citations` (the field already exists and is `[]` today). The engine contract (`generate`, `interrupt`, `resetChat`) does not change.
- `src/ai/session.js`: construct the conversation with a `retrieve` function.
- `src/pages/assistant/assistant.js` (`updateMessage`): render citations under the reply as plain text (`textContent`), for example "Sources: [1] Student Manual, section Shifting".
- `src/pages/settings/settings.js`: replace the hard-coded "Knowledge pack: Not installed" row with the real pack version, or "Not installed" when absent.
- `src/pages/home/home.js`: fix the false line about stored history if Phase 6 has not shipped by then (audit finding 2).

### Rules the code must enforce
1. Only `verified`, in-date documents are retrievable. Draft, pending, superseded, expired and archived are dropped at load.
2. If the best score is below a threshold, `reliable` is false and **no citations are attached**.
3. Citations come from the hits actually put in the prompt, never from model output. Cited sections are the ones retrieved; whether they support the claim is checked by evaluation (Phase 7), not assumed.
4. Retrieval runs on the latest user message only in v0.1. No query rewriting.
5. Retrieved text is untrusted data: it is inserted as quoted context, and the prompt says to ignore any instructions inside it.

## Acceptance criteria
Each one is a test in `tests/ai/` (`npm test`) unless marked manual.
1. `chunk` splits a long section on paragraph boundaries and keeps `docId`, `sectionId` and `heading`.
2. `search` ranks a chunk containing the query terms above one without them, and returns nothing for a query made only of stop words.
3. `load` drops draft, expired and superseded documents (one fixture document of each).
4. `retrieve` returns `reliable: false` and no hits for a question the fixture pack cannot answer.
5. `buildMessages` with `context` puts numbered sections in the system prompt; with `reliable: false` it includes the no-source line; with neither it still includes `NO_KNOWLEDGE_NOTE`.
6. After a send, the assistant message's `citations` equal the retrieved hits, and are empty on the no-source path.
7. A document whose text says "ignore previous instructions" appears only inside the quoted context block (assert on the built prompt).
8. Manual: with the fixture pack, a question it covers returns an answer with a source line; an uncovered ISU question says it cannot confirm and names an office; the app still builds and works offline after one online visit.

## Open questions (decide before coding)
1. **Tool for the pack build.** Hand-write `documents.json` for v0.1, or add a small Node script that turns a folder of Markdown files with front matter into `documents.json`? Recommendation: the script, about 40 lines, because the README plans a Markdown-based pipeline and hand-edited JSON will drift.
2. **Score threshold.** A fixed number tuned on the fixture pack is a guess for real content. Recommendation: ship a conservative default and tune it in Phase 7 with the 50 to 100 collected student questions (README 8.10).
3. **Context budget.** Prompt trimming is character-based (6000 characters) and the models run a 4096-token window. Three 800-character chunks plus rules fit, but this should be re-checked for Qwen 0.5B and SmolLM2 360M. Recommendation: cap context at about 2400 characters total.
4. **Filipino and mixed-language questions.** BM25 on plain tokens handles them without help, but stemming is English-only. Acceptable for v0.1?
5. **Real content.** Who supplies the verified Student Manual and Citizen's Charter text (README 8.9)? Code can ship with the fixture pack until then, but the site must say "not installed" and not present the fixture as ISU information.
