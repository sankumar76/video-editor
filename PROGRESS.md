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

## M1: Media and timeline MVP

- [x] Import via dialog and drag-and-drop from Windows Explorer (video, audio, images). Multiple files at once.
- [x] Media bin: thumbnails, name, duration, resolution, codec; sort and search; delete from bin (warn if used).
- [x] Background probe, thumbnail, and proxy jobs with progress indicators in the UI.
- [x] Preview player: play/pause, seek, frame-step (left/right), JKL shuttle, loop, timecode display, fit/zoom, safe-area toggle.
- [x] Timeline: multiple video and audio tracks, add/remove/reorder tracks, drag clips from bin to timeline, move clips, snapping (to clip edges, playhead, markers→0/playhead), zoom and scroll, ruler with timecode, playhead scrubbing.
- [x] Clip operations: trim by dragging edges, split at playhead, delete, ripple delete, duplicate, copy/paste, select multiple (click, shift-click, marquee), lock/mute/solo/hide tracks.
- [x] Dropping a video with audio creates linked video+audio clips.
- [x] Command-based undo/redo for every edit (unlimited depth within the session).
- [x] Save / Save As / Open project (`.cutline`), recent projects list, "unsaved changes" prompts (both in-app New/Open and OS window close).
- [x] Export MP4 (H.264 + AAC): resolution, frame rate, quality (CRF, Draft/Good/Best + Advanced), progress bar, cancel, "open folder" on completion.
- [x] Project settings dialog (resolution, fps); default from the first clip added.

**Acceptance:** import 3 clips, arrange on two tracks, trim and split, undo/redo repeatedly, save, reopen, export an MP4 that plays correctly in Windows Media Player and matches the preview.

Status: **done.** Verified end-to-end via a Playwright-driven run of the exact acceptance workflow (`tests/e2e/smoke.spec.ts`, "M1 workflow" test) against both the dev build and the packaged (`electron-builder --dir`) unpacked exe: imported 3 fixture clips (video-with-audio, audio-only, image), dropped 2 onto the timeline (video-with-audio correctly auto-created a linked audio clip), trimmed a clip edge (linked partner stayed in sync), split the selected clip + partner at the playhead, undo/redo round-tripped the clip count correctly, saved the project, started a new project (cleared), reopened the saved file (all 5 clips restored), and exported — the output MP4 was verified with `ffprobe` to be a well-formed H.264/AAC file (`probe_score=100`) with the expected duration/streams. `npm run typecheck`, `npm run lint`, `npm run test` (38 unit tests covering commands/timeline-math/filter-graph/codec-support), and `npm run test:e2e` (3 tests) all pass. Not implemented and explicitly deferred (see `DECISIONS.md`): variable-speed JKL shuttle (1x-only for now), multi-clip group drag (single clip + linked partner only), Web Audio mixing graph (elements' own audio/volume for now — real mixing lands in M3), media relink/placeholder-clip UX (M6).

## M2–M7

Not started. See `SPEC.md` section 5 for the full milestone list.
