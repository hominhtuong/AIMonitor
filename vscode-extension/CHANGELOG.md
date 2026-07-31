# Changelog

## 1.0.0

First release on the VSCode Marketplace.

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
