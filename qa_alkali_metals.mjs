import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/alkali-metals-qa';
const baseUrl = process.env.LAB_URL || 'http://127.0.0.1:4173';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

await page.goto(`${baseUrl}/?alkali-metals-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = milliseconds => page.evaluate(value => window.advanceTime(value), milliseconds);
const capture = async name => {
  await page.waitForTimeout(110);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};

const beforeScroll = await state();
await page.mouse.move(135, 250);
await page.mouse.wheel(0, 520);
await advance(0);
const afterScroll = await state();
const scroll = afterScroll.left_practical_sidebar;
const alkaliIndex = 11;
const cardCentreY = (101 + alkaliIndex * 54 - scroll.scroll_offset_px + 24.5) * afterScroll.responsive_layout.scale;
await page.mouse.click(135 * afterScroll.responsive_layout.scale, cardCentreY);
await page.waitForTimeout(160);

const initial = await capture('01-screened-trough-ready');
const primary = () => page.mouse.click(382, 837);

await primary();
await advance(920);
const lithiumLowering = await capture('02-lithium-forceps-lowering');
await advance(930);
await advance(1120);
const lithiumReaction = await capture('03-lithium-bubbles-and-ripples');
await advance(2400);
await primary();
await primary();
await advance(1350);

await primary();
await advance(1850);
await advance(950);
const sodiumReaction = await capture('04-sodium-melting-yellow-flame');
await advance(1900);
await primary();
await primary();
await advance(1350);

await primary();
await advance(1850);
await advance(900);
const potassiumReaction = await capture('05-potassium-lilac-flame');
await advance(1450);
await primary();
const completed = await capture('06-completed-reactivity-comparison');

const summary = {
  errors,
  renderer: initial.renderer,
  sidebar: { before: beforeScroll.left_practical_sidebar, after: afterScroll.left_practical_sidebar },
  initial: initial.alkali_metals,
  lithium_lowering: lithiumLowering.alkali_metals,
  lithium_reaction: lithiumReaction.alkali_metals,
  sodium_reaction: sodiumReaction.alkali_metals,
  potassium_reaction: potassiumReaction.alkali_metals,
  completed: completed.alkali_metals,
  final_tab: completed.tab,
  complete: completed.complete
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!initial.renderer?.enabled || initial.renderer?.legacy_2d_apparatus) throw new Error('WebGL renderer is not enabled.');
if (!afterScroll.left_practical_sidebar.scroll_enabled || afterScroll.left_practical_sidebar.scrollbar_visible || afterScroll.left_practical_sidebar.scroll_offset_px <= 0) {
  throw new Error('The chemistry sidebar did not scroll invisibly.');
}
if (initial.practical !== 'Alkali metals in water' || !initial.alkali_metals.simulation_only || !initial.alkali_metals.safety_screen_in_place) {
  throw new Error('Initial protected alkali-metals setup is incorrect.');
}
if (lithiumLowering.alkali_metals.stage !== 1 || !lithiumLowering.alkali_metals.forceps_holding_sample) {
  throw new Error('Lithium forceps-lowering phase was not reached.');
}
if (lithiumReaction.alkali_metals.selected_metal !== 'Lithium' || !lithiumReaction.alkali_metals.metal_floating || !lithiumReaction.alkali_metals.hydrogen_bubbles_visible || !lithiumReaction.alkali_metals.ripple_rings_visible || lithiumReaction.alkali_metals.flame !== null) {
  throw new Error('Lithium reaction visuals are incorrect.');
}
if (sodiumReaction.alkali_metals.selected_metal !== 'Sodium' || !sodiumReaction.alkali_metals.sodium_melting_visible || sodiumReaction.alkali_metals.flame !== 'yellow-orange flame') {
  throw new Error('Sodium melting or yellow-orange flame state is incorrect.');
}
if (potassiumReaction.alkali_metals.selected_metal !== 'Potassium' || potassiumReaction.alkali_metals.flame !== 'lilac flame' || !potassiumReaction.alkali_metals.hydrogen_bubbles_visible) {
  throw new Error('Potassium lilac-flame state is incorrect.');
}
if (!completed.complete || completed.tab !== 'graph' || completed.alkali_metals.observations.length !== 3 || JSON.stringify(completed.alkali_metals.reactivity_order) !== JSON.stringify(['Li', 'Na', 'K'])) {
  throw new Error('Alkali-metals comparison did not complete correctly.');
}
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
