import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/pondweed-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?pondweed-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.mouse.click(320, 32);
await page.mouse.click(135, 344);
await page.waitForTimeout(350);

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const capture = async name => {
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};
const clickDistance = async (x, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.mouse.click(x, 657);
    await page.waitForTimeout(90);
  }
};

const initial = await capture('01-initial-20cm');
await clickDistance(333, 2);
const minimum = await capture('02-minimum-10cm');
await page.mouse.click(533, 657);
const lampOff = await capture('03-filament-lamp-off');
await page.mouse.click(533, 657);
await clickDistance(429, 5);
const maximum = await capture('04-maximum-50cm');
await clickDistance(333, 5);
const minimumAgain = await capture('05-minimum-clamped-10cm');
await page.mouse.click(648, 657);
const counted = await capture('06-count-at-10cm');
await page.mouse.click(1037, 98);
const graphed = await capture('07-graph-10-to-50cm');

const distanceFromGeometry = snapshot =>
  +((snapshot.pondweed.ruler_zero_world_x - snapshot.pondweed.lamp_face_world_x) / snapshot.pondweed.ruler_units_per_cm).toFixed(2);
const summary = {
  errors,
  initial_distance_cm: initial.pondweed.distance_cm,
  minimum_distance_cm: minimum.pondweed.distance_cm,
  minimum_geometry_distance_cm: distanceFromGeometry(minimum),
  lamp_off: !lampOff.pondweed.lamp_on,
  maximum_distance_cm: maximum.pondweed.distance_cm,
  maximum_geometry_distance_cm: distanceFromGeometry(maximum),
  repeated_minimum_click_distance_cm: minimumAgain.pondweed.distance_cm,
  recorded_bubbles_per_minute: counted.last_graph_reading?.y,
  graph_x_axis: graphed.graph_axes?.x,
  controls: minimumAgain.controls,
  renderer: minimumAgain.renderer,
  lamp_model: minimumAgain.pondweed.lamp,
  ruler_zero_reference: minimumAgain.pondweed.ruler_zero_reference,
  ruler_appearance: minimumAgain.pondweed.ruler_appearance,
  ruler_scale_cm: minimumAgain.pondweed.ruler_scale_cm,
  control_layout: minimumAgain.pondweed.control_layout
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (initial.pondweed.distance_cm !== 20) throw new Error('Initial pondweed distance should be 20 cm.');
if (minimum.pondweed.distance_cm !== 10 || minimumAgain.pondweed.distance_cm !== 10) throw new Error('10 cm minimum clamp failed.');
if (maximum.pondweed.distance_cm !== 50) throw new Error('50 cm maximum clamp failed.');
if (distanceFromGeometry(minimum) !== 10 || distanceFromGeometry(maximum) !== 50) throw new Error('Lamp face and beaker-edge ruler geometry disagree with state.');
if (!minimumAgain.pondweed.ruler_appearance.includes('potometer ruler') || JSON.stringify(minimumAgain.pondweed.ruler_scale_cm) !== JSON.stringify([0, 50])) throw new Error('Pondweed did not inherit the potometer ruler appearance and retain its 0–50 cm scale.');
if (!lampOff.pondweed.lamp_on === false) throw new Error('Lamp off control failed.');
if (JSON.stringify(minimum.controls.slice(0, 2)) !== JSON.stringify(['- 10cm', '+ 10cm'])) throw new Error('Distance button labels are incorrect.');
if (minimumAgain.pondweed.control_layout.distance_button_width_px >= 125) throw new Error('Distance buttons were not narrowed.');
if (minimumAgain.pondweed.control_layout.count_to_reading_gap_px < 15.9 || minimumAgain.pondweed.control_layout.overlaps_reading) throw new Error('Count control overlaps the reading card.');
if (counted.graph_readings !== 1 || counted.last_graph_reading?.x !== 10 || counted.last_graph_reading?.y !== 56) throw new Error('10 cm bubble count was not recorded correctly.');
if (graphed.tab !== 'graph' || graphed.graph_axes?.x !== 'distance from beaker edge / cm') throw new Error('Pondweed graph did not use the beaker-edge distance scale.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
