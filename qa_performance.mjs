import { chromium } from 'playwright';

const baseUrl = process.env.LAB_URL || 'http://127.0.0.1:4173';
const chromeExecutable = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: chromeExecutable,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
await page.addInitScript(() => {
  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  window.__qaAnimationFrames = 0;
  window.requestAnimationFrame = callback => nativeRequestAnimationFrame(timestamp => {
    window.__qaAnimationFrames++;
    callback(timestamp);
  });
});

await page.goto(`${baseUrl}/?performance-qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
const interfaceReadyMs = await page.evaluate(() => performance.now());
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).renderer.enabled === true, null, { timeout: 20000 });
await page.waitForTimeout(500);

const countFrames = async durationMs => {
  const before = await page.evaluate(() => window.__qaAnimationFrames);
  await page.waitForTimeout(durationMs);
  return (await page.evaluate(() => window.__qaAnimationFrames)) - before;
};
const freeIdleFrames = await countFrames(800);

await page.mouse.click(135, 180);
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).id === 'rates');
await page.waitForFunction(() => {
  const state = JSON.parse(window.render_game_to_text());
  return !state.running && !state.renderer.scene_compiling && state.renderer.scene_warmup_frames === 0;
});
await page.waitForTimeout(150);
const practicalIdleFrames = await countFrames(800);

await page.mouse.click(375, 837);
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).running === true);
const activeMode = await page.evaluate(() => window.__labPerformance.frameMode());
const activeFrames = await countFrames(600);
await page.evaluate(() => window.advanceTime(2200));
const completedTimedStep = await page.evaluate(() => !JSON.parse(window.render_game_to_text()).running);
await page.waitForTimeout(500);
const settledFrames = await countFrames(800);

const resources = await page.evaluate(() => performance.getEntriesByType('resource')
  .filter(entry => /\/(app|lab3d|three\.module|thermalview)\.js/.test(entry.name))
  .map(entry => ({ name: new URL(entry.name).pathname, start_ms: +entry.startTime.toFixed(1), duration_ms: +entry.duration.toFixed(1), encoded_bytes: entry.encodedBodySize })));
const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
const result = { interface_ready_ms: +interfaceReadyMs.toFixed(1), free_idle_frames_800ms: freeIdleFrames, practical_idle_frames_800ms: practicalIdleFrames, active_mode: activeMode, active_frames_600ms: activeFrames, timed_step_completed: completedTimedStep, settled_frames_800ms: settledFrames, resources, renderer: state.renderer, errors };

if (freeIdleFrames > 3 || practicalIdleFrames > 3 || settledFrames > 3) throw new Error(`Idle scheduler continued rendering: ${JSON.stringify(result)}`);
if (activeMode !== 'active' || activeFrames < 1) throw new Error(`Active practical did not request continuous animation: ${JSON.stringify(result)}`);
if (!completedTimedStep) throw new Error(`Timed practical step did not complete: ${JSON.stringify(result)}`);
if (!state.renderer.enabled || state.renderer.context_lost) throw new Error(`WebGL renderer is unhealthy: ${JSON.stringify(result)}`);
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(result, null, 2));
await browser.close();
