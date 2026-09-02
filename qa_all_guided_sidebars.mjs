import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/all-guided-sidebars-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const errors = [];
const baseUrl = process.env.LAB_URL || 'http://127.0.0.1:4173';
const subjects = [
  { id: 'chemistry', tabX: 206, count: 15 },
  { id: 'biology', tabX: 320, count: 16 },
  { id: 'physics', tabX: 434, count: 14 }
];

async function scan(viewport, mobile) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') errors.push(`${viewport.width}×${viewport.height} console: ${message.text()}`); });
  page.on('pageerror', error => errors.push(`${viewport.width}×${viewport.height} page: ${error.message}`));
  await page.goto(`${baseUrl}/?all-sidebars=${viewport.width}-${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const selectPractical = async index => {
    let current = await state();
    const scale = current.responsive_layout.scale, top = 101, gap = 54, cardHeight = 49, bottom = current.responsive_layout.logical_canvas_px.height - 32;
    const sidebar = current.left_practical_sidebar;
    let centreY = top + index * gap + cardHeight / 2 - sidebar.scroll_offset_px;
    if (centreY < top + cardHeight / 2 || centreY > bottom - cardHeight / 2) {
      const targetOffset = Math.max(0, Math.min(sidebar.maximum_scroll_offset_px, top + index * gap + cardHeight / 2 - (top + bottom) / 2));
      await page.mouse.move(135 * scale, ((top + bottom) / 2) * scale);
      await page.mouse.wheel(0, (targetOffset - sidebar.scroll_offset_px) * scale);
      await page.waitForTimeout(80);
      await page.evaluate(() => window.advanceTime(0));
      current = await state();
      centreY = top + index * gap + cardHeight / 2 - current.left_practical_sidebar.scroll_offset_px;
    }
    await page.mouse.click(135 * current.responsive_layout.scale, centreY * current.responsive_layout.scale);
    await page.waitForTimeout(65);
    return state();
  };
  const results = [];
  for (const subject of subjects) {
    let current = await state(), scale = current.responsive_layout.scale;
    await page.mouse.click(subject.tabX * scale, 32 * scale);
    await page.waitForTimeout(80);
    for (let index = 0; index < subject.count; index++) {
      const snapshot = await selectPractical(index), layout = snapshot.right_sidebar_layout;
      const controlLabels = snapshot.control_label_layout;
      results.push({ subject: subject.id, practical: snapshot.practical, overflow: layout.overflow_vertical_space_px, unused: layout.unused_vertical_space_px, all_visible: layout.all_sidebar_components_visible, control_labels_fit: controlLabels?.all_visible_button_labels_fit, wrapped_controls: controlLabels?.wrapped_button_labels?.map(item => item.label) || [], drag_enabled: snapshot.reactant_interaction.drag_enabled });
      if (!controlLabels?.all_visible_button_labels_fit || !controlLabels.visible_button_count) throw new Error(`${viewport.width}×${viewport.height}: ${snapshot.practical} has a control label outside its button.`);
      if (snapshot.practical === 'Free workspace') {
        if (!snapshot.reactant_interaction.drag_enabled || !snapshot.reactant_interaction.preserved_for_chemistry_free_workspace) throw new Error(`${viewport.width}×${viewport.height}: Free Workspace reactant setup was not preserved.`);
        continue;
      }
      if (layout.overflow_vertical_space_px !== 0 || !layout.all_sidebar_components_visible || !layout.all_method_stage_text_visible || !layout.all_reactant_text_visible || !layout.all_apparatus_text_visible) throw new Error(`${viewport.width}×${viewport.height}: ${snapshot.practical} sidebar text or components overflow.`);
      if (snapshot.reactant_interaction.drag_enabled) throw new Error(`${viewport.width}×${viewport.height}: ${snapshot.practical} still enables guided reactant dragging.`);
    }
  }
  await context.close();
  return results;
}

const desktop = await scan({ width: 1440, height: 900 }, false);
const compact = await scan({ width: 1206, height: 584 }, true);
const summary = { desktop, compact, errors };
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
if (desktop.length !== 45 || compact.length !== 45) throw new Error('Not every practical was checked.');
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ desktop_practicals: desktop.length, compact_practicals: compact.length, errors }, null, 2));
await browser.close();
