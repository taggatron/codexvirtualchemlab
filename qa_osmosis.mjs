import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/osmosis-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?osmosis-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const clickPrimary = async () => { await page.mouse.click(387, 657); await page.waitForTimeout(45); };
const capture = async name => {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};

await page.mouse.click(320, 32);
await page.mouse.click(135, 236);
const initial = await capture('01-initial-mass');
await clickPrimary();
await advance(900);
const transfer = await capture('02-forceps-transfer');
await advance(1900);
await advance(2700);
const soakingIn = await capture('03-water-moving-in');
await advance(3000);
const soakComplete = await capture('04-soak-complete');
await clickPrimary();
await advance(1700);
const blotting = await capture('05-draining-and-blotting');
await advance(1900);
const readyToWeigh = await capture('06-blotted-chip');
await clickPrimary();
await advance(1900);
const reweighing = await capture('07-balance-settling');
await advance(1500);
const firstResult = await capture('08-first-result');

const completeTrial = async () => {
  await clickPrimary();
  await clickPrimary();
  await advance(8200);
  await clickPrimary();
  await advance(3600);
  await clickPrimary();
  await advance(3400);
};

await completeTrial();
await completeTrial();
await completeTrial();
await clickPrimary();
await clickPrimary();
await advance(2800);
await advance(2700);
const soakingOut = await capture('09-water-moving-out-and-shrinking');
await advance(3000);
await clickPrimary();
await advance(3600);
await clickPrimary();
await advance(3400);
const completed = await capture('10-complete-series-graph');
await page.mouse.click(1220, 134);
const expanded = await capture('11-expanded-isotonic-graph');

const results = completed.potato_osmosis_practical.results;
const summary = {
  errors,
  renderer: initial.renderer,
  initial_stage: initial.potato_osmosis_practical.stage,
  transfer_stage: transfer.potato_osmosis_practical.stage,
  inward_soak_stage: soakingIn.potato_osmosis_practical.stage,
  inward_direction: soakingIn.potato_osmosis_practical.net_water_movement,
  soak_complete_stage: soakComplete.potato_osmosis_practical.stage,
  blotting_stage: blotting.potato_osmosis_practical.stage,
  ready_to_weigh_stage: readyToWeigh.potato_osmosis_practical.stage,
  reweighing_stage: reweighing.potato_osmosis_practical.stage,
  first_result: firstResult.potato_osmosis_practical.results[0],
  outward_direction: soakingOut.potato_osmosis_practical.net_water_movement,
  outward_shrinking: soakingOut.potato_osmosis_practical.biological_sample.shrinking_and_fine_wrinkling_when_water_leaves,
  results,
  isotonic_point_mol_dm3: completed.potato_osmosis_practical.isotonic_point_mol_dm3,
  graph_tab: completed.tab,
  graph_modal_open: expanded.graph_modal.open,
  complete: completed.complete
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!initial.renderer.enabled) throw new Error('WebGL renderer is not enabled.');
if (initial.potato_osmosis_practical.stage !== 0 || initial.potato_osmosis_practical.initial_mass_g !== 5) throw new Error('Initial weighing state is incorrect.');
if (transfer.potato_osmosis_practical.stage !== 1) throw new Error('Forceps transfer stage was not available for inspection.');
if (soakingIn.potato_osmosis_practical.stage !== 2 || soakingIn.potato_osmosis_practical.net_water_movement !== 'into the potato cells') throw new Error('Hypotonic water-entry stage failed.');
if (soakComplete.potato_osmosis_practical.stage !== 3) throw new Error('Thirty-minute soak did not finish at the removal checkpoint.');
if (blotting.potato_osmosis_practical.stage !== 4 || readyToWeigh.potato_osmosis_practical.stage !== 5) throw new Error('Removal/blotting sequence failed.');
if (reweighing.potato_osmosis_practical.stage !== 6 || firstResult.potato_osmosis_practical.stage !== 7) throw new Error('Reweighing sequence failed.');
if (results.length !== 5) throw new Error(`Expected five results, received ${results.length}.`);
if (JSON.stringify(results.map(result => result.percentage_change)) !== JSON.stringify([16, 8, 1.6, -9, -17])) throw new Error('Percentage-change series is incorrect.');
if (completed.potato_osmosis_practical.isotonic_point_mol_dm3 !== 0.43) throw new Error('Isotonic-point interpolation is incorrect.');
if (!completed.complete || completed.tab !== 'graph' || !expanded.graph_modal.open) throw new Error('Completion or graph expansion failed.');
if (soakingOut.potato_osmosis_practical.net_water_movement !== 'out of the potato cells' || !soakingOut.potato_osmosis_practical.biological_sample.shrinking_and_fine_wrinkling_when_water_leaves) throw new Error('Hypertonic water-loss stage failed.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
