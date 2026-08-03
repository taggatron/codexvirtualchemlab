import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/sidebar-layout-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const watch = page => {
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
};
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const selectOsmosis = async page => {
  const before = await state(page), scale = before.responsive_layout.scale;
  await page.mouse.click(320 * scale, 32 * scale);
  await page.waitForTimeout(100);
  await page.mouse.click(135 * scale, 230 * scale);
  await page.waitForTimeout(200);
  return state(page);
};

const desktop = await browser.newPage({ viewport: { width: 1440, height: 819 }, deviceScaleFactor: 1 });
watch(desktop);
await desktop.goto(`http://127.0.0.1:4173/?sidebar-layout-desktop=${Date.now()}`, { waitUntil: 'networkidle' });
await desktop.waitForFunction(() => typeof window.render_game_to_text === 'function');
const desktopState = await selectOsmosis(desktop);
await desktop.screenshot({ path: `${out}/01-desktop-osmosis-full.png`, fullPage: true });
await desktop.screenshot({ path: `${out}/02-desktop-sidebar.png`, clip: { x: 1110, y: 64, width: 330, height: 755 } });
await desktop.mouse.click(1275, (desktopState.right_sidebar_layout.evaluation_button_top_y + desktopState.right_sidebar_layout.evaluation_button_bottom_y) / 2);
await desktop.waitForTimeout(120);
const desktopEvaluation = await state(desktop);
await desktop.keyboard.press('Escape');

const mobileContext = await browser.newContext({ viewport: { width: 1206, height: 584 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const mobile = await mobileContext.newPage();
watch(mobile);
await mobile.goto(`http://127.0.0.1:4173/?sidebar-layout-mobile=${Date.now()}`, { waitUntil: 'networkidle' });
await mobile.waitForFunction(() => typeof window.render_game_to_text === 'function');
const mobileState = await selectOsmosis(mobile);
await mobile.screenshot({ path: `${out}/03-mobile-landscape-osmosis.png`, fullPage: true });
const mobileScale = mobileState.responsive_layout.scale;
await mobile.mouse.click(135 * mobileScale, 285 * mobileScale);
await mobile.waitForTimeout(180);
const mobilePotometerState = await state(mobile);
await mobile.screenshot({ path: `${out}/04-mobile-landscape-potometer.png`, fullPage: true });

const dense = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
watch(dense);
await dense.goto(`http://127.0.0.1:4173/?sidebar-layout-dense=${Date.now()}`, { waitUntil: 'networkidle' });
await dense.waitForFunction(() => typeof window.render_game_to_text === 'function');
let denseState;
for (const y of [496, 504, 512, 520]) {
  await dense.mouse.click(135, y);
  await dense.waitForTimeout(120);
  denseState = await state(dense);
  if (denseState.practical === 'Flame tests') break;
}
await dense.screenshot({ path: `${out}/05-desktop-flame-five-reactants.png`, fullPage: true });

const summary = { desktop: { responsive: desktopState.responsive_layout, sidebar: desktopState.right_sidebar_layout, evaluation_opened: desktopEvaluation.practical_evaluation.open }, mobile: { responsive: mobileState.responsive_layout, sidebar: mobileState.right_sidebar_layout }, mobile_potometer: { practical: mobilePotometerState.practical, sidebar: mobilePotometerState.right_sidebar_layout }, dense_flame_tests: { practical: denseState.practical, sidebar: denseState.right_sidebar_layout }, errors };
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

for (const [label, snapshot] of [['desktop', desktopState], ['mobile', mobileState]]) {
  const layout = snapshot.right_sidebar_layout;
  if (snapshot.practical !== 'Osmosis in potato tissue') throw new Error(`${label}: osmosis practical was not selected.`);
  if (!layout.method_stage_cards || layout.method_stage_count !== 4 || layout.method_stage_line_counts.some(count => count < 2)) throw new Error(`${label}: wrapped four-card Method layout is incomplete.`);
  if (!layout.all_method_stage_text_visible || !layout.all_sidebar_components_visible || layout.overflow_vertical_space_px !== 0) throw new Error(`${label}: sidebar content overflows the visible browser area.`);
  if (layout.unused_vertical_space_px > .5 || Math.abs(layout.content_bottom_y - layout.available_bottom_y) > .5) throw new Error(`${label}: sidebar does not fill the available vertical space.`);
}
if (!mobileState.responsive_layout.mobile_landscape_layout || !mobileState.right_sidebar_layout.compact) throw new Error('Short landscape sidebar did not select the compact layout.');
if (!desktopEvaluation.practical_evaluation.open) throw new Error('Responsive evaluation button hit target did not open the modal.');
if (mobilePotometerState.practical !== 'Bubble potometer' || mobilePotometerState.right_sidebar_layout.overflow_vertical_space_px !== 0 || !mobilePotometerState.right_sidebar_layout.all_sidebar_components_visible) throw new Error('Long potometer Method text overflows short landscape.');
if (denseState.practical !== 'Flame tests' || denseState.right_sidebar_layout.overflow_vertical_space_px !== 0 || !denseState.right_sidebar_layout.all_sidebar_components_visible) throw new Error('Five-reactant Flame Tests sidebar overflows standard desktop.');
if (!desktopState.renderer.enabled || !mobileState.renderer.enabled) throw new Error('WebGL renderer was not enabled.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
