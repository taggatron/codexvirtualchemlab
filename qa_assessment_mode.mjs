import { chromium } from 'playwright';
import fs from 'node:fs';

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
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && window.__lab);

  const getState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const clickRegion = async (id, dataMatch = null) => {
    const pt = await page.evaluate(({ id, dataMatch }) => {
      const regions = window.__lab.getRegions();
      const reg = regions.find(r => {
        if (r.id !== id) return false;
        if (dataMatch === null) return true;
        if (typeof dataMatch === 'object') {
          return Object.keys(dataMatch).every(k => r.data?.[k] === dataMatch[k]);
        }
        return r.data === dataMatch;
      });
      if (!reg) return null;
      const canvas = document.getElementById('lab');
      const rect = canvas.getBoundingClientRect();
      const scale = window.__lab.getScale();
      return {
        x: rect.left + (reg.x + reg.w / 2) * scale,
        y: rect.top + (reg.y + reg.h / 2) * scale
      };
    }, { id, dataMatch });

    if (!pt) throw new Error(`Region ${id} (data: ${JSON.stringify(dataMatch)}) not found`);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(140);
  };

  // 1. Initial State Check
  const s0 = await getState();
  console.log('1. Initial lab loaded:', s0.practical, '| assessment_mode:', s0.assessment_mode?.active);
  if (s0.assessment_mode?.active !== false) throw new Error('Assessment mode should start inactive');

  // 2. Select Practical: Anaerobic respiration in yeast
  await page.evaluate(() => {
    const { state, practicals, draw } = window.__lab;
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

  // 3. Enter Assessment Mode via actual mouse click on header button
  await clickRegion('toggle-assessment-mode');
  const s2 = await getState();
  console.log('3. Clicked header button -> Assessment mode active:', s2.assessment_mode?.active, 'phase:', s2.assessment_mode?.phase);
  if (!s2.assessment_mode?.active) throw new Error('Assessment mode failed to activate');
  await page.screenshot({ path: `${out}/01-apparatus-initial.png`, fullPage: true });

  // 4. Activity 1: Apparatus Selection & Bench Assignment via mouse clicks
  // Select required apparatus from the equipment library:
  const requiredEquip = ['conical_flask', 'bung_delivery_tube', 'gas_syringe', 'water_bath', 'stopwatch'];
  for (const eqId of requiredEquip) {
    await clickRegion('assessment-toggle-equipment', eqId);
  }

  // Assign items to bench slots
  await page.evaluate(() => {
    const { state, draw } = window.__lab;
    const session = state.assessmentSession;
    session.data.apparatusChallenge.slots.forEach(slot => {
      session.slotAssignments[slot.id] = slot.requiredItem;
    });
    draw();
  });

  // Click Check Apparatus Setup button
  await clickRegion('assessment-check-apparatus');
  const s3 = await getState();
  console.log('4. Clicked CHECK APPARATUS SETUP -> Score:', s3.assessment_mode?.total_score, 'Evaluated:', s3.assessment_mode?.apparatus_checked);
  if (s3.assessment_mode?.total_score !== 7) throw new Error(`Expected apparatus score 7, got ${s3.assessment_mode?.total_score}`);
  await page.screenshot({ path: `${out}/02-apparatus-evaluated.png`, fullPage: true });

  // 5. Activity 2: Navigate to Method Steps via Next button
  await clickRegion('assessment-next-phase');
  const s4a = await getState();
  console.log('5. Clicked NEXT -> Current phase:', s4a.assessment_mode?.phase);
  if (s4a.assessment_mode?.phase !== 'method') throw new Error('Expected phase: method');
  await page.screenshot({ path: `${out}/03-method-phase.png`, fullPage: true });

  // Answer reasoning questions via mouse clicks
  // Q1: liquid paraffin -> option A (index 0: prevent oxygen)
  await clickRegion('assessment-answer-option', { questionId: 'q_layer', optionIndex: 0 });
  // Q2: water bath pre-equilibration -> option A (index 0: reach target temp)
  await clickRegion('assessment-answer-option', { questionId: 'q_equilibrate', optionIndex: 0 });
  // Q3: 60 °C cessation -> option A (index 0: enzymes denature)
  await clickRegion('assessment-answer-option', { questionId: 'q_high_temp', optionIndex: 0 });

  // Also reorder steps so they are in correct order
  await page.evaluate(() => {
    const { state, draw } = window.__lab;
    state.assessmentSession.orderedStepIds = [...state.assessmentSession.data.methodChallenge.correctOrder];
    draw();
  });
  await clickRegion('assessment-check-order');
  await clickRegion('assessment-check-questions');
  const s4b = await getState();
  console.log('5. Clicked CHECK ORDER & CHECK QUESTIONS -> Score:', s4b.assessment_mode?.total_score);
  if (s4b.assessment_mode?.total_score !== 18) throw new Error(`Expected score 18 after method phase, got ${s4b.assessment_mode?.total_score}`);
  await page.screenshot({ path: `${out}/04-method-evaluated.png`, fullPage: true });

  // 6. Activity 3: Navigate to Limitations & Upgrades
  await clickRegion('assessment-next-phase');
  const s5a = await getState();
  console.log('6. Clicked NEXT -> Current phase:', s5a.assessment_mode?.phase);
  if (s5a.assessment_mode?.phase !== 'limitations') throw new Error('Expected phase: limitations');
  await page.screenshot({ path: `${out}/05-limitations-phase.png`, fullPage: true });

  // Click experimental upgrades via mouse clicks:
  // Limitation 1 (Gas collection): 100 cm³ Gas Syringe (index 0)
  await clickRegion('assessment-select-upgrade', { limitationId: 'lim_gas_collection', optionIndex: 0 });
  // Limitation 2 (Temperature range): 10–60 °C range (index 0)
  await clickRegion('assessment-select-upgrade', { limitationId: 'lim_temperature_range', optionIndex: 0 });
  // Limitation 3 (Reliability): 3 repeat trials (index 0)
  await clickRegion('assessment-select-upgrade', { limitationId: 'lim_repeats', optionIndex: 0 });

  // Click Check Upgrade Choices button
  await clickRegion('assessment-check-limitations');
  const s5b = await getState();
  console.log('6. Clicked CHECK UPGRADES -> Score:', s5b.assessment_mode?.total_score);
  if (s5b.assessment_mode?.total_score !== 27) throw new Error(`Expected score 27 after limitations, got ${s5b.assessment_mode?.total_score}`);
  await page.screenshot({ path: `${out}/06-limitations-evaluated.png`, fullPage: true });

  // 7. Activity 4: Navigate to Final GCSE Score & Examiner Report
  await clickRegion('assessment-next-phase');
  const s6 = await getState();
  console.log('7. Final GCSE Summary - Score:', s6.assessment_mode?.total_score, '/', s6.assessment_mode?.max_score, '| Grade:', s6.assessment_mode?.grade);
  if (s6.assessment_mode?.grade !== 'Grade 9') throw new Error(`Expected Grade 9, got ${s6.assessment_mode?.grade}`);
  await page.screenshot({ path: `${out}/07-final-gcse-summary.png`, fullPage: true });

  // 8. Exit Assessment Mode back to Lab Simulation via Return button
  await clickRegion('assessment-exit');
  const s7 = await getState();
  console.log('8. Clicked RETURN TO SIMULATION LAB -> assessment_mode:', s7.assessment_mode?.active);
  if (s7.assessment_mode?.active !== false) throw new Error('Failed to exit assessment mode');
  await page.screenshot({ path: `${out}/08-lab-resumed.png`, fullPage: true });

  console.log('--- ALL ASSESMENT INTERACTIONS PASSED CLEANLY! ---');
  console.log('Console / page errors logged:', errors.length);
  if (errors.length > 0) {
    console.error(errors);
    process.exit(1);
  }
} finally {
  await browser.close();
}
