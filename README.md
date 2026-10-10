# chrome-passwords

A [Claude Code](https://claude.com/claude-code) mod that turns Chrome's password export into a private pane: search, group by status (Reused / Weak / Strong), site or account, and copy a username or password with one press. A pixel Clawd in an incognito hat keeps watch.

## Install

In a Claude Code terminal session:

```
/plugin install chrome-passwords --marketplace husseinalnahi-iq/chrome-passwords
```

Answer `y` to add the marketplace, then pick a scope (user is the default).

## Use

1. In Chrome: Settings → Passwords → Export passwords. Chrome saves a CSV file of your logins.
2. Run `/passwords`, then press **Browse for CSV file…** and pick it. You can also paste a file or folder path into the pane, use a file it finds on your Desktop, Downloads or Documents, or run `/passwords <path>`.
3. Press **user** or **pass** to copy, or **👁 show** to see a password in the pane for 10 seconds (press again to hide it sooner). **Group by** switches between Status, Site, Account and None; press a group header to open or fold it.

- `/passwords browse` opens the file dialog from the prompt (Windows; elsewhere, paste the path).
- `/passwords forget` clears the import.
- **Hide Clawd / Show Clawd** toggles the mascot.

## Privacy, and its limits

- **Passwords stay in memory.** The mod keeps them only while Claude Code runs, and shows one only when you press 👁, for 10 seconds. It never writes them to Claude Code's settings or storage, never puts them in the conversation, and sends nothing over the network.
- **Only the CSV's location is saved**, so the mod can reload it next session. `/passwords forget` removes it.
- **Status is worked out on your machine** by comparing your passwords with each other and checking length and character mix. Nothing is sent anywhere.
- **Claude is kept away from the file, best-effort.** The mod blocks any tool call Claude makes that names the imported file or a file named like Chrome's export. A command that reaches the file without naming it (for example a wildcard over `*.csv`) is not caught, so don't ask Claude to work in the folder that holds your export.
- **The CSV itself is plain text.** Anyone or anything that can read your files can read it. Delete it when you're done; you can export again any time.
- **Copied passwords sit on your clipboard** like any copy, including Windows clipboard history (Win+V) if you have it on.

## Development

`claude plugin validate .` checks the mod and `claude plugin test .` runs its tests.

## License

MIT
