import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'output/respiration-qa';
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chromeExecutable,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist'
  ]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const browserErrors = [];
const checkpoints = {};
page.on('console', message => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
});
page.on('pageerror', error => browserErrors.push(`page: ${error.message}`));

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const clickPrimary = async () => {
  await page.mouse.click(377, 837);
  await page.waitForTimeout(80);
};
const capture = async (name, project = value => value) => {
  await page.waitForTimeout(420);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const snapshot = await state();
  checkpoints[name] = project(snapshot);
  return snapshot;
};

let summary = null;
try {
  await page.goto(`http://127.0.0.1:4174/?respiration-qa=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await page.evaluate(() => { window.__manualSimulationTime = true; });

  // Biology tab, then the fourth Biology practical card.
  await page.mouse.click(320, 32);
  await page.mouse.click(135, 289);
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(window.render_game_to_text());
    return snapshot.id === 'respiration' && snapshot.renderer?.enabled;
  });

  const initial = await capture('01-five-baths-ready', snapshot => ({
    id: snapshot.id,
    renderer: snapshot.renderer,
    practical: snapshot.practical,
    stage: snapshot.anaerobic_respiration_practical?.stage,
    temperatures_c: snapshot.anaerobic_respiration_practical?.temperatures_c,
    apparatus: snapshot.anaerobic_respiration_practical?.apparatus
  }));

  await clickPrimary();
  await advance(2100);
  const glucoseMid = await capture('02-equal-glucose-transfer', snapshot => ({
    stage: snapshot.anaerobic_respiration_practical?.stage,
    animation: snapshot.anaerobic_respiration_practical?.animation,
    guidance: snapshot.guidance
  }));
  await advance(1900);
  const glucoseDone = await state();

  await clickPrimary();
  await advance(2550);
  const yeastMid = await capture('03-equal-yeast-transfer', snapshot => ({
    stage: snapshot.anaerobic_respiration_practical?.stage,
    animation: snapshot.anaerobic_respiration_practical?.animation,
    guidance: snapshot.guidance
  }));
  await advance(2250);
  const yeastDone = await state();

  await clickPrimary();
  await advance(2720);
  const balloonsMid = await capture('04-balloons-fitting', snapshot => ({
    stage: snapshot.anaerobic_respiration_practical?.stage,
    animation: snapshot.anaerobic_respiration_practical?.animation,
    flasks: snapshot.anaerobic_respiration_practical?.flasks
  }));
  await advance(2250);
  const balloonsDone = await capture('05-identical-balloons-fitted', snapshot => ({
    stage: snapshot.anaerobic_respiration_practical?.stage,
    flasks: snapshot.anaerobic_respiration_practical?.flasks
  }));

  await clickPrimary();
  await advance(3700);
  const incubationMid = await capture('06-midpoint-balloon-inflation', snapshot => ({
    stage: snapshot.anaerobic_respiration_practical?.stage,
    elapsed_minutes: snapshot.anaerobic_respiration_practical?.elapsed_minutes,
    flasks: snapshot.anaerobic_respiration_practical?.flasks,
    animation: snapshot.anaerobic_respiration_practical?.animation
  }));
  await advance(3700);
  const incubationDone = await capture('07-final-balloon-comparison', snapshot => ({
    stage: snapshot.anaerobic_respiration_practical?.stage,
    elapsed_minutes: snapshot.anaerobic_respiration_practical?.elapsed_minutes,
    flasks: snapshot.anaerobic_respiration_practical?.flasks
  }));

  await clickPrimary();
  const recorded = await capture('08-recorded-results-and-graph', snapshot => ({
    stage: snapshot.anaerobic_respiration_practical?.stage,
    complete: snapshot.complete,
    tab: snapshot.tab,
    graph_axes: snapshot.graph_axes,
    results: snapshot.anaerobic_respiration_practical?.results,
    conclusion: snapshot.anaerobic_respiration_practical?.conclusion,
    evaluation_ready: snapshot.practical_evaluation?.ready
  }));

  const labelAudit = await page.evaluate(() => window.__buttonLabelAudit || []);
  await page.mouse.click(532, 837);
  await page.waitForTimeout(250);
  const reset = await capture('09-reset-five-baths-ready', snapshot => ({
    stage: snapshot.anaerobic_respiration_practical?.stage,
    complete: snapshot.complete,
    result_count: snapshot.anaerobic_respiration_practical?.results?.length,
    tab: snapshot.tab
  }));

  assert(initial.renderer.enabled, 'WebGL renderer is not enabled.');
  assert(JSON.stringify(initial.anaerobic_respiration_practical?.temperatures_c) === JSON.stringify([10, 20, 30, 40, 60]), 'Temperature series is incorrect.');
  assert(glucoseMid.anaerobic_respiration_practical.stage === 1 && glucoseDone.anaerobic_respiration_practical.stage === 2, 'Glucose transfer did not complete correctly.');
  assert(yeastMid.anaerobic_respiration_practical.stage === 3 && yeastDone.anaerobic_respiration_practical.stage === 4, 'Yeast transfer did not complete correctly.');
  assert(balloonsMid.anaerobic_respiration_practical.stage === 5 && balloonsDone.anaerobic_respiration_practical.stage === 6, 'Balloon-fitting sequence did not complete correctly.');
  assert(balloonsDone.anaerobic_respiration_practical.flasks.every(flask => flask.balloon_fitted), 'Not all balloons are fitted.');
  assert(incubationMid.anaerobic_respiration_practical.stage === 7 && incubationMid.anaerobic_respiration_practical.elapsed_minutes > 4.9 && incubationMid.anaerobic_respiration_practical.elapsed_minutes < 5.3, 'Midpoint incubation timing is incorrect.');
  assert(incubationDone.anaerobic_respiration_practical.stage === 8 && incubationDone.anaerobic_respiration_practical.elapsed_minutes === 10, 'Equal-time incubation did not end at ten minutes.');
  assert(recorded.complete && recorded.tab === 'graph' && recorded.practical_evaluation.ready, 'Completion, graph, or evaluation state failed.');
  const recordedVolumes = recorded.anaerobic_respiration_practical.results.map(result => result.carbon_dioxide_cm3);
  assert(JSON.stringify(recordedVolumes) === JSON.stringify([6, 22, 51, 78, 4]), `Unexpected carbon dioxide results: ${recordedVolumes.join(', ')}`);
  assert(recorded.anaerobic_respiration_practical.results.every(result => result.time_minutes === 10), 'The results do not use one equal time period.');
  assert(labelAudit.length > 0 && labelAudit.every(item => item.fits), 'One or more control labels do not fit their buttons.');
  assert(reset.anaerobic_respiration_practical.stage === 0 && !reset.complete && reset.anaerobic_respiration_practical.results.length === 0 && reset.tab === 'bench', 'Reset did not restore a clean practical.');
  assert(browserErrors.length === 0, browserErrors.join('\n'));

  summary = {
    browser_errors: browserErrors,
    checkpoints,
    button_labels_fit: labelAudit.every(item => item.fits),
    final_volumes_cm3: recordedVolumes,
    reset_ok: true
  };
  fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
