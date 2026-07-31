# Changelog

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
