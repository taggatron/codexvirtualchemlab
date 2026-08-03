import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/extra-physics-qa';
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

await page.goto(`http://127.0.0.1:4173/?extra-physics-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = milliseconds => page.evaluate(value => window.advanceTime(value), milliseconds);
const click = async (x, y) => {
  await page.mouse.click(x, y);
  await page.waitForTimeout(70);
};
const capture = async name => {
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};
const primary = () => click(372, 837);

// Physics tab and resistance-versus-length card. Hooke's law and specific
// heat capacity now sit between density and resistance in the generated rail.
await click(435, 32);
await click(130, 613);
const wireInitial = await capture('01-wire-initial');
await primary();
await advance(650);
const wireSettling = await capture('02-wire-switch-closing');
await advance(1000);
const wireSteady = await capture('03-wire-meters-steady');
await primary();
const wireFirstRecorded = await capture('04-wire-first-recorded');
await primary();
await advance(1120);
const wireClipMoving = await capture('05-wire-clip-moving');
await advance(1550);
const wireSecondLength = await capture('06-wire-second-length');

for (let trial = 1; trial < 5; trial++) {
  await primary();
  await advance(1600);
  await primary();
  if (trial < 4) {
    await primary();
    await advance(2600);
  }
}
const wireComplete = await capture('07-wire-complete-graph');

// Magnetic-field-pattern card.
await click(130, 667);
const fieldInitial = await capture('08-field-single-initial');
await primary();
await advance(1600);
const fieldSprinkling = await capture('09-field-sprinkling');
await advance(2000);
const fieldLoose = await capture('10-field-loose-filings');
await primary();
await advance(2200);
const fieldAligning = await capture('11-field-aligning');
await advance(2500);
const fieldSingleReady = await capture('12-field-single-pattern');
await primary();
await advance(1280);
const fieldChanging = await capture('13-field-clearing-and-changing');
await advance(2050);
const fieldAttractionInitial = await capture('14-field-attraction-initial');

await primary();
await advance(3500);
await primary();
await advance(4700);
const fieldAttractionReady = await capture('15-field-attraction-pattern');
await primary();
await advance(3300);
const fieldRepulsionInitial = await capture('16-field-repulsion-initial');

await primary();
await advance(3500);
await primary();
await advance(4700);
const fieldRepulsionReady = await capture('17-field-repulsion-pattern');
await primary();
const fieldComplete = await capture('18-field-complete-patterns');

const summary = {
  errors,
  renderer: wireInitial.renderer,
  wire: {
    initial: wireInitial.wire_resistance_practical,
    settling: wireSettling.wire_resistance_practical,
    steady: wireSteady.wire_resistance_practical,
    first_recorded: wireFirstRecorded.wire_resistance_practical.measured_results,
    moving: wireClipMoving.wire_resistance_practical,
    second_length_cm: wireSecondLength.wire_resistance_practical.length_cm,
    complete: wireComplete.complete,
    results: wireComplete.wire_resistance_practical.measured_results,
    graph_axes: wireComplete.graph_axes
  },
  magnetic_field: {
    initial: fieldInitial.magnetic_field_practical,
    sprinkling: fieldSprinkling.magnetic_field_practical,
    loose: fieldLoose.magnetic_field_practical,
    aligning: fieldAligning.magnetic_field_practical,
    single_ready: fieldSingleReady.magnetic_field_practical,
    changing: fieldChanging.magnetic_field_practical,
    attraction_initial: fieldAttractionInitial.magnetic_field_practical,
    attraction_ready: fieldAttractionReady.magnetic_field_practical,
    repulsion_initial: fieldRepulsionInitial.magnetic_field_practical,
    repulsion_ready: fieldRepulsionReady.magnetic_field_practical,
    complete: fieldComplete.complete,
    recorded_patterns: fieldComplete.magnetic_field_practical.recorded_patterns
  }
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!wireInitial.renderer.enabled || wireInitial.renderer.legacy_2d_apparatus) throw new Error('WebGL renderer is not enabled.');
if (wireSteady.wire_resistance_practical.stage !== 2 || wireSteady.wire_resistance_practical.ammeter_current_a <= 0) {
  throw new Error('Wire meters did not settle to a live reading.');
}
if (wireSecondLength.wire_resistance_practical.length_cm !== 40) throw new Error('Sliding contact did not advance to 40 cm.');
if (!wireComplete.complete || wireComplete.graph_readings !== 5) throw new Error('Wire series did not complete with five readings.');
if (JSON.stringify(wireComplete.wire_resistance_practical.measured_results.map(result => result.resistance_ohm)) !== JSON.stringify([1.8, 3.6, 5.4, 7.2, 9])) {
  throw new Error('Wire resistance results are incorrect.');
}
if (fieldSprinkling.magnetic_field_practical.stage !== 1 || fieldSprinkling.magnetic_field_practical.filings.visible_fraction <= 0) {
  throw new Error('Filings did not sprinkle progressively.');
}
if (fieldAligning.magnetic_field_practical.stage !== 3 || fieldAligning.magnetic_field_practical.filings.aligned_to_local_field) {
  throw new Error('Field-alignment stage metadata is incorrect.');
}
if (fieldSingleReady.magnetic_field_practical.configuration !== 'single' || !fieldSingleReady.magnetic_field_practical.observation) {
  throw new Error('Single-magnet field pattern did not form.');
}
if (fieldAttractionReady.magnetic_field_practical.configuration !== 'attraction') throw new Error('Attraction configuration did not load.');
if (fieldRepulsionReady.magnetic_field_practical.configuration !== 'repulsion') throw new Error('Repulsion configuration did not load.');
if (!fieldComplete.complete || fieldComplete.magnetic_field_practical.recorded_patterns.length !== 3) {
  throw new Error('Magnetic-field study did not complete with three patterns.');
}
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
