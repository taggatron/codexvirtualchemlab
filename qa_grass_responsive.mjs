import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/grass-responsive';
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromeExecutable, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
const assert = (condition, message) => { if (!condition) throw new Error(message) };
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));

async function projectedSamplingBounds() {
  return page.evaluate(async () => {
    const THREE = await import('./vendor/three.module.js');
    const rect = document.querySelector('#webgl').getBoundingClientRect(), aspect = rect.width / rect.height, baseFov = 40, baseAspect = 1.25;
    const baseHalfWidth = Math.tan(THREE.MathUtils.degToRad(baseFov * .5)) * baseAspect;
    const fov = aspect < baseAspect ? Math.min(96, THREE.MathUtils.radToDeg(2 * Math.atan(baseHalfWidth / Math.max(.4, aspect)))) : baseFov;
    const camera = new THREE.PerspectiveCamera(fov, aspect, .1, 50); camera.position.set(0, 5.35, 9.45); camera.lookAt(0, .55, .42); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const projectBox = ({ min, max }) => {
      const projected = [];
      for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) projected.push(new THREE.Vector3(x, y, z).project(camera));
      return { minX: Math.min(...projected.map(p => p.x)), maxX: Math.max(...projected.map(p => p.x)), minY: Math.min(...projected.map(p => p.y)), maxY: Math.max(...projected.map(p => p.y)) }
    };
    const generator = projectBox({ min: [-3.9, .35, -.42], max: [-2.5, 1.16, -.08] });
    const quadratBoxes = [[-2.75, 1.2], [-1.85, 3.48], [1.72, 2.36], [-.04, 2.98], [-2.35, 2.14], [1.18, 3.7]].map(([x, z]) => projectBox({ min: [x - .62, .37, z - .62], max: [x + .62, .54, z + .62] }));
    const tapeEndpoints = { origin: new THREE.Vector3(-2.8, .344, -1).project(camera), xEnd: new THREE.Vector3(2.8, .344, -1).project(camera), yEnd: new THREE.Vector3(-2.8, .344, 4.2).project(camera) };
    return { aspect, fov, generator, quadratBoxes, tapeEndpoints }
  })
}

async function capture(label, width, height) {
  await page.setViewportSize({ width, height }); await page.waitForTimeout(500);
  const snapshot = await state(), frame = await projectedSamplingBounds(), canvas = await page.locator('#webgl').evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, visible: getComputedStyle(node).visibility === 'visible' } });
  await page.screenshot({ path: `${out}/${label}.png`, fullPage: true });
  assert(snapshot.renderer?.enabled && canvas.visible, `${label}: WebGL is unavailable.`);
  assert(frame.generator.minX > -.94 && frame.generator.maxX < .94 && frame.generator.minY > -.92 && frame.generator.maxY < .92, `${label}: coordinate generator leaves the safe frame: ${JSON.stringify(frame.generator)}`);
  frame.quadratBoxes.forEach((box, index) => assert(box.minX > -.94 && box.maxX < .94 && box.minY > -.92 && box.maxY < .92, `${label}: quadrat pose ${index} leaves the safe frame: ${JSON.stringify(box)}`));
  Object.entries(frame.tapeEndpoints).forEach(([name, point]) => assert(Math.abs(point.x) < .94 && Math.abs(point.y) < .92, `${label}: ${name} tape point leaves the safe frame: ${JSON.stringify(point)}`));
  return { label, viewport: [width, height], focus: snapshot.focus_mode, canvas, projection: frame }
}

let report;
try {
  await page.goto(`http://127.0.0.1:4173/?grass-responsive=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await page.evaluate(() => { window.__manualSimulationTime = true });
  await page.mouse.click(320, 32); await page.mouse.click(135, 397);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).practical === 'Random quadrat sampling');
  await page.evaluate(() => window.advanceTime(3200)); await page.waitForTimeout(650);
  const initial = await state(), habitat = initial.random_quadrat_sampling_practical.habitat;
  assert(habitat.grass_blade_count === 26720 && habitat.grass_blade_density_per_rendered_m2 >= 78, 'Expanded grass density contract failed.');
  assert(habitat.grass_blade_geometry.includes('tapered') && habitat.subtle_per_blade_tone_variation, 'Tapered/tone-varied grass contract failed.');
  assert(habitat.rendered_meadow_extends_beyond_visible_view && habitat.rendered_meadow_bounds_world.x[0] <= -14 && habitat.rendered_meadow_bounds_world.x[1] >= 14 && habitat.rendered_meadow_bounds_world.z[1] >= 9.95, 'Meadow horizontal/foreground overscan contract failed.');
  const captures = [];
  captures.push(await capture('01-desktop-1440x900', 1440, 900));
  await page.mouse.click(376, 837); await page.evaluate(() => window.advanceTime(1750)); await page.waitForTimeout(180);
  const tapeState = await state(), tapes = tapeState.random_quadrat_sampling_practical.grid_tapes; assert(tapeState.random_quadrat_sampling_practical.stage === 1 && tapeState.random_quadrat_sampling_practical.animation.measuring_tapes_unwind, 'Grid-tape animation did not run smoothly.');
  assert(tapes.share_exact_origin && tapes.right_angle_degrees === 90 && Math.abs(tapes.direction_dot_product) < 1e-6, 'Grid tapes do not share a perpendicular datum.');
  assert(tapes.x_direction_world.join(',') === '1,0,0' && tapes.y_direction_world.join(',') === '0,0,1' && tapes.y_end_world[2] > tapes.common_origin_world[2], 'The Y tape is not extending toward +worldZ / the sampled foreground.');
  assert(tapes.x_unroll_progress > tapes.y_unroll_progress && tapes.x_unroll_progress > .5 && tapes.y_unroll_progress > 0, 'The staged tape deployment is not progressing smoothly from X to Y.');
  await page.screenshot({ path: `${out}/01a-grid-tapes-unwinding.png`, fullPage: true });
  await page.evaluate(() => window.advanceTime(1850)); const completedTapes = (await state()).random_quadrat_sampling_practical; assert(completedTapes.stage === 2 && completedTapes.grid_tapes.x_unroll_progress === 1 && completedTapes.grid_tapes.y_unroll_progress === 1, 'Both grid tapes did not finish at the correct endpoints.'); await page.screenshot({ path: `${out}/01aa-grid-tapes-complete.png`, fullPage: true });
  await page.mouse.click(376, 837); await page.evaluate(() => window.advanceTime(610)); await page.waitForTimeout(180);
  const randomState = await state(); assert(randomState.random_quadrat_sampling_practical.stage === 3 && randomState.random_quadrat_sampling_practical.animation.coordinate_generator_spins, 'Coordinate-generator animation did not run smoothly.'); await page.screenshot({ path: `${out}/01b-coordinate-randomising.png`, fullPage: true });
  await page.evaluate(() => window.advanceTime(700)); await page.mouse.click(376, 837); await page.evaluate(() => window.advanceTime(1200)); await page.waitForTimeout(180);
  const flightState = await state(); assert(flightState.random_quadrat_sampling_practical.stage === 5 && flightState.random_quadrat_sampling_practical.animation.quadrat_smooth_throw_arc, 'Quadrat throw animation did not run smoothly.'); await page.screenshot({ path: `${out}/01c-quadrat-mid-flight.png`, fullPage: true });
  await page.evaluate(() => window.advanceTime(1300)); await page.mouse.click(376, 837); await page.evaluate(() => window.advanceTime(2050)); await page.waitForTimeout(180);
  const countState = await state(); assert(countState.random_quadrat_sampling_practical.stage === 7 && countState.random_quadrat_sampling_practical.animation.counted_daisies_pulse, 'Daisy-count animation did not run smoothly.'); await page.screenshot({ path: `${out}/01d-daisy-counting.png`, fullPage: true });
  await page.evaluate(() => window.advanceTime(2250)); const readyToRecord = (await state()).random_quadrat_sampling_practical; assert(readyToRecord.stage === 8 && readyToRecord.phase === 'count ready to record' && readyToRecord.current_count === 4, 'Corrected quadrat stage sequence did not reach a complete daisy count.');
  captures.push(await capture('02-compact-landscape-844x390', 844, 390));
  captures.push(await capture('03-tall-normal-1386x1564', 1386, 1564));
  captures.push(await capture('04-narrow-normal-1024x1366', 1024, 1366));
  await page.setViewportSize({ width: 1386, height: 1564 }); await page.waitForTimeout(250); await page.mouse.click(1216, 32); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).focus_mode === true);
  captures.push(await capture('05-tall-focus-1386x1564', 1386, 1564));
  captures.push(await capture('06-wide-focus-1920x900', 1920, 900));
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(250); await page.mouse.click(1364, 32); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).focus_mode === false);
  await page.mouse.click(135, 451); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).practical === 'Mark-release-recapture'); await page.evaluate(() => window.advanceTime(3200)); await page.waitForTimeout(600);
  const captureState = await state(), captureHabitat = captureState.capture_mark_recapture_practical.habitat;
  assert(captureHabitat.grass_blade_count === 50000 && captureHabitat.grass_blade_geometry.includes('tapered') && captureHabitat.rendered_meadow_extends_beyond_visible_view, 'Mark–release–recapture did not receive the shared grass improvements.');
  await page.screenshot({ path: `${out}/07-capture-shared-grass.png`, fullPage: true });
  await page.mouse.click(135, 505); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).practical === 'Rocky-shore belt transect'); await page.evaluate(() => window.advanceTime(900)); await page.waitForTimeout(600);
  const shoreState = await state(), shoreLandscape = shoreState.rocky_shore_transect_practical.landscape;
  assert(shoreLandscape.cliff_top_grass_blades === 680 && shoreLandscape.cliff_top_grass_geometry.includes('tapered') && shoreLandscape.cliff_top_grass_subtle_tone_variation, 'Rocky-shore cliff grass did not receive the shared grass improvements.');
  await page.screenshot({ path: `${out}/08-shore-shared-grass.png`, fullPage: true });
  assert(errors.length === 0, errors.join('\n'));
  report = { pass: true, errors, habitat, capture_habitat: captureHabitat, shore_grass: { blade_count: shoreLandscape.cliff_top_grass_blades, geometry: shoreLandscape.cliff_top_grass_geometry, subtle_tone_variation: shoreLandscape.cliff_top_grass_subtle_tone_variation }, captures };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report = { pass: false, error: error instanceof Error ? error.stack : String(error), errors };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(report, null, 2));
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {}); console.error(JSON.stringify(report, null, 2)); process.exitCode = 1;
} finally { await browser.close() }
