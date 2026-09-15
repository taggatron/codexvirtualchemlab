import { placeAssemblyItem, removeAssemblyItem, getSnapCandidate, evaluateAssembly } from './assessment-assembly.js?v=20260916-1';

// The assessment uses the same room, lighting and apparatus models as the main
// practical. Only apparatus that the learner has placed is added to this scene.
export function mountAssessmentBench(host, { session, onChange = () => {}, onSelect = () => {}, onAnnounce = () => {} }) {
  host.classList.add('assembly-viewport');
  host.innerHTML = `<canvas class="assembly-canvas" tabindex="0" aria-label="Practical assembly bench. Select apparatus, use arrow keys to move it, Enter to snap, Delete to remove, Escape to cancel."></canvas><svg class="assembly-guides" aria-hidden="true"></svg><div class="assembly-labels"></div><div class="assembly-empty"><span class="assembly-empty-symbol" aria-hidden="true">＋</span><strong>Your bench is ready</strong><span>Drag an equipment label here to start building.</span></div><div class="assembly-message" role="status" aria-live="polite"></div>`;
  const canvas = host.querySelector('canvas'), labels = host.querySelector('.assembly-labels'), guides = host.querySelector('svg'), empty = host.querySelector('.assembly-empty'), message = host.querySelector('.assembly-message');
  let renderer, THREE, factory, alignModels, cableGroup, disposed = false, selectedId = null, drag = null, candidate = null, frame = 0;
  let view = { x: 0, y: 0, scale: 1, width: 1000, height: 600 };
  const models = new Map(), modelBounds = new Map();
  const items = session.assemblySpec.items;
  const itemFor = id => items.find(item => item.id === id);
  const placed = () => session.placedEquipment || {};
  function announce(text) { message.textContent = text; onAnnounce(text); }
  function saveHistory() { session.assemblyHistory ||= []; session.assemblyHistory.push(structuredClone(placed())); if (session.assemblyHistory.length > 30) session.assemblyHistory.shift(); }
  function changed() {
    session.apparatusChecked = false; session.apparatusScore = 0; session.apparatusFeedback = null; session.assemblyEvaluation = null;
    refresh(); onChange();
  }
  function select(id) { selectedId = id; session.selectedAssemblyItem = id; onSelect(id); refresh(); }
  function point(event) { const r = host.getBoundingClientRect(); return { x: (event.clientX - r.left - view.x) / view.scale, y: (event.clientY - r.top - view.y) / view.scale }; }
  function inside(p) { return p.x >= 0 && p.x <= 1000 && p.y >= 100 && p.y <= 590; }
  function requestRender() { if (!frame && !disposed) frame = requestAnimationFrame(() => { frame = 0; render(); }); }
  function measure() {
    const r = host.getBoundingClientRect();
    const width = Math.max(1, r.width), height = Math.max(1, r.height), scale = Math.min(width / 1000, height / 600);
    view = { width, height, scale, x: (width - 1000 * scale) / 2, y: (height - 600 * scale) / 2 };
    guides.setAttribute('viewBox', `0 0 ${width} ${height}`);
    if (renderer?.available) {
      renderer.renderer.setSize(width, height, false);
      const halfWidth = width / scale / 200, halfHeight = height / scale / 200;
      renderer.camera.left = -halfWidth; renderer.camera.right = halfWidth; renderer.camera.top = halfHeight; renderer.camera.bottom = -halfHeight; renderer.camera.updateProjectionMatrix();
      renderer.renderer.setViewport(0, 0, width, height);
    }
    requestRender();
  }
  function svgNode(tag, attrs) { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v)); guides.append(node); return node; }
  const screenX = x => view.x + x * view.scale, screenY = y => view.y + y * view.scale;
  function previewPositions() {
    const positions = structuredClone(placed());
    if (!drag?.moved || !inside(drag.point)) return positions;
    const target = candidate ? { x: candidate.x, y: candidate.y } : drag.point;
    const origin = positions[drag.id];
    const moving = new Set([drag.id]);
    if (origin) {
      const valid = new Set(evaluateAssembly(session).connections.filter(c => c.valid).map(c => c.id));
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const link of session.assemblySpec.connections) {
          if (link.group !== false && valid.has(link.id) && moving.has(link.a) && !moving.has(link.b)) { moving.add(link.b); expanded = true; }
        }
      }
      for (const id of moving) if (id !== drag.id && positions[id]) positions[id] = { x: positions[id].x + target.x - origin.x, y: positions[id].y + target.y - origin.y };
    }
    positions[drag.id] = target;
    return positions;
  }
  function overlay() {
    const positions = previewPositions();
    labels.replaceChildren(); guides.replaceChildren();
    empty.hidden = Object.keys(positions).length > 0;
    const badges = [];
    for (const [id, pos] of Object.entries(positions)) {
      const item = itemFor(id); if (!item) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = `assembly-item-label${id === selectedId ? ' is-selected' : ''}`;
      button.textContent = String(items.indexOf(item) + 1); button.title = item.name; button.dataset.itemId = id; button.setAttribute('aria-label', `Select ${item.name} on the bench`);
      const visual = modelBounds.get(id)?.rect;
      let badgeX = visual ? Math.min(view.width - 18, visual.x + visual.width + 12) : screenX(pos.x + item.width / 2 + 15);
      let badgeY = visual ? visual.y + visual.height * .5 : screenY(pos.y - item.height / 2);
      for (let attempt = 0; attempt < 12 && badges.some(point => Math.hypot(point.x - badgeX, point.y - badgeY) < 32); attempt++) {
        badgeY += 33;
        if (badgeY > view.height - 35) { badgeY -= 66; badgeX += 33; }
      }
      badges.push({ x: badgeX, y: badgeY });
      button.style.left = `${badgeX}px`; button.style.top = `${badgeY}px`;
      button.addEventListener('pointerdown', event => startDrag(event, id, 'bench'));
      button.addEventListener('click', event => { if (event.detail === 0) { select(id); canvas.focus(); } });
      labels.append(button);
      if (id === selectedId || drag?.id === id) {
        svgNode('rect', { x: visual ? visual.x - 7 : screenX(pos.x - item.width / 2 - 8), y: visual ? visual.y - 7 : screenY(pos.y - item.height - 8), width: visual ? visual.width + 14 : (item.width + 16) * view.scale, height: visual ? visual.height + 14 : (item.height + 16) * view.scale, rx: 12, fill: 'none', stroke: '#0c9e89', 'stroke-width': 2, 'stroke-dasharray': '5 5' });
      }
    }
    if (candidate && drag?.moved) {
      svgNode('circle', { cx: screenX(candidate.x), cy: screenY(candidate.y), r: 17, fill: '#bff1df', stroke: '#087f75', 'stroke-width': 3 });
      const txt = svgNode('text', { x: screenX(candidate.x), y: screenY(candidate.y) - 26, fill: '#065c53', 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 750, stroke: '#f4fbf7', 'stroke-width': 5, 'paint-order': 'stroke' }); txt.textContent = 'Release to connect';
    }
    canvas.style.cursor = drag ? 'grabbing' : 'grab';
  }
  function componentRoots(positions) {
    const links = evaluateAssembly({ ...session, placedEquipment: positions }).connections.filter(c => c.valid && session.assemblySpec.connections.find(spec => spec.id === c.id)?.group !== false);
    const roots = {};
    for (const id of Object.keys(positions)) {
      const component = new Set([id]), queue = [id];
      while (queue.length) { const cur = queue.pop(); for (const c of links) { const other = c.a === cur ? c.b : c.b === cur ? c.a : null; if (other && positions[other] && !component.has(other)) { component.add(other); queue.push(other); } } }
      roots[id] = [...component].sort((a, b) => positions[b].y - positions[a].y)[0];
    }
    return roots;
  }
  function worldOnBench(pos) {
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(screenX(pos.x) / view.width * 2 - 1, 1 - screenY(pos.y) / view.height * 2), renderer.camera);
    const target = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -.105), target);
    // Keep elevated, unconnected parts in front of the back wall while the
    // learner is positioning them, rather than letting them disappear behind it.
    if (target.z < -2.25) ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 2.25), target);
    return target;
  }
  function render() {
    if (disposed) return;
    overlay();
    if (!renderer?.available) return;
    const positions = previewPositions();
    const roots = componentRoots(positions);
    if (candidate && drag?.moved && positions[candidate.otherId]) roots[drag.id] = roots[candidate.otherId] || candidate.otherId;
    for (const [id, model] of models) model.visible = !!positions[id];
    for (const [id, pos] of Object.entries(positions)) {
      const item = itemFor(id); if (!item) continue;
      let model = models.get(id);
      if (!model) {
        model = factory(renderer, item);
        model.userData.assessmentItemId = id;
        renderer.root.add(model); models.set(id, model);
        // Measure the model in the bench camera, then fit it to its own footprint.
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model), corners = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z).project(renderer.camera));
        const width = (Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x))) * view.width / view.scale / 2;
        const height = (Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y))) * view.height / view.scale / 2;
        const scale = Math.min(item.width / Math.max(width, 1), item.height / Math.max(height, 1));
        model.scale.multiplyScalar(scale);
        modelBounds.set(id, { scale });
      }
      model.visible = true;
      const rootPos = positions[roots[id]] || pos, base = worldOnBench(rootPos);
      // Connected parts share depth; vertical offsets seat them into one another.
      const dy = (rootPos.y - pos.y) / 100 / .982;
      model.position.set(base.x + (pos.x - rootPos.x) / 100, base.y + dy, base.z);
      model.updateMatrixWorld(true);
    }
    alignModels?.(models, { ...session, placedEquipment: positions });
    drawCables(positions);
    renderer.camera.updateMatrixWorld();
    renderer.renderer.render(renderer.scene, renderer.camera);
    for (const [id, model] of models) {
      if (!model.visible) continue;
      const bounds = new THREE.Box3().setFromObject(model), projected = [];
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) projected.push(new THREE.Vector3(x, y, z).project(renderer.camera));
      const left = Math.min(...projected.map(p => (p.x + 1) * view.width / 2)), right = Math.max(...projected.map(p => (p.x + 1) * view.width / 2));
      const top = Math.min(...projected.map(p => (1 - p.y) * view.height / 2)), bottom = Math.max(...projected.map(p => (1 - p.y) * view.height / 2));
      modelBounds.get(id).rect = { x: left, y: top, width: right - left, height: bottom - top };
    }
    overlay();
    canvas.style.visibility = 'visible';
  }
  function drawCables(positions) {
    if (cableGroup) {
      cableGroup.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
      renderer.scene.remove(cableGroup);
    }
    cableGroup = new THREE.Group(); renderer.scene.add(cableGroup);
    const valid = new Set(evaluateAssembly({ ...session, placedEquipment: positions }).connections.filter(c => c.valid).map(c => c.id));
    for (const connection of session.assemblySpec.connections) {
      if (!valid.has(connection.id) || connection.kind !== 'wire') continue;
      const a = models.get(connection.a), b = models.get(connection.b), ia = itemFor(connection.a), ib = itemFor(connection.b);
      if (!a?.visible || !b?.visible) continue;
      for (const port of connection.ports || []) {
        const endpoint = (model, item, p) => model.position.clone().add(new THREE.Vector3(p.x * item.width / 100, -p.y * item.height / 98.2, .16));
        const start = endpoint(a, ia, port.a), end = endpoint(b, ib, port.b);
        const mid = start.clone().lerp(end, .5); mid.y = Math.max(.14, Math.min(start.y, end.y) - .45); mid.z += .28;
        const curve = new THREE.CatmullRomCurve3([start, start.clone().lerp(mid, .55), mid, end.clone().lerp(mid, .55), end]);
        const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, .025, 8, false), new THREE.MeshStandardMaterial({ color: port.color || '#c74545', roughness: .65 }));
        cable.castShadow = true; cableGroup.add(cable);
      }
    }
  }
  function refresh() { measure(); }
  function startDrag(event, id, source) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    const pos = placed()[id];
    selectedId = id; session.selectedAssemblyItem = id;
    const p = point(event);
    drag = { id, source, startX: event.clientX, startY: event.clientY, moved: false, point: p, offsetX: source === 'bench' && pos ? p.x - pos.x : 0, offsetY: source === 'bench' && pos ? p.y - pos.y : 0 };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    session.assemblyDrag = { itemId: id, moved: false };
    announce(`Moving ${itemFor(id)?.name}. Bring matching parts close together to connect them.`);
    requestRender();
  }
  function move(event) {
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) drag.moved = true;
    session.assemblyDrag = { itemId: drag.id, moved: drag.moved };
    const p = point(event); drag.point = { x: p.x - drag.offsetX, y: p.y - drag.offsetY };
    candidate = inside(drag.point) ? getSnapCandidate(session, drag.id, drag.point.x, drag.point.y) : null;
    requestRender();
  }
  function finish(event) {
    if (!drag) return;
    const current = drag;
    move(event); drag = null; candidate = null; session.assemblyDrag = null;
    if (!current.moved) { selectItem(current.id); return; }
    if (inside(current.point)) {
      saveHistory();
      const snapped = placeAssemblyItem(session, current.id, current.point.x, current.point.y);
      announce(snapped ? `Connected: ${snapped.label}.` : `${itemFor(current.id)?.name} placed. Move it close to another part to connect.`);
      changed();
    } else { announce('Drop cancelled. Equipment stays where it was.'); refresh(); }
    onSelect(selectedId);
  }
  function cancel() { if (drag) { drag = null; candidate = null; session.assemblyDrag = null; announce('Move cancelled.'); refresh(); } }
  function selectItem(id) {
    if (!itemFor(id)) return;
    if (!placed()[id]) {
      saveHistory();
      const n = Object.keys(placed()).length;
      let x = 180 + (n % 4) * 195, y = 420 + Math.floor(n / 4) % 2 * 110;
      placeAssemblyItem(session, id, x, y, { snap: false });
      selectedId = id; session.selectedAssemblyItem = id;
      announce(`${itemFor(id).name} added. Drag it to assemble, or use arrow keys then Enter to connect.`);
      changed();
    }
    select(id); canvas.focus({ preventScroll: true });
  }
  function removeSelected() { if (!selectedId || !placed()[selectedId]) return; saveHistory(); const name = itemFor(selectedId)?.name; removeAssemblyItem(session, selectedId); select(null); announce(`${name} returned to the equipment library.`); changed(); }
  function pick(event) {
    const p = point(event);
    let found = null;
    if (renderer?.available) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(screenX(p.x) / view.width * 2 - 1, 1 - screenY(p.y) / view.height * 2), renderer.camera);
      for (const hit of ray.intersectObjects(renderer.root.children, true)) {
        for (let object = hit.object; object && object !== renderer.root; object = object.parent) {
          if (object.userData.assessmentItemId && object.visible && placed()[object.userData.assessmentItemId]) { found = object.userData.assessmentItemId; break; }
        }
        if (found) break;
      }
    }
    found ||= [...Object.keys(placed())].reverse().find(id => { const item = itemFor(id), pos = placed()[id]; return item && p.x >= pos.x - item.width / 2 - 15 && p.x <= pos.x + item.width / 2 + 15 && p.y >= pos.y - item.height - 15 && p.y <= pos.y + 20; });
    if (found) startDrag(event, found, 'bench'); else { select(null); canvas.focus(); }
  }
  function keyboard(event) {
    if (event.key === 'Escape') { cancel(); select(null); return; }
    if (!selectedId || !placed()[selectedId]) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); return; }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (directions[event.key]) {
      event.preventDefault(); saveHistory(); const [dx, dy] = directions[event.key], step = event.shiftKey ? 5 : 20, p = placed()[selectedId];
      placeAssemblyItem(session, selectedId, p.x + dx * step, p.y + dy * step, { snap: false }); changed();
    } else if (event.key === 'Enter') {
      event.preventDefault(); const p = placed()[selectedId], snap = getSnapCandidate(session, selectedId, p.x, p.y);
      if (snap) { saveHistory(); placeAssemblyItem(session, selectedId, snap.x, snap.y); announce(`Connected: ${snap.label}.`); changed(); }
      else announce('No connection nearby. Move the part closer to matching apparatus.');
    }
  }
  canvas.addEventListener('pointerdown', pick); canvas.addEventListener('keydown', keyboard);
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', finish); document.addEventListener('pointercancel', cancel);
  const observer = new ResizeObserver(measure); observer.observe(host);
  Promise.all([import('./lab3d.js?v=20260908-4'), import('./vendor/three.module.js?v=20260823-1'), import('./assessment-models.js?v=20260916-1')]).then(([lab, three, modelsModule]) => {
    if (disposed) return;
    THREE = three; factory = modelsModule.createAssessmentModel; alignModels = modelsModule.alignAssessmentModels;
    renderer = new lab.LabRenderer3D(canvas);
    if (!renderer.available) { host.classList.add('assembly-fallback'); announce('3D is unavailable. Use the labelled equipment on the bench to arrange your setup.'); return; }
    renderer.scene.fog = null;
    renderer.camera = new THREE.OrthographicCamera(-5, 5, 3, -3, .1, 60);
    renderer.camera.position.set(0, 3.9, 12); renderer.camera.lookAt(0, 1.6, 0); renderer.camera.updateMatrixWorld();
    renderer.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.renderer.shadowMap.enabled = true;
    measure();
  }).catch(error => { console.error('Assessment bench:', error); host.classList.add('assembly-fallback'); announce('The 3D bench could not load. Labelled equipment remains available.'); });
  measure();
  return {
    refresh, startPaletteDrag: (event, id) => startDrag(event, id, 'palette'), selectItem, removeSelected,
    resetView: () => { cancel(); refresh(); },
    destroy() {
      disposed = true; session.assemblyDrag = null; cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', finish); document.removeEventListener('pointercancel', cancel);
      if (renderer?.available) {
        renderer.clear(); renderer.scene.traverse(node => { node.geometry?.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) { material?.map?.dispose(); material?.dispose(); } });
        renderer.renderer.dispose(); renderer.renderer.forceContextLoss();
      }
      host.replaceChildren();
    }
  };
}
