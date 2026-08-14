# Project context for coding agents

## Product and runtime

Gradion Folio is a local, single-host book-illustration studio. The browser creates private manuscript projects and advances them manually through five ordered stages:

1. Style
2. Characters
3. Portraits
4. Chapters
5. Illustrations

The server enforces a maximum of two adult characters and one chapter. Do not redesign the approved frontend, change its routes or copy, or mechanically replace the parity-sensitive custom CSS without desktop/mobile visual verification.

## Pipeline invariants

- The backend and SQLite state are authoritative; localStorage is not production state.
- Upload the source once, create the book context once, and reuse persisted provider context. Never resend the manuscript in later calls.
- Never add automatic Gemini retries or model fallback. Retry is an explicit user action on a failed step.
- A running step with an expired lease is derived as `stuck`. Recover abandons the expired attempt and produces a failed, retryable step; Recover performs no generation.
- Claims are short atomic SQLite transactions. Provider work happens outside a transaction.
- Every checkpoint and terminal write is fenced by the active attempt ID. A stale runner must not publish results.
- Preserve successful item checkpoints. Portraits are persisted and associated individually.

## Ownership and privacy

- SQLite owns users, sessions, projects, steps, attempts, provider-operation metadata, and artifact associations.
- The local filesystem owns canonical manuscripts and image bytes below ignored `data/` paths.
- Store only server-generated relative paths. Private artifacts are served only through authenticated, owner-scoped API routes.
- Never log or expose keys, cookies, session tokens, authorization headers, manuscript/prompt text, upload bytes, base64 images, or raw provider responses.
- Do not add public deployment, cloud storage, Docker, Redis, queues, or multi-host claims unless the product scope is explicitly changed.
- Default tests must set or assume `GEMINI_API_KEY=` and must not call a real provider.

## Verification

Run from the repository root:

```bash
npm run typecheck
npm run lint
npm test
npm run build
./test.sh
npm run visual:after
npm run visual:compare
```

The visual commands require local Chromium and a reachable local app. Inspect both `1440x1000` desktop and `390x844` mobile captures; historical pixel differences are not permission to alter the UI.

Git history and all Git commands remain candidate-controlled. Agents must not run Git commands unless the candidate explicitly changes that rule.
