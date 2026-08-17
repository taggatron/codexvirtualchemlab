import { chromium } from './qa_playwright_shim.mjs';
import fs from 'node:fs';

const out = 'output/latent-heat-responsive-qa';
const baseUrl = process.env.LAB_URL || 'http://127.0.0.1:4173';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

async function scan(viewport, label, mobile = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`) });
  page.on('pageerror', error => errors.push(`${label} page: ${error.message}`));
  await page.goto(`${baseUrl}/?latent-responsive=${label}-${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  let current = await state(), scale = current.responsive_layout.scale;
  await page.mouse.click(434 * scale, 32 * scale);
  await page.waitForTimeout(100);

  async function selectIndex(index) {
    current = await state();
    scale = current.responsive_layout.scale;
    const top = 101, gap = 54, cardHeight = 49, bottom = current.responsive_layout.logical_canvas_px.height - 32;
    let centreY = top + index * gap + cardHeight / 2 - current.left_practical_sidebar.scroll_offset_px;
    if (centreY < top + cardHeight / 2 || centreY > bottom - cardHeight / 2) {
      const targetOffset = Math.max(0, Math.min(current.left_practical_sidebar.maximum_scroll_offset_px, top + index * gap + cardHeight / 2 - (top + bottom) / 2));
      await page.mouse.move(135 * scale, ((top + bottom) / 2) * scale);
      await page.mouse.wheel(0, (targetOffset - current.left_practical_sidebar.scroll_offset_px) * scale);
      await page.waitForTimeout(100);
      current = await state();
      centreY = top + index * gap + cardHeight / 2 - current.left_practical_sidebar.scroll_offset_px;
    }
    await page.mouse.click(135 * current.responsive_layout.scale, centreY * current.responsive_layout.scale);
    await page.waitForTimeout(360);
    return state();
  }

  const neighbouring = [];
  for (const [index, pattern] of [[8, /specific heat/i], [9, /heating\s*(?:&|and)\s*cooling/i], [10, /resistance of a wire/i], [11, /ohmic.*non-ohmic/i], [12, /magnetic field/i], [13, /nuclear radiation/i]]) {
    const snapshot = await selectIndex(index);
    if (!pattern.test(snapshot.practical || '')) throw new Error(`${label}: Physics index ${index} selected ${snapshot.practical}.`);
    if (!snapshot.renderer.enabled || snapshot.renderer.context_lost || snapshot.renderer.legacy_2d_apparatus) throw new Error(`${label}: ${snapshot.practical} did not retain a healthy WebGL scene.`);
    if (!snapshot.control_label_layout?.all_visible_button_labels_fit) throw new Error(`${label}: ${snapshot.practical} has a control label outside its button.`);
    neighbouring.push(snapshot.practical);
  }

  const latent = await selectIndex(9), layout = latent.right_sidebar_layout;
  if (!latent.latent_heat_practical || latent.latent_heat_practical.sample_label !== 'PARAFFIN WAX') throw new Error(`${label}: latent-heat structured state is missing.`);
  if (layout.overflow_vertical_space_px !== 0 || !layout.all_sidebar_components_visible || !layout.all_method_stage_text_visible || !layout.all_reactant_text_visible || !layout.all_apparatus_text_visible) throw new Error(`${label}: latent-heat sidebar content overflows.`);
  await page.screenshot({ path: `${out}/${label}.png`, fullPage: true });
  const result = { responsive: latent.responsive_layout, sidebar: layout, control_labels: latent.control_label_layout, neighbouring };
  await context.close();
  return result;
}

const desktop = await scan({ width: 1440, height: 900 }, 'desktop');
const compact = await scan({ width: 1206, height: 584 }, 'compact', true);
if (errors.length) throw new Error(errors.join('\n'));
const summary = { errors, desktop, compact };
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ errors, desktop: desktop.neighbouring, compact: compact.neighbouring, compact_overflow_px: compact.sidebar.overflow_vertical_space_px }, null, 2));
await browser.close();
