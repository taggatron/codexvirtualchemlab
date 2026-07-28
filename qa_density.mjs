import { chromium } from 'playwright';
import fs from 'node:fs';

const out = '/private/tmp/chem-density';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', error => errors.push(`page: ${error.message}`));

await page.goto(`http://127.0.0.1:4173/?density-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.waitForTimeout(400);
await page.evaluate(() => { window.__manualSimulationTime = true; });

const read = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const capture = async name => {
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return read();
};
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);

await page.mouse.click(435, 32);
await page.waitForTimeout(120);
await page.mouse.click(135, 181);
await page.waitForTimeout(260);
const initial = await capture('01-initial-balance-can-cylinder');

await page.mouse.click(365, 837);
const weighed = await capture('02-mass-measured');

await page.mouse.click(365, 837);
await advance(500);
const filling = await capture('03-can-filling-before-lift');

await advance(800);
const transferEarly = await capture('04-smooth-transfer-early');

await advance(1000);
const transferMid = await capture('05-smooth-transfer-mid-arc');

await advance(1400);
const ready = await capture('06-suspended-over-visible-water');

await page.mouse.click(365, 837);
await advance(700);
const lowering = await capture('07-lowering-toward-water');

await advance(500);
const splash = await capture('08-entry-ripples-splash-bubbles');

await advance(900);
const overflow = await capture('09-overflow-into-aligned-cylinder');

await advance(2400);
const complete = await capture('10-displacement-complete');

await page.mouse.click(365, 837);
const recorded = await capture('11-density-graph-recorded');

const result = {
  initial: initial.density_practical,
  weighed: weighed.density_practical,
  filling: filling.density_practical,
  transferEarly: transferEarly.density_practical,
  transferMid: transferMid.density_practical,
  ready: ready.density_practical,
  lowering: lowering.density_practical,
  splash: splash.density_practical,
  overflow: overflow.density_practical,
  complete: complete.density_practical,
  recorded: recorded.density_practical,
  graph: { tab: recorded.tab, axes: recorded.graph_axes, readings: recorded.graph_readings },
  renderer: initial.renderer,
  errors
};
fs.writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));

if (initial.practical !== 'Density of solids' || initial.renderer?.enabled !== true) throw new Error('Density practical or WebGL renderer did not load');
if (initial.density_practical.stage !== 0 || initial.density_practical.measured_mass_g !== 0) throw new Error('Initial density state is incorrect');
if (weighed.density_practical.stage !== 1 || weighed.density_practical.measured_mass_g !== 187.5) throw new Error('Balance measurement was not recorded');
if (filling.density_practical.stage !== 2 || filling.density_practical.eureka_can.water_fill_fraction <= .5 || filling.density_practical.object_transfer.progress !== 0) throw new Error('Can should visibly fill before the object leaves the pan');
if (transferEarly.density_practical.object_transfer.progress <= .05 || transferEarly.density_practical.object_transfer.progress >= .4) throw new Error('Early transfer frame is outside the eased movement interval');
if (transferMid.density_practical.object_transfer.progress <= .4 || transferMid.density_practical.object_transfer.progress >= .85) throw new Error('Mid-transfer frame is outside the eased movement interval');
if (ready.density_practical.stage !== 3 || ready.density_practical.object_transfer.progress !== 1 || !ready.density_practical.eureka_can.water_surface_visible) throw new Error('Object did not finish suspended over visible water');
if (lowering.density_practical.stage !== 4 || lowering.density_practical.displaced_volume_cm3 !== 0) throw new Error('Lowering should begin before displacement');
if (!splash.density_practical.immersion_effects.active || !splash.density_practical.immersion_effects.surface_ripples || !splash.density_practical.immersion_effects.entry_splash_droplets || !splash.density_practical.immersion_effects.trapped_air_bubbles) throw new Error('Entry effects are incomplete');
if (!overflow.density_practical.immersion_effects.soft_overflow_stream || overflow.density_practical.measuring_cylinder.collected_volume_cm3 <= 5 || !overflow.density_practical.measuring_cylinder.under_spout || !overflow.density_practical.measuring_cylinder.aligned_with_spout_outlet) throw new Error('Overflow or cylinder alignment state is incorrect');
if (complete.density_practical.stage !== 5 || complete.density_practical.measuring_cylinder.collected_volume_cm3 !== 75 || !complete.complete) throw new Error('Displacement did not complete at 75 cm3');
if (recorded.density_practical.stage !== 6 || recorded.density_practical.calculated_density_g_cm3 !== 2.5 || recorded.tab !== 'graph' || recorded.graph_readings !== 1) throw new Error('Density result or graph was not recorded');
if (errors.length) throw new Error(errors.join('\n'));

await browser.close();
console.log(JSON.stringify(result, null, 2));
