# SimAnt Together — original DOS foundation

**Status: the original DOS game runs in a browser. Requested two-player gameplay is NOT implemented.**

The supplied `SimAnt-The-Electronic-Ant-Colony_DOS_EN.zip` is preserved byte-for-byte as `assets/simant.zip`. It contains the original DOS executable, data, and sound files. This repository does not replace the game with a browser recreation.

## Run locally

```sh
npm ci
npm run prepare:vendor
npm start
```

Open http://127.0.0.1:4173 and choose **Play original game**. The runtime and game files are served locally, with no external CDN required. The DOS directory uses its 8.3 alias `SIMANT~1`.

Tap/click to move the mouse and press its left button; holding preserves a held mouse button for the game's menus. The right-click toggle supports the other mouse button on touchscreens. Keyboard input applies when the game canvas has focus. Esc, Enter, and Backspace (Find ant) also have touch buttons. Phone landscape layout puts those controls alongside the screen.

Save in SimAnt's own File menu, then use **Save files** to download changed DOS files. **Load files** restarts DOS with that archive layered over the original game; select the saved game from SimAnt's menu. This does not save running emulator state.

## Multiplayer requirements still to implement

- Two-character peer-to-peer rooms and guest recovery, using the connection fixes already verified in Mario and Kirby.
- A second independently controlled ant that joins the host's current local patch.
- Both players affect the same colony, terrain, food, and other ants.
- Independent positions and cameras within that shared patch.
- Rejoining preserves the host's simulation and prevents stuck inputs.

SimAnt's DOS executable has one active player-controlled ant and one set of UI/view state. DOSBox's IPX transport does not add multiplayer to this game. Streaming the existing screen and accepting two mice would not satisfy these requirements. Running two unmodified copies would produce separate colonies, also not the requested behavior.

The original executable needs game-specific work to identify and change controlled-ant selection, ant orders/AI, shared patch state, and view rendering. No such game-memory patch is implemented or claimed here. A browser adaptation is a separate product direction and would change the original game.

## Checks

```sh
npm run check
npm run test:browser
```

Browser tests use installed Google Chrome via Playwright. They launch the actual `SIMANT.EXE`, require it to stay running after startup, enter the original Quick Game via mouse input, and check landscape/portrait overflow. Screenshots go to ignored `test-results/` for visual review. These are original-game checks, not multiplayer tests.

## Components

- Original SimAnt game files supplied by the repository owner; original game by Maxis.
- [js-dos emulators 8.5.2](https://github.com/js-dos/emulators), GPL-2.0. `npm run prepare:vendor` copies the pinned distribution and its license into `site/vendor/`. Runtime API: https://js-dos.com/command-interface.html.
- Playwright 1.56.1 for browser verification.

Only the original-game foundation has been prepared. No multiplayer release is published from this repository yet.
