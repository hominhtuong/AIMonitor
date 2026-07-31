# Changelog

## 1.5.0

- **Four character sets, and every agent gets a different one.** The office crew was redrawn
  from scratch in a chibi style - head nearly half the height, big eyes with a highlight,
  blushed cheeks, and a dark outline around the silhouette - after the honest feedback that the
  old ones were not cute. There are four sets of ten now:

  - **Office** - ten people: bob, afro, top bun with an apron, ponytail, cap, hoodie, beanie
    with a scarf, cat ears, spiky hair with overalls, long hair
  - **Pets** - cat, rabbit, dog, black cat, sheep, cow, pig, chick, duckling, frog
  - **Slimes** - ten coloured blobs, some with a leaf, a crown or a cherry on top
  - **Mascots** - ten round mascots, each under a different hat

  Pick a set under the room and the whole room switches to it, each agent taking a *different*
  character from it; once the set runs out it starts over. Click any character in the room and
  a row of the set appears in the detail panel - pick one to change just that agent. Both
  choices are remembered, and the starting set is the new `Office Pack` setting plus an
  `office_pack` key in `~/.aimon/config.json`.

  Still no image files: every character is drawn in code, so nothing extra ships in the package
  and there is no third-party asset licence involved.

- **Bring your own characters.** A **+** tile next to the four sets turns any picture on your
  machine into a character set: it lifts the background, finds each character, and fits them to
  the office format. Tested on ten real sheets - 12 farm animals out of one, 20 mascots out of
  another, in well under a tenth of a second each - and the author's watermark is dropped
  rather than turned into a "character".

  The picture never leaves your machine: it is read in the page, processed on a canvas, and the
  finished sprites are kept in browser storage. Nothing is uploaded, and imported sets are never
  part of a release - which is the point, since character art found online usually carries its
  own licence.

- Fixed a one-pixel gap at the neck of seated characters that showed the floor through it, and
  removed the shadow that floated under them - a seated character draws no legs, so the shadow
  had nothing to sit under.

## 1.4.0

- **Only the agent kinds you use.** The dashboard and the Office view now start out showing
  Claude Code alone. Most machines run background processes that get classified as AI without
  you ever launching them - the Copilot helpers bundled with VS Code, for one - and showing all
  of them buries the sessions you came to look at. A **Show:** row under the tabs lists the
  kinds present with a count each; click to turn any of them on or off. Your choice is
  remembered and covers both views. The starting set is the new `AI Kinds` setting.

  Nothing disappears silently: whenever the filter hides something, the page says how many and
  offers a one-click way to show everything.

- **The path settings fill themselves in.** Python, Claude data folder and pricing file used to
  sit empty, which reads as "the tool found nothing" rather than "detected automatically". They
  are now filled with what is actually in use the first time the extension runs, and each has a
  **Detect again** button in the settings page that scans and offers a list to pick from. Two
  new commands, **Detect and Fill In Settings** and **Show Settings In Use**, do the same from
  the Command Palette.

  A path that stops working is repaired on the next start - which matters for the bundled
  pricing file, since its folder is renamed by every extension update, and a stale path there
  silently zeroes every cost on the dashboard. Clearing a box goes back to detecting each time,
  and the extension will not fill it in again.

- **Office view.** A new tab shows every running agent as a pixel character in a small office.
  An agent with work to do sits at its desk, and its screen colour says what kind of work:
  editing files, reading and searching, running commands, fetching the web, planning,
  delegating. Leave one idle for 90 seconds and it gets up and wanders. Sub-agents appear as
  smaller helpers beside whoever called them, and agents that shut down walk out of the room.
  Click a computer to open that session in full, process tree included.

  With several agents running it reads faster than the cards - you see who is busy without
  reading a word. The room holds ten desks; the counter above it says how many are not shown.

  It works in both the narrow panel and the editor tab, and follows your colour theme. There
  are no image files: the characters are drawn in code, so nothing extra ships in the package.

## 1.3.0

- **Status bar item.** AI Monitor now sits at the bottom of the window showing your Session and
  Weekly limits at a glance, turning amber past 70% and red past 90%. Click it to open the
  dashboard. It never starts anything by itself - it shows numbers when a server is already
  running and stays a plain label otherwise, so opening VSCode costs nothing.
- **The dashboard opens as an editor tab**, with the full-width layout. The activity bar panel
  now runs a compact layout built for a narrow column instead of squeezing the wide one into
  it. Both share one server.
- **Light theme.** The dashboard follows your VSCode colour theme by default, or you can pin
  it to light or dark. The standalone macOS and Windows builds get a light/dark toggle in the
  header that follows the operating system on first run.
- **Settings**, under Extensions => AI Monitor:
  - Which Python to use, with an **AI Monitor: Select Python Interpreter** command that lists
    every interpreter found on the machine with its version. Leave it empty to keep
    auto-detecting.
  - Server port, and whether to reuse a server that is already running.
  - Refresh interval, colour theme, where the status bar opens the dashboard.
  - Where your Claude data lives and which price table to use.
- New commands: **Open Dashboard in a Tab**, **Select Python Interpreter**, **Restart Server**.
- The standalone macOS and Windows builds get their own settings too, in
  `~/.aimon/config.json` - theme, refresh interval, Claude data folder, price table, port. The
  extension's own settings still win inside VSCode, so changing one window does not reconfigure
  an app running alongside it.

## 1.2.4

Fixes for Windows, all reported from a real machine running 1.2.3.

- **The server crashed on startup on Windows.** Its messages are in Vietnamese, and the
  extension pipes the server's stdout, so Python encoded them with the system code page
  (cp1252) instead of UTF-8 and died on the first accented character with a
  `UnicodeEncodeError`. The panel then blamed a missing Python interpreter, which was wrong -
  Python was fine. Output is now forced to UTF-8 before anything is printed.
- **A black console window flashed every few seconds.** Looking up processes and ports runs
  `powershell` and `netstat`, and Windows opens a console for those when the calling process
  has none. The dashboard refreshes every 3 seconds, so the flashing never stopped. Every
  external command now runs with `CREATE_NO_WINDOW`.
- **Python is now discovered instead of guessed.** The extension scans the `py` launcher,
  `PATH` and the standard install folders, then runs each candidate to check its version, so
  a Python installed without "Add to PATH" is found. If there really is none, the panel offers
  a Download button and a Try again button rather than a traceback.
- The standalone Windows app no longer lets Edge show its first-run welcome screens when it
  opens the dashboard window.

## 1.2.3

First release on the VSCode Marketplace. The version number follows the AI Monitor project
so the extension, the macOS app and the Windows build in a release all carry the same number.

- AI Monitor dashboard in a panel: AI process tree with CPU and RAM per session, token and
  cost totals, Session (5h) and Weekly (7d) account limits, open ports.
- Kill or suspend a process from the panel. AI Monitor itself and its parent processes are
  protected.
- The bundled Python server starts on first open and shuts down when the panel closes. An AI
  Monitor already running - standalone app or another VSCode window - is reused instead of
  starting a second one.
- Remote-SSH and Codespaces supported through VSCode port forwarding.
- English and Vietnamese interface.

### Windows

- Tries the `py -3` launcher before `python`. On Windows 10 and 11 `python` is an App
  Execution Alias for the Microsoft Store when Python is not really installed: it starts,
  opens the Store page and exits, which used to look like a 15-second hang followed by a
  meaningless timeout. That case is now detected and reported for what it is.
- The server is asked to shut itself down over HTTP before the process is killed, so the
  `~/.aimon/instance.json` state file is cleaned up. Killing the process directly does not
  run Python's cleanup on Windows.
