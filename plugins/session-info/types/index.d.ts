/** What the footer shows about the session; '' / undefined for what is not known. */
export type Info = { project: string; branch: string; model: string; contextPercent?: number }

declare module 'claude-code' {
  interface PluginState {
    'session-info': { info: Info | null }
  }
}
