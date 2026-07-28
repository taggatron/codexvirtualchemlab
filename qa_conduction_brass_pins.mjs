import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/conduction-brass-pins-qa';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', error => errors.push(`page: ${error.message}`));

await page.goto(`http://127.0.0.1:4173/?conduction-brass-pins-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const click = async (x, y) => {
  await page.mouse.click(x, y);
  await page.waitForTimeout(80);
};
const capture = async name => {
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
  await page.screenshot({
    path: `${out}/${name}-arena.png`,
    clip: { x: 270, y: 229, width: 840, height: 544 }
  });
  return state();
};

await click(435, 32);
await click(130, 289);
const initial = await capture('01-attached');

await click(372, 837);
await advance(9600);
const complete = await capture('02-fallen');

const summary = {
  errors,
  renderer: initial.renderer,
  drawing_pin_design: initial.conduction_practical.drawing_pin_design,
  initial_phase: initial.conduction_practical.phase,
  complete_phase: complete.conduction_practical.phase,
  pins_fallen: complete.conduction_practical.pins_fallen,
  complete: complete.complete
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

const design = initial.conduction_practical.drawing_pin_design;
if (!initial.renderer.enabled || initial.renderer.legacy_2d_apparatus) throw new Error('WebGL renderer is not enabled.');
if (design.head_material !== 'polished brass') throw new Error('Drawing-pin heads are not reported as polished brass.');
if (design.shaft_attachment !== 'exact geometric centre of the brass head') throw new Error('Drawing-pin shaft is not centre-attached.');
if (design.shaft_angle_to_head_degrees !== 90) throw new Error('Drawing-pin shaft is not perpendicular to its head.');
if (!complete.complete || Object.values(complete.conduction_practical.pins_fallen).some(count => count !== 4)) throw new Error('The complete twelve-pin fall sequence did not finish.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
