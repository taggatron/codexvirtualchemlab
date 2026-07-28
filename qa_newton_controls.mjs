import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/newton-controls-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

await page.goto(`http://127.0.0.1:4173/?newton-controls-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.mouse.click(435, 32);
await page.mouse.click(135, 128);
await page.waitForTimeout(350);

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const capture = async name => {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};
const clickFooter = async (x, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.mouse.click(x, 657);
    await page.waitForTimeout(80);
  }
};

const initial = await capture('01-initial');
await clickFooter(335, 2);
const minimum = await capture('02-minimum-force');
await clickFooter(435, 5);
const maximum = await capture('03-maximum-force');
await clickFooter(560);
await page.evaluate(() => window.advanceTime(2600));
const completed = await capture('04-completed-run');
await page.mouse.click(1073, 98);
const graphed = await capture('05-graph');

const summary = {
  errors,
  renderer: initial.renderer,
  initial_force_n: initial.newton2.accelerating_force_n,
  minimum_force_n: minimum.newton2.accelerating_force_n,
  maximum_force_n: maximum.newton2.accelerating_force_n,
  completed: completed.complete,
  recorded_result: completed.newton2.recorded_results.at(-1),
  graph_readings: graphed.graph_readings,
  graph_axes: graphed.graph_axes,
  control_layout: initial.newton2.control_layout
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!initial.renderer.enabled || initial.renderer.legacy_2d_apparatus) throw new Error('WebGL renderer was not enabled.');
if (initial.newton2.accelerating_force_n !== 0.2) throw new Error('Initial force should be 0.2 N.');
if (minimum.newton2.accelerating_force_n !== 0.1) throw new Error('Minimum force clamp failed.');
if (maximum.newton2.accelerating_force_n !== 0.5) throw new Error('Maximum force clamp failed.');
if (initial.newton2.control_layout.force_button_width_px >= 125) throw new Error('Force buttons were not narrowed.');
if (initial.newton2.control_layout.release_to_reading_gap_px < 15.9 || initial.newton2.control_layout.overlaps_reading) throw new Error('Release control overlaps the acceleration card.');
if (!completed.complete || completed.newton2.recorded_results.at(-1)?.acceleration !== 0.5) throw new Error('Trolley run did not complete at the selected force.');
if (graphed.tab !== 'graph' || graphed.graph_readings !== 1) throw new Error('Completed result was not plotted.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
