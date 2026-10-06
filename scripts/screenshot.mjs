// Headless render + screenshot of the Word War scene.
//
//   npm run screenshot                                   → screenshots/scene.png
//   npm run screenshot -- --out shots/a.png --t 12.5 --w 1920 --h 1080
//   npm run screenshot -- --query "view=close" --frames 90
//   npm run screenshot -- --url https://<preview>.vercel.app
//
// Boots the Vite dev server in-process and drives the page with the headless
// Chromium bundled inside @sparticuz/chromium (software WebGL via SwiftShader),
// so no browser download is needed. Software rendering means: always the WebGL 2
// backend, and frame rates here say nothing about real GPUs. `--t` pins scene
// time so shots are repeatable. Set CHROMIUM_PATH to use a system Chrome.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const width = Number(args.w ?? 1536);
const height = Number(args.h ?? 1024);
const frames = Number(args.frames ?? 45);
const t = args.t ?? '8';
const out = resolve(args.out ?? 'screenshots/scene.png');
const timeoutMs = Number(args.timeout ?? 180000);

let server;
let base = args.url;
if (!base) {
  server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const addr = server.httpServer.address();
  base = `http://127.0.0.1:${addr.port}/`;
}
const url = new URL(base);
url.searchParams.set('backend', 'webgl');
url.searchParams.set('t', String(t));
url.searchParams.set('shot', '1');
if (args.query) for (const [k, v] of new URLSearchParams(args.query)) url.searchParams.set(k, v);

const customExe = process.env.CHROMIUM_PATH;
const browser = await puppeteer.launch({
  args: [
    ...(customExe ? ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] : chromium.args),
    '--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader',
  ],
  executablePath: customExe || (await chromium.executablePath()),
  headless: 'shell',
  defaultViewport: { width, height, deviceScaleFactor: 1 },
});

let code = 0;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const started = Date.now();
  await page.goto(url.href, { waitUntil: 'load', timeout: timeoutMs });
  await page.waitForFunction(
    (n) => (window.__ww?.frames ?? 0) >= n || document.getElementById('boot-error'),
    { timeout: timeoutMs, polling: 250 },
    frames,
  );
  const bootError = await page.$eval('#boot-error', (el) => el.textContent).catch(() => null);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  const info = await page.evaluate(() => window.__ww);
  console.log(`✓ ${out}  (${((Date.now() - started) / 1000).toFixed(1)}s, ${info?.frames ?? 0} frames, ${info?.backend ?? '?'})`);
  if (bootError) { console.error(`boot error: ${bootError}`); code = 1; }
  const unique = [...new Set(errors)];
  if (unique.length) console.log(`console (${unique.length}):\n  ${unique.slice(0, 12).join('\n  ')}`);
} catch (err) {
  console.error(err);
  code = 1;
} finally {
  await browser.close();
  await server?.close();
}
process.exit(code);
