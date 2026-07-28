import { chromium } from 'playwright';
import fs from 'node:fs';

const out = '/private/tmp/chem-flame-label-clearance';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?flame-label-clearance=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

await page.mouse.click(135, 507);
await page.waitForTimeout(180);
await page.screenshot({ path: `${out}/01-all-labels-clear-ready.png`, fullPage: true });
const ready = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.mouse.click(378, 657);
await page.evaluate(() => window.advanceTime(2300));
await page.waitForTimeout(100);
await page.screenshot({ path: `${out}/02-all-labels-clear-loaded-spatula.png`, fullPage: true });
const loaded = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.mouse.click(378, 657);
await page.evaluate(() => window.advanceTime(1650));
await page.waitForTimeout(120);
await page.screenshot({ path: `${out}/03-all-labels-clear-active-flame.png`, fullPage: true });
const active = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

const result = {
  ready: ready.flame_tests,
  loaded: loaded.flame_tests,
  active: active.flame_tests,
  renderer: active.renderer,
  errors
};
fs.writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));

if (ready.practical !== 'Flame tests' || ready.flame_tests.stage !== 0) throw new Error('Flame-test ready state did not load');
if (!ready.flame_tests.apparatus_layout?.all_sample_labels_visible) throw new Error('Ready layout does not guarantee sample-label clearance');
if (loaded.flame_tests.stage !== 2 || !loaded.flame_tests.spatula_loaded) throw new Error('Loaded-spatula state did not render');
if (active.flame_tests.stage !== 3 || !active.flame_tests.spatula_in_flame || active.flame_tests.revealed_flame_colour !== 'crimson red') throw new Error('Active coloured-flame state did not render');
if (!active.flame_tests.apparatus_layout?.all_sample_labels_visible) throw new Error('Active layout does not preserve sample-label clearance');
if (active.renderer?.enabled !== true) throw new Error('WebGL renderer is not enabled');
if (errors.length) throw new Error(errors.join('\n'));

await browser.close();
console.log(JSON.stringify(result, null, 2));
