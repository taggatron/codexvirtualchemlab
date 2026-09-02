import { chromium } from './qa_playwright_shim.mjs';
import fs from 'node:fs';

const out = 'output/hooke-specific-heat-qa';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('console', message => {
  if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
});
page.on('pageerror', error => pageErrors.push(`page: ${error.message}`));

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
await page.goto(`${baseUrl}/?hooke-specific-heat-qa=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => { window.__manualSimulationTime = true; });

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = milliseconds => page.evaluate(value => window.advanceTime(value), milliseconds);
const click = async (x, y, pauseMs = 65) => {
  await page.mouse.click(x, y);
  if (pauseMs) await page.waitForTimeout(pauseMs);
};
const capture = async name => {
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return state();
};
const primary = () => click(372, (page.viewportSize()?.height || 720) - 63);

function normaliseKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function deepFindByKeys(root, names) {
  const wanted = new Set(names.map(normaliseKey));
  const seen = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (wanted.has(normaliseKey(key))) return child;
    }
    for (const child of Object.values(value)) {
      const found = visit(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return visit(root);
}

function practicalSection(snapshot, explicitKeys, keyFragment) {
  for (const key of explicitKeys) {
    if (snapshot[key] && typeof snapshot[key] === 'object') return snapshot[key];
  }
  const match = Object.entries(snapshot).find(([key, value]) =>
    normaliseKey(key).includes(normaliseKey(keyFragment)) && value && typeof value === 'object'
  );
  return match?.[1] || null;
}

async function selectPhysicsPractical(titlePattern) {
  // The subject tabs have a fixed header layout, but Physics card positions
  // change whenever another practical is added. Probe the generated sidebar
  // and confirm each selection through render_game_to_text instead of relying
  // on old hard-coded card y-coordinates.
  await click(435, 32);
  const discovered = new Set();
  let snapshot = await state();
  if (snapshot.practical) discovered.add(snapshot.practical);
  if (titlePattern.test(snapshot.practical || '')) return snapshot;

  for (let y = 105; y <= 690; y += 24) {
    await click(130, y, 22);
    snapshot = await state();
    if (snapshot.practical) discovered.add(snapshot.practical);
    if (titlePattern.test(snapshot.practical || '')) return snapshot;
  }
  throw new Error(`Could not locate ${titlePattern} in the Physics sidebar. Saw: ${[...discovered].join(', ')}`);
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertClose(actual, expected, message, tolerance = 1e-6) {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`);
}

function graphLooksLike(snapshot, firstAxis, secondAxis) {
  const axes = snapshot.graph_axes || {};
  const text = `${axes.x || axes.xLabel || ''} ${axes.y || axes.yLabel || ''}`.toLowerCase();
  return text.includes(firstAxis) && text.includes(secondAxis);
}

// Hooke's law: zero reading, six 1 N loading steps, then graph.
let hookeInitial = await selectPhysicsPractical(/hooke|force\s*(?:–|-|and)\s*extension/i);
hookeInitial = await capture('01-hooke-initial');
const hookeGuidanceBounds = practicalSection(hookeInitial, ['hookes_law_practical', 'hooke_law_practical', 'hooke_practical'], 'hooke')?.guidance_focus?.trigger_bounds;
assert(hookeGuidanceBounds, 'Hooke Guidance focus target is missing.');
await click(hookeGuidanceBounds.x + hookeGuidanceBounds.width / 2, hookeGuidanceBounds.y + hookeGuidanceBounds.height / 2);
await advance(360);
const hookeFocusOpen = await capture('01a-hooke-ruler-focus-open');
await page.keyboard.press('Escape');
const hookeFocusClosed = await capture('01b-hooke-ruler-focus-closed');
await primary(); // RECORD ZERO
const hookeZero = await capture('02-hooke-zero-recorded');

let hookeMid = null;
for (let forceN = 1; forceN <= 6; forceN++) {
  await primary(); // ADD 100 g MASS
  if (forceN === 3) {
    await advance(1600);
    hookeMid = await capture('03-hooke-third-mass-settling');
    await advance(1900);
  } else {
    await advance(3500);
  }
  await primary(); // RECORD READING
}
const hookeLoaded = await capture('04-hooke-six-newton-loaded');
await primary(); // VIEW GRAPH
const hookeFinal = await capture('05-hooke-final-graph');

// Specific heat capacity: prepare, heat for 8.1 simulated seconds, calculate,
// then reveal the graph. The split heating advance captures a genuine mid-run
// frame while preserving the requested deterministic total of 8.1 seconds.
let specificInitial = await selectPhysicsPractical(/specific heat|heat capacity/i);
specificInitial = await capture('06-specific-heat-initial');
await primary(); // PREPARE BLOCK
await advance(1800);
const specificAssembling = await capture('06a-specific-heat-insulation-arriving');
await advance(600);
const specificInsulated = await capture('06b-specific-heat-insulated-before-probes');
await advance(800);
const specificInserting = await capture('06c-specific-heat-probes-inserting');
await advance(700);
const specificPrepared = await capture('07-specific-heat-prepared');
await primary(); // START HEATING
await advance(4000);
const specificHeating = await capture('08-specific-heat-heating-mid');
await advance(4100);
const specificHeated = await capture('09-specific-heat-heated');
await primary(); // CALCULATE c
const specificCalculated = await capture('10-specific-heat-calculated');
await primary(); // VIEW GRAPH
const specificFinal = await capture('11-specific-heat-final-graph');

const hooke = practicalSection(
  hookeFinal,
  ['hookes_law_practical', 'hooke_law_practical', 'hooke_practical', 'force_extension_practical'],
  'hooke'
);
const hookeResults = deepFindByKeys(hooke, [
  'measured_results', 'force_extension_results', 'results', 'readings'
]);
const orderedHookeResults = Array.isArray(hookeResults)
  ? [...hookeResults].sort((a, b) => asNumber(deepFindByKeys(a, ['force_n', 'force'])) - asNumber(deepFindByKeys(b, ['force_n', 'force'])))
  : [];
const hookeForces = orderedHookeResults.map(result => asNumber(deepFindByKeys(result, ['force_n', 'force', 'load_n', 'weight_n'])));
const hookeExtensions = orderedHookeResults.map(result => asNumber(deepFindByKeys(result, ['extension_cm', 'extension', 'extension_centimetres'])));
const springConstant = asNumber(deepFindByKeys(hooke, [
  'spring_constant_n_per_m', 'spring_constant_n_m', 'calculated_spring_constant_n_per_m', 'calculated_k_n_per_m', 'k_n_per_m'
]));
const proportionalLimit = asNumber(deepFindByKeys(hooke, [
  'limit_of_proportionality_n', 'proportional_limit_n', 'proportionality_limit_n'
]));
const finalHookePoint = orderedHookeResults.at(-1) || {};
const finalPointMarker = deepFindByKeys(finalHookePoint, [
  'beyond_proportionality', 'beyond_proportional_limit', 'beyond_limit', 'region', 'status', 'classification'
]);
const sectionBeyondMarker = deepFindByKeys(hooke, [
  'final_6n_point_beyond_proportionality', 'final_point_beyond_proportionality', 'beyond_proportionality', 'beyond_proportional_limit'
]);
const markerText = `${finalPointMarker ?? ''} ${sectionBeyondMarker ?? ''}`.toLowerCase();
const finalPointMarkedBeyond = finalPointMarker === true || sectionBeyondMarker === true ||
  /beyond|non.?linear|outside/.test(markerText) || Number.isFinite(proportionalLimit) && proportionalLimit < 6;

const specific = practicalSection(
  specificFinal,
  ['specific_heat_capacity_practical', 'specific_heat_practical', 'shc_practical'],
  'specificheat'
);
const electricalEnergyJ = asNumber(deepFindByKeys(specific, [
  'electrical_energy_j', 'energy_transferred_j', 'energy_j', 'delta_energy_j'
]));
const temperatureRiseC = asNumber(deepFindByKeys(specific, [
  'temperature_rise_c', 'temperature_change_c', 'delta_t_c', 'delta_temperature_c'
]));
const specificHeatCapacity = asNumber(deepFindByKeys(specific, [
  'specific_heat_capacity_j_per_kg_k', 'specific_heat_capacity_j_kg_k', 'calculated_c_j_per_kg_k', 'calculated_c_j_kg_k', 'c_j_per_kg_k'
]));
const hookeInitialSection = practicalSection(hookeInitial, ['hookes_law_practical', 'hooke_law_practical', 'hooke_practical'], 'hooke');
const hookeFocusOpenSection = practicalSection(hookeFocusOpen, ['hookes_law_practical', 'hooke_law_practical', 'hooke_practical'], 'hooke');
const hookeFocusClosedSection = practicalSection(hookeFocusClosed, ['hookes_law_practical', 'hooke_law_practical', 'hooke_practical'], 'hooke');
const hookeZeroSection = practicalSection(hookeZero, ['hookes_law_practical', 'hooke_law_practical', 'hooke_practical'], 'hooke');
const hookeMidSection = practicalSection(hookeMid, ['hookes_law_practical', 'hooke_law_practical', 'hooke_practical'], 'hooke');
const hookeLoadedSection = practicalSection(hookeLoaded, ['hookes_law_practical', 'hooke_law_practical', 'hooke_practical'], 'hooke');
const specificInitialSection = practicalSection(specificInitial, ['specific_heat_capacity_practical', 'specific_heat_practical', 'shc_practical'], 'specificheat');
const specificAssemblingSection = practicalSection(specificAssembling, ['specific_heat_capacity_practical', 'specific_heat_practical', 'shc_practical'], 'specificheat');
const specificInsulatedSection = practicalSection(specificInsulated, ['specific_heat_capacity_practical', 'specific_heat_practical', 'shc_practical'], 'specificheat');
const specificInsertingSection = practicalSection(specificInserting, ['specific_heat_capacity_practical', 'specific_heat_practical', 'shc_practical'], 'specificheat');
const specificPreparedSection = practicalSection(specificPrepared, ['specific_heat_capacity_practical', 'specific_heat_practical', 'shc_practical'], 'specificheat');
const specificHeatingSection = practicalSection(specificHeating, ['specific_heat_capacity_practical', 'specific_heat_practical', 'shc_practical'], 'specificheat');
const specificHeatedSection = practicalSection(specificHeated, ['specific_heat_capacity_practical', 'specific_heat_practical', 'shc_practical'], 'specificheat');
const specificCalculatedSection = practicalSection(specificCalculated, ['specific_heat_capacity_practical', 'specific_heat_practical', 'shc_practical'], 'specificheat');

const summary = {
  errors: pageErrors,
  renderer: hookeInitial.renderer,
  hooke: {
    initial: hookeInitialSection,
    guidance_focus_open: hookeFocusOpenSection,
    guidance_focus_closed: hookeFocusClosedSection,
    zero: hookeZeroSection,
    settling: hookeMidSection,
    fully_loaded: hookeLoadedSection,
    complete: hookeFinal.complete,
    forces_n: hookeForces,
    extensions_cm: hookeExtensions,
    spring_constant_n_per_m: springConstant,
    proportional_limit_n: proportionalLimit,
    final_point_marked_beyond_proportionality: finalPointMarkedBeyond,
    graph_axes: hookeFinal.graph_axes,
    graph_readings: hookeFinal.graph_readings
  },
  specific_heat_capacity: {
    initial: specificInitialSection,
    assembling: specificAssemblingSection,
    insulated_before_probes: specificInsulatedSection,
    probes_inserting: specificInsertingSection,
    prepared: specificPreparedSection,
    heating: specificHeatingSection,
    heated: specificHeatedSection,
    calculated: specificCalculatedSection,
    complete: specificFinal.complete,
    electrical_energy_j: electricalEnergyJ,
    temperature_rise_c: temperatureRiseC,
    specific_heat_capacity_j_per_kg_k: specificHeatCapacity,
    graph_axes: specificFinal.graph_axes,
    graph_readings: specificFinal.graph_readings
  }
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
check(hookeInitial.renderer?.enabled && !hookeInitial.renderer?.legacy_2d_apparatus, 'Hooke practical did not use the WebGL renderer.');
check(specificInitial.renderer?.enabled && !specificInitial.renderer?.legacy_2d_apparatus, 'Specific-heat practical did not use the WebGL renderer.');
check(!!hooke, 'Hooke render_game_to_text payload is missing.');
check(hookeInitialSection?.ruler?.origin === 'top of vertical ruler', 'Hooke ruler numbering does not start at its physical top edge.');
check(hookeInitialSection?.ruler?.scale_cm?.[0] === 0, 'Hooke ruler top scale does not begin at 0 cm.');
check(Math.abs(hookeInitialSection?.ruler?.pointer_reading_cm - hookeInitialSection?.ruler?.unloaded_pointer_reading_cm) <= 1e-6, 'Unloaded Hooke pointer should equal its stored ruler reference reading.');
check(hookeFocusOpenSection?.guidance_focus?.open, 'Hooke Guidance did not open the ruler-focus modal.');
check(hookeFocusOpenSection?.guidance_focus?.animation_progress >= .99, 'Hooke ruler-focus modal did not complete its zoom animation.');
check(!hookeFocusClosedSection?.guidance_focus?.open, 'Escape did not close the Hooke ruler-focus modal.');
check((deepFindByKeys(hookeZeroSection, ['measured_results']) || []).length === 1, 'RECORD ZERO did not create exactly one unloaded Hooke reading.');
check(hookeMidSection?.stage === 1 && hookeMidSection?.spring_moving === true, 'Hooke mid-stage capture did not show the third mass being added and the spring moving.');
check(JSON.stringify(hookeForces) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]), `Hooke forces are incorrect: ${JSON.stringify(hookeForces)}.`);
check(JSON.stringify(hookeExtensions) === JSON.stringify([0, 2, 4, 6, 8, 10, 13]), `Hooke extensions are incorrect: ${JSON.stringify(hookeExtensions)}.`);
check(hookeInitialSection?.ruler?.unloaded_pointer_reading_cm === 20 && hookeLoadedSection?.ruler?.pointer_reading_cm === 33, 'Hooke ruler readings do not match the recorded 20.0–33.0 cm total lengths.');
check(hookeInitialSection?.ruler_smallest_graduation_mm === 1 && hookeInitialSection?.safety_catch_tray_directly_below_hanger === true, 'Hooke ruler resolution or catch-tray safety contract is missing.');
check(Math.abs(springConstant - 50) <= 1e-6, `Hooke spring constant should be 50 N/m, received ${springConstant}.`);
check(finalPointMarkedBeyond, 'The 6 N Hooke point is not marked as beyond the limit of proportionality.');
check(hookeFinal.complete, 'Hooke practical did not complete after seven readings.');
check(hookeFinal.tab === 'graph', `Hooke VIEW GRAPH did not select the graph tab (tab=${hookeFinal.tab}).`);
check(hookeFinal.graph_readings === 7, `Hooke graph should contain seven readings, received ${hookeFinal.graph_readings}.`);
check(graphLooksLike(hookeFinal, 'force', 'extension'), `Hooke graph axes are incorrect: ${JSON.stringify(hookeFinal.graph_axes)}.`);
check(!!specific, 'Specific-heat render_game_to_text payload is missing.');
check(specificInitialSection?.preparation?.block_bores_pre_drilled_before_practical && specificInitialSection?.preparation?.drilling_sparks_shown === false, 'Specific-heat setup should identify the supplied bores as pre-drilled and omit drilling sparks.');
check(specificInitialSection?.preparation?.insulation_starts_off_camera && specificInitialSection?.instrument_layout?.all_four_displays_visible, 'Specific-heat initial organisation contract is missing off-camera insulation or four visible displays.');
check(JSON.stringify(specificInitialSection?.instrument_layout?.left_of_block) === JSON.stringify(['12 V supply', 'ammeter']) && JSON.stringify(specificInitialSection?.instrument_layout?.right_of_block) === JSON.stringify(['joulemeter', 'digital thermometer']), 'Specific-heat instruments are not split into the requested two-left/two-right arrangement.');
check(specificInitialSection?.instrument_layout?.spread_farther_from_block && specificInitialSection?.instrument_layout?.outer_meter_x_scene_units?.[1] === 3.15 && specificInitialSection?.instrument_layout?.inner_meter_x_scene_units?.[1] === 2.02, 'Specific-heat meters were not moved farther outward from the block.');
check(specificInitialSection?.electrical_circuit?.continuous_curved_leads, 'Specific-heat electrical leads are not reported as continuous curved cables.');
check(specificAssemblingSection?.stage === 1 && specificAssemblingSection?.preparation?.insulation_panels_fly_in_individually, 'Specific-heat mid-assembly state did not report the individual insulation fly-in.');
check(specificAssemblingSection?.preparation?.heater_fully_inserted === false && specificAssemblingSection?.preparation?.probe_fully_inserted === false, 'A probe moved before the insulation fly-in completed.');
check(specificInsulatedSection?.stage === 1 && specificInsulatedSection?.preparation?.insulation_closed && !specificInsulatedSection?.preparation?.heater_fully_inserted && !specificInsulatedSection?.preparation?.probe_fully_inserted, 'Specific-heat insulation was not fully closed before either probe was inserted.');
check(specificInsertingSection?.preparation?.insulation_closed && specificInsertingSection?.preparation?.heater_fully_inserted && !specificInsertingSection?.preparation?.probe_fully_inserted, 'Specific-heat staged probe insertion did not follow the completed insulation step.');
check(specificPreparedSection?.stage === 2 && specificPreparedSection?.preparation?.thermal_paste_applied && specificPreparedSection?.preparation?.insulation_closed, 'PREPARE BLOCK did not finish with paste, insulation and probes in place.');
check(specificPreparedSection?.preparation?.bored_insulating_lid_closed && specificPreparedSection?.electrical_circuit?.complete, 'Specific-heat lid or complete electrical circuit contract is missing.');
check(specificHeatingSection?.stage === 3 && specificHeatingSection.energy_j > 0 && specificHeatingSection.energy_j < 18000, 'Specific-heat mid-stage capture did not show live heating and an intermediate energy reading.');
check(specificHeatedSection?.stage === 4, `Specific-heat run did not finish ready to calculate (stage=${specificHeatedSection?.stage}).`);
check(specificCalculatedSection?.stage === 5, `CALCULATE c did not reach the calculated stage (stage=${specificCalculatedSection?.stage}).`);
check(Math.abs(electricalEnergyJ - 18000) <= 1e-6, `Specific-heat energy should be 18000 J, received ${electricalEnergyJ}.`);
check(Math.abs(temperatureRiseC - 20) <= 1e-6, `Specific-heat temperature rise should be 20 °C, received ${temperatureRiseC}.`);
check(Math.abs(specificHeatCapacity - 900) <= 1e-6, `Specific heat capacity should be 900 J kg⁻¹ K⁻¹, received ${specificHeatCapacity}.`);
const shcRows = deepFindByKeys(specificCalculatedSection, ['measured_results']) || [];
check(JSON.stringify(shcRows.map(row => row.energy_j)) === JSON.stringify([0, 3600, 7200, 10800, 14400, 18000]), `Specific-heat energy rows are incorrect: ${JSON.stringify(shcRows)}.`);
check(JSON.stringify(shcRows.map(row => row.temperature_c)) === JSON.stringify([20, 24, 28, 32, 36, 40]), `Specific-heat temperature rows are incorrect: ${JSON.stringify(shcRows)}.`);
check(specificFinal.complete, 'Specific-heat practical did not complete after calculating c.');
check(specificFinal.tab === 'graph', `Specific-heat VIEW GRAPH did not select the graph tab (tab=${specificFinal.tab}).`);
check((specificFinal.graph_readings || 0) > 0, 'Specific-heat graph contains no readings.');
check(graphLooksLike(specificFinal, 'energy', 'temperature'), `Specific-heat graph axes are incorrect: ${JSON.stringify(specificFinal.graph_axes)}.`);
if (pageErrors.length) failures.push(...pageErrors);

await browser.close();
if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify(summary, null, 2));
