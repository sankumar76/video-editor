# Cutline: Windows Desktop Video Editor (Product & Build Spec)

"Cutline" is a placeholder name. Rename it anywhere.

---

## 0. How Claude Code should use this document

1. Read this whole file before writing any code.
2. Build **one milestone at a time**, in order (M0, M1, M2, ...). Do not start a milestone until the previous one meets its acceptance criteria.
3. After each milestone: run the app, run the tests, fix what is broken, update `PROGRESS.md` (tick the checklist), and make a git commit named after the milestone.
4. Do not add features that are not in this spec. If something is ambiguous or a decision is needed, choose the simplest reasonable option, record it in `DECISIONS.md`, and continue. Only stop to ask if the choice is expensive to reverse.
5. Keep a `README.md` current with: how to install dependencies, how to run in dev, how to build the exe, and how to run tests.
6. Everything must work on **Windows 10 and 11 (64-bit)**. Never hardcode `/` path separators; handle spaces, Unicode, and long paths in file names.

---

## 1. Product goal

A desktop video editor for Windows that a person can double-click (`Cutline.exe`) and start editing immediately, with no installer prompts, no command line, and no separate FFmpeg install. Multi-track timeline editing, text, audio, transitions, effects, captions, and export to common formats.

**Primary user:** a solo creator making YouTube, social, and personal videos.
**Feel:** closer to CapCut or DaVinci Resolve's Cut page than to a full broadcast suite. Fast, keyboard-friendly, forgiving (undo everywhere).

### Non-goals for v1
- Mac/Linux builds (keep code portable, but only Windows is tested)
- Cloud sync, collaboration, accounts, telemetry
- 3D, motion-graphics node editor, advanced color grading panels (scopes, node graphs)
- Plugin marketplace (an internal effect registry is fine; see M6)

---

## 2. Tech stack (defaults; change only if there is a strong reason, and record it in DECISIONS.md)

| Concern | Choice |
|---|---|
| App shell | Electron (latest stable), TypeScript everywhere |
| UI | React + Vite, Zustand (or Redux Toolkit) for state, CSS modules or Tailwind |
| Media engine | FFmpeg and FFprobe binaries bundled with the app (`ffmpeg-static` / `ffprobe-static` or a vendored Windows build) |
| Preview renderer | Canvas/WebGL compositor in the renderer process, fed by hidden `<video>` elements and Web Audio |
| Export | FFmpeg run as a child process from the main process, driven by a `filter_complex` graph generated from the project model |
| Packaging | `electron-builder`: a **portable single `.exe`** (primary deliverable) plus an NSIS installer (secondary) |
| Tests | Vitest for unit tests, Playwright (Electron mode) for end-to-end smoke tests |
| Lint/format | ESLint + Prettier, `strict` TypeScript |

### Important constraint: codec support in preview
Electron's Chromium cannot natively play some common formats (HEVC/H.265 in many cases, ProRes, some MKV/AVI/MOV variants, many audio codecs). Therefore, on import:
1. Run `ffprobe` and read codec, resolution, frame rate, duration, audio streams, rotation, and color info.
2. If the file is not reliably playable in Chromium, **automatically generate a proxy** (H.264 + AAC, 720p, constant frame rate) in the background and use it for preview only.
3. Export always reads the **original** files, never proxies.

---

## 3. Architecture

- **Main process:** windowing, menus, file dialogs, project save/load, autosave, FFmpeg/FFprobe process management, export jobs, proxy/thumbnail/waveform jobs, single-instance lock, crash logging.
- **Renderer process:** the UI, the timeline, the preview compositor, and the project store.
- **Preload + typed IPC:** no `nodeIntegration` in the renderer. Every IPC channel is typed and validated.
- **Job queue (main process):** background jobs (probe, thumbnails, waveforms, proxies, export) with priority, progress events, and cancellation. The UI must never block on these.
- **Project model is the single source of truth.** The preview and the FFmpeg export both derive from the same model, so what you see is what you export. Put the model in a pure TypeScript package with no Electron or DOM dependencies so it is unit-testable.
- **Command pattern for all edits:** every change to the project goes through a command with `do()` and `undo()`. This gives undo/redo for free and enables autosave diffs. Build this in M1; do not retrofit.

Suggested layout:
```

/src/main Electron main process (jobs, ffmpeg, fs, ipc)
/src/preload typed bridge
/src/renderer React app (panels, timeline, preview)
/src/core pure model, commands, timeline math, filter-graph builder
/tests unit + e2e
/resources icons, default fonts, LUTs, transition presets

```

---

## 4. Data model (v1 schema, versioned)

Project file: `*.cutline` (JSON, UTF-8, `"schemaVersion": 1`). Include a migration function from day one.

- **Project:** name, resolution, frame rate, sample rate, background color, list of media items, list of sequences (v1: one active sequence, but keep it a list for compound clips later).
- **MediaItem:** id, original path, relative path (for relinking), type (video/audio/image), duration, streams info, proxy path, thumbnail path, waveform path, file hash or size+mtime for relink checks.
- **Track:** id, type (video/audio), name, locked, muted, solo, hidden, height.
- **Clip:** id, mediaId, trackId, timeline start, source in, source out, speed, reverse, enabled, transform (position, scale, rotation, anchor, crop, opacity), blend mode, effects list, audio (volume, pan, fade in/out), keyframes per animatable property, linked-clip group id (for video+audio pairs).
- **Text clip / Shape clip / Solid clip:** generated clips with their own properties.
- **Transition:** type, duration, alignment, between two clips.
- **Marker:** time, label, color.
- **Caption:** start, end, text, style.

Rules: times are stored as integer ticks (or rational) to avoid floating-point drift, never as float seconds. Media paths never assumed absolute (support relink).

---

## 5. Milestones

### M0: Scaffold and the exe pipeline (do this FIRST)
Goal: prove the "double-click an exe" path before writing any editing code.
- [ ] Electron + Vite + React + TypeScript project, ESLint, Prettier, Vitest, Playwright set up.
- [ ] Window with a placeholder layout (media panel, preview, timeline, inspector), dark theme.
- [ ] FFmpeg and FFprobe bundled; app shows their version on an About screen to prove they run from the packaged build.
- [ ] `npm run build:exe` produces a **portable `Cutline.exe`** in `/dist` that launches by double-click on a clean Windows machine (no Node, no FFmpeg installed).
- [ ] Single-instance lock; app icon; window state (size/position) remembered.
- [ ] README documents dev run and exe build.

**Acceptance:** the built exe opens, shows the layout, and About shows working FFmpeg. Verified by launching the packaged build, not just `npm run dev`.

### M1: Media and timeline MVP
- [ ] Import via dialog and **drag-and-drop from Windows Explorer** (video, audio, images). Multiple files at once.
- [ ] Media bin: thumbnails, name, duration, resolution, codec; sort and search; delete from bin (warn if used).
- [ ] Background probe, thumbnail, and proxy jobs with progress indicators in the UI.
- [ ] Preview player: play/pause, seek, frame-step (left/right), JKL shuttle, loop, timecode display, fit/zoom, safe-area toggle.
- [ ] Timeline: multiple video and audio tracks, add/remove/reorder tracks, drag clips from bin to timeline, move clips, snapping (to clip edges, playhead, markers), zoom and scroll, ruler with timecode, playhead scrubbing.
- [ ] Clip operations: trim by dragging edges, split at playhead, delete, ripple delete, duplicate, copy/paste, select multiple (click, shift-click, marquee), lock/mute/solo/hide tracks.
- [ ] Dropping a video with audio creates linked video+audio clips (can be unlinked).
- [ ] **Command-based undo/redo** for every edit (unlimited depth within the session).
- [ ] Save / Save As / Open project (`.cutline`), recent projects list, "unsaved changes" prompts.
- [ ] Export MP4 (H.264 + AAC): resolution, frame rate, quality (CRF or bitrate), progress bar with time remaining, cancel, "open folder" on completion.
- [ ] Project settings dialog (resolution, fps); default from the first clip added.

**Acceptance:** import 3 clips, arrange on two tracks, trim and split, undo/redo repeatedly, save, reopen, export an MP4 that plays correctly in Windows Media Player and matches the preview.

### M2: Editing depth
- [ ] Transform tools: position, scale, rotation, anchor, crop, opacity, flip, with on-canvas drag handles in the preview.
- [ ] Speed control: 0.1x to 8x, reverse, freeze frame. Audio pitch-preserving where possible.
- [ ] Ripple, roll, slip, and slide edit tools; ripple-delete gaps; insert vs overwrite drop modes.
- [ ] Markers (add, rename, jump, color), in/out range marking, "export range only".
- [ ] Timeline niceties: track height, clip color labels, thumbnails on clips, waveforms on audio clips, mini-map, "zoom to fit", "zoom to selection".
- [ ] Inspector panel showing the properties of the selected clip.
- [ ] Customizable keyboard shortcuts (settings screen, conflict detection, reset to default). See section 7.
- [ ] Autosave every 30 s to a recovery file, and crash recovery prompt on next launch.

### M3: Text, audio, transitions
- [ ] **Text/titles:** font family (all installed Windows fonts), size, weight, color, outline, shadow, background box, alignment, letter/line spacing, position; on-canvas editing; a handful of presets.
- [ ] **Text animations:** fade, slide, typewriter, pop (built on keyframes).
- [ ] Generated clips: solid color, gradient, basic shapes.
- [ ] **Transitions:** cross dissolve, dip to black/white, wipe (4 directions), slide, zoom. Drag onto a cut; adjust duration and alignment.
- [ ] **Audio:** per-clip volume, pan, fade in/out handles, track volume, mute/solo, master meter (peak), waveform display, voiceover recording from a microphone (device picker), audio-only tracks.
- [ ] Audio effects: 3-band or parametric EQ, noise reduction (FFmpeg `afftdn` is fine), compressor, normalize loudness (target LUFS), audio ducking (music lowers under voice).
- [ ] Mixed audio preview through Web Audio in sync with video.

### M4: Keyframes, color, effects, compositing
- [ ] **Keyframes** for position, scale, rotation, opacity, volume, and effect parameters: keyframe lane in the timeline, linear/ease/hold/bezier interpolation, copy/paste keyframes.
- [ ] **Color:** brightness, contrast, saturation, exposure, temperature, tint, highlights/shadows, hue, curves, **`.cube` LUT import**, before/after toggle.
- [ ] **Effects:** blur, sharpen, vignette, grain, glow, mirror, pixelate, chroma key (green screen with spill control), stabilization (FFmpeg `vidstab`, two-pass, run as a job).
- [ ] **Blend modes** (multiply, screen, overlay, add, etc.) and **masks** (rectangle, ellipse, feather, invert).
- [ ] Picture-in-picture presets, overlays, watermark/logo with saved position.
- [ ] Effect stack per clip: add, remove, reorder, enable/disable, copy effects between clips.
- [ ] Preview compositor uses WebGL so effects and blend modes are real-time at 1080p on a mid-range GPU (fall back to lower preview resolution if frames drop).

### M5: Captions and export system
- [ ] Captions track: add/edit/split/merge captions, style presets, import/export **SRT** and VTT, burn-in on export or export as a sidecar file.
- [ ] Optional auto-captions using a **local** speech-to-text model (whisper.cpp binary or similar), run as a cancelable job with model-size choice; download the model on first use (never bundle a huge model in the exe).
- [ ] **Export presets:** YouTube 1080p/4K, Instagram/TikTok vertical 9:16, square 1:1, GIF, audio-only (MP3/WAV/AAC), ProRes-like high-quality intermediate, custom.
- [ ] Containers/codecs: MP4, MOV, WebM (VP9/AV1 if the FFmpeg build supports it), GIF.
- [ ] **Hardware encoding** auto-detect: NVENC, Quick Sync, AMF, with automatic fallback to `libx264` if the hardware encoder fails.
- [ ] Export queue: multiple jobs, pause/cancel, per-job logs, thumbnail export, "export current frame as PNG".
- [ ] Auto-reframe helper for vertical export: center crop with manual keyframed offset.

### M6: Performance and pro features
- [ ] Cached preview render ("render in/out range") for heavy sections; playback quality selector (Full / Half / Quarter).
- [ ] Scene-cut detection on import (optional) and one-click silence removal from audio.
- [ ] Nested sequences / compound clips.
- [ ] Multi-cam: sync by audio or timecode, switch angles live.
- [ ] Audio mixer with buses (dialog, music, effects) and master limiter.
- [ ] Variable-frame-rate handling (normalize at import), mixed frame rates in one timeline, rotation metadata, HDR-to-SDR tone-mapped preview.
- [ ] Interchange: import/export EDL, FCPXML, or OpenTimelineIO (pick one first).
- [ ] Internal **effect registry** so new effects are added by one file (parameters + shader + FFmpeg filter mapping).
- [ ] Media relink for missing files, "collect project" (copy all media next to the project).

### M7: Polish and release
- [ ] Dockable, resizable panels with saved layouts; dark/light theme.
- [ ] First-run welcome + short interactive tutorial; sample project.
- [ ] Preferences: default project settings, cache location and size limit with "clear cache", proxy behavior, autosave interval, hardware-acceleration toggle, language (English first, structure strings for i18n).
- [ ] Clear, human error messages (unsupported codec, disk full, missing file, FFmpeg failure with "copy log").
- [ ] Windows integration: `.cutline` file association, "Open with Cutline" for video files, taskbar progress during export, jump list for recent projects, HiDPI and per-monitor scaling, touchpad pinch-zoom on timeline.
- [ ] Accessibility: full keyboard navigation of panels, visible focus, sensible ARIA labels, respects reduced motion.
- [ ] Final packaging: portable exe + NSIS installer, version stamped, icon, no console window, tested on a clean Windows VM.
- [ ] Optional: check-for-updates (simple version check, no forced auto-update).

---

## 6. Cross-cutting requirements

**Reliability**
- Never lose work: autosave, crash recovery, atomic saves (write to temp then rename), keep the last 3 backups of the project file.
- Every background job is cancelable and reports progress; failures surface as readable messages, never silent.
- Missing media shows a placeholder clip and a "relink" action rather than breaking the project.

**Performance targets** (1080p30 project on a typical mid-range Windows laptop)
- App cold start to interactive window: under 4 seconds.
- Timeline stays at 60 fps UI while scrolling and zooming with 200+ clips.
- Playback of up to 3 stacked video tracks without dropped frames using proxies.
- Thumbnails and waveforms are generated in the background and cached on disk keyed by file hash.
- Memory: do not decode whole files into RAM; stream and cache.

**Correctness**
- Preview and export must match (same model, same frame math). Add a test that renders a known project and compares key frames.
- Audio/video sync must stay within 1 frame over a 60-minute timeline.
- Frame-accurate cuts on export.

**Security**
- `contextIsolation: true`, `nodeIntegration: false`, a strict CSP, and validated IPC inputs.
- Spawn FFmpeg with argument arrays (never string-concatenated shell commands). Sanitize any user text that goes into filter graphs (e.g., drawtext).

**Logging**
- Rotating log file in the app data folder; "Help > Open logs folder"; FFmpeg stderr captured per job.

---

## 7. Default keyboard shortcuts (all remappable)

| Action | Key |
|---|---|
| Play / pause | Space |
| Shuttle back / stop / forward | J / K / L |
| Frame back / forward | Left / Right |
| Jump to previous / next cut | Up / Down |
| Split at playhead | S (or Ctrl+B) |
| Delete / ripple delete | Delete / Shift+Delete |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y) |
| Copy / cut / paste | Ctrl+C / Ctrl+X / Ctrl+V |
| Duplicate | Ctrl+D |
| Select all | Ctrl+A |
| Set in / out point | I / O |
| Add marker | M |
| Zoom timeline in / out / fit | = / - / Shift+Z |
| Toggle snapping | N |
| Save / Save As / Open | Ctrl+S / Ctrl+Shift+S / Ctrl+O |
| Import media | Ctrl+I |
| Export | Ctrl+M |
| Full-screen preview | F |

---

## 8. Export pipeline details

- Build the FFmpeg command from the project model: one input per used media file (originals), `trim`/`atrim` + `setpts`/`asetpts` for source ranges and speed, `scale`/`crop`/`rotate`/`overlay` for transforms and layering, `xfade`/`acrossfade` for transitions, `drawtext` or pre-rendered PNG overlays for titles (pick whichever gives identical results to the preview), `amix`/`volume`/`afade` for audio.
- Long filter graphs go through `-filter_complex_script` (a temp file) to avoid Windows command-line length limits.
- Parse `-progress pipe:1` for percentage and ETA.
- Output to a temp file and rename on success; delete partials on cancel or failure.
- Two-pass or CRF options; expose "Quality" (Draft / Good / Best) in the simple UI and full controls under "Advanced".
- Keep a unit-tested `buildFilterGraph(project, settings)` function in `/src/core` so the export logic is testable without running FFmpeg.

---

## 9. Packaging and distribution (Windows)

- Primary: `Cutline-<version>-portable.exe` from `electron-builder` (`target: portable`). Double-click and it runs; no install, no admin rights.
- Secondary: NSIS installer (per-user install, desktop shortcut option, uninstaller, file association).
- FFmpeg/FFprobe are included via `extraResources` and resolved at runtime with `process.resourcesPath` in packaged builds (and from `node_modules` in dev). Verify both paths in tests.
- The build is **unsigned** by default, so Windows SmartScreen will show "Windows protected your PC"; document "More info > Run anyway" in the README. Code signing is optional and out of scope.
- Include license notices for FFmpeg and other third-party components (`THIRD_PARTY_LICENSES.txt` accessible from About).
- App data (cache, logs, autosave) lives under `%APPDATA%\Cutline`. Cache size is capped and clearable.

---

## 10. Testing and definition of done

A milestone is done only when all of these hold:
1. Every checklist item for the milestone works in the **packaged exe**, not just in dev mode.
2. Unit tests cover new model, command, and timeline-math logic (target: all commands have do/undo round-trip tests).
3. At least one Playwright end-to-end smoke test covers the milestone's main workflow.
4. No TypeScript errors, no ESLint errors, no console errors during a normal session.
5. `PROGRESS.md` is updated and the work is committed.

Keep a small fixtures folder of test media (short clips: H.264, HEVC, VFR phone video, audio-only, image, portrait-rotated) generated with FFmpeg's `testsrc` and `sine` sources so tests do not depend on large downloads.

---

## 11. Open decisions (Claude Code: resolve with sensible defaults and log in DECISIONS.md)

- Which FFmpeg Windows build to bundle (LGPL vs GPL; GPL is needed for `libx264`) and which hardware encoders it includes.
- Titles on export: `drawtext` vs pre-rendered PNG sequences (choose for preview/export parity).
- Interchange format for M6 (EDL vs FCPXML vs OTIO).
- Whether to move the preview compositor to a native/WASM path if Chromium decode limits become a bottleneck in M6.
