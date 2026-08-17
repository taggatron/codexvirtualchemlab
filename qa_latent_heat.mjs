import { chromium } from './qa_playwright_shim.mjs';
import fs from 'node:fs';

const out = 'output/latent-heat-qa';
const baseUrl = process.env.LAB_URL || process.env.BASE_URL || 'http://127.0.0.1:4173';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

await page.goto(`${baseUrl}/?latent-heat-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = milliseconds => page.evaluate(value => window.advanceTime(value), milliseconds);
const click = async (x, y, pause = 90) => {
  await page.mouse.click(x, y);
  if (pause) await page.waitForTimeout(pause);
};
const capture = async name => {
  await page.waitForTimeout(520);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};
const assert = (condition, message) => { if (!condition) throw new Error(message) };
const closeTo = (actual, expected, tolerance = 0.2) => Math.abs(actual - expected) <= tolerance;

async function selectLatentHeat() {
  await click(435, 32);
  const discovered = new Set();
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 105; y <= 850; y += 22) {
      await click(130, y, 18);
      const snapshot = await state();
      if (snapshot.practical) discovered.add(snapshot.practical);
      if (/heating\s*(?:&|and)\s*cooling curves|latent heat/i.test(snapshot.practical || '')) return snapshot;
    }
    await page.mouse.move(130, 600);
    await page.mouse.wheel(0, 520);
    await page.waitForTimeout(90);
  }
  throw new Error(`Could not locate latent-heat practical. Saw: ${[...discovered].join(', ')}`);
}

const primary = () => click(378, 837);
const sample = () => click(553, 837);
const reset = () => click(676, 837);
const expandGraph = () => click(1381, 134);

await selectLatentHeat();
let initial = await capture('01-paraffin-apparatus-ready');
assert(initial.renderer.enabled && !initial.renderer.context_lost && !initial.renderer.legacy_2d_apparatus, 'Latent-heat WebGL apparatus did not load.');
assert(initial.latent_heat_practical?.material === 'paraffin', 'Paraffin should be the initial sample.');
assert(initial.latent_heat_practical?.apparatus?.beaker?.includes('500 cm³'), 'The 500 cm³ beaker water bath is missing.');
assert(initial.latent_heat_practical?.apparatus?.support?.includes('rubber-lined'), 'The independent boiling-tube clamp is missing.');
assert(initial.latent_heat_practical?.apparatus?.thermometer?.includes('centred inside the sample'), 'Thermometer-bulb placement is not explicit.');
assert(initial.latent_heat_practical?.initial_layout?.boiling_tube?.includes('left-side'), 'The boiling tube is not staged on the left-side tray.');
assert(initial.latent_heat_practical?.initial_layout?.thermometer?.includes('lying flat'), 'The thermometer is not staged flat beside the boiling tube.');
assert(initial.latent_heat_practical?.submerged_sample_optics?.pellets_or_flakes_remain_visible, 'Submerged solid sample visibility is not guaranteed.');
assert(initial.control_label_layout?.all_visible_button_labels_fit, 'A latent-heat control label overflows its button.');

await sample();
const stearicInitial = await capture('02-stearic-flake-sample');
assert(stearicInitial.latent_heat_practical?.material === 'stearic' && stearicInitial.latent_heat_practical?.sample_form?.includes('flakes'), 'Stearic-acid flakes were not selected.');
assert(stearicInitial.latent_heat_practical?.melting_point_c === 69, 'Stearic-acid plateau temperature should be 69 °C.');
await sample();
initial = await state();
assert(initial.latent_heat_practical?.material === 'paraffin', 'Paraffin sample did not restore.');

await primary();
await advance(1900);
const assembling = await capture('03-tube-clamp-thermometer-assembly');
assert(assembling.latent_heat_practical.stage === 1, 'Assembly stage did not remain active at its midpoint.');
assert(assembling.latent_heat_practical.animation.tube_arcs_and_lowers_into_bath, 'Tube-transfer animation is not reported.');
await advance(2000);
const assembled = await capture('04-paraffin-clamped-in-water-bath');
assert(assembled.latent_heat_practical.stage === 2, 'Water-bath apparatus did not finish assembling.');

await primary();
await advance(4500);
const melting = await capture('05-paraffin-melting-plateau');
assert(melting.latent_heat_practical.stage === 3 && melting.latent_heat_practical.physical_state === 'melting', 'Paraffin is not melting at the heating checkpoint.');
assert(closeTo(melting.latent_heat_practical.temperature_c, 55, 1), `Unexpected paraffin melting temperature: ${melting.latent_heat_practical.temperature_c}`);
assert(melting.latent_heat_practical.measurements.heating.length >= 5, 'Heating logger did not save equal-interval readings.');
if (process.env.LATENT_VISUAL_ONLY === '1') {
  assert(errors.length === 0, errors.join('\n'));
  console.log(JSON.stringify({ errors, stage: melting.latent_heat_practical.stage, temperature_c: melting.latent_heat_practical.temperature_c, physical_state: melting.latent_heat_practical.physical_state }, null, 2));
  await browser.close();
  process.exit(0);
}
await advance(7600);
const hotLiquid = await capture('06-hot-liquid-before-cooling');
assert(hotLiquid.latent_heat_practical.stage === 4 && closeTo(hotLiquid.latent_heat_practical.temperature_c, 82), 'Paraffin heating curve did not finish at 82 °C.');
assert(hotLiquid.latent_heat_practical.measurements.heating.length === 13, 'Paraffin heating curve should contain 13 readings.');
assert(hotLiquid.bunsen_lit, 'The Bunsen should remain lit until cooling is started.');

await primary();
await advance(4800);
const freezing = await capture('07-paraffin-freezing-plateau');
assert(freezing.latent_heat_practical.stage === 5 && freezing.latent_heat_practical.physical_state === 'solidifying', 'Paraffin is not solidifying at the cooling checkpoint.');
assert(closeTo(freezing.latent_heat_practical.temperature_c, 55, 1), `Unexpected paraffin freezing temperature: ${freezing.latent_heat_practical.temperature_c}`);
assert(!freezing.bunsen_lit, 'Bunsen flame stayed on during cooling.');
await advance(5800);
const paraffinComplete = await capture('08-paraffin-complete-curves');
const paraffin = paraffinComplete.latent_heat_practical;
assert(paraffinComplete.complete && paraffin.stage === 6, 'Paraffin heating/cooling study did not complete.');
assert(paraffin.measurements.heating.length === 13 && paraffin.measurements.cooling.length === 13, 'Paraffin curves should contain 13 heating and 13 cooling readings.');
assert(paraffin.curve_features.heating_plateau_visible && paraffin.curve_features.cooling_plateau_visible, 'Both paraffin phase-change plateaux should be visible.');
assert(paraffinComplete.graph_axes?.chart_type?.includes('two-series'), 'Results are not exposed as two-series curves.');

await expandGraph();
const expanded = await capture('09-expanded-dual-curve-graph');
assert(expanded.graph_modal?.open && expanded.graph_modal?.chart_kind === 'latent-heat-dual-curve', 'Expanded dual-curve graph did not open.');
await page.keyboard.press('Escape');
await reset();
await sample();
const stearicReady = await state();
assert(stearicReady.latent_heat_practical?.material === 'stearic', 'Stearic acid was not selected for the second run.');

await primary();
await advance(3900);
const stearicAssembled = await capture('10a-stearic-clamped-in-water-bath');
assert(stearicAssembled.latent_heat_practical?.stage === 2 && stearicAssembled.latent_heat_practical?.submerged_sample_optics?.water_reduces_brightness, 'Stearic acid did not remain visibly water-filtered after assembly.');
await primary();
await advance(12100);
let stearicHot = await state();
assert(stearicHot.latent_heat_practical?.stage === 4 && closeTo(stearicHot.latent_heat_practical.temperature_c, 88), 'Stearic heating curve did not finish at 88 °C.');
await primary();
await advance(10600);
const stearicComplete = await capture('10-stearic-complete-curves');
const stearic = stearicComplete.latent_heat_practical;
assert(stearicComplete.complete && stearic.stage === 6, 'Stearic-acid study did not complete.');
assert(stearic.melting_point_c === 69 && stearic.curve_features.plateau_temperature_c === 69, 'Stearic-acid curves do not use the 69 °C plateau.');
assert(stearic.measurements.heating.length === 13 && stearic.measurements.cooling.length === 13, 'Stearic curves should contain 26 total readings.');
assert(errors.length === 0, errors.join('\n'));

const summary = {
  errors,
  renderer: initial.renderer,
  paraffin: {
    plateau_temperature_c: paraffin.curve_features.plateau_temperature_c,
    heating_readings: paraffin.measurements.heating,
    cooling_readings: paraffin.measurements.cooling
  },
  stearic: {
    plateau_temperature_c: stearic.curve_features.plateau_temperature_c,
    heating_readings: stearic.measurements.heating,
    cooling_readings: stearic.measurements.cooling
  },
  graph_modal_kind: expanded.graph_modal.chart_kind,
  control_labels_fit: initial.control_label_layout.all_visible_button_labels_fit
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  errors,
  renderer: initial.renderer,
  paraffin: { plateau_c: 55, heating_points: 13, cooling_points: 13 },
  stearic: { plateau_c: 69, heating_points: 13, cooling_points: 13 },
  graph_modal: expanded.graph_modal.chart_kind
}, null, 2));

await browser.close();
