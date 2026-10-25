import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../site/vendor/', import.meta.url);
await mkdir(root, { recursive: true });
for (const file of ['emulators.js', 'wdosbox.js', 'wdosbox.wasm', 'wlibzip.js', 'wlibzip.wasm']) {
  await copyFile(new URL(`../node_modules/emulators/dist/${file}`, import.meta.url), new URL(file, root));
}
await copyFile(new URL('../node_modules/emulators/LICENSE', import.meta.url), new URL('emulators-LICENSE.txt', root));
await mkdir(new URL('../site/game/', import.meta.url), { recursive: true });
await copyFile(new URL('../assets/simant.zip', import.meta.url), new URL('../site/game/simant.zip', import.meta.url));
console.log('Pinned DOSBox browser runtime copied.');
