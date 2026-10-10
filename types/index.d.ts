/** A password's health, worked out locally; the password itself never enters state. */
export type Strength = 'reused' | 'weak' | 'strong'

/** How the pane groups the list. */
export type GroupBy = 'none' | 'health' | 'site' | 'account'

/** One login as the pane lists it. The password itself never enters state. */
export type Login = {
  id: string
  name: string
  url: string
  username: string
  site: string
  strength: Strength
}

declare module 'claude-code' {
  interface PluginState {
    'chrome-passwords': {
      logins: Login[]
      query: string
      message: string
      /** Password-looking CSV files found on Desktop, Downloads and Documents. */
      found: string[]
      /** Animation clock for the mascot. */
      tick: number
      /** Whether the person hid the mascot. */
      buddyHidden: boolean
      groupBy: GroupBy
      /** Keys of the groups the person opened; every other group is folded. */
      expanded: string[]
      /** Id of the login whose password is on screen; '' for none. Never the password. */
      revealed: string
    }
  }
}
