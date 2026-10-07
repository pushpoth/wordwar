// Headless render + screenshot of the Word War scene.
//
//   npm run screenshot                                   → screenshots/scene.png
//   npm run screenshot -- --out shots/a.png --t 12.5 --w 1920 --h 1080
//   npm run screenshot -- --query "view=close" --frames 90
//   npm run screenshot -- --url https://<preview>.vercel.app
//   npm run screenshot -- --hud --no-pin --keys "E,T,A,Tab" --key-frames 12   (play, then shoot)
//   --touch --w 844 --h 390   (emulate a phone: coarse pointer, mobile viewport)
//   …--keys "drag:200:0"   (orbit by dragging the canvas)
//   …--keys "tapxy:520:340"   (tap the canvas at a pixel, e.g. a ship)
//   …--keys "tap:E,tap:A"   (tap on-screen keys; text of any HUD button)
//   …--keys "E,A,Reload"   ("Reload" reloads the page, keeping its storage)
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
const pin = !args['no-pin'];
const keys = typeof args.keys === 'string' ? args.keys.split(',').map((k) => k.trim()).filter(Boolean) : [];
const keyFrames = Number(args['key-frames'] ?? 10);
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
if (pin) url.searchParams.set('t', String(t));
if (!args.hud) url.searchParams.set('shot', '1');
if (args.query) for (const [k, v] of new URLSearchParams(args.query)) url.searchParams.set(k, v);

const customExe = process.env.CHROMIUM_PATH;
const browser = await puppeteer.launch({
  args: [
    ...(customExe ? ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] : chromium.args),
    '--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader',
  ],
  executablePath: customExe || (await chromium.executablePath()),
  headless: 'shell',
  defaultViewport: { width, height, deviceScaleFactor: 1, ...(args.touch ? { hasTouch: true, isMobile: true } : {}) },
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
  // Play: press each key, then let the scene run a few frames.
  for (const key of keys) {
    if (key === 'Reload') {
      // Reload the page (same browser storage) and wait for it to draw again.
      await page.reload({ waitUntil: 'load', timeout: timeoutMs });
      await page.waitForFunction((n) => (window.__ww?.frames ?? 0) >= n, { timeout: timeoutMs, polling: 250 }, frames);
      continue;
    }
    if (key.startsWith('drag:')) {
      // Drag on the canvas from near the centre by dx:dy pixels (e.g. drag:200:0).
      const [dx, dy] = key.slice(5).split(':').map(Number);
      const x0 = page.viewport().width / 2;
      const y0 = page.viewport().height / 2;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      await page.mouse.move(x0 + dx, y0 + dy, { steps: 10 });
      await page.mouse.up();
    } else if (key.startsWith('tapxy:')) {
      // Tap the canvas at a pixel position (e.g. tapxy:520:340).
      const [x, y] = key.slice(6).split(':').map(Number);
      await page.mouse.click(x, y);
    } else if (key.startsWith('tap:')) {
      // Tap an on-screen control by its text (a key, an intel row): a real pointer event at its centre.
      const label = key.slice(4);
      const box = await page.evaluate((t) => {
        const e = [...document.querySelectorAll('.hud button, .hud li')].find((n) => n.textContent.trim() === t);
        const r = e?.getBoundingClientRect();
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      }, label);
      if (!box) throw new Error(`nothing to tap with text "${label}"`);
      await page.mouse.click(box.x, box.y);
    } else await page.keyboard.press(key.length === 1 ? key.toUpperCase() : key);
    const target = (await page.evaluate(() => window.__ww?.frames ?? 0)) + keyFrames;
    await page.waitForFunction((n) => (window.__ww?.frames ?? 0) >= n, { timeout: timeoutMs, polling: 200 }, target);
  }
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
