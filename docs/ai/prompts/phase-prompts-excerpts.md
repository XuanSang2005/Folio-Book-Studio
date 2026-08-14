# Codex phase-request excerpts

These are exact excerpts from the available task prompts. Each block is intentionally incomplete and is labeled as an excerpt; this file is not a transcript and contains no assistant hidden reasoning or reconstructed conversation.

## Phase 0 — exact excerpt

> Implement **Phase 0 only: shared contracts, runtime configuration, dependency-injection foundation, and deterministic test harness**.
>
> ## Critical constraints
>
> - Do not run any Git command.
> - Do not create or switch branches.
> - Do not stage, commit, merge, push, reset, or rewrite history.
> - Do not redesign or visually change the frontend.
> - Do not alter the existing routes or accepted UI behavior.
> - Do not implement SQLite, sessions, project APIs, file uploads, or the real Gemini API yet.
> - Do not add TanStack Query yet.
> - Do not remove `DemoStore` or the simulated pipeline yet.
> - Do not request or use a Gemini API key.
> - Do not introduce Redis, queues, Docker, cloud storage, event sourcing, or generic workflow infrastructure.
> - Keep the implementation lean and directly justified by the assessment.

## Phase 1 — exact excerpt

> Implement Phase 1 only: SQLite persistence, identity sessions, projects, and private manuscript storage.
>
> Mandatory prerequisite:
> - Confirm `docs/ai/notebook-observations.md` exists and contains the candidate’s genuine notes from personally running notebook steps 1–5.
> - Do not invent, rewrite, or claim to have performed this notebook run.
> - If that evidence is missing, stop and ask the user to complete it.
>
> Critical constraints:
> - Do not run any Git command, including read-only Git commands.
> - Do not stage, commit, branch, push, reset, inspect Git state, or modify remotes.
> - Do not implement pipeline claiming, retries, recovery, leases, heartbeat, Gemini calls, or frontend API cutover.
> - Do not modify frontend source, styling, routes, text, imagery, or localStorage behavior.

## Phase 2 — exact excerpt

> Continue with Phase 2 only in:
>
> `/Users/macbookpro/Documents/Gradion-Folio-Book-Studio`
>
> Phase 1 has been independently audited and passed. The genuine notebook observations already exist at:
>
> `docs/ai/notebook-observations.md`
>
> Do not block on the incomplete paid image UAT. That limitation is documented honestly and real Gemini remains outside Phase 2.
>
> ## Phase boundary
>
> Implement only the durable pipeline state machine, concurrency protection, retry and recovery behavior.
>
> Use deterministic fake execution only.

## Phase 3 — exact excerpt

> Implement Phase 3 only for:
>
> `/Users/macbookpro/Documents/Gradion-Folio-Book-Studio`
>
> Phase 2 has passed audit. Preserve its state-machine, concurrency, lease, recovery, retry, and fencing behavior.
>
> ## Phase boundary
>
> Implement Phase 3 only:
>
> - Fake five-stage Gemini pipeline
> - Real local artifact persistence
> - Structured output and image validation
> - Provider-operation provenance
> - Real Gemini adapter implementation and transport-level tests
> - Owner-scoped artifact APIs
>
> Do not start Phase 4.

## Phase 4 — exact excerpt

> Implement Phase 4 only: replace the simulated frontend state with the existing persistent backend APIs while preserving the approved UI.
>
> Important constraints:
> - Do not run any Git command, including read-only Git commands.
> - Do not start Phase 5.
> - Do not make any real Gemini or external provider call.
> - Do not redesign the UI.
> - Preserve existing DOM structure, CSS class names, typography, spacing, responsive behavior, dialogs, focus management and visual assets wherever practical.
> - Backend SQLite, pipeline state machine, leases, fencing, provider operations and Gemini adapter must remain unchanged except for a minimal response DTO extension genuinely required by the existing UI.
> - No authoritative project/session/pipeline state may remain in localStorage.

## Phase 5 — exact excerpt

> Implement Phase 5 only: local release, security hardening, operational scripts, and final runtime verification.
>
> Important rules:
>
> - Do not run any Git command, including read-only Git commands.
> - Do not stage, commit, branch, reset, push, or modify Git configuration.
> - Do not call Gemini or any external product/provider API.
> - npm registry access is allowed only when required to update dependencies.
> - Do not begin Phase 6 documentation/submission work.
> - Do not redesign or visually alter the approved UI.
> - Do not change pipeline ordering, persistence semantics, retry/recovery behavior, Gemini prompts, provider chaining, database schema, or artifact ownership unless a Phase 5 test exposes a real defect.

## Phase 6 — exact excerpt

> Implement Phase 6 only: final deliverables, AI-workflow evidence, clean-room rehearsal, and submission-readiness audit.
>
> ## Non-negotiable rules
>
> - Do not run any Git command, including read-only Git commands.
> - Do not stage, commit, branch, reset, push, inspect Git history, or alter Git configuration.
> - Do not make a real Gemini/provider request.
> - Explicitly set `GEMINI_API_KEY=` for automated verification.
> - Do not deploy or publish the application.
> - Do not redesign the UI.
> - Do not add bonus features.
> - Do not change working pipeline/storage/concurrency behavior unless final verification exposes a concrete defect.
> - Do not invent AI conversations, disagreements, notebook results, test output, or provider results.
> - Use only genuine evidence already present in the repository and this task context.
> - Use `apply_patch` for authored changes.

## Completeness note

The full phase prompts and assistant responses are not present here. The candidate must export the original Codex transcript manually if full-conversation evidence is required.
