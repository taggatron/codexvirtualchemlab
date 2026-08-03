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
const subjects = [
  { id: 'chemistry', tabX: 206, count: 14 },
  { id: 'biology', tabX: 320, count: 7 },
  { id: 'physics', tabX: 434, count: 11 }
];

async function scan(viewport, mobile) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') errors.push(`${viewport.width}×${viewport.height} console: ${message.text()}`); });
  page.on('pageerror', error => errors.push(`${viewport.width}×${viewport.height} page: ${error.message}`));
  await page.goto(`http://127.0.0.1:4173/?all-sidebars=${viewport.width}-${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const results = [];
  for (const subject of subjects) {
    let current = await state(), scale = current.responsive_layout.scale;
    await page.mouse.click(subject.tabX * scale, 32 * scale);
    await page.waitForTimeout(80);
    current = await state(); scale = current.responsive_layout.scale;
    const logicalH = current.responsive_layout.logical_canvas_px.height, gap = Math.min(54, (logicalH - 122) / subject.count), cardH = Math.max(42, gap - 5);
    for (let index = 0; index < subject.count; index++) {
      await page.mouse.click(135 * scale, (103 + index * gap + cardH / 2) * scale);
      await page.waitForTimeout(65);
      const snapshot = await state(), layout = snapshot.right_sidebar_layout;
      results.push({ subject: subject.id, practical: snapshot.practical, overflow: layout.overflow_vertical_space_px, unused: layout.unused_vertical_space_px, all_visible: layout.all_sidebar_components_visible, drag_enabled: snapshot.reactant_interaction.drag_enabled });
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
if (desktop.length !== 32 || compact.length !== 32) throw new Error('Not every practical was checked.');
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ desktop_practicals: desktop.length, compact_practicals: compact.length, errors }, null, 2));
await browser.close();
