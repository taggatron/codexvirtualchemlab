import { mountAssessmentBench } from './assessment-bench.js';
import { clearAssembly, evaluateAssembly } from './assessment-assembly.js?v=20260916-1';

const PHASES = [
  { id: 'apparatus', title: 'Build the setup', short: 'Setup' },
  { id: 'method', title: 'Method & reasoning', short: 'Method' },
  { id: 'limitations', title: 'Evaluate & improve', short: 'Evaluate' },
  { id: 'summary', title: 'Your results', short: 'Results' }
];
const SVG = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="m14 6-6 6 6 6M8 12h12"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  flask: '<path d="M9 3h6m-5 0v7l-5.5 9a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 10V3M8 16h8"/>',
  move: '<path d="M12 3v18M3 12h18m-13-5 4-4 4 4m-9 9-4-4 4-4m9 8 5-4-5-4m-9 9 4 4 4-4"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  link: '<path d="m9 15 6-6m-5 8-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0-2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'
};
function icon(name, className = '') {
  const span = document.createElement('span');
  span.className = `assessment-icon ${className}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SVG[name] || SVG.flask}</svg>`;
  return span;
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function button(text, className, action, iconName) {
  const node = el('button', `assessment-button ${className || ''}`);
  node.type = 'button';
  if (iconName) node.append(icon(iconName));
  node.append(el('span', '', text));
  if (action) node.addEventListener('click', action);
  return node;
}
function badge(text, className = '') { return el('span', `assessment-badge ${className}`, text); }
function sectionHeading(eyebrow, title, detail) {
  const header = el('div', 'assessment-section-heading');
  if (eyebrow) header.append(el('div', 'assessment-eyebrow', eyebrow));
  header.append(el('h2', '', title));
  if (detail) header.append(el('p', '', detail));
  return header;
}
function getPlaced(session) {
  return session.placedEquipment instanceof Map ? [...session.placedEquipment.keys()] : Array.isArray(session.placedEquipment) ? session.placedEquipment.map(item => item.id) : Object.keys(session.placedEquipment || {});
}
function maxScores(session) {
  const spec = session.assemblySpec;
  return [
    session.apparatusMaxScore ?? session.maxApparatusScore ?? (spec ? spec.items.filter(item => item.required).length + spec.connections.length + (spec.rules?.length || 0) + 2 : session.data.apparatusChallenge.slots.length + 2),
    session.data.methodChallenge.correctOrder.length,
    session.data.methodChallenge.reasoningQuestions.length * 2,
    session.data.limitationsChallenge.length * 3
  ];
}
function cleanFeedback(message) { return String(message || '').replace(/^[✓✕⚠]\s*/, ''); }

/** A native, responsive assessment interface. The physical bench stays mounted while it is edited. */
export function createAssessmentUI({ state, practicals, assessment, draw }) {
  let activeSession = null;
  let activePhase = null;
  let lastSignature = '';
  let bench = null;
  let selectedItemId = null;
  let ui = {};
  let dragStepId = null;
  let destroyed = false;
  const app = el('section', 'assessment-app');
  app.hidden = true;
  app.setAttribute('aria-label', 'GCSE science practical assessment');
  const live = el('div', 'assessment-sr-only');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  document.body.append(app);

  function announce(message) {
    live.textContent = '';
    requestAnimationFrame(() => { if (!destroyed) live.textContent = message; });
  }
  function changed(message) {
    assessment.updateSessionTotals(activeSession);
    lastSignature = '';
    sync();
    if (message) announce(message);
    draw();
  }
  function goToPhase(phase) {
    activeSession.currentPhase = phase;
    changed();
    ui.main?.focus({ preventScroll: true });
  }
  function invalidate(domain) {
    if (domain === 'order') { activeSession.methodOrderChecked = false; activeSession.methodOrderScore = 0; }
    if (domain === 'questions') { activeSession.methodQuestionsChecked = false; activeSession.methodQuestionsScore = 0; }
    if (domain === 'limitations') { activeSession.limitationsChecked = false; activeSession.limitationsScore = 0; }
    if (domain === 'apparatus') { activeSession.apparatusChecked = false; activeSession.apparatusScore = 0; activeSession.apparatusFeedback = null; }
  }
  function makeShell() {
    bench?.destroy();
    bench = null;
    selectedItemId = null;
    app.replaceChildren();
    const header = el('header', 'assessment-header');
    const identity = el('div', 'assessment-identity');
    const brand = el('div', 'assessment-brand');
    brand.append(icon('flask'), el('span', '', 'PRACTICAL LAB'));
    identity.append(brand, el('span', 'assessment-course', 'GCSE Combined Science · Assessment'));
    const title = el('h1', 'assessment-practical-title', practicals[state.selected]?.title || activeSession.data.title);
    const score = el('div', 'assessment-header-score');
    const exit = button('Back to lab', 'assessment-exit', () => {
      state.assessmentMode = false;
      state.assessmentDrag = null;
      sync();
      draw();
    }, 'close');
    header.append(identity, title, score, exit);
    const nav = el('nav', 'assessment-phases');
    nav.setAttribute('aria-label', 'Assessment stages');
    const tabs = PHASES.map((phase, index) => {
      const tab = button('', 'assessment-phase', () => goToPhase(phase.id));
      tab.replaceChildren(el('span', 'assessment-phase-number', String(index + 1)), el('span', 'assessment-phase-label', phase.title), el('span', 'assessment-phase-status'));
      tab.dataset.phase = phase.id;
      nav.append(tab);
      return tab;
    });
    const main = el('main', 'assessment-main');
    main.tabIndex = -1;
    app.append(header, nav, main, live);
    ui = { header, score, main, tabs };
  }
  function updateHeader() {
    ui.score.replaceChildren(el('span', '', 'Practice score'), el('strong', '', `${activeSession.totalScore || 0} / ${activeSession.maxPossibleScore || maxScores(activeSession).reduce((a,b)=>a+b,0)}`));
    const completed = [activeSession.apparatusChecked, activeSession.methodOrderChecked && activeSession.methodQuestionsChecked, activeSession.limitationsChecked, false];
    ui.tabs.forEach((tab, index) => {
      const current = PHASES[index].id === activeSession.currentPhase;
      tab.classList.toggle('is-active', current);
      tab.classList.toggle('is-complete', !!completed[index]);
      if (current) tab.setAttribute('aria-current', 'step'); else tab.removeAttribute('aria-current');
      const status = tab.querySelector('.assessment-phase-status');
      status.replaceChildren(...(completed[index] ? [icon('check')] : []));
    });
  }
  function buildSetup() {
    const main = ui.main;
    main.className = 'assessment-main assessment-setup';
    const brief = el('div', 'assessment-task-brief');
    brief.append(sectionHeading('01 / APPARATUS', 'Build your practical', activeSession.assemblySpec?.brief || activeSession.data.taskScenario));
    const help = el('div', 'assessment-brief-tip');
    help.append(icon('move'), el('span', '', 'Drag equipment onto the bench. Move related parts together to connect them.'));
    brief.append(help);
    const grid = el('div', 'assessment-setup-grid');
    const palette = el('aside', 'assessment-panel assessment-palette');
    palette.setAttribute('aria-label', 'Equipment library');
    palette.append(sectionHeading(null, 'Equipment', 'Choose what this investigation needs.'));
    const paletteList = el('div', 'assessment-palette-list');
    const paletteButtons = new Map();
    const items = activeSession.assemblySpec?.items || activeSession.data.apparatusChallenge.palette;
    items.forEach((item, index) => {
      const itemButton = el('button', 'assessment-equipment');
      itemButton.type = 'button';
      itemButton.dataset.itemId = item.id;
      itemButton.setAttribute('aria-label', `Add ${item.name} to the bench`);
      const itemIcon = el('span', 'assessment-equipment-icon', String(index + 1));
      itemIcon.setAttribute('aria-hidden', 'true');
      const copy = el('span', 'assessment-equipment-copy');
      copy.append(el('strong', '', item.name), el('span', 'assessment-equipment-action', 'Drag to bench'));
      itemButton.append(itemIcon, copy, el('span', 'assessment-equipment-mark', '+'));
      itemButton.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        bench?.startPaletteDrag(event, item.id);
      });
      itemButton.addEventListener('click', event => { if (event.detail === 0) bench?.selectItem(item.id); });
      paletteButtons.set(item.id, itemButton);
      paletteList.append(itemButton);
    });
    palette.append(paletteList);
    const paletteNote = el('div', 'assessment-palette-note');
    paletteNote.append(icon('info'), el('p', '', 'Using a keyboard? Press Enter on an item, then use the bench controls to position it.'));
    palette.append(paletteNote);
    const benchPanel = el('section', 'assessment-panel assessment-bench-panel');
    const benchHeading = el('div', 'assessment-bench-heading');
    const benchTitle = el('div');
    benchTitle.append(el('h2', '', 'Your lab bench'), el('p', '', 'Arrange, connect, then check your setup.'));
    const benchCount = badge('0 items on bench');
    benchHeading.append(benchTitle, benchCount);
    const benchHost = el('div', 'assessment-bench-host');
    const benchTools = el('div', 'assessment-bench-tools');
    const status = el('span', 'assessment-bench-status', 'Select a piece of equipment to move or remove it.');
    const remove = button('Remove', 'assessment-button-quiet', () => bench?.removeSelected(), 'trash');
    remove.disabled = true;
    const undo = button('Undo', 'assessment-button-quiet', () => {
      const previous = activeSession.assemblyHistory?.pop();
      if (!previous) return;
      activeSession.placedEquipment = previous;
      activeSession.assemblyConnections = evaluateAssembly(activeSession).connections.filter(connection => connection.valid).map(connection => connection.id);
      activeSession.assemblyEvaluation = null;
      selectedItemId = null;
      invalidate('apparatus');
      changed('Last bench change undone.');
    }, 'back');
    const clear = button('Clear bench', 'assessment-button-quiet', () => {
      if (!getPlaced(activeSession).length) return;
      activeSession.assemblyHistory ||= [];
      activeSession.assemblyHistory.push(structuredClone(activeSession.placedEquipment));
      if (activeSession.assemblyHistory.length > 30) activeSession.assemblyHistory.shift();
      clearAssembly(activeSession);
      activeSession.assemblyEvaluation = null;
      selectedItemId = null;
      invalidate('apparatus');
      changed('Bench cleared. Use Undo to restore your setup.');
    }, 'reset');
    benchTools.append(status, undo, remove, clear);
    const actions = el('div', 'assessment-panel-actions');
    const check = button('Check my setup', 'assessment-button-primary', () => {
      assessment.checkApparatusPhase(activeSession);
      changed(`Setup checked. ${activeSession.apparatusScore} of ${maxScores(activeSession)[0]} marks.`);
    }, 'check');
    const next = button('Method & reasoning', 'assessment-button-secondary', () => goToPhase('method'), 'arrow');
    actions.append(check, next);
    benchPanel.append(benchHeading, benchHost, benchTools, actions);
    const feedback = el('aside', 'assessment-panel assessment-feedback-panel');
    feedback.setAttribute('aria-label', 'Setup feedback');
    grid.append(palette, benchPanel, feedback);
    main.append(brief, grid);
    Object.assign(ui, { paletteButtons, benchCount, benchHost, feedback, remove, undo, clear, benchStatus: status });
    bench = mountAssessmentBench(benchHost, {
      session: activeSession,
      onChange: () => { invalidate('apparatus'); changed(); },
      onSelect: selected => {
        selectedItemId = typeof selected === 'string' ? selected : selected?.id || null;
        updateSelection();
      },
      onAnnounce: announce
    });
    updateSetup();
  }
  function updateSelection() {
    const items = activeSession.assemblySpec?.items || activeSession.data.apparatusChallenge.palette;
    const item = getPlaced(activeSession).includes(selectedItemId) ? items.find(entry => entry.id === selectedItemId) : null;
    ui.remove.disabled = !item;
    ui.benchStatus.textContent = item ? `${item.name} selected` : 'Select a piece of equipment to move or remove it.';
    ui.paletteButtons?.forEach((node, id) => node.classList.toggle('is-selected', id === selectedItemId));
  }
  function updateSetup() {
    const placed = new Set(getPlaced(activeSession));
    ui.undo.disabled = !activeSession.assemblyHistory?.length;
    ui.clear.disabled = !placed.size;
    ui.benchCount.textContent = `${placed.size} ${placed.size === 1 ? 'item' : 'items'} on bench`;
    ui.paletteButtons.forEach((node, id) => {
      node.classList.toggle('is-placed', placed.has(id));
      node.querySelector('.assessment-equipment-action').textContent = placed.has(id) ? 'On your bench' : 'Drag to bench';
      node.querySelector('.assessment-equipment-mark').textContent = placed.has(id) ? '✓' : '+';
      node.setAttribute('aria-pressed', String(placed.has(id)));
    });
    const feedback = ui.feedback;
    feedback.replaceChildren(sectionHeading(null, 'Setup review', activeSession.apparatusChecked ? 'Use this feedback to refine your assembly.' : 'Your apparatus and its connections will be assessed.'));
    if (!activeSession.apparatusChecked) {
      const instructions = el('div', 'assessment-setup-guide');
      [
        ['1', 'Choose your equipment', 'Select only the apparatus needed for the investigation.'],
        ['2', 'Build the arrangement', 'Bring parts close together. A connection appears when they snap into place.'],
        ['3', 'Check your decisions', 'Assessment checks what you chose and how the equipment is connected.']
      ].forEach(([number, title, detail]) => {
        const step = el('div', 'assessment-guide-step');
        const copy = el('div');
        copy.append(el('h3', '', title), el('p', '', detail));
        step.append(el('span', 'assessment-guide-number', number), copy);
        instructions.append(step);
      });
      feedback.append(instructions);
      const reminder = el('div', 'assessment-review-reminder');
      reminder.append(icon('link'), el('p', '', 'Equipment on the bench is only part of the task. Its physical arrangement matters too.'));
      feedback.append(reminder);
    } else {
      const maximum = maxScores(activeSession)[0];
      const complete = activeSession.apparatusScore === maximum;
      const result = el('div', `assessment-setup-result ${complete ? 'is-correct' : ''}`);
      result.append(el('strong', '', `${activeSession.apparatusScore} / ${maximum}`), el('span', '', complete ? 'Setup complete' : 'Setup marks'));
      feedback.append(result);
      const list = el('ul', 'assessment-feedback-list');
      (activeSession.apparatusFeedback || []).forEach(entry => {
        const row = el('li', `assessment-feedback-entry is-${entry.status}`);
        row.append(icon(entry.status === 'correct' ? 'check' : 'info'));
        const copy = el('div');
        if (entry.slot || entry.title) copy.append(el('strong', '', entry.slot || entry.title));
        copy.append(el('p', '', cleanFeedback(entry.message)));
        row.append(copy);
        list.append(row);
      });
      feedback.append(list);
    }
    bench?.refresh();
    updateSelection();
  }
  function moveStep(id, delta) {
    const from = activeSession.orderedStepIds.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= activeSession.orderedStepIds.length) return;
    activeSession.orderedStepIds.splice(from, 1);
    activeSession.orderedStepIds.splice(to, 0, id);
    invalidate('order');
    changed(`Step moved to position ${to + 1}.`);
  }
  function buildMethod() {
    ui.main.className = 'assessment-main assessment-method';
    ui.main.append(sectionHeading('02 / METHOD & REASONING', 'Make every step count', 'Put the method in a safe, logical order, then explain the science behind it.'));
    const grid = el('div', 'assessment-method-grid');
    const order = el('section', 'assessment-panel assessment-order-panel');
    order.append(sectionHeading(null, 'Sequence the method', 'Drag the cards to reorder them, or use the arrow buttons.'));
    const list = el('ol', 'assessment-step-list');
    activeSession.orderedStepIds.forEach((id, index) => {
      const step = activeSession.data.methodChallenge.scrambledSteps.find(item => item.id === id);
      const correct = activeSession.data.methodChallenge.correctOrder[index] === id;
      const row = el('li', `assessment-method-step${activeSession.methodOrderChecked ? correct ? ' is-correct' : ' is-incorrect' : ''}`);
      row.draggable = true;
      row.dataset.stepId = id;
      row.append(el('span', 'assessment-step-number', String(index + 1)));
      const copy = el('div', 'assessment-step-copy');
      copy.append(el('p', '', step?.text || id));
      if (activeSession.methodOrderChecked) copy.append(el('span', 'assessment-answer-state', correct ? 'Correct position' : 'Try a different position'));
      const controls = el('div', 'assessment-reorder-controls');
      [['up', -1, 'Move up'], ['down', 1, 'Move down']].forEach(([glyph, delta, label]) => {
        const control = button('', 'assessment-icon-button', () => moveStep(id, delta), glyph);
        control.setAttribute('aria-label', `${label}: ${step?.text || 'method step'}`);
        control.dataset.focusKey = `${id}-${glyph}`;
        control.disabled = (delta === -1 && index === 0) || (delta === 1 && index === activeSession.orderedStepIds.length - 1);
        controls.append(control);
      });
      row.append(copy, controls);
      row.addEventListener('dragstart', event => { dragStepId = id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); row.classList.add('is-dragging'); });
      row.addEventListener('dragend', () => { dragStepId = null; row.classList.remove('is-dragging'); list.querySelectorAll('.is-drop-target').forEach(node=>node.classList.remove('is-drop-target')); });
      row.addEventListener('dragover', event => { if (dragStepId && dragStepId !== id) { event.preventDefault(); row.classList.add('is-drop-target'); } });
      row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
      row.addEventListener('drop', event => {
        event.preventDefault();
        const from = activeSession.orderedStepIds.indexOf(dragStepId);
        const to = activeSession.orderedStepIds.indexOf(id);
        dragStepId = null;
        if (from < 0 || from === to) return;
        const [moved] = activeSession.orderedStepIds.splice(from, 1);
        activeSession.orderedStepIds.splice(to, 0, moved);
        invalidate('order');
        changed(`Step moved to position ${to + 1}.`);
      });
      list.append(row);
    });
    order.append(list);
    const orderFooter = el('div', 'assessment-panel-actions');
    orderFooter.append(button('Check step order', 'assessment-button-primary', () => {
      assessment.checkMethodPhase(activeSession, 'order');
      changed(`Step order checked. ${activeSession.methodOrderScore} of ${maxScores(activeSession)[1]} marks.`);
    }, 'check'));
    if (activeSession.methodOrderChecked) orderFooter.append(badge(`${activeSession.methodOrderScore} / ${maxScores(activeSession)[1]} marks`, 'assessment-score-badge'));
    order.append(orderFooter);
    const reasoning = el('section', 'assessment-panel assessment-reasoning-panel');
    reasoning.append(sectionHeading(null, 'Explain the science', 'Choose the best explanation for each question.'));
    const questions = el('div', 'assessment-questions');
    activeSession.data.methodChallenge.reasoningQuestions.forEach((question, index) => {
      questions.append(buildQuestion({ question, index, answers: activeSession.questionAnswers, checked: activeSession.methodQuestionsChecked, domain: 'questions' }));
    });
    reasoning.append(questions);
    const reasoningFooter = el('div', 'assessment-panel-actions');
    reasoningFooter.append(button('Check answers', 'assessment-button-primary', () => {
      assessment.checkMethodPhase(activeSession, 'questions');
      changed(`Reasoning checked. ${activeSession.methodQuestionsScore} of ${maxScores(activeSession)[2]} marks.`);
    }, 'check'));
    if (activeSession.methodQuestionsChecked) reasoningFooter.append(badge(`${activeSession.methodQuestionsScore} / ${maxScores(activeSession)[2]} marks`, 'assessment-score-badge'));
    reasoning.append(reasoningFooter);
    grid.append(order, reasoning);
    ui.main.append(grid, pageFooter('apparatus', 'limitations', 'Evaluate & improve'));
  }
  function buildQuestion({ question, index, answers, checked, domain }) {
    const fieldset = el('fieldset', 'assessment-question');
    const legend = el('legend');
    legend.append(el('span', 'assessment-question-number', String(index + 1).padStart(2, '0')), el('span', '', question.prompt || question.upgradePrompt));
    fieldset.append(legend);
    question.options.forEach((option, optionIndex) => {
      const selected = answers[question.id] === optionIndex;
      const label = el('label', `assessment-option${selected ? ' is-selected' : ''}${checked && selected ? option.correct ? ' is-correct' : ' is-incorrect' : ''}`);
      const input = el('input');
      input.type = 'radio';
      input.name = `assessment-${domain}-${question.id}`;
      input.value = String(optionIndex);
      input.checked = selected;
      input.dataset.focusKey = `${domain}-${question.id}-${optionIndex}`;
      input.addEventListener('change', () => { answers[question.id] = optionIndex; invalidate(domain); changed(); });
      label.append(input, el('span', 'assessment-option-letter', String.fromCharCode(65 + optionIndex)), el('span', 'assessment-option-copy', option.text));
      fieldset.append(label);
    });
    if (checked) {
      const chosen = question.options[answers[question.id]];
      const feedback = el('div', `assessment-question-feedback ${chosen?.correct ? 'is-correct' : 'is-incorrect'}`);
      feedback.append(icon(chosen?.correct ? 'check' : 'info'));
      const copy = el('div');
      copy.append(el('strong', '', chosen ? chosen.correct ? 'Correct explanation' : 'Review this answer' : 'Choose an answer'));
      const explanation = domain === 'limitations' ? chosen?.advantage || question.limitation : question.explanation;
      if (explanation) copy.append(el('p', '', explanation));
      feedback.append(copy);
      fieldset.append(feedback);
    }
    return fieldset;
  }
  function buildLimitations() {
    ui.main.className = 'assessment-main assessment-limitations';
    ui.main.append(sectionHeading('03 / EVALUATE & IMPROVE', 'Think like a scientist', 'Spot the weakness in each investigation and choose the improvement that directly addresses it.'));
    const cards = el('div', 'assessment-limitations-grid');
    activeSession.data.limitationsChallenge.forEach((limitation, index) => {
      const card = el('article', 'assessment-panel assessment-limitation-card');
      const header = el('div', 'assessment-limitation-header');
      header.append(badge(`CASE ${String(index + 1).padStart(2, '0')}`), el('h2', '', limitation.title));
      const scenario = el('div', 'assessment-scenario');
      scenario.append(el('span', 'assessment-eyebrow', 'THE STUDENT’S APPROACH'), el('p', '', limitation.scenario));
      card.append(header, scenario, buildQuestion({ question: limitation, index, answers: activeSession.limitationAnswers, checked: activeSession.limitationsChecked, domain: 'limitations' }));
      cards.append(card);
    });
    ui.main.append(cards);
    const actions = el('div', 'assessment-page-footer');
    actions.append(button('Method & reasoning', 'assessment-button-quiet', () => goToPhase('method'), 'back'));
    const right = el('div', 'assessment-footer-group');
    if (activeSession.limitationsChecked) right.append(badge(`${activeSession.limitationsScore} / ${maxScores(activeSession)[3]} marks`, 'assessment-score-badge'));
    right.append(button('Check improvements', 'assessment-button-primary', () => {
      assessment.checkLimitationsPhase(activeSession);
      changed(`Improvements checked. ${activeSession.limitationsScore} of ${maxScores(activeSession)[3]} marks.`);
    }, 'check'), button('View my results', 'assessment-button-secondary', () => goToPhase('summary'), 'arrow'));
    actions.append(right);
    ui.main.append(actions);
  }
  function pageFooter(previous, next, nextLabel) {
    const footer = el('div', 'assessment-page-footer');
    footer.append(button('Previous stage', 'assessment-button-quiet', () => goToPhase(previous), 'back'), button(nextLabel, 'assessment-button-secondary', () => goToPhase(next), 'arrow'));
    return footer;
  }
  function buildSummary() {
    ui.main.className = 'assessment-main assessment-summary';
    const maxima = maxScores(activeSession);
    const domains = [
      { title: 'Apparatus & connections', detail: 'Selection and physical assembly', score: activeSession.apparatusScore, checked: activeSession.apparatusChecked, phase: 'apparatus', max: maxima[0] },
      { title: 'Method sequence', detail: 'Safe and logical order', score: activeSession.methodOrderScore, checked: activeSession.methodOrderChecked, phase: 'method', max: maxima[1] },
      { title: 'Scientific reasoning', detail: 'Understanding why each step matters', score: activeSession.methodQuestionsScore, checked: activeSession.methodQuestionsChecked, phase: 'method', max: maxima[2] },
      { title: 'Evaluation & improvements', detail: 'Addressing limitations with evidence', score: activeSession.limitationsScore, checked: activeSession.limitationsChecked, phase: 'limitations', max: maxima[3] }
    ];
    const completed = domains.filter(item => item.checked).length;
    const percentage = Math.round(100 * (activeSession.totalScore || 0) / Math.max(1, activeSession.maxPossibleScore));
    ui.main.append(sectionHeading('04 / YOUR RESULTS', completed === domains.length ? 'Your practical, reviewed.' : 'See how you’re progressing.', 'Review your strengths, revisit the details and build a more confident practical method.'));
    const hero = el('div', 'assessment-summary-hero');
    const scoreCard = el('section', 'assessment-summary-score');
    const ring = el('div', 'assessment-score-ring');
    ring.style.setProperty('--score-percentage', `${percentage}%`);
    const ringContent = el('div');
    ringContent.append(el('strong', '', String(activeSession.totalScore || 0)), el('span', '', `of ${activeSession.maxPossibleScore} marks`));
    ring.append(ringContent);
    const scoreCopy = el('div');
    scoreCopy.append(badge(completed === domains.length ? 'ASSESSMENT REVIEWED' : 'ASSESSMENT IN PROGRESS'), el('h2', '', completed === domains.length ? `${percentage}% practice score` : `${completed} of 4 skills checked`), el('p', '', 'This score reflects this practice activity. Use the feedback to decide what to improve next.'));
    scoreCard.append(ring, scoreCopy);
    const nextSteps = el('section', 'assessment-panel assessment-next-steps');
    nextSteps.append(el('h2', '', 'Your next steps'));
    const recommendations = domains.filter(item => !item.checked || item.score < item.max);
    if (!recommendations.length) nextSteps.append(el('p', '', 'Every assessed skill is complete. Try a fresh attempt to practise retrieving the method independently.'));
    else recommendations.forEach(domain => {
      const row = button(domain.checked ? `Refine ${domain.title.toLowerCase()}` : `Check ${domain.title.toLowerCase()}`, 'assessment-review-link', () => goToPhase(domain.phase), 'arrow');
      nextSteps.append(row);
    });
    hero.append(scoreCard, nextSteps);
    ui.main.append(hero);
    const breakdown = el('div', 'assessment-breakdown-grid');
    domains.forEach(domain => {
      const card = el('section', 'assessment-panel assessment-domain-card');
      card.append(el('h2', '', domain.title), el('p', '', domain.detail));
      const value = el('div', 'assessment-domain-score');
      value.append(el('strong', '', domain.checked ? `${domain.score} / ${domain.max}` : '—'), badge(domain.checked ? domain.score === domain.max ? 'Complete' : 'Reviewed' : 'Not checked', domain.checked && domain.score === domain.max ? 'is-correct' : ''));
      const progress = el('div', 'assessment-progress');
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-label', domain.title);
      progress.setAttribute('aria-valuenow', String(domain.checked ? domain.score : 0));
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', String(domain.max));
      const fill = el('span');
      fill.style.width = `${domain.checked ? 100 * domain.score / Math.max(1, domain.max) : 0}%`;
      progress.append(fill);
      card.append(value, progress, button('Review this skill', 'assessment-button-quiet', () => goToPhase(domain.phase), 'arrow'));
      breakdown.append(card);
    });
    ui.main.append(breakdown);
    const actions = el('div', 'assessment-page-footer');
    actions.append(button('Download feedback', 'assessment-button-quiet', downloadReport, 'download'), button('Start a fresh attempt', 'assessment-button-primary', () => {
      state.assessmentSession = assessment.createAssessmentSession(practicals[state.selected]);
      changed('A fresh assessment is ready.');
    }, 'reset'));
    ui.main.append(actions);
  }
  function downloadReport() {
    const session = activeSession;
    const maxima = maxScores(session);
    const lines = [session.data.title, 'GCSE Combined Science — Practical assessment', '', `Practice score: ${session.totalScore} / ${session.maxPossibleScore}`, '', ...[
      ['Apparatus & connections', session.apparatusScore, maxima[0], session.apparatusChecked],
      ['Method sequence', session.methodOrderScore, maxima[1], session.methodOrderChecked],
      ['Scientific reasoning', session.methodQuestionsScore, maxima[2], session.methodQuestionsChecked],
      ['Evaluation & improvements', session.limitationsScore, maxima[3], session.limitationsChecked]
    ].map(([name, score, max, checked]) => `${name}: ${checked ? `${score} / ${max}` : 'Not yet checked'}`), '', 'SETUP FEEDBACK', ...(session.apparatusFeedback || []).map(entry => cleanFeedback(entry.message)), '', 'This is a practice activity score.'];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const link = el('a');
    link.href = url;
    link.download = `${session.practicalId}-practical-feedback.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('Feedback report downloaded.');
  }
  function signature(session) {
    return JSON.stringify([session.currentPhase, session.totalScore, session.maxPossibleScore, session.apparatusChecked, session.apparatusScore, session.apparatusFeedback, session.placedEquipment, session.connections, session.orderedStepIds, session.methodOrderChecked, session.methodOrderScore, session.questionAnswers, session.methodQuestionsChecked, session.methodQuestionsScore, session.limitationAnswers, session.limitationsChecked, session.limitationsScore]);
  }
  function sync() {
    if (destroyed) return;
    const visible = state.assessmentMode && state.course !== 'aaq';
    app.hidden = !visible;
    document.body.classList.toggle('assessment-open', !!visible);
    if (!visible) {
      if (bench) { bench.destroy(); bench = null; activePhase = null; }
      return;
    }
    const practical = practicals[state.selected] || practicals[0];
    if (!state.assessmentSession || state.assessmentSession.practicalId !== practical.id) state.assessmentSession = assessment.createAssessmentSession(practical);
    const session = state.assessmentSession;
    if (session !== activeSession) {
      activeSession = session;
      activePhase = null;
      lastSignature = '';
      assessment.updateSessionTotals(session);
      makeShell();
    }
    const nextSignature = signature(session);
    if (nextSignature === lastSignature && activePhase === session.currentPhase) return;
    const previousPhase = activePhase;
    const focusKey = app.contains(document.activeElement) ? document.activeElement?.dataset.focusKey : null;
    const scrollTop = ui.main.scrollTop;
    const innerScroll = [...ui.main.querySelectorAll('.assessment-panel')].map(node => node.scrollTop);
    if (activePhase !== session.currentPhase || activePhase !== 'apparatus') {
      bench?.destroy();
      bench = null;
      ui.main.replaceChildren();
      activePhase = session.currentPhase;
      if (activePhase === 'apparatus') buildSetup();
      else if (activePhase === 'method') buildMethod();
      else if (activePhase === 'limitations') buildLimitations();
      else buildSummary();
      if (previousPhase === activePhase) {
        ui.main.scrollTop = scrollTop;
        ui.main.querySelectorAll('.assessment-panel').forEach((node,index) => { node.scrollTop = innerScroll[index] || 0; });
      } else ui.main.scrollTop = 0;
      if (focusKey) [...app.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === focusKey)?.focus({ preventScroll: true });
    } else updateSetup();
    updateHeader();
    lastSignature = signature(session);
  }
  return {
    sync,
    destroy() { destroyed = true; bench?.destroy(); app.remove(); document.body.classList.remove('assessment-open'); }
  };
}
