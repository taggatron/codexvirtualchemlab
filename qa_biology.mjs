import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/biology-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?biology-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const click = async (x, y = 837) => { await page.mouse.click(x, y); await page.waitForTimeout(80); };
const capture = async name => {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};

await click(320, 32);
const starchInitial = await capture('01-starch-initial');
await click(380);
await advance(1000);
const starchBoiling = await capture('02-starch-boiling');
await advance(3100);
const starchBoiled = await capture('03-starch-boiled');
await click(380);
await advance(2200);
const starchEthanol = await capture('04-starch-in-ethanol');
await advance(2900);
const starchPale = await capture('05-starch-decolourised');
await click(380);
await advance(1500);
const starchRinse = await capture('06-starch-rinsing');
await advance(1900);
const starchTile = await capture('07-starch-on-tile');
await click(380);
await advance(1850);
const starchIodine = await capture('08-starch-iodine-spreading');
await advance(2200);
const starchComplete = await capture('09-starch-blue-black');
await click(689);
const starchResult = await capture('10-starch-result-panel');

await click(130, 181);
const lipaseInitial = await capture('11-lipase-initial-20c');
await click(380);
await advance(900);
const lipaseAdding = await capture('12-lipase-adding');
await advance(1400);
const lipaseReacting = await capture('13-lipase-pink-fading');
await advance(5400);
const lipase20 = await capture('14-lipase-20c-endpoint');

const finishLipaseTrial = async (conditioningMs, reactionMs, checkpoint = null) => {
  await click(380);
  await advance(conditioningMs);
  await click(380);
  await advance(1900);
  if (checkpoint) await capture(checkpoint);
  await advance(reactionMs);
  return state();
};

const lipase30 = await finishLipaseTrial(1750, 4500);
const lipase40 = await finishLipaseTrial(1750, 3800, '15-lipase-40c-reaction');
const lipase50 = await finishLipaseTrial(1750, 4300);
const lipase60 = await finishLipaseTrial(1750, 7100, '16-lipase-60c-reaction');
const lipaseComplete = await capture('17-lipase-series-graph');

const summary = {
  errors,
  renderer: starchInitial.renderer,
  starch: {
    initial_phase: starchInitial.starch_leaf_practical.phase,
    boiling_phase: starchBoiling.starch_leaf_practical.phase,
    ethanol_phase: starchEthanol.starch_leaf_practical.phase,
    rinsing_phase: starchRinse.starch_leaf_practical.phase,
    tile_ready: starchTile.starch_leaf_practical.sample.on_white_tile,
    iodine_phase: starchIodine.starch_leaf_practical.phase,
    final_colour: starchComplete.starch_leaf_practical.sample.final_colour,
    starch_present: starchComplete.starch_leaf_practical.sample.starch_present,
    result_view: starchResult.results_view,
    complete: starchComplete.complete
  },
  lipase: {
    initial_target_c: lipaseInitial.lipase_temperature_practical.target_temperature_c,
    adding_phase: lipaseAdding.lipase_temperature_practical.phase,
    reacting_colour: lipaseReacting.lipase_temperature_practical.indicator_colour,
    result_20_s: lipase20.lipase_temperature_practical.results[0]?.time_to_colourless_s,
    result_30_s: lipase30.lipase_temperature_practical.results.at(-1)?.time_to_colourless_s,
    result_40_s: lipase40.lipase_temperature_practical.results.at(-1)?.time_to_colourless_s,
    result_50_s: lipase50.lipase_temperature_practical.results.at(-1)?.time_to_colourless_s,
    result_60_s: lipase60.lipase_temperature_practical.results.at(-1)?.time_to_colourless_s,
    graph_axes: lipaseComplete.graph_axes,
    result_count: lipaseComplete.lipase_temperature_practical.results.length,
    complete: lipaseComplete.complete,
    evaluation_ready: lipaseComplete.practical_evaluation.ready
  }
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!starchInitial.renderer.enabled) throw new Error('WebGL renderer is not enabled.');
if (starchBoiling.starch_leaf_practical.stage !== 1) throw new Error('Leaf boiling stage did not remain active for inspection.');
if (starchEthanol.starch_leaf_practical.stage !== 3 || starchPale.starch_leaf_practical.stage !== 4) throw new Error('Ethanol decolourisation sequence failed.');
if (starchRinse.starch_leaf_practical.stage !== 5 || !starchTile.starch_leaf_practical.sample.on_white_tile) throw new Error('Leaf rinse/tile sequence failed.');
if (!starchComplete.complete || starchComplete.starch_leaf_practical.sample.final_colour !== 'blue-black' || !starchComplete.starch_leaf_practical.sample.starch_present) throw new Error('Final starch result is incorrect.');
if (lipaseInitial.lipase_temperature_practical.target_temperature_c !== 20) throw new Error('Lipase series did not begin at 20 °C.');
if (lipaseReacting.lipase_temperature_practical.indicator_colour !== 'fading pink') throw new Error('Lipase indicator did not visibly fade during reaction.');
if (lipaseComplete.lipase_temperature_practical.results.length !== 5) throw new Error('Lipase temperature series did not record five trials.');
const times = lipaseComplete.lipase_temperature_practical.results.map(result => result.time_to_colourless_s);
if (JSON.stringify(times) !== JSON.stringify([68, 39, 22, 34, 104])) throw new Error(`Unexpected lipase times: ${times.join(', ')}`);
if (!lipaseComplete.complete || !lipaseComplete.practical_evaluation.ready || lipaseComplete.tab !== 'graph') throw new Error('Lipase completion/graph/evaluation state failed.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
