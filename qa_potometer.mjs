import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/potometer-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?potometer-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const clickPrimary = async () => { await page.mouse.click(382, 657); await page.waitForTimeout(45); };
const capture = async name => {
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};

await page.mouse.click(320, 32);
await page.mouse.click(135, 288);
const initial = await capture('01-sealed-water-filled-rig');
await clickPrimary();
await advance(1100);
const introducing = await capture('02-capillary-tip-out-of-water');
await advance(1600);
const bubbleReady = await capture('03-single-bubble-ready');
await clickPrimary();
await advance(1350);
const resetting = await capture('04-reservoir-aligning-zero');
await advance(1400);
const aligned = await capture('05-bubble-on-zero');
await clickPrimary();
await advance(3100);
const stillAirRun = await capture('06-still-air-control-run');
await advance(3300);
const firstResult = await capture('07-first-result');

const resetAndStart = async () => {
  await clickPrimary();
  await advance(2800);
  await clickPrimary();
};
await resetAndStart();
await advance(2800);
const movingAirRun = await capture('08-fan-airflow-and-transpiration');
await advance(3700);
await resetAndStart();
await advance(6500);
await resetAndStart();
await advance(3000);
const fastestRun = await capture('09-high-wind-leaf-flutter');
await advance(3500);
const completed = await capture('10-complete-wind-series');
await page.mouse.click(1220, 134);
const expanded = await capture('11-expanded-potometer-graph');

const results = completed.bubble_potometer_practical.results;
const summary = {
  errors,
  renderer: initial.renderer,
  initial_stage: initial.bubble_potometer_practical.stage,
  introducing_stage: introducing.bubble_potometer_practical.stage,
  bubble_ready_stage: bubbleReady.bubble_potometer_practical.stage,
  resetting_stage: resetting.bubble_potometer_practical.stage,
  aligned_stage: aligned.bubble_potometer_practical.stage,
  still_air_stage: stillAirRun.bubble_potometer_practical.stage,
  first_result: firstResult.bubble_potometer_practical.results[0],
  moving_air_animation: movingAirRun.bubble_potometer_practical.animation,
  fastest_wind_m_s: fastestRun.bubble_potometer_practical.current_wind_speed_m_s,
  results,
  graph_tab: completed.tab,
  graph_modal_open: expanded.graph_modal.open,
  complete: completed.complete
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!initial.renderer.enabled) throw new Error('WebGL renderer is not enabled.');
if (initial.bubble_potometer_practical.stage !== 0 || !initial.bubble_potometer_practical.apparatus.glass_chamber_and_capillary_completely_water_filled) throw new Error('Initial sealed potometer state is incorrect.');
if (introducing.bubble_potometer_practical.stage !== 1 || !introducing.bubble_potometer_practical.animation.capillary_tip_lifts_and_redips) throw new Error('Bubble-introduction animation failed.');
if (bubbleReady.bubble_potometer_practical.stage !== 2 || bubbleReady.bubble_potometer_practical.air_bubble_distance_mm !== 6) throw new Error('Single bubble was not introduced correctly.');
if (resetting.bubble_potometer_practical.stage !== 3 || !resetting.bubble_potometer_practical.animation.reservoir_plunger_resets_bubble) throw new Error('Reservoir reset animation failed.');
if (aligned.bubble_potometer_practical.stage !== 4 || aligned.bubble_potometer_practical.air_bubble_distance_mm !== 0) throw new Error('Bubble did not align with zero.');
if (stillAirRun.bubble_potometer_practical.stage !== 5) throw new Error('Still-air control run did not start.');
if (firstResult.bubble_potometer_practical.results.length !== 1 || firstResult.bubble_potometer_practical.results[0].rate_mm_per_min !== 2.4) throw new Error('First water-uptake result is incorrect.');
if (!movingAirRun.bubble_potometer_practical.animation.fan_blades_and_airflow_ribbons || !movingAirRun.bubble_potometer_practical.biological_sample.transpiration_visualised_at_stomata) throw new Error('Moving-air visualisation is missing.');
if (fastestRun.bubble_potometer_practical.current_wind_speed_m_s !== 1.5 || !fastestRun.bubble_potometer_practical.biological_sample.leaf_flutter_in_airflow) throw new Error('High-wind trial did not animate the leafy shoot.');
if (JSON.stringify(results.map(result => result.rate_mm_per_min)) !== JSON.stringify([2.4, 4.4, 6.8, 9.4])) throw new Error('Four-trial rate series is incorrect.');
if (!completed.complete || completed.tab !== 'graph' || !expanded.graph_modal.open) throw new Error('Completion or expanded graph failed.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
