import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/graph-modal-qa';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));

await page.goto(`http://127.0.0.1:4173/?graph-modal-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const capture = async name => {
  await page.waitForTimeout(160);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};
const click = async (x, y, wait = 120) => {
  await page.mouse.click(x, y);
  await page.waitForTimeout(wait);
};
const advance = ms => page.evaluate(duration => window.advanceTime(duration), ms);

// Generic line graph with a completed Newton run.
await click(435, 32);
await click(135, 128);
await click(560, 657);
await advance(3600);
await click(1150, 98);
const newtonTab = await capture('01-newton-graph-tab');
await click(1221, 134);
const newtonModal = await capture('02-newton-expanded');
await click(1130, 57);
const newtonClosed = await state();

// Rates custom temperature-repeat bar chart with one recorded result.
await click(206, 32);
await click(135, 167);
await click(379, 657);
await advance(2200);
await click(379, 657);
await advance(10000);
await click(1114, 98);
const ratesTab = await capture('03-rates-graph-tab');
await click(1221, 134);
const ratesModal = await capture('04-rates-expanded');
await click(1130, 57);

// Lipase custom bar chart with one completed temperature trial.
await click(320, 32);
await click(135, 182);
await click(383, 657);
await advance(8000);
await click(1150, 98);
const lipaseTab = await capture('05-lipase-graph-tab');
await click(1221, 134);
const lipaseModal = await capture('06-lipase-expanded');
await page.keyboard.press('Escape');
const lipaseClosed = await state();

// A results table must not acquire a graph-only expand control.
await click(206, 32);
await click(135, 253);
await click(1150, 98);
const titrationResults = await capture('07-titration-results-no-expand');

const summary = {
  errors,
  renderer: newtonModal.renderer,
  newton: {
    readings: newtonModal.graph_readings,
    tab_button_visible: newtonTab.graph_modal.button_visible,
    modal: newtonModal.graph_modal,
    closed_by_button: !newtonClosed.graph_modal.open
  },
  rates: {
    readings: ratesModal.graph_readings,
    tab_button_visible: ratesTab.graph_modal.button_visible,
    modal: ratesModal.graph_modal
  },
  lipase: {
    readings: lipaseModal.graph_readings,
    tab_button_visible: lipaseTab.graph_modal.button_visible,
    modal: lipaseModal.graph_modal,
    closed_by_escape: !lipaseClosed.graph_modal.open
  },
  table_exclusion: titrationResults.graph_modal
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

if (!newtonModal.renderer.enabled || newtonModal.renderer.legacy_2d_apparatus) throw new Error('WebGL renderer was not enabled.');
if (!newtonTab.graph_modal.button_visible || !newtonModal.graph_modal.open || newtonModal.graph_modal.chart_kind !== 'line-graph') throw new Error('Generic graph modal failed.');
if (newtonModal.graph_readings !== 1 || !newtonClosed.graph_modal.open === false) throw new Error('Newton result or close-button flow failed.');
if (!ratesTab.graph_modal.button_visible || !ratesModal.graph_modal.open || ratesModal.graph_modal.chart_kind !== 'temperature-bar-chart' || ratesModal.graph_readings !== 1) throw new Error('Rates bar-chart modal failed.');
if (!lipaseTab.graph_modal.button_visible || !lipaseModal.graph_modal.open || lipaseModal.graph_modal.chart_kind !== 'lipase-bar-chart' || lipaseModal.graph_readings !== 1) throw new Error('Lipase bar-chart modal failed.');
if (lipaseClosed.graph_modal.open) throw new Error('Escape did not close the graph modal.');
if (titrationResults.graph_modal.available || titrationResults.graph_modal.button_visible) throw new Error('A results table received a graph-only expand control.');
if (errors.length) throw new Error(errors.join('\n'));

console.log(JSON.stringify(summary, null, 2));
await browser.close();
