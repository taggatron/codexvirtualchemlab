import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/agar-diffusion-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4176/?agar-diffusion-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const clickPrimary = async () => { await page.mouse.click(382, 837); await page.waitForTimeout(80); };
const capture = async name => {
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${out}/${name}.png` });
  return state();
};

await page.mouse.click(320, 32);
await page.waitForTimeout(120);
await page.mouse.click(135, 449);
await page.waitForTimeout(1500);
const initial = await capture('01-pink-cubes-ready');

await clickPrimary();
await advance(1700);
const measuring = await capture('02-callipers-measuring');
await advance(1900);
const measured = await state();

await clickPrimary();
await advance(2200);
const lowering = await capture('03-forceps-lowering');
await advance(2200);
const submerged = await capture('04-all-cubes-submerged');

await clickPrimary();
await advance(3600);
const diffusing = await capture('05-diffusion-front-half-time');
await advance(3800);
const soaked = await capture('06-ten-minutes-complete');

await clickPrimary();
await advance(2400);
const blotting = await capture('07-removing-and-blotting');
await advance(2200);
const readyToCut = await state();

await clickPrimary();
await advance(2850);
const cutting = await capture('08-cutting-and-core-reveal');
await advance(2950);
const cores = await capture('09-all-pink-cores-visible');

await clickPrimary();
const completed = await capture('10-results-graph');
await page.mouse.click(1380, 134);
const expanded = await capture('11-expanded-graph');

const practical = completed.agar_cube_diffusion_practical;
const summary = {
  errors,
  renderer: initial.renderer,
  initial_stage: initial.agar_cube_diffusion_practical.stage,
  measuring_stage: measuring.agar_cube_diffusion_practical.stage,
  measured_stage: measured.agar_cube_diffusion_practical.stage,
  lowering_stage: lowering.agar_cube_diffusion_practical.stage,
  submerged_stage: submerged.agar_cube_diffusion_practical.stage,
  diffusion_stage: diffusing.agar_cube_diffusion_practical.stage,
  diffusion_elapsed_min: diffusing.agar_cube_diffusion_practical.elapsed_minutes,
  soaked_stage: soaked.agar_cube_diffusion_practical.stage,
  blotting_stage: blotting.agar_cube_diffusion_practical.stage,
  ready_to_cut_stage: readyToCut.agar_cube_diffusion_practical.stage,
  cutting_stage: cutting.agar_cube_diffusion_practical.stage,
  cores_stage: cores.agar_cube_diffusion_practical.stage,
  results: practical.results,
  graph_axes: completed.graph_axes,
  graph_modal_open: expanded.graph_modal.open,
  complete: completed.complete
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!initial.renderer.enabled) throw new Error('WebGL renderer is not enabled.');
if (initial.id !== 'agardiffusion' || initial.agar_cube_diffusion_practical.stage !== 0) throw new Error('The agar practical did not load in its ready state.');
if (measuring.agar_cube_diffusion_practical.stage !== 1 || measured.agar_cube_diffusion_practical.stage !== 2) throw new Error('Cube measurement sequence failed.');
if (lowering.agar_cube_diffusion_practical.stage !== 3 || submerged.agar_cube_diffusion_practical.stage !== 4) throw new Error('Forceps/submersion sequence failed.');
if (diffusing.agar_cube_diffusion_practical.stage !== 5 || diffusing.agar_cube_diffusion_practical.elapsed_minutes < 4.8) throw new Error('Timed diffusion stage failed.');
if (soaked.agar_cube_diffusion_practical.stage !== 6 || blotting.agar_cube_diffusion_practical.stage !== 7 || readyToCut.agar_cube_diffusion_practical.stage !== 8) throw new Error('Soak completion or blotting sequence failed.');
if (cutting.agar_cube_diffusion_practical.stage !== 9 || cores.agar_cube_diffusion_practical.stage !== 10) throw new Error('Cut/core reveal sequence failed.');
if (JSON.stringify(practical.results.map(result => result.percentage_diffused)) !== JSON.stringify([93.6, 65.7, 48.8])) throw new Error('Unexpected percentage-diffused results.');
if (!completed.complete || completed.tab !== 'graph' || !expanded.graph_modal.open) throw new Error('Completion or expanded graph failed.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
