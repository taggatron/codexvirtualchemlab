import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/outdoor-polish';
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromeExecutable, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const assert = (condition, message) => { if (!condition) throw new Error(message) };
const bounds = () => page.locator('#webgl').evaluate(canvas => { const r = canvas.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, visibility: getComputedStyle(canvas).visibility } });

try {
  await page.goto(`http://127.0.0.1:4173/?outdoor-polish=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await page.evaluate(() => { window.__manualSimulationTime = true });
  await page.mouse.click(320, 32);
  await page.mouse.click(135, 397);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).practical === 'Random quadrat sampling');
  await advance(3100);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/01-meadow-full-height-1440x900.png`, fullPage: true });
  const meadow = await state(), meadowBounds = await bounds();
  assert(meadow.random_quadrat_sampling_practical.environment.full_height_meadow_scene, 'Full-height meadow state is absent.');
  assert(meadow.random_quadrat_sampling_practical.habitat.moss_patch_count === 240, 'Moss patch count is incorrect.');
  assert(meadow.lab_bench_front.drawers_hidden_for_this_practical_only, 'Lab frontage remains in the meadow.');
  assert(Math.abs(meadowBounds.bottom - 900) < 2, `Meadow WebGL canvas stops at ${meadowBounds.bottom}px instead of the viewport bottom.`);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/02-meadow-full-height-1280x720.png`, fullPage: true });
  const compactBounds = await bounds();
  assert(Math.abs(compactBounds.bottom - 720) < 2, 'Compact meadow WebGL canvas does not fill the arena.');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);
  await page.mouse.click(135, 451);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).practical === 'Rocky-shore belt transect');
  await advance(900);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/03-shore-continuous-cliff-pools-first-quadrat.png`, fullPage: true });
  const shoreInitial = await state(), shoreBounds = await bounds();
  const landscape = shoreInitial.rocky_shore_transect_practical.landscape;
  assert(landscape.continuous_cliff_top && landscape.grass_topped_cliff && landscape.cliff_within_canvas, 'Cliff bounds or grass cap contract failed.');
  assert(landscape.irregular_rock_pools && landscape.rock_pool_seaweed_clumps === 12, 'Irregular seaweed-filled pools are absent.');
  assert(shoreInitial.rocky_shore_transect_practical.sampling_design.first_quadrat_clear_of_cliff_face, 'First quadrat clearance contract failed.');
  assert(Math.abs(shoreBounds.bottom - 900) < 2, 'Shore WebGL canvas does not fill the arena.');

  await page.mouse.click(376, 837);
  await advance(3250);
  await page.mouse.click(376, 837);
  await advance(930);
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${out}/04-shore-first-quadrat-moving-clear.png`, fullPage: true });
  const shoreMoving = await state();
  assert(shoreMoving.rocky_shore_transect_practical.stage === 3, 'First shore quadrat did not enter its move animation.');
  assert(shoreMoving.rocky_shore_transect_practical.animation.quadrat_moves_and_settles, 'First quadrat motion state is absent.');
  assert(errors.length === 0, errors.join('\n'));
  const summary = { pass: true, errors, meadow: { bounds: meadowBounds, compact_bounds: compactBounds, grass_blades: meadow.random_quadrat_sampling_practical.habitat.grass_blade_count, moss_patches: meadow.random_quadrat_sampling_practical.habitat.moss_patch_count }, shore: { bounds: shoreBounds, landscape, first_quadrat_clear: shoreInitial.rocky_shore_transect_practical.sampling_design.first_quadrat_clear_of_cliff_face, moving_stage: shoreMoving.rocky_shore_transect_practical.stage } };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  const summary = { pass: false, error: error instanceof Error ? error.stack : String(error), errors };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
