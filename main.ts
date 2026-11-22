// Aurora Falls — the entry program (Node 22, standard library only).
// It hands the game in: the repository's game/ and screenshots/ go to the
// output directory, and a dossier.json describes them for the judge.
//
// THE FIX THAT MATTERS: the grader mounts the output directory as a bind
// mount, so this program must NEVER delete the output directory itself.
// It creates the directory first, then clears only the game and screenshots
// folders INSIDE it, then copies the fresh files in. Deleting the whole
// output folder breaks the grading run even though it works locally.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Create the output directory first — never remove it afterwards.
mkdirSync(out, { recursive: true });

// Clear only the two folders inside it, never the directory itself.
for (const sub of ['game', 'screenshots']) {
  const target = join(out, sub);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}

cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse — more than
// 4 screenshots or one over 256 KiB, more than 993 files in game/ or 48 MiB
// of game files in all, or a path under game/ over 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
