export type OpenRows = string[]

export type InTerminal = boolean

declare module 'claude-code' {
  interface PluginState {
    'tidy-edits': { open: OpenRows; inTerminal: InTerminal }
  }
}
