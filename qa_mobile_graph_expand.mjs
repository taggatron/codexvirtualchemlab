import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/mobile-graph-expand-qa';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const watchErrors = page => {
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
};
const readState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const selectLipaseGraph = async page => {
  let current = await readState(page);
  const scale = current.responsive_layout.scale;
  await page.mouse.click(320 * scale, 32 * scale);
  await page.waitForTimeout(140);
  await page.mouse.click(135 * scale, 181 * scale);
  await page.waitForTimeout(260);
  current = await readState(page);
  const logicalWidth = current.responsive_layout.logical_canvas_px.width;
  const rightWidth = Math.max(260, Math.min(330, logicalWidth * .23));
  const rightX = logicalWidth - rightWidth;
  await page.mouse.click((rightX + 161) * scale, 98 * scale);
  await page.waitForTimeout(180);
  return readState(page);
};

const mobileContext = await browser.newContext({
  viewport: { width: 1206, height: 584 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true
});
const mobilePage = await mobileContext.newPage();
watchErrors(mobilePage);
await mobilePage.goto(`http://127.0.0.1:4173/?mobile-graph-expand=${Date.now()}`, { waitUntil: 'networkidle' });
await mobilePage.waitForFunction(() => typeof window.render_game_to_text === 'function');
const mobileTab = await selectLipaseGraph(mobilePage);
await mobilePage.screenshot({ path: `${out}/01-mobile-lipase-graph-icon-row.png`, fullPage: true });

const mobileScale = mobileTab.responsive_layout.scale;
const mobileLogicalWidth = mobileTab.responsive_layout.logical_canvas_px.width;
await mobilePage.mouse.click((mobileLogicalWidth - 34) * mobileScale, 98 * mobileScale);
await mobilePage.waitForTimeout(180);
const mobileModal = await readState(mobilePage);
await mobilePage.screenshot({ path: `${out}/02-mobile-expanded-modal.png`, fullPage: true });
await mobilePage.keyboard.press('Escape');

const desktopContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1
});
const desktopPage = await desktopContext.newPage();
watchErrors(desktopPage);
await desktopPage.goto(`http://127.0.0.1:4173/?desktop-graph-expand=${Date.now()}`, { waitUntil: 'networkidle' });
await desktopPage.waitForFunction(() => typeof window.render_game_to_text === 'function');
const desktopTab = await selectLipaseGraph(desktopPage);
await desktopPage.screenshot({ path: `${out}/03-desktop-labelled-expand.png`, fullPage: true });

const summary = {
  errors,
  mobile: {
    responsive: mobileTab.responsive_layout,
    graph_modal: mobileTab.graph_modal,
    modal_open_after_icon_tap: mobileModal.graph_modal.open,
    renderer: mobileTab.renderer
  },
  desktop: {
    responsive: desktopTab.responsive_layout,
    graph_modal: desktopTab.graph_modal,
    renderer: desktopTab.renderer
  }
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!mobileTab.renderer.enabled || mobileTab.renderer.legacy_2d_apparatus) throw new Error('Mobile WebGL renderer was not enabled.');
if (!mobileTab.responsive_layout.mobile_landscape_layout) throw new Error('Mobile landscape layout was not detected.');
if (!mobileTab.graph_modal.button_visible) throw new Error('Mobile graph expand control is not visible.');
if (mobileTab.graph_modal.button_text_visible || mobileTab.graph_modal.button_label !== null) throw new Error('Mobile expand control still contains text.');
if (mobileTab.graph_modal.button_icon !== 'four-corner expand') throw new Error('Mobile expand icon is missing.');
if (mobileTab.graph_modal.button_row !== 'method and graph tabs' || !mobileTab.graph_modal.sidebar_header_layout.tabs_and_expand_same_row) throw new Error('Mobile expand control is not in the tab row.');
if (!mobileModal.graph_modal.open) throw new Error('Mobile expand icon did not open the graph modal.');
if (desktopTab.responsive_layout.mobile_landscape_layout) throw new Error('Desktop was incorrectly classified as mobile.');
if (desktopTab.graph_modal.button_label !== 'EXPAND' || !desktopTab.graph_modal.button_text_visible) throw new Error('Desktop labelled expand control regressed.');
if (desktopTab.graph_modal.button_row !== 'graph heading') throw new Error('Desktop expand control moved out of its existing row.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
