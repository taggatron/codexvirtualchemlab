import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/hose-alignment-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?hose-alignment=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
for (const y of [602, 612, 620]) {
  await page.mouse.click(135, y);
  await page.waitForTimeout(100);
  if ((await state()).practical === 'Flame tests') break;
}
await page.evaluate(() => window.advanceTime(3800));
await page.waitForFunction(() => {
  const snapshot = JSON.parse(window.render_game_to_text());
  return snapshot.practical === 'Flame tests' && snapshot.renderer?.canvas_visible && !snapshot.renderer?.scene_compiling;
});
await page.waitForTimeout(180);
const snapshot = await state();
await page.screenshot({ path: `${out}/01-flame-tests-full.png`, fullPage: true });
await page.screenshot({ path: `${out}/02-hose-tap-closeup.png`, clip: { x: 260, y: 330, width: 720, height: 410 } });
fs.writeFileSync(`${out}/summary.json`, JSON.stringify({ practical: snapshot.practical, renderer: snapshot.renderer, geometry: snapshot.bunsen_geometry, errors }, null, 2));

const geometry = snapshot.bunsen_geometry;
if (snapshot.practical !== 'Flame tests') throw new Error('Flame Tests was not selected.');
if (!geometry.hose_valve_sleeve_flared || geometry.hose_valve_final_approach_axis !== '+x coaxial with the gas-tap outlet') throw new Error('Hose cuff is not coaxial with the tap outlet.');
if (geometry.hose_valve_sleeve_profile !== 'rubber cuff flares from 0.059 to 0.094 scene-unit radius over the brass barbs' || geometry.hose_overlaps_brass_valve_scene_units !== .2) throw new Error('Hose cuff expansion or brass overlap is incorrect.');
if (JSON.stringify(geometry.hose_valve_final_tangent) !== '[1,0,0]') throw new Error('Final hose tangent is not aligned to the tap axis.');
if (!snapshot.renderer.enabled || snapshot.renderer.context_lost || errors.length) throw new Error(errors.join('\n') || 'WebGL renderer failed.');
console.log(JSON.stringify({ practical: snapshot.practical, renderer: snapshot.renderer, hose: { profile: geometry.hose_valve_sleeve_profile, axis: geometry.hose_valve_final_approach_axis, tangent: geometry.hose_valve_final_tangent, overlap: geometry.hose_overlaps_brass_valve_scene_units }, errors }, null, 2));
await browser.close();
