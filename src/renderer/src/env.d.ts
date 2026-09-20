/// <reference types="vite/client" />
import type { AppDiagnostics } from '@core'

declare global {
  interface Window {
    cutline: {
      getDiagnostics: () => Promise<AppDiagnostics>
      openThirdPartyLicenses: () => Promise<void>
    }
  }
}

export {}
