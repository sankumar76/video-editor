# Progress

## M0: Scaffold and the exe pipeline

- [x] Electron + Vite + React + TypeScript project, ESLint, Prettier, Vitest, Playwright set up.
- [x] Window with a placeholder layout (media panel, preview, timeline, inspector), dark theme.
- [x] FFmpeg and FFprobe bundled; app shows their version on an About screen to prove they run from the packaged build.
- [x] `npm run build:exe` produces a portable `Cutline.exe` in `/dist` that launches by double-click on a clean Windows machine (no Node, no FFmpeg installed).
- [x] Single-instance lock; app icon; window state (size/position) remembered.
- [x] README documents dev run and exe build.

**Acceptance:** the built exe opens, shows the layout, and About shows working FFmpeg. Verified by launching the packaged build, not just `npm run dev`.

Status: **done.** Verified by launching `dist/win-unpacked/Cutline.exe` (what the portable exe extracts and runs) directly: window opens with the four-panel dark layout, and the About dialog reports FFmpeg `6.1.1-essentials_build-www.gyan.dev` and FFprobe `4.0.2` both resolving from `resources/ffmpeg/` (the packaged `extraResources` path, not `node_modules`) and both executing successfully. `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run test:e2e` all pass. See `DECISIONS.md` for the FFmpeg/FFprobe version mismatch to revisit in M1, and the `ELECTRON_RUN_AS_NODE` dev-environment note.

## M1–M7

Not started. See `SPEC.md` section 5 for the full milestone list.
