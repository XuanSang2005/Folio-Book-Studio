# AI workflow evidence

This directory indexes only evidence that exists. It does not claim a successful paid image run and contains no API keys, full interaction IDs, private manuscript text, generated user data, hidden reasoning, or fabricated conversations.

## Available artifacts

- [Notebook observations](./notebook-observations.md) — the candidate’s dated record of the official Book Illustration notebook preflight, including the real quota-zero HTTP 429 result.
- [Prompt excerpts](./prompts/phase-prompts-excerpts.md) — exact, clearly delimited excerpts from the available Codex phase requests. They are not represented as complete transcripts.
- [Implementation plan](../implementation-plan.md) — requirements, invariants, phase gates, and assessment traceability.
- [Migration record](../migration-record.md) — the historical vinext-to-Vite/Fastify migration boundary.
- [Architecture evidence](../architecture.md) — runtime, persisted state, concurrency, provider-context, and scaling boundaries.
- [Agent context](../../AGENTS.md) — the constraints applied to coding-agent work.
- [Engineering decisions](../../DECISIONS.md) — six candidate-reviewable decisions, including AI overrides and accepted costs.
- [Testing report](../../TESTING.md) — keyless, clean-room, browser, and paid-UAT status.

## Candidate export still required

The complete Codex transcript/export is not stored in this repository. If the assessment requires full prompt/response history rather than representative exact excerpts, the candidate must export it manually before submission, review it for secrets and private content, and add only a redacted artifact. Do not reconstruct missing conversation text from memory.
