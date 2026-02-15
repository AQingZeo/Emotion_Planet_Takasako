# Emotion Planet

Map emotional text to a **seeded trigonometric polynomial**, then visualize it as a 2D axis, a 3D heat surface, and a displaced wireframe sphere.

## Routes

- **`/`** — Controller: text input, valence–arousal axis, 3D preview (heat + wireframe). Link to open full-screen display.
- **`/display`** — Full-screen 3D wireframe (e.g. second monitor). Syncs via `BroadcastChannel` and persists last state in `localStorage`.

## Setup

1. `npm install`
2. Create `.env.local` with `GEMINI_API_KEY=your_key` (optional; used for AI emotion classification).
3. `npm run dev` — open http://localhost:3000

## Architecture (plan)

- **Text → AI** → `{ valence, arousal, label, confidence }` (JSON only; fallback `{0,0}` on failure).
- **Seed** = `hash32(normalizeUnicode(text))` (deterministic).
- **Map** = tileable 2D trig polynomial \(H(u,v)\) with coefficients from seeded PRNG; **arousal** controls number of active Fourier modes (4–60); **valence** controls spectral tilt (round ↔ spiky).
- **Outputs:** (1) Axis view (2D canvas), (2) 3D heat surface (plane, 256×128 segments), (3) 3D wireframe (icosahedron displaced by map; optional UV scroll).
- Map is fixed per input; only UV scroll / camera motion animate.
