# Emotion Planet

Public-installation prototype: classify free-text emotion (OpenAI), paint on pre-built **blob + terrain** GLB pairs, capture a transparent **PNG sprite** for a shared **matrix** view.

## Routes

- **`/`** — Input: describe your feeling → AI picks an archetype (`emotion_a` / `emotion_b` / `emotion_c` for MVP) + valence/activation → paint on the 3D models → **Confirm & send** (broadcast + local storage).
- **`/matrix`** — Matrix display: billboard sprites on a **valence (X) × activation (Y)** plane; click a sprite for detail (lazy-loaded GLB + saved paint + text). Open this on a second screen/tab; **BroadcastChannel** keeps it in sync with new submissions.

## Setup

1. `npm install`
2. Create `.env.local` with **`OPENAI_API_KEY=sk-...`** (recommended). The server loads `.env` then `.env.local` via `server/envBootstrap.ts` with **override**, so the file wins over an empty shell variable. Aliases: `VITE_OPENAI_API_KEY`, `API_KEY` — see `src/config/openaiKey.ts`. On startup the API logs whether a key was found.
3. Optional — skip the API while testing paint/matrix: set `VITE_USE_MOCK_CLASSIFY=true` in `.env.local` and **restart** `npm run dev`, **or** open `http://localhost:3000/?mock=1` (no env needed). Edit the fixed result in `src/ai/mockClassification.ts`.
4. `npm run dev` — http://localhost:3000

Submissions are **JPEG-compressed** before `localStorage` save so the matrix feed does not hit browser quota. Open **`/matrix` in another tab** so it receives `storage` updates after send, or reload `/matrix`.

## Assets (MVP)

Place GLBs under `public/assets/emotions/`:

- `emotion_a_adoration/*` — `blob.glb`, `terrain.glb`
- `emotion_b_excitement/*`
- `emotion_c_awe/*`

See `src/config/emotions.ts` for IDs and paths.

## Architecture

- **AI** — `gpt-4o-mini` JSON: `emotion_id`, `emotion_label`, `confidence`, `valence`, `activation`, `reasoning_short`.
- **Paint** — separate canvas textures per blob/terrain; UV raycast painting.
- **Storage** — `localStorage` submission list (`src/storage/submissions.ts`); swap for a backend later.
- **Matrix** — lightweight sprites from PNG data URLs; full 3D only in the detail popup.
