import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/meter-display-qa';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

const baseUrl = process.env.LAB_URL || 'http://127.0.0.1:4173';
await page.goto(`${baseUrl}/?meter-display-qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const click = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(60) };
const capture = async name => {
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};

await click(435, 32);
await click(130, 665);

const initial = await capture('01-meters-unpowered');
await click(372, 837);
await page.evaluate(() => window.advanceTime(1650));
const live = await capture('02-meters-live');
await click(1270, 32);
const focused = await capture('03-meters-live-focus');

const layout = initial.wire_resistance_practical?.circuit_layout;
if (initial.id !== 'wirelength') throw new Error('Resistance practical was not selected.');
if (!initial.renderer.enabled || initial.renderer.context_lost) throw new Error('WebGL renderer is unavailable.');
if (layout?.meter_display_scale !== 0.76) throw new Error('Reduced meter-display scale is missing.');
if (!layout?.meter_displays_parallel_to_sloped_faces || layout?.meter_display_pitch_away_from_camera_deg !== 7.64) throw new Error('Meter displays are not aligned to the sloped faces.');
if (live.wire_resistance_practical?.stage !== 2 || live.wire_resistance_practical?.ammeter_current_a <= 0) throw new Error('Live meter readings did not settle.');
if (!focused.focus_mode) throw new Error('Focus view did not open for close visual inspection.');
if (errors.length) throw new Error(errors.join('\n'));

fs.writeFileSync(`${out}/summary.json`, JSON.stringify({ errors, renderer: initial.renderer, layout, live: { voltage_v: live.wire_resistance_practical.supply_voltage_v, current_a: live.wire_resistance_practical.ammeter_current_a } }, null, 2));
console.log(JSON.stringify({ errors, renderer: initial.renderer, layout, live: { voltage_v: live.wire_resistance_practical.supply_voltage_v, current_a: live.wire_resistance_practical.ammeter_current_a } }, null, 2));
await browser.close();
