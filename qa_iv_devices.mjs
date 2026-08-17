import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/iv-devices-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
const baseUrl = process.env.LAB_URL || 'http://127.0.0.1:4175';
await page.goto(`${baseUrl}/?iv-devices-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = milliseconds => page.evaluate(value => window.advanceTime(value), milliseconds);
const click = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(80) };
const capture = async name => { await page.waitForTimeout(220); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); return state() };
const assert = (condition, message) => { if (!condition) throw new Error(message) };
const primary = () => click(367, 837);

// Select Physics, then the twelfth practical in the vertically scrolling rail.
await click(434, 32);
let snapshot = await state();
const index = 11, top = 101, gap = 54, cardHeight = 49, bottom = snapshot.responsive_layout.logical_canvas_px.height - 32;
let centreY = top + index * gap + cardHeight / 2 - snapshot.left_practical_sidebar.scroll_offset_px;
if (centreY > bottom - cardHeight / 2) {
  const targetOffset = Math.max(0, Math.min(snapshot.left_practical_sidebar.maximum_scroll_offset_px, top + index * gap + cardHeight / 2 - (top + bottom) / 2));
  await page.mouse.move(135, (top + bottom) / 2); await page.mouse.wheel(0, targetOffset - snapshot.left_practical_sidebar.scroll_offset_px); await page.waitForTimeout(100); await advance(0); snapshot = await state(); centreY = top + index * gap + cardHeight / 2 - snapshot.left_practical_sidebar.scroll_offset_px;
}
await click(135, centreY);
const initial = await capture('01-resistor-ready');
assert(initial.id === 'ivdevices', `Expected ivdevices, received ${initial.id}`);
assert(initial.renderer.enabled && !initial.renderer.context_lost && initial.renderer.canvas_visible, 'WebGL renderer is not healthy.');
assert(initial.iv_characteristics.apparatus.ammeter.includes('series'), 'Ammeter series contract missing.');
assert(initial.iv_characteristics.apparatus.voltmeter.includes('parallel'), 'Voltmeter parallel contract missing.');
assert(initial.control_label_layout.all_visible_button_labels_fit, 'Initial control label overflow.');

// Ohmic resistor: forward endpoint, reverse endpoint, save.
await primary(); await advance(5600);
const resistorForward = await capture('02-resistor-forward-6v');
assert(resistorForward.iv_characteristics.active_device === 'resistor', 'Resistor not active.');
assert(resistorForward.iv_characteristics.current_a > .049 && resistorForward.iv_characteristics.current_a < .061, 'Resistor current is not near +60 mA.');
await advance(8000);
const resistorReverse = await capture('03-resistor-reverse-complete');
assert(resistorReverse.iv_characteristics.stage === 2 && resistorReverse.iv_characteristics.live_sweep_readings.length === 13, 'Resistor sweep did not finish with 13 readings.');
await primary(); assert((await state()).iv_characteristics.saved_curves.length === 1, 'Resistor curve not saved.');

// Smooth module change to the filament lamp, then capture the hot glowing state.
await primary(); await advance(720); await capture('04-lamp-module-changing'); await advance(1500);
assert((await state()).iv_characteristics.active_device === 'lamp', 'Lamp did not seat in the test socket.');
await primary(); await advance(5600);
const lampForward = await capture('05-filament-lamp-hot');
assert(lampForward.iv_characteristics.current_a > .18, 'Filament lamp did not reach its forward high-current state.');
await advance(8000); assert((await state()).iv_characteristics.stage === 2, 'Lamp sweep did not complete.');
await primary(); await primary(); await advance(2200);
assert((await state()).iv_characteristics.active_device === 'led', 'LED did not seat in the test socket.');

// LED: clearly on forward of threshold, then off under reverse polarity.
await primary(); await advance(5600);
const ledForward = await capture('06-led-forward-on');
assert(ledForward.iv_characteristics.current_ma > 15, 'LED forward current did not exceed 15 mA.');
await advance(4100);
const ledReverse = await capture('07-led-reverse-off');
assert(ledReverse.iv_characteristics.polarity === 'reverse' && Math.abs(ledReverse.iv_characteristics.current_ma) < .1, 'LED reverse current should be almost zero.');
await advance(3900); assert((await state()).iv_characteristics.stage === 2, 'LED sweep did not complete.');
await primary();
const complete = await capture('08-three-curves-complete');
assert(complete.complete && complete.iv_characteristics.saved_curves.length === 3, 'All three curves were not completed.');
for (const curve of complete.iv_characteristics.saved_curves) assert(curve.readings.length === 13, `${curve.device} does not have 13 readings.`);
assert(complete.control_label_layout.all_visible_button_labels_fit, 'Completed controls overflow their buttons.');

// Expanded graph and reset must both be reversible.
await click(1328, 134); await capture('09-expanded-iv-graph'); await page.keyboard.press('Escape'); await page.waitForTimeout(80);
await click(647, 837);
const reset = await capture('10-reset');
assert(reset.iv_characteristics.stage === 0 && reset.iv_characteristics.saved_curves.length === 0 && reset.iv_characteristics.active_device === 'resistor', 'Reset did not restore the resistor-ready state.');
assert(!errors.length, errors.join('\n'));

const summary = { initial, resistorForward, resistorReverse, lampForward, ledForward, ledReverse, complete, reset, errors };
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ practical: complete.practical, curves: complete.iv_characteristics.saved_curves.map(curve => ({ device: curve.device, readings: curve.readings.length })), webgl: complete.renderer, errors }, null, 2));
await browser.close();
