# Cutline

A Windows desktop video editor. See [SPEC.md](SPEC.md) for the full product and build spec, [PROGRESS.md](PROGRESS.md) for milestone status, and [DECISIONS.md](DECISIONS.md) for choices made where the spec left things open.

Currently at **M0: scaffold and the exe pipeline**.

## Requirements

- Windows 10 or 11, 64-bit
- [Node.js](https://nodejs.org/) LTS (v22+) and npm

## Install

```
npm install
```

This also downloads Electron's binary and the bundled FFmpeg/FFprobe binaries (via `ffmpeg-static` / `ffprobe-static`) as part of `npm install`'s install scripts.

## Run in dev

```
npm run dev
```

Opens the app in an Electron window with hot-reload for the renderer.

## Build the portable exe

```
npm run build:exe
```

Produces `dist/Cutline-<version>-portable.exe` — double-click to run, no install, no admin rights required. Since the build is unsigned, Windows SmartScreen may show "Windows protected your PC" the first time; click **More info > Run anyway**.

## Build the installer

```
npm run build:installer
```

Produces `dist/Cutline-<version>-setup.exe` (NSIS, per-user install, desktop shortcut option, uninstaller).

## Tests

```
npm run test        # unit tests (Vitest)
npm run build       # required once before e2e, so out/main/index.js exists
npm run test:e2e    # end-to-end smoke tests (Playwright, Electron mode)
```

## Other scripts

```
npm run typecheck   # TypeScript, no emit
npm run lint        # ESLint
npm run format      # Prettier, writes changes
```

## Project layout

```
/src/main        Electron main process (windowing, jobs, ffmpeg, IPC)
/src/preload     Typed contextBridge API exposed to the renderer
/src/renderer    React app (panels, timeline, preview)
/src/core        Pure TypeScript model/logic — no Electron or DOM dependency
/tests/unit      Vitest unit tests
/tests/e2e       Playwright end-to-end smoke tests
/resources       Icons and other build resources
```

## Troubleshooting

If `npm run dev` or `npm run test:e2e` fails to launch a window (or Playwright reports `bad option: --remote-debugging-port=0`), an inherited `ELECTRON_RUN_AS_NODE=1` environment variable is almost always the cause — common when running from a terminal hosted inside another Electron app. Clear it first:

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

## Notes

- FFmpeg/FFprobe are resolved from `node_modules` in dev and from the packaged app's `resources/ffmpeg/` folder (via `extraResources`) in the built exe — see `src/main/ffmpeg.ts`.
- The bundled FFmpeg build includes `libx264`/`libx265` and is therefore GPLv3-licensed; see `THIRD_PARTY_LICENSES.txt` (also reachable from the in-app About dialog).
