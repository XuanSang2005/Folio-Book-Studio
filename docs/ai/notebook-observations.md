# Gemini book-illustration notebook preflight

Run date: 2026-08-13

Notebook: official Google Gemini Cookbook `Book_illustration.ipynb`

These notes record the candidate's personal run. The full notebook did not complete, and no real image-generation success is claimed.

## Configuration and completed observations

- Text model: `gemini-3.6-flash`.
- Image model attempted: `gemini-3.1-flash-lite-image`.
- Service tier: `standard`.
- The notebook limits were changed to two character images and one chapter image.
- SDK installation, API-key retrieval, and client initialization succeeded.
- *The Wind in the Willows* was downloaded, saved as `book.txt`, and uploaded through the Files API.
- A book interaction was created from the uploaded document.
- Style generation succeeded by chaining from the book interaction ID without resending the manuscript.
- The generated style was classic Edwardian storybook watercolor and ink, with clockwork and retro-futuristic details.
- Structured character extraction succeeded and returned Mole, Water Rat, Mr. Toad, and Badger.
- Under the application cap, only Mole and Water Rat would be selected for portrait generation.

## Incomplete image flow

- The first image-generation attempt failed with HTTP 429.
- The reported cause was a Free Tier quota of zero for `gemini-3.1-flash-lite-image`.
- Portrait generation and the Chapter/Stage V flow were therefore not completed.
- No real image-generation success was observed.
- The remaining image flow will first be implemented and tested through the deterministic fake gateway.
- A paid-key end-to-end UAT remains mandatory before final submission.

## Engineering lessons

- Upload the source once and represent it with a durable remote file reference.
- Checkpoint each successful provider sub-call separately.
- Continue later stages from stored interaction IDs instead of resending the manuscript.
- Keep text and image interaction chains separate.
- Enforce product caps server-side: at most two adult characters and one chapter.
- Disable provider and SDK retries in the product; retries are user-triggered only.
- Represent quota and billing failures as persisted, typed, retryable application errors.
- Mock tests prove application orchestration but do not replace a real paid-key UAT.

Sensitive values are intentionally omitted: API keys, complete interaction IDs, the full manuscript, base64 image data, and billing information.
