import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/responsive-qa';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

await page.goto(`http://127.0.0.1:4173/?responsive-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const portrait = await state();
const portraitUi = await page.evaluate(() => {
  const prompt = document.querySelector('#orientation-prompt');
  const card = document.querySelector('.orientation-card');
  return {
    body_locked: document.body.classList.contains('portrait-locked'),
    prompt_display: getComputedStyle(prompt).display,
    prompt_bounds: prompt.getBoundingClientRect().toJSON(),
    card_bounds: card.getBoundingClientRect().toJSON(),
    heading: card.querySelector('h1')?.textContent
  };
});
await page.screenshot({ path: `${out}/01-phone-portrait-prompt.png`, fullPage: true });

await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(250);
await page.waitForFunction(() => !document.body.classList.contains('portrait-locked'));

// Select Physics, then Newton's 2nd Law using physical coordinates mapped from the scaled logical layout.
const compactBefore = await state();
const scale = compactBefore.responsive_layout.scale;
await page.mouse.click(430 * scale, 32 * scale);
await page.waitForTimeout(160);
await page.mouse.click(135 * scale, 127 * scale);
await page.waitForTimeout(350);
const landscapeInitial = await state();
await page.screenshot({ path: `${out}/02-phone-landscape-newton.png`, fullPage: true });

// Exercise one scaled canvas control and verify it changes state.
const plusX = landscapeInitial.newton2.control_layout.plus_x_px;
const footerY = landscapeInitial.responsive_layout.logical_canvas_px.height - 63;
await page.mouse.click((plusX + landscapeInitial.newton2.control_layout.force_button_width_px / 2) * scale, footerY * scale);
await page.waitForTimeout(120);
const landscapeAfterControl = await state();

const landscapeUi = await page.evaluate(() => {
  const lab = document.querySelector('#lab').getBoundingClientRect();
  const webgl = document.querySelector('#webgl').getBoundingClientRect();
  return {
    body_locked: document.body.classList.contains('portrait-locked'),
    prompt_display: getComputedStyle(document.querySelector('#orientation-prompt')).display,
    lab_bounds: lab.toJSON(),
    webgl_bounds: webgl.toJSON()
  };
});
await page.screenshot({ path: `${out}/03-phone-landscape-control.png`, fullPage: true });

await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(250);
const desktop = await state();
await page.screenshot({ path: `${out}/04-desktop-regression.png`, fullPage: true });

const summary = {
  errors,
  portrait: { responsive: portrait.responsive_layout, ui: portraitUi },
  landscape_initial: {
    responsive: landscapeInitial.responsive_layout,
    practical: landscapeInitial.practical,
    renderer: landscapeInitial.renderer,
    force_n: landscapeInitial.newton2?.accelerating_force_n,
    ui: landscapeUi
  },
  landscape_after_control: {
    force_n: landscapeAfterControl.newton2?.accelerating_force_n
  },
  desktop: {
    responsive: desktop.responsive_layout,
    practical: desktop.practical,
    renderer: desktop.renderer
  }
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!portraitUi.body_locked || portraitUi.prompt_display !== 'flex') throw new Error('Portrait rotation prompt is not visible.');
if (portraitUi.heading !== 'Rotate to landscape') throw new Error('Portrait prompt heading is missing.');
if (portrait.responsive_layout.mode !== 'portrait rotation prompt') throw new Error('Portrait responsive state is incorrect.');
if (landscapeUi.body_locked || landscapeUi.prompt_display !== 'none') throw new Error('Portrait prompt remained visible in landscape.');
if (landscapeInitial.responsive_layout.mode !== 'compact landscape') throw new Error('Landscape did not enter compact mode.');
if (!landscapeInitial.responsive_layout.three_column_layout_preserved) throw new Error('Landscape columns are not preserved.');
if (!landscapeInitial.renderer.enabled || landscapeInitial.renderer.legacy_2d_apparatus) throw new Error('WebGL renderer is not enabled in landscape.');
if (!landscapeInitial.practical.includes('Newton')) throw new Error('Scaled practical selection failed.');
if (landscapeAfterControl.newton2.accelerating_force_n !== 0.3) throw new Error('Scaled footer interaction failed.');
if (Math.abs(landscapeUi.lab_bounds.width - 844) > 1 || Math.abs(landscapeUi.lab_bounds.height - 390) > 1) throw new Error('2D canvas does not fill the phone viewport.');
if (landscapeUi.webgl_bounds.width <= 0 || landscapeUi.webgl_bounds.height <= 0) throw new Error('WebGL viewport collapsed in landscape.');
if (desktop.responsive_layout.mode !== 'desktop' || desktop.responsive_layout.scale !== 1) throw new Error('Desktop layout changed scale.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
