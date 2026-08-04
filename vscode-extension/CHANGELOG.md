# Changelog

## 2.2.2

- **Stage only.** A button next to the Stage title hides everything else - header, usage,
  KPIs, tabs, pickers, the detail panel - and leaves the room alone, filling the window. For
  people who keep the panel open just to watch their agents work. Click any character to come
  back to the full dashboard, with that character's process tree already open; the small
  button in the corner and the Esc key do the same. The choice is remembered.

  While it is on, the dashboard stops asking for the 197 KB snapshot every three seconds - the
  room runs on its own 2 KB pulse - so the panel is cheaper to leave open this way than the
  full view.

## 2.2.1

- **Legends set redrawn.** Messi is easier to tell apart, and the jersey number is now on the
  front of the shirt as well as the back.

## 2.2.0

- **The Office view is now the Stage, and it has three scenes.** Same ten agents, three very
  different places to watch them work:

  - **Office** - what you had before: desks, chairs, monitors. Nothing changed.
  - **Farm** - each agent works a plot, and *what* they do follows the tool they are running.
    `Bash` becomes a woodcutter splitting logs, `Edit` becomes a farmer ploughing behind an ox,
    `Read` becomes someone harvesting with a sickle, `WebFetch` becomes carrying water. The
    crop on each plot grows while its owner is genuinely busy, so one glance across the field
    tells you who has been working longest. Chickens and a dog wander the bottom of the frame.
  - **Delivery** - each agent gets a street address and a scooter. Busy means riding to the
    depot and back; the stack of parcels behind the rider is how many tools that agent has in
    flight right now.

  Each scene brings four backdrops of its own (rice field, vegetable patch, orchard, winter
  crop; city, suburb, night, sunset), and all eight character sets - plus any set you imported
  yourself - work in every scene. Pick a scene under the view, or set `aimon.officeScene`.

- **Lighter than the version before it, in three ways.** The room background is now baked once
  instead of being redrawn several hundred draw calls at a time, every frame. The image memory
  is handed back a minute after you leave the tab - it used to be held until you closed the
  window. And the character-set previews are only drawn once you actually open the picker.

- **Scene code is fetched only when you use it.** Sticking to the Office scene downloads
  nothing extra at all.

## 2.1.1

- **The Office can float on top of everything.** Run **AI Monitor: Open the Office in a
  Floating Window** from the command palette and the room moves into a small window of its
  own, pinned above your browser, your terminal, anything - so you can watch your agents work
  while you do something else. Click a character in it and the full dashboard comes back.

  It costs 2 KB per second: that window draws the room and nothing else, so it does not pull
  the process table, the ports or the account limits at all.

- **The footer tells you which version is actually running.** It shows the version of the
  server serving the page, and - when they differ - the version of the extension too. Those
  two can disagree: AI Monitor reuses a server that is already running, so installing a new
  extension while an older server is still alive leaves you looking at the older page.
  `AI Monitor: Restart server` fixes it.

## 2.0.1

- **Uses a fraction of what it used to.** With the panel open, AI Monitor now costs about
  0.7% of an 8-core machine and 30 MB of RAM; with only the status bar showing, 0.01%. Every
  number in this list was measured on a real machine running 500+ processes, before and
  after - see [docs/hieu-nang.md](https://github.com/hominhtuong/AIMonitor/blob/main/docs/hieu-nang.md).

- **A collapsed panel now really does nothing.** VSCode keeps a hidden webview alive, and the
  page had no way of knowing it was hidden - so the dashboard kept asking the server for
  200 KB every 3 seconds and kept animating at 60 fps behind a panel nobody was looking at.
  It now stops completely and picks up where it left off when you open it again.

- **The status bar stopped pulling the whole dataset.** It only ever displays two percentages
  and today's cost, but it was downloading a full machine snapshot every 6 seconds - in every
  window you had open. It now asks for 2.4 KB instead of 200 KB, and no longer makes the
  server scan every process on your machine just to draw a label.

- **The Office view stops drawing when nothing moves.** With everyone sitting at their desk it
  now renders 5 frames per second instead of 60. Characters that are walking still animate at
  full speed. The cat also stopped padding its feet while sitting still, which it had been
  doing since the view was added.

- **Character sets load one at a time.** Opening the Office view used to render all 127
  characters from all sets into a 35 MB texture; it now renders just the set in use, which is
  7 MB for the default one and 2 MB for the smaller sets. The view opens three times faster.

- **Everything is compressed on the way to the page.** Assets went from 290 KB to 99 KB and
  each refresh from 197 KB to 35 KB. This mostly matters over Remote-SSH, where the dashboard
  travels through VSCode's port forwarding: 236 MB per hour became 42 MB.

- **A new character set: Legends.** Ten footballers, told apart the way you tell them apart
  from the stands - kit colour, hair and shirt number. Numbers are drawn with a built-in pixel
  font so they stay sharp at any zoom.

## 2.0.0

- **Every character redrawn at three times the resolution.** Heads are round instead of
  chamfered, ears and hair spikes taper to a point, and eyes have an iris, a highlight and a
  reflection instead of being two solid squares. Shading follows the silhouette - lit along
  the top-left edge, darker along the bottom-right - so a body reads as a body and not as a
  flat patch of colour. The outline around each character is a third of its old thickness and
  now takes the colour of whatever it touches: hair gets a hair-coloured contour, a red shirt
  a red one. The uniform dark outline was what made the old characters look like stickers.

- **The same treatment for characters you import.** A picture you bring in is now cut to the
  finer format directly rather than being squeezed to 16x20 and blown back up, so an imported
  set is as sharp as the drawn ones. Sets imported with an older version keep working.

- **Hovering someone at work no longer knocks them out of their chair.** They turn around,
  look at you for a second and go back to what they were doing. Hovering an idle character
  still stops them where they stand, and they carry on when you move the mouse away.

- Fixed: when a session ended abruptly its character could stay behind - seated at a desk or
  frozen in the middle of the room - while the count above the room said the office was
  empty. Anyone leaving now always finds the door, and a character that somehow gets stuck is
  removed outright.

## 1.6.0

- **Three more character sets and a new default.** *Voyage* (36 sailors), *Ninja* (36 shinobi)
  and *The Crew* (5) join the four existing sets, and Voyage is now what you get out of the
  box - with 36 characters the room never repeats a face, while a set of ten starts over past
  the tenth agent.

- **Bring your own characters.** The **+** tile next to the sets takes any picture holding
  several characters, lifts the background, cuts each one out and fits them to the office
  format. The picture never leaves your machine - it is read in the page, never uploaded, and
  sets you add are not part of the released extension.

- **Rooms you can pick.** Four of them: Classic, Library, Loft and Garden. The furniture layout
  is identical in all four - only the floor, walls and decor change - so switching rooms never
  shifts a character or a desk by a pixel.

- **Chairs you actually sit in.** Every desk has an office chair, and agents now walk in from
  the side and sit down in it instead of rising up through it from below. Leaving works the
  same way in reverse: step out sideways first, then head for the door.

- **A little celebration when a session finishes.** The agent throws confetti and bounces in
  its own chair for two seconds before getting up and walking out. Sessions used to just
  vanish at the door with nothing marking that the work was done.

- **Clicking a character now does something you can see.** It opens that agent's panel *and*
  scrolls to the part you wanted: the process tree if the agent is working, the character
  picker if it is idle. Hovering someone who is wandering makes them stop and turn to face
  you - and they now go back to what they were doing as soon as you move the mouse away or
  click, instead of standing there forever.

- Fixed: the character picker and the process-tree heading sat flush against the edge of the
  session card instead of lining up with everything else in it. The office cat also kept
  crossing in front of people's faces; it now stays in the strip below their feet.

## 1.5.0

- **Five character sets, and every agent gets a different one.** The office crew was redrawn
  from scratch in a chibi style - head nearly half the height, big eyes with a highlight,
  blushed cheeks, and a dark outline around the silhouette - after the honest feedback that the
  old ones were not cute. There are four sets of ten now:

  - **Office** - ten people: bob, afro, top bun with an apron, ponytail, cap, hoodie, beanie
    with a scarf, cat ears, spiky hair with overalls, long hair
  - **Pets** - cat, rabbit, dog, black cat, sheep, cow, pig, chick, duckling, frog
  - **Slimes** - ten coloured blobs, some with a leaf, a crown or a cherry on top
  - **Mascots** - ten round mascots, each under a different hat
  - **Voyage** - thirty-six sailors: straw hats, goggles, horns, beards and masks

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
