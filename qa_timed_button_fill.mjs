import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/timed-button-fill-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?timed-button-fill-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const click = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(80); };
const capture = async name => {
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
const pixels = points => page.evaluate(samplePoints => {
  const canvas = document.getElementById('lab'), context = canvas.getContext('2d');
  return samplePoints.map(({ x, y }) => [...context.getImageData(x, y, 1, 1).data]);
}, points);
const assertFillSplit = async (label, leftX, rightX, y) => {
  const [left, right] = await pixels([{ x: leftX, y }, { x: rightX, y }]);
  const colourDistance = Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
  if (colourDistance < 90) throw new Error(`${label} did not show distinct filled and unfilled regions: ${JSON.stringify({ left, right })}`);
  return { left, right, colour_distance: colourDistance };
};

// Physics: the control shown in the user's reference, first while adding tracer,
// then during the longer convection observation period.
await click(438, 32);
await click(130, 290);
if ((await state()).id !== 'convection') throw new Error('Could not select the convection practical.');
await click(372, 837);
await advance(950);
const tracerFill = await assertFillSplit('Convection tracer button', 300, 446, 837);
await capture('01-convection-adding-tracer-half-fill');
await advance(1000);
await click(372, 837);
await advance(4200);
const convectionFill = await assertFillSplit('Convection observation button', 300, 446, 837);
await capture('02-convection-active-half-fill');

// Biology: verify both the short chip transfer and the explicit 30-minute method period.
await click(330, 32);
await click(130, 235);
if ((await state()).id !== 'osmosis') throw new Error('Could not select the osmosis practical.');
await click(388, 837);
await advance(1300);
const transferFill = await assertFillSplit('Osmosis transfer button', 310, 470, 837);
await capture('03-osmosis-transfer-half-fill');
await advance(1300);
await advance(2700);
const soakFill = await assertFillSplit('Osmosis soak button', 310, 470, 837);
await capture('04-osmosis-30-minute-soak-half-fill');

const summary = {
  errors,
  tracer_fill: tracerFill,
  convection_fill: convectionFill,
  osmosis_transfer_fill: transferFill,
  osmosis_soak_fill: soakFill,
  final_state: await state()
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
