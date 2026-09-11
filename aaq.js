import { AAQ_PRACTICALS, AAQ_SPEC_URL } from './aaq-catalog.js?v=20260908-1';
import { calculateAAQResult, summariseAAQResults } from './aaq-models.js?v=20260908-1';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const fmt = value => Number.isFinite(value) ? Number(value.toFixed(3)).toLocaleString('en-GB', { maximumFractionDigits: 3 }) : '—';
const groups = [{ id: 'all', label: 'All practicals' }, { id: 'biomedical', label: 'Biomedical' }, { id: 'genetics', label: 'Genetics' }, { id: 'physiology', label: 'Physiology' }];

export function createCourseExperience({ onCourseChange, getViewport, isGCSEFocus }) {
  let course = 'gcse', selected = AAQ_PRACTICALS[0].id, group = 'all', panel = 'method', focus = false;
  let renderer = null, rendererPromise = null, raf = 0, previousTime = 0, clock = 0;
  const sessions = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const host = document.createElement('div');
  host.id = 'course-layer';
  host.innerHTML = `
    <label class="course-picker"><span class="sr-only">Qualification</span><select id="course-select" aria-label="Qualification"><option value="gcse">OCR GCSE Combined Science</option><option value="aaq">OCR AAQ Human Biology</option></select><span aria-hidden="true">⌄</span></label>
    <section id="aaq" aria-label="OCR AAQ Human Biology practical laboratory" hidden>
      <header class="aaq-header"><div class="aaq-brand"><span>PRACTICAL</span><strong>LAB</strong></div><div class="aaq-subject"><span aria-hidden="true">◉</span> Human Biology <span class="aaq-level">LEVEL 3</span></div><button id="aaq-assessment" class="aaq-header-button">▤ ASSESSMENT MODE</button><button id="aaq-focus" class="aaq-header-button">FOCUS MODE ⛶</button></header>
      <aside class="aaq-sidebar"><div class="aaq-sidebar-heading"><span>HUMAN BIOLOGY PRACTICALS</span><b>${AAQ_PRACTICALS.length}</b></div><label class="aaq-filter"><span class="sr-only">Filter practicals</span><select id="aaq-filter">${groups.map(item => `<option value="${item.id}">${item.label}</option>`).join('')}</select></label><nav id="aaq-catalogue" aria-label="Human Biology practicals"></nav><div class="aaq-sidebar-foot"><span class="aaq-live-dot"></span> Learning simulations <a href="${AAQ_SPEC_URL}" target="_blank" rel="noreferrer">OCR specification ↗</a></div></aside>
      <div class="aaq-workspace"><div class="aaq-intro" id="aaq-intro"></div><div class="aaq-arena"><canvas id="aaq-canvas" aria-label="Animated three-dimensional practical equipment"></canvas><div class="aaq-scene-label"><span class="aaq-live-dot"></span> <span id="aaq-scene-status">READY TO EXPLORE</span></div><div class="aaq-step-indicator" id="aaq-step-indicator"></div><div class="aaq-loading" id="aaq-loading" role="status">Preparing your laboratory…</div><div id="aaq-observation" class="aaq-observation" hidden></div><div class="aaq-scene-note">SIMULATED DATA · ANIMATION TIME COMPRESSED</div></div><div class="aaq-console"><div class="aaq-console-actions"><button class="aaq-button aaq-primary" id="aaq-primary"></button><button class="aaq-button" id="aaq-repeat">NEW TRIAL</button><button class="aaq-reset" id="aaq-reset" aria-label="Reset this practical and clear its results" title="Reset this practical">↺</button></div><div class="aaq-reading"><span id="aaq-reading-label">LIVE READING</span><strong id="aaq-reading">—</strong></div><div class="aaq-status" id="aaq-status" role="status" aria-live="polite"></div></div></div>
      <aside class="aaq-inspector"><div class="aaq-panel-tabs" role="tablist" aria-label="Practical information">${[['method', 'METHOD'], ['equipment', 'EQUIPMENT'], ['results', 'RESULTS'], ['evaluate', 'EVALUATE']].map(([id, label]) => `<button role="tab" id="aaq-tab-${id}" aria-controls="aaq-panel" data-panel="${id}">${label}</button>`).join('')}</div><div id="aaq-panel" role="tabpanel"></div><div class="aaq-practice-note">Practice the technique and interpretation. Virtual results do not replace hands-on NEA evidence.</div></aside>
    </section>`;
  document.querySelector('main').append(host);
  const $ = selector => host.querySelector(selector);
  const root = $('#aaq');
  const current = () => AAQ_PRACTICALS.find(practical => practical.id === selected);
  function session() {
    if (!sessions.has(selected)) sessions.set(selected, { stage: 0, progress: 0, running: false, parameter: current().parameter.value, trialIndex: 0, result: null, results: [], completed: false, status: 'Equipment is ready. Set your condition, then begin the method.', answer: null, notes: '', unknown: false });
    return sessions.get(selected);
  }
  function source(practical) {
    return `${AAQ_SPEC_URL}#page=${practical.page}`;
  }
  function renderCatalogue() {
    $('#aaq-catalogue').innerHTML = AAQ_PRACTICALS.filter(practical => group === 'all' || practical.group === group).map(practical => {
      const saved = sessions.get(practical.id)?.results.length || 0;
      return `<button class="aaq-practical${selected === practical.id ? ' is-selected' : ''}" data-practical="${practical.id}" aria-current="${selected === practical.id ? 'true' : 'false'}" style="--practical-color:${practical.color}"><span class="aaq-practical-icon" aria-hidden="true">${escapeHTML(practical.icon)}</span><span class="aaq-practical-copy"><strong>${escapeHTML(practical.title)}</strong><small>${escapeHTML(practical.unit)} · ${escapeHTML(practical.subtitle)}</small></span>${saved ? `<span class="aaq-saved" aria-label="${saved} saved trials">✓</span>` : ''}</button>`;
    }).join('');
  }
  function renderIntro() {
    const practical = current();
    root.style.setProperty('--practical-color', practical.color);
    $('#aaq-intro').innerHTML = `<div class="aaq-eyebrow"><span>${escapeHTML(practical.unit)} <span class="aaq-unit-divider">/</span> ${escapeHTML(practical.topic)}</span><a href="${source(practical)}" target="_blank" rel="noreferrer">SPECIFICATION ↗</a></div><h1>${escapeHTML(practical.title)}</h1><p>${escapeHTML(practical.objective)}</p><div class="aaq-principle"><span>THE SCIENCE</span><strong>${escapeHTML(practical.principle)}</strong></div>`;
  }
  function renderMethod() {
    const practical = current(), state = session(), parameter = practical.parameter;
    return `<div class="aaq-panel-heading"><h2>Your method</h2><span>${Math.min(state.stage, 4)} / 4</span></div><p class="aaq-panel-intro">Work through the technique. Select a step to revisit its setup.</p><ol class="aaq-method-list">${practical.steps.map((step, index) => `<li><button class="aaq-step${state.stage === index ? ' is-active' : ''}${state.stage > index ? ' is-done' : ''}" data-step="${index}"><span class="aaq-step-number">${state.stage > index ? '✓' : index + 1}</span><span><strong>${escapeHTML(step.title)}</strong><small>${escapeHTML(step.detail)}</small></span></button></li>`).join('')}</ol><div class="aaq-condition"><label for="aaq-parameter">${escapeHTML(parameter.label)} <output id="aaq-parameter-value">${fmt(state.parameter)} ${escapeHTML(parameter.unit)}</output></label><input id="aaq-parameter" type="range" min="${parameter.min}" max="${parameter.max}" step="${parameter.step}" value="${state.parameter}" ${state.stage > 0 || state.running ? 'disabled' : ''}><div class="aaq-range-extents"><span>${parameter.min} ${escapeHTML(parameter.unit)}</span><span>${parameter.max} ${escapeHTML(parameter.unit)}</span></div><p>${state.stage > 0 ? 'Choose NEW TRIAL to change this condition.' : 'Set the condition before starting this trial.'}</p></div><details class="aaq-detail"><summary>Keep the comparison fair</summary><p>${escapeHTML(practical.controls || practical.control || 'Keep sample size, apparatus, observation time and all other conditions constant.')}</p></details>`;
  }
  function graphMarkup(rows) {
    if (!rows.length) return '<div class="aaq-empty"><span>⌁</span><strong>Your results start here</strong><p>Complete the method and record a reading. Try another condition to build a comparison.</p></div>';
    const practical = current(), summary = summariseAAQResults(rows), width = 280, height = 207;
    const left = 47, right = 266, top = 18, bottom = 158;
    const xmin = practical.parameter.min, xmax = practical.parameter.max;
    const ymax = Math.max(1, ...rows.map(row => row.value)) * 1.18;
    const px = value => left + (value - xmin) / (xmax - xmin || 1) * (right - left);
    const py = value => bottom - value / ymax * (bottom - top);
    return `<figure class="aaq-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(rows[0].label)} against ${escapeHTML(practical.parameter.label)}. ${rows.length} recorded readings."><rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="#fff"/>${Array.from({ length: 5 }, (_, index) => { const value = ymax * index / 4, y = py(value); return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#e6ecec"/><text x="${left - 6}" y="${y + 3}" text-anchor="end">${fmt(value)}</text>`; }).join('')}<path d="M${left},${top}V${bottom}H${right}" fill="none" stroke="#9caeb4"/>${[xmin, (xmin + xmax) / 2, xmax].map(value => `<text x="${px(value)}" y="${bottom + 17}" text-anchor="middle">${fmt(value)}</text>`).join('')}<polyline points="${summary.map(row => `${px(row.parameter)},${py(row.mean)}`).join(' ')}" stroke="#087f75" stroke-width="2" fill="none"/>${rows.map(row => `<circle cx="${px(row.parameter)}" cy="${py(row.value)}" r="4" fill="#087f75" stroke="white" stroke-width="1.5"><title>${fmt(row.parameter)}: ${fmt(row.value)}</title></circle>`).join('')}<text x="156" y="${height - 10}" text-anchor="middle">${escapeHTML(practical.parameter.label)} (${escapeHTML(practical.parameter.unit)})</text><text transform="translate(12 88) rotate(-90)" text-anchor="middle">${escapeHTML(rows[0].unit)}</text></svg><figcaption>${escapeHTML(rows[0].label)} · illustrative model</figcaption></figure>`;
  }
  function renderResults() {
    const state = session(), practical = current(), rows = state.results, latest = rows.at(-1);
    return `<div class="aaq-panel-heading"><h2>Results notebook</h2><span>${rows.length} saved</span></div>${latest?.qualitative ? '<p class="aaq-panel-intro">Record the observed colour. These categories are semi-quantitative; they are not continuous absorbance measurements.</p>' : graphMarkup(rows)}${rows.length ? `<div class="aaq-table-scroll"><table><caption>${escapeHTML(practical.title)} · simulated readings</caption><thead><tr><th>Trial</th><th>${escapeHTML(practical.parameter.label)}<small>${escapeHTML(practical.parameter.unit)}</small></th><th>${escapeHTML(latest.label)}<small>${escapeHTML(latest.unit)}</small></th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td>${fmt(row.parameter)}</td><td>${escapeHTML(row.display || fmt(row.value))}</td></tr>`).join('')}</tbody></table></div><button class="aaq-button aaq-export" id="aaq-export">↓ DOWNLOAD RESULTS (.CSV)</button><div class="aaq-result-explanation">${escapeHTML(latest.explanation)}</div>${practical.scene === 'colorimeter' ? `<div class="aaq-condition"><strong>Unknown sample · A = 0.486</strong><p>Measure standards below and above the unknown to interpolate its concentration.</p><button class="aaq-button" id="aaq-unknown" ${!(rows.some(row => row.parameter < 2.7) && rows.some(row => row.parameter > 2.7)) ? 'disabled' : ''}>ESTIMATE UNKNOWN</button>${state.unknown ? '<p class="aaq-feedback correct">0.486 ÷ 0.180 = <strong>2.70 g dm⁻³</strong> in this model.</p>' : ''}</div>` : ''}<details class="aaq-detail"><summary>Repeats and uncertainty</summary><p>This deterministic model gives identical readings at the same condition. Repeats practise recording; a zero simulated range does not mean real measurements have zero uncertainty.</p>${summariseAAQResults(rows).map(row => `<p>${fmt(row.parameter)} ${escapeHTML(practical.parameter.unit)}: n = ${row.count}, mean = ${fmt(row.mean)}, range = ${fmt(row.range)}.</p>`).join('')}</details>` : ''}`;
  }
  function renderEvaluate() {
    const state = session(), practical = current(), question = practical.question;
    return `<div class="aaq-panel-heading"><h2>Check your understanding</h2><span>PRACTICE</span></div><p class="aaq-panel-intro">An independent learning check for this practical.</p><div class="aaq-question"><h3>${escapeHTML(question.prompt)}</h3><div class="aaq-answers">${question.options.map((option, index) => `<button data-answer="${index}" class="aaq-answer${state.answer === index ? ' is-chosen' : ''}" aria-pressed="${state.answer === index}"><span>${String.fromCharCode(65 + index)}</span>${escapeHTML(option)}</button>`).join('')}</div>${state.answer !== null ? `<div class="aaq-feedback ${state.answer === question.answer ? 'correct' : 'retry'}" role="status"><strong>${state.answer === question.answer ? 'Correct.' : 'Reconsider your answer.'}</strong> ${escapeHTML(question.explanation)}</div>` : ''}</div><details class="aaq-detail" open><summary>Evaluate this investigation</summary><p>${escapeHTML(practical.controls || 'Consider control variables, calibration and repeated observations.')}</p><p>${escapeHTML(practical.simLimit || practical.caution || 'The model simplifies a biological system. Evaluate sources of uncertainty and individual biological variation before generalising a trend.')}</p></details><label class="aaq-notes-label" for="aaq-notes">Your conclusion</label><textarea id="aaq-notes" rows="4" placeholder="Use your readings to explain a pattern and suggest an improvement…">${escapeHTML(state.notes)}</textarea><p class="aaq-panel-intro">Notes and results stay available while this page is open.</p><a class="aaq-source-link" href="${source(practical)}" target="_blank" rel="noreferrer">${escapeHTML(practical.unit)} · ${escapeHTML(practical.topic)} · OCR specification p. ${practical.page} ↗</a>`;
  }
  function renderPanel() {
    host.querySelectorAll('[data-panel]').forEach(button => { button.classList.toggle('is-active', button.dataset.panel === panel); button.setAttribute('aria-selected', button.dataset.panel === panel); });
    $('#aaq-panel').setAttribute('aria-labelledby', `aaq-tab-${panel}`);
    const practical = current();
    $('#aaq-panel').innerHTML = panel === 'method' ? renderMethod() : panel === 'results' ? renderResults() : panel === 'evaluate' ? renderEvaluate() : `<div class="aaq-panel-heading"><h2>On your bench</h2><span>READY</span></div><p class="aaq-panel-intro">The equipment is prepared for this guided practical.</p><ul class="aaq-equipment-list">${practical.equipment.map((item, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHTML(item)}</strong><small>Prepared on the virtual bench</small></div><b aria-label="Ready">✓</b></li>`).join('')}</ul><div class="aaq-result-explanation"><strong>Working with samples</strong><p>${escapeHTML(practical.caution || practical.simLimit || 'This practical uses synthetic samples and readings.')}</p></div><a class="aaq-source-link" href="${source(practical)}" target="_blank" rel="noreferrer">View OCR topic mapping ↗</a>`;
    $('#aaq-assessment').classList.toggle('is-active', panel === 'evaluate');
  }
  function renderControls() {
    const state = session(), practical = current(), step = practical.steps[Math.min(state.stage, 3)];
    const button = $('#aaq-primary');
    button.textContent = state.completed ? '✓ TRIAL RECORDED' : state.running ? `${step.title}…` : step.title;
    button.disabled = state.running || state.completed;
    button.style.setProperty('--step-progress', `${state.running ? state.progress * 100 : 0}%`);
    $('#aaq-repeat').disabled = state.running || (state.stage === 0 && !state.result);
    $('#aaq-scene-status').textContent = state.running ? 'PRACTICAL IN PROGRESS' : state.completed ? 'READING SAVED' : state.stage === 3 ? 'READY TO RECORD' : 'READY TO EXPLORE';
    $('#aaq-step-indicator').innerHTML = practical.steps.map((_, index) => `<span class="${index < state.stage ? 'is-done' : index === state.stage ? 'is-current' : ''}">${index < state.stage ? '✓' : index + 1}</span>`).join('');
    $('#aaq-reading-label').textContent = state.result ? state.result.label.toUpperCase() : 'LIVE READING';
    $('#aaq-reading').innerHTML = state.result ? `${escapeHTML(state.result.display || fmt(state.result.value))} <small>${escapeHTML(state.result.qualitative ? '' : state.result.unit)}</small>` : '— <small>Awaiting measurement</small>';
    $('#aaq-status').textContent = state.status;
    const observation = $('#aaq-observation');
    observation.hidden = !state.result;
    if (state.result) observation.innerHTML = `<span>OBSERVATION</span><strong>${escapeHTML(state.result.display || fmt(state.result.value))} ${escapeHTML(state.result.qualitative ? '' : state.result.unit)}</strong><p>${escapeHTML(state.result.label)}</p>`;
  }
  function render() { renderCatalogue(); renderIntro(); renderPanel(); renderControls(); renderScene(); }
  function renderScene() {
    if (course !== 'aaq' || !renderer) return;
    const state = session();
    renderer.render(reducedMotion.matches ? 0 : clock, state, current());
  }
  function resizeScene() {
    if (!renderer || course !== 'aaq') return;
    const arena = $('.aaq-arena');
    renderer.resize(arena.clientWidth, arena.clientHeight, Math.min(devicePixelRatio || 1, 2));
    renderScene();
  }
  async function ensureRenderer() {
    if (renderer) return;
    if (!rendererPromise) rendererPromise = import('./aaq-scene.js?v=20260908-4').then(({ AAQScene }) => {
      renderer = new AAQScene($('#aaq-canvas'));
      if (!renderer.available) { renderer.dispose(); renderer = null; throw new Error('WebGL is unavailable'); }
      $('#aaq-loading').hidden = true;
      resizeScene();
      return renderer;
    }).catch(error => {
      rendererPromise = null;
      $('#aaq-loading').textContent = 'The 3D view could not start. Reload this page to retry; methods and results remain available.';
      console.warn('AAQ laboratory renderer unavailable:', error);
    });
    await rendererPromise;
  }
  function advance(dt) {
    clock += dt * 1000;
    const state = session();
    if (!state.running) return;
    state.progress = Math.min(1, state.progress + dt / (state.stage === 2 ? 2.8 : 1.65));
    if (state.progress >= 1) {
      state.running = false;
      state.progress = 0;
      state.stage++;
      if (state.stage === 3) {
        state.result = calculateAAQResult(current(), state.parameter, state.trialIndex);
        state.status = 'Measurement complete. Record this reading in your results notebook.';
      } else state.status = `${current().steps[state.stage - 1].title} complete. ${current().steps[state.stage].detail}`;
      renderPanel();
    }
    renderControls();
  }
  function frame(time) {
    raf = 0;
    if (course !== 'aaq' || document.hidden) return;
    const dt = previousTime ? Math.min(.05, (time - previousTime) / 1000) : 0;
    previousTime = time;
    if (!window.__manualSimulationTime) advance(dt);
    renderScene();
    if (!window.__manualSimulationTime && session().running) raf = requestAnimationFrame(frame);
  }
  function schedule() { if (!raf && course === 'aaq' && !document.hidden) { previousTime = 0; raf = requestAnimationFrame(frame); } }
  function select(id) {
    if (!AAQ_PRACTICALS.some(practical => practical.id === id)) return;
    session().running = false;
    session().progress = 0;
    selected = id;
    if (group !== 'all' && current().group !== group) { group = 'all'; $('#aaq-filter').value = group; }
    panel = 'method';
    render();
    resizeScene();
    schedule();
  }
  function startStep() {
    const state = session();
    if (state.running || state.completed) return;
    if (state.stage === 3) {
      state.results.push({ ...state.result, parameter: state.parameter, trial: state.results.length + 1 });
      state.stage = 4;
      state.completed = true;
      state.status = `Trial ${state.results.length} saved. Start a new trial to compare another condition, or explore your results.`;
      panel = 'results';
      render();
    } else {
      state.running = true;
      state.progress = 0;
      state.status = current().steps[state.stage].detail;
      renderPanel();
      renderControls();
    }
    schedule();
  }
  function repeat() {
    const state = session();
    Object.assign(state, { stage: 0, progress: 0, running: false, result: null, completed: false, trialIndex: state.trialIndex + 1, status: 'A fresh trial is ready. Change the condition or repeat the same value.' });
    panel = 'method';
    render();
  }
  function download() {
    const state = session(), practical = current();
    const csv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['Course', 'OCR AAQ Human Biology'], ['Practical', practical.title], ['Source', source(practical)], ['Data type', 'Synthetic learning simulation; not NEA evidence or clinical data'], ['Trial', `${practical.parameter.label} (${practical.parameter.unit})`, 'Reading', 'Unit', 'Observation'], ...state.results.map(row => [row.trial, row.parameter, row.value, row.unit, row.display || row.label])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csv).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `OCR-AAQ-${practical.id}-results.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function setCourse(value) {
    course = value === 'aaq' ? 'aaq' : 'gcse';
    $('#course-select').value = course;
    root.hidden = course !== 'aaq';
    document.body.classList.toggle('aaq-active', course === 'aaq');
    document.title = `Practical Lab — ${course === 'aaq' ? 'OCR AAQ Human Biology' : 'OCR GCSE Combined Science'}`;
    if (course === 'gcse') {
      session().running = false;
      session().progress = 0;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    onCourseChange(course);
    syncViewport();
    if (course === 'aaq') { render(); ensureRenderer(); schedule(); }
  }
  function syncViewport() {
    const viewport = getViewport(), layout = viewport.header;
    host.style.width = `${viewport.width}px`;
    host.style.height = `${viewport.height}px`;
    host.style.transform = `scale(${viewport.scale})`;
    host.style.setProperty('--aaq-inspector-width', `${Math.max(280, Math.min(330, viewport.width * .23))}px`);
    const picker = $('.course-picker');
    picker.hidden = viewport.portrait || (course === 'gcse' && isGCSEFocus());
    if (layout) {
      const bounds = layout.picker, fs = layout.fontScale;
      Object.assign(picker.style, { left: `${bounds.x}px`, right: 'auto', top: `${bounds.y}px`, width: `${bounds.w}px`, height: `${bounds.h}px` });
      Object.assign($('#course-select').style, { fontSize: `${(layout.compact ? 12 : 11) * fs}px`, padding: `0 ${30 * fs}px 0 ${12 * fs}px`, borderRadius: `${bounds.h / 2}px` });
      Object.assign(picker.lastElementChild.style, { right: `${11 * fs}px`, top: `${(bounds.h - 22 * fs) / 2}px`, fontSize: `${17 * fs}px` });
      host.style.setProperty('--header-font-scale', String(fs));
      root.classList.toggle('aaq-compact', layout.compact);
      for (const [id, position] of [['aaq-assessment', layout.assessment], ['aaq-focus', layout.focus]]) {
        Object.assign($(`#${id}`).style, { position: 'absolute', left: `${position.x}px`, top: `${position.y}px`, width: `${position.w}px`, height: `${position.h}px`, fontSize: `${10 * fs}px`, margin: '0' });
      }
      $('#aaq-assessment').textContent = layout.dense ? '▤ ASSESSMENT' : '▤ ASSESSMENT MODE';
      $('#aaq-focus').textContent = focus ? 'EXIT FOCUS ⛶' : layout.dense ? 'FOCUS ⛶' : 'FOCUS MODE ⛶';
    }
    resizeScene();
  }
  host.addEventListener('change', event => {
    if (event.target.id === 'course-select') setCourse(event.target.value);
    if (event.target.id === 'aaq-filter') { group = event.target.value; renderCatalogue(); }
  });
  host.addEventListener('input', event => {
    if (event.target.id === 'aaq-parameter' && session().stage === 0 && !session().running) {
      const parameter = current().parameter, value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      session().parameter = Math.max(parameter.min, Math.min(parameter.max, value));
      $('#aaq-parameter-value').textContent = `${fmt(session().parameter)} ${parameter.unit}`;
      renderScene();
    }
    if (event.target.id === 'aaq-notes') session().notes = event.target.value;
  });
  host.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.practical) select(target.dataset.practical);
    if (target.dataset.panel) { panel = target.dataset.panel; renderPanel(); }
    if (target.dataset.step !== undefined) {
      const state = session(), step = Number(target.dataset.step);
      Object.assign(state, { stage: step, progress: 0, running: false, completed: false, result: step === 3 ? calculateAAQResult(current(), state.parameter, state.trialIndex) : null, status: `Step ${step + 1} setup preview. ${current().steps[step].detail}` });
      renderPanel(); renderControls(); renderScene();
    }
    if (target.dataset.answer !== undefined) { session().answer = Number(target.dataset.answer); renderPanel(); }
    if (target.id === 'aaq-primary') startStep();
    if (target.id === 'aaq-repeat') repeat();
    if (target.id === 'aaq-reset') { sessions.delete(selected); panel = 'method'; render(); }
    if (target.id === 'aaq-export') download();
    if (target.id === 'aaq-unknown') { session().unknown = true; renderPanel(); }
    if (target.id === 'aaq-assessment') { panel = panel === 'evaluate' ? 'method' : 'evaluate'; renderPanel(); }
    if (target.id === 'aaq-focus') { focus = !focus; root.classList.toggle('aaq-focused', focus); target.classList.toggle('is-active', focus); target.textContent = focus ? 'EXIT FOCUS ⛶' : 'FOCUS MODE ⛶'; resizeScene(); }
  });
  // Keep keystrokes used in form controls away from the legacy canvas shortcuts.
  host.addEventListener('keydown', event => { if (event.target.matches('input,select,textarea')) event.stopPropagation(); });
  document.addEventListener('keydown', event => {
    if (course === 'aaq' && event.key === 'Escape' && focus) { focus = false; root.classList.remove('aaq-focused'); $('#aaq-focus').classList.remove('is-active'); $('#aaq-focus').textContent = 'FOCUS MODE ⛶'; resizeScene(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else schedule(); });
  const api = { setCourse, syncViewport, select, getState: () => ({ course, selected, practical: current(), panel, focus, renderer: renderer ? 'Three.js' : 'loading', ...JSON.parse(JSON.stringify(session())) }), advanceTime: milliseconds => { for (let remaining = milliseconds; remaining > 0; remaining -= 16.67) advance(Math.min(16.67, remaining) / 1000); renderScene(); }, active: () => course === 'aaq' };
  window.__aaq = api;
  syncViewport();
  if (new URLSearchParams(location.search).get('course') === 'aaq') setCourse('aaq');
  return api;
}
