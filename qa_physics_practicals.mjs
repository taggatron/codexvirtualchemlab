import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/physics-practicals-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?physics-practicals-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const click = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(70); };
const capture = async name => {
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};
const primary = () => click(372, 837);

await click(435, 32);
await click(130, 181);
const electromagnetInitial = await capture('01-electromagnet-initial');
await primary();
await advance(1100);
const electromagnetEnergised = await capture('02-electromagnet-energised');
await primary();
await advance(820);
const electromagnetLowering = await capture('03-electromagnet-lowering');
await advance(850);
await primary();
await advance(920);
const electromagnetLifting = await capture('04-electromagnet-lifting-clips');
await advance(1050);
const electromagnetSuspended = await capture('05-electromagnet-suspended-clips');
await primary();
for (let trial = 1; trial < 5; trial++) {
  await primary();
  await primary();
  await advance(1100);
  await primary();
  await advance(1650);
  await primary();
  await advance(1950);
  await primary();
}
const electromagnetComplete = await capture('06-electromagnet-series-graph');

await click(130, 235);
const convectionInitial = await capture('07-convection-initial');
await primary();
await advance(980);
const convectionTracerDrop = await capture('08-convection-tracer-drop');
await advance(1000);
await primary();
await advance(3000);
const convectionRising = await capture('09-convection-rising-tracer');
await advance(2800);
const convectionLoop = await capture('10-convection-complete-loop');
await advance(3000);
const convectionComplete = await capture('11-convection-complete');
await click(522, 837);
const convectionObservation = await capture('12-convection-observation');

await click(130, 289);
const conductionInitial = await capture('13-conduction-initial');
await primary();
await advance(2100);
const conductionCopperLead = await capture('14-conduction-copper-first');
await advance(3300);
const conductionMiddle = await capture('15-conduction-mid-race');
await advance(4200);
const conductionComplete = await capture('16-conduction-complete');
await click(500, 837);
const conductionResults = await capture('17-conduction-results');

await click(130, 343);
const thermalInitial = await capture('18-thermal-initial');
await primary();
await advance(1350);
const thermalPour = await capture('19-thermal-hot-water-pour');
await advance(1400);
const thermalHotCube = await capture('20-thermal-hot-cube');
await primary();
await advance(1350);
const thermalCameraMoving = await capture('21-thermal-camera-moving');
await advance(1450);
const thermalLiveView = await capture('22-thermal-camera-foreground');
await primary();
const thermalResults = await capture('23-thermal-results');

const summary = {
  errors,
  renderer: electromagnetInitial.renderer,
  electromagnet: {
    initial_phase: electromagnetInitial.electromagnet_practical.phase,
    energised_phase: electromagnetEnergised.electromagnet_practical.phase,
    layout: electromagnetInitial.electromagnet_practical.apparatus_layout,
    display_off: electromagnetInitial.electromagnet_practical.power_pack_display,
    display_on: electromagnetEnergised.electromagnet_practical.power_pack_display,
    lowering_phase: electromagnetLowering.electromagnet_practical.phase,
    lifting_phase: electromagnetLifting.electromagnet_practical.phase,
    suspended_clips: electromagnetSuspended.electromagnet_practical.paper_clips_suspended,
    results: electromagnetComplete.electromagnet_practical.measured_results,
    complete: electromagnetComplete.complete,
    graph_axes: electromagnetComplete.graph_axes
  },
  convection: {
    initial_phase: convectionInitial.convection_practical.phase,
    tracer_phase: convectionTracerDrop.convection_practical.phase,
    rising_flow: convectionRising.convection_practical.flow_direction,
    loop_visible_mid: convectionLoop.convection_practical.complete_loop_visible,
    complete: convectionComplete.complete,
    observation_view: convectionObservation.results_view,
    safety: convectionComplete.convection_practical.tracer_real_world_safety
  },
  conduction: {
    initial_phase: conductionInitial.conduction_practical.phase,
    pins_after_2_1_s: conductionCopperLead.conduction_practical.pins_fallen,
    pins_midway: conductionMiddle.conduction_practical.pins_fallen,
    complete: conductionComplete.complete,
    order: conductionComplete.conduction_practical.conductor_order,
    results_view: conductionResults.results_view
  },
  thermal: {
    initial_phase: thermalInitial.thermal_radiation_practical.phase,
    hot_cube: thermalHotCube.thermal_radiation_practical.leslie_cube.filled_with_hot_water,
    camera_moving: thermalCameraMoving.thermal_radiation_practical.thermal_camera.moving_toward_scene_camera,
    foreground_display: thermalLiveView.thermal_radiation_practical.thermal_camera.foreground_display_active,
    display_content: thermalLiveView.thermal_radiation_practical.thermal_camera.display_content,
    captured: thermalResults.thermal_radiation_practical.thermal_camera.image_captured,
    complete: thermalResults.complete
  }
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!electromagnetInitial.renderer.enabled || electromagnetInitial.renderer.legacy_2d_apparatus) throw new Error('WebGL renderer is not enabled.');
if (!electromagnetInitial.electromagnet_practical.apparatus_layout.electromagnet_orientation.includes('working pole facing right')) throw new Error('The electromagnet is not reported as horizontal and right-facing.');
if (!electromagnetInitial.electromagnet_practical.apparatus_layout.lead_direction.includes('power pack on the left')) throw new Error('The leads are not reported as entering from the left power pack.');
if (electromagnetInitial.electromagnet_practical.power_pack_display.current_a !== 0 || electromagnetInitial.electromagnet_practical.power_pack_display.voltage_v !== 0) throw new Error('The open-switch display did not initialise at zero.');
if (electromagnetEnergised.electromagnet_practical.power_pack_display.current_a !== .5 || electromagnetEnergised.electromagnet_practical.power_pack_display.voltage_v !== 3) throw new Error('The energised power pack did not show 0.50 A and 3.00 V.');
if (JSON.stringify(electromagnetEnergised.electromagnet_practical.power_pack_display.units_visible) !== JSON.stringify(['A', 'V'])) throw new Error('The digital display units are missing.');
if (electromagnetSuspended.electromagnet_practical.paper_clips_suspended !== 2) throw new Error('The 10-turn electromagnet did not visibly suspend two clips.');
if (JSON.stringify(electromagnetComplete.electromagnet_practical.measured_results.map(result => result.clips)) !== JSON.stringify([2, 4, 7, 10, 13])) throw new Error('Electromagnet series results are incorrect.');
if (!electromagnetComplete.complete || electromagnetComplete.graph_readings !== 5) throw new Error('Electromagnet graph did not complete with five readings.');
if (convectionRising.convection_practical.flow_direction !== 'clockwise: up heated left side, across top, down cooler right side') throw new Error('Convection flow direction is incorrect.');
if (!convectionComplete.complete || !convectionComplete.convection_practical.complete_loop_visible) throw new Error('Convection loop did not complete.');
if (conductionCopperLead.conduction_practical.pins_fallen.copper <= conductionCopperLead.conduction_practical.pins_fallen.steel) throw new Error('Copper did not lead the pin-fall sequence.');
if (!conductionComplete.complete || conductionComplete.conduction_practical.pins_fallen.steel !== 4) throw new Error('Conduction sequence did not finish all rods.');
if (!thermalHotCube.thermal_radiation_practical.leslie_cube.filled_with_hot_water) throw new Error('Leslie cube was not filled.');
if (!thermalCameraMoving.thermal_radiation_practical.thermal_camera.moving_toward_scene_camera) throw new Error('Thermal camera did not enter the foreground transition.');
if (!thermalLiveView.thermal_radiation_practical.thermal_camera.foreground_display_active) throw new Error('Foreground thermal display did not activate.');
if (!thermalLiveView.thermal_radiation_practical.thermal_camera.perspective_matches_lab_bench) throw new Error('Thermal camera is not reporting a bench-matched perspective.');
if (!thermalResults.thermal_radiation_practical.sidebar_thermal_view.shares_camera_scene_renderer) throw new Error('Sidebar and camera thermal views do not share the same bench renderer.');
if (!thermalResults.thermal_radiation_practical.sidebar_thermal_view.visible_bench_objects.includes('hot-water flask')) throw new Error('Thermal bench view does not include the physical hot-water flask.');
if (thermalHotCube.thermal_radiation_practical.thermal_propagation_rings.casts_shadows !== false || thermalHotCube.thermal_radiation_practical.thermal_propagation_rings.receives_shadows !== false) throw new Error('Thermal propagation rings still cast or receive shadows.');
if (!thermalResults.complete || !thermalResults.thermal_radiation_practical.thermal_camera.image_captured) throw new Error('Thermal image capture did not complete.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
