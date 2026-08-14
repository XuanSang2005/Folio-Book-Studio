# Engineering decisions

## Phase 4 — 2026-08-14

### Server cache and route access have separate responsibilities

TanStack Query owns session, project-list, project-detail, and manuscript request state with centralized keys and no automatic mutation retry. TanStack Router loaders call the same typed session query before protected components mount. This prevents a protected-page flash on direct navigation while keeping request deduplication, invalidation, polling, and abort behavior in one cache boundary.

Sign-out calls the backend first, clears all Query caches, and only then navigates to Login. Successful login also starts from a cleared cache before installing the new session. This prevents one email identity's Library or Studio data from appearing under a later identity.

### New Volume retains source intent until the backend accepts it

The create form remains local UI state, but upload mode retains the original `File` object and submits it as one multipart `file` part. Paste mode sends the distinct JSON contract. Reading an upload for the existing receipt preview does not convert it into pasted text, and backend field errors map back into the approved title/source error surfaces.

### Persisted steps drive Studio presentation

Studio does not reconstruct a mutable client project model. The current stage is the first server step that has not succeeded; failed, stuck, running, portrait, chapter, and illustration states come from the DTO. A run request is never retried automatically. Project detail polls at 1.5 seconds only while a run mutation is pending or a persisted step is visibly running; Recover returns to an explicit retryable state and never triggers Run.

### Visual regression uses the same API boundary without provider traffic

The Playwright harness intercepts same-origin `/api` routes with deterministic stateful fixtures, including session restoration, progressive stages, authenticated image paths, failures, and recovery. Production sample mode and localStorage are not reintroduced for screenshots, and the harness makes no Gemini or external provider request.

## Phase 3 — 2026-08-14

### Native fetch for Gemini transport

The real gateway uses a small native `fetch` transport rather than `@google/genai`. Current official documentation describes retry configuration in SDK areas but does not demonstrate one option that disables every automatic retry for both Files and Interactions. Native fetch makes the required behavior explicit: one request attempt, one timeout, no retry loop, and no fallback. The Files API still requires its documented two-request resumable protocol (start, then upload/finalize); neither request is retried.

The implementation follows the current official Files upload and Interactions shapes, restates request-scoped response configuration on every call, uses `service_tier: "standard"`, and extracts output from model-output content. Official references used for the implementation:

- https://ai.google.dev/api/files
- https://ai.google.dev/api/interactions
- https://ai.google.dev/gemini-api/docs/interactions
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/image-generation
- https://github.com/google-gemini/cookbook/blob/main/examples/Book_illustration.ipynb

### Deliberate model selection and no fallback

The product defaults remain `gemini-3.6-flash` for text and the quality-focused `gemini-3.1-flash-image` for images. The notebook's `gemini-3.1-flash-lite-image` remains an explicit `GEMINI_IMAGE_MODEL` override. Automatic fallback is rejected because it would change image quality, capability, provenance, and cost without user intent. Every provider operation records the configured model before the call and the provider-reported model after success.

### Stage V uses explicit local portrait references

Final illustration generation starts a fresh image interaction and supplies only the local portraits named by the persisted chapter, each paired with its character ID and name. It sends the chapter prompt and selected style, not the manuscript or an old image interaction. This is the single Stage V approach; no transition interaction or mixed chaining path is used.

### Provider identifiers have one domain owner

The root book interaction belongs to the project; generated style and character/chapter terminal interactions belong to their corresponding pipeline steps; portrait context belongs to the project; portrait interactions belong to characters; and the illustration interaction belongs to the chapter. Provider-operation rows record request IDs and symbolic context keys instead of duplicating authoritative interaction IDs.

### Local artifacts are private associations

Artifacts use server-owned, attempt-specific names under `DATA_DIR`, atomic rename, byte/MIME/magic validation, and database metadata including SHA-256. A file becomes visible only through a fenced succeeded character/chapter association and an authenticated owner-scoped API. Crash orphans may remain on disk for later maintenance but cannot be requested through the API.

### Paid image UAT is deferred

The candidate verified API-key access, Files upload, root interaction, style generation, and structured character extraction in the notebook. The candidate's free-tier image quota is `0`, and image generation returned 429. That record remains unchanged in `docs/ai/notebook-observations.md`. No real provider call was made in Phase 3 implementation or verification.
