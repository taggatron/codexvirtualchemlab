import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const out = 'output/assessment-qa';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
page.on('pageerror', err => errors.push(`page: ${err.message}`));

try {
  await page.goto(`http://127.0.0.1:4173/?qa=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  const getState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const click = async (x, y, wait = 120) => {
    await page.mouse.click(x, y);
    await page.waitForTimeout(wait);
  };
  const advance = ms => page.evaluate(duration => window.advanceTime(duration), ms);

  // 1. Initial State Check
  const s0 = await getState();
  console.log('1. Initial lab loaded:', s0.practical, 'assessment_mode:', s0.assessment_mode?.active);
  if (s0.assessment_mode?.active !== false) throw new Error('Assessment mode should start inactive');

  // 2. Select Biology -> Anaerobic Respiration practical
  // Click Biology tab (x approx 320, y approx 32)
  await click(320, 32);
  // Find respiration in sidebar (or switch practical directly)
  await page.evaluate(() => {
    const pIdx = practicals.findIndex(p => p.id === 'respiration');
    if (pIdx >= 0) {
      state.selected = pIdx;
      state.subject = 'biology';
      draw();
    }
  });
  await page.waitForTimeout(100);
  const s1 = await getState();
  console.log('2. Selected practical:', s1.practical);

  // 3. Enter Assessment Mode via header toggle
  // Click ASSESSMENT MODE in top header (W=1280, assessX = 1280 - 104 - 146 - 20 = 1010, y = 32)
  await click(1080, 32);
  await page.waitForTimeout(150);
  const s2 = await getState();
  console.log('3. Entered assessment mode:', s2.assessment_mode);
  if (!s2.assessment_mode?.active) throw new Error('Assessment mode failed to activate');
  await page.screenshot({ path: `${out}/01-apparatus-initial.png`, fullPage: true });

  // 4. Activity 1: Apparatus Selection & Bench Arrangement
  // Select items from the library on the left
  await page.evaluate(() => {
    const session = state.assessmentSession;
    const challenge = session.data.apparatusChallenge;
    // Select required items: conical_flask, bung_delivery_tube, gas_syringe, water_bath, stopwatch
    challenge.slots.forEach(slot => {
      session.selectedEquipment.add(slot.requiredItem);
      session.slotAssignments[slot.id] = slot.requiredItem;
    });
    // Trigger check
    assessment.checkApparatusPhase(session);
    draw();
  });
  await page.waitForTimeout(100);
  const s3 = await getState();
  console.log('4. Apparatus checked, score:', s3.assessment_mode?.total_score, 'apparatus_checked:', s3.assessment_mode?.apparatus_checked);
  if (s3.assessment_mode?.total_score <= 0) throw new Error('Apparatus score should be > 0');
  await page.screenshot({ path: `${out}/02-apparatus-evaluated.png`, fullPage: true });

  // 5. Activity 2: Method Step Sequencing & Scientific Reasoning
  // Move to method phase
  await page.evaluate(() => {
    state.assessmentSession.currentPhase = 'method';
    draw();
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/03-method-phase.png`, fullPage: true });

  // Reorder steps to correct sequence and answer reasoning questions
  await page.evaluate(() => {
    const session = state.assessmentSession;
    const challenge = session.data.methodChallenge;
    // Set correct step order
    session.orderedStepIds = [...challenge.correctOrder];
    // Answer questions correctly
    challenge.reasoningQuestions.forEach(q => {
      const correctIdx = q.options.findIndex(o => o.correct);
      session.questionAnswers[q.id] = correctIdx;
    });
    assessment.checkMethodPhase(session);
    draw();
  });
  await page.waitForTimeout(100);
  const s4 = await getState();
  console.log('5. Method checked, total score:', s4.assessment_mode?.total_score);
  await page.screenshot({ path: `${out}/04-method-evaluated.png`, fullPage: true });

  // 6. Activity 3: Addressing Procedural Limitations & Selecting Upgrades
  // Move to limitations phase
  await page.evaluate(() => {
    state.assessmentSession.currentPhase = 'limitations';
    draw();
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/05-limitations-phase.png`, fullPage: true });

  // Select optimal apparatus upgrades (e.g. gas syringe vs balloon, wide temperature range 10-60 C, repeats)
  await page.evaluate(() => {
    const session = state.assessmentSession;
    const challenges = session.data.limitationsChallenge;
    challenges.forEach(lim => {
      const correctIdx = lim.options.findIndex(o => o.correct);
      session.limitationAnswers[lim.id] = correctIdx;
    });
    assessment.checkLimitationsPhase(session);
    draw();
  });
  await page.waitForTimeout(100);
  const s5 = await getState();
  console.log('6. Limitations checked, total score:', s5.assessment_mode?.total_score);
  await page.screenshot({ path: `${out}/06-limitations-evaluated.png`, fullPage: true });

  // 7. Activity 4: Final Summary & Estimated GCSE Grade Report
  await page.evaluate(() => {
    state.assessmentSession.currentPhase = 'summary';
    draw();
  });
  await page.waitForTimeout(100);
  const s6 = await getState();
  console.log('7. Final Summary - Score:', s6.assessment_mode?.total_score, '/', s6.assessment_mode?.max_score, 'Grade:', s6.assessment_mode?.grade);
  if (!s6.assessment_mode?.grade) throw new Error('Expected GCSE grade to be calculated');
  await page.screenshot({ path: `${out}/07-final-gcse-summary.png`, fullPage: true });

  // 8. Exit back to lab simulation
  await page.evaluate(() => {
    state.assessmentMode = false;
    draw();
  });
  await page.waitForTimeout(100);
  const s7 = await getState();
  console.log('8. Exited back to Lab Simulation, assessment_mode:', s7.assessment_mode?.active);
  if (s7.assessment_mode?.active !== false) throw new Error('Failed to exit assessment mode');
  await page.screenshot({ path: `${out}/08-lab-resumed.png`, fullPage: true });

  console.log('All assessment mode tests completed successfully!');
  console.log('Errors logged:', errors.length);
  if (errors.length > 0) {
    console.error('Console / page errors:', errors);
    process.exit(1);
  }
} finally {
  await browser.close();
}
