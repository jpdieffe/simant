# SimAnt Together

[Play on GitHub Pages](https://jpdieffe.github.io/simant/)

The original DOS SimAnt, with an **experimental two-player co-op patch**. The host runs one copy of the original executable in DOSBox. A second player joins beside the host in the same local patch, controls a separate ant, and receives a separate view. One ant can be on the surface while the other is underground.

The supplied archive is preserved byte-for-byte in `assets/simant.zip`; this is not a browser recreation. The multiplayer bridge changes guest memory at runtime and calls SimAnt's own movement, simulation, and drawing routines.

## Play together

1. Choose **Host two-player**. Dismiss the original title/registration screens and choose **Quick Game** in SimAnt for the tested starting setup.
2. Share the two-character room code or use **Invite**. Your friend opens the site, enters the code, and chooses **Join colony**.
3. When the original colony is ready, the second ant appears nearby. Tap the ground, use WASD/arrows, or use the large touch arrows. **Go outside**, **Go home**, and **Stop** send orders to your own ant.
4. On a phone, turn sideways. The guest can tap **Enable sound**; video starts muted to respect mobile autoplay rules.
5. The host can choose **Game controls** to pause co-op and use SimAnt's complete original interface. **Resume co-op** brings the second ant back beside the host. Use this for original colony management, saving, and changing patches.

The host must keep the game tab visible. Guest disconnects release held controls; reconnecting to the same room retains the second ant during ordinary co-op play. A room accepts two players.

## Solo camera

Solo play and hosts awaiting a friend enable the original **AutoTrack** setting when a colony starts. The camera follows the ant as it walks, so you can keep clicking farther across the map instead of getting stuck at the visible screen edge. **Follow ant: on/off** toggles that same original setting; the DOS Options ? AutoTrack menu remains usable.

## Current limits

This is an experimental original-game modification, not a fully validated multiplayer port. Separate movement, native underground/surface travel, distinct views, shared simulation timing, audio/video, disconnect/rejoin, and returning from original menus have automated browser coverage. Combat, ant death/replacement, recruitment, long campaigns, and every original-game interaction have **not** been validated for two human ants. Full Game founding queens are kept in the original interface: establish the nest and switch to a worker before co-op can attach. Full Game co-op beyond that point remains unverified. The original executable assumes one yellow player marker; those systems may still behave incorrectly with two.

Both players share the host's current local square. Independent travel to different global squares is not implemented. Change the global square through the host's original controls, then resume co-op. Guest controls currently cover movement; original menus and colony-management commands belong to the host. Returning to original menus removes the guest ant, and resuming creates a new worker beside the host.

The host renders two views sequentially and streams the guest's view, rather than running a second independent simulation. Expect latency and lower frame rates than solo play; host phone performance varies. Automated mobile viewport tests are not a substitute for testing on physical Android/iOS devices.

## Connection help

The connection handling incorporates the Mario/Kirby troubleshooting fixes. On Android, check **Settings ? Apps ? your browser ? Permissions ? Nearby devices / Local network**, and allow any browser local-network prompt. The exact name depends on Android/browser version. Retry reconnects without discarding the host's colony.

PeerJS cloud signaling introduces peers; game input and media use WebRTC. Some routers, guest Wi-Fi, firewalls, and mobile networks prevent direct connections. Connection help accepts an optional TURN relay and optional custom PeerServer. No TURN service is bundled. Relay credentials remain in the current tab.

## Save the original game

Use **Game controls**, save through SimAnt's File menu, then choose **Save files** to download changed DOS files. **Load files** restarts DOS with that archive layered over the original game; load the colony from SimAnt's own menu. This is a filesystem save, not a running emulator or second-player checkpoint.

## Development

```sh
npm ci
npm run prepare:vendor
npm start
```

Open http://127.0.0.1:4173. Pinned runtime/game files are copied into ignored `site/vendor/` and `site/game/`. The Pages workflow performs this step before deployment.

```sh
npm run check
npm test
npm run test:browser
npm run test:solo-camera
npm run test:colony
npm run test:network
```

Browser tests use installed Google Chrome through Playwright. Network tests exercise real WebRTC in two browser contexts and require internet access to the signaling/STUN services. Screenshots are saved under ignored `test-results/`. See [the original DOS investigation](docs/original-dos-investigation.md) for the native bridge and remaining risks.

## Components

- Original SimAnt game files supplied by the repository owner; original game by Maxis.
- [js-dos emulators 8.5.2](https://github.com/js-dos/emulators), GPL-2.0. Its pinned distribution and license are copied into `site/vendor/`. [Runtime API](https://js-dos.com/command-interface.html).
- [PeerJS 1.5.5](https://github.com/peers/peerjs), MIT; its license is copied alongside the runtime.
- Playwright 1.56.1 for browser verification.
