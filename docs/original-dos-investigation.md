# Original DOS multiplayer bridge

This implementation preserves the supplied DOS executable and data. It does not substitute the SNES port or a JavaScript recreation. Findings below come from executable disassembly, guest-memory comparisons, and browser experiments with the supplied archive.

## Supported build

- Archive SHA-256: `01a0f1c90368d6af754fe93b8fc7170168c279c5c2f1a28660d433217c71225b`.
- `SIMANT.EXE`: 506,509 bytes, MZ executable with overlays.
- `emulators@8.5.2`, direct DOSBox backend, SVGA, 16 MB guest memory, 6,000 fixed cycles.
- The bridge accesses `ci.transport.module.HEAPU8`. This is an internal runtime API, so the package is pinned.

`dos-memory.js` finds conventional guest RAM by the BIOS reset vector/date and serial-port table, then validates the SIMANT MCB/PSP, relocated instructions, and Microsoft runtime signature. Host heap offsets and DOS load addresses are discovered, not hardcoded. Function offsets are specific to this executable; other releases are unsupported.

## Safe native calls

A main-loop stub at load-relative `15f8:0313` is redirected to a small gate. An initial trampoline preserves registers and requests eight paragraphs (128 bytes) through DOS `int 21h/AH=48h`. It preserves the temporary PSP area and uses an owned allocation rather than borrowing unallocated memory. The gate stops at a known original main-loop boundary.

Calls save registers, push the original function's arguments, far-call its resident entry/overlay thunk, store AX/DX, restore registers, and return to the gate. The bridge never executes an original function while the CPU is halfway through unrelated simulation code. Closing co-op removes the second actor, restores player one, redraws, restores the original hook, and releases the gate. The small allocation is reused when co-op resumes.

## Two native human states, one world

`colony.js` saves/restores the discovered human position, body, health, carrying state, path/order fields, and related flags. Colony arrays, terrain, other ants, counters, and resources remain shared. The second ant receives a worker body and starts in an unoccupied neighboring cell found using the original terrain and actor lookups.

Relevant native entry points (relative to the executable load segment):

| Entry | Observed purpose |
| --- | --- |
| `0894:000e` | Whole-colony update, including player one's update |
| `2cff:27a4` | Overlay thunk for yellow-ant health/carrying/body update |
| `2cff:279a` | Overlay thunk for yellow-ant pathfinding/movement |
| `10f7:07c7` | Actor lookup for a layer/tile |
| `10f7:0850` | Terrain lookup |
| `10f7:09a8` | Remove yellow actor footprint |
| `10f7:0a44` | Place yellow actor footprint |
| `0250:0e91` | Original local-view redraw |

Each co-op update runs the whole-colony routine once with player one's state, then only player two's human routines. Original movement can climb between surface and nests. Both yellow footprints are restored after movement so crossing the same cell does not permanently erase an ant's map marker.

The shared segment is resolved from `DS:8952`. Selected offsets include position `47c/48a`, layer `48c`, direction `496`, body `4c2`, health `f78`, movement flag `aa0`, and target `ad6/ae8/af8`. The field list in code is based on observed native routines; completeness across all gameplay paths is not proven.

## Independent original views

For each player, the bridge selects the native view layer (`32e`) and origin (`508/50a`), invokes the original renderer, and crops the original map viewport (`110c..1112`) to a separate canvas. This does not advance the colony again. Original VGA delivery reports changed frames only; identical frames must not be treated as a stalled simulation.

The host sees its canvas. WebRTC carries the guest canvas and DOS audio to the second browser. A reliable data channel carries guest directions/orders and view metadata. The guest does not run its own copy of the simulation. Two-character rooms, input release, heartbeat, explicit connection errors, optional TURN/PeerServer settings, and retry follow the tested Kirby transport.

## Evidence and limits

`tests/colony.mjs` proves two native ants follow separate orders, the host reaches the surface while the guest stays underground, the colony counter advances once per tick, and original rendered views differ. `tests/network.mjs` checks actual two-browser connection, guest orders and separate layers, media tracks, rejection of a third player, disconnect/rejoin, and original-menu/co-op transitions. `tests/browser.mjs` checks original startup and phone viewport overflow.

Original native actor maps use a single `0xff` yellow marker, with `0xfe` for a queen footprint. Reusing that marker for two ants requires more investigation for NPC combat/targeting, death, body exchange, recruitment, resource interactions, and campaign transitions. Existing tests do not establish correct behavior for all those systems. The co-op build is therefore explicitly experimental.

The original interface remains available through Game controls. The host owns original menus and global-square changes. A guest can move within the current patch and its layers, but cannot independently occupy a different global square. Full campaign completion and physical Android/iOS host performance are not verified.

A Full Game founding-queen experiment spawned a second ant but reached an unexpected Game Over during updates. Co-op therefore refuses queen/founding bodies and leaves the original game running until the host selects a worker or soldier. This is a compatibility restriction, not a claim that the founding stage supports two players.

## Solo AutoTrack

The original movement routine checks option `7a8` through the segment pointer at `DS:897e`, then calls the original recentering routine after movement. This is a separate options segment, not the colony globals segment. Toggling Options ? AutoTrack in the DOS menu confirmed the field. The browser enables it once on colony startup and exposes Follow ant to toggle it; subsequent native-menu changes are reflected, not overwritten. No solo movement or camera renderer is replaced. `tests/solo-camera.mjs` uses real mouse clicks to leave the nest and walk beyond the starting screen, asserting that the native view origin follows.

## Four-panel original desktop

`site/desktop.js` owns the safe main-loop gate during solo/original-controls play. It activates and captures the original Edit (`0000`), Map (`0100`), Behavior (`1200`), and Caste (`1300`) windows, cropping their borders and title bars into separate browser canvases. The native Edit window is resized through its original mouse handler to a 608 by 433 content area. Native mouse coordinates are transformed through each canvas's actual object-fit scale; triangle drags remain in the original game handler until release. No triangle calculations, colony rules, or map drawing are recreated.

Window records may reside in EMS. Rectangles are read by locking with `23ae:0377` (AX = window ID), getting the pointer with `2505:0006`, copying eight bytes through native `29f4:281a` into gate scratch at `0028`, then unlocking with `23ae:01db`. Reading an EMS far pointer directly from the flat RAM buffer is incorrect. Original window activation uses `20e8:04b6`; after changing focus, a normal main-loop iteration paints the window before capture. Auxiliary panels refresh periodically, prioritizing the main view. Map painting can take several native updates after switching its layer.

The desktop and co-op bridge never own the gate simultaneously. Starting co-op awaits desktop startup/closure and releases its gate first. Original Game controls can reopen the dashboard; resuming co-op closes it again. Dialogs that hold the main loop expose the original desktop so the user can respond. The original-desktop button is disabled while the handoff is pending. Function-key menu shortcuts first release the dashboard and then send the key to the original desktop, avoiding panel captures that would obscure native menus.

`tests/desktop.mjs` verifies the expanded native dimensions, map input, both triangle drags, native ant movement with AutoTrack, all-panel visibility at desktop/landscape-phone/portrait-phone sizes, and desktop switching. The real two-browser network test covers the dashboard-to-co-op handoff. These are browser viewport tests, not physical phone tests.
