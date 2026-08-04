import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/pondweed-focus-qa';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1575, height: 1024 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

await page.goto(`http://127.0.0.1:4173/?pondweed-focus=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

// 1. Switch to Biology -> Pondweed
await page.mouse.click(320, 32);
await page.mouse.click(135, 344);
await page.waitForTimeout(300);

const getState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));

// Capture initial view with upright ruler
await page.screenshot({ path: `${out}/01-pondweed-upright-ruler.png`, fullPage: true });

// 2. Toggle Focus Mode (click header focus mode button at X=1110, Y=32)
await page.mouse.click(1110, 32);
await page.waitForTimeout(250);
const focusState = getState();
await page.screenshot({ path: `${out}/02-focus-mode-active.png`, fullPage: true });

// 3. Toggle Method Dropdown (top left Method button at X=172, Y=30)
await page.mouse.click(172, 30);
await page.waitForTimeout(250);
const methodState = getState();
await page.screenshot({ path: `${out}/03-method-dropdown-open.png`, fullPage: true });

// Close Method Dropdown
await page.mouse.click(172, 30);
await page.waitForTimeout(200);

// 4. Open Graph Modal (top left Graph button at X=64, Y=30)
await page.mouse.click(64, 30);
await page.waitForTimeout(250);
const graphModalState = getState();
await page.screenshot({ path: `${out}/04-graph-modal-open.png`, fullPage: true });

// Close Graph Modal
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// 5. Open Evaluation Modal (top left Evaluation button at X=292, Y=30)
await page.mouse.click(292, 30);
await page.waitForTimeout(250);
const evalState = getState();
await page.screenshot({ path: `${out}/05-evaluation-modal-open.png`, fullPage: true });

// Close Evaluation Modal
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// 6. Exit Focus Mode (top right Exit Focus button at X=1204, Y=30)
await page.mouse.click(1204, 30);
await page.waitForTimeout(250);
const exitedState = getState();
await page.screenshot({ path: `${out}/06-focus-mode-exited.png`, fullPage: true });

const summary = {
  errors,
  focus_mode_entered: focusState.focus_mode === true,
  method_dropdown_open: methodState.method_dropdown === true,
  graph_modal_open: graphModalState.graph_modal?.open === true,
  evaluation_modal_open: evalState.evaluation_modal?.open === true,
  focus_mode_exited: exitedState.focus_mode === false
};

fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log('Focus Mode QA Result:', JSON.stringify(summary, null, 2));

if (errors.length) throw new Error(errors.join('\n'));
await browser.close();
