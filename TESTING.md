# Testing and verification

Final keyless verification date: **2026-08-14**. Environment: macOS 26.5.1 arm64, Node.js 26.5.0, npm 11.17.0. Every automated command set `GEMINI_API_KEY=`. No test made a billed or external provider request; npm registry access was used only for installation and audits.

## Strategy

The default suite tests domain behavior against temporary SQLite databases and private data directories. IDs, time, heartbeat behavior, and Gemini outputs are deterministic. Fastify integration tests use `app.inject` except where a controlled loopback server is specifically required for provider-transport or built-runtime behavior. Frontend tests use React Testing Library with typed API fixtures and fake timers where needed. The visual harness runs local headless Chromium and intercepts same-origin `/api` calls with deterministic fixtures.

Backend coverage includes migrations and constraints; email continuity and owner isolation; paste/upload validation and atomic source storage; project numbering; five-step ordering; live duplicate claims; leases, Recover, explicit Retry, heartbeat, and stale-attempt fencing; restart persistence; partial portrait checkpoints; artifact byte/MIME/path validation; provider-operation provenance; readiness; same-origin protection; log redaction; and graceful shutdown.

The fake five-stage integration performs exactly nine gateway operations for a two-adult project:

```text
uploadSource ×1
createBookContext ×1
defineStyle ×1
extractCharacters ×1
createImageContext ×1
generatePortrait ×2
extractChapter ×1
generateIllustration ×1
```

It persists one style, two validated adults, two independent portraits, one chapter, one final illustration, and a Done project. Resume tests prove the source is not uploaded again, succeeded portraits survive partial failure, and missing-only Retry does not repeat completed items.

Transport-level Gemini tests bind only a controlled local server. They assert the official Files and Interactions request shapes, source-document URI reuse without manuscript resending, sequential portrait chaining, a fresh Stage V request with relevant portrait references, JPEG output requests with defensive PNG/JPEG/WebP parsing, current token-usage fields, and safe typed errors. The controlled HTTP 429 case produces exactly one interaction request and no automatic retry or fallback. These are compatibility tests, not a real Gemini run.

Frontend coverage includes API/schema errors, initial unauthenticated routing, expired-session cache clearing without loops, identity and sign-out success/failure, Library states, exact paste/multipart project creation, authoritative persisted Studio states, conditional polling, stale mutation reconciliation, explicit Retry/Recover, manuscript behavior, per-item portraits, and authenticated artifact URLs.

## Final command output

The original workspace was reinstalled with `GEMINI_API_KEY= npm ci`, then verified with `GEMINI_API_KEY= ./test.sh`:

```text
npm run typecheck
Contracts, frontend, and backend passed.

npm run lint
Contracts, frontend, backend, and operational scripts passed.

npm test
Frontend: 10 files passed, 38 tests passed.
Backend: 16 files passed, 106 tests passed.
Total: 26 files passed, 144 tests passed.

npm run build
Contracts passed.
Vite 8.2.1 transformed 263 modules and built frontend/dist.
TypeScript built backend/dist.

npm audit --omit=dev
found 0 vulnerabilities

npm audit
found 0 vulnerabilities

Built-server smoke passed at http://127.0.0.1:62960
Phase 5 verification passed.
```

The smoke checked compatibility health, liveness, readiness, `/library`, `/volumes/new`, a direct `/volumes/<id>` route, JSON-only unknown `/api/**` handling, and private-data non-exposure. The server used an isolated temporary database/data directory and was terminated and cleaned by the script trap.

## Clean-room rehearsal

A temporary directory was created with `mktemp -d`. `rsync -a` copied the source while explicitly retaining `.env.example` and excluding `.git`, local `.env` variants, every `node_modules`, `data`, SQLite/WAL/SHM files, build output, TypeScript build info, and temporary files. The pre-install audit found no Git metadata, local environment, runtime data, build output, database, or Google-key-shaped value; confirmed executable bits on `start.sh` and `test.sh`; and asserted that every Phase 6 deliverable was present.

Actual result:

```text
Final clean-room pre-install hygiene and deliverable checks passed.
npm ci: added 533 packages; found 0 vulnerabilities.
Frontend: 10 files, 38 tests passed.
Backend: 16 files, 106 tests passed.
Production and full audits: 0 vulnerabilities.
Built-server smoke passed at http://127.0.0.1:49596.
Explicit second built-server smoke passed at http://127.0.0.1:49627.
Final clean-room install, full gate, and explicit built-server smoke passed.
Final clean-room temporary directory removed.
```

npm 11 emitted an `allow-scripts` review warning for native/build dependencies, but the clean install, SQLite-backed tests, production builds, and both smoke runs completed successfully. No repository or npm configuration was changed in response.

The final filename-only hygiene scan found that the built visual start had initialized an empty local `data/` database plus WAL/SHM sidecars. Read-only counts confirmed zero users, projects, sessions, characters, and chapters. The generated directory was moved to recoverable temporary quarantine outside the repository. The repeated scan found only `.env.example`; no key- or cookie-shaped value, private runtime file/directory, deployment configuration, stale Next/vinext/Worker filename, simulated frontend copy, or broken local Markdown link. Ignored `backend/dist`, `frontend/dist`, and `packages/contracts/dist` remained as expected local build output.

## Visual and manual checks

The final capture ran against the built Fastify server at `http://127.0.0.1:63001` using an existing local Chromium shell. It regenerated 15 screenshots at `1440×1000` and `390×844` and passed 41/41 assertions with:

```text
application console errors: 0
page errors: 0
unexpected failed requests: 0
external/provider requests: 0
stage manuscript refetches: 0
duplicate stage-detail reconciliation: 0
recovery manuscript/detail refetches: 0
```

Desktop Library/Studio and mobile Studio captures were inspected manually with no Phase 6 visual change. Pixelmatch compared all 15 files: maximum different-pixel ratio `0.8328350953943371`, mean ratio `0.18251781632708175`, and mean aligned absolute color delta `6.908033954689597`. The raw comparison is against the original pre-server baseline and includes approved Phase 4 content removal, changed persisted values, rasterization, and recorded scroll offsets; it is evidence for inspection, not a zero-difference CI threshold.

## Deliberate omissions

The normal gate does not download a browser or run screenshots. Audits may contact npm, but application tests use no provider network. The suite does not prove multi-host operation, exactly-once upstream billing across process death, automatic remote-context rebuilding, public authentication, or public deployment because those are outside the local assignment. Static prototype-image provenance requires candidate confirmation.

## Real Gemini UAT — blocked

A successful real end-to-end image run has **not** occurred. The candidate’s official Book Illustration notebook preflight verified key access, source upload, book context, style generation, and structured character extraction. The first image request returned HTTP 429 because the account reported free-tier image quota `0`; real portraits and the final illustration were not produced.

Therefore fake integration and local transport results must not be described as real Gemini success. Submission readiness remains blocked until the candidate obtains billing/model access and personally completes the bounded checklist in `docs/submission-checklist.md`, then records only redacted, factual results here.
