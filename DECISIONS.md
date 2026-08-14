# Engineering decisions

These decisions summarize the strongest implementation choices. They are based on the recorded task prompts, migration history, tests, and code; they are not reconstructed conversations or quotations.

## 1. Replace vinext instead of preserving a Next-shaped runtime

Codex initially treated the repository’s Next-shaped files and unavailable in-app browser registry as possible constraints on the migration. I corrected that interpretation: the running application was vinext, the browser limitation was tooling-only, and the target was React/Vite with Fastify—not vinext and not standard Next.js. We captured the accepted UI through local Playwright, moved it to the required workspace, and kept the large custom stylesheet as the visual authority while using Tailwind selectively. This made the runtime understandable and matched the brief without redesigning the product. The accepted cost is that a parity-sensitive stylesheet remains large and future Tailwind conversion must be incremental and visually verified.

## 2. Make SQLite claims—not browser state—the duplicate-execution guarantee

The early migrated UI and AI-generated demo store could prevent a second click only inside one browser state. I rejected treating that as a production concurrency guarantee because refreshes, tabs, and two server instances could still race. The final design uses a short atomic SQLite claim, durable attempts, a live lease, heartbeat extension, and active-attempt fencing; provider work occurs after the transaction. This makes the backend authoritative and proves that a live duplicate does not start another provider sequence. The cost is a deliberately single-host design: a killed foreground run waits for lease expiry and explicit Recover, and true distributed exactly-once execution is not claimed.

## 3. Reject automatic SDK retries and model fallback

Codex’s initial integration path allowed using the Google SDK, but it could not point to one demonstrable option that disabled every automatic retry across both Files and Interactions requests. I required user-triggered retries only because a hidden retry can spend quota twice, and I also rejected automatic model fallback because it changes cost, quality, capability, and provenance without consent. The implemented gateway therefore uses native `fetch`, one attempt per request, explicit timeouts, environment-selected models, and transport tests proving one simulated 429 produces one outgoing interaction request. The cost is maintaining request/response parsing locally and updating those compatibility tests when the provider contract changes.

## 4. Split provider work into durable, owned checkpoints

An earlier AI approach could have represented Stage I as one coarse “Gemini context” operation. I required source upload, book-context creation, style, characters, image context, each portrait, chapter, and final illustration to have separate provider-operation and persistence boundaries. The source URI and root interaction belong to the project; later terminal interactions belong to their step or item. This allows a retry to reuse completed work, proves that the manuscript upload happens once in the fake full run, and avoids silently rebuilding expired context. The cost is more state and reconciliation code, plus an explicit `CONTEXT_EXPIRED` failure when required remote context has expired.

## 5. Use one explicit Stage V portrait-reference strategy

Codex considered combining a continuing image chain with explicit portrait references for the final illustration. I rejected the mixed approach because its context ownership and billing behavior were harder to reason about and the notebook evidence did not establish it as necessary. Stage V now starts a fresh image interaction with the selected style, the chapter brief, and only the locally stored portraits referenced by that chapter; it does not resend the manuscript or inherit an old image interaction. Portraits are persisted individually so a successful first portrait survives a later failure. The cost is that visual continuity depends on explicit local portrait references rather than an indefinitely reusable remote image conversation.

## 6. Keep the assessed release local and private

AI planning surfaced cloud deployment, queues, Redis, object storage, Docker, and broader authentication as possible production patterns. I kept them out because the brief evaluates a local single-host application and those additions would increase operational and privacy surface without improving the required workflow. Fastify serves the SPA and API from one loopback origin; SQLite and a private local filesystem remain the durable stores; artifacts are streamed only through owner-checked APIs. The cost is an honest scale boundary: horizontal operation would require shared database, object storage, and job coordination, and no public demo is provided.

## If I had one more day

I would first fund and run one bounded, public-domain Gemini image UAT through all five stages. I would record model IDs, provider-operation counts, per-stage duration, image counts, source-upload count, context-expiry behavior, and any real response-shape differences, then update the transport fixtures and documentation only where that run produced evidence. That is more valuable than adding polish because the current unknown is paid image behavior: the notebook’s first image request stopped at HTTP 429 with zero quota, while all current end-to-end success evidence is deterministic and keyless.
