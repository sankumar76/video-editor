/// <reference types="vite/client" />
import type { CutlineApi } from '../../preload'

declare global {
  interface Window {
    cutline: CutlineApi
  }
}

export {}
