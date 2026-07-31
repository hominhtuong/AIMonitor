# AI Monitor for VSCode

See every AI process running on your machine, how many tokens they burned, and how much of
your account limit is left - in a panel next to your code.

![AI Monitor dashboard](https://raw.githubusercontent.com/hominhtuong/AIMonitor/main/assets/screenshot.png)

Everything runs on `127.0.0.1`. No data leaves your machine, no account, no API key, no
telemetry.

## What it shows

- **Every AI process, grouped into its real tree.** One Claude Code session is rarely one
  process: sub-agents, MCP servers, hooks and language servers all hang off it. AI Monitor
  groups them by parent so you can see which session owns what, with CPU and RAM rolled up
  per tree.
- **Tokens and cost.** Input, output, cache read and cache write, counted per hour from your
  local Claude Code transcripts - today, the last 5 hours, the last 7 days. Cost comes from a
  price table you can edit, and the totals have been cross-checked against `npx ccusage`.
- **Session and Weekly limits.** The 5-hour and 7-day numbers Claude Code itself reports,
  plus what you have spent since that number was last refreshed - so the panel does not sit
  at 15% while the CLI already says 18%.
- **Open ports.** Which local ports your dev processes and Docker containers are holding.
- **Kill or suspend a process** straight from the panel, with AI Monitor and its own parent
  processes protected from being killed by accident.

![One session and its whole process tree](https://raw.githubusercontent.com/hominhtuong/AIMonitor/main/assets/session-detail.png)

## Two ways in

- **Status bar.** AI Monitor sits at the bottom of the window with your Session and Weekly
  limits, amber past 70% and red past 90%. Click it to open the dashboard. It never starts
  anything on its own - it shows numbers when a server is already running and stays a plain
  label otherwise, so opening VSCode costs nothing.
- **Activity bar icon.** Opens the same dashboard in the side panel, in a compact layout built
  for a narrow column. The editor tab gets the full-width layout instead. Both share one
  server.

## Settings

Extensions => AI Monitor, or search `@ext:mituultra.aimonitor` in Settings.

| Setting | What it does |
| --- | --- |
| `aimon.pythonPath` | Pin a specific interpreter. Empty = auto-detect. Run **AI Monitor: Select Python Interpreter** to pick from a list of everything found, with versions |
| `aimon.serverPort` | Fix the port instead of letting the OS choose |
| `aimon.reuseRunningInstance` | Share a server with the standalone app and other VSCode windows |
| `aimon.openIn` | Whether the status bar opens the editor tab or the side panel |
| `aimon.statusBar.*` | Show or hide it, which numbers it shows, which side it sits on |
| `aimon.refreshSeconds` | How often the dashboard refreshes |
| `aimon.theme` | Follow the VSCode theme, or pin light or dark |
| `aimon.claudeDataDir`, `aimon.pricingFile` | Point at a different Claude data folder or price table |

## Setup

Install the extension and open the panel. That is the whole setup.

The extension finds Python on its own. It scans the `py` launcher, everything on `PATH`, and
the standard install folders, then runs each one to check the version - so it works even when
Python is installed but was never added to `PATH`, which is the usual case on Windows.

Only if the machine genuinely has no Python 3.9+ does the panel say so, with a **Download
Python** button and a **Try again** button next to it. Install, click Try again, done. Nothing
to configure, no settings to fill in.

The dashboard has no dependencies of its own - the server is pure Python standard library.

## Privacy

Everything is local. The extension starts a server bound to `127.0.0.1`, and the dashboard
only ever talks to that server - no external requests, no CDN, no fonts, no analytics, no
telemetry, no ads. It reads your local Claude Code transcripts and process list, and sends
them nowhere.

## How it works

The first time you open the panel, the extension starts a small local HTTP server bundled
inside it (`python -m aimon.server`) on a port the OS picks, and embeds the dashboard. Close
the panel and the server shuts down again.

If AI Monitor is already running - the standalone macOS app, the Windows build, or another
VSCode window - the extension reuses that server instead of starting a second one.

Works over Remote-SSH and Codespaces: the dashboard URL goes through VSCode's own port
forwarding.

## Also available as

A standalone **macOS app** (signed and notarized) and a **Windows `.exe`** that needs no
Python at all - see [the repository](https://github.com/hominhtuong/AIMonitor).

## Language

The dashboard is bilingual, English and Vietnamese. Switch with the dropdown in the header;
the choice is remembered.

## Feedback

Bugs and feature requests: [GitHub issues](https://github.com/hominhtuong/AIMonitor/issues).

MIT licensed.
