import { chromium } from 'playwright';
import fs from 'node:fs';

const out = '/private/tmp/chem-flame-tests';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?flame-tests-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.waitForTimeout(350);
await page.evaluate(() => { window.__manualSimulationTime = true; });

const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const primary = async () => page.mouse.click(378, 837);

await page.mouse.click(135, 594);
await page.waitForTimeout(220);
await page.screenshot({ path: `${out}/01-selected-salt-and-blue-bunsen.png`, fullPage: true });
const initial = await readState();

await primary();
await page.evaluate(() => window.advanceTime(1050));
await page.waitForTimeout(120);
await page.screenshot({ path: `${out}/02-scooping-lithium-chloride.png`, fullPage: true });
const scooping = await readState();

await page.evaluate(() => window.advanceTime(1250));
await page.waitForTimeout(120);
await page.screenshot({ path: `${out}/03-loaded-metal-spatula.png`, fullPage: true });
const loaded = await readState();

await primary();
await page.evaluate(() => window.advanceTime(1650));
await page.waitForTimeout(120);
await page.screenshot({ path: `${out}/04-crimson-flame-reveal.png`, fullPage: true });
const crimson = await readState();

await page.evaluate(() => window.advanceTime(1700));
await page.waitForTimeout(140);
await page.screenshot({ path: `${out}/05-lithium-absorption-spectrum.png`, fullPage: true });
const lithiumComplete = await readState();

const colours = [];
for (let saltIndex = 1; saltIndex < 5; saltIndex++) {
  await primary();
  await primary();
  await page.evaluate(() => window.advanceTime(2300));
  await primary();
  await page.evaluate(() => window.advanceTime(1650));
  const active = await readState();
  colours.push({ salt: active.flame_tests.selected_salt, colour: active.flame_tests.revealed_flame_colour });
  if (saltIndex === 1 || saltIndex === 4) {
    await page.waitForTimeout(100);
    await page.screenshot({
      path: `${out}/${saltIndex === 1 ? '06-sodium-yellow-flame.png' : '07-copper-blue-green-flame.png'}`,
      fullPage: true
    });
  }
  await page.evaluate(() => window.advanceTime(1700));
}

await page.waitForTimeout(160);
await page.screenshot({ path: `${out}/08-all-absorption-spectra-complete.png`, fullPage: true });
const final = await readState();

const result = {
  initial: initial.flame_tests,
  scooping: scooping.flame_tests,
  loaded: loaded.flame_tests,
  crimson: crimson.flame_tests,
  lithium_complete: lithiumComplete.flame_tests,
  additional_colours: colours,
  final: final.flame_tests,
  final_tab: final.tab,
  graph_axes: final.graph_axes,
  results_columns: final.results_columns,
  results_view: final.results_view,
  complete: final.complete,
  renderer: final.renderer,
  errors
};
fs.writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));

if (initial.practical !== 'Flame tests' || initial.renderer?.enabled !== true) throw new Error('Flame-test practical or WebGL renderer did not load');
if (!initial.flame_tests.blue_flame_visible || initial.flame_tests.stage !== 0 || initial.flame_tests.selected_salt !== 'Lithium chloride') throw new Error('Initial flame-test state is incorrect');
if (scooping.flame_tests.stage !== 1 || scooping.flame_tests.spatula_loaded) throw new Error('Scoop animation did not reach its expected midpoint');
if (loaded.flame_tests.stage !== 2 || !loaded.flame_tests.spatula_loaded || loaded.flame_tests.spatula_in_flame) throw new Error('Salt was not loaded correctly onto the spatula');
if (crimson.flame_tests.stage !== 3 || !crimson.flame_tests.spatula_in_flame || crimson.flame_tests.revealed_flame_colour !== 'crimson red') throw new Error('Lithium flame colour was not revealed in the Bunsen flame');
if (lithiumComplete.tab !== 'graph' || lithiumComplete.results_view !== 'visible-light absorption spectra with characteristic black bands' || lithiumComplete.flame_tests.tested_salts.length !== 1) throw new Error('Lithium result did not open the absorption-spectrum view');
if (colours.map(item => item.colour).join('|') !== 'intense yellow|lilac|orange-red|blue-green') throw new Error('One or more additional metal-ion flame colours are incorrect');
if (!final.complete || final.tab !== 'graph' || final.graph_axes !== null || final.results_columns !== null || final.flame_tests.tested_salts.length !== 5) throw new Error('Five-salt series did not complete with spectra replacing the results table');
if (final.flame_tests.absorption_spectra.length !== 5 || final.flame_tests.absorption_spectra.some(item => item.black_absorption_bands_nm.length !== 3)) throw new Error('Absorption-spectrum band data is incomplete');
if (errors.length) throw new Error(errors.join('\n'));

await browser.close();
console.log(JSON.stringify(result, null, 2));
