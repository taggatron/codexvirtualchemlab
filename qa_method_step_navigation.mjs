import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173';
const outputDir = 'output/method-step-navigation-qa';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
const page = await context.newPage();
const errors = [];
await page.route('**/lab3d.js*', route => route.fulfill({
  contentType: 'text/javascript',
  body: `export class LabRenderer3D {
    constructor(canvas) { this.canvas = canvas; this.available = false; this.signature = ''; }
    resize() {} render() {} projectToScreen() { return null; } posFromScreen() { return null; }
    advanceBunsenLoad() { return false; } bunsenLoadState() { return null; }
    get info() { return { enabled: false, renderer: 'UI interaction test stub', objects: 0, context_lost: false, scene_compiling: false, scene_warmup_frames: 0, canvas_visible: false }; }
    get isTransitioning() { return false; } get bunsenTransitionActive() { return false; }
    get thermiteGlowFraction() { return 0; } get osmosisRotationState() { return null; }
    get pourAlignment() { return null; } get antibioticPreparationState() { return null; }
    get antibioticSwabTipState() { return null; }
  }`
}));
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const canvasPoint = async (x, y, touch = false) => {
  const box = await page.locator('#lab').boundingBox();
  if (!box) throw new Error('Main lab canvas is unavailable');
  const px = box.x + x * box.width / 1280, py = box.y + y * box.height / 720;
  if (touch) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
  await page.waitForTimeout(120);
};
const assert = (condition, message) => { if (!condition) throw new Error(message) };

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await canvasPoint(135, 180);
  assert((await state()).id === 'rates', 'Rates practical did not open');

  const sidebarSteps = [154, 205, 257, 309];
  const expectedStages = [0, 1, 3, 4];
  for (let index = 0; index < sidebarSteps.length; index++) {
    await canvasPoint(1128, sidebarSteps[index]);
    const snapshot = await state();
    assert(snapshot.method_navigation.active_step_index === index, `Sidebar step ${index + 1} did not become active`);
    assert(snapshot.method_navigation.selected_by_user, `Sidebar step ${index + 1} was not recorded as a direct selection`);
    assert(snapshot.method_navigation.visible_hit_targets.length === 4, 'Sidebar did not expose four method hit targets');
    assert(snapshot.rates_practical.stage === expectedStages[index], `Sidebar step ${index + 1} sought rates stage ${snapshot.rates_practical.stage}, expected ${expectedStages[index]}`);
  }
  await page.screenshot({ path: `${outputDir}/01-sidebar-step-4.png`, fullPage: true });

  await canvasPoint(1115, 31);
  assert((await state()).focus_mode, 'Focus mode did not open');
  await canvasPoint(172, 31);
  assert((await state()).method_dropdown, 'Focus-mode method dropdown did not open');

  const dropdownSteps = [118, 154, 190, 226];
  for (let index = 0; index < dropdownSteps.length; index++) {
    await canvasPoint(260, dropdownSteps[index]);
    const snapshot = await state();
    assert(snapshot.method_navigation.active_step_index === index, `Focus dropdown step ${index + 1} did not become active`);
    assert(snapshot.method_navigation.visible_hit_targets.length === 4, 'Focus dropdown did not expose four method hit targets');
    assert(snapshot.rates_practical.stage === expectedStages[index], `Focus dropdown step ${index + 1} sought the wrong rates stage`);
  }
  await canvasPoint(260, dropdownSteps[2], true);
  assert((await state()).method_navigation.active_step_index === 2, 'Touch press did not select Focus dropdown step 3');
  await canvasPoint(260, dropdownSteps[3]);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outputDir}/02-focus-dropdown-step-4.png`, fullPage: true });
  const summary = { passed: true, sidebar_steps_checked: 4, focus_dropdown_steps_checked: 4, touch_selections_checked: 1, hit_target_layouts_checked: 2, errors };
  await writeFile(`${outputDir}/summary.json`, JSON.stringify(summary, null, 2));
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify(summary));
} finally {
  await browser.close();
}
