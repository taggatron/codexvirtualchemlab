import { chromium } from 'playwright';
import fs from 'node:fs';

const out = '/private/tmp/chem-co2-bungs';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?co2-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.waitForTimeout(400);
await page.evaluate(() => { window.__manualSimulationTime = true });
const read = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const capture = async name => { await page.waitForTimeout(180); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); return read() };

await page.mouse.click(135, 490);
const ready = await capture('01-ready-bungs-and-submerged-tube');

await page.mouse.click(356, 837);
await page.evaluate(() => window.advanceTime(2500));
const bubblingA = await capture('02-bubbling-quarter-turbidity');
await page.waitForTimeout(360);
const bubblingB = await capture('03-bubble-motion-check');

await page.mouse.click(1284, 98);
const birdQuarter = await capture('04-birds-eye-quarter-turbidity');
await page.evaluate(() => window.advanceTime(5000));
const birdCloudy = await capture('05-birds-eye-cloudy');

await page.mouse.click(1174, 98);
const apparatusCloudy = await capture('06-apparatus-cloudy');
await page.evaluate(() => window.advanceTime(2600));
const complete = await capture('07-complete-milky-apparatus');
await page.mouse.click(1284, 98);
const birdComplete = await capture('08-complete-birds-eye-milky');

await page.mouse.click(356, 837);
const reset = await capture('09-reset-clear');

const result = {
  ready: ready.carbon_dioxide_test,
  bubbling: bubblingA.carbon_dioxide_test,
  bubbling_later: bubblingB.carbon_dioxide_test,
  bird_quarter: { tab: birdQuarter.tab, results_view: birdQuarter.results_view, ...birdQuarter.carbon_dioxide_test },
  bird_cloudy: birdCloudy.carbon_dioxide_test,
  complete: { complete: complete.complete, ...complete.carbon_dioxide_test },
  bird_complete: { tab: birdComplete.tab, ...birdComplete.carbon_dioxide_test },
  reset: reset.carbon_dioxide_test,
  renderer: ready.renderer,
  errors
};
fs.writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
await browser.close();
