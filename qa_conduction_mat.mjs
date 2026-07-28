import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/conduction-mat-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?conduction-mat-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const click = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(70); };
const capture = async name => {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};

await click(435, 32);
await click(130, 289);
const initial = await capture('01-stand-clear-stained-mat');
await click(372, 837);
await advance(2100);
const heated = await capture('02-unchanged-lit-bunsen');

const summary = {
  errors,
  renderer: initial.renderer,
  practical: initial.practical,
  initial_bunsen_lit: initial.bunsen_lit,
  heated_bunsen_lit: heated.bunsen_lit,
  heated_phase: heated.conduction_practical.phase,
  pins_after_2_1_s: heated.conduction_practical.pins_fallen
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!initial.renderer.enabled || initial.renderer.legacy_2d_apparatus) throw new Error('WebGL renderer is not enabled.');
if (initial.practical !== 'Conduction in metals') throw new Error('The conduction practical was not selected.');
if (initial.bunsen_lit || !heated.bunsen_lit) throw new Error('The Bunsen did not retain its normal off/on behavior.');
if (heated.conduction_practical.pins_fallen.copper !== 1) throw new Error('The normal conduction timing changed unexpectedly.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
