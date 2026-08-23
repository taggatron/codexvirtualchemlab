import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/respiration-balloon-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = milliseconds => page.evaluate(value => window.advanceTime(value), milliseconds);
const clickPrimary = async () => { await page.mouse.click(377, 837); await page.waitForTimeout(60); };
const screenshot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };

try {
  await page.goto(`http://127.0.0.1:4174/?respiration-balloon-qa=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await page.evaluate(() => { window.__manualSimulationTime = true; });
  await page.mouse.click(320, 32);
  await page.mouse.click(135, 289);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).id === 'respiration' && JSON.parse(window.render_game_to_text()).renderer?.enabled);

  await clickPrimary(); await advance(4000);
  await clickPrimary(); await advance(4800);
  await clickPrimary(); await advance(5000);
  let snapshot = await state();
  if (snapshot.anaerobic_respiration_practical.stage !== 6) throw new Error('Did not reach the newly fitted empty-balloon state.');
  await screenshot('01-rounded-floppy-fitted-balloons');

  await clickPrimary(); await advance(900);
  snapshot = await state();
  if (snapshot.anaerobic_respiration_practical.stage !== 7) throw new Error('Incubation did not begin.');
  await screenshot('02-early-inflation-transition');

  await advance(6600);
  snapshot = await state();
  if (snapshot.anaerobic_respiration_practical.stage !== 8) throw new Error('Incubation did not finish.');
  await screenshot('03-final-inflation-preserved');
  if (errors.length) throw new Error(errors.join('\n'));
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify({ errors, renderer: snapshot.renderer, final_stage: snapshot.anaerobic_respiration_practical.stage, controls_fit: snapshot.control_label_layout?.all_visible_button_labels_fit }, null, 2));
} finally {
  await browser.close();
}
