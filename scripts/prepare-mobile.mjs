import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist-mobile');
const offlinePlay = process.argv.includes('--play-offline');
const archivedAudio = /^(05-dispatch|06-on-route|police-siren|patrol-siren)\.mp3$/;
await mkdir(output, { recursive: true });

for (const path of ['styles.css', 'content.js', 'app.js', 'assets']) {
  await cp(join(root, path), join(output, path), {
    recursive: true,
    filter: source => !archivedAudio.test(basename(source)),
  });
}
const outputAudio = join(output, 'assets', 'audio');
for (const file of await readdir(outputAudio, { recursive: true })) {
  if (archivedAudio.test(basename(file))) await rm(join(outputAudio, file), { force: true });
}
await cp(join(root, offlinePlay ? 'privacy-play.html' : 'privacy.html'), join(output, 'privacy.html'));
const index = await readFile(join(root, 'index.html'), 'utf8');
if (offlinePlay) {
  await rm(join(output, 'monetization.js'), { force: true });
  await writeFile(join(output, 'index.html'), index
    .replace(/^ *<script src="monetization\.js" defer><\/script>\r?\n/m, '')
    .replace(/^ *<button[^>]*id="open-test-options"[^>]*>[^<]*<\/button>\r?\n/m, '')
    .replace(/^ *<dialog id="test-options"[\s\S]*?<\/dialog>\r?\n/m, ''));
} else {
  await cp(join(root, 'monetization.js'), join(output, 'monetization.js'));
  await writeFile(join(output, 'index.html'), index);
}

