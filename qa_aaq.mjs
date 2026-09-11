import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { AAQ_PRACTICALS } from './aaq-catalog.js';
import { calculateAAQResult } from './aaq-models.js';

// Standalone regression run:
// node --experimental-loader ./qa_playwright_loader.mjs qa_aaq.mjs
const out = 'output/playwright/aaq';
const navigationOnly = process.argv.includes('--navigation');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
const errors = [];
const report = { practicals: [], checks: [], screenshots: [], errors };
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => errors.push(`page: ${error.message}`));
const state = () => page.evaluate(() => window.__aaq.getState());
const screenshot = async name => {
  const path = `${out}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  report.screenshots.push(path);
};
const setParameter = async value => {
  await page.locator('#aaq-parameter').evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  assert.equal((await state()).parameter, Number(value), 'Parameter control updates simulation state');
};
const runTrial = async () => {
  const prior = await state();
  let actions = 0;
  for (; actions < 6 && !(await state()).completed; actions++) {
    const before = await state();
    const button = page.locator('#aaq-primary');
    assert.equal(await button.isEnabled(), true, `Stage ${actions + 1} can start`);
    console.log(`${before.selected}: action ${actions + 1}`);
    await button.click();
    await page.evaluate(() => window.advanceTime(4000));
    const after = await state();
    assert.equal(after.running, false, `Stage ${actions + 1} finishes`);
    assert.ok(after.stage !== before.stage || after.completed, `Stage ${actions + 1} advances`);
  }
  const finished = await state();
  assert.equal(actions, 4, `${finished.selected} has four guided actions`);
  assert.equal(finished.completed, true, 'Trial completes');
  assert.ok(finished.result && Number.isFinite(finished.result.value), 'Trial produces a finite reading');
  assert.equal(finished.results.length, prior.results.length + 1, 'One result row is added');
  return finished;
};

async function navigationChecks() {
  await page.goto(`http://127.0.0.1:4173/?aaq-navigation=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__lab && window.__aaq);
  await page.evaluate(() => { window.__manualSimulationTime = true; });
  const clickGCSE = async (id, data = null) => {
    const point = await page.evaluate(({ id, data }) => {
      const region = window.__lab.getRegions().find(r => r.id === id && (data === null || r.data === data));
      if (!region) throw new Error(`Canvas region not available: ${id} / ${data}`);
      const rect = document.querySelector('#lab').getBoundingClientRect(), scale = window.__lab.getScale();
      return { x: rect.left + (region.x + region.w / 2) * scale, y: rect.top + (region.y + region.h / 2) * scale };
    }, { id, data });
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(80);
  };
  const spacing = await page.evaluate(() => {
    const rect = document.querySelector('#course-select').getBoundingClientRect(), canvas = document.querySelector('#lab').getBoundingClientRect();
    const scale = window.__lab.getScale(), regions = window.__lab.getRegions();
    const tabs = regions.filter(r => r.id === 'subject-tab'), assessment = regions.find(r => r.id === 'toggle-assessment-mode');
    return { left: rect.left, right: rect.right, tabsRight: canvas.left + Math.max(...tabs.map(r => r.x + r.w)) * scale, assessmentLeft: canvas.left + assessment.x * scale };
  });
  assert.ok(spacing.left > spacing.tabsRight && spacing.right <= spacing.assessmentLeft, 'Native course selector does not overlap subject or assessment controls');
  await screenshot('03-gcse-default-dropdown');
  await clickGCSE('subject-tab', 'biology');
  assert.equal(await page.evaluate(() => window.__lab.state.subject), 'biology', 'GCSE subject canvas responds');
  const osmosisIndex = await page.evaluate(() => window.__lab.practicals.findIndex(p => p.id === 'osmosis'));
  await clickGCSE('practical', osmosisIndex);
  assert.equal(await page.evaluate(() => window.__lab.state.selected), osmosisIndex, 'GCSE practical canvas responds');
  await page.locator('#course-select').selectOption('aaq');
  await page.waitForFunction(() => window.__aaq.getState().renderer === 'Three.js');
  assert.equal(await page.locator('#aaq-loading').isVisible(), false);
  await page.locator('.aaq-practical[data-practical="aaq-colorimetry"]').click();
  for (const concentration of [0, 1]) {
    if ((await state()).completed) await page.locator('#aaq-repeat').click();
    await setParameter(concentration);
    await runTrial();
  }
  assert.equal(await page.locator('#aaq-unknown').isEnabled(), false, 'Standards below the unknown cannot justify interpolation');
  await page.locator('#aaq-repeat').click();
  await setParameter(5);
  await runTrial();
  assert.equal(await page.locator('#aaq-unknown').isEnabled(), true, 'Bracketing standards enable interpolation');
  await page.locator('#aaq-unknown').click();
  assert.ok((await page.locator('#aaq-panel').innerText()).includes('2.70 g dm⁻³'), 'Unknown interpolation produces 2.70 g dm⁻³');
  await screenshot('04-colorimetry-unknown');
  const savedResults = (await state()).results;
  await page.locator('#course-select').selectOption('gcse');
  assert.equal(await page.evaluate(() => window.__lab.state.selected), osmosisIndex, 'Course switch restores the actual selected GCSE practical');
  await clickGCSE('toggle-assessment-mode');
  assert.equal(await page.evaluate(() => window.__lab.state.assessmentMode), true, 'GCSE assessment canvas control still responds');
  assert.equal(await page.locator('#course-select').isVisible(), false, 'Course selector is hidden over GCSE assessment header');
  await screenshot('05-gcse-assessment-header');
  await clickGCSE('assessment-exit');
  assert.equal(await page.evaluate(() => window.__lab.state.assessmentMode), false);
  assert.equal(await page.locator('#course-select').isVisible(), true, 'Course selector returns on exiting GCSE assessment');
  await screenshot('06-gcse-restored-dropdown');
  await page.locator('#course-select').selectOption('aaq');
  assert.deepEqual((await state()).results, savedResults, 'AAQ results survive GCSE canvas interaction and assessment');
  assert.equal(errors.length, 0, errors.join('\n'));
  report.checks.push('Native course selector has no header overlap, and hides/returns for GCSE assessment.');
  report.checks.push('Actual GCSE canvas subject, practical, assessment and exit controls respond across course switches.');
  report.checks.push('Colorimetry requires bracketing standards and correctly interpolates 2.70 g dm⁻³.');
  console.log(JSON.stringify({ passed: true, checks: report.checks, errors }, null, 2));
}

try {
  if (navigationOnly) {
    await navigationChecks();
  } else {
  // Independent dimensional and biological invariants, in addition to UI checks.
  const model = (scene, value) => calculateAAQResult(AAQ_PRACTICALS.find(p => p.scene === scene), value);
  assert.equal(model('microscopy', 10).imageSizeMm, 6, '60 µm at ×100 forms a 6 mm image');
  assert.equal(model('microscopy', 40).value, 60, 'Changing magnification preserves specimen size');
  assert.equal(model('spirometer', 0).value, 6, '0.5 dm³ × 12 breaths/min = 6 dm³/min');
  assert.equal(model('pulse', 0).cardiacOutput, 5.04, '72/min × 70 cm³ = 5.04 dm³/min');
  assert.equal(model('reflex', 20).value, 202, '20 cm free fall takes approximately 202 ms');
  assert.equal(model('centrifuge', 3000).value, 805, '3000 rpm at 8 cm is approximately 805 ×g');
  assert.ok(model('gel', 100).value > model('gel', 3000).value, 'Shorter fragments migrate farther');
  assert.equal(model('colorimeter', 0).value, 0, 'Blank concentration gives zero absorbance');
  assert.equal(model('foodtest', 0).display, 'blue', 'Negative reducing-sugar control stays blue');
  assert.equal(model('foodtest', 4).display, 'brick-red', 'High model reducing-sugar category is brick red');
  assert.equal(model('enzyme', 70).endpointSeconds, null, 'Denatured model has no measurable endpoint');
  assert.equal(model('antimicrobial', 0).value, 6, 'Zero-dose control has only its 6 mm disc');
  for (const p of AAQ_PRACTICALS) {
    for (let x = p.parameter.min; x <= p.parameter.max; x += p.parameter.step) {
      assert.ok(Number.isFinite(calculateAAQResult(p, x).value), `${p.id} has a finite result at ${x}`);
    }
  }
  report.checks.push('All supported parameter values are finite; unit conversions and key biological invariants pass.');
  await page.goto(`http://127.0.0.1:4173/?qa=aaq-${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__lab && window.__aaq && document.querySelector('#course-select'));
  const gcseBefore = await page.evaluate(() => ({ selected: window.__lab.state.selected, subject: window.__lab.state.subject }));
  assert.equal(await page.locator('#course-select').inputValue(), 'gcse', 'GCSE remains default course');
  const options = await page.locator('#course-select option').allTextContents();
  assert.ok(options.includes('OCR GCSE Combined Science'));
  assert.ok(options.includes('OCR AAQ Human Biology'));
  await page.locator('#course-select').selectOption('aaq');
  await page.waitForFunction(() => window.__aaq.getState().renderer === 'Three.js');
  const ids = await page.locator('.aaq-practical[data-practical]').evaluateAll(elements => elements.map(element => element.dataset.practical));
  assert.equal(ids.length, 12, 'AAQ catalogue contains twelve practicals');
  assert.equal(new Set(ids).size, 12, 'All practical IDs are unique');
  await screenshot('01-course-overview');
  for (const filter of ['biomedical', 'genetics', 'physiology']) {
    await page.locator('#aaq-filter').selectOption(filter);
    assert.equal(await page.locator('.aaq-practical').count(), AAQ_PRACTICALS.filter(p => p.group === filter).length, `${filter} filter shows the matching practicals`);
  }
  await page.locator('#aaq-filter').selectOption('all');
  report.checks.push('Biomedical, genetics and physiology catalogue filters match the course activities.');

  for (const id of ids) {
    await page.locator(`.aaq-practical[data-practical="${id}"]`).click();
    await page.locator('#aaq-reset').click();
    const initial = await state();
    assert.equal(initial.selected, id);
    assert.equal(initial.completed, false);
    assert.equal(initial.results.length, 0);
    const bounds = await page.locator('#aaq-parameter').evaluate(element => ({ min: Number(element.min), max: Number(element.max), step: Number(element.step) }));
    assert.ok(Number.isFinite(bounds.min) && Number.isFinite(bounds.max) && bounds.max > bounds.min, `${id} has valid parameter bounds`);
    await setParameter(bounds.min);
    const low = await runTrial();
    await screenshot(`practical-${id}-low`);
    await page.locator('#aaq-repeat').click();
    assert.equal((await state()).results.length, 1, 'Repeat preserves the existing trial');
    assert.equal((await state()).completed, false);
    await setParameter(bounds.max);
    const high = await runTrial();
    await screenshot(`practical-${id}-high`);
    if (id.includes('microscop')) {
      assert.equal(low.result.value, high.result.value, 'Magnification does not change actual cell size');
      assert.notEqual(low.result.magnification, high.result.magnification);
    } else {
      assert.notEqual(low.result.value, high.result.value, `${id} responds to parameter changes`);
    }
    await page.locator('[data-panel="results"]').click();
    const formattedReading = high.result.display || high.result.value.toLocaleString('en-GB', { maximumFractionDigits: 3 });
    assert.ok((await page.locator('#aaq-reading').innerText()).includes(formattedReading), `${id} result is visible`);
    await page.locator('[data-panel="method"]').click();
    await page.locator('[data-panel="equipment"]').click();
    await page.locator('[data-panel="evaluate"]').click();
    const question = AAQ_PRACTICALS.find(practical => practical.id === id).question;
    await page.locator(`[data-answer="${(question.answer + 1) % question.options.length}"]`).click();
    assert.equal(await page.locator('.aaq-feedback.retry').isVisible(), true, 'Incorrect quiz answer explains reconsideration');
    await page.locator(`[data-answer="${question.answer}"]`).click();
    assert.equal(await page.locator('.aaq-feedback.correct').isVisible(), true, 'Correct quiz answer receives feedback');
    await page.locator('#aaq-notes').fill(`QA conclusion for ${id}: compare the low and high readings.`);
    await page.locator('#aaq-assessment').click();
    assert.equal((await state()).panel, 'method', 'Assessment toggle returns to method');
    await page.locator('#aaq-assessment').click();
    assert.equal((await state()).panel, 'evaluate', 'Assessment toggle opens learning check');
    assert.ok((await page.locator('#aaq-notes').inputValue()).includes(id), 'Conclusion survives panel switches');
    report.practicals.push({ id, bounds, low: low.result, high: high.result, resultRows: high.results.length });
    console.log(`Passed ${id}: both trials, results and assessment.`);
  }
  report.checks.push('All twelve assessment questions, wrong/right feedback, mode toggles and conclusion notes work.');
  report.checks.push('Twelve four-stage practicals complete at both parameter endpoints with finite readings and persistent repeat rows.');

  const aaqBeforeSwitch = await state();
  await page.locator('#course-select').selectOption('gcse');
  const gcseAfter = await page.evaluate(() => ({ selected: window.__lab.state.selected, subject: window.__lab.state.subject }));
  assert.deepEqual(gcseAfter, gcseBefore, 'Course switch preserves GCSE selection');
  await page.locator('#course-select').selectOption('aaq');
  const aaqAfterSwitch = await state();
  assert.equal(aaqAfterSwitch.selected, aaqBeforeSwitch.selected);
  assert.deepEqual(aaqAfterSwitch.results, aaqBeforeSwitch.results, 'Course switch preserves AAQ measurements');
  report.checks.push('Switching courses preserves GCSE selection and AAQ results.');

  await page.locator('[data-panel="results"]').click();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#aaq-export').click();
  const download = await downloadEvent;
  const csvPath = `${out}/${download.suggestedFilename()}`;
  await download.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  assert.ok(csv.split(/\r?\n/).filter(Boolean).length >= 3, 'CSV contains header and two result rows');
  report.checks.push(`CSV export saved (${download.suggestedFilename()}).`);

  await page.locator('#aaq-focus').click();
  assert.equal((await state()).focus, true, 'Focus mode activates');
  await screenshot('02-focus-mode');
  await page.locator('#aaq-focus').click();
  assert.equal((await state()).focus, false, 'Focus mode exits');
  for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(160);
    const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(dimensions.document <= dimensions.viewport + 1, `No horizontal overflow at ${viewport.width}×${viewport.height}`);
    if (viewport.width < viewport.height && viewport.width < 600) {
      assert.equal(await page.locator('#orientation-prompt').isVisible(), true, 'Portrait phone shows inherited rotate-to-landscape guidance');
    } else {
      assert.equal(await page.locator('#course-select').isVisible(), true, 'Course selector remains accessible');
    }
    await screenshot(`responsive-${viewport.width}x${viewport.height}`);
  }
  report.checks.push('Focus mode and tablet/phone portrait/landscape layouts render without horizontal overflow.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#aaq-reset').click();
  assert.equal((await state()).results.length, 0, 'Reset clears the selected practical results');
  await page.locator(`.aaq-practical[data-practical="${ids[0]}"]`).click();
  assert.equal((await state()).results.length, 2, 'Reset does not clear another practical');
  report.checks.push('Reset is scoped to the selected practical.');

  await page.goto(`http://127.0.0.1:4173/?course=aaq&qa=aaq-direct-${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__aaq);
  assert.equal(await page.locator('#course-select').inputValue(), 'aaq', 'AAQ URL loads directly');
  assert.equal(errors.length, 0, `Browser errors: ${errors.join('\n')}`);
  report.checks.push('Direct AAQ URL loads and no console/page errors occur.');
  console.log(JSON.stringify({ passed: true, practicals: report.practicals.length, checks: report.checks, errors }, null, 2));
  }
} catch (error) {
  report.failure = error.stack;
  await screenshot('failure').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(`${out}/${navigationOnly ? 'navigation-report' : 'report'}.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
