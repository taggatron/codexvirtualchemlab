import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/capture-recapture-qa';
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chromeExecutable,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], checkpoints = {};
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const assert = (condition, message) => { if (!condition) throw new Error(message) };
const clickPrimary = () => page.mouse.click(380, 837);
const capture = async (name, project = value => value) => {
  await page.waitForTimeout(180);
  const snapshot = await state();
  const projected = project(snapshot); checkpoints[name] = projected;
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return projected
};

let summary;
try {
  await page.goto(`http://127.0.0.1:4173/?capture-recapture=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await page.evaluate(() => { window.__manualSimulationTime = true });
  await page.mouse.click(320, 32);
  await page.mouse.click(135, 451);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).practical === 'Mark-release-recapture');
  await advance(3100); await page.waitForTimeout(550);

  const initial = await capture('01-meadow-ready-no-lab-front', snapshot => ({ renderer: snapshot.renderer, capture: snapshot.capture_mark_recapture_practical, bench: snapshot.lab_bench_front, compositing: snapshot.canvas_compositing }));
  const initialStudy = initial.capture;
  assert(initial.renderer?.enabled, 'WebGL renderer is not enabled.');
  assert(initialStudy.stage === 0 && !initialStudy.complete, 'Capture study did not reset to stage 0.');
  assert(initialStudy.first_sample.target_total === 16 && initialStudy.second_sample.target_total === 20 && initialStudy.second_sample.target_marked_recaptures === 6, 'Capture counts are not the deterministic 16/20/6 dataset.');
  assert(initialStudy.environment.laboratory_bench_front_visible === false && initialStudy.environment.laboratory_cupboards_visible === false, 'Laboratory frontage remains visible in the outdoor capture practical.');
  assert(initial.bench.outdoor_scene_replaces_worktop_and_cupboards && !initial.compositing.wall_tiles_behind_webgl_apparatus, 'Outdoor canvas compositing contract failed.');
  const initialCanvas = await page.locator('#webgl').evaluate(node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, viewport: innerHeight } });
  assert(Math.abs(initialCanvas.bottom - initialCanvas.viewport) < 1, `WebGL meadow stops before the viewport bottom: ${JSON.stringify(initialCanvas)}`);

  await clickPrimary(); await advance(1300);
  const installing = await capture('02-traps-lowering', snapshot => snapshot.capture_mark_recapture_practical);
  assert(installing.stage === 1 && installing.animation.traps_install_with_staggered_lowering_and_settle && installing.pitfall_traps.installed_fraction > 0 && installing.pitfall_traps.installed_fraction < 1, 'Staggered trap installation was not captured.');
  await advance(1800);
  const entering = await capture('03-beetles-entering-covered-traps', snapshot => snapshot.capture_mark_recapture_practical);
  assert(entering.stage === 1 && entering.animation.beetles_walk_and_drop_into_traps && entering.pitfall_traps.caught_first_sample_visible > 0, 'First beetles did not visibly enter the traps.');
  await advance(2200);
  const firstCaught = await capture('04-first-catch-in-five-traps', snapshot => snapshot.capture_mark_recapture_practical);
  assert(firstCaught.stage === 2 && firstCaught.pitfall_traps.caught_first_sample_visible === 16, 'First catch did not finish at 16.');
  assert(firstCaught.first_sample.uncaptured_total === 24 && firstCaught.first_sample.visibly_roaming_uncaptured === 14 && firstCaught.first_sample.entire_population_was_not_captured, 'The first sample does not leave a clearly visible uncaptured population roaming in the meadow.');

  await clickPrimary(); await advance(1850);
  const transferring = await capture('05-first-catch-to-inspection-tray', snapshot => snapshot.capture_mark_recapture_practical);
  assert(transferring.stage === 3 && transferring.animation.first_sample_transfers_to_tray_in_smooth_arcs && transferring.beetle_model.inspection_tray_visible, 'First sample did not transfer to the tray.');
  await advance(2000);
  const marking = await capture('06-progressive-white-paint-marks', snapshot => snapshot.capture_mark_recapture_practical);
  assert(marking.stage === 3 && marking.first_sample.visibly_white_marked > 0 && marking.first_sample.visibly_white_marked < 16 && marking.animation.paint_marker_visits_each_beetle_sequentially, 'Progressive marking state was not visible.');
  assert(marking.beetle_model.body_remains_dark_when_marked && marking.beetle_model.paint_mark.includes('white'), 'The paint mark is not a separate white dorsal spot.');
  await advance(2700);
  const markedHold = await capture('07-sixteen-dark-beetles-with-white-dots', snapshot => snapshot.capture_mark_recapture_practical);
  assert(markedHold.stage === 4 && markedHold.first_sample.visibly_white_marked === 16, 'The first sample did not hold with 16 white marks.');

  await clickPrimary(); await advance(1900);
  const releasing = await capture('08-marked-beetles-releasing', snapshot => snapshot.capture_mark_recapture_practical);
  assert(releasing.stage === 5 && releasing.first_sample.visibly_released > 0 && releasing.first_sample.visibly_released < 16 && releasing.animation.beetles_walk_outward_during_release, 'Marked beetle release was not progressive.');
  await advance(2800);
  const mixing = await capture('09-mixing-and-second-trap-entry', snapshot => snapshot.capture_mark_recapture_practical);
  assert(mixing.stage === 5 && mixing.release_and_mixing.mixing_period_hours > 0 && mixing.pitfall_traps.caught_second_sample_visible > 0, '24-hour mixing/second capture was not visible.');
  await advance(2050);
  const secondCaught = await capture('10-second-catch-in-traps', snapshot => snapshot.capture_mark_recapture_practical);
  assert(secondCaught.stage === 6 && secondCaught.pitfall_traps.caught_second_sample_visible === 20, 'Second catch did not finish at 20.');

  await clickPrimary(); await advance(2100);
  const secondTransfer = await capture('11-second-catch-to-tray', snapshot => snapshot.capture_mark_recapture_practical);
  assert(secondTransfer.stage === 7 && secondTransfer.second_sample.visibly_counted_total > 0 && secondTransfer.second_sample.visibly_counted_total < 20 && secondTransfer.animation.second_sample_transfers_to_tray_progressively, 'Second-sample progressive transfer was not visible.');
  await advance(1900);
  const recaptureScan = await capture('12-magnifier-finds-white-marks', snapshot => snapshot.capture_mark_recapture_practical);
  assert(recaptureScan.stage === 7 && recaptureScan.beetle_model.magnifier_visible && recaptureScan.second_sample.visibly_identified_marked > 0 && recaptureScan.second_sample.visibly_identified_marked < 6, 'Magnified recapture marking scan was not progressive.');
  await advance(1900);
  const secondHold = await capture('13-twenty-beetles-six-marked', snapshot => snapshot.capture_mark_recapture_practical);
  assert(secondHold.stage === 8 && secondHold.second_sample.visibly_counted_total === 20 && secondHold.second_sample.visible_white_marks_on_inspection_tray === 6, 'Final tray does not show the exact 20/6 second sample.');

  await clickPrimary();
  const complete = await capture('14-lincoln-index-complete', snapshot => snapshot.capture_mark_recapture_practical);
  assert(complete.stage === 9 && complete.complete && complete.lincoln_index_estimate === 53 && complete.lincoln_index_calculation.includes('53.3'), 'Lincoln Index result is not 53 beetles from 16×20÷6.');
  await clickPrimary();
  await capture('15-results-panel');

  await page.mouse.click(528, 837); await page.waitForTimeout(80);
  const reset = await capture('16-reset-clears-all-marks', snapshot => snapshot.capture_mark_recapture_practical);
  assert(reset.stage === 0 && reset.first_sample.visibly_white_marked === 0 && reset.second_sample.visible_white_marks_on_inspection_tray === 0 && !reset.complete, 'Reset did not clear the capture sequence and every mark.');

  await page.mouse.click(1270, 32); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).focus_mode === true);
  const focus = await capture('17-focus-full-height-meadow', snapshot => ({ focus: snapshot.focus_mode, bench: snapshot.lab_bench_front, environment: snapshot.capture_mark_recapture_practical.environment }));
  const focusCanvas = await page.locator('#webgl').evaluate(node => { const r = node.getBoundingClientRect(); return { bottom: r.bottom, viewport: innerHeight } });
  assert(focus.focus && Math.abs(focusCanvas.bottom - focusCanvas.viewport) < 1, 'Focus mode does not retain the full-height outdoor meadow.');
  assert(errors.length === 0, errors.join('\n'));
  summary = { pass: true, errors, initial_canvas: initialCanvas, focus_canvas: focusCanvas, checkpoints };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ pass: true, screenshots: Object.keys(checkpoints).length, estimate: complete.lincoln_index_estimate, errors }, null, 2));
} catch (error) {
  summary = { pass: false, error: error instanceof Error ? error.stack : String(error), errors, checkpoints };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  console.error(JSON.stringify(summary, null, 2)); process.exitCode = 1;
} finally {
  await browser.close()
}
