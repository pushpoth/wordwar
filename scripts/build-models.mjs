// Builds every Blender model script into public/models/<name>.glb.
//   npm run models            → all models
//   npm run models -- buoy    → just the named ones
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'assets-src/blender/models');
const outDir = join(root, 'public/models');
mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
const scripts = readdirSync(srcDir)
  .filter((f) => f.endsWith('.py'))
  .map((f) => f.slice(0, -3))
  .filter((name) => only.length === 0 || only.includes(name))
  .sort();

if (scripts.length === 0) {
  console.error(`No model scripts matched: ${only.join(', ')}`);
  process.exit(1);
}

const blender = process.env.BLENDER ?? 'blender';
let failed = 0;
for (const name of scripts) {
  const started = Date.now();
  try {
    const out = execFileSync(
      blender,
      ['--background', '--factory-startup', '--python-exit-code', '1',
        '--python', join(srcDir, `${name}.py`), '--', join(outDir, `${name}.glb`)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const line = out.split('\n').find((l) => l.startsWith('[ww] wrote')) ?? '(no summary)';
    console.log(`✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)}s) ${line.replace(/^\[ww\] wrote \S+ · /, '')}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}\n${err.stdout ?? ''}\n${err.stderr ?? ''}`);
  }
}
process.exit(failed ? 1 : 0);
