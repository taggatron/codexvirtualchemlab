import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/ecosystem-qa';
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chromeExecutable,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist'
  ]
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const browserErrors = [];
const checkpoints = {};
page.on('console', message => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
});
page.on('pageerror', error => browserErrors.push(`page: ${error.message}`));

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const clickPrimary = async () => {
  await page.mouse.click(376, 837);
  await page.waitForTimeout(45);
};
const capture = async (name, project = value => value) => {
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const snapshot = await state();
  checkpoints[name] = project(snapshot);
  return snapshot;
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

let summary = null;
try {
  await page.goto(`http://127.0.0.1:4173/?ecosystem-qa=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await page.evaluate(() => { window.__manualSimulationTime = true; });

  // Random quadrat sampling: the biology tab and sixth Biology practical card.
  await page.mouse.click(320, 32);
  await page.mouse.click(135, 397);
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(window.render_game_to_text());
    return snapshot.practical === 'Random quadrat sampling' && snapshot.renderer?.enabled;
  });

  const quadratInitial = await capture('01-quadrat-forest-before-turf', snapshot => ({
    practical: snapshot.practical,
    renderer: snapshot.renderer,
    stage: snapshot.random_quadrat_sampling_practical?.stage,
    environment: snapshot.random_quadrat_sampling_practical?.environment,
    bench: snapshot.lab_bench_front
  }));
  await advance(1450);
  const quadratGrowing = await capture('02-quadrat-turf-growing', snapshot => ({
    stage: snapshot.random_quadrat_sampling_practical?.stage,
    growth: snapshot.random_quadrat_sampling_practical?.environment?.grass_growth_fraction,
    wind_clock_s: snapshot.random_quadrat_sampling_practical?.environment?.wind_clock_s
  }));
  await advance(1550);
  const quadratReady = await capture('03-quadrat-meadow-ready', snapshot => ({
    growth: snapshot.random_quadrat_sampling_practical?.environment?.grass_growth_fraction,
    grass_and_daisies_sway: snapshot.random_quadrat_sampling_practical?.environment?.grass_and_daisies_sway_in_wind
  }));

  await clickPrimary();
  await advance(680);
  const quadratRandomising = await capture('04-quadrat-random-coordinate', snapshot => ({
    stage: snapshot.random_quadrat_sampling_practical?.stage,
    coordinate: snapshot.random_quadrat_sampling_practical?.current_random_coordinate_m,
    animation: snapshot.random_quadrat_sampling_practical?.animation
  }));
  await advance(900);
  await clickPrimary();
  await advance(1080);
  const quadratFlight = await capture('05-quadrat-in-flight', snapshot => ({
    stage: snapshot.random_quadrat_sampling_practical?.stage,
    coordinate: snapshot.random_quadrat_sampling_practical?.current_random_coordinate_m,
    animation: snapshot.random_quadrat_sampling_practical?.animation
  }));
  await advance(1400);
  await clickPrimary();
  await advance(1050);
  const quadratCounting = await capture('06-quadrat-counting', snapshot => ({
    stage: snapshot.random_quadrat_sampling_practical?.stage,
    current_count: snapshot.random_quadrat_sampling_practical?.current_count,
    highlighted: snapshot.random_quadrat_sampling_practical?.highlighted_daisy_ids,
    animation: snapshot.random_quadrat_sampling_practical?.animation
  }));
  await advance(1250);
  await clickPrimary();

  // Finish the remaining four unbiased repeats.
  for (let sample = 1; sample < 5; sample += 1) {
    await clickPrimary();
    await clickPrimary();
    await advance(1500);
    await clickPrimary();
    await advance(2400);
    await clickPrimary();
    await advance(2250);
    await clickPrimary();
  }
  await clickPrimary();
  const quadratComplete = await capture('07-quadrat-results', snapshot => ({
    stage: snapshot.random_quadrat_sampling_practical?.stage,
    complete: snapshot.random_quadrat_sampling_practical?.complete,
    results: snapshot.random_quadrat_sampling_practical?.results,
    mean_density_daisies_m2: snapshot.random_quadrat_sampling_practical?.mean_density_daisies_m2,
    estimated_population_in_100_m2: snapshot.random_quadrat_sampling_practical?.estimated_population_in_100_m2,
    tab: snapshot.tab
  }));

  const quadrat = quadratComplete.random_quadrat_sampling_practical;
  assert(quadratInitial.renderer?.enabled, 'WebGL was not enabled in the meadow practical.');
  assert(quadratInitial.lab_bench_front?.drawers_hidden_for_this_practical_only === true, 'The worktop and cupboards were not replaced by the full-height meadow.');
  assert(quadratInitial.lab_bench_front?.outdoor_scene_replaces_worktop_and_cupboards === true, 'The meadow replacement mode was not reported.');
  assert(quadratInitial.canvas_compositing?.wall_tiles_behind_webgl_apparatus === false, 'Laboratory wall tiles were not hidden behind the forest meadow.');
  assert(quadratInitial.random_quadrat_sampling_practical.environment.forest_background, 'Forest background is missing.');
  assert(quadratInitial.random_quadrat_sampling_practical.environment.blue_sunny_sky, 'Blue sunny sky is missing.');
  assert(quadratInitial.random_quadrat_sampling_practical.environment.cloud_count === 3, 'Expected three meadow clouds.');
  assert(quadratInitial.random_quadrat_sampling_practical.environment.full_height_meadow_scene, 'Meadow does not fill the former lab-bench and cupboard arena.');
  assert(quadratInitial.random_quadrat_sampling_practical.environment.laboratory_worktop_visible === false, 'Laboratory worktop is still visible in the meadow.');
  assert(quadratInitial.random_quadrat_sampling_practical.environment.laboratory_cupboards_visible === false, 'Laboratory cupboards are still visible in the meadow.');
  assert(quadratInitial.random_quadrat_sampling_practical.habitat.grass_blade_count === 1520, 'Expanded meadow grass population is missing.');
  assert(quadratInitial.random_quadrat_sampling_practical.habitat.moss_patch_count === 240 && quadratInitial.random_quadrat_sampling_practical.habitat.moss_between_grass_blades, 'Moss patches were not added between grass blades.');
  assert(quadratGrowing.random_quadrat_sampling_practical.environment.grass_growth_fraction > 0 && quadratGrowing.random_quadrat_sampling_practical.environment.grass_growth_fraction < 1, 'Mid-growth turf state was not reached.');
  assert(quadratReady.random_quadrat_sampling_practical.environment.grass_growth_fraction === 1, 'Turf did not finish growing.');
  assert(quadratRandomising.random_quadrat_sampling_practical.stage === 1 && quadratRandomising.random_quadrat_sampling_practical.animation.coordinate_generator_spins, 'Random-coordinate animation did not run.');
  assert(quadratFlight.random_quadrat_sampling_practical.stage === 3 && quadratFlight.random_quadrat_sampling_practical.animation.quadrat_smooth_throw_arc, 'Smooth quadrat throw was not observable.');
  assert(quadratCounting.random_quadrat_sampling_practical.stage === 5 && quadratCounting.random_quadrat_sampling_practical.current_count > 0, 'Daisy counting/highlighting did not progress.');
  assert(quadrat.complete && quadrat.results.length === 5, `Expected five quadrat results, received ${quadrat.results.length}.`);
  assert(JSON.stringify(quadrat.results.map(result => result.daisies)) === JSON.stringify([4, 7, 5, 3, 6]), 'Unexpected daisy-count series.');
  assert(quadrat.mean_density_daisies_m2 === 5 && quadrat.estimated_population_in_100_m2 === 500, 'Quadrat mean or population estimate is incorrect.');
  assert(quadratComplete.tab === 'graph', 'Quadrat results view did not open after completion.');

  // Rocky-shore belt transect: seventh Biology practical card.
  await page.mouse.click(135, 451);
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(window.render_game_to_text());
    return snapshot.practical === 'Rocky-shore belt transect' && snapshot.renderer?.enabled;
  });
  const shoreInitial = await capture('08-shore-cliffs-and-incoming-tide', snapshot => ({
    practical: snapshot.practical,
    renderer: snapshot.renderer,
    stage: snapshot.rocky_shore_transect_practical?.stage,
    landscape: snapshot.rocky_shore_transect_practical?.landscape,
    tide: snapshot.rocky_shore_transect_practical?.tide,
    bench: snapshot.lab_bench_front,
    canvas: snapshot.canvas_compositing
  }));
  await advance(4200);
  await clickPrimary();
  await advance(1570);
  const shoreTape = await capture('09-shore-tape-unrolling', snapshot => ({
    stage: snapshot.rocky_shore_transect_practical?.stage,
    tide: snapshot.rocky_shore_transect_practical?.tide,
    animation: snapshot.rocky_shore_transect_practical?.animation
  }));
  await advance(1650);
  await clickPrimary();
  await advance(980);
  const shoreMoving = await capture('10-shore-quadrat-moving', snapshot => ({
    stage: snapshot.rocky_shore_transect_practical?.stage,
    distance_m: snapshot.rocky_shore_transect_practical?.current_distance_down_shore_m,
    animation: snapshot.rocky_shore_transect_practical?.animation
  }));
  await advance(1250);
  await clickPrimary();
  await advance(1180);
  const shoreSurvey = await capture('11-shore-organism-survey', snapshot => ({
    stage: snapshot.rocky_shore_transect_practical?.stage,
    stratum: snapshot.rocky_shore_transect_practical?.current_stratum,
    animation: snapshot.rocky_shore_transect_practical?.animation
  }));
  await advance(1350);
  await clickPrimary();

  // Move, survey and record the remaining fixed 2 m stations.
  for (let station = 1; station < 6; station += 1) {
    await clickPrimary();
    await advance(2200);
    await clickPrimary();
    await advance(2500);
    await clickPrimary();
  }
  await clickPrimary();
  const shoreComplete = await capture('12-shore-zonation-results-and-tide', snapshot => ({
    stage: snapshot.rocky_shore_transect_practical?.stage,
    complete: snapshot.rocky_shore_transect_practical?.complete,
    results: snapshot.rocky_shore_transect_practical?.results,
    tide: snapshot.rocky_shore_transect_practical?.tide,
    tab: snapshot.tab,
    bench: snapshot.lab_bench_front
  }));

  const shore = shoreComplete.rocky_shore_transect_practical;
  assert(shoreInitial.renderer?.enabled, 'WebGL was not enabled in the rocky-shore practical.');
  assert(shoreInitial.lab_bench_front?.drawers_hidden_for_this_practical_only === true, 'Bench drawers were not hidden for the rocky-shore practical.');
  assert(shoreInitial.canvas_compositing?.wall_tiles_behind_webgl_apparatus === false, 'Laboratory wall tiles remained behind the rocky shore.');
  assert(shoreInitial.rocky_shore_transect_practical.landscape.realistic_rocky_shore, 'Rocky-shore landscape is missing.');
  assert(shoreInitial.rocky_shore_transect_practical.landscape.detailed_cliffs, 'Cliff backdrop is missing.');
  assert(shoreInitial.rocky_shore_transect_practical.landscape.continuous_cliff_top, 'Cliff top is not continuous.');
  assert(shoreInitial.rocky_shore_transect_practical.landscape.grass_topped_cliff, 'Cliff-top grass is missing.');
  assert(shoreInitial.rocky_shore_transect_practical.landscape.cliff_within_canvas && shoreInitial.rocky_shore_transect_practical.landscape.cliff_maximum_world_y <= 3.02, 'Cliff exceeds its bounded camera height.');
  assert(shoreInitial.rocky_shore_transect_practical.landscape.irregular_rock_pools, 'Organic rock-pool geometry is missing.');
  assert(shoreInitial.rocky_shore_transect_practical.landscape.rock_pool_seaweed_clumps === 12, 'Rock-pool seaweed clumps are missing.');
  assert(shoreInitial.rocky_shore_transect_practical.sampling_design.first_quadrat_clear_of_cliff_face, 'First quadrat remains buried in the cliff face.');
  assert(shoreInitial.rocky_shore_transect_practical.tide.incoming_from_bottom_foreground, 'Tide does not report an incoming foreground direction.');
  assert(shoreInitial.rocky_shore_transect_practical.tide.layered_gerstner_style_waves, 'Detailed layered wave system is missing.');
  assert(shoreInitial.rocky_shore_transect_practical.tide.animated_foam_bands === 3, 'Expected three animated tide foam bands.');
  assert(shoreTape.rocky_shore_transect_practical.stage === 1 && shoreTape.rocky_shore_transect_practical.animation.tape_unreels_smoothly, 'Tape-unreeling animation did not run.');
  assert(shoreMoving.rocky_shore_transect_practical.stage === 3 && shoreMoving.rocky_shore_transect_practical.animation.quadrat_moves_and_settles, 'Shore quadrat movement did not run.');
  assert(shoreSurvey.rocky_shore_transect_practical.stage === 5 && shoreSurvey.rocky_shore_transect_practical.animation.organisms_highlight_during_survey, 'Organism-survey animation did not run.');
  assert(shore.complete && shore.results.length === 6, `Expected six transect results, received ${shore.results.length}.`);
  assert(JSON.stringify(shore.results.map(result => result.distance_m)) === JSON.stringify([0, 2, 4, 6, 8, 10]), 'Transect station spacing is incorrect.');
  assert(JSON.stringify(shore.results.map(result => result.stratum)) === JSON.stringify(['upper', 'upper', 'middle', 'middle', 'lower', 'lower']), 'Shore strata assignment is incorrect.');
  assert(JSON.stringify(shore.results.map(result => result.barnacle_cover_percent)) === JSON.stringify([68, 59, 43, 27, 11, 3]), 'Barnacle zonation series is incorrect.');
  assert(JSON.stringify(shore.results.map(result => result.brown_seaweed_cover_percent)) === JSON.stringify([2, 5, 14, 33, 58, 82]), 'Seaweed zonation series is incorrect.');
  assert(shore.tide.progress > shoreInitial.rocky_shore_transect_practical.tide.progress, 'Incoming tide did not advance during the transect.');
  assert(shoreComplete.tab === 'graph', 'Zonation results view did not open after completion.');

  // Select another Biology practical to prove that the cabinet frontage returns.
  await page.mouse.click(135, 127);
  const restoredBench = await capture('13-drawers-restored-outside-shore', snapshot => ({
    practical: snapshot.practical,
    bench: snapshot.lab_bench_front,
    wall_tiles: snapshot.canvas_compositing?.wall_tiles_behind_webgl_apparatus
  }));
  assert(restoredBench.practical === 'Test a leaf for starch', 'Could not select a non-shore control practical.');
  assert(restoredBench.lab_bench_front?.drawers_hidden_for_this_practical_only !== true, 'Drawers did not return after leaving the rocky shore.');
  assert(restoredBench.lab_bench_front?.embossed_door_panelling === true, 'Normal dark-grey cabinet frontage was not restored.');
  assert(restoredBench.canvas_compositing?.wall_tiles_behind_webgl_apparatus === true, 'Normal laboratory wall tiles were not restored.');

  assert(browserErrors.length === 0, browserErrors.join('\n'));
  summary = {
    pass: true,
    browser_errors: browserErrors,
    chrome_executable: chromeExecutable,
    viewport: { width: 1440, height: 900 },
    quadrat: {
      counts: quadrat.results.map(result => result.daisies),
      coordinates_m: quadrat.results.map(result => [result.xM, result.yM]),
      mean_density_daisies_m2: quadrat.mean_density_daisies_m2,
      estimated_population_in_100_m2: quadrat.estimated_population_in_100_m2,
      forest_background: quadratInitial.random_quadrat_sampling_practical.environment.forest_background,
      turf_grew_and_sways: quadratReady.random_quadrat_sampling_practical.environment.grass_and_daisies_sway_in_wind,
      full_height_meadow_scene: quadratInitial.random_quadrat_sampling_practical.environment.full_height_meadow_scene,
      grass_blade_count: quadratInitial.random_quadrat_sampling_practical.habitat.grass_blade_count,
      moss_patch_count: quadratInitial.random_quadrat_sampling_practical.habitat.moss_patch_count
    },
    rocky_shore: {
      stations_m: shore.results.map(result => result.distance_m),
      strata: shore.results.map(result => result.stratum),
      barnacle_cover_percent: shore.results.map(result => result.barnacle_cover_percent),
      brown_seaweed_cover_percent: shore.results.map(result => result.brown_seaweed_cover_percent),
      tide_progress_initial: shoreInitial.rocky_shore_transect_practical.tide.progress,
      tide_progress_final: shore.tide.progress,
      detailed_waves: shore.tide.layered_gerstner_style_waves,
      animated_foam_bands: shore.tide.animated_foam_bands,
      continuous_cliff_top: shoreInitial.rocky_shore_transect_practical.landscape.continuous_cliff_top,
      grass_topped_cliff: shoreInitial.rocky_shore_transect_practical.landscape.grass_topped_cliff,
      irregular_rock_pools: shoreInitial.rocky_shore_transect_practical.landscape.irregular_rock_pools,
      rock_pool_seaweed_clumps: shoreInitial.rocky_shore_transect_practical.landscape.rock_pool_seaweed_clumps
    },
    drawers: {
      hidden_in_quadrat: quadratInitial.lab_bench_front?.drawers_hidden_for_this_practical_only === true,
      hidden_in_shore: shoreInitial.lab_bench_front?.drawers_hidden_for_this_practical_only === true,
      restored_after_shore: restoredBench.lab_bench_front?.embossed_door_panelling === true
    },
    checkpoints
  };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  const currentSnapshot = await page.evaluate(() => {
    try { return typeof window.render_game_to_text === 'function' ? JSON.parse(window.render_game_to_text()) : null; }
    catch { return null; }
  }).catch(() => null);
  await page.screenshot({ path: `${out}/failure-state.png`, fullPage: true }).catch(() => {});
  summary = {
    pass: false,
    error: error instanceof Error ? error.stack : String(error),
    browser_errors: browserErrors,
    current_snapshot: currentSnapshot,
    checkpoints
  };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
