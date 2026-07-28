import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/ph-meter-curved-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', error => errors.push(`page: ${error.message}`));

await page.goto(`http://127.0.0.1:4173/?ph-meter-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.waitForTimeout(400);
await page.evaluate(() => { window.__manualSimulationTime = true; });

const read = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const click = async (x, y) => {
  await page.mouse.click(x, y);
  await page.waitForTimeout(100);
};
const drag = async (x1, y1, x2, y2) => {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(140);
};
const capture = async name => {
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return read();
};

// Add a beaker and the pH probe. It should dock without manual placement.
await click(1120, 222);
await click(1120, 552);
const emptyBeaker = await capture('01-auto-positioned-empty-beaker');

// Add 25 mL 0.100 mol dm-3 HCl: [H+] = 0.100 mol dm-3, pH 1.00.
await click(1190, 96);
await click(1120, 167);
await click(760, 423);
const acid = await capture('02-hcl-ph-1');

// Add an equal NaOH dose: equal acid/base equivalents give pH 7.00.
await click(1120, 222);
await click(760, 423);
await page.evaluate(() => window.advanceTime(650));
const neutral = await capture('03-neutralisation-ph-7');

// Add a test tube, then move the probe by its upper display into that tube.
await click(1060, 96);
await click(1120, 277);
await drag(345, 355, 555, 355);
const tubeDock = await capture('04-auto-positioned-test-tube');

// Drag NaOH from the shelf to the test tube so its own pH becomes 13.00.
await click(1190, 96);
await drag(1120, 222, 555, 528);
await click(760, 423);
const alkalineTube = await capture('05-test-tube-naoh-ph-13');

// Move the test tube; the attached probe must follow and retain the reading.
await click(1060, 96);
await drag(555, 540, 700, 500);
const movedTube = await capture('06-probe-follows-test-tube');

const find = (payload, type) => payload.workspace_items.find(item => item.type === type);
const emptyMeter = find(emptyBeaker, 'phmeter');
const beaker = find(emptyBeaker, 'beaker');
const acidMeter = find(acid, 'phmeter');
const neutralMeter = find(neutral, 'phmeter');
const tube = tubeDock.workspace_items.find(item => item.type === 'tube');
const tubeMeter = find(tubeDock, 'phmeter');
const alkalineMeter = find(alkalineTube, 'phmeter');
const movedMeter = find(movedTube, 'phmeter');
const movedTarget = movedTube.workspace_items.find(item => item.uid === movedMeter.attached_to);
const result = {
  renderer: emptyBeaker.renderer,
  empty_beaker: { beaker, meter: emptyMeter },
  hcl_display_ph: acidMeter?.display_ph,
  neutral_display_ph: neutralMeter?.display_ph,
  test_tube_dock: { tube, meter: tubeMeter },
  test_tube_naoh_display_ph: alkalineMeter?.display_ph,
  moved_test_tube: { target: movedTarget, meter: movedMeter },
  errors
};
fs.writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));

if (emptyBeaker.renderer?.enabled !== true) throw new Error('WebGL renderer did not load');
if (!emptyMeter?.auto_positioned || emptyMeter.attached_to !== beaker?.uid || emptyMeter.display_ph !== null) throw new Error('Probe did not auto-position in the empty beaker');
if (emptyMeter.display_surface !== 'curved cylindrical arc following the upper housing' || !emptyMeter.metallic_sensor_nib_visible || !emptyMeter.raised_for_nib_visibility) throw new Error('Curved display or raised metallic nib state is missing');
if (acidMeter?.display_ph !== 1) throw new Error(`Expected HCl pH 1.00, received ${acidMeter?.display_ph}`);
if (neutralMeter?.display_ph !== 7) throw new Error(`Expected neutral pH 7.00, received ${neutralMeter?.display_ph}`);
if (!tube || tubeMeter?.attached_to !== tube.uid) throw new Error('Probe did not reposition into the test tube');
if (alkalineMeter?.display_ph !== 13) throw new Error(`Expected NaOH pH 13.00, received ${alkalineMeter?.display_ph}`);
if (movedMeter?.attached_to !== movedTarget?.uid || movedTarget?.x < 650 || movedMeter?.display_ph !== 13) throw new Error('Probe did not follow the moved test tube');
if (errors.length) throw new Error(errors.join('\n'));

await browser.close();
console.log(JSON.stringify(result, null, 2));
