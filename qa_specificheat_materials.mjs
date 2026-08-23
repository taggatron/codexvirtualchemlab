import { chromium } from './qa_playwright_shim.mjs';
import fs from 'node:fs';

const out = 'output/specific-heat-materials-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:4173'}/?shc-materials=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });
const snapshot = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const click = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(100); };
await click(435, 32);
for (let y = 105; y <= 690; y += 24) {
  await click(130, y);
  if (/specific heat/i.test((await snapshot()).practical || '')) break;
}
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/01-aluminium-initial.png`, fullPage: true });
let state = await snapshot();
const initial = state.specific_heat_capacity_practical;
if (!initial?.preparation?.insulation_starts_off_camera || !initial?.instrument_layout?.all_four_displays_visible) throw new Error('Initial specific-heat organisation contract is missing.');
if (!initial?.preparation?.block_bores_pre_drilled_before_practical || initial?.preparation?.drilling_sparks_shown !== false) throw new Error('Specific-heat bores should be supplied pre-drilled without a classroom drilling/sparks step.');
await click(550, 657); // MATERIAL: ALUMINIUM -> COPPER
state = await snapshot();
if (state.specific_heat_capacity_practical?.material !== 'copper') throw new Error('Copper material selection failed.');
await page.screenshot({ path: `${out}/02-copper-initial.png`, fullPage: true });
await click(376, 657); // PREPARE BLOCK
await page.evaluate(() => window.advanceTime(3100));
state = await snapshot();
if (state.specific_heat_capacity_practical?.stage !== 1 || !state.specific_heat_capacity_practical?.preparation?.insulation_panels_fly_in_individually) throw new Error('Insulation fly-in did not remain active at the mid-assembly checkpoint.');
await page.screenshot({ path: `${out}/02a-copper-insulation-arriving.png`, fullPage: true });
await page.evaluate(() => window.advanceTime(800));
await click(376, 657); // START HEATING
await page.evaluate(() => window.advanceTime(8100));
await page.waitForTimeout(250);
state = await snapshot();
const practical = state.specific_heat_capacity_practical;
if (practical.stage !== 4 || practical.energy_j !== 18000 || practical.temperature_c !== 66.2) throw new Error(`Unexpected copper result: ${JSON.stringify(practical)}`);
await page.screenshot({ path: `${out}/03-copper-heated.png`, fullPage: true });
await click(376, 657); // CALCULATE c
state = await snapshot();
if (state.specific_heat_capacity_practical?.calculated_specific_heat_j_per_kg_c !== 390) throw new Error('Copper specific heat calculation was not 390 J kg⁻¹ °C⁻¹.');
await page.screenshot({ path: `${out}/04-copper-calculated.png`, fullPage: true });
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ errors, material: 'copper', final_temperature_c: practical.temperature_c, specific_heat_j_per_kg_c: 390 }, null, 2));
await browser.close();
