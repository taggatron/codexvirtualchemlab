import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/ripple-qa';
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

const browserErrors = [];
const checkpoints = {};
let activePage = null;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const closeTo = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const clickPrimary = async (page, y) => {
  await page.mouse.click(377, y);
  await page.waitForTimeout(45);
};
const watchErrors = (page, label) => {
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`${label} console: ${message.text()}`);
  });
  page.on('pageerror', error => browserErrors.push(`${label} page: ${error.message}`));
};
const capture = async (page, name, project = value => value) => {
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const snapshot = await state(page);
  checkpoints[name] = project(snapshot);
  return snapshot;
};

let summary = null;
try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await desktopContext.newPage();
  activePage = page;
  watchErrors(page, '1440x900');
  await page.goto(`http://127.0.0.1:4173/?ripple-qa=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await page.evaluate(() => { window.__manualSimulationTime = true; });

  // Physics tab, then the first Physics card: Wave speed in a ripple tank.
  await page.mouse.click(434, 32);
  await page.mouse.click(135, 128);
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(window.render_game_to_text());
    return snapshot.id === 'ripple' && snapshot.renderer?.enabled;
  });

  const ready = await capture(page, '01-ripple-ready', snapshot => ({
    practical: snapshot.practical,
    renderer: snapshot.renderer,
    stage: snapshot.ripple_tank_practical?.stage,
    tank: snapshot.ripple_tank_practical?.tank,
    driver: snapshot.ripple_tank_practical?.driver,
    bench: snapshot.lab_bench_front,
    canvas: snapshot.canvas_compositing,
    sidebar: snapshot.right_sidebar_layout
  }));

  await clickPrimary(page, 837);
  await advance(page, 2450);
  let snapshot = await state(page);
  assert(snapshot.ripple_tank_practical?.stage === 2, 'Levelling did not finish at the ready-to-start stage.');

  await clickPrimary(page, 837);
  await advance(page, 1500);
  const waves = await capture(page, '02-ripple-waves-forming', value => ({
    stage: value.ripple_tank_practical?.stage,
    driver: value.ripple_tank_practical?.driver,
    animation: value.ripple_tank_practical?.animation,
    phase: value.ripple_tank_practical?.phase
  }));
  await advance(page, 1800);
  snapshot = await state(page);
  assert(snapshot.ripple_tank_practical?.stage === 4, 'Stable-wave stage was not reached.');

  await clickPrimary(page, 837);
  await advance(page, 1400);
  const strobe = await capture(page, '03-ripple-strobe-and-ruler', value => ({
    stage: value.ripple_tank_practical?.stage,
    strobe: value.ripple_tank_practical?.strobe,
    measurement: value.ripple_tank_practical?.current_measurement,
    animation: value.ripple_tank_practical?.animation
  }));
  await advance(page, 1500);
  const measurement = await capture(page, '04-ripple-measurement', value => ({
    stage: value.ripple_tank_practical?.stage,
    strobe: value.ripple_tank_practical?.strobe,
    measurement: value.ripple_tank_practical?.current_measurement
  }));
  await clickPrimary(page, 837);

  // Run the remaining four frequencies. The water remains level, so every
  // repeat resumes at START VIBRATOR rather than repeating the depth check.
  for (let trial = 1; trial < 5; trial += 1) {
    await clickPrimary(page, 837);
    snapshot = await state(page);
    assert(snapshot.ripple_tank_practical?.stage === 2, `Trial ${trial + 1} did not return to START VIBRATOR.`);
    await clickPrimary(page, 837);
    await advance(page, 3250);
    snapshot = await state(page);
    assert(snapshot.ripple_tank_practical?.stage === 4, `Trial ${trial + 1} did not establish steady waves.`);
    await clickPrimary(page, 837);
    await advance(page, 2850);
    snapshot = await state(page);
    assert(snapshot.ripple_tank_practical?.stage === 6, `Trial ${trial + 1} did not complete its ten-wavelength measurement.`);
    await clickPrimary(page, 837);
  }

  await clickPrimary(page, 837);
  const results = await capture(page, '05-ripple-results', value => ({
    stage: value.ripple_tank_practical?.stage,
    complete: value.ripple_tank_practical?.complete,
    results: value.ripple_tank_practical?.results,
    mean_wave_speed_m_s: value.ripple_tank_practical?.mean_wave_speed_m_s,
    graph_axes: value.graph_axes,
    results_columns: value.results_columns,
    results_view: value.results_view,
    tab: value.tab,
    bench: value.lab_bench_front
  }));

  const readyPractical = ready.ripple_tank_practical;
  const wavePractical = waves.ripple_tank_practical;
  const strobePractical = strobe.ripple_tank_practical;
  const measuredPractical = measurement.ripple_tank_practical;
  const completedPractical = results.ripple_tank_practical;
  const expectedFrequencies = [4, 5, 6, 7, 8];
  const expectedDistances = [50, 40.2, 33, 28.8, 24.9];
  const expectedWavelengths = [5, 4.02, 3.3, 2.88, 2.49];
  const expectedSpeeds = [.2, .201, .198, .2016, .1992];

  assert(ready.renderer?.enabled, 'WebGL was not enabled for the ripple-tank practical.');
  assert(readyPractical.stage === 0, 'Ripple tank did not begin at LEVEL TANK.');
  assert(readyPractical.tank.shallow_water_visible, 'Water is not reported as visible in the ripple tank.');
  assert(readyPractical.tank.water_depth_cm === 1.5, 'Expected a controlled 1.5 cm water depth.');
  assert(readyPractical.tank.transparent_base && readyPractical.tank.foam_absorbing_beach, 'Transparent tank base or absorbing beach is missing.');
  assert(ready.lab_bench_front?.drawers_hidden_for_this_practical_only !== true, 'Normal laboratory drawers were incorrectly hidden.');
  assert(ready.lab_bench_front?.embossed_door_panelling === true, 'Normal dark-grey cabinet frontage is missing.');
  assert(ready.canvas_compositing?.wall_tiles_behind_webgl_apparatus === true, 'Normal laboratory wall tiles were incorrectly hidden.');
  assert(ready.right_sidebar_layout?.all_sidebar_components_visible, 'Ripple method sidebar overflows at 1440×900.');

  assert(wavePractical.stage === 3, 'Mid-ramp wave stage was not captured.');
  assert(wavePractical.driver.active && wavePractical.driver.type === 'motorised straight bar dipper', 'Straight dipper was not active during wave formation.');
  assert(wavePractical.animation.motor_ramps_without_step_changes, 'Smooth motor ramp was not reported.');
  assert(wavePractical.animation.wavefronts_propagate_continuously, 'Continuous wavefront propagation was not reported.');

  assert(strobePractical.stage === 5, 'Mid-strobe measurement stage was not captured.');
  assert(strobePractical.strobe.synchronising, 'Strobe synchronisation was not active.');
  assert(strobePractical.current_measurement.transparent_ruler_visible, 'The transparent measurement ruler was not visible.');
  assert(strobePractical.current_measurement.double_arrow_markers_visible, 'Ten-wavelength measurement markers were not visible.');
  assert(strobePractical.animation.strobe_sync_transition_smooth && strobePractical.animation.ruler_glides_and_markers_expand, 'Smooth strobe/ruler animation was not reported.');

  assert(measuredPractical.stage === 6, 'Completed first measurement was not captured.');
  assert(measuredPractical.strobe.synchronised_to_frequency, 'Strobe was not synchronised at the measurement stage.');
  assert(measuredPractical.current_measurement.selected_crest_count === 11 && measuredPractical.current_measurement.wavelengths_spanned === 10, 'Measurement must span ten wavelengths between eleven crests.');
  assert(closeTo(measuredPractical.current_measurement.distance_across_10_wavelengths_cm, 50), 'First ten-wavelength distance is incorrect.');
  assert(closeTo(measuredPractical.current_measurement.wavelength_cm, 5), 'First wavelength is incorrect.');
  assert(closeTo(measuredPractical.current_measurement.calculated_wave_speed_m_s, .2), 'First calculated speed is incorrect.');

  assert(completedPractical.complete && completedPractical.results.length === 5, `Expected five completed trials, received ${completedPractical.results.length}.`);
  assert(JSON.stringify(completedPractical.results.map(result => result.frequency_hz)) === JSON.stringify(expectedFrequencies), 'Frequency series is incorrect.');
  assert(JSON.stringify(completedPractical.results.map(result => result.distance_across_10_wavelengths_cm)) === JSON.stringify(expectedDistances), 'Ten-wavelength distance series is incorrect.');
  completedPractical.results.forEach((result, index) => {
    assert(closeTo(result.wavelength_cm, expectedWavelengths[index], .001), `Trial ${index + 1} wavelength is incorrect.`);
    assert(closeTo(result.wave_speed_m_s, expectedSpeeds[index], .0001), `Trial ${index + 1} wave speed is incorrect.`);
  });
  assert(closeTo(completedPractical.mean_wave_speed_m_s, .2, .0001), 'Mean wave speed should be 0.200 m s⁻¹.');
  assert(results.tab === 'graph', 'Custom ripple results view did not open.');
  assert(results.graph_axes?.x === 'frequency / Hz' && results.graph_axes?.y === 'wave speed / m s⁻¹', 'Ripple results graph axes are incorrect.');
  assert(results.results_columns?.length === 4 && results.results_view?.includes('raw-data table'), 'Raw-data table metadata is missing.');
  assert(results.lab_bench_front?.drawers_hidden_for_this_practical_only !== true, 'Drawers became hidden in the results view.');

  await desktopContext.close();

  // Fresh compact desktop context verifies a clean responsive load rather
  // than inheriting any state from the completed 1440×900 series.
  const responsiveContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const responsivePage = await responsiveContext.newPage();
  activePage = responsivePage;
  watchErrors(responsivePage, '1280x720');
  await responsivePage.goto(`http://127.0.0.1:4173/?ripple-responsive=${Date.now()}`, { waitUntil: 'networkidle' });
  await responsivePage.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await responsivePage.mouse.click(434, 32);
  await responsivePage.mouse.click(135, 128);
  await responsivePage.waitForFunction(() => JSON.parse(window.render_game_to_text()).id === 'ripple');
  const responsive = await capture(responsivePage, '06-ripple-responsive-1280x720', value => ({
    practical: value.practical,
    stage: value.ripple_tank_practical?.stage,
    responsive_layout: value.responsive_layout,
    sidebar: value.right_sidebar_layout,
    bench: value.lab_bench_front,
    controls: value.controls
  }));
  assert(responsive.practical === 'Wave speed in a ripple tank' && responsive.ripple_tank_practical?.stage === 0, 'Fresh responsive context did not load the ready ripple practical.');
  assert(responsive.responsive_layout.viewport_css_px.width === 1280 && responsive.responsive_layout.viewport_css_px.height === 720, 'Responsive viewport dimensions are incorrect.');
  assert(responsive.responsive_layout.three_column_layout_preserved && !responsive.responsive_layout.portrait_prompt_visible, 'Three-column landscape layout was not preserved.');
  assert(responsive.right_sidebar_layout?.all_sidebar_components_visible && responsive.right_sidebar_layout?.overflow_vertical_space_px === 0, 'Ripple sidebar overflows at 1280×720.');
  assert(responsive.lab_bench_front?.embossed_door_panelling === true, 'Normal laboratory drawers are missing at 1280×720.');
  assert(responsive.controls?.includes('LEVEL TANK') && responsive.controls?.includes('RESULTS'), 'Responsive ripple controls are incomplete.');
  await responsiveContext.close();

  assert(browserErrors.length === 0, browserErrors.join('\n'));
  summary = {
    pass: true,
    browser_errors: browserErrors,
    chrome_executable: chromeExecutable,
    desktop_viewport: { width: 1440, height: 900 },
    responsive_viewport: { width: 1280, height: 720 },
    frequencies_hz: completedPractical.results.map(result => result.frequency_hz),
    ten_wavelength_distances_cm: completedPractical.results.map(result => result.distance_across_10_wavelengths_cm),
    wavelengths_cm: completedPractical.results.map(result => result.wavelength_cm),
    wave_speeds_m_s: completedPractical.results.map(result => result.wave_speed_m_s),
    mean_wave_speed_m_s: completedPractical.mean_wave_speed_m_s,
    normal_drawers_visible: ready.lab_bench_front?.embossed_door_panelling === true && results.lab_bench_front?.embossed_door_panelling === true,
    checkpoints
  };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  const currentSnapshot = await activePage?.evaluate(() => {
    try { return typeof window.render_game_to_text === 'function' ? JSON.parse(window.render_game_to_text()) : null; }
    catch { return null; }
  }).catch(() => null);
  await activePage?.screenshot({ path: `${out}/failure-state.png`, fullPage: true }).catch(() => {});
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
