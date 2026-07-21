import { chromium } from 'playwright';
import fs from 'node:fs';

const out = '/private/tmp/chem-titration-pink-burst';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://localhost:4173/?titration-pink-burst=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true });
const read = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.mouse.click(135, 282);
const initial = await read();
await page.mouse.click(375, 837);
await page.evaluate(() => window.advanceTime(3250));
const indicatorComplete = await read();

await page.mouse.click(375, 837);
await page.evaluate(() => window.advanceTime(700));
await page.waitForTimeout(80);
await page.screenshot({ path: `${out}/01-bulk-impact-pink-burst.png`, fullPage: true });
const flowingBurst = await read();

await page.evaluate(() => window.advanceTime(4700));
const nearEndpoint = await read();
await page.mouse.click(375, 837);
await page.evaluate(() => window.advanceTime(350));
await page.waitForTimeout(80);
await page.screenshot({ path: `${out}/02-single-drop-pink-burst.png`, fullPage: true });
const dropBurst = await read();

await page.evaluate(() => window.advanceTime(120));
await page.waitForTimeout(80);
await page.screenshot({ path: `${out}/03-pink-dispersed.png`, fullPage: true });
const dispersed = await read();

for (let i = 0; i < 4; i++) {
  await page.mouse.click(375, 837);
  await page.evaluate(() => window.advanceTime(470));
}
await page.waitForTimeout(80);
await page.screenshot({ path: `${out}/04-permanent-pale-pink-endpoint.png`, fullPage: true });
const endpoint = await read();

const result = {
  renderer: initial.renderer,
  initial: initial.titration,
  indicatorComplete: indicatorComplete.titration,
  flowingBurst: flowingBurst.titration,
  nearEndpoint: nearEndpoint.titration,
  dropBurst: dropBurst.titration,
  dispersed: dispersed.titration,
  endpoint: endpoint.titration,
  complete: endpoint.complete,
  errors
};
fs.writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
if (initial.renderer?.enabled !== true || initial.titration?.stage !== 0) throw new Error('Initial titration scene failed');
if (indicatorComplete.titration?.stage !== 1 || !indicatorComplete.titration?.indicator_added) throw new Error('Indicator addition failed');
if (!flowingBurst.titration?.tap_open || !flowingBurst.titration?.transient_pink_mixing_active) throw new Error('Bulk-flow pink mixing state failed');
if (nearEndpoint.titration?.stage !== 3 || nearEndpoint.titration?.burette_final_reading_cm3 !== 24.8) throw new Error('Near-endpoint state failed');
if (!dropBurst.titration?.transient_pink_mixing_active || dropBurst.titration?.dropwise_additions !== 1) throw new Error('Single-drop pink mixing state failed');
if (dispersed.titration?.transient_pink_mixing_active || dispersed.titration?.flask_colour !== 'colourless') throw new Error('Transient pink did not disperse');
if (!endpoint.complete || endpoint.titration?.titre_cm3 !== 25.05 || endpoint.titration?.flask_colour !== 'permanent very pale pink') throw new Error('Permanent endpoint regression');
if (errors.length) throw new Error(errors.join('\n'));
await browser.close();
console.log(JSON.stringify(result, null, 2));
