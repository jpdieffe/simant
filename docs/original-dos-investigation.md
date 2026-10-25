# Original DOS multiplayer investigation

The following observations are from the supplied game and a local Chrome run, not assumptions about the SNES port.

## Verified

- `SIMANT.EXE` is 506,509 bytes. Its MZ load image is smaller than the whole file; the executable also contains overlay/resource data.
- The game boots in `emulators@8.5.2` using `dosboxWorker`, 16 MB DOS memory, SVGA, and 6,000 fixed CPU cycles.
- Browser mouse events dismiss the title/registration screens, select Quick Game, and enter the original colony view.
- The regular worker API exposes screen frames, audio, keyboard/mouse input, and filesystem saves. It does not expose SimAnt ants or camera state.
- The direct backend's transport holds the Emscripten module. In the inspected build, `ci.transport.module.HEAPU8` allows reading emulated memory. This is an internal API, not a stable public contract.
- A 64 MB heap snapshot contained the guest BIOS date at heap offset `0x1aa425d`. Subtracting DOS physical `0xffff5` gave guest RAM base `0x19a4268` in that run. Interrupt vectors and the BIOS reset vector validated that candidate. The loaded SimAnt PSP at guest physical `0x1920` began `CD 20`, consistent with a DOS PSP.
- These heap addresses are observations from one run. They must not be hardcoded into a multiplayer implementation. Guest RAM location and the loaded program must be validated each time.

## Not yet identified or changed

- Player-controlled ant identity, ant records and movement orders.
- Flags or code paths that prevent player ants being overwritten by colony AI.
- Viewport origins, patch/layer identity, and redraw entry points.
- Safe handling of map travel, underground/surface changes, ant death and exchanging bodies.
- A validated way to render two independent views from one authoritative simulation.

No second ant, room transport, world synchronization, or independent camera has been implemented. The current prototype must not be described as multiplayer.

## Next original-game experiments

1. Use a repeatable paused Quick Game and record bounded guest-memory snapshots around Backspace centering, map panning, ant orders, and Exchange. Compare idle snapshots to remove unrelated changes.
2. Locate the loaded image from the DOS MCB/PSP chain, account for MZ relocations and overlays, then trace writes to candidate controlled-ant and viewport fields.
3. Prove switching control preserves both ant identities and orders without AI taking over. Test death, underground entry, and map changes before adding networking.
4. Prove independent redraws without advancing two divergent colony simulations. Only then wire a host-authoritative two-player room and test both peers manipulating the same colony.

The alternative is an explicitly approved custom browser adaptation. That can implement a shared colony and independent cameras directly, but is not a modification of the supplied DOS executable.
