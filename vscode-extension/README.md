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

## Requirements

Python 3.9 or newer on your PATH. That is the only requirement.

- **macOS / Linux:** already there, nothing to do.
- **Windows:** install from [python.org](https://www.python.org/downloads/) and tick
  **"Add python.exe to PATH"** during setup. The `py` launcher works too.

The dashboard has no dependencies of its own - the server is pure Python standard library.

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
