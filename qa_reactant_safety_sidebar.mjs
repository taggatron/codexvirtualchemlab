import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/reactant-safety-sidebar-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.goto(`http://127.0.0.1:4173/?reactant-safety=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const clickFirstRow = async index => {
  const before = await state(), row = before.right_sidebar_layout.reactant_rows[index], scale = before.responsive_layout.scale;
  if (!row) throw new Error(`Missing guided reactant row ${index}.`);
  await page.mouse.click((1440 - 165) * scale, (row.top_y + row.bottom_y) / 2 * scale);
  await page.waitForTimeout(120);
  return state();
};

await page.mouse.click(135, 451);
await page.waitForTimeout(160);
const hydrogen = await state();
await page.screenshot({ path: `${out}/01-hydrogen-sidebar.png`, fullPage: true });
const magnesium = await clickFirstRow(0);
await page.screenshot({ path: `${out}/02-magnesium-safety-modal.png`, fullPage: true });
await page.keyboard.press('Escape');
const acid = await clickFirstRow(1);
await page.screenshot({ path: `${out}/03-hydrochloric-acid-safety-modal.png`, fullPage: true });
await page.keyboard.press('Escape');

await page.mouse.click(320, 32);
await page.waitForTimeout(100);
const biologyStart = await state();
const ethanol = await clickFirstRow(1);
await page.screenshot({ path: `${out}/04-ethanol-safety-modal.png`, fullPage: true });
await page.keyboard.press('Escape');

await page.mouse.click(434, 32);
await page.waitForTimeout(100);
await page.mouse.click(135, 343);
await page.waitForTimeout(140);
const thermal = await state();
const hotWater = await clickFirstRow(0);
await page.screenshot({ path: `${out}/05-hot-water-safety-modal.png`, fullPage: true });
await page.keyboard.press('Escape');

await page.mouse.click(206, 32);
await page.waitForTimeout(100);
await page.mouse.click(135, 127);
await page.waitForTimeout(140);
const free = await state();

const mobileContext = await browser.newContext({ viewport: { width: 1206, height: 584 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const mobile = await mobileContext.newPage();
mobile.on('console', message => { if (message.type() === 'error') errors.push(`mobile console: ${message.text()}`); });
mobile.on('pageerror', error => errors.push(`mobile page: ${error.message}`));
await mobile.goto(`http://127.0.0.1:4173/?reactant-safety-mobile=${Date.now()}`, { waitUntil: 'networkidle' });
await mobile.waitForFunction(() => typeof window.render_game_to_text === 'function');
const mobileState = () => mobile.evaluate(() => JSON.parse(window.render_game_to_text()));
let ms = await mobileState();
await mobile.mouse.click(135 * ms.responsive_layout.scale, 340 * ms.responsive_layout.scale);
await mobile.waitForTimeout(140);
ms = await mobileState();
const mobileRow = ms.right_sidebar_layout.reactant_rows[0];
await mobile.mouse.click((ms.responsive_layout.logical_canvas_px.width - 165) * ms.responsive_layout.scale, (mobileRow.top_y + mobileRow.bottom_y) / 2 * ms.responsive_layout.scale);
await mobile.waitForTimeout(120);
const mobileModal = await mobileState();
await mobile.screenshot({ path: `${out}/06-mobile-safety-modal.png`, fullPage: true });

const summary = { hydrogen, magnesium: magnesium.reactant_interaction, acid: acid.reactant_interaction, biology_start: biologyStart.practical, ethanol: ethanol.reactant_interaction, thermal: thermal.practical, hot_water: hotWater.reactant_interaction, free_workspace: free.reactant_interaction, mobile: { responsive: mobileModal.responsive_layout, popup: mobileModal.reactant_interaction.popup }, errors };
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (hydrogen.practical !== 'Hydrogen squeaky pop test') throw new Error('Hydrogen practical was not selected.');
if (hydrogen.reactant_interaction.drag_enabled || hydrogen.reactant_interaction.mode !== 'health and safety information') throw new Error('Guided reactant setup/drag interaction remains enabled.');
if (magnesium.reactant_interaction.popup.reactant !== 'Magnesium ribbon' || !magnesium.reactant_interaction.popup.rating.includes('FLAMMABLE')) throw new Error('Magnesium safety popup is incomplete.');
if (magnesium.dragging) throw new Error('Guided reactant click entered a drag state.');
if (!acid.reactant_interaction.popup.reactant.includes('hydrochloric acid') || !acid.reactant_interaction.popup.rating.includes('IRRITANT')) throw new Error('Acid safety popup is incomplete.');
if (biologyStart.practical !== 'Test a leaf for starch' || !ethanol.reactant_interaction.popup.rating.includes('FLAMMABLE')) throw new Error('Biology reactant safety popup failed.');
if (thermal.practical !== 'Thermal radiation' || !hotWater.reactant_interaction.popup.rating.includes('SCALD')) throw new Error('Physics hot-water safety popup failed.');
if (free.practical !== 'Free workspace' || !free.reactant_interaction.drag_enabled || !free.reactant_interaction.dose_selection_enabled) throw new Error('Chemistry Free Workspace reactant dragging was not preserved.');
if (!mobileModal.reactant_interaction.popup.open || mobileModal.responsive_layout.mode !== 'compact landscape') throw new Error('Safety modal failed in compact landscape.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
