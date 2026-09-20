import path from 'node:path'

/**
 * Project root when running unpackaged. `app.getAppPath()` is not reliable across every
 * way an unpackaged main process can be launched — it resolves differently for
 * `electron-vite dev` versus a direct `electron.exe out/main/index.js` invocation (which
 * is how both Playwright's `electron.launch()` and, transitively, some test/dev flows
 * start the app). The compiled output always lives at `<root>/out/main/index.js`, so
 * deriving the root from `__dirname` is deterministic regardless of launch method.
 */
export const DEV_PROJECT_ROOT = path.join(__dirname, '..', '..')
