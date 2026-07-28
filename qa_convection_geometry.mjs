import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/convection-geometry-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?convection-geometry-qa=${Date.now()}`, { waitUntil: 'networkidle' });
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
await click(130, 235);
const initial = await capture('01-raised-shortened-tube');
await click(372, 837);
await advance(2000);
await click(372, 837);
await advance(3000);
const active = await capture('02-flame-and-rising-tracer');
await advance(5600);
const complete = await capture('03-complete-loop');

const summary = {
  errors,
  renderer: initial.renderer,
  initial_geometry: initial.convection_practical.geometry,
  active_phase: active.convection_practical.phase,
  active_flow: active.convection_practical.flow_direction,
  complete: complete.complete,
  loop_visible: complete.convection_practical.complete_loop_visible
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

const geometry = initial.convection_practical.geometry;
if (!initial.renderer.enabled || initial.renderer.legacy_2d_apparatus) throw new Error('WebGL renderer is not enabled.');
if (!geometry.tube_above_burner || geometry.tube_outside_bottom_y <= geometry.burner_body_top_y) throw new Error('The convection tube is not clear of the burner body.');
if (Math.abs(geometry.tube_clearance_above_burner - .067) > .001) throw new Error('Unexpected burner-to-tube clearance.');
if (!geometry.shortened_to_fit_arena || geometry.total_outside_height >= 2) throw new Error('The convection tube was not shortened to fit the arena.');
if (!active.convection_practical.bunsen_lit || !active.convection_practical.flow_direction.startsWith('clockwise')) throw new Error('The heated convection state did not activate correctly.');
if (!complete.complete || !complete.convection_practical.complete_loop_visible) throw new Error('The tracer did not complete the loop.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
