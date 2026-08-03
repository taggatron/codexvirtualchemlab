import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/bunsen-slim-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?bunsen-slim-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const click = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(80); };
const capture = async name => {
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(window.render_game_to_text());
    return snapshot.renderer?.canvas_visible && !snapshot.renderer?.scene_compiling;
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};

await click(135, 594);
await advance(180);
const flameSafety = await capture('01-flame-tests-safety');
await advance(1500);
const flameMid = await capture('02-flame-tests-mid-turn');
await advance(1900);
const flameBlue = await capture('03-flame-tests-blue');
await page.screenshot({ path: `${out}/03a-burner-hose-closeup.png`, clip: { x: 260, y: 330, width: 720, height: 410 } });
await page.screenshot({ path: `${out}/03b-dark-grey-cabinet-front.png`, clip: { x: 260, y: 765, width: 860, height: 135 } });

await click(378, 837);
await advance(2300);
await click(378, 837);
await advance(1650);
const colouredFlame = await capture('04-coloured-flame-centred');

await click(435, 32);
await click(130, 289);
const conductionOff = await capture('05-conduction-off');
await click(372, 837);
await advance(220);
const conductionSafety = await capture('06-conduction-safety');
await advance(3400);
const conductionBlue = await capture('07-conduction-blue');

const geometry = flameSafety.bunsen_geometry;
const summary = {
  renderer: conductionBlue.renderer,
  geometry,
  flame_tests: {
    safety: flameSafety.bunsen_load_transition,
    mid: flameMid.bunsen_load_transition,
    blue: flameBlue.bunsen_load_transition,
    coloured_stage: colouredFlame.flame_tests.stage,
    coloured_sample_in_flame: colouredFlame.flame_tests.spatula_in_flame
  },
  conduction: {
    practical: conductionOff.practical,
    initially_lit: conductionOff.bunsen_lit,
    safety: conductionSafety.bunsen_load_transition,
    blue: conductionBlue.bunsen_load_transition
  },
  errors
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!conductionBlue.renderer?.enabled || conductionBlue.renderer?.legacy_2d_apparatus) throw new Error('WebGL renderer is not enabled.');
if (geometry.main_tube_outer_diameter_scene_units !== .208 || geometry.air_intake_collar_height_scene_units !== .2 || geometry.air_intake_outer_diameter_scene_units !== .247 || geometry.air_intake_collar_radial_thickness_scene_units !== .0155 || geometry.air_intake_collar_wall_reduction_percent !== 50) throw new Error('Reduced-wall Bunsen dimensions are not present in structured state.');
if (!geometry.hose_kink_reduced || geometry.hose_minimum_ground_clearance_scene_units < .08 || geometry.hose_overlaps_brass_valve_scene_units < .1 || !geometry.hose_valve_overlap_sleeve) throw new Error('Raised, softened hose routing or valve overlap state is incomplete.');
if (flameBlue.lab_bench_front?.finish !== 'dark grey enamel' || !flameBlue.lab_bench_front?.embossed_door_panelling || !flameBlue.lab_bench_front?.blue_resin_worktop_edge_retained) throw new Error('Dark grey embossed bench frontage is not present in structured state.');
if (!geometry.dependent_animations_realigned || !geometry.collar_turn_uses_updated_geometry || !geometry.flame_rim_core_and_jets_scaled || !geometry.coloured_flame_overlays_scaled) throw new Error('Dependent Bunsen animation state is incomplete.');
if (!flameSafety.bunsen_load_transition.safety_flame_visible || flameSafety.bunsen_load_transition.collar_open_fraction >= .2) throw new Error('Initial Flame Tests safety/collar phase is incorrect.');
if (flameMid.bunsen_load_transition.collar_open_fraction <= .2 || flameMid.bunsen_load_transition.collar_open_fraction >= .9) throw new Error('Mid-turn Flame Tests collar phase is incorrect.');
if (!flameBlue.bunsen_load_transition.powerful_blue_heating_flame_visible || !flameBlue.bunsen_load_transition.complete) throw new Error('Flame Tests did not reach the blue heating phase.');
if (!colouredFlame.flame_tests.spatula_in_flame || colouredFlame.flame_tests.revealed_flame_colour !== 'crimson red') throw new Error('The narrowed coloured-flame interaction is misaligned.');
if (conductionOff.practical !== 'Conduction in metals' || conductionOff.bunsen_lit || !conductionSafety.bunsen_lit || !conductionBlue.bunsen_lit) throw new Error('Conduction Bunsen off/on behavior changed.');
if (!conductionSafety.bunsen_load_transition.safety_flame_visible || !conductionBlue.bunsen_load_transition.powerful_blue_heating_flame_visible) throw new Error('Shared safety-to-blue transition did not survive the geometry change.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
