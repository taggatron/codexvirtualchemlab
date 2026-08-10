import * as THREE from './vendor/three.module.js';
import { drawThermalBenchScene } from './thermalview.js';

const GLASS = () => new THREE.MeshPhysicalMaterial({ color: 0xccefff, transparent: true, opacity: .43, transmission: .6, roughness: .045, metalness: 0, ior: 1.46, thickness: .08, clearcoat: .35, clearcoatRoughness: .08, side: THREE.DoubleSide, depthWrite: false });
const metal = (color = 0x687b82, roughness = .26) => new THREE.MeshStandardMaterial({ color, metalness: .82, roughness });
const solid = (color, roughness = .46) => new THREE.MeshStandardMaterial({ color, roughness, metalness: .05 });

function shadowReady(root) { root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } }); return root }
function cylinder(r, h, mat, segments = 40) { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), mat) }
function roundedBox(w, h, d, r = .035, smooth = 4) { const shape = new THREE.Shape(), hw = w / 2 - r, hh = h / 2 - r; shape.moveTo(-hw, -h / 2); shape.lineTo(hw, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh); shape.lineTo(w / 2, hh); shape.quadraticCurveTo(w / 2, h / 2, hw, h / 2); shape.lineTo(-hw, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh); shape.lineTo(-w / 2, -hh); shape.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2); const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(.001, d - r * 2), bevelEnabled: true, bevelSegments: smooth, steps: 1, bevelSize: r, bevelThickness: r, curveSegments: smooth * 2 }); geo.center(); return geo }
function holedCylinderShell(bottomRadius, topRadius, bottomY, topY, holes, material, thetaSegments = 192, heightSegments = 112) {
  const geometry = new THREE.BufferGeometry(), positions = [], uvs = [], indices = [], row = thetaSegments + 1;
  for (let yIndex = 0; yIndex <= heightSegments; yIndex++) {
    const v = yIndex / heightSegments, y = THREE.MathUtils.lerp(bottomY, topY, v), radius = THREE.MathUtils.lerp(bottomRadius, topRadius, v);
    for (let thetaIndex = 0; thetaIndex <= thetaSegments; thetaIndex++) {
      const u = thetaIndex / thetaSegments, theta = u * Math.PI * 2;
      positions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius); uvs.push(u, v)
    }
  }
  const insideHole = (theta, y, radius) => holes.some(hole => {
    const thetaDelta = Math.atan2(Math.sin(theta - hole.theta), Math.cos(theta - hole.theta));
    const tangentDistance = thetaDelta * radius, verticalDistance = y - hole.y;
    return tangentDistance * tangentDistance / (hole.radiusX * hole.radiusX) + verticalDistance * verticalDistance / (hole.radiusY * hole.radiusY) < 1
  });
  for (let yIndex = 0; yIndex < heightSegments; yIndex++) {
    const v = (yIndex + .5) / heightSegments, y = THREE.MathUtils.lerp(bottomY, topY, v), radius = THREE.MathUtils.lerp(bottomRadius, topRadius, v);
    for (let thetaIndex = 0; thetaIndex < thetaSegments; thetaIndex++) {
      const theta = (thetaIndex + .5) / thetaSegments * Math.PI * 2;
      if (insideHole(theta, y, radius)) continue;
      const a = yIndex * row + thetaIndex, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, c, b, b, c, d)
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  Object.assign(mesh.userData, { trueOpenings: true, holeCount: holes.length });
  return mesh
}
function radialPortTunnel(theta, y, outerRadius, innerRadius, outerHoleRadius, innerHoleRadius, material) {
  const direction = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)), length = outerRadius - innerRadius + .012;
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(outerHoleRadius * .92, innerHoleRadius * .92, length, 48, 1, true), material);
  tunnel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  tunnel.position.copy(direction).multiplyScalar((outerRadius + innerRadius) / 2);
  tunnel.position.y = y;
  Object.assign(tunnel.userData, { recessedPortWall: true, openEnded: true, depth: length });
  return tunnel
}

export class LabRenderer3D {
  constructor(canvas) {
    this.canvas = canvas; this.available = false; this.signature = ''; this.flames = []; this.dynamic = []; this.width = 1; this.height = 1; this.left = 0; this.top = 0; this.coolantVisualLevel = 0; this.coolantTransitionTarget = 0; this.lastRenderTime = 0; this.thermiteAfterglowUntil = 0; this.thermiteGlowFraction = 0; this.osmosisRotationState = null; this.lastPracticalId = null; this.bunsenLoadDuration = 3.4; this.bunsenLoadElapsed = this.bunsenLoadDuration; this.bunsenTransitionActive = false; this.sceneWarmupFrames = 0; this.sceneNeedsCompile = false; this.sceneCompiling = false; this.sceneCompileGeneration = 0; this.contextLost = false; this.pendingCanvasReveal = true; canvas.style.visibility = 'hidden';
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.renderer.setClearColor(0xeaf1f2, 1); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.12;
      this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0xeaf1f2); this.scene.fog = new THREE.Fog(0xeaf1f2, 13, 24);
      this.camera = new THREE.PerspectiveCamera(36, 1, .1, 50); this.camera.position.set(0, 4.65, 8.55); this.camera.lookAt(0, 1.05, 0);
      this.root = new THREE.Group(); this.scene.add(this.root); this.buildRoom(); this.available = true;
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.contextLost = true; this.sceneCompiling = false; this.sceneCompileGeneration++; this.pendingCanvasReveal = true; canvas.style.visibility = 'hidden' });
      canvas.addEventListener('webglcontextrestored', () => {
        this.contextLost = false; this.signature = ''; this.sceneNeedsCompile = true; this.sceneWarmupFrames = 5; this.pendingCanvasReveal = true; canvas.style.visibility = 'hidden'; this.renderer.setClearColor(0xeaf1f2, 1);
        canvas.dispatchEvent(new CustomEvent('lab3dneedsredraw'))
      });
    } catch (err) { console.warn('WebGL renderer unavailable, retaining UI fallback.', err) }
  }
  buildRoom() {
    const hemi = new THREE.HemisphereLight(0xf5fbff, 0x7d6d59, 2.25); this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 3.1); key.position.set(-4, 8, 7); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -9; key.shadow.camera.right = 9; key.shadow.camera.top = 8; key.shadow.camera.bottom = -4; this.scene.add(key);
    const rim = new THREE.SpotLight(0x8edfff, 16, 18, .7, .5, 1.1); rim.position.set(5, 6, -2); rim.target.position.set(0, 1, 0); this.scene.add(rim, rim.target);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), solid(0xf2f7f7, .85)); wall.position.set(0, 3.8, -3); wall.receiveShadow = true; this.scene.add(wall);
    const gridMat = new THREE.LineBasicMaterial({ color: 0xb8c9cc, transparent: true, opacity: .42 }); const pts = []; for (let x = -8; x <= 8; x += .8)pts.push(x, 0, -2.98, x, 8, -2.98); for (let y = 0; y <= 8; y += .8)pts.push(-8, y, -2.98, 8, y, -2.98); const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const grid = new THREE.LineSegments(gridGeo, gridMat); this.scene.add(grid);
    const asphalt = document.createElement('canvas'); asphalt.width = asphalt.height = 256; const ac = asphalt.getContext('2d'); ac.fillStyle = '#12384d'; ac.fillRect(0, 0, 256, 256); let seed = 4271; const rnd = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296); for (let i = 0; i < 1450; i++) { const light = rnd() > .55; ac.fillStyle = light ? `rgba(127,178,194,${.08 + rnd() * .18})` : `rgba(1,20,32,${.1 + rnd() * .2})`; const r = .65 + rnd() * 2.25; ac.beginPath(); ac.ellipse(rnd() * 256, rnd() * 256, r * 1.45, r, 0, 0, Math.PI * 2); ac.fill() } const asphaltMap = new THREE.CanvasTexture(asphalt); asphaltMap.wrapS = asphaltMap.wrapT = THREE.RepeatWrapping; asphaltMap.repeat.set(8, 3.5); asphaltMap.colorSpace = THREE.SRGBColorSpace; asphaltMap.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); const benchMat = new THREE.MeshStandardMaterial({ map: asphaltMap, bumpMap: asphaltMap, bumpScale: .045, color: 0x587b8b, roughness: .95, metalness: .03 });
    const bench = new THREE.Mesh(new THREE.BoxGeometry(16, .55, 7), benchMat); bench.position.set(0, -.28, .2); bench.receiveShadow = true; this.scene.add(bench);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(16, .12, 7.1), solid(0x28556a, .68)); edge.position.set(0, .04, .18); edge.receiveShadow = true; this.scene.add(edge);
    this.room = { hemi, key, rim, wall, grid, bench, edge };
  }
  configureEnvironment(id) {
    const meadow = id === 'quadrats', shore = id === 'shoretransect', outdoor = meadow || shore;
    this.room.wall.visible = !outdoor; this.room.grid.visible = !outdoor; this.room.bench.visible = !outdoor; this.room.edge.visible = !outdoor;
    const background = shore ? 0x8fcde5 : meadow ? 0x78c8ec : 0xeaf1f2;
    this.scene.background.setHex(background); this.renderer.setClearColor(background, 1);
    this.scene.fog.color.setHex(background); this.scene.fog.near = outdoor ? 16 : 13; this.scene.fog.far = outdoor ? 30 : 24;
    this.room.hemi.intensity = outdoor ? 2.75 : 2.25; this.room.key.intensity = outdoor ? 3.75 : 3.1; this.room.rim.intensity = outdoor ? 9 : 16;
    this.room.key.shadow.camera.left = shore ? -14.5 : -9; this.room.key.shadow.camera.right = shore ? 14.5 : 9; this.room.key.shadow.camera.updateProjectionMatrix();
  }
  applyCameraForPractical(id, hookeFocusProgress = 0) {
    if (id === 'quadrats') { this.camera.fov = 40; this.camera.position.set(0, 5.35, 9.45); this.camera.lookAt(0, .55, .42) }
    else if (id === 'shoretransect') { this.camera.fov = 42; this.camera.position.set(0, 5.7, 10.2); this.camera.lookAt(0, .72, -.24) }
    else if (id === 'ripple') { this.camera.fov = 38; this.camera.position.set(0, 5.5, 8.85); this.camera.lookAt(0, 1.12, -.05) }
    else { this.camera.fov = 36; this.camera.position.set(0, 4.65, 8.55); this.camera.lookAt(0, 1.05, 0) }
    if (id === 'hooke' && hookeFocusProgress > 0) {
      const q = Math.max(0, Math.min(1, hookeFocusProgress)), eased = q * q * (3 - 2 * q);
      this.camera.fov = THREE.MathUtils.lerp(36, 24, eased);
      this.camera.position.set(THREE.MathUtils.lerp(0, .24, eased), THREE.MathUtils.lerp(4.65, 2.42, eased), THREE.MathUtils.lerp(8.55, 4.15, eased));
      this.camera.lookAt(THREE.MathUtils.lerp(0, .18, eased), THREE.MathUtils.lerp(1.05, 1.42, eased), THREE.MathUtils.lerp(0, .1, eased));
    }
    this.camera.updateProjectionMatrix();
  }
  resize(left, top, width, height, displayScale = 1) { width = Math.max(1, width); height = Math.max(1, height); displayScale = Math.max(.01, displayScale || 1); const unchanged = this.left === left && this.top === top && this.width === width && this.height === height && this.displayScale === displayScale; this.left = left; this.top = top; this.width = width; this.height = height; this.displayScale = displayScale; const displayLeft = left * displayScale, displayTop = top * displayScale, displayWidth = width * displayScale, displayHeight = height * displayScale; Object.assign(this.canvas.style, { left: `${displayLeft}px`, top: `${displayTop}px`, width: `${displayWidth}px`, height: `${displayHeight}px` }); if (!this.available || unchanged) return; this.renderer.setSize(displayWidth, displayHeight, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix() }
  projectToScreen(x, y, z) { if (!this.available) return null; const p = new THREE.Vector3(x, y, z).project(this.camera); return { x: this.left + (p.x + 1) * this.width / 2, y: this.top + (1 - p.y) * this.height / 2 } }
  posFromScreen(x, y) { const ndc = new THREE.Vector2(((x - this.left) / this.width) * 2 - 1, -(((y - this.top) / this.height) * 2 - 1)), raycaster = new THREE.Raycaster(); raycaster.setFromCamera(ndc, this.camera); const ray = raycaster.ray, t = Math.abs(ray.direction.y) > .0001 ? -ray.origin.y / ray.direction.y : 0, point = ray.at(Math.max(0, t), new THREE.Vector3()); point.y = 0; return point }
  clear() {
    const disposeMaterial = material => {
      if (!material) return;
      for (const key of ['map', 'alphaMap', 'aoMap', 'bumpMap', 'emissiveMap', 'envMap', 'lightMap', 'metalnessMap', 'normalMap', 'roughnessMap']) material[key]?.dispose?.();
      material.dispose?.();
    };
    while (this.root.children.length) {
      const o = this.root.children.pop();
      o.traverse?.(n => {
        n.geometry?.dispose?.();
        if (Array.isArray(n.material)) n.material.forEach(disposeMaterial); else disposeMaterial(n.material);
      });
    }
    this.flames = []; this.dynamic = []; this.pourAlignment = null; this.thermiteAfterglowUntil = 0; this.thermiteGlowFraction = 0; this.osmosisRotationState = null;
  }
  beaker(level = .42, color = 0x3ca9d4) { const g = new THREE.Group(), glassMat = new THREE.MeshPhysicalMaterial({ color: 0xd9f4ff, transparent: true, opacity: .48, transmission: .72, roughness: .025, metalness: 0, ior: 1.46, thickness: .11, clearcoat: 1, clearcoatRoughness: .025, side: THREE.DoubleSide, depthWrite: false }), profile = [[0, .035], [.4, .035], [.54, .045], [.61, .085], [.655, .16], [.675, .31], [.69, 1.22], [.7, 1.34]].map(([x, y]) => new THREE.Vector2(x, y)); const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), glassMat); body.geometry.computeVertexNormals(); g.add(body); const rim = new THREE.Mesh(new THREE.TorusGeometry(.7, .03, 16, 80), glassMat); rim.rotation.x = Math.PI / 2; rim.position.y = 1.35; g.add(rim); const bottomCurve = new THREE.Mesh(new THREE.TorusGeometry(.61, .032, 14, 72), glassMat); bottomCurve.rotation.x = Math.PI / 2; bottomCurve.position.y = .095; g.add(bottomCurve); const liquidHeight = Math.max(.08, level * 1.08), liqMat = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: .74, roughness: .13, transmission: .14, clearcoat: .35 }); const liq = cylinder(.615, liquidHeight, liqMat, 72); liq.position.y = .085 + liquidHeight / 2; g.add(liq); const meniscus = cylinder(.618, .018, new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: .56, roughness: .08, transmission: .2 }), 72); meniscus.position.y = .085 + liquidHeight; g.add(meniscus); const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .34, depthWrite: false }); const shine = new THREE.Mesh(new THREE.PlaneGeometry(.065, 1.03), shineMat); shine.position.set(-.36, .75, .575); shine.renderOrder = 7; g.add(shine); const shineFine = new THREE.Mesh(new THREE.PlaneGeometry(.022, .72), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .48, depthWrite: false })); shineFine.position.set(-.28, .79, .62); shineFine.renderOrder = 7; g.add(shineFine); const marks = new THREE.Group(), markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, depthWrite: false, depthTest: false, side: THREE.DoubleSide });[[.3, .29], [.48, .16], [.66, .29], [.84, .16], [1.02, .29], [1.2, .16]].forEach(([y, w]) => { const r = Math.hypot(.4, .57) + .002, arc = w / r; const mark = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .019, 32, 1, true, -arc / 2, arc), markMat); mark.position.set(0, y, 0); mark.rotation.y = Math.atan2(.4, .57); mark.renderOrder = 9; marks.add(mark) }); g.add(marks); Object.assign(g.userData, { container: true, liquidVolume: liq, liquidMeniscus: meniscus, liquidMaxHeight: liquidHeight }); return shadowReady(g) }
  flask(level = .42, color = 0x55b9d0) {
    const g = new THREE.Group(), pts = [];
    const curve = (a, b, c, d, n = 14) => { for (let i = pts.length ? 1 : 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push(new THREE.Vector2(u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x, u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y)) } };
    curve({ x: .025, y: 0 }, { x: .36, y: 0 }, { x: .64, y: .045 }, { x: .7, y: .2 }, 18);
    curve({ x: .7, y: .2 }, { x: .73, y: .46 }, { x: .35, y: 1.12 }, { x: .21, y: 1.31 }, 24);
    curve({ x: .21, y: 1.31 }, { x: .17, y: 1.38 }, { x: .17, y: 1.43 }, { x: .17, y: 1.5 }, 10);
    curve({ x: .17, y: 1.5 }, { x: .17, y: 1.66 }, { x: .17, y: 1.84 }, { x: .16, y: 1.94 }, 12);
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), GLASS());
    body.geometry.computeVertexNormals(); g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.17, .026, 16, 72), GLASS());
    rim.rotation.x = Math.PI / 2; rim.position.y = 1.95; g.add(rim);

    const liquidH = Math.max(.08, level * .72), liquidBottom = .035, liquidTop = .075 + liquidH;
    const bezier = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d };
    const innerRadiusAt = y => {
      const target = Math.max(0, y - liquidBottom); let lo = 0, hi = 1;
      if (target <= .2) {
        for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; bezier(0, 0, .045, .2, mid) < target ? lo = mid : hi = mid }
        return Math.max(.004, bezier(.025, .36, .64, .7, (lo + hi) / 2) - .038)
      }
      for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; bezier(.2, .46, 1.12, 1.31, mid) < target ? lo = mid : hi = mid }
      return Math.max(.16, bezier(.7, .73, .35, .21, (lo + hi) / 2) - .038)
    };
    const liquidPts = [new THREE.Vector2(0, liquidBottom)];
    for (let i = 0; i <= 36; i++) { const y = liquidBottom + (liquidTop - liquidBottom) * i / 36; liquidPts.push(new THREE.Vector2(innerRadiusAt(y), y)) }
    const liquidTopRadius = innerRadiusAt(liquidTop); liquidPts.push(new THREE.Vector2(0, liquidTop));
    const liquidMat = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: .74, roughness: .16, transmission: .12, side: THREE.DoubleSide });
    const liquidGeometry = new THREE.LatheGeometry(liquidPts, 72); liquidGeometry.computeVertexNormals();
    const liquid = new THREE.Mesh(liquidGeometry, liquidMat); g.add(liquid);
    const meniscus = cylinder(liquidTopRadius * .992, .018, liquidMat, 72); meniscus.position.y = liquidTop; g.add(meniscus);

    const marks = new THREE.Group(), markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .92, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    [[.36, .3, .65], [.52, .18, .6], [.68, .3, .53], [.84, .18, .45], [1, .3, .36]].forEach(([y, w, z]) => { const r = Math.hypot(.25, z) + .002, arc = w / r; const tick = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .018, 32, 1, true, -arc / 2, arc), markMat); tick.position.set(0, y, 0); tick.rotation.y = Math.atan2(.25, z); tick.renderOrder = 8; marks.add(tick) });
    g.add(marks); Object.assign(g.userData, { container: true, liquid, meniscus, liquidTop, liquidTopRadius }); return shadowReady(g)
  }
  testTube(level = .35, color = 0x5dbddd, cloudy = false) { const g = new THREE.Group(); const tube = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, 1.65, 32, 1, true), GLASS()); tube.position.y = .86; g.add(tube); const bottom = new THREE.Mesh(new THREE.SphereGeometry(.18, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), GLASS()); bottom.position.y = .035; g.add(bottom); const liq = cylinder(.155, Math.max(.08, level * .8), new THREE.MeshPhysicalMaterial({ color: cloudy ? 0xe8e8d8 : color, transparent: true, opacity: cloudy ? .9 : .7, roughness: cloudy ? .55 : .16 })); liq.position.y = .11 + level * .4; g.add(liq); Object.assign(g.userData, { container: true, liquid: liq }); return shadowReady(g) }
  gasTap(open = false) {
    const g = new THREE.Group();
    const enamel = new THREE.MeshPhysicalMaterial({ color: 0xf7f5ea, roughness: .2, metalness: .03, clearcoat: .9, clearcoatRoughness: .08 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c400, roughness: .3, metalness: .12 });
    const brass = metal(0xb49345, .25);
    const mountingPlate = new THREE.Mesh(new THREE.CylinderGeometry(.31, .34, .11, 64), enamel);
    mountingPlate.position.y = .055;
    g.add(mountingPlate);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.17, .2, .55, 56), enamel);
    body.position.y = .36;
    g.add(body);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(.19, 48, 24), enamel);
    shoulder.scale.y = .62;
    shoulder.position.y = .64;
    g.add(shoulder);
    const collar = cylinder(.225, .085, enamel, 56);
    collar.position.y = .71;
    g.add(collar);

    const outletStart = new THREE.Vector3(-.39, .38, 0);
    const outletEnd = new THREE.Vector3(-.13, .38, 0);
    const outlet = this.taperedTubeBetween(outletStart, outletEnd, .06, .078, brass);
    g.add(outlet);
    for (const [x, radius] of [[-.36, .066], [-.30, .072], [-.24, .078]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .008, 8, 28), brass);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(x, .38, 0);
      g.add(ring);
    }

    const stem = cylinder(.055, .17, brass, 28);
    stem.position.y = .83;
    g.add(stem);
    const valve = new THREE.Group();
    valve.position.y = .93;
    valve.rotation.y = open ? Math.PI / 2 : 0;
    const hub = cylinder(.12, .09, yellow, 40);
    valve.add(hub);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(.25, .075, .15), yellow);
      wing.position.set(side * .19, .01, 0);
      valve.add(wing);
      const end = new THREE.Mesh(new THREE.SphereGeometry(.085, 24, 14), yellow);
      end.scale.set(.9, .58, .78);
      end.position.set(side * .32, .01, 0);
      valve.add(end);
    }
    g.add(valve);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.178, .018, 10, 40), yellow);
    band.rotation.x = Math.PI / 2;
    band.position.y = .59;
    g.add(band);
    g.position.set(1.82, 0, .24);
    Object.assign(g.userData, {
      gasTap: true,
      outletAxis: '+x',
      outletStart: [-.39, .38, 0],
      outletEnd: [-.13, .38, 0],
      outletTapered: true,
      outletEntryRadius: .06,
      outletBaseRadius: .078,
      barbRingCount: 3
    });
    return shadowReady(g)
  }
  bunsen(lit = false, flameHeight = 1, wrapMode = false, options = {}) {
    const g = new THREE.Group();
    const baseMat = new THREE.MeshPhysicalMaterial({ color: 0x0c4177, roughness: .25, metalness: .3, clearcoat: .7, clearcoatRoughness: .12 });
    const baseCutAngle = THREE.MathUtils.degToRad(35), baseThetaStart = Math.PI / 2 + baseCutAngle / 2, baseThetaLength = Math.PI * 2 - baseCutAngle;
    const barrelOuterRadius = .104, barrelInnerRadius = .087, barrelMouthOuterRadius = .13, barrelMouthInnerRadius = .088, flameWidthScale = barrelOuterRadius / .118, baseOuterRadius = .55, baseInnerRadius = barrelOuterRadius + .001, baseOuterY = .058, baseCentreY = .305, baseCurveStrength = 2.2, baseCurveDenominator = Math.cosh(baseCurveStrength) - 1;
    const baseProfile = [new THREE.Vector2(baseInnerRadius, .012), new THREE.Vector2(.5, .012), new THREE.Vector2(.545, .034), new THREE.Vector2(baseOuterRadius, baseOuterY)];
    for (let i = 1; i <= 18; i++) { const u = i / 18, r = THREE.MathUtils.lerp(baseOuterRadius, baseInnerRadius, u), hyperbolicRise = (Math.cosh(baseCurveStrength * u) - 1) / baseCurveDenominator; baseProfile.push(new THREE.Vector2(r, THREE.MathUtils.lerp(baseOuterY, baseCentreY, hyperbolicRise))) }
    const base = new THREE.Mesh(new THREE.LatheGeometry(baseProfile, 112, baseThetaStart, baseThetaLength), baseMat); base.geometry.computeVertexNormals(); g.add(base);
    const cutFaceShape = new THREE.Shape(); cutFaceShape.moveTo(baseProfile[0].x, baseProfile[0].y); for (let i = 1; i < baseProfile.length; i++)cutFaceShape.lineTo(baseProfile[i].x, baseProfile[i].y); cutFaceShape.closePath();
    const cutFaceMat = baseMat.clone(); cutFaceMat.side = THREE.DoubleSide;
    for (const angle of [baseThetaStart, baseThetaStart + baseThetaLength]) { const cutFace = new THREE.Mesh(new THREE.ShapeGeometry(cutFaceShape, 12), cutFaceMat); cutFace.rotation.y = angle - Math.PI / 2; g.add(cutFace) }
    Object.assign(base.userData, { profile: 'hyperbolic rise', topView: 'circular', intakeClearanceSectorDegrees: 35, intakeClearanceDirection: '+x', sealedToMainTube: true, innerSealRadius: baseInnerRadius, barrelOuterRadius, radialSealClearance: baseInnerRadius - barrelOuterRadius, topHeight: baseCentreY });
    const brushedSteel = new THREE.MeshPhysicalMaterial({ color: 0xaab7bb, metalness: .58, roughness: .3, clearcoat: .2, clearcoatRoughness: .24 });
    const intakeHalfHeight = .1, intakeClearanceAboveBase = .02, intakeCentreY = baseCentreY + intakeClearanceAboveBase + intakeHalfHeight, frontPortTheta = Math.PI / 2;
    const collarHoles = [{ theta: frontPortTheta, y: intakeCentreY, radiusX: .068, radiusY: .068 }];
    const barrelHoles = [{ theta: frontPortTheta - .012, y: intakeCentreY + .006, radiusX: .061, radiusY: .061 }];
    const barrel = holedCylinderShell(barrelOuterRadius, barrelOuterRadius, .13, 1.245, barrelHoles, brushedSteel, 224, 152);
    Object.assign(barrel.userData, { material: 'brushed steel', hollowTop: true, chamferedMouth: true, outerRadius: barrelOuterRadius, innerRadius: barrelInnerRadius, mouthOuterRadius: barrelMouthOuterRadius, mouthInnerRadius: barrelMouthInnerRadius, baseSeal: 'tight radial contact', realAirIntakeHoles: true, airIntakeHoleAlignment: 'slightly offset behind collar for visible depth' });
    g.add(barrel);
    const mouthProfile = [
      new THREE.Vector2(barrelOuterRadius, 1.245),
      new THREE.Vector2(barrelMouthOuterRadius, 1.292),
      new THREE.Vector2(barrelMouthOuterRadius, 1.315),
      new THREE.Vector2(barrelMouthInnerRadius, 1.315),
      new THREE.Vector2(barrelMouthInnerRadius, 1.278),
      new THREE.Vector2(barrelInnerRadius + .002, 1.245)
    ];
    const barrelMouth = new THREE.Mesh(new THREE.LatheGeometry(mouthProfile, 96), brushedSteel); barrelMouth.geometry.computeVertexNormals(); g.add(barrelMouth);
    const barrelInteriorMat = new THREE.MeshStandardMaterial({ color: 0x27363b, metalness: .62, roughness: .48, side: THREE.BackSide });
    const barrelInterior = holedCylinderShell(barrelInnerRadius, barrelInnerRadius, .17, 1.278, barrelHoles, barrelInteriorMat, 224, 152); g.add(barrelInterior);
    const barrelDepth = new THREE.Mesh(new THREE.CircleGeometry(barrelInnerRadius - .001, 64), new THREE.MeshStandardMaterial({ color: 0x101b20, metalness: .28, roughness: .66, side: THREE.DoubleSide })); barrelDepth.rotation.x = -Math.PI / 2; barrelDepth.position.y = .17; g.add(barrelDepth);
    const intakeAssembly = new THREE.Group(), collarBottomRadius = .1235, collarTopRadius = .121, collarInnerRadius = barrelOuterRadius + .004, collarMidRadius = (collarBottomRadius + collarTopRadius) / 2;
    const collar = holedCylinderShell(collarBottomRadius, collarTopRadius, intakeCentreY - intakeHalfHeight, intakeCentreY + intakeHalfHeight, collarHoles, brushedSteel, 224, 128);
    Object.assign(collar.userData, { airIntakeValve: true, raisedForBaseSeal: true, centreY: intakeCentreY, bottomY: intakeCentreY - intakeHalfHeight, height: intakeHalfHeight * 2, clearanceAboveBase: intakeClearanceAboveBase, innerDiameter: collarInnerRadius * 2, outerDiameterBottom: collarBottomRadius * 2, outerDiameterTop: collarTopRadius * 2, radialThicknessBottom: collarBottomRadius - collarInnerRadius, wallThicknessReductionPercent: 50, finish: 'brushed steel matching main tube', edgeProfile: 'square unrounded top and bottom edges', adjustmentTabPresent: false, realThroughHoles: true });
    intakeAssembly.add(collar);
    const ringMat = metal(0xe6eeef, .05);
    for (const [y, radius] of [[intakeCentreY - intakeHalfHeight, collarBottomRadius], [intakeCentreY + intakeHalfHeight, collarTopRadius]]) { const edge = new THREE.Mesh(new THREE.RingGeometry(collarInnerRadius, radius, 72), ringMat); edge.rotation.x = -Math.PI / 2; edge.position.y = y; intakeAssembly.add(edge) }
    const portWallMat = new THREE.MeshStandardMaterial({ color: 0x15272e, metalness: .45, roughness: .54, side: THREE.DoubleSide });
    collarHoles.forEach((hole, index) => {
      const barrelHole = barrelHoles[index], tunnel = radialPortTunnel(hole.theta, hole.y, collarMidRadius, barrelInnerRadius - .006, hole.radiusX, barrelHole.radiusX, portWallMat);
      intakeAssembly.add(tunnel);
      const direction = new THREE.Vector3(Math.cos(hole.theta), 0, Math.sin(hole.theta)), rim = new THREE.Mesh(new THREE.TorusGeometry(hole.radiusX * .97, .0045, 10, 64), ringMat);
      rim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction); rim.position.copy(direction).multiplyScalar(collarMidRadius + .001); rim.position.y = hole.y; intakeAssembly.add(rim)
    });
    g.add(intakeAssembly); g.airIntakeCollar = intakeAssembly;
    const connectorY = .18, hoseRadius = .057, hoseMinimumCentreY = .14, hoseMat = new THREE.MeshStandardMaterial({ color: 0x17272c, roughness: .88, metalness: .02 }), connector = this.tubeBetween(new THREE.Vector3(.08, connectorY, 0), new THREE.Vector3(.52, connectorY, 0), .06, hoseMat); g.add(connector);
    const hoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(.46, connectorY, 0),
      new THREE.Vector3(.62, connectorY, .05),
      new THREE.Vector3(.8, .16, .3),
      new THREE.Vector3(1.02, hoseMinimumCentreY, .55),
      new THREE.Vector3(1.25, .17, .59),
      new THREE.Vector3(1.42, .27, .43),
      new THREE.Vector3(1.46, .35, .3),
      new THREE.Vector3(1.48, .38, .24),
      new THREE.Vector3(1.6, .38, .24)
    ], false, 'centripetal');
    const hose = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 80, hoseRadius, 14, false), hoseMat); hose.castShadow = true; hose.receiveShadow = true;
    const valveSleeveStart = new THREE.Vector3(1.36, .38, .24), valveSleeveLength = .26, valveSleeveProfile = [
      new THREE.Vector2(.059, 0),
      new THREE.Vector2(.059, .04),
      new THREE.Vector2(.064, .07),
      new THREE.Vector2(.082, .105),
      new THREE.Vector2(.094, .145),
      new THREE.Vector2(.094, valveSleeveLength)
    ];
    const valveSleeve = new THREE.Mesh(new THREE.LatheGeometry(valveSleeveProfile, 48), hoseMat);
    valveSleeve.position.copy(valveSleeveStart);
    valveSleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    valveSleeve.geometry.computeVertexNormals(); valveSleeve.castShadow = true; valveSleeve.receiveShadow = true;
    Object.assign(valveSleeve.userData, { gasHoseFlaredCuff: true, approachAxis: '+x', startRadius: .059, expandedRadius: .094, overlapStartX: 1.42, overlapEndX: 1.62, overlapLength: .2 });
    g.add(hose, valveSleeve, this.gasTap(lit));
    Object.assign(g.userData, { bunsenGeometry: true, baseSealedToMainTube: true, baseTopHeight: baseCentreY, baseInnerRadius, barrelOuterRadius, barrelInnerRadius, barrelMouthOuterRadius, barrelMouthInnerRadius, flameWidthScale, airIntakeValveRaised: true, airIntakeValveCentreY: intakeCentreY, airIntakeValveHeight: intakeHalfHeight * 2, airIntakeValveBottomGap: intakeClearanceAboveBase, airIntakeValveInnerDiameter: collarInnerRadius * 2, airIntakeValveRadialThickness: collarBottomRadius - collarInnerRadius, airIntakeValveWallThicknessReductionPercent: 50, airIntakeValveFinish: 'brushed steel matching main tube', airIntakeValveEdgeProfile: 'square unrounded top and bottom edges', airIntakeValveOuterDiameter: collarBottomRadius * 2, airIntakeAdjustmentTabPresent: false, airIntakeOpeningCount: 1, airIntakeOpenings: 'one larger actual aligned front opening through collar and barrel', airIntakeFrontHoleDiameter: collarHoles[0].radiusX * 2, barrelFrontHoleDiameter: barrelHoles[0].radiusX * 2, airIntakeOpeningDepth: collarMidRadius - (barrelInnerRadius - .006), gasConnectorCentreY: connectorY, gasConnectorFinish: 'black matching flexible gas hose', gasConnectorRestoredToPreviousHeight: true, hoseRadius, hoseMinimumCentreY, hoseMinimumGroundClearance: hoseMinimumCentreY - hoseRadius, hoseKinkReduced: true, hoseValveFinalApproachAxis: '+x coaxial with gas-tap outlet', hoseValveFinalTangent: [1, 0, 0], hoseValveSleeveStartRadius: .059, hoseValveSleeveExpandedRadius: .094, hoseValveOverlapLength: .2, hoseValveSleeve: true, hoseValveSleeveFlared: true });
    if (lit) {
      const loadTransition = options.loadTransition !== false, uniforms = { uTime: { value: 0 }, uSeed: { value: Math.random() * 20 }, uStrength: { value: 1 }, uHeatMix: { value: loadTransition ? 0 : 1 } };
      const flameMaterial = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        toneMapped: false,
        vertexShader: `
          uniform float uTime;
          uniform float uSeed;
          uniform float uHeatMix;
          varying vec2 vUv;
          void main(){
            vUv=uv;
            vec3 p=position;
            float lift=smoothstep(.08,1.,uv.y);
            float safetyWave=(sin(uv.y*8.0+uTime*2.2+uSeed)*.032+sin(uv.y*17.0-uTime*3.1+uSeed*.4)*.012)*(1.0-uHeatMix);
            float heatingWave=(sin(uv.y*8.0+uTime*1.2+uSeed)*.0003+sin(uv.y*18.0-uTime*1.8+uSeed*.4)*.0001)*uHeatMix;
            p.x+=(safetyWave+heatingWave)*lift;
            p.y+=sin(uv.y*10.0-uTime*1.2+uSeed)*mix(.008,.001,uHeatMix)*lift;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uSeed;
          uniform float uStrength;
          uniform float uHeatMix;
          varying vec2 vUv;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
          float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(17.2,9.1);a*=.5;}return v;}
          void main(){
            float y=clamp(vUv.y,0.,1.);
            float turbulence=fbm(vec2(y*5.2-uTime*.58+uSeed,vUv.x*3.1+uTime*.09));
            float fine=noise(vec2(y*17.0+uTime*1.25,vUv.x*9.0-uTime*.35+uSeed));
            float safetySway=(sin(y*6.0+uTime*1.8+uSeed)*.035+sin(y*14.0-uTime*2.7)*.014)*smoothstep(.12,1.,y);
            float heatingSway=(sin(y*6.0+uTime*.8+uSeed)*.0003+sin(y*14.0-uTime*1.5)*.0001)*smoothstep(.12,1.,y);
            float sway=mix(safetySway,heatingSway,uHeatMix);
            float x=vUv.x-.5-sway;
            float safetyWidth=mix(.36,.018,pow(y,.7))*(.94+turbulence*.1+fine*.025);
            float heatingWidth=mix(.315,.008,pow(y,.76))*(.97+turbulence*.025+fine*.005);
            float width=mix(safetyWidth,heatingWidth,uHeatMix);
            float q=abs(x)/max(width,.004);
            float outer=1.0-smoothstep(.72,1.08,q);
            float edge=smoothstep(.48,.88,q)*(1.0-smoothstep(.88,1.08,q));
            float upperFade=mix(1.0-smoothstep(.96,1.0,y),1.0-smoothstep(.91,1.0,y),uHeatMix);
            float lowerFade=smoothstep(.005,.055,y);
            outer*=upperFade*lowerFade;

            float innerLife=1.0-smoothstep(.57,.72,y);
            float innerWidth=mix(.19,.008,pow(clamp(y/.7,0.,1.),.78));
            float iq=abs(x-sway*.18)/max(innerWidth,.004);
            float inner=(1.0-smoothstep(.72,.98,iq))*innerLife*lowerFade*uHeatMix;
            float innerRim=smoothstep(.52,.78,iq)*(1.0-smoothstep(.78,1.04,iq))*innerLife*uHeatMix;
            float base=exp(-pow((y-.035)*13.5,2.0))*exp(-pow(x*5.2,2.0));
            float hotCore=exp(-pow((y-.18)*5.6,2.0))*exp(-pow(x*8.2,2.0));
            float safetyCore=(1.0-smoothstep(.0,.58,q))*lowerFade*(1.0-smoothstep(.72,1.0,y));

            vec3 deep=vec3(.015,.16,.82);
            vec3 blue=vec3(.01,.48,1.0);
            vec3 cyan=vec3(.38,.86,1.0);
            vec3 heatingColour=mix(blue,cyan,smoothstep(.18,.92,y));
            heatingColour=mix(heatingColour,deep,inner*.92);
            heatingColour=mix(heatingColour,vec3(.18,.72,1.0),innerRim);
            heatingColour=mix(heatingColour,vec3(.86,.98,1.0),base*.9+hotCore*.28);
            heatingColour+=vec3(.08,.27,.4)*edge*(.45+.55*turbulence);
            vec3 safetyColour=mix(vec3(.82,.035,.004),vec3(1.0,.28,.012),smoothstep(.04,.55,y));
            safetyColour=mix(safetyColour,vec3(1.0,.68,.06),smoothstep(.5,.92,y));
            safetyColour=mix(safetyColour,vec3(1.0,.9,.42),safetyCore*.48+base*.32);
            safetyColour+=vec3(.3,.055,.002)*edge*(.35+.65*turbulence);
            float colourMix=smoothstep(.32,.9,uHeatMix);
            vec3 colour=mix(safetyColour,heatingColour,colourMix);
            float heatingAlpha=outer*(.31+edge*.32+(1.0-inner)*.08+turbulence*.08)+inner*.24+innerRim*.22+base*.52;
            float safetyAlpha=outer*(.46+edge*.3+turbulence*.12)+safetyCore*.24+base*.48;
            float alpha=mix(safetyAlpha,heatingAlpha,uHeatMix);
            alpha*=uStrength;
            if(alpha<.012)discard;
            gl_FragColor=vec4(colour,clamp(alpha,0.,.88));
          }
        `
      });
      const sheetGeo = new THREE.PlaneGeometry(.58 * flameWidthScale, 1.42, 32, 72); sheetGeo.translate(0, .71, 0);
      const sheet = new THREE.Mesh(sheetGeo, flameMaterial); sheet.position.set(0, 1.29, .035); sheet.renderOrder = 6; sheet.castShadow = false; sheet.receiveShadow = false;
      const veilMat = flameMaterial.clone(); veilMat.uniforms = { uTime: uniforms.uTime, uSeed: { value: uniforms.uSeed.value + 4.7 }, uStrength: { value: .14 }, uHeatMix: uniforms.uHeatMix }; veilMat.blending = THREE.AdditiveBlending;
      const veil = new THREE.Mesh(sheetGeo.clone(), veilMat); veil.position.set(0, 1.29, -.015); veil.rotation.y = Math.PI * .46; veil.scale.set(.82, 1.02, .82); veil.renderOrder = 5; veil.castShadow = false; veil.receiveShadow = false;
      const rimMat = new THREE.MeshBasicMaterial({ color: 0x77deff, transparent: true, opacity: .64, toneMapped: false, depthWrite: false });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(barrelMouthOuterRadius - .002, .0105, 12, 64), rimMat); rim.rotation.x = Math.PI / 2; rim.position.y = 1.315; rim.renderOrder = 7; rim.castShadow = false;
      const hotBaseMat = new THREE.MeshBasicMaterial({ color: 0xdcfbff, transparent: true, opacity: .72, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }), hotBase = new THREE.Mesh(new THREE.CircleGeometry(barrelMouthInnerRadius * .88, 64), hotBaseMat); hotBase.rotation.x = -Math.PI / 2; hotBase.position.y = 1.315; hotBase.renderOrder = 8; hotBase.castShadow = false;
      const jets = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, mat = new THREE.MeshBasicMaterial({ color: 0x79dfff, transparent: true, opacity: .52, depthWrite: false, toneMapped: false }), jet = new THREE.Mesh(new THREE.ConeGeometry(.016 * flameWidthScale, .14, 12), mat); jet.position.set(Math.cos(a) * barrelMouthInnerRadius * .88, 1.39, Math.sin(a) * barrelMouthInnerRadius * .88); jet.renderOrder = 7; jet.castShadow = false; g.add(jet); jets.push(jet) }
      let wrap = null, wrapJets = [], wrapY = 1.29 + 1.42 * flameHeight * .94; if (wrapMode) { const wrapMat = new THREE.MeshBasicMaterial({ color: 0x73dfff, transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }); wrap = new THREE.Mesh(new THREE.TorusGeometry(.48, .052, 14, 64), wrapMat); wrap.rotation.x = Math.PI / 2; wrap.position.y = wrapY; wrap.scale.z = .72; wrap.renderOrder = 7; g.add(wrap); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, jet = new THREE.Mesh(new THREE.ConeGeometry(.04, .2, 12), wrapMat); jet.position.set(Math.cos(a) * .48, wrapY + .045, Math.sin(a) * .48); jet.scale.y = .72 + (i % 3) * .12; jet.renderOrder = 7; g.add(jet); wrapJets.push(jet) } }
      const glow = new THREE.PointLight(0x249dff, 3.8, 4.2, 1.8); glow.position.y = 1.7;
      g.add(sheet, veil, rim, hotBase, glow); shadowReady(g);[sheet, veil, rim, hotBase, ...jets, ...wrapJets].forEach(o => { o.castShadow = false; o.receiveShadow = false }); this.flames.push({ sheet, veil, uniforms, veilUniforms: veilMat.uniforms, glow, rimMat, hotBaseMat, height: flameHeight, seed: uniforms.uSeed.value, wrap, wrapJets, wrapY, jets, loadTransition, airIntakeCollar: intakeAssembly })
      return g
    }
    return shadowReady(g)
  }
  flameTestJar({ label = 'LiCl', name = 'Lithium', solidColor = 0xf1efea, selected = false } = {}) {
    const g = new THREE.Group(), glass = new THREE.MeshPhysicalMaterial({ color: 0xd9f6ff, transparent: true, opacity: .42, transmission: .7, roughness: .035, ior: 1.46, thickness: .1, clearcoat: .9, clearcoatRoughness: .04, side: THREE.DoubleSide, depthWrite: false }), steel = metal(0xa9b6ba, .2), saltMat = new THREE.MeshPhysicalMaterial({ color: solidColor, roughness: .76, metalness: .02, clearcoat: .08 });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(.34, .36, .72, 64, 1, true), glass); wall.position.y = .38; g.add(wall); const bottom = cylinder(.36, .055, glass, 64); bottom.position.y = .035; g.add(bottom); const rim = new THREE.Mesh(new THREE.TorusGeometry(.34, .035, 14, 64), glass); rim.rotation.x = Math.PI / 2; rim.position.y = .75; g.add(rim); const saltBed = cylinder(.29, .18, saltMat, 56); saltBed.position.y = .14; g.add(saltBed);
    for (let i = 0; i < 28; i++) { const a = i * 2.399, r = .035 + (i % 6) * .043, grain = new THREE.Mesh(new THREE.DodecahedronGeometry(.025 + (i % 4) * .006, 0), saltMat); grain.position.set(Math.cos(a) * r, .24 + (i % 3) * .012, Math.sin(a) * r); grain.rotation.set(i * .71, i * .37, i * .93); grain.scale.set(1.35, .7, 1); g.add(grain) }
    const labelCanvas = document.createElement('canvas'), lc = labelCanvas.getContext('2d'); labelCanvas.width = 512; labelCanvas.height = 260; lc.fillStyle = '#fffdf5'; lc.fillRect(0, 0, 512, 260); lc.fillStyle = selected ? '#c44939' : '#203943'; lc.font = '800 88px Inter, sans-serif'; lc.textAlign = 'center'; lc.textBaseline = 'middle'; lc.fillText(label, 256, 92); lc.fillStyle = '#66777d'; lc.font = '650 43px Inter, sans-serif'; lc.fillText(name.toUpperCase(), 256, 184); const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace; const arc = 0.55 / 0.351; const labelGeo = new THREE.CylinderGeometry(0.347, 0.355, 0.28, 48, 1, true, -arc / 2, arc); const labelMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }); const labelMesh = new THREE.Mesh(labelGeo, labelMat); labelMesh.position.set(0, .43, 0); labelMesh.renderOrder = 9; g.add(labelMesh);
    if (selected) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.48, .035, 12, 64), new THREE.MeshBasicMaterial({ color: 0x20d4b0, transparent: true, opacity: .84, depthWrite: false, toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = .035; ring.renderOrder = 10; g.add(ring) } return shadowReady(g)
  }
  flameTestRig(state) {
    const g = new THREE.Group(), salts = [
      { label: 'LiCl', name: 'Lithium', solidColor: 0xf3f0ed, flameColor: 0xe83e55 },
      { label: 'NaCl', name: 'Sodium', solidColor: 0xf4f2ec, flameColor: 0xffd21f },
      { label: 'KCl', name: 'Potassium', solidColor: 0xeee9f2, flameColor: 0xbd82ff },
      { label: 'CaCl₂', name: 'Calcium', solidColor: 0xeee9df, flameColor: 0xff6338 },
      { label: 'CuCl₂', name: 'Copper', solidColor: 0x4aa990, flameColor: 0x2de0bd }
    ], jarXs = [-2.7, -1.35, 0, 1.35, 2.7], jarZ = -.98, burnerAnchor = new THREE.Vector3(-3.0, 0, 1.72), selected = Math.max(0, Math.min(salts.length - 1, state.flameTestSalt || 0)), salt = salts[selected];
    salts.forEach((item, i) => { const jar = this.flameTestJar({ ...item, selected: i === selected }); jar.position.set(jarXs[i], 0, jarZ); jar.scale.setScalar(.94); g.add(jar) });
    const burner = this.bunsen(true, .9); burner.position.copy(burnerAnchor); g.add(burner);
    const steel = metal(0xcbd5d8, .1), darkSteel = metal(0x65777d, .2), spatula = new THREE.Group(), handle = this.tubeBetween(new THREE.Vector3(.12, 0, 0), new THREE.Vector3(2.12, 0, 0), .047, steel); spatula.add(handle); const grip = this.tubeBetween(new THREE.Vector3(1.48, 0, 0), new THREE.Vector3(2.16, 0, 0), .075, darkSteel); spatula.add(grip); const endCap = new THREE.Mesh(new THREE.SphereGeometry(.078, 28, 16), darkSteel); endCap.position.x = 2.17; spatula.add(endCap); const scoop = new THREE.Mesh(new THREE.SphereGeometry(.27, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xd7e1e3, metalness: .9, roughness: .1, clearcoat: .65, side: THREE.DoubleSide })); scoop.scale.set(1.05, .24, .72); scoop.position.set(-.12, -.025, 0); scoop.rotation.z = Math.PI; spatula.add(scoop);
    const saltLoad = new THREE.Group(), grainMat = new THREE.MeshStandardMaterial({ color: salt.solidColor, roughness: .74, metalness: .02 }); for (let i = 0; i < 18; i++) { const a = i * 2.399, r = .018 + (i % 5) * .026, grain = new THREE.Mesh(new THREE.DodecahedronGeometry(.018 + (i % 3) * .005, 0), grainMat); grain.position.set(-.13 + Math.cos(a) * r, .035 + (i % 3) * .006, Math.sin(a) * r * .72); grain.rotation.set(i * .8, i * .4, i * .63); saltLoad.add(grain) } saltLoad.visible = false; spatula.add(saltLoad); g.add(spatula);
    const flameWidthScale = burner.userData.flameWidthScale || 1, saltLocalX = -.12, flameTargetOffsetX = -saltLocalX;
    const additive = (opacity = 0) => new THREE.MeshBasicMaterial({ color: salt.flameColor, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), outerMat = additive(), coreMat = additive(), haloMat = additive(), outerGeo = new THREE.ConeGeometry(.44 * flameWidthScale, 1.45, 64, 1, true); outerGeo.translate(0, 1.45 / 2, 0); const coreGeo = new THREE.ConeGeometry(.25 * flameWidthScale, 1.20, 56, 1, true); coreGeo.translate(0, 1.20 / 2, 0); const haloGeo = new THREE.ConeGeometry(.56 * flameWidthScale, 1.60, 48, 1, true); haloGeo.translate(0, 1.60 / 2, 0); const outer = new THREE.Mesh(outerGeo, outerMat), core = new THREE.Mesh(coreGeo, coreMat), halo = new THREE.Mesh(haloGeo, haloMat);[outer, core, halo].forEach(mesh => { mesh.visible = false; mesh.renderOrder = 12; mesh.castShadow = false; g.add(mesh) }); const colourLight = new THREE.PointLight(salt.flameColor, 0, 4.8, 1.7); g.add(colourLight);
    this.dynamic.push({ kind: 'flameTest', spatula, saltLoad, airIntakeCollar: burner.airIntakeCollar, jarPoint: new THREE.Vector3(jarXs[selected], 1.02, jarZ), restPoint: new THREE.Vector3(1.2, .24, 2.35), flamePoint: new THREE.Vector3(burnerAnchor.x + flameTargetOffsetX, 1.82, burnerAnchor.z), saltLocalX, outer, core, halo, outerMat, coreMat, haloMat, colourLight, flameWidthScale, seed: selected * 1.7 + .4 });
    Object.assign(g.userData, { flameTestRig: true, sampleLabelsUnobscured: true, wholeBunsenVisible: true, burnerBarrelMaterial: 'brushed steel', burnerAnchor: burnerAnchor.toArray(), gasTapAnchor: [burnerAnchor.x + 1.82, 0, burnerAnchor.z + .24] }); return shadowReady(g)
  }
  electricHeatingMantle(active = false) {
    const g = new THREE.Group(), shell = solid(0x273a43, .32), trim = metal(0xaebbc0, .18), dark = solid(0x111c21, .82), coilMat = new THREE.MeshStandardMaterial({ color: active ? 0xff7538 : 0x482c26, roughness: .38, metalness: .32, emissive: active ? 0xff3b10 : 0x000000, emissiveIntensity: active ? 2.4 : 0 }), panelMat = solid(0x15242b, .35);
    const foot = cylinder(.91, .14, shell, 72); foot.position.y = .07; g.add(foot);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.73, .88, .66, 72, 1, true), shell); body.position.y = .42; g.add(body);
    const cup = new THREE.Mesh(new THREE.SphereGeometry(.72, 64, 28, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dark); cup.position.y = .73; cup.scale.y = .73; g.add(cup);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.73, .045, 16, 72), trim); rim.rotation.x = Math.PI / 2; rim.position.y = .73; g.add(rim);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(.53, .045, 12, 96), coilMat); coil.rotation.x = Math.PI / 2; coil.position.y = .63; coil.scale.z = .78; g.add(coil);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(.82, .32, .12), panelMat); panel.position.set(0, .32, .74); g.add(panel);
    const indicatorMat = new THREE.MeshBasicMaterial({ color: active ? 0xff7045 : 0x5b2721, toneMapped: false }); const indicator = new THREE.Mesh(new THREE.SphereGeometry(.055, 24, 14), indicatorMat); indicator.scale.z = .36; indicator.position.set(-.24, .35, .815); g.add(indicator);
    const dial = cylinder(.12, .075, trim, 36); dial.rotation.x = Math.PI / 2; dial.position.set(.2, .32, .825); g.add(dial); const pointer = new THREE.Mesh(new THREE.BoxGeometry(.018, .1, .012), solid(active ? 0xffefe7 : 0x4f6269, .4)); pointer.position.set(.2, .36, .87); pointer.rotation.z = active ? -.75 : -2.3; g.add(pointer);
    for (const x of [-.63, .63]) { const rubber = cylinder(.1, .055, dark, 32); rubber.position.set(x, .025, .25); g.add(rubber) }
    const cordCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-.62, .16, -.34), new THREE.Vector3(-1.02, .08, -.54), new THREE.Vector3(-1.32, .07, -.26), new THREE.Vector3(-1.48, .05, .16)], false, 'centripetal'); const cord = new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 48, .038, 10, false), solid(0x11191c, .92)); g.add(cord);
    const heatLight = new THREE.PointLight(0xff5d2a, active ? 3.8 : 0, 2.5, 1.8); heatLight.position.set(0, .78, .18); g.add(heatLight); this.dynamic.push({ kind: 'electricHeater', coil, indicator, light: heatLight, active, seed: 1.9 });
    g.userData.electricHeatingMantle = true; return shadowReady(g)
  }
  roundBottomFlask(level = .55, boiling = false) {
    const g = new THREE.Group(), glass = GLASS(), liquidMat = new THREE.MeshPhysicalMaterial({ color: 0x55b7d4, transparent: true, opacity: .7, roughness: .12, transmission: .18, clearcoat: .25, depthWrite: false });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(.65, 72, 40), glass); globe.scale.y = .94; globe.position.y = 1.08; g.add(globe);
    const shoulder = new THREE.Mesh(new THREE.TorusGeometry(.31, .025, 14, 64), glass); shoulder.rotation.x = Math.PI / 2; shoulder.position.y = 1.58; g.add(shoulder);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .68, 56, 1, true), glass); neck.position.y = 1.84; g.add(neck);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.19, .028, 14, 64), glass); rim.rotation.x = Math.PI / 2; rim.position.y = 2.18; g.add(rim);
    const liquid = new THREE.Mesh(new THREE.SphereGeometry(.565, 64, 30, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), liquidMat); liquid.scale.y = .8 + level * .18; liquid.position.y = 1.07; g.add(liquid);
    const surface = cylinder(.555, .018, new THREE.MeshPhysicalMaterial({ color: 0x9edced, transparent: true, opacity: .7, roughness: .07, transmission: .15, depthWrite: false }), 64); surface.position.y = 1.07; g.add(surface);
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(.085, .72), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .42, depthWrite: false })); shine.position.set(-.31, 1.2, .51); shine.rotation.z = -.18; shine.renderOrder = 9; g.add(shine);
    if (boiling) { const bubbles = this.bubbleCloud(26, .46, .5, 0xf0fcff); bubbles.position.y = .49; bubbles.userData.boilingCloud = true; g.add(bubbles) }
    g.userData.roundBottomFlask = true; return shadowReady(g)
  }
  retortStand() {
    const g = new THREE.Group(), baseMat = solid(0x26373e, .34), rodMat = metal(0x9aa8ad, .18); const base = new THREE.Mesh(new THREE.BoxGeometry(1.18, .13, .72), baseMat); base.position.set(0, .065, -.28); g.add(base); const rod = cylinder(.045, 2.72, rodMat, 28); rod.position.set(0, 1.38, -.4); g.add(rod); const boss = new THREE.Mesh(new THREE.BoxGeometry(.27, .22, .25), baseMat); boss.position.set(0, 2.13, -.34); g.add(boss); const clamp = this.tubeBetween(new THREE.Vector3(0, 2.13, -.3), new THREE.Vector3(0, 2.13, .08), .035, rodMat); g.add(clamp); for (const x of [-.17, .17]) { const jaw = new THREE.Mesh(new THREE.TorusGeometry(.13, .025, 10, 28, Math.PI * .7), rodMat); jaw.position.set(x, 2.13, .08); jaw.rotation.set(Math.PI / 2, 0, x < 0 ? -.4 : Math.PI + .4); g.add(jaw) } return shadowReady(g)
  }
  waterDistillationRig(state) {
    const g = new THREE.Group(), heaterOn = !!state.burner, coolingOn = !!state.coolingWater, distilling = heaterOn && coolingOn && !state.complete, progress = Math.max(0, Math.min(1, state.progress || 0)), glass = GLASS(), coolantMat = new THREE.MeshPhysicalMaterial({ color: 0x25b8df, transparent: true, opacity: .07 + this.coolantVisualLevel * .17, roughness: .08, transmission: .42, depthWrite: false }), hoseMat = new THREE.MeshPhysicalMaterial({ color: 0x397b91, transparent: true, opacity: .52, roughness: .28, transmission: .16, depthWrite: false }), xBoiler = -2.05;
    const heater = this.electricHeatingMantle(heaterOn); heater.position.x = xBoiler; g.add(heater); const flask = this.roundBottomFlask(.57, distilling); flask.position.x = xBoiler; g.add(flask); const boilingCloud = flask.children.find(child => child.userData.boilingCloud); if (boilingCloud) this.dynamic.push({ kind: 'waterBoiling', group: boilingCloud, onset: .12 });
    const columnShell = new THREE.Mesh(new THREE.CylinderGeometry(.205, .205, .72, 56, 1, true), glass); columnShell.position.set(xBoiler, 2.51, .02); g.add(columnShell); for (const y of [2.18, 2.31, 2.44, 2.57, 2.7]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.202, .018, 10, 48), glass); ring.rotation.x = Math.PI / 2; ring.position.set(xBoiler, y, .02); g.add(ring) } for (let i = 0; i < 5; i++) { const y = 2.24 + i * .115, left = i % 2 === 0, a = new THREE.Vector3(xBoiler + (left ? -.18 : .18), y, .02), b = new THREE.Vector3(xBoiler + (left ? .035 : -.035), y - .045, .02); g.add(this.tubeBetween(a, b, .025, glass)) }
    const stopper = cylinder(.225, .12, solid(0x26343a, .78), 48); stopper.position.set(xBoiler, 2.92, .02); g.add(stopper); const thermometerGlass = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .92, 32, 1, true), glass); thermometerGlass.position.set(xBoiler, 3.26, .02); g.add(thermometerGlass); const thermometerBaseY = 2.82, thermometerMinHeight = .12, thermometerMaxHeight = .78, thermometerColumn = cylinder(.014, 1, new THREE.MeshBasicMaterial({ color: 0xd94038, toneMapped: false }), 18); thermometerColumn.scale.y = thermometerMinHeight; thermometerColumn.position.set(xBoiler, thermometerBaseY + thermometerMinHeight / 2, .025); g.add(thermometerColumn); this.dynamic.push({ kind: 'distillationThermometer', column: thermometerColumn, baseY: thermometerBaseY, minHeight: thermometerMinHeight, maxHeight: thermometerMaxHeight }); const bulb = new THREE.Mesh(new THREE.SphereGeometry(.058, 24, 16), new THREE.MeshStandardMaterial({ color: 0xd94038, roughness: .25 })); bulb.scale.y = 1.35; bulb.position.set(xBoiler, 2.82, .025); g.add(bulb); const thermometerMarkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .96, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false }), thermometerMarkRadius = .0485; for (let i = 1; i < 10; i++) { const major = i % 3 === 0, arcLength = major ? .096 : .064, arc = arcLength / thermometerMarkRadius, mark = new THREE.Mesh(new THREE.CylinderGeometry(thermometerMarkRadius, thermometerMarkRadius, major ? .012 : .009, 32, 1, true, -arc / 2, arc), thermometerMarkMat); mark.position.set(xBoiler, 2.94 + i * .075, .02); mark.renderOrder = 15; g.add(mark) }
    const headStart = new THREE.Vector3(xBoiler + .14, 2.67, .02), headEnd = new THREE.Vector3(-1.5, 2.52, .02); g.add(this.tubeBetween(headStart, headEnd, .105, glass));
    const condenserA = new THREE.Vector3(-1.5, 2.52, .02), condenserB = new THREE.Vector3(.92, 1.72, .02), axis = condenserB.clone().sub(condenserA).normalize(); const outer = this.tubeBetween(condenserA, condenserB, .245, glass); outer.renderOrder = 5; g.add(outer); const coolant = this.tubeBetween(condenserA.clone().addScaledVector(axis, .12), condenserB.clone().addScaledVector(axis, -.12), .19, coolantMat); coolant.renderOrder = 3; g.add(coolant); const vapourTube = this.tubeBetween(condenserA.clone().addScaledVector(axis, -.16), condenserB.clone().addScaledVector(axis, .16), .072, glass); vapourTube.renderOrder = 7; g.add(vapourTube);
    const ringAt = (point, radius) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .027, 12, 56), glass); ring.position.copy(point); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis); ring.renderOrder = 8; g.add(ring) }; ringAt(condenserA, .255); ringAt(condenserB, .255); ringAt(condenserA.clone().addScaledVector(axis, .22), .255); ringAt(condenserB.clone().addScaledVector(axis, -.22), .255);
    const lowAttach = condenserA.clone().lerp(condenserB, .83), highAttach = condenserA.clone().lerp(condenserB, .18), lowPortEnd = lowAttach.clone().add(new THREE.Vector3(.06, -.27, .34)), highPortEnd = highAttach.clone().add(new THREE.Vector3(-.06, .27, .34)); g.add(this.tubeBetween(lowAttach, lowPortEnd, .07, glass), this.tubeBetween(highAttach, highPortEnd, .07, glass));
    const inletPoints = [new THREE.Vector3(3.02, .12, .82), new THREE.Vector3(2.56, .12, .86), new THREE.Vector3(2.3, .62, .78), new THREE.Vector3(2.18, 1.18, .67), new THREE.Vector3(1.68, 1.35, .52), lowPortEnd], outletPoints = [highPortEnd, new THREE.Vector3(-.72, 1.42, .68), new THREE.Vector3(-.72, .34, .88), new THREE.Vector3(-3.02, .12, .86)], inletCurve = new THREE.CatmullRomCurve3(inletPoints, false, 'centripetal'), outletCurve = new THREE.CatmullRomCurve3(outletPoints, false, 'centripetal'), jacketCurve = new THREE.CatmullRomCurve3([condenserB.clone().add(new THREE.Vector3(0, 0, .12)), condenserA.clone().add(condenserB).multiplyScalar(.5).add(new THREE.Vector3(0, 0, .12)), condenserA.clone().add(new THREE.Vector3(0, 0, .12))], false, 'centripetal'); g.add(new THREE.Mesh(new THREE.TubeGeometry(inletCurve, 72, .062, 14, false), hoseMat), new THREE.Mesh(new THREE.TubeGeometry(outletCurve, 64, .062, 14, false), hoseMat));
    const addFlowTranslucency = (curve, segments, radius, color, source, speed, cycles, phase = 0) => { const uniforms = { uTime: { value: 0 }, uActive: { value: source === 'coolant' ? this.coolantVisualLevel : 0 }, uColor: { value: new THREE.Color(color) }, uSpeed: { value: speed }, uCycles: { value: cycles }, uPhase: { value: phase }, uBase: { value: source === 'coolant' ? .025 : .018 }, uPulse: { value: source === 'coolant' ? .15 : .105 } }, material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: false, vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `uniform float uTime;uniform float uActive;uniform float uSpeed;uniform float uCycles;uniform float uPhase;uniform float uBase;uniform float uPulse;uniform vec3 uColor;varying vec2 vUv;void main(){float travelling=vUv.x-uTime*uSpeed+uPhase;float primary=.5+.5*sin(travelling*6.2831853*uCycles);float secondary=.5+.5*sin((travelling*.53+.17)*6.2831853*uCycles);float change=.72*primary+.28*secondary;float endFade=smoothstep(0.0,.045,vUv.x)*(1.0-smoothstep(.955,1.0,vUv.x));float alpha=uActive*endFade*(uBase+uPulse*change);if(alpha<.002)discard;gl_FragColor=vec4(uColor,alpha);}` }), mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 16, false), material); mesh.renderOrder = 11; mesh.castShadow = false; mesh.receiveShadow = false; g.add(mesh); this.dynamic.push({ kind: 'translucencyFlow', uniforms, source, onset: .16 }); return mesh };
    addFlowTranslucency(inletCurve, 96, .066, 0x8ee9ff, 'coolant', .18, 1.35, 0); addFlowTranslucency(jacketCurve, 84, .193, 0x79ddf5, 'coolant', .21, 1.15, .28); addFlowTranslucency(outletCurve, 88, .066, 0x8ee9ff, 'coolant', .17, 1.3, .57); this.dynamic.push({ kind: 'coolantSleeve', mesh: coolant });
    const stand = this.retortStand(); stand.position.set(-.12, 0, -.03); g.add(stand);
    const receiver = this.beaker(.675, 0x8ed7e9); receiver.position.set(1.55, 0, .04); receiver.scale.setScalar(.72); g.add(receiver); const receiverFill = { kind: 'receiverFill', liquid: receiver.userData.liquidVolume, meniscus: receiver.userData.liquidMeniscus, maxHeight: receiver.userData.liquidMaxHeight, groupScale: .72, surfaceY: .12 }; this.dynamic.push(receiverFill); const adapterPoints = [condenserB.clone(), new THREE.Vector3(1.18, 1.6, .02), new THREE.Vector3(1.45, 1.32, .02), new THREE.Vector3(1.55, 1.04, .02)], adapterCurve = new THREE.CatmullRomCurve3(adapterPoints, false, 'centripetal'); g.add(new THREE.Mesh(new THREE.TubeGeometry(adapterCurve, 48, .072, 16, false), glass));
    const dripMat = new THREE.MeshPhysicalMaterial({ color: 0xe4f9ff, transparent: true, opacity: 0, roughness: .04, transmission: .42, clearcoat: .7, depthWrite: false }), receiverDrop = new THREE.Mesh(new THREE.SphereGeometry(.036, 24, 16), dripMat); receiverDrop.scale.set(.82, 1.42, .82); receiverDrop.renderOrder = 14; receiverDrop.visible = false; g.add(receiverDrop); const rippleMat = new THREE.MeshBasicMaterial({ color: 0xd8f8ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), splashRing = new THREE.Mesh(new THREE.TorusGeometry(.06, .008, 10, 40), rippleMat); splashRing.rotation.x = Math.PI / 2; splashRing.renderOrder = 14; splashRing.visible = false; g.add(splashRing); const splashMat = new THREE.MeshBasicMaterial({ color: 0xe9fbff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), splashDrops = []; for (let i = 0; i < 6; i++) { const splash = new THREE.Mesh(new THREE.SphereGeometry(.011 + (i % 3) * .003, 14, 10), splashMat); splash.renderOrder = 15; splash.visible = false; g.add(splash); splashDrops.push(splash) } this.dynamic.push({ kind: 'receiverDrip', drop: receiverDrop, ring: splashRing, splashDrops, fill: receiverFill, start: new THREE.Vector3(1.55, 1.015, .025), speed: 1.12, phase: .08 });
    const productCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(xBoiler, 1.15, .02), new THREE.Vector3(xBoiler, 2.52, .02), headEnd, condenserA.clone().lerp(condenserB, .5), condenserB, ...adapterPoints.slice(1)], false, 'centripetal'); addFlowTranslucency(productCurve, 132, .036, 0xe0f9ff, 'distillate', .105, 1.2, .12);
    g.userData.waterDistillationRig = true; return shadowReady(g)
  }
  titrationRig(state) {
    const g = new THREE.Group(), glass = GLASS(), steel = metal(0xaebbc1, .14), dark = solid(0x26363d, .34), rubber = solid(0x20282b, .86), whiteTile = new THREE.MeshPhysicalMaterial({ color: 0xfaf9f1, roughness: .24, metalness: 0, clearcoat: .82, clearcoatRoughness: .12 }), buretteX = .06, tubeBottom = 2.28, tubeTop = 3.9, tubeLength = tubeTop - tubeBottom, stopcockY = 2.07, standBaseX = -1.62, standZ = .08, reading = Math.max(0, Math.min(50, state.titrationVolume || 0));
    const liquidBottomY = tubeBottom + .03, liquidMaxHeight = tubeLength - .07, scaleTop = liquidBottomY + liquidMaxHeight, scaleLength = liquidMaxHeight;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(2.35, .065, 2.05), whiteTile); tile.position.set(.12, .14, .08); tile.receiveShadow = true; g.add(tile); const tileEdge = new THREE.LineSegments(new THREE.EdgesGeometry(tile.geometry), new THREE.LineBasicMaterial({ color: 0xc6c9c5, transparent: true, opacity: .72 })); tileEdge.position.copy(tile.position); g.add(tileEdge);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.55, .16, .94), dark); base.position.set(standBaseX, .09, standZ); base.rotation.y = -Math.PI / 2; g.add(base); const baseTop = new THREE.Mesh(new THREE.BoxGeometry(1.42, .025, .82), metal(0x53636a, .3)); baseTop.position.set(standBaseX, .18, standZ); baseTop.rotation.y = -Math.PI / 2; g.add(baseTop); for (const x of [standBaseX - .3, standBaseX + .3]) for (const z of [standZ - .62, standZ + .62]) { const foot = cylinder(.09, .045, rubber, 28); foot.position.set(x, .025, z); g.add(foot) }
    const rod = cylinder(.055, 3.78, steel, 36); rod.position.set(-1.28, 2.02, standZ - .14); g.add(rod); const rodCap = new THREE.Mesh(new THREE.SphereGeometry(.07, 24, 14), steel); rodCap.position.set(-1.28, 3.94, standZ - .14); g.add(rodCap);

    const bossBody = new THREE.Mesh(new THREE.BoxGeometry(.38, .31, .34), dark); bossBody.position.set(-1.28, 3.1, -.04); g.add(bossBody); const bossCollar = cylinder(.105, .48, steel, 32); bossCollar.rotation.z = Math.PI / 2; bossCollar.position.set(-1.02, 3.1, -.04); g.add(bossCollar); const bossScrew = this.tubeBetween(new THREE.Vector3(-1.28, 3.11, .13), new THREE.Vector3(-1.28, 3.11, .38), .045, steel); g.add(bossScrew); const bossKnob = cylinder(.115, .075, dark, 32); bossKnob.rotation.x = Math.PI / 2; bossKnob.position.set(-1.28, 3.11, .425); g.add(bossKnob);
    const clampArm = this.tubeBetween(new THREE.Vector3(-1.02, 3.1, -.04), new THREE.Vector3(-.25, 3.1, 0), .046, steel); g.add(clampArm); const clampHinge = new THREE.Mesh(new THREE.BoxGeometry(.3, .24, .3), dark); clampHinge.position.set(-.22, 3.1, 0); g.add(clampHinge); const clampScrew = this.tubeBetween(new THREE.Vector3(-.22, 3.1, .14), new THREE.Vector3(-.22, 3.1, .42), .035, steel); g.add(clampScrew); const clampWheel = cylinder(.1, .055, dark, 28); clampWheel.rotation.x = Math.PI / 2; clampWheel.position.set(-.22, 3.1, .465); g.add(clampWheel);
    const clampY = 3.1, leftJaw = new THREE.Mesh(new THREE.BoxGeometry(.315, .09, .115), steel); leftJaw.position.set(-.2425, clampY, -.02); g.add(leftJaw); const rightJaw = new THREE.Mesh(new THREE.BoxGeometry(.063, .09, .115), steel); rightJaw.position.set(.1965, clampY, -.02); g.add(rightJaw); const leftPad = new THREE.Mesh(new THREE.BoxGeometry(.04, .145, .145), rubber); leftPad.position.set(buretteX - .125, clampY, .02); g.add(leftPad); const rightPad = new THREE.Mesh(new THREE.BoxGeometry(.04, .145, .145), rubber); rightPad.position.set(buretteX + .125, clampY, .02); g.add(rightPad);

    const buretteTube = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, tubeLength, 48, 1, true), glass); buretteTube.position.set(buretteX, (tubeTop + tubeBottom) / 2, .02); buretteTube.renderOrder = 8; g.add(buretteTube); const topRim = new THREE.Mesh(new THREE.TorusGeometry(.106, .018, 12, 48), glass); topRim.rotation.x = Math.PI / 2; topRim.position.set(buretteX, tubeTop, .02); g.add(topRim);
    const naohMat = new THREE.MeshPhysicalMaterial({ color: 0xcdf3f5, transparent: true, opacity: .72, roughness: .08, transmission: .2, depthWrite: false }), liquid = cylinder(.078, 1, naohMat, 40); liquid.position.set(buretteX, liquidBottomY, .02); liquid.renderOrder = 5; g.add(liquid); const meniscus = cylinder(.079, .014, new THREE.MeshPhysicalMaterial({ color: 0xe7ffff, transparent: true, opacity: .82, roughness: .04, depthWrite: false }), 40); meniscus.position.set(buretteX, scaleTop, .02); meniscus.renderOrder = 9; g.add(meniscus);
    const markMat = new THREE.MeshBasicMaterial({ color: 0x26353b, transparent: true, opacity: .92, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false }), makeLabel = value => { const c = document.createElement('canvas'), cx = c.getContext('2d'); c.width = 128; c.height = 64; cx.clearRect(0, 0, 128, 64); cx.fillStyle = '#22343b'; cx.font = '700 31px ui-monospace, Menlo, monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(String(value), 64, 32); const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; const plane = new THREE.Mesh(new THREE.PlaneGeometry(.17, .078), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); plane.renderOrder = 15; return plane }, markRadius = .112, markEndAngle = Math.asin(.105 / markRadius);
    for (let i = 0; i <= 50; i++) { const y = scaleTop - i / 50 * scaleLength, major = i % 10 === 0, mid = i % 5 === 0, length = major ? .158 : mid ? .118 : .074, startX = .105 - length, startAngle = Math.asin(Math.max(-.98, Math.min(.98, startX / markRadius))), mark = new THREE.Mesh(new THREE.CylinderGeometry(markRadius, markRadius, .008, 32, 1, true, startAngle, markEndAngle - startAngle), markMat); mark.position.set(buretteX, y, .02); mark.renderOrder = 14; g.add(mark); if (major) { const label = makeLabel(i); label.position.set(buretteX + .268, y, .132); g.add(label) } }
    const scaleLine = new THREE.Mesh(new THREE.CylinderGeometry(markRadius, markRadius, scaleLength, 48, 1, true, markEndAngle - .021, .042), markMat); scaleLine.position.set(buretteX, scaleTop - scaleLength / 2, .02); scaleLine.renderOrder = 13; g.add(scaleLine);

    const stopcockConnector = cylinder(.058, .13, glass, 36); stopcockConnector.position.set(buretteX, 2.235, .02); g.add(stopcockConnector); const stopcockBarrel = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .25, 40), glass); stopcockBarrel.rotation.z = Math.PI / 2; stopcockBarrel.position.set(buretteX, stopcockY, .02); g.add(stopcockBarrel); const stopcockPlug = cylinder(.07, .34, new THREE.MeshPhysicalMaterial({ color: 0xf4f2e7, roughness: .2, clearcoat: .72 }), 32); stopcockPlug.rotation.x = Math.PI / 2; stopcockPlug.position.set(buretteX, stopcockY, .02); g.add(stopcockPlug); const handle = new THREE.Group(); handle.position.set(buretteX, stopcockY, .23); handle.rotation.z = state.titrationStage === 2 && state.running ? 0 : Math.PI / 2; const handleStem = new THREE.Mesh(new THREE.BoxGeometry(.08, .36, .065), solid(0xe9edf0, .28)); handle.add(handleStem); for (const y of [-.21, .21]) { const end = new THREE.Mesh(new THREE.SphereGeometry(.07, 24, 14), solid(0xe9edf0, .28)); end.scale.y = .72; end.position.y = y; handle.add(end) } g.add(handle); const tip = this.tubeBetween(new THREE.Vector3(buretteX, stopcockY - .07, .02), new THREE.Vector3(buretteX, 1.86, .02), .045, glass); g.add(tip); const tipEnd = new THREE.Mesh(new THREE.CylinderGeometry(.026, .042, .24, 28), glass); tipEnd.position.set(buretteX, 1.75, .02); g.add(tipEnd);

    const flaskColour = state.complete ? 0xffb7d5 : 0xd5f2f3, flaskLevel = .34 + Math.min(30, reading) * .0065, flask = this.flask(flaskLevel, flaskColour); flask.scale.setScalar(.72); flask.position.set(.06, .17, .1); g.add(flask); this.dynamic.push({ kind: 'titrationSwirl', group: flask, baseX: .06, baseY: .17, baseZ: .1 });
    const pinkBurst = new THREE.Group(), pinkCoreMat = new THREE.MeshBasicMaterial({ color: 0xff4f9c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), pinkWispMat = new THREE.MeshBasicMaterial({ color: 0xf06aa9, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), pinkRingMat = new THREE.MeshBasicMaterial({ color: 0xff9bc8, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), pinkCore = new THREE.Mesh(new THREE.SphereGeometry(.18, 32, 18), pinkCoreMat); pinkCore.scale.set(1, .09, .82); pinkCore.renderOrder = 18; pinkBurst.add(pinkCore); const pinkRing = new THREE.Mesh(new THREE.TorusGeometry(.1, .012, 10, 42), pinkRingMat); pinkRing.rotation.x = Math.PI / 2; pinkRing.position.y = .008; pinkRing.renderOrder = 19; pinkBurst.add(pinkRing); const pinkWisps = []; for (let i = 0; i < 7; i++) { const wisp = new THREE.Mesh(new THREE.SphereGeometry(.046 + (i % 3) * .008, 22, 14), pinkWispMat), angle = i / 7 * Math.PI * 2 + .28; wisp.userData = { angle, reach: .13 + (i % 3) * .035, sink: .035 + (i % 2) * .025 }; wisp.scale.set(1.7, .34, .62); wisp.rotation.y = -angle; wisp.renderOrder = 18; pinkBurst.add(wisp); pinkWisps.push(wisp) } pinkBurst.position.set(0, .075 + flaskLevel * .72, .015); pinkBurst.visible = false; flask.add(pinkBurst); this.dynamic.push({ kind: 'titrationPinkBurst', group: pinkBurst, core: pinkCore, ring: pinkRing, wisps: pinkWisps, coreMat: pinkCoreMat, ringMat: pinkRingMat, wispMat: pinkWispMat, surfaceY: .075 + flaskLevel * .72 });
    const flow = this.liquidPourStream(new THREE.Vector3(buretteX, 1.62, .02), new THREE.Vector3(.06, 1.58, .1), { color: 0xbcefff, time: state.time || 0, radius: .021, opacity: .78, sag: .006, breakup: .42, droplets: 6, splash: true }); flow.visible = false; g.add(flow); const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xe4fcff, transparent: true, opacity: .9, roughness: .04, transmission: .35, ior: 1.333, clearcoat: 1, depthWrite: false }), drop = new THREE.Mesh(new THREE.SphereGeometry(.036, 22, 14), dropMat); drop.position.set(buretteX, 1.62, .04); drop.scale.set(.78, 1.3, .78); drop.visible = false; drop.renderOrder = 14; g.add(drop); const endpointRing = new THREE.Mesh(new THREE.TorusGeometry(.04, .005, 8, 32), new THREE.MeshBasicMaterial({ color: 0xf1fdff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); endpointRing.rotation.x = Math.PI / 2; endpointRing.position.set(.06, 1.58, .1); endpointRing.visible = false; endpointRing.renderOrder = 15; g.add(endpointRing); this.dynamic.push({ kind: 'titrationFlow', liquid, meniscus, bottomY: liquidBottomY, maxHeight: liquidMaxHeight, flow, drop, endpointRing });

    const amber = new THREE.MeshPhysicalMaterial({ color: 0x9c5728, transparent: true, opacity: .72, roughness: .22, transmission: .12, clearcoat: .45 }), bottle = new THREE.Group(), bottleBody = cylinder(.24, .62, amber, 48); bottleBody.position.y = .36; bottle.add(bottleBody); const shoulder = new THREE.Mesh(new THREE.SphereGeometry(.24, 48, 20), amber); shoulder.scale.y = .55; shoulder.position.y = .66; bottle.add(shoulder); const neck = cylinder(.11, .22, amber, 36); neck.position.y = .82; bottle.add(neck); const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.035, .072, .18, 28), new THREE.MeshPhysicalMaterial({ color: 0xf2f4ed, transparent: true, opacity: .82, roughness: .18, transmission: .12 })); nozzle.position.y = .98; nozzle.visible = false; bottle.add(nozzle); const capGroup = new THREE.Group(), cap = cylinder(.15, .18, solid(0xf1f0e9, .42), 40); cap.position.y = .98; capGroup.add(cap); for (let i = 0; i < 8; i++) { const ridge = new THREE.Mesh(new THREE.BoxGeometry(.015, .14, .025), solid(0xd7d7d0, .5)); const a = i / 8 * Math.PI * 2; ridge.position.set(Math.cos(a) * .145, .98, Math.sin(a) * .145); ridge.rotation.y = -a; capGroup.add(ridge) } bottle.add(capGroup); const labelCanvas = document.createElement('canvas'), lc = labelCanvas.getContext('2d'); labelCanvas.width = 1024; labelCanvas.height = 220; lc.fillStyle = '#fffdf4'; lc.fillRect(0, 0, 1024, 220); lc.fillStyle = '#a7376d'; lc.font = '800 56px Inter, sans-serif'; lc.textAlign = 'center'; lc.textBaseline = 'middle'; lc.fillText('PHENOLPHTHALEIN', 512, 86); lc.fillStyle = '#4f5e62'; lc.font = '600 38px Inter, sans-serif'; lc.fillText('INDICATOR', 512, 155); const labelTexture = new THREE.CanvasTexture(labelCanvas); labelTexture.colorSpace = THREE.SRGBColorSpace; labelTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); const bottleLabel = new THREE.Mesh(new THREE.CylinderGeometry(.245, .245, .18, 64, 1, true), new THREE.MeshBasicMaterial({ map: labelTexture, side: THREE.DoubleSide, toneMapped: false })); bottleLabel.position.y = .42; bottleLabel.rotation.y = Math.PI; bottleLabel.renderOrder = 10; bottle.add(bottleLabel); const bottleStart = new THREE.Vector3(1.62, .17, .17); bottle.position.copy(bottleStart); bottle.scale.setScalar(.78); g.add(bottle); const indicatorDropMat = new THREE.MeshPhysicalMaterial({ color: 0xec8bbb, transparent: true, opacity: .9, roughness: .05, transmission: .18, clearcoat: .7, depthWrite: false }), indicatorDrops = []; for (let i = 0; i < 2; i++) { const indicatorDrop = new THREE.Mesh(new THREE.SphereGeometry(.029, 20, 14), indicatorDropMat); indicatorDrop.scale.set(.78, 1.32, .78); indicatorDrop.visible = false; indicatorDrop.renderOrder = 16; g.add(indicatorDrop); indicatorDrops.push(indicatorDrop) } this.dynamic.push({ kind: 'titrationIndicator', group: bottle, cap: capGroup, nozzle, drops: indicatorDrops, start: bottleStart, pour: new THREE.Vector3(.84, 1.9, .14), duration: 3.2 });
    g.position.z = .62; g.userData.titrationRig = true; return shadowReady(g)
  }
  tripod() { const g = new THREE.Group(), frameMat = metal(0x596b71, .3), gauzeMat = metal(0xb9c4c7, .44), y = 1.82; for (const z of [-.7, .7]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(1.92, .06, .06), frameMat); rail.position.set(0, y, z); g.add(rail) } for (const x of [-.94, .94]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, 1.45), frameMat); rail.position.set(x, y, 0); g.add(rail) } for (let i = -7; i <= 7; i++) { const gx = new THREE.Mesh(new THREE.BoxGeometry(1.82, .014, .018), gauzeMat); gx.position.set(0, y + .038, i * .09); g.add(gx); const gz = new THREE.Mesh(new THREE.BoxGeometry(.018, .014, 1.34), gauzeMat); gz.position.set(i * .12, y + .04, 0); g.add(gz) } const centre = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.13), new THREE.MeshStandardMaterial({ color: 0xbac3c4, roughness: .82, metalness: .2, transparent: true, opacity: .18, side: THREE.DoubleSide })); centre.rotation.x = -Math.PI / 2; centre.position.y = y + .025; g.add(centre); const legMat = metal(0x43545a, .26), pairs = [[new THREE.Vector3(-.72, y, -.48), new THREE.Vector3(-1.16, .05, -.88)], [new THREE.Vector3(.72, y, -.48), new THREE.Vector3(1.16, .05, -.88)], [new THREE.Vector3(-.72, y, .48), new THREE.Vector3(-1.16, .05, .88)], [new THREE.Vector3(.72, y, .48), new THREE.Vector3(1.16, .05, .88)]]; for (const [a, b] of pairs) { g.add(this.tubeBetween(a, b, .05, legMat)); const foot = cylinder(.13, .05, legMat, 32); foot.position.copy(b); foot.position.y = .025; g.add(foot) } return shadowReady(g) }
  crucible({ burning = false, lidOn = true, product = false, empty = false, productColor = 0xf6f5ec, productScale = 1 } = {}) { const g = new THREE.Group(), ceramic = new THREE.MeshPhysicalMaterial({ color: 0xf0ead8, roughness: .5, metalness: 0, clearcoat: .18, clearcoatRoughness: .45 }), innerMat = solid(0x85847d, .94); const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.47, .32, .34, 80, 2, true), ceramic); bowl.position.y = .2; g.add(bowl); const base = cylinder(.32, .07, ceramic, 64); base.position.y = .035; g.add(base); const interior = cylinder(.385, .035, innerMat, 72); interior.position.y = .38; g.add(interior); const rim = new THREE.Mesh(new THREE.TorusGeometry(.47, .043, 18, 80), ceramic); rim.rotation.x = Math.PI / 2; rim.position.y = .39; g.add(rim); if (product && productScale > 0) { const oxideMat = solid(productColor, .9); for (let i = 0; i < 34; i++) { const a = i * 2.399, r = (.055 + (i % 7) * .043) * productScale, flake = new THREE.Mesh(new THREE.DodecahedronGeometry((.026 + (i % 4) * .009) * productScale, 0), oxideMat); flake.position.set(Math.cos(a) * r, .39 + (.017 + (i % 5) * .009) * productScale, Math.sin(a) * r); flake.scale.set(1.7, .42, .95); flake.rotation.set(i * .71, i * .38, i * .53); g.add(flake) } } else if (!empty && !product) { const vertices = [], indices = [], turns = 1.7, segments = 96; for (let i = 0; i <= segments; i++) { const t = i / segments, a = .2 + t * Math.PI * 2 * turns, r = .055 + t * .27, width = .027; for (const edge of [-1, 1]) { vertices.push(Math.cos(a) * (r + edge * width), .426 + t * .007, Math.sin(a) * (r + edge * width)) } } for (let i = 0; i < segments; i++) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) } const ribbonGeometry = new THREE.BufferGeometry(); ribbonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); ribbonGeometry.setIndex(indices); ribbonGeometry.computeVertexNormals(); const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xe8edef, metalness: .96, roughness: .13, side: THREE.DoubleSide }); const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMat); g.add(ribbon); const end = new THREE.Mesh(new THREE.BoxGeometry(.13, .016, .055), ribbonMat); const a = .2 + Math.PI * 2 * turns; end.position.set(Math.cos(a) * .34, .44, Math.sin(a) * .34); end.rotation.y = -a + .08; g.add(end) } const lid = new THREE.Group(), cap = cylinder(.49, .075, ceramic, 80); cap.position.y = .035; lid.add(cap); const dome = new THREE.Mesh(new THREE.SphereGeometry(.49, 80, 32), ceramic); dome.scale.y = .13; dome.position.y = .07; lid.add(dome); const underRim = new THREE.Mesh(new THREE.TorusGeometry(.405, .025, 14, 72), ceramic); underRim.rotation.x = Math.PI / 2; underRim.position.y = -.002; lid.add(underRim); const knob = cylinder(.095, .075, ceramic, 48); knob.position.y = .155; lid.add(knob); const knobTop = new THREE.Mesh(new THREE.SphereGeometry(.098, 40, 20), ceramic); knobTop.scale.y = .35; knobTop.position.y = .195; lid.add(knobTop); if (lidOn) lid.position.set(0, .43, 0); else { lid.position.set(.75, .115, .16); lid.rotation.z = -.1; lid.rotation.y = .24 } g.add(lid); if (burning && !lidOn) { const addMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }); const core = new THREE.Mesh(new THREE.SphereGeometry(.28, 40, 24), addMat(0xffffff, 1)); core.position.y = .44; core.scale.y = .48; const corona = new THREE.Mesh(new THREE.SphereGeometry(.52, 40, 24), addMat(0xeaf7ff, .5)); corona.position.y = .47; corona.scale.y = .68; const light = new THREE.PointLight(0xffffff, 16, 6.5, 1.25); light.position.y = .62; const sparks = []; for (let i = 0; i < 18; i++) { const spark = new THREE.Mesh(new THREE.SphereGeometry(.017 + (i % 3) * .006, 12, 8), addMat(i % 3 === 0 ? 0xcfeaff : 0xffffff, .95)); spark.userData = { phase: i / 18, angle: i * 2.399, speed: .72 + (i % 4) * .12 }; g.add(spark); sparks.push(spark) } g.add(core, corona, light); this.dynamic.push({ kind: 'magnesiumBurn', core, corona, light, sparks, seed: 3.2 }) } return shadowReady(g) }
  balance(mass = 0) {
    const g = new THREE.Group();
    const dark = solid(0x172a33, .28), body = solid(0x334952, .24), shoulderMaterial = solid(0x53676f, .22);
    const trim = metal(0x9eacb0, .18), steel = metal(0xd7e0e2, .12), dialCollarMaterial = metal(0x34474d, .3);

    const plinth = new THREE.Mesh(roundedBox(1.92, .16, 1.18, .055, 5), dark);
    plinth.position.y = .08;
    g.add(plinth);
    const lower = new THREE.Mesh(roundedBox(1.78, .42, 1.08, .085, 6), body);
    lower.position.y = .35;
    g.add(lower);
    const shoulder = new THREE.Mesh(roundedBox(1.63, .13, .94, .04, 5), shoulderMaterial);
    shoulder.position.y = .625;
    g.add(shoulder);

    const pedestal = cylinder(.45, .14, trim, 64);
    pedestal.position.y = .74;
    g.add(pedestal);
    const tray = cylinder(.62, .075, steel, 80);
    tray.position.y = .845;
    g.add(tray);
    const trayRim = new THREE.Mesh(new THREE.TorusGeometry(.62, .027, 14, 80), steel);
    trayRim.rotation.x = Math.PI / 2;
    trayRim.position.y = .89;
    g.add(trayRim);

    const bezel = new THREE.Mesh(roundedBox(.94, .285, .055, .025, 5), dark);
    bezel.position.set(0, .43, .57);
    g.add(bezel);
    const displayCanvas = document.createElement('canvas'), dc = displayCanvas.getContext('2d');
    displayCanvas.width = 512;
    displayCanvas.height = 128;
    dc.fillStyle = '#071d20';
    dc.fillRect(0, 0, 512, 128);
    dc.shadowColor = '#77ffe1';
    dc.shadowBlur = 18;
    dc.fillStyle = '#83f7df';
    dc.font = '700 70px ui-monospace, SFMono-Regular, Menlo, monospace';
    dc.textAlign = 'right';
    dc.textBaseline = 'middle';
    dc.fillText(`${Number(mass || 0).toFixed(2)} g`, 476, 67);
    const displayTexture = new THREE.CanvasTexture(displayCanvas);
    displayTexture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.78, .19), new THREE.MeshBasicMaterial({ map: displayTexture, toneMapped: false }));
    screen.position.set(0, .43, .607);
    g.add(screen);

    const addDial = (x, faceColour, indicatorColour, pointerAngle) => {
      const dial = new THREE.Group();
      dial.position.set(x, .35, .586);
      const recess = new THREE.Mesh(new THREE.TorusGeometry(.101, .014, 10, 48), dialCollarMaterial);
      recess.position.z = .002;
      dial.add(recess);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(.088, .097, .052, 32), new THREE.MeshPhysicalMaterial({ color: faceColour, roughness: .28, metalness: .48, clearcoat: .55, clearcoatRoughness: .24 }));
      grip.rotation.x = Math.PI / 2;
      grip.position.z = .03;
      dial.add(grip);
      const face = new THREE.Mesh(new THREE.CylinderGeometry(.074, .074, .012, 48), new THREE.MeshPhysicalMaterial({ color: faceColour, roughness: .2, metalness: .34, clearcoat: .72, clearcoatRoughness: .18 }));
      face.rotation.x = Math.PI / 2;
      face.position.z = .062;
      dial.add(face);
      const indicatorPivot = new THREE.Group();
      indicatorPivot.rotation.z = pointerAngle;
      const indicator = new THREE.Mesh(roundedBox(.012, .052, .009, .004, 2), new THREE.MeshBasicMaterial({ color: indicatorColour, toneMapped: false }));
      indicator.position.set(0, .032, .071);
      indicatorPivot.add(indicator);
      dial.add(indicatorPivot);
      const centre = new THREE.Mesh(new THREE.SphereGeometry(.015, 18, 10), new THREE.MeshPhysicalMaterial({ color: 0xcbd5d7, roughness: .22, metalness: .82, clearcoat: .38 }));
      centre.scale.z = .35;
      centre.position.z = .072;
      dial.add(centre);
      g.add(dial);
    };
    addDial(-.69, 0xaeb9bb, 0x263b42, -.42);
    addDial(.69, 0x34786e, 0xa8fff0, .48);

    for (const x of [-.72, .72]) for (const z of [-.42, .42]) {
      const foot = cylinder(.09, .055, dark, 28);
      foot.position.set(x, .03, z);
      g.add(foot)
    }
    const brand = new THREE.Mesh(roundedBox(.42, .035, .012, .009, 3), new THREE.MeshBasicMaterial({ color: 0xd6e1e2 }));
    brand.position.set(0, .605, .574);
    g.add(brand);
    Object.assign(g.userData, {
      electronicBalance: true,
      housing: { cornerProfile: 'rounded', plinthRadius: .055, bodyRadius: .085, shoulderRadius: .04 },
      display: { width: .78, height: .19, boundsX: [-.39, .39], isolatedFromDials: true },
      controls: { type: 'recessed layered rotary dials with tapered grips and pointer marks', centresX: [-.69, .69], centreY: .35, alignedToSecondLayerVerticalMiddle: true, outerRadius: .115, minimumDisplayClearance: .185, overlap: false }
    });
    return shadowReady(g)
  }
  measuringCylinder(level = .22) { const g = new THREE.Group(), plastic = new THREE.MeshPhysicalMaterial({ color: 0xe7f6f8, transparent: true, opacity: .58, transmission: .42, roughness: .18, ior: 1.47, thickness: .08, side: THREE.DoubleSide, depthWrite: false }), baseMat = new THREE.MeshPhysicalMaterial({ color: 0xdcebed, transparent: true, opacity: .82, roughness: .24, transmission: .18 }); const body = new THREE.Mesh(new THREE.CylinderGeometry(.31, .29, 1.62, 64, 1, true), plastic); body.position.y = .86; g.add(body); const bottom = cylinder(.3, .055, baseMat, 64); bottom.position.y = .05; g.add(bottom); const foot = cylinder(.43, .07, baseMat, 64); foot.position.y = .035; g.add(foot); const rim = new THREE.Mesh(new THREE.TorusGeometry(.315, .025, 14, 64), plastic); rim.rotation.x = Math.PI / 2; rim.position.y = 1.68; g.add(rim); const liquidH = Math.max(.025, level * .78), acid = new THREE.Mesh(new THREE.CylinderGeometry(.255, .265, liquidH, 64), new THREE.MeshPhysicalMaterial({ color: 0xc6eef3, transparent: true, opacity: .78, roughness: .09, transmission: .18 })); acid.position.y = .1 + liquidH / 2; g.add(acid); const meniscus = cylinder(.258, .018, new THREE.MeshPhysicalMaterial({ color: 0xe7fbff, transparent: true, opacity: .72, roughness: .08 }), 64); meniscus.position.y = .1 + liquidH; g.add(meniscus); const marks = new THREE.Group(), markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, depthWrite: false, depthTest: false, side: THREE.DoubleSide }); for (let i = 1; i <= 9; i++) { const width = i % 2 === 0 ? .2 : .12; const r = Math.hypot(.16, .255) + .002, arc = width / r; const mark = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .018, 32, 1, true, -arc / 2, arc), markMat); mark.position.set(0, .16 + i * .15, 0); mark.rotation.y = Math.atan2(.16, .255); mark.renderOrder = 9; marks.add(mark) } g.add(marks); const shine = new THREE.Mesh(new THREE.PlaneGeometry(.035, 1.26), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .42, depthWrite: false })); shine.position.set(-.13, .87, .27); shine.renderOrder = 8; g.add(shine); return shadowReady(g) }
  articulatedHydrogenHand(state) {
    const hand = new THREE.Group(), skin = new THREE.MeshPhysicalMaterial({ color: 0xd8a47e, roughness: .52, metalness: 0, clearcoat: .12, clearcoatRoughness: .4, sheen: .28, sheenColor: 0xffd4ba }), skinLight = new THREE.MeshPhysicalMaterial({ color: 0xe1ad87, roughness: .49, metalness: 0, clearcoat: .14, clearcoatRoughness: .36, sheen: .3, sheenColor: 0xffdcc5 }), creaseMat = new THREE.MeshBasicMaterial({ color: 0x9b604d, transparent: true, opacity: .28, depthWrite: false });
    const smoothPart = (points, radius, material = skin, segments = 42) => { const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal'), part = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 18, false), material); part.castShadow = true; part.receiveShadow = true; hand.add(part); return part };
    const rounded = (radius, scale, position, material = skin) => { const part = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 28), material); part.scale.copy(scale); part.position.copy(position); hand.add(part); return part };
    const palm = rounded(1, new THREE.Vector3(.72, .46, .29), new THREE.Vector3(1.47, 1.53, -.29)); palm.rotation.z = -.035;
    const palmHeel = rounded(1, new THREE.Vector3(.43, .39, .27), new THREE.Vector3(1.76, 1.47, -.3), skinLight); palmHeel.rotation.z = -.08;
    const wrist = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .77, 12, 36), skin); wrist.rotation.z = Math.PI / 2; wrist.position.set(2.16, 1.49, -.31); wrist.scale.set(1, 1, .96); hand.add(wrist);
    rounded(1, new THREE.Vector3(.34, .3, .24), new THREE.Vector3(1.3, 1.76, -.19), skinLight);
    const fingerRows = [1.23, 1.43, 1.63, 1.82], fingerRadii = [.078, .083, .086, .081], tipXs = [.31, .27, .24, .29];
    for (let i = 0; i < 4; i++) {
      const y = fingerRows[i], radius = fingerRadii[i], z = -.285 + i * .008, tip = new THREE.Vector3(tipXs[i], y - .02, -.055 + i * .004), points = [new THREE.Vector3(1.2, y, z), new THREE.Vector3(.97, y + .012, -.335 + i * .006), new THREE.Vector3(.68, y + .018, -.365 + i * .005), new THREE.Vector3(.415, y - .004, -.255 + i * .004), tip];
      smoothPart(points, radius, i === 0 ? skinLight : skin, 48); rounded(radius, new THREE.Vector3(1.04, 1, .98), tip, i === 0 ? skinLight : skin);
    }
    const clamp = value => Math.max(0, Math.min(1, value)), smooth = value => { value = clamp(value); return value * value * (3 - 2 * value) }, stage = state.hydrogenStage || 0, t = state.hydrogenTimer || 0; let sealRaw = 0;
    if (stage === 0 || stage === 2 || stage === 3) sealRaw = 1; else if (stage === 1) sealRaw = t < .48 ? 1 - t / .48 : t < 1.55 ? 0 : (t - 1.55) / .52; else if (stage === 4) sealRaw = 1 - t / .3;
    const sealQ = smooth(sealRaw), sealed = [new THREE.Vector3(1.31, 1.76, -.17), new THREE.Vector3(1.2, 1.96, -.13), new THREE.Vector3(1.01, 2.15, -.07), new THREE.Vector3(.79, 2.24, -.005), new THREE.Vector3(.65, 2.24, .025)], open = [new THREE.Vector3(1.31, 1.76, -.17), new THREE.Vector3(1.29, 1.96, -.14), new THREE.Vector3(1.23, 2.12, -.1), new THREE.Vector3(1.13, 2.26, -.06), new THREE.Vector3(1.02, 2.35, -.03)], thumbPoints = open.map((point, i) => point.clone().lerp(sealed[i], sealQ));
    smoothPart(thumbPoints, .115, skinLight, 52); rounded(.145, new THREE.Vector3(1.12, 1, 1), thumbPoints[0], skinLight); rounded(.115, new THREE.Vector3(1, .96, .96), thumbPoints[1], skinLight); rounded(.108, new THREE.Vector3(1, 1, 1), thumbPoints.at(-1), skinLight);
    const lambdaOrigin = new THREE.Vector3(1.12, 1.78, -.012);
    const creaseCurves = [
      { role: 'long lower palm crease', points: [new THREE.Vector3(1.63, 1.17, -.025), new THREE.Vector3(1.67, 1.31, -.006), new THREE.Vector3(1.66, 1.48, .002), new THREE.Vector3(1.59, 1.65, -.002), new THREE.Vector3(1.52, 1.78, -.012)], radius: .0085 },
      { role: 'lambda inner branch', points: [lambdaOrigin.clone(), new THREE.Vector3(1.14, 1.66, -.001), new THREE.Vector3(1.19, 1.52, .003), new THREE.Vector3(1.29, 1.38, -.009)], radius: .0075 },
      { role: 'lambda outer branch', points: [lambdaOrigin.clone(), new THREE.Vector3(1.24, 1.68, .001), new THREE.Vector3(1.38, 1.55, .004), new THREE.Vector3(1.49, 1.39, -.007)], radius: .0075 }
    ];
    for (const definition of creaseCurves) { const crease = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(definition.points, false, 'centripetal'), 36, definition.radius, 8, false), creaseMat); crease.renderOrder = 8; crease.userData.palmCreaseRole = definition.role; hand.add(crease) }
    hand.userData.articulatedHand = true; hand.userData.palmCreases = { count: 3, layout: 'one long lower-to-upper crease and two lambda branches', lambdaOrigin: 'midpoint of thumb-index web' }; return shadowReady(hand)
  }
  hydrogenRig(state) {
    const g = new THREE.Group(), stage = state.hydrogenStage || 0, t = state.hydrogenTimer || 0, tubeX = .65, glass = GLASS();
    const tube = new THREE.Group(), wall = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, 1.78, 56, 1, true), glass); wall.position.y = 1.02; tube.add(wall); const bottom = new THREE.Mesh(new THREE.SphereGeometry(.27, 56, 28, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass); bottom.scale.y = 1.14; bottom.position.y = .145; tube.add(bottom); const bottomRim = new THREE.Mesh(new THREE.TorusGeometry(.215, .018, 12, 64), glass); bottomRim.rotation.x = Math.PI / 2; bottomRim.position.y = .155; tube.add(bottomRim); const rim = new THREE.Mesh(new THREE.TorusGeometry(.28, .028, 14, 64), glass); rim.rotation.x = Math.PI / 2; rim.position.y = 1.92; tube.add(rim); const lip = new THREE.Mesh(new THREE.TorusGeometry(.315, .024, 14, 64), glass); lip.rotation.x = Math.PI / 2; lip.position.y = 1.92; tube.add(lip);
    const acidQ = stage === 0 ? 0 : stage === 1 ? Math.min(1, t / 2.25) : 1, liquidH = .04 + acidQ * .38; if (acidQ > .02) { const liquid = cylinder(.225, liquidH, new THREE.MeshPhysicalMaterial({ color: 0xbfeaf0, transparent: true, opacity: .72, roughness: .12, transmission: .16 }), 56); liquid.position.y = .16 + liquidH / 2; tube.add(liquid); const meniscus = cylinder(.226, .016, new THREE.MeshPhysicalMaterial({ color: 0xe9fbff, transparent: true, opacity: .62 }), 56); meniscus.position.y = .16 + liquidH; tube.add(meniscus) }
    const ribbonMat = new THREE.MeshPhysicalMaterial({ color: 0xeaf0f1, metalness: .62, roughness: .12, clearcoat: .7 }); for (let i = 0; i < 3; i++) { const coil = new THREE.Mesh(new THREE.TorusGeometry(.115 + i * .025, .015, 10, 48, Math.PI * 1.75), ribbonMat); coil.rotation.x = Math.PI / 2; coil.rotation.z = i * .85; coil.position.set(0, .18 + i * .035, 0); tube.add(coil) }
    if (stage === 1 || stage === 2) { const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xf4feff, transparent: true, opacity: .82, depthWrite: false }); for (let i = 0; i < 18; i++) { const phase = (state.time * (.42 + (i % 5) * .065) + i * .137) % 1, a = i * 2.399, r = .035 + (i % 4) * .036, bubble = new THREE.Mesh(new THREE.SphereGeometry(.022 + (i % 3) * .01, 12, 8), bubbleMat); bubble.position.set(Math.cos(a) * r, .33 + phase * 1.32, Math.sin(a) * r); tube.add(bubble) } }
    if (stage >= 2 && stage <= 4) { const gasHeight = 1.25, gas = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, gasHeight, 48), new THREE.MeshBasicMaterial({ color: 0xa8e8f3, transparent: true, opacity: .055 + Math.min(1, (state.hydrogenGas || 0) / 40) * .07, depthWrite: false })); gas.position.y = .55 + gasHeight / 2; tube.add(gas) } tube.position.set(tubeX, .22, .02); g.add(tube, this.articulatedHydrogenHand(state));
    const pourQ = stage === 1 ? Math.min(1, t / 2.25) : stage > 1 ? 1 : 0, lift = Math.min(1, pourQ / .24), retreat = Math.max(0, Math.min(1, (pourQ - .82) / .18)), cylPos = new THREE.Vector3(-1.8, .22, .1).lerp(new THREE.Vector3(-1.35, 1.34, .05), lift); cylPos.lerp(new THREE.Vector3(-1.8, .22, .1), retreat); const measure = this.measuringCylinder(stage === 0 ? .28 : Math.max(.015, .28 * (1 - pourQ))); measure.position.copy(cylPos); measure.rotation.z = -1.08 * lift * (1 - retreat); g.add(measure); if (stage === 1 && pourQ > .2 && pourQ < .86) { const start = new THREE.Vector3(.08, 2.35, .34), end = new THREE.Vector3(.65, 2.08, .28); g.add(this.liquidPourStream(start, end, { color: 0xb8f1ff, time: t, radius: .052, opacity: .76, sag: .04, breakup: .64, droplets: 5, splash: true })) }
    if (stage === 4) { const approach = Math.min(1, t / .34), tip = new THREE.Vector3(-.78 + 1.38 * approach, 2.25, .08), handle = tip.clone().add(new THREE.Vector3(-1.55, .34, .03)), wood = this.tubeBetween(handle, tip, .025, new THREE.MeshStandardMaterial({ color: 0xb57a3a, roughness: .72 })); g.add(wood); const ember = new THREE.Mesh(new THREE.SphereGeometry(.06, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd37a, toneMapped: false })); ember.position.copy(tip); g.add(ember); const splintFlame = new THREE.Mesh(new THREE.ConeGeometry(.075, .25, 32), new THREE.MeshBasicMaterial({ color: 0xff8b32, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); splintFlame.position.copy(tip).add(new THREE.Vector3(0, .14, 0)); g.add(splintFlame); if (t > .36 && t < .88) { const q = (t - .36) / .52, puff = new THREE.Mesh(new THREE.SphereGeometry(.22, 32, 20), new THREE.MeshBasicMaterial({ color: q < .45 ? 0xffdd88 : 0x72cfff, transparent: true, opacity: .72 * (1 - q), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); puff.position.set(tubeX, 2.24 + q * .32, .02); puff.scale.set(1 + q * 1.6, .65 + q, .8 + q); g.add(puff); const frontQ = Math.max(0, Math.min(1, (t - .4) / .43)), front = new THREE.Mesh(new THREE.SphereGeometry(.19, 32, 18), new THREE.MeshBasicMaterial({ color: frontQ < .55 ? 0x4baeff : 0xffd478, transparent: true, opacity: .88 * (1 - frontQ * .35), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); front.scale.set(.82, 1.25, .82); front.position.set(tubeX, .5 + frontQ * 1.55, .02); g.add(front); const flash = new THREE.PointLight(0xffc76f, 8 * (1 - q), 4, 1.5); flash.position.copy(front.position); g.add(flash) } }
    return shadowReady(g)
  }
  thermometer(temperature = 20) {
    const g = new THREE.Group(), glass = new THREE.MeshPhysicalMaterial({ color: 0xeaf7f8, transparent: true, opacity: .42, transmission: .52, roughness: .08, ior: 1.46, thickness: .06, clearcoat: .55, side: THREE.DoubleSide, depthWrite: false }), red = new THREE.MeshPhysicalMaterial({ color: 0xd6343d, roughness: .18, metalness: .12, clearcoat: .45 }), white = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .92, depthWrite: false }), q = Math.max(0, Math.min(1, (temperature - 20) / 28)), columnH = .36 + q * 2.55;
    const sheath = new THREE.Mesh(new THREE.CylinderGeometry(.078, .078, 3.35, 48, 1, true), glass); sheath.position.y = 1.725; g.add(sheath); const topRing = new THREE.Mesh(new THREE.TorusGeometry(.078, .012, 10, 40), glass); topRing.rotation.x = Math.PI / 2; topRing.position.y = 3.4; g.add(topRing);
    const column = cylinder(.026, columnH, red, 24); column.position.y = .11 + columnH / 2; g.add(column); const bulb = new THREE.Mesh(new THREE.SphereGeometry(.105, 32, 20), red); bulb.scale.set(1, .9, 1); bulb.position.y = .095; g.add(bulb);
    for (let i = 0; i <= 20; i++) { const major = i % 5 === 0, arc = Math.PI * (major ? .58 : .38), geometry = new THREE.TorusGeometry(.082, major ? .009 : .006, 8, 20, arc); geometry.rotateZ(Math.PI / 2 - arc / 2); const band = new THREE.Mesh(geometry, white); band.rotation.x = Math.PI / 2; band.position.y = .34 + i * .145; band.renderOrder = 8; g.add(band) }
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(.018, 2.96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .58, depthWrite: false })); shine.position.set(-.043, 1.78, .071); shine.renderOrder = 9; g.add(shine);
    return shadowReady(g)
  }
  ratesCrossPaper() { const g = new THREE.Group(), paperMat = new THREE.MeshStandardMaterial({ color: 0xfffdf1, roughness: .92, metalness: 0, side: THREE.DoubleSide }), inkMat = new THREE.MeshStandardMaterial({ color: 0x11191c, roughness: .84, metalness: 0 }); const paper = new THREE.Mesh(new THREE.BoxGeometry(1.62, .025, 1.34), paperMat); paper.position.y = .115; g.add(paper); for (const angle of [Math.PI / 4, -Math.PI / 4]) { const stroke = new THREE.Mesh(new THREE.BoxGeometry(1.4, .018, .105), inkMat); stroke.rotation.y = angle; stroke.position.y = .142; g.add(stroke) } const curl = new THREE.Mesh(new THREE.TorusGeometry(.72, .012, 6, 60, Math.PI * .45), new THREE.MeshBasicMaterial({ color: 0xe3dfcd, transparent: true, opacity: .55 })); curl.rotation.set(Math.PI / 2, 0, Math.PI * .27); curl.position.set(-.06, .148, .04); g.add(curl); return shadowReady(g) }
  electricWaterBath(temperature = 20, target = 20, active = false) {
    const g = new THREE.Group(), bathW = 2.08, bathD = 1.54, bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xf7f8f6, roughness: .24, metalness: .04, clearcoat: .72, clearcoatRoughness: .15 }), rimMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .2, metalness: .02, clearcoat: .8, clearcoatRoughness: .12 }), steelMat = metal(0xc4d0d3, .16), dark = solid(0x152830, .55), waterMat = new THREE.MeshPhysicalMaterial({ color: 0x3eb9d5, transparent: true, opacity: .58, roughness: .12, transmission: .08, clearcoat: .84, clearcoatRoughness: .08, depthWrite: false, side: THREE.DoubleSide });
    const bodyHeight = .68;
    const base = new THREE.Mesh(new THREE.BoxGeometry(bathW, bodyHeight, bathD), bodyMat); base.position.y = bodyHeight / 2; g.add(base);
    const innerFloor = new THREE.Mesh(new THREE.BoxGeometry(1.76, .1, 1.22), rimMat); innerFloor.position.y = .72; g.add(innerFloor);
    const wallBottom = .64, wallTop = 1.09, wallHeight = wallTop - wallBottom, wallY = (wallTop + wallBottom) / 2, rimRadius = .08;
    for (const x of [-.96, .96]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(.16, wallHeight, bathD), bodyMat); wall.position.set(x, wallY, 0); g.add(wall) }
    for (const z of [-.69, .69]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(1.92, wallHeight, .16), bodyMat); wall.position.set(0, wallY, z); g.add(wall) }
    for (const x of [-.96, .96]) g.add(this.tubeBetween(new THREE.Vector3(x, wallTop, -.69), new THREE.Vector3(x, wallTop, .69), rimRadius, bodyMat));
    for (const z of [-.69, .69]) g.add(this.tubeBetween(new THREE.Vector3(-.96, wallTop, z), new THREE.Vector3(.96, wallTop, z), rimRadius, bodyMat));
    for (const x of [-.96, .96]) for (const z of [-.69, .69]) { const corner = new THREE.Mesh(new THREE.SphereGeometry(rimRadius, 28, 18), bodyMat); corner.position.set(x, wallTop, z); g.add(corner) }
    const waterVolume = new THREE.Mesh(new THREE.BoxGeometry(1.71, .31, 1.17), waterMat); waterVolume.position.y = .91; waterVolume.renderOrder = 2; g.add(waterVolume);
    const surfaceMat = new THREE.MeshPhysicalMaterial({ color: 0x57cce4, emissive: 0x0b6679, emissiveIntensity: .09, transparent: true, opacity: .76, roughness: .09, transmission: .05, clearcoat: .94, clearcoatRoughness: .04, depthWrite: false, side: THREE.DoubleSide });
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.71, .025, 1.17), surfaceMat); water.position.y = 1.069; water.renderOrder = 4; g.add(water);
    const waterEdgeMat = new THREE.MeshBasicMaterial({ color: 0x188eaa, transparent: true, opacity: .72, depthWrite: false, toneMapped: false });
    for (const [w, d, x, z] of [[1.72, .018, 0, -.586], [1.72, .018, 0, .586], [.018, 1.17, -.856, 0], [.018, 1.17, .856, 0]]) { const edge = new THREE.Mesh(new THREE.BoxGeometry(w, .012, d), waterEdgeMat); edge.position.set(x, 1.078, z); edge.renderOrder = 5; g.add(edge) }
    const ripples = [];
    for (const [i, x] of [[0, -.38], [1, .55]]) { const rippleMat = new THREE.MeshBasicMaterial({ color: 0xc9f7ff, transparent: true, opacity: .46, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), ripple = new THREE.Mesh(new THREE.RingGeometry(.13 + i * .025, .145 + i * .025, 56), rippleMat); ripple.rotation.x = -Math.PI / 2; ripple.position.set(x, 1.083, .01); ripple.scale.y = .58; ripple.renderOrder = 6; g.add(ripple); ripples.push(ripple) }
    const panel = new THREE.Mesh(roundedBox(.96, .34, .05, .025), dark); panel.position.set(0, .3, bathD / 2 + .031); g.add(panel);
    const displayCanvas = document.createElement('canvas'), dc = displayCanvas.getContext('2d'); displayCanvas.width = 512; displayCanvas.height = 160; dc.fillStyle = '#071d20'; dc.fillRect(0, 0, 512, 160); dc.shadowColor = '#71ffe8'; dc.shadowBlur = 18; dc.fillStyle = '#83f7df'; dc.font = '800 66px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(`${temperature.toFixed(1)} °C`, 256, 65); dc.shadowBlur = 0; dc.fillStyle = '#b8c6c8'; dc.font = '700 27px Inter, sans-serif'; dc.fillText(`SET ${target.toFixed(0)} °C`, 256, 128);
    const texture = new THREE.CanvasTexture(displayCanvas); texture.colorSpace = THREE.SRGBColorSpace; const display = new THREE.Mesh(new THREE.PlaneGeometry(.76, .26), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })); display.position.set(0, .31, bathD / 2 + .058); g.add(display);
    const indicator = new THREE.Mesh(new THREE.SphereGeometry(.048, 20, 12), new THREE.MeshBasicMaterial({ color: active ? 0xff7b3d : 0x41d38b, toneMapped: false })); indicator.scale.z = .32; indicator.position.set(.68, .31, bathD / 2 + .067); g.add(indicator);
    const dial = cylinder(.1, .06, steelMat, 32); dial.rotation.x = Math.PI / 2; dial.position.set(-.68, .31, bathD / 2 + .063); g.add(dial);
    for (const x of [-.72, .72]) for (const z of [-.55, .55]) { const foot = new THREE.Mesh(roundedBox(.2, .07, .17, .015), dark); foot.position.set(x, .035, z); g.add(foot) }
    const bathThermometer = this.thermometer(temperature); bathThermometer.scale.setScalar(.54); bathThermometer.position.set(.55, .68, .02); bathThermometer.rotation.z = -.06; g.add(bathThermometer);
    const heaterLight = new THREE.PointLight(0xff7048, active ? 2.4 : .25, 2.2, 1.7); heaterLight.position.set(0, .5, 0); g.add(heaterLight); this.dynamic.push({ kind: 'bathWater', surface: water, volume: waterVolume, ripples, indicator, light: heaterLight, active, baseY: 1.069 }); Object.assign(g.userData, { electricWaterBath: true, lowerChassisTopEdge: 'square', upperTankTopEdge: 'continuous rounded rail', outerFootprintContinuous: true }); return shadowReady(g)
  }
  leafSample() {
    const g = new THREE.Group(), shape = new THREE.Shape();
    shape.moveTo(0, -.72);
    shape.bezierCurveTo(.18, -.65, .43, -.54, .52, -.27);
    shape.bezierCurveTo(.6, .02, .42, .39, 0, .72);
    shape.bezierCurveTo(-.42, .39, -.6, .02, -.52, -.27);
    shape.bezierCurveTo(-.43, -.54, -.18, -.65, 0, -.72);
    const contour = shape.getPoints(192), halfWidthAt = y => {
      let halfWidth = 0;
      for (let i = 0; i < contour.length; i++) {
        const a = contour[i], b = contour[(i + 1) % contour.length], crosses = a.y <= y && b.y > y || b.y <= y && a.y > y;
        if (crosses) { const x = a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y); halfWidth = Math.max(halfWidth, Math.abs(x)) }
      }
      return halfWidth
    };
    const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x4b9851, roughness: .48, metalness: 0, clearcoat: .12, clearcoatRoughness: .5, side: THREE.DoubleSide }), edgeMat = new THREE.MeshStandardMaterial({ color: 0x245d30, roughness: .58, side: THREE.DoubleSide }), veinMat = new THREE.MeshStandardMaterial({ color: 0xcee0a0, roughness: .54 });
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .026, bevelEnabled: true, bevelSegments: 3, bevelSize: .018, bevelThickness: .012, curveSegments: 28 }), leafMat); blade.geometry.computeVertexNormals(); blade.position.z = -.013; g.add(blade);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(blade.geometry, 18), new THREE.LineBasicMaterial({ color: 0x245d30, transparent: true, opacity: .52 })); outline.position.copy(blade.position); g.add(outline);
    g.add(this.tubeBetween(new THREE.Vector3(0, -.71, .035), new THREE.Vector3(0, .64, .035), .015, veinMat));
    for (let i = 0; i < 6; i++) {
      const y = -.48 + i * .19, rightY = y + .13, leftY = y + .145, rightReach = Math.min(.43, Math.max(.045, halfWidthAt(rightY) - .05)), leftReach = Math.min(.43, Math.max(.045, halfWidthAt(leftY) - .05));
      g.add(this.tubeBetween(new THREE.Vector3(0, y, .036), new THREE.Vector3(rightReach, rightY, .036), .009, veinMat));
      g.add(this.tubeBetween(new THREE.Vector3(0, y + .015, .036), new THREE.Vector3(-leftReach, leftY, .036), .009, veinMat));
    }
    const petiole = this.tubeBetween(new THREE.Vector3(0, -.7, .01), new THREE.Vector3(0, -.98, .01), .025, edgeMat); g.add(petiole);
    Object.assign(g.userData, { leafMat, veinMat, outline, veinsContained: true, veinEdgeMargin: .05 });
    return shadowReady(g)
  }
  biologyForceps() {
    const g = new THREE.Group(), steel = metal(0xc9d3d5, .12), dark = metal(0x66757a, .22);
    for (const side of [-1, 1]) {
      const front = side < 0, jawZ = front ? .078 : -.078, arm = this.tubeBetween(new THREE.Vector3(side * .035, -.08, jawZ * .72), new THREE.Vector3(side * .14, 1.18, jawZ * .2), .025, steel); g.add(arm);
      const jaw = this.tubeBetween(new THREE.Vector3(side * .035, -.08, jawZ * .72), new THREE.Vector3(side * .1, -.35, jawZ), .021, dark); g.add(jaw);
      const innerZ = front ? .04 : -.021, outerZ = jawZ + (front ? .004 : -.004), pad = this.tubeBetween(new THREE.Vector3(side * .1, -.35, innerZ), new THREE.Vector3(side * .1, -.35, outerZ), .03, dark); g.add(pad);
      const grip = new THREE.Mesh(new THREE.TorusGeometry(.145, .024, 12, 42), steel); grip.position.set(side * .14, 1.28, jawZ * .2); g.add(grip)
    }
    const hinge = cylinder(.065, .16, dark, 28); hinge.rotation.z = Math.PI / 2; hinge.position.y = .78; g.add(hinge);
    Object.assign(g.userData, { frontJawZ: .078, rearJawZ: -.078, leafPlaneZ: 0, leafHeldBetweenJaws: true });
    return shadowReady(g)
  }
  biologyDropper(colour = 0x9b5a22) {
    const g = new THREE.Group(), glass = GLASS(), rubber = new THREE.MeshPhysicalMaterial({ color: 0x24333a, roughness: .62, clearcoat: .15 }), liquidMat = new THREE.MeshPhysicalMaterial({ color: colour, transparent: true, opacity: .82, roughness: .18 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.075, .055, .88, 32, 1, true), glass); barrel.position.y = .62; g.add(barrel);
    const liquid = cylinder(.041, .5, liquidMat, 24); liquid.position.y = .55; g.add(liquid);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.055, .48, 32, 1, true), glass); tip.position.y = -.05; tip.rotation.z = Math.PI; g.add(tip);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.15, 36, 22), rubber); bulb.scale.set(.82, 1.18, .82); bulb.position.y = 1.18; g.add(bulb);
    const collar = cylinder(.1, .11, metal(0xaebbc0, .16), 32); collar.position.y = 1.01; g.add(collar);
    Object.assign(g.userData, { liquid, liquidMat }); return shadowReady(g)
  }
  electricHotplate(active = true) {
    const g = new THREE.Group(), body = new THREE.MeshPhysicalMaterial({ color: 0xf4f5f1, roughness: .28, metalness: .04, clearcoat: .72 }), dark = solid(0x25363d, .52), coilMat = new THREE.MeshStandardMaterial({ color: active ? 0xff6a35 : 0x4e5557, roughness: .42, metalness: .6, emissive: active ? 0x8b1f08 : 0x000000, emissiveIntensity: active ? 1.5 : 0 });
    const base = new THREE.Mesh(roundedBox(1.48, .28, 1.28, .08), body); base.position.y = .14; g.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.54, .58, .08, 64), dark); top.position.y = .32; g.add(top);
    for (const r of [.14, .25, .36, .47]) { const coil = new THREE.Mesh(new THREE.TorusGeometry(r, .022, 10, 64), coilMat); coil.rotation.x = Math.PI / 2; coil.position.y = .38; g.add(coil) }
    const panel = new THREE.Mesh(roundedBox(.58, .16, .04, .02), dark); panel.position.set(0, .14, .66); g.add(panel);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.04, 18, 10), new THREE.MeshBasicMaterial({ color: active ? 0xff7540 : 0x435259, toneMapped: false })); lamp.position.set(.2, .15, .69); lamp.scale.z = .3; g.add(lamp);
    const dial = cylinder(.075, .05, metal(0xbec8ca, .14), 24); dial.rotation.x = Math.PI / 2; dial.position.set(-.2, .15, .69); g.add(dial);
    if (active) { const glow = new THREE.PointLight(0xff7b46, 1.8, 2.2, 1.7); glow.position.set(0, .6, 0); g.add(glow) }
    return shadowReady(g)
  }
  curvedBottleLabel(label, radius = .316, height = .26, arc = 1.72) {
    const c = document.createElement('canvas'), ct = c.getContext('2d'); c.width = 320; c.height = 150; ct.fillStyle = '#fffdf4'; ct.fillRect(0, 0, 320, 150); ct.strokeStyle = '#3d7771'; ct.lineWidth = 8; ct.strokeRect(4, 4, 312, 142); ct.fillStyle = '#1b3d43'; ct.font = '800 48px Inter, sans-serif'; ct.textAlign = 'center'; ct.textBaseline = 'middle'; ct.fillText(label, 160, 58); ct.fillStyle = '#678087'; ct.font = '700 25px Inter, sans-serif'; ct.fillText('BIOLOGY LAB', 160, 111);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const labelMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 56, 1, true, -arc / 2, arc), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })); labelMesh.position.y = .43; labelMesh.renderOrder = 3; labelMesh.userData.curvedBottleLabel = true; return labelMesh
  }
  labelledBiologyBottle(label, colour = 0xd9ecf0) {
    const g = new THREE.Group(), bodyMat = new THREE.MeshPhysicalMaterial({ color: colour, transparent: true, opacity: .82, transmission: .18, roughness: .18, clearcoat: .7 }), capMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f2e9, roughness: .32, clearcoat: .5 });
    const body = cylinder(.31, .72, bodyMat, 48); body.position.y = .39; g.add(body);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(.31, 48, 20), bodyMat); shoulder.scale.set(1, .42, 1); shoulder.position.y = .75; g.add(shoulder);
    const neck = cylinder(.14, .25, bodyMat, 36); neck.position.y = .94; g.add(neck);
    const cap = cylinder(.17, .18, capMat, 36); cap.position.y = 1.12; g.add(cap);
    for (let i = 0; i < 10; i++) { const ridge = new THREE.Mesh(new THREE.BoxGeometry(.018, .16, .025), solid(0xcac8bf, .5)); const a = i / 10 * Math.PI * 2; ridge.position.set(Math.cos(a) * .17, 1.12, Math.sin(a) * .17); ridge.rotation.y = -a; g.add(ridge) }
    const labelMesh = this.curvedBottleLabel(label); g.add(labelMesh); Object.assign(g.userData, { labelSurface: 'cylindrical wrap', automaticCurvedLabel: true });
    return shadowReady(g)
  }
  digitalStopwatch() {
    const g = new THREE.Group(), bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x263a43, roughness: .34, metalness: .12, clearcoat: .42 }), trim = metal(0xb9c6c9, .18);
    const body = new THREE.Mesh(roundedBox(1.12, .76, .22, .12), bodyMat); body.position.y = .42; g.add(body);
    const bezel = new THREE.Mesh(roundedBox(.87, .39, .025, .045), trim); bezel.position.set(0, .47, .124); g.add(bezel);
    const canvas = document.createElement('canvas'), dc = canvas.getContext('2d'); canvas.width = 512; canvas.height = 220; const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.77, .31), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })); screen.position.set(0, .47, .184); screen.renderOrder = 4; g.add(screen);
    for (const x of [-.27, 0, .27]) { const button = new THREE.Mesh(new THREE.SphereGeometry(.07, 24, 14), new THREE.MeshPhysicalMaterial({ color: x === 0 ? 0xd85c91 : 0xaebcc0, roughness: .3, clearcoat: .4 })); button.scale.y = .48; button.position.set(x, .12, .11); g.add(button) }
    const loop = new THREE.Mesh(new THREE.TorusGeometry(.18, .035, 12, 40, Math.PI), trim); loop.rotation.z = Math.PI; loop.position.y = .88; g.add(loop);
    Object.assign(g.userData, { display: { canvas, context: dc, texture }, screen }); return shadowReady(g)
  }
  starchLeafRig(state) {
    const g = new THREE.Group(), stage = state.starchStage || 0, benchLift = .1, ethanolShiftX = .18, ethanolX = -.72 + ethanolShiftX, ethanolZ = -.42, ethanolScale = .72, ethanolBaseY = .68 + benchLift, ethanolTubeTopY = ethanolBaseY + 1.685 * ethanolScale;
    const hotplate = this.electricHotplate(true); hotplate.position.set(-2.38, benchLift, .06); hotplate.scale.setScalar(.82); g.add(hotplate);
    const hotWater = this.beaker(.72, 0x8bcbd9); hotWater.position.set(-2.38, .29 + benchLift, .06); hotWater.scale.setScalar(.76); const boilCloud = this.bubbleCloud(26, .43, .68, 0xe9feff); boilCloud.visible = stage === 1; hotWater.add(boilCloud); g.add(hotWater);
    const steamMat = new THREE.MeshBasicMaterial({ color: 0xeefcff, transparent: true, opacity: .14, depthWrite: false }); for (let i = 0; i < 7; i++) { const puff = new THREE.Mesh(new THREE.SphereGeometry(.08 + (i % 3) * .025, 18, 12), steamMat.clone()); puff.scale.set(1.4, .55, 1); puff.position.set(-2.38 + (i % 3 - 1) * .12, 1.45 + benchLift + (i % 4) * .18, .06 + (i % 2) * .07); puff.visible = stage === 1; g.add(puff) }
    const bath = this.electricWaterBath(78, 78, stage === 3); bath.position.set(-.48, benchLift, -.43); bath.scale.setScalar(.72); g.add(bath);
    const ethanol = this.testTube(.86, stage >= 4 ? 0x78a865 : 0xe7eee6); ethanol.position.set(ethanolX, ethanolBaseY, ethanolZ); ethanol.scale.setScalar(ethanolScale); g.add(ethanol);
    const holderPostX = -.15 + ethanolShiftX, holderArmEndX = -.6 + ethanolShiftX, clampPost = cylinder(.035, 1.55, metal(0x9aa9ad, .14), 20); clampPost.position.set(holderPostX, .78 + benchLift, -.44); g.add(clampPost); const clampArm = this.tubeBetween(new THREE.Vector3(holderPostX, 1.35 + benchLift, -.44), new THREE.Vector3(holderArmEndX, 1.35 + benchLift, -.43), .025, metal(0xaeb9bc, .12)); g.add(clampArm);
    const rinse = this.beaker(.64, 0x9bd6e0); rinse.position.set(1.1, .08, .1); rinse.scale.setScalar(.69); g.add(rinse);
    const tileMat = new THREE.MeshPhysicalMaterial({ color: 0xfffef7, roughness: .22, metalness: 0, clearcoat: .72 }), tile = new THREE.Mesh(roundedBox(1.42, .055, 1.08, .055), tileMat); tile.position.set(2.48, .085, .12); g.add(tile);
    for (let i = 0; i < 6; i++) { const well = new THREE.Mesh(new THREE.TorusGeometry(.14, .015, 8, 38), new THREE.MeshStandardMaterial({ color: 0xe6e3d8, roughness: .45 })); well.rotation.x = Math.PI / 2; well.position.set(2.11 + (i % 3) * .37, .12, -.05 + Math.floor(i / 3) * .35); g.add(well) }
    const iodine = this.labelledBiologyBottle('IODINE', 0x9a5a25); iodine.position.set(3.05, benchLift, -.57); iodine.scale.setScalar(.6); g.add(iodine);
    const leaf = this.leafSample(), forceps = this.biologyForceps(), pipette = this.biologyDropper(0x9a531f); g.add(leaf, forceps, pipette);
    const iodineDrops = [], patches = []; for (let i = 0; i < 4; i++) { const drop = new THREE.Mesh(new THREE.SphereGeometry(.035, 18, 12), new THREE.MeshPhysicalMaterial({ color: 0xb36b22, transparent: true, opacity: .92, roughness: .14 })); drop.visible = false; g.add(drop); iodineDrops.push(drop) }
    for (let i = 0; i < 12; i++) { const patch = new THREE.Mesh(new THREE.CircleGeometry(.075 + (i % 3) * .018, 26), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0x161d38 : 0x252b4f, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); patch.rotation.x = -Math.PI / 2; patch.position.set(2.48 + Math.cos(i * 2.399) * (.08 + (i % 4) * .055), .205, 0.12 + Math.sin(i * 2.399) * (.06 + (i % 4) * .045)); patch.renderOrder = 5; patch.visible = false; g.add(patch); patches.push(patch) }
    this.dynamic.push({ kind: 'starchLeaf', leaf, leafMat: leaf.userData.leafMat, veinMat: leaf.userData.veinMat, forceps, pipette, iodineDrops, patches, ethanolLiquid: ethanol.userData.liquid, benchLift, ethanolX, ethanolZ, ethanolTubeTopY, ethanolShiftX });
    return shadowReady(g)
  }
  lipaseRig(state) {
    const g = new THREE.Group(), bathX = .55, bathZ = -.38, benchLift = .1;
    const bath = this.electricWaterBath(state.lipaseBathTemp || 20, state.lipaseTargetTemp || 20, !!state.lipaseConditioning); bath.position.set(bathX, benchLift, bathZ); bath.scale.setScalar(.94); g.add(bath);
    const tube = this.testTube(.92, 0xdc669d); tube.position.set(.18, .68 + benchLift, bathZ - .02); tube.scale.setScalar(.9); g.add(tube);
    const post = cylinder(.038, 1.78, metal(0xa3b0b4, .14), 24); post.position.set(-.28, .9 + benchLift, bathZ); g.add(post);
    const arm = this.tubeBetween(new THREE.Vector3(-.28, 1.47 + benchLift, bathZ), new THREE.Vector3(.08, 1.47 + benchLift, bathZ), .026, metal(0xbcc6c8, .12)); g.add(arm);
    const clamp = new THREE.Mesh(new THREE.TorusGeometry(.2, .025, 10, 48), new THREE.MeshPhysicalMaterial({ color: 0xb9c4c6, metalness: .8, roughness: .13 })); clamp.rotation.x = Math.PI / 2; clamp.position.set(.18, 1.47 + benchLift, bathZ - .02); g.add(clamp);
    const bottle = this.labelledBiologyBottle('LIPASE', 0xb8e4e9); bottle.position.set(-2.05, benchLift, .05); bottle.scale.setScalar(.9); g.add(bottle);
    const pipette = this.biologyDropper(0xa9e0e8); pipette.position.set(-2.05, 1.18 + benchLift, .05); pipette.scale.setScalar(.72); g.add(pipette);
    const stopwatch = this.digitalStopwatch(); stopwatch.position.set(2.46, .04 + benchLift, .08); stopwatch.rotation.y = -.12; stopwatch.scale.setScalar(.92); g.add(stopwatch);
    const drops = []; for (let i = 0; i < 5; i++) { const drop = new THREE.Mesh(new THREE.SphereGeometry(.03, 16, 10), new THREE.MeshPhysicalMaterial({ color: 0xb9f1f3, transparent: true, opacity: .9, roughness: .1 })); drop.visible = false; g.add(drop); drops.push(drop) }
    const globules = []; for (let i = 0; i < 24; i++) { const globule = new THREE.Mesh(new THREE.SphereGeometry(.012 + (i % 4) * .005, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0xfff4d7, transparent: true, opacity: .72, roughness: .28 })); const a = i * 2.399, r = .025 + (i % 5) * .022; globule.position.set(Math.cos(a) * r, .22 + (i % 9) * .055, Math.sin(a) * r); tube.add(globule); globules.push(globule) }
    this.dynamic.push({ kind: 'lipase', tube, solution: tube.userData.liquid, pipette, drops, globules, display: stopwatch.userData.display, benchLift });
    return shadowReady(g)
  }
  potatoCylinder() {
    const g = new THREE.Group(), flesh = new THREE.MeshPhysicalMaterial({ color: 0xe6c985, roughness: .76, metalness: 0, clearcoat: .04 }), cut = new THREE.MeshStandardMaterial({ color: 0xf0d99b, roughness: .82, metalness: 0 }), skinFleck = new THREE.MeshStandardMaterial({ color: 0xa8793e, roughness: .9, metalness: 0 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .92, 64, 4, false), [flesh, cut, cut]); body.geometry.computeVertexNormals(); g.add(body);
    for (let i = 0; i < 30; i++) {
      const angle = i * 2.399, r = .161, y = -.4 + (i % 11) * .08, fleck = new THREE.Mesh(new THREE.SphereGeometry(.008 + (i % 3) * .003, 9, 6), skinFleck);
      fleck.scale.set(1.35, .58, .72); fleck.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r); fleck.rotation.set(angle * .2, angle, -angle * .1); g.add(fleck)
    }
    for (const y of [-.461, .461]) { const endRing = new THREE.Mesh(new THREE.TorusGeometry(.145, .009, 8, 52), new THREE.MeshStandardMaterial({ color: 0xd8b873, roughness: .78 })); endRing.rotation.x = Math.PI / 2; endRing.position.y = y; g.add(endRing) }
    const wrinkles = []; for (let i = 0; i < 5; i++) { const wrinkle = new THREE.Mesh(new THREE.TorusGeometry(.163, .0065, 7, 52), new THREE.MeshStandardMaterial({ color: 0xb58b50, transparent: true, opacity: 0, roughness: .85 })); wrinkle.rotation.x = Math.PI / 2; wrinkle.position.y = -.3 + i * .15; wrinkle.visible = false; g.add(wrinkle); wrinkles.push(wrinkle) }
    Object.assign(g.userData, { flesh, wrinkles, equalCylinder: true, flatCutEnds: true, surfaceFlecks: true }); return shadowReady(g)
  }
  osmosisRig(state) {
    const g = new THREE.Group(), stage = state.osmosisStage || 0, concentration = state.osmosisConcentration || 0, change = ({ 0: 16, 0.2: 8, 0.4: 1.6, 0.6: -9, 0.8: -17 })[concentration] ?? 0, balanceX = -2.35, beakerX = 0, beakerZ = -.3, blotX = 2.28, blotZ = .12;
    const balance = this.balance(5); balance.scale.setScalar(.78); balance.position.set(balanceX, .08, .06); g.add(balance); let balanceDisplay = null; balance.traverse(object => { const canvas = object.material?.map?.image; if (!balanceDisplay && canvas?.getContext) balanceDisplay = { canvas, context: canvas.getContext('2d'), texture: object.material.map } });
    const dilute = new THREE.Color(0x78cbe1), concentrated = new THREE.Color(0xe2bb72), solutionColour = dilute.clone().lerp(concentrated, concentration / .8).getHex(), beaker = this.beaker(.72, solutionColour); beaker.scale.setScalar(1.06); beaker.position.set(beakerX, .05, beakerZ); g.add(beaker);
    const sucroseMat = new THREE.MeshPhysicalMaterial({ color: 0xffe0a3, transparent: true, opacity: .62, roughness: .2, transmission: .08, depthWrite: false }); for (let i = 0; i < 6 + Math.round(concentration * 18); i++) { const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(.018 + (i % 3) * .004, 0), sucroseMat); const a = i * 2.399, r = .07 + (i % 7) * .07; crystal.position.set(Math.cos(a) * r, .18 + (i % 10) * .075, Math.sin(a) * r); crystal.rotation.set(i * .3, i * .5, i * .17); beaker.add(crystal) }
    const timer = this.digitalStopwatch(); timer.scale.setScalar(.72); timer.position.set(1.85, .06, -.94); timer.rotation.y = -.08; g.add(timer);
    const paperMat = new THREE.MeshPhysicalMaterial({ color: 0xfffdf1, roughness: .94, metalness: 0, clearcoat: .015, side: THREE.DoubleSide }), paperEdge = new THREE.MeshStandardMaterial({ color: 0xe0ddd0, roughness: .9 }), basePaper = new THREE.Mesh(roundedBox(1.38, .035, 1.12, .035), paperMat); basePaper.position.set(blotX, .105, blotZ); g.add(basePaper);
    for (let i = 0; i < 7; i++) { const fibre = this.tubeBetween(new THREE.Vector3(blotX - .58 + i * .18, .126, blotZ - .46), new THREE.Vector3(blotX - .52 + i * .18, .126, blotZ + .46), .004, paperEdge); fibre.rotation.y = (i % 2 ? 1 : -1) * .05; g.add(fibre) }
    const topPaper = new THREE.Mesh(roundedBox(1.3, .03, 1.02, .03), paperMat.clone()); topPaper.position.set(blotX, 1.25, blotZ); topPaper.visible = false; g.add(topPaper);
    const potato = this.potatoCylinder(), forceps = this.biologyForceps(); g.add(potato, forceps);
    const waterMolecules = []; for (let i = 0; i < 12; i++) { const molecule = new THREE.Group(), oxygen = new THREE.Mesh(new THREE.SphereGeometry(.034 + (i % 3) * .004, 16, 11), new THREE.MeshBasicMaterial({ color: 0x0877b6, transparent: true, opacity: .94, depthWrite: false, depthTest: false, toneMapped: false })), hydrogenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .98, depthWrite: false, depthTest: false, toneMapped: false }); oxygen.renderOrder = 18; molecule.add(oxygen); for (const side of [-1, 1]) { const hydrogen = new THREE.Mesh(new THREE.SphereGeometry(.017, 14, 9), hydrogenMat); hydrogen.position.set(side * .031, .027, 0); hydrogen.renderOrder = 19; molecule.add(hydrogen) } molecule.visible = false; molecule.renderOrder = 18; g.add(molecule); waterMolecules.push(molecule) }
    const movementArrows = []; for (let i = 0; i < 4; i++) { const arrow = new THREE.Group(), shaft = cylinder(.015, .2, new THREE.MeshBasicMaterial({ color: 0x075f96, transparent: true, opacity: .9, depthWrite: false, depthTest: false, toneMapped: false }), 16); shaft.rotation.z = Math.PI / 2; shaft.renderOrder = 20; arrow.add(shaft); const head = new THREE.Mesh(new THREE.ConeGeometry(.043, .1, 20), new THREE.MeshBasicMaterial({ color: 0xeaffff, transparent: true, opacity: .98, depthWrite: false, depthTest: false, toneMapped: false })); head.rotation.z = -Math.PI / 2; head.position.x = .145; head.renderOrder = 21; arrow.add(head); arrow.visible = false; g.add(arrow); movementArrows.push(arrow) }
    const drainDrops = []; for (let i = 0; i < 10; i++) { const drop = new THREE.Mesh(new THREE.SphereGeometry(.024 + (i % 3) * .005, 14, 9), new THREE.MeshPhysicalMaterial({ color: solutionColour, transparent: true, opacity: .8, roughness: .08, transmission: .15, depthWrite: false })); drop.visible = false; drop.scale.set(.72, 1.45, .72); g.add(drop); drainDrops.push(drop) }
    this.dynamic.push({ kind: 'osmosis', potato, forceps, waterMolecules, movementArrows, drainDrops, topPaper, balanceDisplay, timerDisplay: timer.userData.display, balanceX, beakerX, beakerZ, blotX, blotZ, change, wrinkles: potato.userData.wrinkles });
    Object.assign(g.userData, { osmosisRig: true, potatoCylinderEqual: true, solutionVolumeCm3: 50, forcepsGrip: 'front and rear jaws around potato cylinder', blottingSheets: 2 }); return shadowReady(g)
  }
  potometerLeafyShoot() {
    const g = new THREE.Group(), stemMat = new THREE.MeshPhysicalMaterial({ color: 0x3d7d42, roughness: .5, metalness: 0, clearcoat: .08 }), cutMat = new THREE.MeshStandardMaterial({ color: 0xd8e6bd, roughness: .72 }), leafEntries = [];
    const mainCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-.025, .6, .015), new THREE.Vector3(.055, 1.25, -.015), new THREE.Vector3(.01, 1.9, .02)], false, 'centripetal');
    const mainStem = new THREE.Mesh(new THREE.TubeGeometry(mainCurve, 72, .045, 14, false), stemMat); g.add(mainStem);
    const cutFace = new THREE.Mesh(new THREE.CircleGeometry(.046, 32), cutMat); cutFace.rotation.x = -Math.PI / 2; cutFace.rotation.z = .28; cutFace.position.set(0, .002, 0); g.add(cutFace);
    const leafData = [
      [-1, .47, .42, -.04, .62, .18], [1, .63, .45, .08, -.58, -.16],
      [-1, .82, .49, .12, .7, .1], [1, 1.02, .5, -.08, -.66, -.12],
      [-1, 1.2, .48, -.12, .62, .16], [1, 1.39, .46, .1, -.6, -.08],
      [-1, 1.56, .42, .06, .67, .1], [1, 1.72, .38, -.05, -.58, -.14],
      [-1, 1.84, .3, .02, .18, .04]
    ];
    const horizontalBranchScale = .72;
    for (let i = 0; i < leafData.length; i++) {
      const [side, y, reach, z, , yaw] = leafData[i], base = new THREE.Vector3(mainCurve.getPoint(Math.min(.98, y / 1.9)).x, y, z), tip = new THREE.Vector3(side * reach * horizontalBranchScale, y + .13 + (i % 2) * .035, z + side * .05), direction = tip.clone().sub(base).normalize(), leafScale = .31 - (i > 6 ? .025 : 0), branchBaseRadius = .018 + (i % 3) * .002, petioleRadius = leafScale * .025, branchEnd = tip.clone().addScaledVector(direction, petioleRadius * 1.2), branch = this.taperedTubeBetween(base, branchEnd, branchBaseRadius, petioleRadius, stemMat); g.add(branch);
      const leafPivot = new THREE.Group(), leaf = this.leafSample(); leafPivot.position.copy(tip); leafPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction); leafPivot.rotateY(yaw); leaf.scale.setScalar(leafScale); leaf.position.set(0, leafScale * .98, -leafScale * .01); leafPivot.add(leaf); g.add(leafPivot); leafEntries.push({ leaf: leafPivot, blade: leaf, base: leafPivot.rotation.clone(), phase: i * .83, side })
    }
    Object.assign(g.userData, { leafEntries, mainStem, cutUnderwater: true, angledCut: true, leafCount: leafEntries.length, containedVeins: true, leafPetioleAxisAlignedWithBranch: true, branchesMeetPetioleBases: true, branchPetioleOverlap: true, leafFlutterPivotAtPetioleBase: true, horizontalBranchScale, branchesTaperToPetioleDiameter: true }); return shadowReady(g)
  }
  potometerRig(state) {
    const g = new THREE.Group(), glass = GLASS(), waterMat = new THREE.MeshPhysicalMaterial({ color: 0x62c9df, transparent: true, opacity: .68, roughness: .1, transmission: .12, clearcoat: .78, clearcoatRoughness: .06, depthWrite: false }), rubber = new THREE.MeshPhysicalMaterial({ color: 0x26363a, roughness: .72, clearcoat: .08 }), steel = metal(0xaab8bc, .16), dark = solid(0x1b3038, .54), sealMat = new THREE.MeshPhysicalMaterial({ color: 0xe6db9b, transparent: true, opacity: .84, roughness: .42, clearcoat: .22 }), capillaryY = .46, capillaryZ = .04, junctionX = .78, refillerX = .96, bubbleZeroX = 3.02, mmScale = .039;
    const standBase = new THREE.Mesh(roundedBox(1.65, .13, .82, .05), new THREE.MeshPhysicalMaterial({ color: 0x344a52, roughness: .35, metalness: .58, clearcoat: .25 })); standBase.position.set(-.05, .075, -.68); g.add(standBase);
    const post = cylinder(.045, 2.45, steel, 28); post.position.set(-.62, 1.26, -.68); g.add(post);
    const lowerSupportY = .76, lowerSupportArm = this.tubeBetween(new THREE.Vector3(-.62, lowerSupportY, -.68), new THREE.Vector3(-.03, lowerSupportY, -.08), .029, steel), lowerJaw = new THREE.Mesh(new THREE.TorusGeometry(.28, .027, 10, 48, Math.PI * 1.72), steel); lowerJaw.rotation.set(Math.PI / 2, 0, .15); lowerJaw.position.set(-.03, lowerSupportY, -.02); g.add(lowerSupportArm, lowerJaw);
    const refillerSupportY = 1.49, refillerClampCentre = new THREE.Vector3(refillerX, refillerSupportY, capillaryZ - .015), refillerClampRadius = .205, upperSupportArm = this.tubeBetween(new THREE.Vector3(-.62, refillerSupportY, -.68), new THREE.Vector3(refillerX - refillerClampRadius, refillerSupportY, capillaryZ - .015), .029, steel), refillerJaw = new THREE.Mesh(new THREE.TorusGeometry(refillerClampRadius, .027, 10, 56, Math.PI * 1.82), steel); refillerJaw.rotation.set(Math.PI / 2, 0, .1); refillerJaw.position.copy(refillerClampCentre); g.add(upperSupportArm, refillerJaw);
    const chamberShell = new THREE.Mesh(new THREE.CylinderGeometry(.255, .255, .92, 64, 1, true), glass); chamberShell.position.set(0, .59, capillaryZ); g.add(chamberShell);
    const chamberBottom = new THREE.Mesh(new THREE.SphereGeometry(.255, 48, 22, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass); chamberBottom.position.set(0, .13, capillaryZ); g.add(chamberBottom);
    const chamberWater = cylinder(.208, .82, waterMat, 56); chamberWater.position.set(0, .55, capillaryZ); g.add(chamberWater);
    const bung = cylinder(.27, .19, rubber, 48); bung.position.set(0, 1.06, capillaryZ); g.add(bung);
    const bungHole = cylinder(.066, .22, new THREE.MeshBasicMaterial({ color: 0x0c171a }), 28); bungHole.position.set(0, 1.065, capillaryZ); g.add(bungHole);
    const jellyCollar = new THREE.Mesh(new THREE.TorusGeometry(.09, .027, 14, 56), sealMat); jellyCollar.rotation.x = Math.PI / 2; jellyCollar.position.set(0, 1.17, capillaryZ); g.add(jellyCollar);
    const shoot = this.potometerLeafyShoot(); shoot.position.set(0, 1.02, capillaryZ); g.add(shoot);

    const connectorStart = new THREE.Vector3(.17, capillaryY, capillaryZ), junction = new THREE.Vector3(junctionX, capillaryY, capillaryZ), capillaryEnd = new THREE.Vector3(3.2, capillaryY, capillaryZ);
    g.add(this.tubeBetween(connectorStart, junction, .065, glass), this.tubeBetween(new THREE.Vector3(.18, capillaryY, capillaryZ), junction, .031, waterMat));
    g.add(this.tubeBetween(junction, capillaryEnd, .065, glass));
    const capillaryWater = this.tubeBetween(junction, new THREE.Vector3(3.18, capillaryY, capillaryZ), .031, waterMat); g.add(capillaryWater);
    const junctionGlass = new THREE.Mesh(new THREE.SphereGeometry(.075, 32, 20), glass), junctionWater = new THREE.Mesh(new THREE.SphereGeometry(.036, 28, 18), waterMat); junctionGlass.position.copy(junction); junctionWater.position.copy(junction); g.add(junctionGlass, junctionWater);
    const scaleBacking = new THREE.Mesh(roundedBox(2.08, .27, .025, .018), new THREE.MeshStandardMaterial({ color: 0xf6f2df, roughness: .86, metalness: 0 })); scaleBacking.position.set(2.045, capillaryY + .19, capillaryZ - .065); g.add(scaleBacking);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x17323c, depthTest: false, toneMapped: false });
    for (let mm = 0; mm <= 50; mm += 2) {
      const major = mm % 10 === 0, mid = mm % 5 === 0, x = bubbleZeroX - mm * mmScale, tick = new THREE.Mesh(new THREE.BoxGeometry(.012, major ? .16 : mid ? .12 : .075, .015), tickMat);
      tick.position.set(x, capillaryY + .105 + (major ? .015 : 0), capillaryZ + .055); tick.renderOrder = 10; g.add(tick)
    }
    const numberLabel = (value, x) => {
      const canvas = document.createElement('canvas'), dc = canvas.getContext('2d'); canvas.width = 128; canvas.height = 64; dc.fillStyle = '#18333d'; dc.font = '800 42px Inter, sans-serif'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(String(value), 64, 32); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; const label = new THREE.Mesh(new THREE.PlaneGeometry(.25, .125), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthTest: false })); label.position.set(x, capillaryY + .275, capillaryZ + .085); label.renderOrder = 12; g.add(label)
    };
    for (let mm = 0; mm <= 50; mm += 10)numberLabel(mm, bubbleZeroX - mm * mmScale);
    const bubble = new THREE.Group(), bubbleHalo = new THREE.Mesh(new THREE.CapsuleGeometry(.048, .17, 12, 30), new THREE.MeshBasicMaterial({ color: 0x173b46, transparent: true, opacity: .78, depthWrite: false, depthTest: false, toneMapped: false })), bubbleCore = new THREE.Mesh(new THREE.CapsuleGeometry(.032, .145, 12, 30), new THREE.MeshBasicMaterial({ color: 0xf4ffff, transparent: true, opacity: .98, depthWrite: false, depthTest: false, toneMapped: false })); bubbleHalo.rotation.z = bubbleCore.rotation.z = Math.PI / 2; bubbleHalo.renderOrder = 18; bubbleCore.renderOrder = 19; bubble.add(bubbleHalo, bubbleCore); bubble.position.set(bubbleZeroX, capillaryY, capillaryZ + .075); bubble.visible = false; g.add(bubble);
    const zeroMarker = new THREE.Mesh(new THREE.TorusGeometry(.076, .012, 8, 38), new THREE.MeshBasicMaterial({ color: 0x2f8d73, toneMapped: false })); zeroMarker.rotation.y = Math.PI / 2; zeroMarker.position.set(bubbleZeroX, capillaryY, capillaryZ); g.add(zeroMarker);

    const cup = this.beaker(.68, 0x62c9df); cup.scale.setScalar(.42); cup.position.set(3.3, .055, capillaryZ); g.add(cup);
    const tip = this.tubeBetween(new THREE.Vector3(3.16, capillaryY, capillaryZ), new THREE.Vector3(3.28, .38, capillaryZ), .042, glass); g.add(tip);
    const tipWater = this.tubeBetween(new THREE.Vector3(3.15, capillaryY, capillaryZ), new THREE.Vector3(3.27, .385, capillaryZ), .019, waterMat); g.add(tipWater);

    const branchStart = junction.clone(), branchEnd = new THREE.Vector3(refillerX, 1.03, capillaryZ - .015); g.add(this.tubeBetween(branchStart, branchEnd, .075, glass), this.tubeBetween(branchStart, branchEnd, .035, waterMat));
    const reservoirShell = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .92, 48, 1, true), glass); reservoirShell.position.set(refillerX, 1.49, capillaryZ - .015); g.add(reservoirShell);
    const reservoirWater = cylinder(.125, .65, waterMat, 40); reservoirWater.position.set(refillerX, 1.31, capillaryZ - .015); g.add(reservoirWater);
    const plungerRod = cylinder(.045, .68, steel, 24); plungerRod.position.set(refillerX, 2.16, capillaryZ - .015); g.add(plungerRod);
    const plungerSeal = cylinder(.145, .09, rubber, 40); plungerSeal.position.set(refillerX, 1.93, capillaryZ - .015); g.add(plungerSeal);
    const plungerTop = new THREE.Mesh(roundedBox(.5, .08, .18, .025), dark); plungerTop.position.set(refillerX, 2.48, capillaryZ - .015); g.add(plungerTop);
    const stopcockPivot = new THREE.Group(); stopcockPivot.position.set(.87, .75, capillaryZ + .02); const stopHub = cylinder(.075, .18, steel, 28); stopHub.rotation.x = Math.PI / 2; stopcockPivot.add(stopHub); const stopArm = new THREE.Mesh(roundedBox(.38, .075, .09, .02), new THREE.MeshPhysicalMaterial({ color: 0x2f8d73, roughness: .3, clearcoat: .45 })); stopcockPivot.add(stopArm); stopcockPivot.rotation.z = .52; g.add(stopcockPivot);
    const reservoirSeal = new THREE.Mesh(new THREE.TorusGeometry(.17, .018, 10, 48), sealMat); reservoirSeal.rotation.x = Math.PI / 2; reservoirSeal.position.set(refillerX, 1.96, capillaryZ - .015); g.add(reservoirSeal);
    const capillarySupport = cylinder(.032, .6, steel, 20); capillarySupport.position.set(2.04, .3, -.28); g.add(capillarySupport); const supportFork = new THREE.Mesh(new THREE.TorusGeometry(.12, .024, 9, 38, Math.PI), steel); supportFork.rotation.set(Math.PI / 2, 0, Math.PI); supportFork.position.set(2.04, .53, -.02); g.add(supportFork);

    const timer = this.digitalStopwatch(); timer.scale.setScalar(.7); timer.position.set(2.08, .04, -.78); timer.rotation.y = -.08; g.add(timer);
    const windCanvas = document.createElement('canvas'), windDc = windCanvas.getContext('2d'); windCanvas.width = 420; windCanvas.height = 170; const windTexture = new THREE.CanvasTexture(windCanvas); windTexture.colorSpace = THREE.SRGBColorSpace;
    const anemometer = new THREE.Group(), meterBody = new THREE.Mesh(roundedBox(.48, .72, .18, .08), new THREE.MeshPhysicalMaterial({ color: 0x243941, roughness: .34, metalness: .16, clearcoat: .4 })); meterBody.position.y = .38; anemometer.add(meterBody); const windScreen = new THREE.Mesh(new THREE.PlaneGeometry(.36, .23), new THREE.MeshBasicMaterial({ map: windTexture, toneMapped: false })); windScreen.position.set(0, .47, .103); anemometer.add(windScreen); const sensorRing = new THREE.Mesh(new THREE.TorusGeometry(.22, .028, 12, 48), steel); sensorRing.position.y = 1.02; anemometer.add(sensorRing); const anemometerRotor = new THREE.Group(); anemometerRotor.position.y = 1.02; for (let i = 0; i < 4; i++) { const pivot = new THREE.Group(); pivot.rotation.z = i * Math.PI / 2; const blade = new THREE.Mesh(new THREE.BoxGeometry(.05, .19, .035), new THREE.MeshPhysicalMaterial({ color: 0xd8e5e6, roughness: .24, metalness: .54 })); blade.position.y = .11; pivot.add(blade); anemometerRotor.add(pivot) } const sensorHub = new THREE.Mesh(new THREE.SphereGeometry(.055, 24, 14), dark); anemometerRotor.add(sensorHub); anemometer.add(anemometerRotor); anemometer.position.set(-1.28, .08, .56); anemometer.rotation.y = -.16; g.add(anemometer);

    const fan = new THREE.Group(), fanEnamel = new THREE.MeshPhysicalMaterial({ color: 0x386f77, roughness: .25, metalness: .38, clearcoat: .68 }), fanBladeMat = new THREE.MeshPhysicalMaterial({ color: 0xa7d1d1, roughness: .26, metalness: .28, clearcoat: .5 }), fanBase = new THREE.Mesh(roundedBox(.78, .15, .64, .08), fanEnamel); fanBase.position.y = .075; fan.add(fanBase); const fanPost = cylinder(.07, .75, steel, 28); fanPost.position.y = .5; fan.add(fanPost); const fanNeck = this.tubeBetween(new THREE.Vector3(0, .82, 0), new THREE.Vector3(.15, 1.19, 0), .075, fanEnamel); fan.add(fanNeck); const cageCentre = new THREE.Vector3(.18, 1.55, 0); for (const radius of [.7, .61]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .022, 10, 72), steel); ring.rotation.y = Math.PI / 2; ring.position.copy(cageCentre); fan.add(ring) } for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; fan.add(this.tubeBetween(cageCentre, new THREE.Vector3(cageCentre.x, cageCentre.y + Math.cos(a) * .69, Math.sin(a) * .69), .011, steel)) } const fanRotor = new THREE.Group(); fanRotor.position.copy(cageCentre); for (let i = 0; i < 5; i++) { const pivot = new THREE.Group(); pivot.rotation.x = i * Math.PI * 2 / 5 + .16; const blade = new THREE.Mesh(roundedBox(.08, .5, .2, .055), fanBladeMat); blade.position.y = .28; pivot.add(blade); fanRotor.add(pivot) } const fanHub = new THREE.Mesh(new THREE.SphereGeometry(.16, 36, 22), fanEnamel); fanHub.scale.x = .7; fanRotor.add(fanHub); fan.add(fanRotor); fan.position.set(-2.55, .04, -.48); fan.rotation.y = -.34; g.add(fan);

    const airflowDashes = [], airMat = new THREE.MeshBasicMaterial({ color: 0xb7f4ef, transparent: true, opacity: .48, depthWrite: false, depthTest: false, toneMapped: false });
    for (let i = 0; i < 14; i++) { const dash = new THREE.Mesh(new THREE.CapsuleGeometry(.018, .2, 6, 12), airMat.clone()); dash.rotation.z = Math.PI / 2; dash.visible = false; dash.renderOrder = 15; g.add(dash); airflowDashes.push(dash) }
    const vapour = [], vapourMat = new THREE.MeshBasicMaterial({ color: 0xd8fbff, transparent: true, opacity: .58, depthWrite: false, depthTest: false, toneMapped: false });
    for (let i = 0; i < 18; i++) { const mote = new THREE.Mesh(new THREE.SphereGeometry(.018 + (i % 3) * .006, 12, 8), vapourMat.clone()); mote.visible = false; mote.renderOrder = 16; g.add(mote); vapour.push(mote) }

    this.dynamic.push({ kind: 'potometer', shoot, leafEntries: shoot.userData.leafEntries, bubble, cup, cupBaseY: cup.position.y, plungerRod, plungerSeal, plungerTop, plungerBase: { rod: plungerRod.position.y, seal: plungerSeal.position.y, top: plungerTop.position.y }, stopcockPivot, fanRotor, anemometerRotor, airflowDashes, vapour, timerDisplay: timer.userData.display, windDisplay: { canvas: windCanvas, context: windDc, texture: windTexture }, bubbleZeroX, mmScale });
    Object.assign(g.userData, { bubblePotometer: true, waterFilled: true, airtight: true, cutShootUnderwater: true, petroleumJellySeals: true, graduatedCapillaryMm: true, graduatedCapillaryShiftedRight: true, refillerReset: true, refillerX, junctionX, refillerTubeJoinsBetweenCapillaryAndShootChamber: true, plumbingOrder: 'shoot water chamber → short connector → refiller T-junction → graduated capillary', singleBubble: true, leafCount: shoot.userData.leafCount, leafPetioleAxisAlignedWithBranch: true, branchesContinuousWithPetioles: true, upperStandSupportTargetsRefiller: true, refillerClampHeight: refillerSupportY }); return shadowReady(g)
  }
  ratesSulfurCloud(progress = 0) { const g = new THREE.Group(), q = Math.max(0, Math.min(1, progress)), hazeMat = new THREE.MeshPhysicalMaterial({ color: 0xe8d76d, transparent: true, opacity: .06 + q * .58, roughness: .72, transmission: .04, depthWrite: false }), haze = cylinder(.54, .35, hazeMat, 64); haze.position.y = .25; g.add(haze); const flakeMat = new THREE.MeshBasicMaterial({ color: 0xffef9b, transparent: true, opacity: .12 + q * .68, depthWrite: false }); for (let i = 0; i < 46; i++) { const a = i * 2.399, r = .04 + (i % 9) * .052, flake = new THREE.Mesh(new THREE.SphereGeometry(.012 + (i % 3) * .006, 10, 7), flakeMat); flake.position.set(Math.cos(a) * r, .1 + ((i * 7) % 23) / 23 * .45, Math.sin(a) * r); flake.scale.set(1.4, .55, 1); g.add(flake) } return g }
  paintPhDisplay(display, reading) {
    if (!display) return; const value = Number.isFinite(reading) ? Math.max(0, Math.min(14, reading)) : null, key = value == null ? 'empty' : value.toFixed(2); if (display.key === key) return; display.key = key;
    const dc = display.context, canvas = display.canvas; dc.clearRect(0, 0, canvas.width, canvas.height); const gradient = dc.createLinearGradient(0, 0, 0, canvas.height); gradient.addColorStop(0, '#132326'); gradient.addColorStop(1, '#071315'); dc.fillStyle = gradient; dc.fillRect(0, 0, canvas.width, canvas.height); dc.strokeStyle = '#ff8b8f'; dc.lineWidth = 6; dc.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    dc.shadowColor = '#a7ffe1'; dc.shadowBlur = 18; dc.fillStyle = '#dffff4'; dc.font = '800 112px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'right'; dc.textBaseline = 'middle'; dc.fillText(value == null ? '– –' : value.toFixed(2), canvas.width - 28, canvas.height * .57); dc.shadowBlur = 0; dc.fillStyle = '#ffb4b7'; dc.font = '800 34px Inter, sans-serif'; dc.textAlign = 'left'; dc.fillText('pH', 24, 34); dc.fillStyle = value == null ? '#8aa0a3' : '#6ff0c0'; dc.beginPath(); dc.arc(canvas.width - 24, 25, 8, 0, Math.PI * 2); dc.fill(); display.texture.needsUpdate = true
  }
  meter(reading = null, meterUid = null) {
    const g = new THREE.Group(), red = new THREE.MeshPhysicalMaterial({ color: 0xc92535, roughness: .22, metalness: .08, clearcoat: 1, clearcoatRoughness: .08 }), darkRed = new THREE.MeshPhysicalMaterial({ color: 0x71101a, roughness: .3, metalness: .06, clearcoat: .75 }), bezelMat = new THREE.MeshPhysicalMaterial({ color: 0x261519, roughness: .24, metalness: .15, clearcoat: .52, side: THREE.DoubleSide }), sensorMat = new THREE.MeshPhysicalMaterial({ color: 0xe6eef0, roughness: .14, metalness: .72, clearcoat: .86, clearcoatRoughness: .06, emissive: 0x35464b, emissiveIntensity: .18 }), sensorTipMat = new THREE.MeshPhysicalMaterial({ color: 0x303a3c, roughness: .24, metalness: .5, clearcoat: .32 }), profile = [[0, .18], [.036, .18], [.047, .22], [.055, .32], [.061, .72], [.067, 1.36], [.076, 1.7], [.105, 1.86], [.17, 2.02], [.245, 2.18], [.274, 2.34], [.278, 3.05], [.265, 3.17], [.21, 3.27], [.09, 3.34], [0, 3.36]].map(([x, y]) => new THREE.Vector2(x, y));
    const bodyGeometry = new THREE.LatheGeometry(profile, 96); bodyGeometry.computeVertexNormals(); const body = new THREE.Mesh(bodyGeometry, red); g.add(body);
    const sensor = new THREE.Mesh(new THREE.CapsuleGeometry(.043, .22, 10, 28), sensorMat); sensor.position.y = .095; g.add(sensor); const sensorTip = new THREE.Mesh(new THREE.SphereGeometry(.046, 28, 18), sensorTipMat); sensorTip.scale.y = .78; sensorTip.position.y = -.065; g.add(sensorTip);
    const shoulderBand = new THREE.Mesh(new THREE.TorusGeometry(.246, .013, 12, 72), darkRed); shoulderBand.rotation.x = Math.PI / 2; shoulderBand.position.y = 2.19; g.add(shoulderBand);
    const bezelArc = 1.94, screenArc = 1.61, bezel = new THREE.Mesh(new THREE.CylinderGeometry(.284, .284, .39, 56, 1, true, -bezelArc / 2, bezelArc), bezelMat); bezel.position.y = 2.69; bezel.renderOrder = 14; g.add(bezel);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 190; const context = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; const display = { canvas, context, texture, key: null };
    const screen = new THREE.Mesh(new THREE.CylinderGeometry(.291, .291, .29, 56, 1, true, -screenArc / 2, screenArc), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide })); screen.position.y = 2.69; screen.renderOrder = 15; g.add(screen); this.paintPhDisplay(display, reading);
    const highlight = new THREE.Mesh(new THREE.PlaneGeometry(.022, .72), new THREE.MeshBasicMaterial({ color: 0xffb4b8, transparent: true, opacity: .38, depthWrite: false, toneMapped: false })); highlight.position.set(-.178, 2.7, .285); highlight.renderOrder = 13; g.add(highlight);
    const statusLed = new THREE.Mesh(new THREE.SphereGeometry(.022, 18, 12), new THREE.MeshBasicMaterial({ color: 0x77f1c0, toneMapped: false })); statusLed.position.set(.17, 3.08, .219); g.add(statusLed);
    g.userData.phMeter = { form: 'continuous tapered red probe', display, meterUid, displaySurface: 'cylindrical arc following upper housing', metallicNibVisible: true }; this.dynamic.push({ kind: 'phMeterDisplay', display, meterUid }); return shadowReady(g)
  }
  electrolysisRig(state) {
    const g = new THREE.Group(), graphite = new THREE.MeshPhysicalMaterial({ color: 0x252b2d, roughness: .64, metalness: .12, clearcoat: .12 }), copper = new THREE.MeshPhysicalMaterial({ color: 0xd47a3d, roughness: .4, metalness: .5, clearcoat: .34, emissive: 0x321006, emissiveIntensity: .08 }), steel = metal(0xb8c3c6, .18), blackLead = new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: .58, metalness: .02 }), redLead = new THREE.MeshStandardMaterial({ color: 0xc93332, roughness: .5, metalness: .02 }), cathodeX = -.36, anodeX = .36, electrodeZ = .13; let cathodeRod = null, cathodeBand = null;
    const cell = this.beaker(.65, 0x2597b7); cell.scale.setScalar(1.08); cell.position.set(0, 0, .12); g.add(cell);
    for (const [x, isCathode] of [[cathodeX, true], [anodeX, false]]) {
      const rod = cylinder(.047, 1.78, graphite, 24); rod.position.set(x, .9, electrodeZ); g.add(rod);
      const band = new THREE.Mesh(new THREE.TorusGeometry(.054, .012, 9, 30), new THREE.MeshStandardMaterial({ color: isCathode ? 0x1c2226 : 0xd83c3a, roughness: .48 })); band.rotation.x = Math.PI / 2; band.position.set(x, 1.39, electrodeZ); g.add(band);
      if (isCathode) { cathodeRod = rod; cathodeBand = band }
    }
    const crocodileClip = (x, colorMat) => {
      const clip = new THREE.Group(); clip.position.set(x, 1.57, electrodeZ);
      for (const side of [-1, 1]) { const jaw = new THREE.Mesh(new THREE.BoxGeometry(.105, .3, .047), steel); jaw.position.set(side * .027, .015, side * .034); jaw.rotation.z = side * .08; clip.add(jaw); for (let i = 0; i < 3; i++) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(.072, .025, .028), steel); tooth.position.set(side * .027, -.125 + i * .052, side * .068); tooth.rotation.z = side * .08; clip.add(tooth) } }
      const hinge = cylinder(.088, .17, steel, 28); hinge.rotation.z = Math.PI / 2; hinge.position.y = .12; clip.add(hinge);
      const handle = new THREE.Mesh(new THREE.CapsuleGeometry(.092, .25, 8, 24), colorMat); handle.position.y = .34; clip.add(handle);
      const collar = cylinder(.105, .12, colorMat, 28); collar.position.y = .53; clip.add(collar);
      return clip;
    };
    const cathodeClip = crocodileClip(cathodeX, blackLead), anodeClip = crocodileClip(anodeX, redLead); g.add(cathodeClip, anodeClip);

    const supply = new THREE.Group(), caseMat = new THREE.MeshStandardMaterial({ color: 0x294550, roughness: .36, metalness: .24 }), panelMat = new THREE.MeshStandardMaterial({ color: 0x172a31, roughness: .42, metalness: .18 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.45, .96, .76), caseMat); supply.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.28, .09, .65), metal(0x43636d, .28)); top.position.y = .515; supply.add(top);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.15, .7, .045), panelMat); panel.position.z = .4; supply.add(panel);
    const displayCanvas = document.createElement('canvas'), dc = displayCanvas.getContext('2d'); displayCanvas.width = 512; displayCanvas.height = 160; dc.fillStyle = '#061719'; dc.fillRect(0, 0, 512, 160); dc.shadowColor = state.running ? '#6dffe0' : '#7c9697'; dc.shadowBlur = 18; dc.fillStyle = state.running ? '#86ffe3' : '#9cadad'; dc.font = '800 61px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(state.running ? '6.0 V  ON' : '0.0 V  OFF', 256, 78); dc.shadowBlur = 0; dc.fillStyle = '#a9b9bb'; dc.font = '700 25px Inter, sans-serif'; dc.fillText('D.C. POWER SUPPLY', 256, 133); const displayTexture = new THREE.CanvasTexture(displayCanvas); displayTexture.colorSpace = THREE.SRGBColorSpace; const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .405), new THREE.MeshBasicMaterial({ map: displayTexture, toneMapped: false })); screen.position.set(0, .12, .427); supply.add(screen);
    for (const [x, color] of [[-.72, 0x171b1e], [.72, 0xd43d3a]]) { const socket = new THREE.Mesh(new THREE.TorusGeometry(.115, .035, 12, 40), new THREE.MeshStandardMaterial({ color, roughness: .3, metalness: .32 })); socket.position.set(x, -.27, .431); supply.add(socket); const post = cylinder(.058, .15, metal(0xd5dcdd, .15), 28); post.rotation.x = Math.PI / 2; post.position.set(x, -.27, .47); supply.add(post) }
    const rocker = new THREE.Mesh(new THREE.BoxGeometry(.25, .17, .065), new THREE.MeshStandardMaterial({ color: state.running ? 0x2cbf7a : 0x495c61, roughness: .3 })); rocker.position.set(1.0, .17, .43); rocker.rotation.x = state.running ? -.12 : .12; supply.add(rocker); const indicator = new THREE.Mesh(new THREE.SphereGeometry(.043, 20, 12), new THREE.MeshBasicMaterial({ color: state.running ? 0x62ff9e : 0x502c2b, toneMapped: false })); indicator.scale.z = .35; indicator.position.set(1.0, -.05, .438); supply.add(indicator);
    for (const x of [-.92, .92]) { const foot = new THREE.Mesh(new THREE.BoxGeometry(.22, .08, .5), blackLead); foot.position.set(x, -.52, 0); supply.add(foot) }
    supply.position.set(0, 2.57, -.82); g.add(supply);

    const leadCurve = (points, material) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal'), 64, .043, 16, false), material);
    const cathodeWire = leadCurve([new THREE.Vector3(cathodeX, 2.11, electrodeZ), new THREE.Vector3(-.84, 2.18, .3), new THREE.Vector3(-1.13, 2.38, -.04), new THREE.Vector3(-.72, 2.3, -.29)], blackLead);
    const anodeWire = leadCurve([new THREE.Vector3(anodeX, 2.11, electrodeZ), new THREE.Vector3(.84, 2.18, .3), new THREE.Vector3(1.13, 2.38, -.04), new THREE.Vector3(.72, 2.3, -.29)], redLead); g.add(cathodeWire, anodeWire);

    if (state.running) { const chlorine = new THREE.Group(), bubbleMat = new THREE.MeshBasicMaterial({ color: 0xf4ffd0, transparent: true, opacity: .82, depthWrite: false, toneMapped: false }); for (let i = 0; i < 24; i++) { const bubble = new THREE.Mesh(new THREE.SphereGeometry(.026 + (i % 4) * .008, 14, 10), bubbleMat), angle = i * 2.399, r = .025 + (i % 4) * .024; bubble.position.set(Math.cos(angle) * r, .1 + ((i * .173) % 1) * .7, Math.sin(angle) * r); bubble.userData.baseY = .08; chlorine.add(bubble); this.dynamic.push({ kind: 'bubble', mesh: bubble, height: .72, speed: .25 + (i % 5) * .055, phase: (i * .173) % 1 }) } chlorine.position.set(anodeX, .1, electrodeZ + .015); g.add(chlorine) }
    const maxHeight = .72, baseY = .14, sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.075, .07, maxHeight, 34), copper); sleeve.position.set(cathodeX, baseY + .005, electrodeZ + .006); sleeve.scale.y = .01 / maxHeight; sleeve.visible = false; g.add(sleeve);
    const nodules = []; for (let i = 0; i < 34; i++) { const angle = i * 2.399, r = .078 + (i % 3) * .007, nodule = new THREE.Mesh(new THREE.SphereGeometry(.027 + (i % 4) * .006, 16, 10), copper.clone()); nodule.position.set(cathodeX + Math.cos(angle) * r, baseY + .045 + (i % 10) * .064, electrodeZ + Math.sin(angle) * r); nodule.scale.setScalar(.001); g.add(nodule); nodules.push({ mesh: nodule, threshold: .04 + (i / 33) * .79 }) }
    this.dynamic.push({ kind: 'electroCopper', sleeve, nodules, baseY, maxHeight, solution: cell.userData.liquidVolume, meniscus: cell.userData.liquidMeniscus, startColor: new THREE.Color(0x2597b7), endColor: new THREE.Color(0x83c7cc) });
    const balance = this.balance(0); balance.scale.setScalar(.78); balance.position.set(2.25, 0, .13); g.add(balance); let balanceDisplay = null; balance.traverse(object => { const texture = object.material?.map, canvas = texture?.image; if (!balanceDisplay && canvas?.getContext) balanceDisplay = { canvas, context: canvas.getContext('2d'), texture } });
    const movingCathode = new THREE.Group(), movingRod = cylinder(.047, 1.78, graphite.clone(), 24); movingCathode.add(movingRod); const movingCopper = new THREE.Mesh(new THREE.CylinderGeometry(.075, .07, maxHeight, 34), copper.clone()); movingCopper.position.y = baseY + maxHeight / 2 - .9; movingCathode.add(movingCopper); for (const { mesh } of nodules) { const deposit = mesh.clone(); deposit.position.set(mesh.position.x - cathodeX, mesh.position.y - .9, mesh.position.z - electrodeZ); deposit.scale.setScalar(.9); deposit.visible = true; movingCathode.add(deposit) } movingCathode.position.set(cathodeX, .9, electrodeZ); movingCathode.visible = false; g.add(movingCathode);
    this.dynamic.push({ kind: 'electroWeigh', movingCathode, cathodeRod, cathodeBand, cathodeClip, originalSleeve: sleeve, originalNodules: nodules, balanceDisplay, start: new THREE.Vector3(cathodeX, .9, electrodeZ), lifted: new THREE.Vector3(cathodeX, 2.08, electrodeZ), aboveBalance: new THREE.Vector3(2.25, 2.08, .13), onBalance: new THREE.Vector3(2.25, .755, .13), duration: 4.8 });
    return shadowReady(g)
  }
  displacementRig(state) {
    const g = new THREE.Group(), glass = GLASS(), rackMat = new THREE.MeshPhysicalMaterial({ color: 0x31454d, roughness: .28, metalness: .62, clearcoat: .28 }), rackEdge = metal(0xaebcc0, .17), rubber = solid(0x18262b, .82), xs = [-2.1, -.7, .7, 2.1], tubeData = [
      { metal: 'Mg', metalColor: 0xd7dce0, start: 0x248fcd, end: 0xc3e8e3, deposit: 0xb96636, rate: 1 },
      { metal: 'Zn', metalColor: 0xaeb9bd, start: 0x248fcd, end: 0xb8dedf, deposit: 0xb96636, rate: .86 },
      { metal: 'Fe', metalColor: 0x879298, start: 0x248fcd, end: 0x91c79e, deposit: 0xb96636, rate: .68 },
      { metal: 'Cu', metalColor: 0xc87945, start: 0xe6f0ec, end: 0x4a98c5, deposit: 0xd9e0e2, rate: .8, silver: true }
    ];
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.75, .12, 1.28), rackMat); base.position.set(0, .07, .08); g.add(base); const inset = new THREE.Mesh(new THREE.BoxGeometry(5.34, .035, .9), rubber); inset.position.set(0, .145, .08); g.add(inset);
    for (const x of [-2.72, 2.72]) { const upright = new THREE.Mesh(new THREE.BoxGeometry(.13, 1.78, .22), rackMat); upright.position.set(x, .95, -.2); g.add(upright); const foot = new THREE.Mesh(new THREE.BoxGeometry(.52, .09, .84), rubber); foot.position.set(x, .045, -.08); g.add(foot) }
    for (const [y, z] of [[.54, -.15], [1.72, -.2]]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(5.52, .16, .24), rackMat); rail.position.set(0, y, z); g.add(rail); const highlight = new THREE.Mesh(new THREE.BoxGeometry(5.32, .025, .026), rackEdge); highlight.position.set(0, y + .065, z + .128); g.add(highlight) }
    for (const x of xs) { for (const y of [.54, 1.72]) { const collar = new THREE.Mesh(new THREE.TorusGeometry(.285, .035, 12, 48), rubber); collar.rotation.x = Math.PI / 2; collar.position.set(x, y, .02); g.add(collar) } }
    tubeData.forEach((data, i) => {
      const x = xs[i], tube = new THREE.Group(), shell = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, 2.04, 56, 1, true), glass); shell.position.y = 1.2; tube.add(shell); const bottom = new THREE.Mesh(new THREE.SphereGeometry(.25, 56, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass); bottom.position.y = .18; tube.add(bottom); const rim = new THREE.Mesh(new THREE.TorusGeometry(.25, .032, 16, 64), glass); rim.rotation.x = Math.PI / 2; rim.position.y = 2.22; tube.add(rim); const innerRim = new THREE.Mesh(new THREE.TorusGeometry(.205, .012, 10, 48), new THREE.MeshBasicMaterial({ color: 0xe9fdff, transparent: true, opacity: .68, depthWrite: false, toneMapped: false })); innerRim.rotation.x = Math.PI / 2; innerRim.position.y = 2.223; tube.add(innerRim);
      const liquidMat = new THREE.MeshPhysicalMaterial({ color: data.start, transparent: true, opacity: .72, roughness: .11, transmission: .14, clearcoat: .46, depthWrite: false }), meniscusMat = liquidMat.clone(), liquid = cylinder(.214, .94, liquidMat, 56); liquid.position.y = .67; tube.add(liquid); const liquidBottom = new THREE.Mesh(new THREE.SphereGeometry(.214, 48, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), liquidMat); liquidBottom.position.y = .2; tube.add(liquidBottom); const meniscus = cylinder(.216, .022, meniscusMat, 56); meniscus.position.y = 1.14; tube.add(meniscus);
      const shine = new THREE.Mesh(new THREE.PlaneGeometry(.035, 1.72), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .52, depthWrite: false, toneMapped: false })); shine.position.set(-.13, 1.22, .215); shine.renderOrder = 12; tube.add(shine);
      const strip = new THREE.Group(), stripMat = new THREE.MeshPhysicalMaterial({ color: data.metalColor, roughness: data.silver ? .31 : .42, metalness: .72, clearcoat: .22 }), stripBody = new THREE.Mesh(new THREE.BoxGeometry(.17, 1.18, .055), stripMat); strip.add(stripBody); const brushed = new THREE.Mesh(new THREE.PlaneGeometry(.105, 1.02), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .13, depthWrite: false, toneMapped: false })); brushed.position.set(-.027, 0, .03); strip.add(brushed); strip.position.set(0, 2.72, .03); tube.add(strip);
      const depositMat = new THREE.MeshPhysicalMaterial({ color: data.deposit, roughness: data.silver ? .22 : .58, metalness: data.silver ? .91 : .54, clearcoat: data.silver ? .55 : .16 }), coat = new THREE.Mesh(new THREE.BoxGeometry(.205, 1.01, .074), depositMat); coat.position.y = -.07; coat.scale.y = .001; coat.visible = false; strip.add(coat); const nodules = []; for (let n = 0; n < 30; n++) { const angle = n * 2.399, crystal = data.silver ? new THREE.Mesh(new THREE.OctahedronGeometry(.032 + (n % 4) * .008, 0), depositMat.clone()) : new THREE.Mesh(new THREE.DodecahedronGeometry(.025 + (n % 3) * .007, 0), depositMat.clone()); crystal.position.set((n % 2 ? 1 : -1) * (.092 + (n % 3) * .008), -.48 + (n % 10) * .095, (n % 2 ? 1 : -1) * .036); crystal.rotation.set(angle * .31, angle * .6, angle); crystal.scale.setScalar(.001); strip.add(crystal); nodules.push({ mesh: crystal, threshold: .04 + (n / 29) * .76 }) }
      const settled = []; for (let n = 0; n < 22; n++) { const flake = data.silver ? new THREE.Mesh(new THREE.OctahedronGeometry(.025 + (n % 3) * .008, 0), depositMat.clone()) : new THREE.Mesh(new THREE.DodecahedronGeometry(.021 + (n % 4) * .006, 0), depositMat.clone()), a = n * 2.399, r = .035 + (n % 7) * .022; flake.position.set(Math.cos(a) * r, .22 + (n % 3) * .012, Math.sin(a) * r); flake.rotation.set(a, .7 * a, .35 * a); flake.scale.setScalar(.001); tube.add(flake); settled.push({ mesh: flake, threshold: .22 + (n / 21) * .68 }) }
      const swirlMat = new THREE.MeshBasicMaterial({ color: data.end, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), swirl = new THREE.Mesh(new THREE.TorusGeometry(.13, .016, 10, 48), swirlMat); swirl.rotation.x = Math.PI / 2; swirl.position.y = .72; swirl.scale.z = .72; tube.add(swirl); tube.position.set(x, 0, .14); g.add(tube); this.dynamic.push({ kind: 'displacementTube', index: i, strip, coat, nodules, settled, swirl, swirlMat, liquidMat, meniscusMat, startColor: new THREE.Color(data.start), endColor: new THREE.Color(data.end), rate: data.rate, silver: !!data.silver });
    });
    g.userData.displacementRig = true; g.userData.testTubes = 4; return shadowReady(g)
  }
  alkaliMetalRig(state) {
    const g = new THREE.Group();
    const steel = metal(0xaab8bc, .22), darkSteel = metal(0x405058, .38), trayMat = new THREE.MeshPhysicalMaterial({ color: 0x21373f, roughness: .28, metalness: .64, clearcoat: .32 }), acrylic = new THREE.MeshPhysicalMaterial({ color: 0xd9f5f7, transparent: true, opacity: .22, transmission: .72, roughness: .045, ior: 1.46, thickness: .08, clearcoat: .9, clearcoatRoughness: .06, side: THREE.DoubleSide, depthWrite: false }), waterMat = new THREE.MeshPhysicalMaterial({ color: 0x6ecfe1, transparent: true, opacity: .66, transmission: .24, roughness: .11, clearcoat: .58, clearcoatRoughness: .08, depthWrite: false }), surfaceMat = new THREE.MeshPhysicalMaterial({ color: 0xa5ebef, transparent: true, opacity: .58, transmission: .32, roughness: .055, clearcoat: .86, clearcoatRoughness: .04, depthWrite: false });
    const troughX = -.34, troughWidth = 4.72, troughDepth = 2.08, waterY = .46;
    const trayBase = new THREE.Mesh(new THREE.BoxGeometry(troughWidth + .42, .14, troughDepth + .42), trayMat); trayBase.position.set(troughX, .08, 0); g.add(trayBase);
    const water = new THREE.Mesh(new THREE.BoxGeometry(troughWidth - .18, .33, troughDepth - .18), waterMat); water.position.set(troughX, .26, 0); g.add(water);
    const surface = new THREE.Mesh(new THREE.BoxGeometry(troughWidth - .16, .035, troughDepth - .16), surfaceMat); surface.position.set(troughX, waterY, 0); surface.renderOrder = 6; g.add(surface);
    const trayWalls = [
      [troughX - troughWidth / 2, .43, 0, .07, .7, troughDepth + .08], [troughX + troughWidth / 2, .43, 0, .07, .7, troughDepth + .08],
      [troughX, .43, -troughDepth / 2, troughWidth + .08, .7, .07], [troughX, .43, troughDepth / 2, troughWidth + .08, .7, .07]
    ];
    for (const [x, y, z, width, height, depth] of trayWalls) { const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), acrylic); wall.position.set(x, y, z); wall.renderOrder = 7; g.add(wall) }
    const rimSegments = [
      [new THREE.Vector3(troughX - troughWidth / 2, .79, -troughDepth / 2), new THREE.Vector3(troughX + troughWidth / 2, .79, -troughDepth / 2)],
      [new THREE.Vector3(troughX - troughWidth / 2, .79, troughDepth / 2), new THREE.Vector3(troughX + troughWidth / 2, .79, troughDepth / 2)],
      [new THREE.Vector3(troughX - troughWidth / 2, .79, -troughDepth / 2), new THREE.Vector3(troughX - troughWidth / 2, .79, troughDepth / 2)],
      [new THREE.Vector3(troughX + troughWidth / 2, .79, -troughDepth / 2), new THREE.Vector3(troughX + troughWidth / 2, .79, troughDepth / 2)]
    ];
    for (const [a, b] of rimSegments) g.add(this.tubeBetween(a, b, .028, steel));

    const screenFrame = metal(0x8a9ba0, .24), panel = (geometry, position, rotation = null) => { const mesh = new THREE.Mesh(geometry, acrylic); mesh.position.copy(position); if (rotation) mesh.rotation.copy(rotation); mesh.renderOrder = 8; mesh.castShadow = false; g.add(mesh); return mesh };
    panel(new THREE.BoxGeometry(6.22, 2.68, .045), new THREE.Vector3(-.06, 1.72, -1.54));
    panel(new THREE.BoxGeometry(.045, 2.68, 2.46), new THREE.Vector3(-3.15, 1.72, -.31));
    panel(new THREE.BoxGeometry(.045, 2.68, 2.46), new THREE.Vector3(3.03, 1.72, -.31));
    const screenBars = [
      [new THREE.Vector3(-3.15, .38, -1.54), new THREE.Vector3(3.03, .38, -1.54)], [new THREE.Vector3(-3.15, 3.06, -1.54), new THREE.Vector3(3.03, 3.06, -1.54)],
      [new THREE.Vector3(-3.15, .38, -1.54), new THREE.Vector3(-3.15, 3.06, -1.54)], [new THREE.Vector3(3.03, .38, -1.54), new THREE.Vector3(3.03, 3.06, -1.54)],
      [new THREE.Vector3(-3.15, .38, .92), new THREE.Vector3(-3.15, 3.06, .92)], [new THREE.Vector3(3.03, .38, .92), new THREE.Vector3(3.03, 3.06, .92)]
    ];
    for (const [a, b] of screenBars) g.add(this.tubeBetween(a, b, .034, screenFrame));
    const reflectionMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .1, depthWrite: false, toneMapped: false }), reflection = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 2.16), reflectionMat); reflection.position.set(-1.45, 1.78, -1.507); reflection.rotation.z = -.18; reflection.renderOrder = 10; g.add(reflection);

    const vialRack = new THREE.Group(), vialRackBase = new THREE.Mesh(new THREE.BoxGeometry(1.28, .12, .72), trayMat); vialRackBase.position.set(2.54, .13, -.67); vialRack.add(vialRackBase); const vialSlots = [2.16, 2.54, 2.92], vialCaps = [], vialRings = [];
    vialSlots.forEach((x, index) => {
      const vial = new THREE.Group(), shell = new THREE.Mesh(new THREE.CylinderGeometry(.13, .145, .52, 40, 1, true), acrylic), bottom = new THREE.Mesh(new THREE.SphereGeometry(.132, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), acrylic), capMat = new THREE.MeshPhysicalMaterial({ color: [0xbd5961, 0xd69235, 0x8862bc][index], roughness: .32, metalness: .15, clearcoat: .42 }), cap = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .09, 36), capMat), chip = new THREE.Mesh(new THREE.DodecahedronGeometry(.074, 1), metal(0xd7e1e3, .2));
      shell.position.y = .48; bottom.position.y = .22; cap.position.y = .79; chip.position.y = .5; vial.add(shell, bottom, cap, chip); vial.position.set(x, 0, -.67); vialRack.add(vial); vialCaps.push(capMat);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), ring = new THREE.Mesh(new THREE.TorusGeometry(.18, .013, 10, 42), ringMat); ring.rotation.x = Math.PI / 2; ring.position.set(x, .205, -.67); vialRack.add(ring); vialRings.push(ring);
    });
    g.add(vialRack);

    const forceps = new THREE.Group(), forcepsMat = metal(0xbecbd0, .2), gripMat = solid(0x313c41, .54);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .52, 28), gripMat); handle.rotation.z = Math.PI / 2; handle.position.set(.22, 0, 0); forceps.add(handle);
    for (const z of [-.07, .07]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(1.32, .034, .034), forcepsMat); arm.position.set(-.56, z * .32, z); arm.rotation.z = z * .13; forceps.add(arm); const tip = new THREE.Mesh(new THREE.ConeGeometry(.036, .23, 18), forcepsMat); tip.rotation.z = -Math.PI / 2; tip.position.set(-1.28, z * .24, z); forceps.add(tip) }
    const forcepsRest = new THREE.Vector3(2.65, 1.22, .66), forcepsAbove = new THREE.Vector3(-.72, 1.66, .28), forcepsDrop = new THREE.Vector3(-.72, .72, .28); forceps.position.copy(forcepsRest); forceps.rotation.set(.04, -.15, .14); g.add(forceps);

    const sampleMat = new THREE.MeshPhysicalMaterial({ color: 0xd9e1e2, roughness: .2, metalness: .86, clearcoat: .62, clearcoatRoughness: .14, emissive: 0x000000, emissiveIntensity: 0 }), sample = new THREE.Mesh(new THREE.DodecahedronGeometry(.135, 2), sampleMat); sample.castShadow = true; g.add(sample);
    const sampleHaloMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), sampleHalo = new THREE.Mesh(new THREE.SphereGeometry(.28, 24, 16), sampleHaloMat); sampleHalo.renderOrder = 13; g.add(sampleHalo);
    const bubbleEntries = [];
    for (let index = 0; index < 34; index++) { const bubble = new THREE.Mesh(new THREE.SphereGeometry(.018 + (index % 4) * .008, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0xecffff, transparent: true, opacity: .65, transmission: .3, roughness: .06, depthWrite: false })); bubble.visible = false; bubble.renderOrder = 12; g.add(bubble); bubbleEntries.push({ mesh: bubble, phase: index * .173, angle: index * 2.399, scale: .58 + (index % 5) * .1 }) }
    const rippleEntries = [];
    for (let index = 0; index < 5; index++) { const ripple = new THREE.Mesh(new THREE.TorusGeometry(.16, .012, 10, 58), new THREE.MeshBasicMaterial({ color: 0xd9ffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); ripple.rotation.x = Math.PI / 2; ripple.position.y = waterY + .012; ripple.renderOrder = 11; g.add(ripple); rippleEntries.push({ mesh: ripple, phase: index / 5 }) }
    const indicatorEntries = [];
    for (let index = 0; index < 18; index++) { const patch = new THREE.Mesh(new THREE.CircleGeometry(.1 + (index % 4) * .035, 24), new THREE.MeshBasicMaterial({ color: 0x8d4baf, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); patch.rotation.x = -Math.PI / 2; patch.position.y = waterY + .019; patch.renderOrder = 9; g.add(patch); indicatorEntries.push({ mesh: patch, angle: index * 2.399, radius: .1 + (index % 6) * .11, phase: (index * .161) % 1 }) }
    const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xffbd3c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffcf, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), flameOuter = new THREE.Mesh(new THREE.ConeGeometry(.31, 1.06, 40), flameOuterMat), flameCore = new THREE.Mesh(new THREE.ConeGeometry(.16, .68, 32), flameCoreMat), flameHalo = new THREE.Mesh(new THREE.SphereGeometry(.57, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffad35, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); flameOuter.renderOrder = flameCore.renderOrder = flameHalo.renderOrder = 14; flameOuter.visible = flameCore.visible = flameHalo.visible = false; g.add(flameOuter, flameCore, flameHalo); const reactionLight = new THREE.PointLight(0xffbc4c, 0, 3.6, 2); g.add(reactionLight);
    this.dynamic.push({ kind: 'alkaliMetals', forceps, forcepsRest, forcepsAbove, forcepsDrop, sample, sampleMat, sampleHalo, sampleHaloMat, waterMat, surfaceMat, startWater: new THREE.Color(0x6ecfe1), endWater: new THREE.Color(0x8750ab), bubbleEntries, rippleEntries, indicatorEntries, vialCaps, vialRings, flameOuter, flameCore, flameHalo, flameOuterMat, flameCoreMat, reactionLight, reflection, waterY });
    g.userData.alkaliMetalRig = true;
    g.userData.apparatus = 'acrylic water trough, remote forceps, sealed metal vials and three-sided transparent safety screen';
    return shadowReady(g)
  }
  thermiteRig(state) {
    const g = new THREE.Group(), steel = metal(0x9aa7aa, .28), darkSteel = metal(0x536168, .42), sandMat = new THREE.MeshStandardMaterial({ color: 0xc6a66d, roughness: .96, metalness: 0 }), ceramic = new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: .88, metalness: .03 }), chargeMat = new THREE.MeshStandardMaterial({ color: 0x6f2d1d, roughness: .92, metalness: .04 }), glass = new THREE.MeshPhysicalMaterial({ color: 0xcceeff, transparent: true, opacity: .24, transmission: .72, roughness: .055, metalness: 0, ior: 1.46, thickness: .12, clearcoat: .72, clearcoatRoughness: .06, side: THREE.DoubleSide, depthWrite: false }), frame = metal(0x89999e, .2);
    const panel = (geometry, position) => { const mesh = new THREE.Mesh(geometry, glass); mesh.position.copy(position); mesh.renderOrder = 8; mesh.castShadow = false; g.add(mesh); return mesh };
    panel(new THREE.BoxGeometry(5.8, 3.65, .045), new THREE.Vector3(0, 1.86, -1.62));
    panel(new THREE.BoxGeometry(.045, 3.65, 2.45), new THREE.Vector3(-2.88, 1.86, -.42));

    const rightDoor = new THREE.Group(); rightDoor.position.set(2.88, 0, -1.62);
    const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(.045, 3.65, 2.44), glass); rightGlass.position.set(0, 1.86, 1.22); rightGlass.renderOrder = 8; rightGlass.castShadow = false; rightDoor.add(rightGlass);
    const rightTopBar = this.tubeBetween(new THREE.Vector3(0, 3.7, 0), new THREE.Vector3(0, 3.7, 2.44), .035, frame);
    const rightBottomBar = this.tubeBetween(new THREE.Vector3(0, .04, 0), new THREE.Vector3(0, .04, 2.44), .035, frame);
    const rightFrontBar = this.tubeBetween(new THREE.Vector3(0, .04, 2.44), new THREE.Vector3(0, 3.7, 2.44), .035, frame);
    rightDoor.add(rightTopBar, rightBottomBar, rightFrontBar);
    g.add(rightDoor);

    const bars = [
      [new THREE.Vector3(-2.88, .04, -1.62), new THREE.Vector3(-2.88, 3.7, -1.62)], [new THREE.Vector3(2.88, .04, -1.62), new THREE.Vector3(2.88, 3.7, -1.62)],
      [new THREE.Vector3(-2.88, 3.7, -1.62), new THREE.Vector3(2.88, 3.7, -1.62)], [new THREE.Vector3(-2.88, .04, -1.62), new THREE.Vector3(2.88, .04, -1.62)],
      [new THREE.Vector3(-2.88, .04, .82), new THREE.Vector3(-2.88, 3.7, .82)],
      [new THREE.Vector3(-2.88, 3.7, -1.62), new THREE.Vector3(-2.88, 3.7, .82)], [new THREE.Vector3(-2.88, .04, -1.62), new THREE.Vector3(-2.88, .04, .82)]
    ];
    for (const [a, b] of bars) { const rail = this.tubeBetween(a, b, .035, frame); rail.castShadow = true; g.add(rail) }
    const hingeMat = metal(0x455257, .3); for (const y of [.35, 1.85, 3.35]) { const hinge = cylinder(.052, .12, hingeMat); hinge.position.set(2.88, y, -1.62); g.add(hinge) }
    const shieldGlowMat = new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), shieldGlow = new THREE.Mesh(new THREE.PlaneGeometry(5.55, 3.4), shieldGlowMat); shieldGlow.position.set(0, 1.86, -1.59); shieldGlow.renderOrder = 7; g.add(shieldGlow);

    const canWall = new THREE.Mesh(new THREE.CylinderGeometry(1.34, 1.3, 1.22, 72, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x9da9ab, metalness: .73, roughness: .38, clearcoat: .2, side: THREE.DoubleSide })); canWall.position.y = .61; g.add(canWall);
    const canBottom = cylinder(1.31, .08, darkSteel, 72); canBottom.position.y = .04; g.add(canBottom);
    for (let i = 0; i < 8; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(1.325, .028, 10, 72), steel); band.rotation.x = Math.PI / 2; band.position.y = .13 + i * .145; g.add(band) }
    const rolledRim = new THREE.Mesh(new THREE.TorusGeometry(1.35, .055, 16, 88), steel); rolledRim.rotation.x = Math.PI / 2; rolledRim.position.y = 1.22; g.add(rolledRim);
    const sandBody = cylinder(1.265, 1.06, sandMat, 72); sandBody.position.y = .57; g.add(sandBody); const sandTop = cylinder(1.265, .055, new THREE.MeshStandardMaterial({ color: 0xd4b779, roughness: 1 }), 72); sandTop.position.y = 1.105; g.add(sandTop);
    for (let i = 0; i < 58; i++) { const angle = i * 2.399, r = .55 + ((i * 37) % 100) / 100 * .63, grain = new THREE.Mesh(new THREE.DodecahedronGeometry(.025 + (i % 4) * .009, 0), sandMat); grain.position.set(Math.cos(angle) * r, 1.13 + ((i * 29) % 7) * .007, Math.sin(angle) * r); grain.rotation.set(i * .57, i * 1.13, i * .31); grain.scale.set(1.4, .5 + .12 * (i % 3), 1); g.add(grain) }

    const cupProfile = [[0, 0], [.38, .02], [.46, .16], [.5, .62], [.55, .72], [.51, .78]].map(([x, y]) => new THREE.Vector2(x, y)), cup = new THREE.Mesh(new THREE.LatheGeometry(cupProfile, 64), ceramic); cup.position.y = .72; g.add(cup); const cupRim = new THREE.Mesh(new THREE.TorusGeometry(.535, .05, 14, 72), ceramic); cupRim.rotation.x = Math.PI / 2; cupRim.position.y = 1.48; g.add(cupRim); const charge = cylinder(.47, .055, chargeMat, 64); charge.position.y = 1.455; g.add(charge);
    const ironBlobGeometry = new THREE.SphereGeometry(.49, 72, 42), ironPositions = ironBlobGeometry.attributes.position; for (let i = 0; i < ironPositions.count; i++) { const x = ironPositions.getX(i), y = ironPositions.getY(i), z = ironPositions.getZ(i), irregular = 1 + .075 * Math.sin(x * 15 + z * 9) + .045 * Math.sin(z * 19 - y * 13) + .025 * Math.cos(x * 27 + y * 11); ironPositions.setXYZ(i, x * irregular * (1 + .035 * Math.sin(y * 18)), y * (.94 + .055 * Math.sin(x * 17 - z * 12)), z * irregular * (1 + .04 * Math.cos(y * 15))) } ironPositions.needsUpdate = true; ironBlobGeometry.computeVertexNormals(); const ironBlobMat = new THREE.MeshPhysicalMaterial({ color: 0xff6f19, emissive: 0xff2400, emissiveIntensity: 2.4, metalness: .82, roughness: .2, clearcoat: .58, clearcoatRoughness: .16 }), ironBlob = new THREE.Mesh(ironBlobGeometry, ironBlobMat); ironBlob.position.set(0, 1.565, .005); ironBlob.rotation.set(.03, -.24, .025); ironBlob.visible = false; g.add(ironBlob); const ironGlowLight = new THREE.PointLight(0xff5b24, 0, 2.5, 1.8); ironGlowLight.position.set(0, 1.73, .08); g.add(ironGlowLight);

    const fuseCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(.02, 1.49, .02), new THREE.Vector3(.32, 1.63, .1), new THREE.Vector3(.78, 1.76, .16), new THREE.Vector3(1.34, 1.82, .22)], false, 'centripetal'), fuseSegments = [], fuseSegmentCount = 34;
    for (let i = 0; i < fuseSegmentCount; i++) { const start = i / fuseSegmentCount, end = (i + 1) / fuseSegmentCount, segmentCurve = new THREE.LineCurve3(fuseCurve.getPoint(start), fuseCurve.getPoint(end)), segmentMat = new THREE.MeshPhysicalMaterial({ color: 0xe4ecec, metalness: .78, roughness: .18, clearcoat: .55, emissive: 0x191919, emissiveIntensity: 0 }), segment = new THREE.Mesh(new THREE.TubeGeometry(segmentCurve, 3, .028, 12, false), segmentMat); segment.userData.mid = (start + end) / 2; g.add(segment); fuseSegments.push(segment) }
    const mgoGeometry = new THREE.DodecahedronGeometry(.028, 0), mgoMaterial = new THREE.MeshStandardMaterial({ color: 0xf8f8ef, roughness: .98, metalness: 0, emissive: 0x76766f, emissiveIntensity: .18 }), mgoPowder = [];
    for (let i = 0; i < 88; i++) { const u = .035 + ((i * 37) % 89) / 89 * .94, grain = new THREE.Mesh(mgoGeometry, mgoMaterial), angle = i * 2.399, scale = .62 + (i % 5) * .16; grain.visible = false; grain.scale.setScalar(scale); g.add(grain); mgoPowder.push({ mesh: grain, u, angle, spread: .035 + (i % 7) * .012, fall: .7 + ((i * 29) % 13) / 13 * .3, scale }) }
    const mgoPuffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), mgoPuffs = []; for (let i = 0; i < 14; i++) { const puff = new THREE.Mesh(new THREE.SphereGeometry(.035 + (i % 4) * .012, 14, 9), mgoPuffMat.clone()); puff.visible = false; puff.renderOrder = 19; g.add(puff); mgoPuffs.push(puff) }
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xfff0a3, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), fuseEmber = new THREE.Mesh(new THREE.SphereGeometry(.075, 24, 16), emberMat); fuseEmber.visible = false; g.add(fuseEmber); const fuseLight = new THREE.PointLight(0xff8a3a, 0, 2.2, 1.8); g.add(fuseLight); const fuseSparks = []; for (let i = 0; i < 16; i++) { const spark = new THREE.Mesh(new THREE.SphereGeometry(.012 + (i % 3) * .004, 10, 7), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffffff : 0xffad42, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); spark.visible = false; g.add(spark); fuseSparks.push(spark) }

    const torch = new THREE.Group(), torchRed = new THREE.MeshStandardMaterial({ color: 0xb93b30, roughness: .34, metalness: .22 }), torchDark = solid(0x242c2f, .5), brass = metal(0xc89b38, .2), body = cylinder(.18, .82, torchRed, 36); body.rotation.z = Math.PI / 2; body.position.x = .28; torch.add(body); const rear = cylinder(.19, .08, torchDark, 32); rear.rotation.z = Math.PI / 2; rear.position.x = .72; torch.add(rear); const handle = new THREE.Mesh(new THREE.BoxGeometry(.22, .64, .24), torchDark); handle.position.set(.35, -.38, 0); handle.rotation.z = -.12; torch.add(handle); const collar = cylinder(.13, .25, brass, 32); collar.rotation.z = Math.PI / 2; collar.position.x = -.25; torch.add(collar); const nozzle = cylinder(.072, .62, brass, 28); nozzle.rotation.z = Math.PI / 2; nozzle.position.x = -.68; torch.add(nozzle); const valve = cylinder(.11, .08, torchDark, 24); valve.position.set(-.16, .24, 0); torch.add(valve);
    const outerFlame = new THREE.Mesh(new THREE.ConeGeometry(.115, .58, 32), new THREE.MeshBasicMaterial({ color: 0x44b9ff, transparent: true, opacity: .68, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); outerFlame.rotation.z = Math.PI / 2; outerFlame.position.x = -1.23; torch.add(outerFlame); const innerFlame = new THREE.Mesh(new THREE.ConeGeometry(.06, .39, 28), new THREE.MeshBasicMaterial({ color: 0xdaf8ff, transparent: true, opacity: .88, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); innerFlame.rotation.z = Math.PI / 2; innerFlame.position.x = -1.14; torch.add(innerFlame); const torchLight = new THREE.PointLight(0x58c8ff, 1.7, 1.8, 1.7); torchLight.position.x = -1.33; torch.add(torchLight); const torchStart = new THREE.Vector3(4.0, 1.92, .58), torchTarget = new THREE.Vector3(2.54, 1.9, .36); torch.position.copy(torchStart); g.add(torch);

    const additive = color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), flashCore = new THREE.Mesh(new THREE.SphereGeometry(.55, 40, 24), additive(0xffffff)); flashCore.position.set(0, 1.62, 0); flashCore.visible = false; g.add(flashCore); const corona = new THREE.Mesh(new THREE.SphereGeometry(.82, 40, 24), additive(0xff8a24)); corona.position.copy(flashCore.position); corona.visible = false; g.add(corona); const fireColumn = new THREE.Mesh(new THREE.ConeGeometry(.58, 2.7, 48), additive(0xffb22e)); fireColumn.position.set(0, 2.65, 0); fireColumn.visible = false; g.add(fireColumn); const flashLight = new THREE.PointLight(0xffa43b, 0, 8, 1.25); flashLight.position.set(0, 2.2, .2); g.add(flashLight);
    const shockwaves = []; for (let i = 0; i < 2; i++) { const wave = new THREE.Mesh(new THREE.TorusGeometry(.26, .028, 10, 64), additive(i ? 0xff9e54 : 0xffffff)); wave.rotation.x = Math.PI / 2; wave.position.set(0, 1.55, 0); wave.visible = false; g.add(wave); shockwaves.push(wave) }

    const sparkCount = 190, sparkGeometry = new THREE.CylinderGeometry(.025, .047, .36, 6), sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .96, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false, vertexColors: true }), sparkMesh = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, sparkCount), sparkData = [], dummy = new THREE.Object3D(); sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sparkMesh.frustumCulled = false; sparkMesh.renderOrder = 28; sparkMesh.visible = false; g.add(sparkMesh); for (let i = 0; i < sparkCount; i++) { const f = (i * 37 % 191) / 190, s = (i * 73 % 193) / 192; sparkData.push({ angle: i * 2.399 + (i % 7) * .17, speed: .72 + f * 1.3, vy: 1.8 + s * 2.55, life: .68 + (i % 9) * .075, delay: (i % 31) * .055, spin: i * .77, heavy: i % 7 === 0 }); sparkMesh.setColorAt(i, new THREE.Color(i % 11 === 0 ? 0xffffff : i % 4 === 0 ? 0xffe9a6 : i % 3 === 0 ? 0xff8a23 : 0xffbd48)) } sparkMesh.instanceColor.needsUpdate = true;
    const nearSparkGeometry = new THREE.CylinderGeometry(.021, .038, .28, 6), nearSparkMats = [0xffffff, 0xffe2a0, 0xffa326].map(color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .98, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false })), nearSparks = []; for (let i = 0; i < 48; i++) { const trail = new THREE.Mesh(nearSparkGeometry, nearSparkMats[i % nearSparkMats.length]); trail.renderOrder = 30; trail.visible = false; g.add(trail); nearSparks.push(trail) }
    const smoke = []; for (let i = 0; i < 22; i++) { const puff = new THREE.Mesh(new THREE.SphereGeometry(.18 + (i % 5) * .045, 20, 14), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0x5b5550 : 0x77716d, transparent: true, opacity: 0, roughness: 1, depthWrite: false })); puff.visible = false; g.add(puff); smoke.push({ mesh: puff, angle: i * 2.399, delay: (i % 8) * .17, speed: .3 + (i % 5) * .04, drift: .12 + (i % 4) * .05 }) }
    const sandDust = []; for (let i = 0; i < 34; i++) { const mote = new THREE.Mesh(new THREE.DodecahedronGeometry(.018 + (i % 3) * .007, 0), new THREE.MeshBasicMaterial({ color: 0xd9bb7c, transparent: true, opacity: 0, depthWrite: false })); mote.visible = false; g.add(mote); sandDust.push({ mesh: mote, angle: i * 2.399, speed: .18 + (i % 6) * .05, delay: (i % 9) * .04 }) }
    this.dynamic.push({ kind: 'thermite', torch, outerFlame, innerFlame, torchLight, torchStart, torchTarget, fuseCurve, fuseSegments, fuseEmber, fuseLight, fuseSparks, mgoPowder, mgoPuffs, flashCore, corona, fireColumn, flashLight, shockwaves, sparkMesh, sparkData, nearSparks, dummy, ironBlob, ironGlowLight, smoke, sandDust, shieldGlow, rightDoor, afterglowStart: 0 });
    g.userData.thermiteRig = true; g.userData.containment = 'U-shaped heat-resistant glass shield and sand-filled corrugated metal can'; return shadowReady(g)
  }
  liquidPourStream(a, b, { color = 0xa9eeff, time = 0, radius = .045, opacity = .74, sag = .055, breakup = .7, droplets = 5, splash = true } = {}) {
    const g = new THREE.Group(), clamp = v => Math.max(0, Math.min(1, v)), continuousEnd = clamp(breakup + .022 * Math.sin(time * 9.7)), pointAt = q => {
      const p = new THREE.Vector3().lerpVectors(a, b, q), arc = Math.sin(Math.PI * q);
      p.y -= sag * arc * (.35 + .65 * q); p.x += Math.sin(q * 10.4 - time * 5.2) * radius * .13 * arc; p.z += Math.sin(q * 13.7 + time * 4.1) * radius * .18 * arc; return p
    };
    const rings = 24, sides = 12, positions = [], indices = [];
    for (let i = 0; i <= rings; i++) {
      const q = continuousEnd * i / rings, p = pointAt(q), ahead = pointAt(Math.min(1, q + .008)), behind = pointAt(Math.max(0, q - .008)), tangent = ahead.sub(behind).normalize(), reference = Math.abs(tangent.z) < .92 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), side = new THREE.Vector3().crossVectors(tangent, reference).normalize(), normal = new THREE.Vector3().crossVectors(side, tangent).normalize(), neck = 1 - .42 * (q / Math.max(.001, continuousEnd)), pulse = 1 + .105 * Math.sin(time * 13.6 - q * 19.2) + .045 * Math.sin(time * 29 + q * 11), r = Math.max(radius * .34, radius * neck * pulse);
      for (let j = 0; j < sides; j++) { const angle = j / sides * Math.PI * 2, offset = side.clone().multiplyScalar(Math.cos(angle) * r).add(normal.clone().multiplyScalar(Math.sin(angle) * r)); positions.push(p.x + offset.x, p.y + offset.y, p.z + offset.z) }
    }
    for (let i = 0; i < rings; i++)for (let j = 0; j < sides; j++) { const n = j === sides - 1 ? 0 : j + 1, a0 = i * sides + j, a1 = i * sides + n, b0 = (i + 1) * sides + j, b1 = (i + 1) * sides + n; indices.push(a0, b0, a1, a1, b0, b1) }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const liquidMat = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: Math.min(.92, opacity + .1), roughness: .065, transmission: .1, ior: 1.333, thickness: .12, clearcoat: 1, clearcoatRoughness: .035, side: THREE.DoubleSide, depthWrite: false, emissive: color, emissiveIntensity: .1 }), stream = new THREE.Mesh(geometry, liquidMat); stream.renderOrder = 14; stream.castShadow = false; stream.receiveShadow = false; g.add(stream);
    const highlightPoints = []; for (let i = 0; i <= 18; i++) { const p = pointAt(continuousEnd * i / 18); p.z += radius * .58; highlightPoints.push(p) } const highlightGeometry = new THREE.BufferGeometry().setFromPoints(highlightPoints), highlight = new THREE.Line(highlightGeometry, new THREE.LineBasicMaterial({ color: 0xf3fdff, transparent: true, opacity: .42, depthWrite: false, toneMapped: false })); highlight.renderOrder = 15; g.add(highlight);
    const dropMat = liquidMat.clone(); dropMat.opacity = Math.min(.94, opacity + .16); for (let i = 0; i < droplets; i++) { const phase = (time * 1.72 + i / droplets) % 1, q = continuousEnd + (1 - continuousEnd) * phase, p = pointAt(q), ahead = pointAt(Math.min(1, q + .012)), behind = pointAt(Math.max(0, q - .012)), tangent = ahead.sub(behind).normalize(), drop = new THREE.Mesh(new THREE.SphereGeometry(radius * (.67 - .15 * phase), 18, 12), dropMat); drop.position.copy(p); drop.scale.set(.82, 1.42 + phase * .78, .82); drop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent); drop.renderOrder = 16; drop.castShadow = false; g.add(drop) }
    if (splash) { const splashQ = (time * 2.18) % 1, ringMat = new THREE.MeshBasicMaterial({ color: 0xe7fbff, transparent: true, opacity: (1 - splashQ) * .55, depthWrite: false, toneMapped: false }), ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.45, .007, 8, 36), ringMat); ring.rotation.x = Math.PI / 2; ring.position.copy(b); ring.position.y += .008; ring.scale.setScalar(.65 + splashQ * 1.65); ring.renderOrder = 16; g.add(ring); const splashMat = new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: Math.sin(Math.PI * splashQ) * .8, depthWrite: false, toneMapped: false }); for (let i = 0; i < 4; i++) { const angle = i * Math.PI / 2 + .35, r = .015 + splashQ * radius * (1.55 + (i % 2) * .4), drop = new THREE.Mesh(new THREE.SphereGeometry(radius * .22, 12, 8), splashMat); drop.position.set(b.x + Math.cos(angle) * r, b.y + .012 + Math.sin(Math.PI * splashQ) * radius * (.9 + (i % 3) * .25), b.z + Math.sin(angle) * r * .65); drop.renderOrder = 17; g.add(drop) } }
    g.userData.pourVisual = 'tapered translucent stream with necking, droplet breakup and surface splash'; return g
  }
  granularPour(a, b, time = 0, { color = 0x17191a, count = 28 } = {}) { const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color, roughness: .86, metalness: 0 }); for (let i = 0; i < count; i++) { const q = (time * .78 + i / count) % 1, angle = i * 2.399, jitter = .018 + (i % 5) * .008, p = new THREE.Vector3().lerpVectors(a, b, q); p.y -= Math.sin(Math.PI * q) * .045; p.x += Math.cos(angle) * jitter; p.z += Math.sin(angle) * jitter; const grain = new THREE.Mesh(new THREE.DodecahedronGeometry(.012 + (i % 4) * .004, 0), mat); grain.position.copy(p); grain.rotation.set(i * .71 + time, i * 1.13 - time * .4, i * .47); grain.scale.set(1, .65 + (i % 3) * .16, 1); g.add(grain) } g.userData.pourVisual = 'individual falling powder grains'; return g }
  anchorPouringLip(source, receiver, { sourceLip = new THREE.Vector3(0, 1.95, 0), receiverOpening = new THREE.Vector3(0, 1.72, 0), clearance = .4, weight = 1 } = {}) {
    this.root.updateMatrixWorld(true);
    const opening = receiver.localToWorld(receiverOpening.clone()), mouth = source.localToWorld(sourceLip.clone()), desired = opening.clone(); desired.y += clearance;
    const correction = desired.sub(mouth).multiplyScalar(Math.max(0, Math.min(1, weight))); source.position.add(correction);
    this.root.updateMatrixWorld(true);
    const alignedMouth = source.localToWorld(sourceLip.clone()), alignedOpening = receiver.localToWorld(receiverOpening.clone()); this.pourAlignment = { mouth: alignedMouth.clone(), opening: alignedOpening.clone(), horizontalError: Math.hypot(alignedMouth.x - alignedOpening.x, alignedMouth.z - alignedOpening.z), verticalClearance: alignedMouth.y - alignedOpening.y };
    return { mouth: alignedMouth, opening: alignedOpening }
  }
  tubeBetween(a, b, r = .045, mat = solid(0x83989f, .5)) { const d = b.clone().sub(a), m = a.clone().add(b).multiplyScalar(.5); const mesh = cylinder(r, d.length(), mat, 18); mesh.position.copy(m); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); return mesh }
  taperedTubeBetween(a, b, startRadius = .045, endRadius = .02, mat = solid(0x83989f, .5)) { const d = b.clone().sub(a), m = a.clone().add(b).multiplyScalar(.5), geometry = new THREE.CylinderGeometry(endRadius, startRadius, d.length(), 24, 4, false), mesh = new THREE.Mesh(geometry, mat); geometry.computeVertexNormals(); mesh.position.copy(m); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); return mesh }
  delivery(a, b) { const curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3((a.x + b.x) * .5, 2.8, a.z - .1), new THREE.Vector3(b.x - .35, 2.25, b.z), b]); return new THREE.Mesh(new THREE.TubeGeometry(curve, 40, .055, 12, false), solid(0x71878e, .42)) }
  bubbleCloud(count = 14, radius = .4, height = .8, color = 0xe8fbff) { const g = new THREE.Group(); for (let i = 0; i < count; i++) { const mat = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: .48, roughness: .08, transmission: .4, depthWrite: false }); const bubble = new THREE.Mesh(new THREE.SphereGeometry(.022 + (i % 3) * .01, 14, 10), mat); const angle = i * 2.399; const spread = radius * (.22 + (i % 5) / 6); bubble.position.set(Math.cos(angle) * spread, .12 + ((i * .173) % 1) * height, Math.sin(angle) * spread); bubble.userData.baseY = .1; g.add(bubble); this.dynamic.push({ kind: 'bubble', mesh: bubble, height, speed: .22 + (i % 5) * .055, phase: (i * .173) % 1 }) } return g }
  oneHoleBung(tubeBottom = 1.64, tubeTop = 2.2) {
    const g = new THREE.Group(), rubber = new THREE.MeshStandardMaterial({ color: 0x293338, roughness: .92, metalness: .01 }), edge = new THREE.MeshStandardMaterial({ color: 0x10181b, roughness: .8 }), tubeMat = new THREE.MeshPhysicalMaterial({ color: 0xb8e5ee, transparent: true, opacity: .72, transmission: .34, roughness: .09, ior: 1.45, thickness: .055, side: THREE.DoubleSide, depthWrite: false });
    const stopper = new THREE.Mesh(new THREE.CylinderGeometry(.205, .235, .25, 64), rubber); stopper.position.y = 1.87; g.add(stopper);
    const topRing = new THREE.Mesh(new THREE.TorusGeometry(.066, .019, 12, 40), edge); topRing.rotation.x = Math.PI / 2; topRing.position.y = 2.003; g.add(topRing);
    const stem = this.tubeBetween(new THREE.Vector3(0, tubeBottom, 0), new THREE.Vector3(0, tubeTop, 0), .047, tubeMat); stem.renderOrder = 6; g.add(stem);
    const bore = this.tubeBetween(new THREE.Vector3(0, tubeBottom + .012, 0), new THREE.Vector3(0, tubeTop - .012, 0), .017, new THREE.MeshBasicMaterial({ color: 0x607e86, transparent: true, opacity: .32, depthWrite: false })); bore.renderOrder = 7; g.add(bore);
    g.userData = { oneHoleBung: true, tubeBottom, tubeTop }; return shadowReady(g)
  }
  co2DeliveryTube(a, b) {
    const rubber = new THREE.MeshStandardMaterial({ color: 0x526b73, roughness: .67, metalness: .02 }), curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3(a.x + .34, 2.55, a.z), new THREE.Vector3(-.48, 2.88, a.z - .06), new THREE.Vector3(.58, 2.83, b.z - .06), new THREE.Vector3(b.x - .34, 2.55, b.z), b], false, 'centripetal'), hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, .068, 16, false), rubber);
    hose.castShadow = true; hose.receiveShadow = true;
    const connectorMat = metal(0x9aaeb4, .22), assembly = new THREE.Group(); assembly.add(hose);
    for (const point of [a, b]) { const collar = new THREE.Mesh(new THREE.TorusGeometry(.073, .012, 10, 36), connectorMat); collar.rotation.x = Math.PI / 2; collar.position.copy(point); assembly.add(collar) }
    return shadowReady(assembly)
  }
  co2TurbidityCloud(q) {
    const g = new THREE.Group(), opacity = Math.max(0, Math.min(1, q));
    for (let i = 0; i < 48; i++) { const angle = i * 2.399, r = .05 + (i % 8) * .066, y = .105 + ((i * .217) % 1) * .44, mat = new THREE.MeshPhysicalMaterial({ color: i % 5 === 0 ? 0xf5f3e8 : 0xe2e4dc, transparent: true, opacity: opacity * (.1 + (i % 4) * .045), roughness: .9, depthWrite: false }), flake = new THREE.Mesh(new THREE.DodecahedronGeometry(.012 + (i % 3) * .006, 0), mat); flake.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r); flake.rotation.set(angle * .3, angle * .7, angle); g.add(flake) }
    return g
  }
  co2BubblePlume() {
    const g = new THREE.Group();
    for (let i = 0; i < 24; i++) { const radius = .028 + (i % 4) * .008, mat = new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? 0xcaf3f8 : 0xf7ffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide }), bubble = new THREE.Mesh(new THREE.TorusGeometry(radius, .0065, 8, 24), mat); bubble.renderOrder = 12; g.add(bubble); this.dynamic.push({ kind: 'co2Bubble', mesh: bubble, phase: (i * .127) % 1, speed: .31 + (i % 5) * .045, angle: i * 2.399, startY: .17, surfaceY: .57 }) }
    return g
  }
  reactionEffects(group, reaction) { const glowMat = new THREE.MeshBasicMaterial({ color: reaction.kind === 'neutralisation' ? 0xffd27b : reaction.productColor || 0x9fe7ef, transparent: true, opacity: .1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), glow = new THREE.Mesh(new THREE.SphereGeometry(.48, 32, 20), glowMat); glow.position.set(0, .52, .02); group.add(glow); const precip = new THREE.Group(); for (let i = 0; i < 18; i++) { const mat = new THREE.MeshPhysicalMaterial({ color: reaction.productColor || 0xe8e6d9, transparent: true, opacity: 0, roughness: .7, metalness: .04, depthWrite: false }); const flake = new THREE.Mesh(new THREE.DodecahedronGeometry(.025 + (i % 4) * .008, 0), mat), a = i * 2.399, r = .08 + (i % 6) * .06; flake.position.set(Math.cos(a) * r, .12 + (i % 5) * .045, Math.sin(a) * r); flake.scale.set(1.5, .55, .9); precip.add(flake) } group.add(precip); const bubbles = []; for (let i = 0; i < 12; i++) { const bubble = new THREE.Mesh(new THREE.SphereGeometry(.024 + (i % 3) * .008, 14, 10), new THREE.MeshBasicMaterial({ color: 0xf2fdff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); bubble.userData = { phase: (i * .173) % 1, angle: i * 2.399 }; group.add(bubble); bubbles.push(bubble) } this.dynamic.push({ kind: 'freeReaction', reaction, glow, precip, bubbles, seed: reaction.ruleId.length * .73 }) }
  chromatographyPaper() {
    const g = new THREE.Group(), sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 2.12), new THREE.MeshStandardMaterial({ color: 0xfffdf2, roughness: .88, metalness: 0, side: THREE.DoubleSide }));
    sheet.receiveShadow = true; g.add(sheet);
    const pencilMat = new THREE.MeshBasicMaterial({ color: 0x6f7b7f, transparent: true, opacity: .72, depthWrite: false, depthTest: false });
    const baseline = new THREE.Mesh(new THREE.PlaneGeometry(1.06, .018), pencilMat); baseline.position.set(0, -.66, .014); baseline.renderOrder = 4; g.add(baseline);
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1), new THREE.MeshBasicMaterial({ color: 0x9fd8e6, transparent: true, opacity: .32, depthWrite: false, depthTest: false })); wet.position.z = .024; wet.renderOrder = 3; g.add(wet);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1.08, .022), new THREE.MeshBasicMaterial({ color: 0x737b7b, transparent: true, opacity: 0, depthWrite: false, depthTest: false })); front.position.set(0, -.66, .031); front.renderOrder = 5; g.add(front); this.dynamic.push({ kind: 'chromatographySolvent', wet, front });
    const ink = new THREE.Mesh(new THREE.CircleGeometry(.073, 32), new THREE.MeshBasicMaterial({ color: 0x1b2022, transparent: true, opacity: .96, depthWrite: false, depthTest: false })); ink.position.set(0, -.63, .024); ink.renderOrder = 8; g.add(ink); this.dynamic.push({ kind: 'chromatographyInk', mesh: ink });
    const dyeMat = color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
    const dyes = [{ x: -.39, color: 0xe23d79, end: .61 }, { x: -.13, color: 0x2879d8, end: .75 }, { x: .13, color: 0xf0bd2e, end: .31 }, { x: .39, color: 0x36a568, end: .5 }];
    for (const [i, d] of dyes.entries()) { const spot = new THREE.Mesh(new THREE.CircleGeometry(.061, 32), dyeMat(d.color)); spot.position.set(0, -.63, .024); spot.renderOrder = 7; g.add(spot); const tail = new THREE.Mesh(new THREE.CircleGeometry(.052, 28), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0, depthWrite: false, depthTest: false })); tail.position.set(0, -.63, .021); tail.renderOrder = 6; g.add(tail); this.dynamic.push({ kind: 'chromatographyDye', mesh: spot, tail, x: d.x, startY: -.63, endY: d.end, phase: i * .9 }) }
    return shadowReady(g)
  }
  add(obj, x, z = 0, y = 0, scale = 1) { obj.position.set(x, y, z); obj.scale.multiplyScalar(scale); this.root.add(obj); return obj }
  itemObject(it, flameHeight = 1) { const contents = it.contents || [], last = contents.at(-1), level = contents.length ? Math.min(.82, .16 + contents.reduce((s, c) => s + c.amount, 0) / (last?.unit === 'mL' ? 160 : 55)) : .035, color = it.reaction?.productColor ?? last?.color ?? 0x47afd1; let vessel; switch (it.type) { case 'flask': vessel = this.flask(level, color); break; case 'beaker': vessel = this.beaker(level, color); if (contents.length && (it.temperature || 20) >= 68) vessel.add(this.bubbleCloud(20, .52, Math.max(.3, level * .85), 0xe9fbff)); break; case 'tube': vessel = this.testTube(level, color); break; case 'bunsen': return this.bunsen(it.lit, flameHeight, flameHeight < .9); case 'tripod': return this.tripod(); case 'balance': return this.balance(it.mass || 0); case 'thermometer': return this.thermometer(); case 'phmeter': return this.meter(null, it.uid); default: return new THREE.Group() }if (it.reaction) this.reactionEffects(vessel, it.reaction); return vessel }
  freeBunsenHeight(it, state) { if (!it?.lit) return 1; const support = state.workspace.filter(a => a.type === 'tripod').map(tripod => ({ tripod, d: Math.hypot(it.x - tripod.x, it.y - tripod.y) })).filter(a => a.d < 115).sort((a, b) => a.d - b.d)[0]?.tripod; if (!support || !state.workspace.some(a => (a.type === 'beaker' || a.type === 'flask') && a.snappedTo === support.uid)) return 1; const itemScale = 1.15, beakerBottom = 2.1 + .04 * itemScale, flameBottom = 1.29 * itemScale, gap = .065, flameSpan = 1.42 * itemScale; return Math.max(.32, Math.min(.42, (beakerBottom - flameBottom - gap) / flameSpan)) }
  evaporatingBasin(crystalsQ = 0) {
    const g = new THREE.Group();
    const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xfafafa, roughness: 0.6, metalness: 0, clearcoat: 0.1, side: THREE.DoubleSide });
    // A heavier ceramic wall keeps the basin readable against the gauze.  The
    // final shoulder is deliberately rolled over so the separate torus below
    // reads as a soft, rounded pouring lip rather than a sharp rim.
    const profile = [[0, .025], [.32, .025], [.52, .06], [.73, .18], [.88, .36], [.96, .49], [.94, .54]].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), ceramic);
    body.geometry.computeVertexNormals();
    g.add(body);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(.885, .065, 20, 96), ceramic);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = .535;
    lip.renderOrder = 5;
    g.add(lip);
    const liqMat = new THREE.MeshPhysicalMaterial({ color: 0x319bd3, transparent: true, opacity: 0.8, roughness: 0.1, transmission: 0.2, side: THREE.DoubleSide });
    const liqProfile = [[0, 0], [.3, 0], [.5, .035], [.7, .15], [.84, .32], [0, .32]].map(([x, y]) => new THREE.Vector2(x, y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liqProfile, 64), liqMat);
    liquid.geometry.computeVertexNormals();
    liquid.position.y = 0.022;
    liquid.scale.set(0.98, 0.98, 0.98);
    g.add(liquid);
    if (crystalsQ > 0) {
      const crMat = solid(0x2774d6, 0.9);
      const clusters = [
        { cx: 0.15, cz: 0.1 }, { cx: -0.25, cz: 0.3 },
        { cx: 0.3, cz: -0.2 }, { cx: -0.4, cz: -0.25 },
        { cx: 0.0, cz: -0.45 }, { cx: 0.45, cz: 0.25 }
      ];
      for (let i = 0; i < 45; i++) {
        const cluster = clusters[i % clusters.length];
        const angle = i * 2.399;
        const dist = ((i * 17) % 100) / 100 * 0.28;
        let x = cluster.cx + Math.cos(angle) * dist;
        let z = cluster.cz + Math.sin(angle) * dist;

        let r = Math.hypot(x, z);
        if (r > 0.8) {
          x = (x / r) * 0.8;
          z = (z / r) * 0.8;
          r = 0.8;
        }

        let baseY = 0.02;
        if (r > 0.3 && r <= 0.5) baseY = 0.02 + (r - 0.3) / 0.2 * 0.03;
        else if (r > 0.5 && r <= 0.7) baseY = 0.05 + (r - 0.5) / 0.2 * 0.10;
        else if (r > 0.7) baseY = 0.15 + (r - 0.7) / 0.15 * 0.17;

        const cr = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04 + 0.02 * (i % 3), 0), crMat);
        cr.position.set(x, baseY + 0.015 + ((i * 23) % 100) / 100 * 0.04, z);
        cr.rotation.set(i * 1.1, i * 0.7, i * 2.2);
        cr.scale.set(
          crystalsQ * (0.6 + ((i * 31) % 100) / 100 * 0.8),
          crystalsQ * (0.6 + ((i * 47) % 100) / 100 * 0.8),
          crystalsQ * (0.6 + ((i * 59) % 100) / 100 * 0.8)
        );
        g.add(cr);
      }
      const s = Math.max(0.01, 1 - crystalsQ);
      liquid.scale.set(0.98 * s, 0.98 * s, 0.98 * s);
    }
    return shadowReady(g);
  }
  filterFunnel() {
    const g = new THREE.Group();
    const coneProfile = [[0.06, 0], [0.06, 0.5], [0.45, 0.9], [0.47, 0.92]].map(([x, y]) => new THREE.Vector2(x, y));
    const cone = new THREE.Mesh(new THREE.LatheGeometry(coneProfile, 48), typeof GLASS === 'function' ? GLASS() : new THREE.MeshPhysicalMaterial({ color: 0xd9f4ff, transparent: true, opacity: 0.48, transmission: 0.72, roughness: 0.025, ior: 1.46, thickness: 0.11, side: THREE.DoubleSide }));
    cone.geometry.computeVertexNormals();
    g.add(cone);
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    const paperProfile = [[0.08, 0.5], [0.43, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
    const paper = new THREE.Mesh(new THREE.LatheGeometry(paperProfile, 32), paperMat);
    paper.geometry.computeVertexNormals();
    g.add(paper);
    return shadowReady(g);
  }
  pondweedRig(state) {
    const g = new THREE.Group();
    const dist = state.pondweedDistance || 20;
    const lampOn = state.pondweedLampOn !== false;
    const beakerX = 1.5, beakerZ = -0.6, beakerScale = 1.1;
    const beakerEdgeX = beakerX - .7 * beakerScale;
    const rulerUnitsPerCm = .05, rulerLength = 50 * rulerUnitsPerCm;

    // The zero end of the ruler physically touches the nearest outside edge of
    // the beaker. The scale backing sits in front of the lamp (closer to the camera)
    // and stands upright, matching the potometer practical scale board layout.
    const rulerGroup = new THREE.Group();
    const rulerZ = -0.05;
    const rulerMat = new THREE.MeshStandardMaterial({ color: 0xf6f2df, roughness: .86, metalness: 0 });
    const scaleBacking = new THREE.Mesh(roundedBox(rulerLength + .12, .27, .025, .018), rulerMat);
    scaleBacking.position.set(beakerEdgeX - rulerLength / 2, .18, rulerZ);
    rulerGroup.add(scaleBacking);

    const tickMat = new THREE.MeshBasicMaterial({ color: 0x17323c, toneMapped: false, depthTest: false });
    for (let cm = 0; cm <= 50; cm += 1) {
      const isMajor = cm % 10 === 0, isMid = cm % 5 === 0;
      const tickX = beakerEdgeX - cm * rulerUnitsPerCm;
      const tickH = isMajor ? .16 : isMid ? .12 : .075;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(isMajor ? .014 : .008, tickH, .015), tickMat);
      tick.position.set(tickX, .135 + (isMajor ? .015 : 0), rulerZ + .016);
      tick.renderOrder = 10;
      rulerGroup.add(tick);
    }
    const rulerLabel = (value, x) => {
      const canvas = document.createElement('canvas'), dc = canvas.getContext('2d'); canvas.width = 128; canvas.height = 64; dc.fillStyle = '#18333d'; dc.font = '800 42px Inter, sans-serif'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(String(value), 64, 32); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; const label = new THREE.Mesh(new THREE.PlaneGeometry(.25, .125), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthTest: false })); label.position.set(x, .285, rulerZ + .018); label.renderOrder = 12; rulerGroup.add(label)
    };
    for (let cm = 0; cm <= 50; cm += 10)rulerLabel(cm, beakerEdgeX - cm * rulerUnitsPerCm);
    const zeroStop = new THREE.Mesh(roundedBox(.035, .28, .035, .008), new THREE.MeshBasicMaterial({ color: 0x138d80 }));
    zeroStop.position.set(beakerEdgeX, .18, rulerZ); rulerGroup.add(zeroStop);
    const activeMark = new THREE.Mesh(roundedBox(.024, .275, .035, .006), new THREE.MeshBasicMaterial({ color: lampOn ? 0xffd072 : 0x6d7b7f, toneMapped: false }));
    activeMark.position.set(beakerEdgeX - dist * rulerUnitsPerCm, .181, rulerZ); activeMark.renderOrder = 11; rulerGroup.add(activeMark);
    Object.assign(rulerGroup.userData, { style: 'potometer ivory-white scale', rangeCm: [0, 50], numberedEveryCm: 10, zeroAtBeakerEdge: true });
    g.add(rulerGroup);

    const beaker = this.beaker(0.75, 0x36a676);
    beaker.position.set(beakerX, 0.1, beakerZ);
    beaker.scale.setScalar(beakerScale);
    g.add(beaker);

    const stemGroup = new THREE.Group();
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.4 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.2, 12), stemMat);
    stem.position.y = 0.6;
    stemGroup.add(stem);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.3, side: THREE.DoubleSide });
    for (let i = 0; i < 16; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.08), leafMat);
      leaf.position.set(Math.sin(i * 1.2) * 0.06, 0.2 + i * 0.055, Math.cos(i * 1.2) * 0.06);
      leaf.rotation.set(0.3, i * 1.2, 0.2);
      stemGroup.add(leaf);
    }
    stemGroup.position.set(beakerX, 0.15, beakerZ);
    g.add(stemGroup);

    // Traditional spring-arm filament desk lamp. The front lip of the bell
    // shade, rather than the base centre, is aligned over the selected ruler
    // graduation so the visible gap to the beaker edge is the stated distance.
    const shadeFaceX = beakerEdgeX - dist * rulerUnitsPerCm;
    const shadeFaceOffset = .67;
    const lampBaseX = shadeFaceX - shadeFaceOffset;
    const lampGroup = new THREE.Group();
    const enamel = new THREE.MeshPhysicalMaterial({ color: 0x153c32, metalness: .42, roughness: .19, clearcoat: .92, clearcoatRoughness: .08 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x263237, metalness: .82, roughness: .2 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xa77b37, metalness: .86, roughness: .2 });
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x101516, roughness: 0.86 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.31, .36, .105, 56), enamel);
    base.position.y = .055;
    lampGroup.add(base);
    const baseTop = new THREE.Mesh(new THREE.CylinderGeometry(.285, .31, .035, 56), darkMetal); baseTop.position.y = .12; lampGroup.add(baseTop);
    const rubberRing = new THREE.Mesh(new THREE.TorusGeometry(.335, .022, 12, 48), rubberMat);
    rubberRing.rotation.x = Math.PI / 2; rubberRing.position.y = .012;
    lampGroup.add(rubberRing);
    const basePivot = new THREE.Vector3(0, .19, 0), elbow = new THREE.Vector3(-.16, .76, 0), headPivot = new THREE.Vector3(.23, 1.22, 0);
    for (const z of [-.068, .068]) {
      lampGroup.add(this.tubeBetween(basePivot.clone().setZ(z), elbow.clone().setZ(z), .027, darkMetal));
      lampGroup.add(this.tubeBetween(elbow.clone().setZ(z), headPivot.clone().setZ(z), .027, darkMetal));
    }
    for (const [point, radius] of [[basePivot, .085], [elbow, .092], [headPivot, .078]]) {
      const joint = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .19, 40), enamel); joint.rotation.x = Math.PI / 2; joint.position.copy(point); lampGroup.add(joint);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * .48, radius * .48, .202, 32), brass); cap.rotation.x = Math.PI / 2; cap.position.copy(point); lampGroup.add(cap);
    }
    const springPoints = []; for (let i = 0; i <= 52; i++) { const q = i / 52; springPoints.push(new THREE.Vector3(THREE.MathUtils.lerp(-.12, .19, q), THREE.MathUtils.lerp(.81, 1.17, q), .09 + Math.sin(q * Math.PI * 18) * .018)) }
    const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints), 96, .008, 8, false), new THREE.MeshStandardMaterial({ color: 0xd8e0df, metalness: .92, roughness: .12 })); lampGroup.add(spring);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(.285, .125, .44, 64, 1, true), enamel);
    shade.rotation.z = -Math.PI / 2; shade.position.set(.45, 1.22, 0); lampGroup.add(shade);
    const rearCap = new THREE.Mesh(new THREE.SphereGeometry(.135, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), enamel); rearCap.rotation.z = Math.PI / 2; rearCap.position.set(.23, 1.22, 0); rearCap.scale.x = .72; lampGroup.add(rearCap);
    const shadeRim = new THREE.Mesh(new THREE.TorusGeometry(.285, .021, 14, 64), brass); shadeRim.rotation.y = Math.PI / 2; shadeRim.position.set(.67, 1.22, 0); lampGroup.add(shadeRim);
    const reflector = new THREE.Mesh(new THREE.RingGeometry(.105, .262, 64), new THREE.MeshPhysicalMaterial({ color: 0xfff2d0, metalness: .24, roughness: .2, side: THREE.DoubleSide, emissive: lampOn ? 0x5e3d17 : 0x000000, emissiveIntensity: lampOn ? .32 : 0 }));
    reflector.rotation.y = Math.PI / 2; reflector.position.set(.656, 1.22, 0); lampGroup.add(reflector);
    const bulbMat = new THREE.MeshPhysicalMaterial({ color: lampOn ? 0xffd38e : 0xdce7e6, transparent: true, opacity: lampOn ? .68 : .42, transmission: lampOn ? .22 : .68, roughness: .08, ior: 1.46, thickness: .08, clearcoat: .8, emissive: lampOn ? 0xff8a28 : 0x000000, emissiveIntensity: lampOn ? .72 : 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.105, 48, 28), bulbMat); bulb.scale.set(1.15, 1, .96); bulb.position.set(.675, 1.22, 0); lampGroup.add(bulb);
    const filamentMat = new THREE.MeshBasicMaterial({ color: lampOn ? 0xffe4a1 : 0x5c4634, toneMapped: false });
    const filamentCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(.628, 1.17, -.025), new THREE.Vector3(.674, 1.19, -.025), new THREE.Vector3(.65, 1.22, 0), new THREE.Vector3(.674, 1.25, .025), new THREE.Vector3(.628, 1.27, .025)]);
    const filament = new THREE.Mesh(new THREE.TubeGeometry(filamentCurve, 42, .009, 8, false), filamentMat); lampGroup.add(filament);
    for (const z of [-.025, .025]) lampGroup.add(this.tubeBetween(new THREE.Vector3(.55, 1.17, z), new THREE.Vector3(.635, 1.19, z), .008, darkMetal));
    const switchButton = new THREE.Mesh(new THREE.CylinderGeometry(.038, .038, .035, 24), new THREE.MeshStandardMaterial({ color: lampOn ? 0xc84532 : 0x253237, roughness: .38 }));
    switchButton.position.set(-.18, .16, .18); switchButton.rotation.x = Math.PI / 2; lampGroup.add(switchButton);
    if (lampOn) {
      const light = new THREE.SpotLight(0xffd49a, 6.4, 7, Math.PI / 5, .46, 1.18);
      light.position.set(.68, 1.22, 0);
      light.target.position.set(beakerX - lampBaseX, .48, 0);
      lampGroup.add(light, light.target);
      const bulbGlow = new THREE.PointLight(0xffb55e, 2.4, 2.4, 1.7); bulbGlow.position.set(.69, 1.22, 0); lampGroup.add(bulbGlow);
      this.dynamic.push({ kind: 'filamentLamp', filamentMat, bulbMat, light, bulbGlow });
    }
    lampGroup.position.set(lampBaseX, .08, beakerZ);
    g.add(lampGroup);

    if (lampOn) {
      const bpm = Math.round(52 / Math.pow(dist / 10, 1.8) + 4);
      for (let b = 0; b < Math.min(15, Math.ceil(bpm / 3)); b++) {
        const bubble = new THREE.Mesh(
          new THREE.SphereGeometry(0.025 + (b % 3) * 0.008, 12, 12),
          new THREE.MeshPhysicalMaterial({ color: 0xe0ffff, transparent: true, opacity: 0.8, transmission: 0.9, roughness: 0.05 })
        );
        const phase = (b / 15);
        this.dynamic.push({
          kind: 'bubble',
          mesh: bubble,
          speed: 0.4 + (b % 4) * 0.1,
          phase,
          height: 0.8,
          startY: 0.8,
          baseY: 0.8
        });
        bubble.position.set(beakerX + (Math.random() - 0.5) * 0.08, 0.8, beakerZ + (Math.random() - 0.5) * 0.08);
        g.add(bubble);
      }
    }

    return shadowReady(g);
  }
  samplingQuadratFrame(size = 1.05, colour = 0xd5e1e2) {
    const g = new THREE.Group(), frameMat = new THREE.MeshPhysicalMaterial({ color: colour, metalness: .78, roughness: .19, clearcoat: .48 }), gridMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb1b4, metalness: .65, roughness: .24 }), h = size / 2, y = .035;
    const corners = [new THREE.Vector3(-h, y, -h), new THREE.Vector3(h, y, -h), new THREE.Vector3(h, y, h), new THREE.Vector3(-h, y, h)];
    for (let i = 0; i < 4; i++) g.add(this.tubeBetween(corners[i], corners[(i + 1) % 4], .027, frameMat));
    for (let i = 1; i < 4; i++) { const q = -h + size * i / 4; g.add(this.tubeBetween(new THREE.Vector3(q, y + .006, -h), new THREE.Vector3(q, y + .006, h), .009, gridMat)); g.add(this.tubeBetween(new THREE.Vector3(-h, y + .009, q), new THREE.Vector3(h, y + .009, q), .009, gridMat)) }
    Object.assign(g.userData, { areaM2: 1, grid: '4x4', countingBoundaryRule: 'top and right included' }); return shadowReady(g)
  }
  daisyPlant(sampleIndex, localIndex, position, scale = 1) {
    const g = new THREE.Group(), green = new THREE.MeshStandardMaterial({ color: 0x2f7d39, roughness: .58 }), leafMat = new THREE.MeshStandardMaterial({ color: 0x438e43, roughness: .52, side: THREE.DoubleSide }), petalMat = new THREE.MeshPhysicalMaterial({ color: 0xfffdf1, roughness: .48, clearcoat: .14, side: THREE.DoubleSide }), discMat = new THREE.MeshStandardMaterial({ color: 0xe9b620, roughness: .62, emissive: 0x5b3400, emissiveIntensity: .08 }), height = (.42 + (localIndex % 4) * .045) * scale;
    const stemCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(.018 * (localIndex % 2 ? 1 : -1), height * .36, .006), new THREE.Vector3(-.012, height * .72, .01), new THREE.Vector3(0, height, 0)], false, 'centripetal');
    const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 18, .012 * scale, 8, false), green); g.add(stem);
    for (const side of [-1, 1]) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(.075 * scale, 18, 10), leafMat); leaf.scale.set(1.2, .15, .38); leaf.rotation.set(.18, side > 0 ? -.42 : .42, side > 0 ? -.45 : .45); leaf.position.set(side * .055 * scale, height * (.3 + (side > 0 ? .08 : 0)), 0); g.add(leaf) }
    const head = new THREE.Group(); head.position.y = height;
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, petal = new THREE.Mesh(new THREE.SphereGeometry(.057 * scale, 18, 9), petalMat); petal.scale.set(1.34, .17, .52); petal.position.set(Math.cos(a) * .1 * scale, .005, Math.sin(a) * .1 * scale); petal.rotation.y = -a; head.add(petal) }
    const disc = new THREE.Mesh(new THREE.SphereGeometry(.071 * scale, 24, 12), discMat); disc.scale.y = .34; disc.position.y = .014; head.add(disc);
    const florets = new THREE.Group(); for (let i = 0; i < 9; i++) { const a = i * 2.399, r = .012 + (i % 3) * .014, dot = new THREE.Mesh(new THREE.SphereGeometry(.009 * scale, 8, 5), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf2c72d : 0xd9940e, roughness: .66 })); dot.position.set(Math.cos(a) * r, .043, Math.sin(a) * r); florets.add(dot) } head.add(florets); g.add(head);
    const highlight = new THREE.Mesh(new THREE.TorusGeometry(.155 * scale, .012, 8, 40), new THREE.MeshBasicMaterial({ color: 0x58f3cd, transparent: true, opacity: .88, depthWrite: false, toneMapped: false })); highlight.rotation.x = Math.PI / 2; highlight.position.y = .018; highlight.visible = false; g.add(highlight);
    g.position.copy(position); Object.assign(g.userData, { sampleIndex, localIndex, head, discMat, highlight, baseScale: scale }); return shadowReady(g)
  }
  randomSamplingRig(state) {
    const g = new THREE.Group(), skyCanvas = document.createElement('canvas'), sc = skyCanvas.getContext('2d'); skyCanvas.width = 1024; skyCanvas.height = 512; const skyGrad = sc.createLinearGradient(0, 0, 0, 512); skyGrad.addColorStop(0, '#36a9e8'); skyGrad.addColorStop(.58, '#8bd6f2'); skyGrad.addColorStop(1, '#d9f0dc'); sc.fillStyle = skyGrad; sc.fillRect(0, 0, 1024, 512); const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace; const sky = new THREE.Mesh(new THREE.PlaneGeometry(22, 8.2), new THREE.MeshBasicMaterial({ map: skyTexture, toneMapped: false })); sky.position.set(0, 3.75, -4.95); g.add(sky);
    const sunHalo = new THREE.Mesh(new THREE.CircleGeometry(.68, 64), new THREE.MeshBasicMaterial({ color: 0xfff1a6, transparent: true, opacity: .24, depthWrite: false, toneMapped: false })); sunHalo.position.set(3.65, 5.35, -4.78); g.add(sunHalo); const sun = new THREE.Mesh(new THREE.CircleGeometry(.32, 64), new THREE.MeshBasicMaterial({ color: 0xfff6bd, toneMapped: false })); sun.position.set(3.65, 5.35, -4.76); g.add(sun);
    const clouds = [], cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .88, depthWrite: false });
    [[-3.7, 5.2, .92], [-.45, 4.9, .7], [3.05, 4.55, .78]].forEach(([x, y, scale], ci) => { const cloud = new THREE.Group(); for (let i = 0; i < 7; i++) { const puff = new THREE.Mesh(new THREE.SphereGeometry(.38 + (i % 3) * .08, 24, 14), cloudMat); puff.scale.set(1.35, .58 + (i % 2) * .18, .35); puff.position.set((i - 3) * .26, Math.sin(i * 1.7) * .1 + (i % 3 === 1 ? .13 : 0), 0); cloud.add(puff) } cloud.position.set(x, y, -4.62 + ci * .025); cloud.scale.setScalar(scale); g.add(cloud); clouds.push({ group: cloud, baseX: x, phase: ci * 1.7 }) });
    // Curved tapered trunks, radial connected branches and deep asymmetric
    // crowns replace the former row of straight poles and repeated leaf balls.
    const barkCanvas = document.createElement('canvas'), bc = barkCanvas.getContext('2d'); barkCanvas.width = 96; barkCanvas.height = 256; bc.fillStyle = '#765038'; bc.fillRect(0, 0, 96, 256); let barkSeed = 98231; const barkRnd = () => ((barkSeed = Math.imul(barkSeed, 1664525) + 1013904223 >>> 0) / 4294967296); for (let i = 0; i < 150; i++) { const x = barkRnd() * 96, y = barkRnd() * 256, length = 12 + barkRnd() * 62; bc.strokeStyle = barkRnd() > .48 ? `rgba(42,24,15,${.18 + barkRnd() * .28})` : `rgba(211,160,106,${.1 + barkRnd() * .18})`; bc.lineWidth = .5 + barkRnd() * 2.1; bc.beginPath(); bc.moveTo(x, y); bc.bezierCurveTo(x + (barkRnd() - .5) * 5, y + length * .3, x + (barkRnd() - .5) * 4, y + length * .7, x + (barkRnd() - .5) * 3, y + length); bc.stroke() } const barkTexture = new THREE.CanvasTexture(barkCanvas); barkTexture.wrapS = barkTexture.wrapT = THREE.RepeatWrapping; barkTexture.repeat.set(1.15, 2.7); barkTexture.colorSpace = THREE.SRGBColorSpace;
    const meadowHeight=(x,z)=>.3+Math.sin(x*.72+z*.31)*.016+Math.sin(z*1.18-x*.28)*.011,trees=[],trunkMat=new THREE.MeshStandardMaterial({color:0x8a684b,map:barkTexture,bumpMap:barkTexture,bumpScale:.045,roughness:.96}),foliageGeometry=new THREE.IcosahedronGeometry(1,2),foliageMats=[0x183f28,0x245b32,0x34743b,0x438443,0x568f49].map(color=>new THREE.MeshStandardMaterial({color,roughness:.94,flatShading:false})),treeTubeBetween=(a,b,startRadius,endRadius,mat)=>{const d=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(endRadius,startRadius,d.length(),12,2,false),mat);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());return mesh};foliageGeometry.computeVertexNormals();let treeSeed=26813;const treeRnd=()=>((treeSeed=Math.imul(treeSeed,1664525)+1013904223>>>0)/4294967296);
    for (let i = 0; i < 11; i++) {
      const tree=new THREE.Group(),depthRow=i%3,x=-5.65+i*1.13+(treeRnd()-.5)*.55,z=-2.28-depthRow*.31+(treeRnd()-.5)*.18,treeScale=.82-depthRow*.06+treeRnd()*.28,leanX=(treeRnd()-.5)*.26,leanZ=(treeRnd()-.5)*.18,p0=new THREE.Vector3(0,0,0),p1=new THREE.Vector3(leanX*.18,.68,leanZ*.12),p2=new THREE.Vector3(leanX*.43,1.16,leanZ*.32),p3=new THREE.Vector3(leanX*.72,1.68,leanZ*.62),p4=new THREE.Vector3(leanX,2.17,leanZ);
      tree.add(treeTubeBetween(p0,p1,.18,.15,trunkMat),treeTubeBetween(p1,p2,.15,.12,trunkMat));
      for(let r=0;r<3;r++){const a=r/3*Math.PI*2+i*.71,rootStart=new THREE.Vector3(Math.cos(a)*.035,.08,Math.sin(a)*.035),rootEnd=new THREE.Vector3(Math.cos(a)*(.22+treeRnd()*.08),.012,Math.sin(a)*(.22+treeRnd()*.08));tree.add(treeTubeBetween(rootStart,rootEnd,.075,.018,trunkMat))}
      const swayPivot=new THREE.Group();swayPivot.position.copy(p2);tree.add(swayPivot);const rel3=p3.clone().sub(p2),rel4=p4.clone().sub(p2),knuckle=new THREE.Mesh(new THREE.IcosahedronGeometry(.125,1),trunkMat);knuckle.scale.set(1.04,.82,1.04);swayPivot.add(knuckle,treeTubeBetween(new THREE.Vector3(0,-.018,0),rel3,.12,.086,trunkMat),treeTubeBetween(rel3,rel4,.086,.052,trunkMat));
      const branchTips = [];
      for(let b=0;b<6;b++){const fraction=.12+b*.135,azimuth=b*2.399+i*.47,base=rel4.clone().multiplyScalar(fraction),reach=.43+treeRnd()*.24,mid=base.clone().add(new THREE.Vector3(Math.cos(azimuth)*reach*.58,.2+treeRnd()*.13,Math.sin(azimuth)*reach*.5)),tip=mid.clone().add(new THREE.Vector3(Math.cos(azimuth+(treeRnd()-.5)*.38)*reach*.42,.13+treeRnd()*.14,Math.sin(azimuth+(treeRnd()-.5)*.38)*reach*.36));swayPivot.add(treeTubeBetween(base,mid,.057-b*.003,.03,trunkMat),treeTubeBetween(mid,tip,.03,.012,trunkMat));branchTips.push(tip)}
      const archetype=Math.floor(treeRnd()*3),coreCentres=[rel4.clone().multiplyScalar(.62).add(new THREE.Vector3(-.2,.12,.05)),rel4.clone().multiplyScalar(.76).add(new THREE.Vector3(.2,.08,-.08)),rel4.clone().multiplyScalar(.9).add(new THREE.Vector3(0,.12,.12)),rel4.clone().multiplyScalar(.66).add(new THREE.Vector3(.02,-.08,-.22)),rel4.clone().multiplyScalar(.82).add(new THREE.Vector3(-.08,.04,.24))],lobeCentres=[...branchTips,...coreCentres],outerLobes=[];
      lobeCentres.forEach((centre,li)=>{const materialIndex=li<6?2+(i+li)%3:Math.min(2,(i+li)%3),lobe=new THREE.Mesh(foliageGeometry,foliageMats[materialIndex]),broad=archetype===0?1.13:archetype===1?.88:.72,upright=archetype===1?1.2:archetype===2?1.12:.86,base=.34+treeRnd()*.17;lobe.position.copy(centre).add(new THREE.Vector3((treeRnd()-.5)*.18,(treeRnd()-.5)*.12,(treeRnd()-.5)*.2));lobe.scale.set(base*broad*(1+treeRnd()*.22),base*upright*(1+treeRnd()*.2),base*(.88+treeRnd()*.34));lobe.rotation.set(treeRnd()*.7,treeRnd()*Math.PI,treeRnd()*.55);swayPivot.add(lobe);if(li<6||li>8)outerLobes.push({mesh:lobe,base:lobe.rotation.clone(),phase:i*.73+li*.61})});
      tree.position.set(x,meadowHeight(x,z)-.008,z);tree.scale.setScalar(treeScale);g.add(tree);trees.push({group:tree,swayPivot,outerLobes,phase:i*.53,depthRow})
    }
    const shrubGeometry=new THREE.IcosahedronGeometry(1,1),shrubMats=[foliageMats[0],foliageMats[1],foliageMats[3]],shrubs=[];
    for(let i=0;i<28;i++){const shrub=new THREE.Mesh(shrubGeometry,shrubMats[i%shrubMats.length]),x=-6.1+i/27*12.2+(treeRnd()-.5)*.42,z=-2.03-treeRnd()*.72;shrub.position.set(x,meadowHeight(x,z)+.08+(i%3)*.012,z);shrub.scale.set(.22+treeRnd()*.17,.15+treeRnd()*.1,.18+treeRnd()*.16);shrub.rotation.set(treeRnd()*.24,treeRnd()*Math.PI*2,treeRnd()*.18);g.add(shrub);shrubs.push(shrub)}
    // The habitat is a broad field surface rather than a turf block placed on
    // the laboratory bench.  It extends beyond the near camera frustum so the
    // former worktop and cupboard frontage are completely replaced by meadow.
    const meadowGeo = new THREE.PlaneGeometry(12.4, 9.2, 30, 24), meadowPos = meadowGeo.getAttribute('position'), meadowColours = [], meadowColour = new THREE.Color();
    for (let i = 0; i < meadowPos.count; i++) {
      const lx = meadowPos.getX(i), ly = meadowPos.getY(i), wz = 1.55 - ly, rise = meadowHeight(lx,wz)-.3;
      meadowPos.setZ(i, rise); meadowColour.setHSL(.29 + Math.sin(lx * .47 + wz) * .012, .48 + Math.sin(wz * .63) * .04, .31 + Math.sin(lx * .8 - wz * .45) * .025); meadowColours.push(meadowColour.r, meadowColour.g, meadowColour.b)
    }
    meadowGeo.setAttribute('color', new THREE.Float32BufferAttribute(meadowColours, 3)); meadowGeo.computeVertexNormals();
    const meadowSurface = new THREE.Mesh(meadowGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97, metalness: 0, side: THREE.DoubleSide })); meadowSurface.rotation.x = -Math.PI / 2; meadowSurface.position.set(0, .3, 1.55); meadowSurface.receiveShadow = true; g.add(meadowSurface);
    const bladeGeometry = new THREE.PlaneGeometry(.032, .34, 1, 4); bladeGeometry.translate(0, .17, 0); const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xc4e5a8, roughness: .82, side: THREE.DoubleSide, vertexColors: true, emissive: 0x2b7432, emissiveIntensity: .42 }); const grassUniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uGrow: { value: 0 } };
    bladeMaterial.onBeforeCompile = shader => { Object.assign(shader.uniforms, grassUniforms); shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float bladePhase; attribute float bladeDelay; uniform float uTime; uniform float uWind; uniform float uGrow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat bladeGrow = smoothstep(bladeDelay, min(1.0, bladeDelay + 0.26), uGrow); transformed.y *= bladeGrow; float bladeTip = clamp(uv.y, 0.0, 1.0); transformed.x += sin(uTime * 2.15 + bladePhase) * uWind * pow(bladeTip, 1.7) * 0.105; transformed.z += sin(uTime * 1.47 + bladePhase * 1.73) * uWind * pow(bladeTip, 1.9) * 0.055;'); bladeMaterial.userData.shader = shader };
    const bladeCount = 1520, grass = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, bladeCount), dummy = new THREE.Object3D(), phases = new Float32Array(bladeCount), delays = new Float32Array(bladeCount); let seed = 41729; const rnd = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    for (let i = 0; i < bladeCount; i++) { const x = (rnd() - .5) * 11.75, z = (rnd() - .5) * 8.65 + 1.48, s = .62 + rnd() * .86; dummy.position.set(x, .305, z); dummy.rotation.set(0, rnd() * Math.PI * 2, (rnd() - .5) * .08); dummy.scale.set(.72 + rnd() * .55, s, 1); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix); grass.setColorAt(i, new THREE.Color().setHSL(.27 + rnd() * .06, .5 + rnd() * .18, .42 + rnd() * .14)); phases[i] = rnd() * Math.PI * 2; delays[i] = rnd() * .72 }
    bladeGeometry.setAttribute('bladePhase', new THREE.InstancedBufferAttribute(phases, 1)); bladeGeometry.setAttribute('bladeDelay', new THREE.InstancedBufferAttribute(delays, 1)); grass.instanceMatrix.needsUpdate = true; grass.castShadow = false; grass.receiveShadow = false; g.add(grass);
    const mossCount = 240, mossGeometry = new THREE.IcosahedronGeometry(.058, 1), mossMaterial = new THREE.MeshStandardMaterial({ color: 0x4d7637, roughness: 1, flatShading: true, transparent: true, opacity: 0 }), moss = new THREE.InstancedMesh(mossGeometry, mossMaterial, mossCount);
    for (let i = 0; i < mossCount; i++) { const x = (rnd() - .5) * 11.55, z = (rnd() - .5) * 8.45 + 1.48, spread = .5 + rnd() * .82; dummy.position.set(x, .315 + rnd() * .006, z); dummy.rotation.set(rnd() * .12, rnd() * Math.PI * 2, rnd() * .1); dummy.scale.set(spread, .3 + rnd() * .28, .5 + rnd() * .82); dummy.updateMatrix(); moss.setMatrixAt(i, dummy.matrix); moss.setColorAt(i, new THREE.Color().setHSL(.22 + rnd() * .075, .3 + rnd() * .2, .2 + rnd() * .105)) }
    moss.instanceMatrix.needsUpdate = true; moss.castShadow = false; moss.receiveShadow = true; g.add(moss);
    const gridPts = []; for (let i = 0; i <= 10; i++) { const x = -3.92 + i * .784, z = -2.1 + i * .436; gridPts.push(x, .375, -2.1, x, .375, 2.26, -3.92, .375, z, 3.92, .375, z) } const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3)); const habitatGrid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0xd9efc5, transparent: true, opacity: .18 })); g.add(habitatGrid);
    const sampleTargets = [[-1.85,.48],[1.72,-.64],[-.04,-.02],[-2.35,-.86],[1.18,.7]], sampleCounts = [4,7,5,3,6], daisies = [];
    sampleTargets.forEach(([cx, cz], si) => { for (let j = 0; j < sampleCounts[si]; j++) { const angle = j * 2.399 + si * .52, radius = .09 + (j % 3) * .12, pos = new THREE.Vector3(cx + Math.cos(angle) * radius, .36, cz + Math.sin(angle) * radius), plant = this.daisyPlant(si, j, pos, .78 + (j % 3) * .09); g.add(plant); daisies.push(plant) } });
    [[-3.15,1.18],[-2.65,.12],[-1.15,-1.35],[-.62,1.35],[.58,-1.38],[2.18,.24],[2.72,-1.05],[3.08,1.15]].forEach(([x,z], i) => { const plant = this.daisyPlant(-1, i, new THREE.Vector3(x,.36,z), .72 + (i % 3) * .08); g.add(plant); daisies.push(plant) });
    const quadrat = this.samplingQuadratFrame(1.08); g.add(quadrat);
    const displayCanvas = document.createElement('canvas'), dc = displayCanvas.getContext('2d'); displayCanvas.width = 512; displayCanvas.height = 220; const displayTexture = new THREE.CanvasTexture(displayCanvas); displayTexture.colorSpace = THREE.SRGBColorSpace; const generator = new THREE.Group(), generatorBody = new THREE.Mesh(roundedBox(1.2, .74, .2, .08), new THREE.MeshPhysicalMaterial({ color: 0x213d43, roughness: .38, metalness: .18, clearcoat: .45 })); generatorBody.position.y = .4; generator.add(generatorBody); const screen = new THREE.Mesh(new THREE.PlaneGeometry(.98, .42), new THREE.MeshBasicMaterial({ map: displayTexture, toneMapped: false })); screen.position.set(0, .43, .111); generator.add(screen); generator.position.set(-3.15, .36, -1.45); generator.rotation.y = .08; g.add(generator);
    this.dynamic.push({ kind: 'randomSampling', grassUniforms, grassMaterial: bladeMaterial, mossMaterial, clouds, trees, daisies, quadrat, display: { canvas: displayCanvas, context: dc, texture: displayTexture }, targets: sampleTargets });
    Object.assign(g.userData, { randomQuadratHabitat: true, grassBladeCount: bladeCount, mossPatchCount: mossCount, daisyCount: daisies.length, treeCount: trees.length, cloudCount: clouds.length, realisticLayeredTrees: true, treeDepthRows: 3, curvedTaperedTrunks: true, radialConnectedBranching: true, canopyLobesPerTree: 11, upperCanopyWindFlex: true, forestShrubCount: shrubs.length, visibleRootFlares: true, lowPolygonBackgroundBranches: true, laboratoryTilesHidden: true, laboratoryBenchAndCupboardsReplaced: true, foregroundMeadowFillsArena: true, windAffectedTurf: true, mossBetweenGrassBlades: true, detailedDaisies: true }); const ready = shadowReady(g); trees.forEach(tree=>tree.group.traverse(node=>{if(node.isMesh)node.castShadow=false})); shrubs.forEach(shrub=>shrub.castShadow=false); grass.castShadow = false; grass.receiveShadow = false; moss.castShadow = false; meadowSurface.castShadow = false; return ready
  }
  shoreHeight(x, z) { return .14 + Math.max(0, 3.4 - z) * .115 + Math.sin(x * 1.8 + z * .7) * .055 + Math.sin(z * 2.35 - x * .54) * .035 }
  rockyShoreRig(state) {
    const g = new THREE.Group(), skyCanvas = document.createElement('canvas'), sc = skyCanvas.getContext('2d'); skyCanvas.width = 1024; skyCanvas.height = 512; const grad = sc.createLinearGradient(0,0,0,512); grad.addColorStop(0,'#4fafe0'); grad.addColorStop(.62,'#b9e3f2'); grad.addColorStop(1,'#eef2dd'); sc.fillStyle = grad; sc.fillRect(0,0,1024,512); const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace; const sky = new THREE.Mesh(new THREE.PlaneGeometry(28,8.6), new THREE.MeshBasicMaterial({ map: skyTexture, toneMapped:false })); sky.position.set(0,3.8,-5.15); g.add(sky);
    // A high-resolution, coherently eroded face replaces the pale six-row wall.
    // Rock strata, broken ledges, recessed branching fissures, a damp toe and
    // a real peat edge all share one continuous, height-bounded ridge.
    const cliff = new THREE.Group(), cliffMinX=-12.2, cliffMaxX=12.2, ridgeY=x=>THREE.MathUtils.clamp(2.62+Math.sin(x*.66)*.1+Math.sin(x*1.73+.45)*.055,2.46,2.78), ridgeZ=x=>-2.72+Math.sin(x*.58+.9)*.075+Math.sin(x*1.61)*.025,toeZ=x=>-2.04+Math.sin(x*1.08)*.065,baseY=x=>this.shoreHeight(x,toeZ(x))-.035,cliffFrontZ=(x,t)=>{const fade=Math.sin(Math.PI*t),naturalRelief=(Math.sin(x*.79+t*4.1)*.055+Math.sin(x*2.31-t*6.7)*.027)*fade,ledge1=Math.exp(-Math.pow((t-(.23+Math.sin(x*.37)*.014))/.052,2))*(.045+.075*(.5+.5*Math.sin(x*.83+1.1))),ledge2=Math.exp(-Math.pow((t-(.51+Math.sin(x*.29+2)*.018))/.058,2))*(.035+.06*(.5+.5*Math.sin(x*.61-.7))),ledge3=Math.exp(-Math.pow((t-(.75+Math.sin(x*.42-.5)*.012))/.048,2))*(.028+.052*(.5+.5*Math.sin(x*.94+2.2)));return THREE.MathUtils.lerp(toeZ(x),ridgeZ(x),t)+naturalRelief+(ledge1+ledge2+ledge3)*fade},cliffCols=75,cliffRows=12,cliffPositions=[],cliffColours=[],cliffIndices=[],facetColour=new THREE.Color(),rockBands=[0x50534f,0x66645e,0x756d62,0x5d5a55,0x817769,0x68645d];
    for(let ix=0;ix<cliffCols;ix++){const rawX=THREE.MathUtils.lerp(cliffMinX,cliffMaxX,ix/(cliffCols-1)),top=ridgeY(rawX),base=baseY(rawX);for(let iy=0;iy<cliffRows;iy++){const t=iy/(cliffRows-1),x=rawX+(iy>0&&iy<cliffRows-1?Math.sin(ix*1.91+iy*2.37)*.032:0),y=THREE.MathUtils.lerp(base,top,t)+(iy>0&&iy<cliffRows-1?Math.sin(ix*1.37-iy*.84)*.035+Math.sin(ix*.47+iy*2.2)*.018:0),z=cliffFrontZ(x,t),band=Math.max(0,Math.min(rockBands.length-1,Math.floor(t*rockBands.length+Math.sin(x*.72)*.42)));cliffPositions.push(x,y,z);facetColour.setHex(rockBands[band]);facetColour.offsetHSL(Math.sin(ix*.59+iy)*.008,Math.sin(iy*1.7)*.015,(Math.sin(ix*1.19-iy*.73)*.055)+(t<.13?-.075:0)+(t>.88?.018:0));cliffColours.push(facetColour.r,facetColour.g,facetColour.b)}}
    for(let ix=0;ix<cliffCols-1;ix++)for(let iy=0;iy<cliffRows-1;iy++){const a=ix*cliffRows+iy,b=a+cliffRows,c=a+1,d=b+1;(ix+iy)%2?cliffIndices.push(a,b,c,c,b,d):cliffIndices.push(a,b,d,a,d,c)}const cliffGeo=new THREE.BufferGeometry();cliffGeo.setAttribute('position',new THREE.Float32BufferAttribute(cliffPositions,3));cliffGeo.setAttribute('color',new THREE.Float32BufferAttribute(cliffColours,3));cliffGeo.setIndex(cliffIndices);cliffGeo.computeVertexNormals();const cliffFace=new THREE.Mesh(cliffGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97,flatShading:true}));cliff.add(cliffFace);
    const ledgePositions=[],ledgeColours=[],ledgeIndices=[],ledgeColour=new THREE.Color(),appendLedge=(t,x0,x1,phase)=>{const start=ledgePositions.length/3,steps=9;for(let i=0;i<=steps;i++){const q=i/steps,x=THREE.MathUtils.lerp(x0,x1,q),localT=t+Math.sin(x*.73+phase)*.017+Math.sin(x*2.8-phase)*.006,y=THREE.MathUtils.lerp(baseY(x),ridgeY(x),localT)+Math.sin(x*1.4+phase)*.026+Math.sin(x*4.2-phase)*.008,z=cliffFrontZ(x,localT),edgeFade=Math.pow(Math.sin(Math.PI*q),.55),depth=(.032+.045*(.5+.5*Math.sin(x*1.6+phase)))*edgeFade,thickness=.026+.018*(.5+.5*Math.sin(x*2.2-phase));ledgePositions.push(x,y+.008,z+.006,x,y+.008,z+depth,x,y-thickness,z+depth*.74);ledgeColour.setHex(0x777064);const shade=.94+Math.sin(x*1.9+phase)*.035;ledgeColours.push(ledgeColour.r*.86,ledgeColour.g*.86,ledgeColour.b*.84,ledgeColour.r*shade,ledgeColour.g*shade,ledgeColour.b*shade,ledgeColour.r*.58,ledgeColour.g*.58,ledgeColour.b*.57)}for(let i=0;i<steps;i++){const a=start+i*3,b=a+3;ledgeIndices.push(a,b,a+1,a+1,b,b+1,a+1,b+1,a+2,a+2,b+1,b+2)}};const ledgeRuns=[{t:.23,r:[[-11.85,-9.35],[-7.95,-5.45],[-3.95,-1.35],[.35,2.65],[4.35,6.85],[8.25,11.75]]},{t:.51,r:[[-11.3,-8.85],[-6.95,-4.35],[-2.45,.05],[1.95,4.55],[6.35,8.75],[10.05,11.9]]},{t:.75,r:[[-11.9,-10.05],[-8.65,-6.25],[-4.65,-2.15],[-.55,1.8],[3.55,5.8],[7.45,9.6],[10.75,12.0]]}];let brokenRockLedges=0;ledgeRuns.forEach((band,bi)=>band.r.forEach(([x0,x1],ri)=>{appendLedge(band.t,x0,x1,bi*3+ri);brokenRockLedges++}));const ledgeGeo=new THREE.BufferGeometry();ledgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(ledgePositions,3));ledgeGeo.setAttribute('color',new THREE.Float32BufferAttribute(ledgeColours,3));ledgeGeo.setIndex(ledgeIndices);ledgeGeo.computeVertexNormals();cliff.add(new THREE.Mesh(ledgeGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.98,flatShading:true,side:THREE.DoubleSide})));
    const crackPositions=[],crackIndices=[],appendCrack=(points,width=.012)=>{const start=crackPositions.length/3,last=Math.max(1,points.length-1);for(let i=0;i<points.length;i++){const [x,t]=points[i],w=width*Math.pow(Math.max(0,1-i/last),.72),y=THREE.MathUtils.lerp(baseY(x),ridgeY(x),t),z=cliffFrontZ(x,t)+.024;crackPositions.push(x-w,y,z,x+w,y,z)}for(let i=0;i<points.length-1;i++){const a=start+i*2,b=a+2;crackIndices.push(a,b,a+1,a+1,b,b+1)}};const crackDefs=[[-11.32,.9,.47,-1],[-9.56,.74,.37,1],[-7.88,.87,.52,-1],[-5.35,.8,.42,1],[-3.82,.93,.58,-1],[-1.27,.71,.35,1],[.42,.86,.49,-1],[2.93,.76,.39,1],[5.14,.91,.55,-1],[7.62,.72,.36,1],[9.15,.84,.45,-1],[11.27,.92,.51,1]];crackDefs.forEach(([x,t0,t1,dir],i)=>{const main=[[x,t0],[x+dir*(.035+(i%3)*.018),t0-.13],[x-dir*(.07+(i%2)*.028),t0-.29],[x+dir*.045,t0-.43],[x+dir*.13,t1]];appendCrack(main,.008+(i%4)*.0014);if(i%3!==1)appendCrack([[main[2][0],main[2][1]],[main[2][0]-dir*(.12+(i%2)*.04),main[2][1]-.075],[main[2][0]-dir*(.25+(i%3)*.035),main[2][1]-.13]],.0055)});const crackGeo=new THREE.BufferGeometry();crackGeo.setAttribute('position',new THREE.Float32BufferAttribute(crackPositions,3));crackGeo.setIndex(crackIndices);const crackMat=new THREE.MeshStandardMaterial({color:0x2d302d,roughness:1,transparent:true,opacity:.74,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-3}),cracks=new THREE.Mesh(crackGeo,crackMat);cracks.renderOrder=4;cliff.add(cracks);
    const soilPositions=[],soilColours=[],soilIndices=[],soilColour=new THREE.Color();for(let ix=0;ix<cliffCols;ix++){const x=THREE.MathUtils.lerp(cliffMinX,cliffMaxX,ix/(cliffCols-1)),top=ridgeY(x),z=ridgeZ(x);soilPositions.push(x,top-.105,z+.012,x,top+.012,z-.006);soilColour.setHex(ix%3===0?0x493a28:ix%3===1?0x59452e:0x3f3528);soilColours.push(soilColour.r,soilColour.g,soilColour.b,soilColour.r*.88,soilColour.g*.9,soilColour.b*.8)}for(let ix=0;ix<cliffCols-1;ix++){const a=ix*2,b=a+2;soilIndices.push(a,b,a+1,a+1,b,b+1)}const soilGeo=new THREE.BufferGeometry();soilGeo.setAttribute('position',new THREE.Float32BufferAttribute(soilPositions,3));soilGeo.setAttribute('color',new THREE.Float32BufferAttribute(soilColours,3));soilGeo.setIndex(soilIndices);soilGeo.computeVertexNormals();cliff.add(new THREE.Mesh(soilGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true})));
    const capPositions=[],capColours=[],capIndices=[],capColour=new THREE.Color();for(let ix=0;ix<cliffCols;ix++){const x=THREE.MathUtils.lerp(cliffMinX,cliffMaxX,ix/(cliffCols-1)),top=ridgeY(x);capPositions.push(x,top+.014,ridgeZ(x)-.008,x,top+.045+Math.sin(x*1.31)*.014,-4.18);capColour.setHSL(.27+Math.sin(x)*.012,.5,.25+Math.sin(x*.48)*.028);capColours.push(capColour.r,capColour.g,capColour.b,capColour.r*.72,capColour.g*.84,capColour.b*.67)}for(let ix=0;ix<cliffCols-1;ix++){const a=ix*2,b=a+2;capIndices.push(a,b,a+1,a+1,b,b+1)}const capGeo=new THREE.BufferGeometry();capGeo.setAttribute('position',new THREE.Float32BufferAttribute(capPositions,3));capGeo.setAttribute('color',new THREE.Float32BufferAttribute(capColours,3));capGeo.setIndex(capIndices);capGeo.computeVertexNormals();const grassCap=new THREE.Mesh(capGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.98,side:THREE.DoubleSide}));cliff.add(grassCap);
    const cliffGrassCount=390,cliffGrassGeo=new THREE.PlaneGeometry(.022,.18,1,3);cliffGrassGeo.translate(0,.09,0);const cliffGrass=new THREE.InstancedMesh(cliffGrassGeo,new THREE.MeshStandardMaterial({color:0x668f42,roughness:.92,side:THREE.DoubleSide,vertexColors:true}),cliffGrassCount),cliffDummy=new THREE.Object3D();let cliffSeed=7319;const cliffRnd=()=>((cliffSeed=Math.imul(cliffSeed,1664525)+1013904223>>>0)/4294967296);for(let i=0;i<cliffGrassCount;i++){const x=cliffMinX+.1+cliffRnd()*(cliffMaxX-cliffMinX-.2),z=ridgeZ(x)-.04-cliffRnd()*1.15,scaleY=.62+cliffRnd()*.43;cliffDummy.position.set(x,ridgeY(x)+.018+cliffRnd()*.018,z);cliffDummy.rotation.set(0,cliffRnd()*Math.PI,(cliffRnd()-.5)*.13);cliffDummy.scale.set(.65+cliffRnd()*.55,scaleY,1);cliffDummy.updateMatrix();cliffGrass.setMatrixAt(i,cliffDummy.matrix);cliffGrass.setColorAt(i,new THREE.Color().setHSL(.23+cliffRnd()*.08,.48+cliffRnd()*.18,.31+cliffRnd()*.12))}cliffGrass.instanceMatrix.needsUpdate=true;cliffGrass.castShadow=false;cliff.add(cliffGrass);
    const lichenMeshes=[],cliffLichenPatches=48,lichenMats=[new THREE.MeshBasicMaterial({color:0x778553,transparent:true,opacity:.36,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),new THREE.MeshBasicMaterial({color:0xaa8d55,transparent:true,opacity:.3,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),new THREE.MeshBasicMaterial({color:0x9ba08c,transparent:true,opacity:.28,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})];for(let i=0;i<cliffLichenPatches;i++){const x=cliffMinX+.45+((i*43)%149)/148*(cliffMaxX-cliffMinX-.9),t=.1+((i*67)%97)/96*.8,y=THREE.MathUtils.lerp(baseY(x),ridgeY(x),t),patch=new THREE.Mesh(new THREE.CircleGeometry(.065+(i%5)*.012,8),lichenMats[i%lichenMats.length]);patch.position.set(x,y,cliffFrontZ(x,t)+.029);patch.rotation.z=i*.91;patch.scale.set(.7+(i%4)*.32,.42+(i%3)*.24,1);patch.renderOrder=3;cliff.add(patch);lichenMeshes.push(patch)}
    const toeMats=[0x4f5552,0x67645b,0x756c5f,0x5c5e58].map(color=>new THREE.MeshStandardMaterial({color,roughness:.98,flatShading:true})),toeBoulderCount=35;for(let i=0;i<toeBoulderCount;i++){const x=cliffMinX+.38+i*(cliffMaxX-cliffMinX-.76)/(toeBoulderCount-1)+Math.sin(i*2.7)*.15,r=.2+(i%5)*.045,sy=.62+(i%4)*.1,z=toeZ(x)+.03+Math.sin(i)*.045,boulder=new THREE.Mesh(new THREE.DodecahedronGeometry(r,1),toeMats[i%toeMats.length]);boulder.scale.set(1.2+(i%3)*.28,sy,.75+(i%2)*.18);boulder.rotation.set(i*.37,i*.83,i*.21);boulder.position.set(x,this.shoreHeight(x,z)+r*sy*.58,z);cliff.add(boulder)}
    cliff.updateMatrixWorld(true);const cliffBounds=new THREE.Box3().setFromObject(cliff);g.add(cliff);
    // Overscan the complete camera frustum in every direction.  The previous
    // 10.6 x 6.5 m rectangle exposed blue triangular wedges at compact widths.
    const shoreMinX=-13.5,shoreMaxX=13.5,shoreMinZ=-4.6,shoreMaxZ=7.4,shoreGeo=new THREE.BufferGeometry(),positions=[],colours=[],indices=[],cols=85,rows=51,colour=new THREE.Color();
    for(let rz=0;rz<rows;rz++){const z=THREE.MathUtils.lerp(shoreMinZ,shoreMaxZ,rz/(rows-1));for(let ix=0;ix<cols;ix++){const x=THREE.MathUtils.lerp(shoreMinX,shoreMaxX,ix/(cols-1)),y=this.shoreHeight(x,z),shoreward=Math.max(0,Math.min(1,(z+.2)/4.1)),dry=Math.max(0,Math.min(1,(1.9-z)/3.9)),mottle=Math.sin(x*1.71-z*2.13)*.027+Math.sin(x*.48+z*3.07)*.018;positions.push(x,y,z);colour.setHex(shoreward>.73?0x394b4c:shoreward>.36?0x5c625a:0x807565);colour.offsetHSL(Math.sin(x*.81+z*.34)*.008,-.015+dry*.018,mottle+dry*.014);colours.push(colour.r,colour.g,colour.b)}}
    for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const a=r*cols+c,b=a+1,d=(r+1)*cols+c,e=d+1;(r+c)%2?indices.push(a,d,b,b,d,e):indices.push(a,d,e,a,e,b)}shoreGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shoreGeo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));shoreGeo.setIndex(indices);shoreGeo.computeVertexNormals();const shore=new THREE.Mesh(shoreGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97,metalness:.01,flatShading:true}));shore.receiveShadow=true;g.add(shore);
    const shoreGravelCount=300,shoreGravelGeo=new THREE.DodecahedronGeometry(.038,0),shoreGravelMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.99,flatShading:true}),shoreGravel=new THREE.InstancedMesh(shoreGravelGeo,shoreGravelMat,shoreGravelCount),gravelDummy=new THREE.Object3D();let gravelSeed=91367;const gravelRnd=()=>((gravelSeed=Math.imul(gravelSeed,1664525)+1013904223>>>0)/4294967296);for(let i=0;i<shoreGravelCount;i++){let x,z;do{x=THREE.MathUtils.lerp(shoreMinX+.25,shoreMaxX-.25,gravelRnd());z=THREE.MathUtils.lerp(-3.75,6.7,gravelRnd())}while(Math.abs(x)<.88&&z>-1.35&&z<3.3);const scale=.52+gravelRnd()*1.28;gravelDummy.position.set(x,this.shoreHeight(x,z)+.014+scale*.006,z);gravelDummy.rotation.set(gravelRnd()*Math.PI,gravelRnd()*Math.PI,gravelRnd()*Math.PI);gravelDummy.scale.set(scale*(.8+gravelRnd()*.55),scale*(.34+gravelRnd()*.32),scale*(.7+gravelRnd()*.48));gravelDummy.updateMatrix();shoreGravel.setMatrixAt(i,gravelDummy.matrix);shoreGravel.setColorAt(i,new THREE.Color().setHSL(.09+gravelRnd()*.08,.05+gravelRnd()*.12,.3+gravelRnd()*.22))}shoreGravel.instanceMatrix.needsUpdate=true;shoreGravel.castShadow=false;shoreGravel.receiveShadow=true;g.add(shoreGravel);
    const poolDefs=[[-2.82,1.3,.76,.42,.4],[2.55,.86,.66,.36,1.7],[-1.72,2.52,.58,.32,2.8]], scatteredRocks=[]; for(let i=0;i<70&&scatteredRocks.length<54;i++){ const x=-4.7+((i*37)%101)/100*9.4,z=-1.65+((i*61)%103)/102*5.25;if(poolDefs.some(([px,pz,rx,rz])=>Math.pow((x-px)/(rx*1.18),2)+Math.pow((z-pz)/(rz*1.25),2)<1))continue;const y=this.shoreHeight(x,z),r=.09+(i%7)*.026,mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),new THREE.MeshStandardMaterial({color:i%3===0?0x4b5552:i%3===1?0x68665c:0x777064,roughness:.96,flatShading:true})); mesh.scale.set(1+(i%4)*.22,.65+(i%3)*.16,.8+(i%5)*.12);mesh.rotation.set(i*.73,i*1.11,i*.29);mesh.position.set(x,y+r*.3,z);g.add(mesh);scatteredRocks.push(mesh)}
    const pools=[],poolSeaweed=[]; poolDefs.forEach(([x,z,rx,rz,phase],pi)=>{const baseY=this.shoreHeight(x,z)+.035,outline=[];for(let j=0;j<44;j++){const a=j/44*Math.PI*2,noise=1+Math.sin(a*3+phase)*.13+Math.sin(a*7-phase*.7)*.065+Math.sin(a*11+phase)*.025;outline.push(new THREE.Vector2(Math.cos(a)*rx*noise,-Math.sin(a)*rz*noise))}const basinShape=new THREE.Shape(outline.map(p=>p.clone().multiplyScalar(1.08))),basin=new THREE.Mesh(new THREE.ShapeGeometry(basinShape),new THREE.MeshStandardMaterial({color:0x2d4441,roughness:.86,side:THREE.DoubleSide}));basin.rotation.x=-Math.PI/2;basin.position.set(x,baseY-.012,z);g.add(basin);const waterShape=new THREE.Shape(outline.map(p=>p.clone().multiplyScalar(.91))),pool=new THREE.Mesh(new THREE.ShapeGeometry(waterShape),new THREE.MeshPhysicalMaterial({color:0x3d9bb0,transparent:true,opacity:.64,roughness:.1,transmission:.2,clearcoat:.78,side:THREE.DoubleSide,depthWrite:false}));pool.rotation.x=-Math.PI/2;pool.position.set(x,baseY+.008,z);pool.renderOrder=4;g.add(pool);pools.push(pool);const rimPoints=outline.map(p=>new THREE.Vector3(p.x,0,-p.y)),rim=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPoints,true,'centripetal'),88,.028,8,true),new THREE.MeshStandardMaterial({color:0x3f514b,roughness:.94}));rim.position.set(x,baseY,z);g.add(rim);for(let s=0;s<10;s++){const a=s/10*Math.PI*2+phase*.17,p=outline[Math.floor((s/10)*outline.length)],stone=new THREE.Mesh(new THREE.DodecahedronGeometry(.045+(s%3)*.012,0),new THREE.MeshStandardMaterial({color:s%2?0x58645d:0x6d6b60,roughness:.98,flatShading:true}));stone.scale.set(1.25,.62,.82);stone.position.set(x+p.x,baseY+.022,z-p.y);stone.rotation.y=a;g.add(stone)}for(let c=0;c<4;c++){const clump=new THREE.Group(),cx=(c-1.5)*rx*.18+Math.sin(c+phase)*rx*.12,cz=Math.cos(c*1.8+phase)*rz*.22;for(let f=0;f<3;f++){const h=.13+(f+c%2)*.035,curve=new THREE.CatmullRomCurve3([new THREE.Vector3(cx,0,cz),new THREE.Vector3(cx+(f-1)*.018,h*.34,cz+.012),new THREE.Vector3(cx-(f-1)*.025,h*.7,cz+.025),new THREE.Vector3(cx+(f-1)*.016,h,cz+.04)],false,'centripetal'),frond=new THREE.Mesh(new THREE.TubeGeometry(curve,14,.009+f*.002,6,false),new THREE.MeshStandardMaterial({color:(f+c)%2?0x657431:0x806028,roughness:.82}));clump.add(frond)}const holdfast=new THREE.Mesh(new THREE.SphereGeometry(.035,10,6),new THREE.MeshStandardMaterial({color:0x55472b,roughness:.95}));holdfast.scale.y=.42;holdfast.position.set(cx,.012,cz);clump.add(holdfast);clump.position.set(x,baseY+.014,z);g.add(clump);poolSeaweed.push(clump)}});
    const stationZ=[-1.05,-.25,.55,1.35,2.15,2.95], organisms=[];
    const addHighlight=(mesh,si,species)=>{mesh.userData.station=si;mesh.userData.species=species;organisms.push(mesh);return mesh};
    stationZ.forEach((z,si)=>{ const data=[8,10,13,11,6,2][si]; for(let j=0;j<Math.min(data,8);j++){const a=j*2.399+si,r=.08+(j%4)*.09,x=Math.cos(a)*r,y=this.shoreHeight(x,z+Math.sin(a)*r),limpet=addHighlight(new THREE.Mesh(new THREE.ConeGeometry(.052,.07,18),new THREE.MeshStandardMaterial({color:0xb8aa91,roughness:.82,emissive:0x000000})),si,'limpet');limpet.position.set(x,y+.035,z+Math.sin(a)*r);g.add(limpet)} for(let j=0;j<5+Math.round((5-si)*.65);j++){const x=-.42+(j%4)*.26,zp=z-.3+Math.floor(j/4)*.24,y=this.shoreHeight(x,zp),barn=addHighlight(new THREE.Mesh(new THREE.ConeGeometry(.027,.045,9),new THREE.MeshStandardMaterial({color:0xd8d0bb,roughness:.9,emissive:0x000000})),si,'barnacle');barn.position.set(x,y+.022,zp);g.add(barn)} const frondCount=Math.max(0,si-1)*2;for(let j=0;j<frondCount;j++){const x=-.38+(j%5)*.18,zp=z-.25+Math.floor(j/5)*.23,y=this.shoreHeight(x,zp),curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,y,zp),new THREE.Vector3(x+.04,y+.14,zp+.03),new THREE.Vector3(x-.05,y+.29,zp+.07),new THREE.Vector3(x+.03,y+.43,zp+.12)]),frond=addHighlight(new THREE.Mesh(new THREE.TubeGeometry(curve,18,.018+(j%2)*.005,7,false),new THREE.MeshStandardMaterial({color:j%2?0x5f682c:0x6d5528,roughness:.72,emissive:0x000000})),si,'seaweed');g.add(frond)} });
    const tapeMat=new THREE.MeshPhysicalMaterial({color:0xffd63d,roughness:.32,metalness:.08,clearcoat:.5}), tapeSegments=[],tapeStart=stationZ[0]-.13,tapeEnd=stationZ[stationZ.length-1]+.13; for(const x of[-.62,.62])for(let i=0;i<40;i++){const z0=THREE.MathUtils.lerp(tapeStart,tapeEnd,i/40),z1=THREE.MathUtils.lerp(tapeStart,tapeEnd,(i+1)/40),a=new THREE.Vector3(x,this.shoreHeight(x,z0)+.08,z0),b=new THREE.Vector3(x,this.shoreHeight(x,z1)+.08,z1),seg=this.tubeBetween(a,b,.018,tapeMat);seg.visible=false;g.add(seg);tapeSegments.push({mesh:seg,fraction:(i+1)/40})}
    const reel=new THREE.Group(),reelRing=new THREE.Mesh(new THREE.TorusGeometry(.22,.035,12,48),new THREE.MeshPhysicalMaterial({color:0xf3c42f,metalness:.28,roughness:.28,clearcoat:.55}));reelRing.rotation.x=Math.PI/2;reel.add(reelRing);const reelHub=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.16,24),metal(0x4e6064,.22));reel.add(reelHub);reel.position.set(-.86,this.shoreHeight(-.86,-1.18)+.33,-1.18);g.add(reel);
    const quadrat=this.samplingQuadratFrame(1.02,0xcbd9db);g.add(quadrat);
    const waterDepth=12,waterUniforms={uTime:{value:0},uAlpha:{value:.72}},waterMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:waterUniforms,vertexShader:'uniform float uTime; varying float vWave; varying vec3 vPos; void main(){ vec3 p=position; float w=sin(p.x*1.45+uTime*2.4)*0.055+sin(p.z*2.2-uTime*1.65)*0.035+sin((p.x+p.z)*.72+uTime*.9)*0.028; p.y+=w; vWave=w; vPos=p; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }',fragmentShader:'uniform float uAlpha; varying float vWave; varying vec3 vPos; void main(){ float streak=.5+.5*sin(vPos.x*5.2+vPos.z*2.8+vWave*22.0); vec3 deep=vec3(.025,.29,.38); vec3 shallow=vec3(.12,.65,.72); vec3 c=mix(deep,shallow,.48+vWave*3.2)+pow(streak,18.0)*.24; gl_FragColor=vec4(c,uAlpha); }'}),water=new THREE.Mesh(new THREE.PlaneGeometry(22,waterDepth,88,56),waterMat);water.rotation.x=-Math.PI/2;water.renderOrder=5;g.add(water);
    const foamBands=[];for(let bi=0;bi<3;bi++){const pts=[];for(let i=0;i<=72;i++){const x=-11.2+i/72*22.4;pts.push(new THREE.Vector3(x,.24+bi*.008,Math.sin(x*1.7+bi)*.045+Math.sin(x*.53-bi)*.018))}const foam=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),144,.025-bi*.004,8,false),new THREE.MeshBasicMaterial({color:0xf4ffff,transparent:true,opacity:.68-bi*.12,depthWrite:false,toneMapped:false}));foam.renderOrder=7;g.add(foam);foamBands.push(foam)}
    const clouds=[];[[-3.4,4.05],[2.6,3.92]].forEach(([x,y],ci)=>{const cloud=new THREE.Group();for(let i=0;i<6;i++){const puff=new THREE.Mesh(new THREE.SphereGeometry(.34+(i%2)*.08,20,12),new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:.82,depthWrite:false}));puff.scale.set(1.35,.56,.3);puff.position.set((i-2.5)*.27,Math.sin(i*2)*.08,0);cloud.add(puff)}cloud.position.set(x,y,-4.82+ci*.025);g.add(cloud);clouds.push({group:cloud,baseX:x,phase:ci*2})});
    this.dynamic.push({kind:'rockyShoreSampling',tapeSegments,reel,quadrat,stationZ,organisms,poolSeaweed,water,waterDepth,waterUniforms,foamBands,clouds});Object.assign(g.userData,{rockyShore:true,cliffBackdrop:true,continuousCliffRidge:true,cliffTopGrass:true,realisticErodedCliff:true,cliffFaceGrid:[cliffCols,cliffRows],brokenRockLedges,recessedBranchedFissures:true,peatSoilEdge:true,cliffLichenPatches,cliffTopGrassBlades:cliffGrassCount,cliffMaximumY:+cliffBounds.max.y.toFixed(2),cliffWithinCameraFrame:cliffBounds.max.y<=3.02,cliffBoundsWorld:{x:[cliffMinX,cliffMaxX],maxY:+cliffBounds.max.y.toFixed(2)},supportedMaxSceneAspect:2.17,irregularRockPools:true,rockPools:pools.length,rockPoolSeaweedClumps:poolSeaweed.length,firstQuadratClearOfCliff:true,rockCount:scatteredRocks.length,shoreGravelCount,rockBeachFloorBoundsWorld:{x:[shoreMinX,shoreMaxX],z:[shoreMinZ,shoreMaxZ]},rockBeachFloorExtendsBeyondView:true,minimumCompactLateralOverdrawWorld:1.7,foregroundDepthOverdrawWorld:2.5,waterWorldDimensions:[22,waterDepth],foamWorldSpan:22.4,organismModels:organisms.length,beltLengthM:10,beltWidthM:1,incomingDetailedTide:true,laboratoryRoomHidden:true});const ready=shadowReady(g);cliffGrass.castShadow=false;shoreGravel.castShadow=false;water.castShadow=false;cracks.castShadow=false;cracks.receiveShadow=false;lichenMeshes.forEach(patch=>{patch.castShadow=false;patch.receiveShadow=false});pools.forEach(pool=>pool.castShadow=false);return ready
  }
  rippleTankRig(state) {
    const g = new THREE.Group(), tank = new THREE.Group(), aluminium = metal(0x9caeb4, .18), darkMetal = metal(0x344b54, .24), black = solid(0x142a33, .32), rubber = solid(0x17252a, .82), acrylic = new THREE.MeshPhysicalMaterial({ color: 0xd8f4fb, transparent: true, opacity: .34, transmission: .7, roughness: .035, ior: 1.48, thickness: .09, clearcoat: .7, clearcoatRoughness: .03, side: THREE.DoubleSide, depthWrite: false });
    const tankW = 5.32, tankD = 3.46, waterY = 1.23, tankBaseY = .98, glassMeshes = [];

    // A white screen below the transparent tray makes the moving light and
    // dark wave bands visible in the same way as a school ripple tank.
    const screen = new THREE.Mesh(roundedBox(5.68, .09, 3.86, .05), new THREE.MeshStandardMaterial({ color: 0xf8faf6, roughness: .9 }));
    screen.position.set(0, .105, .03); screen.receiveShadow = true; g.add(screen);
    const screenEdge = new THREE.LineSegments(new THREE.EdgesGeometry(screen.geometry), new THREE.LineBasicMaterial({ color: 0xaebdc1, transparent: true, opacity: .76 }));
    screenEdge.position.copy(screen.position); g.add(screenEdge);

    const waveUniforms = { uK: { value: 16 }, uRawPhase: { value: 0 }, uFrozenPhase: { value: 0 }, uStrobeMix: { value: 0 }, uAmplitude: { value: .036 }, uActive: { value: 0 } };
    const projectionUniforms = { uK: { value: 16 }, uRawPhase: { value: 0 }, uFrozenPhase: { value: 0 }, uStrobeMix: { value: 0 }, uActive: { value: 0 } };
    const commonVaryings = `
      uniform float uK; uniform float uRawPhase; uniform float uFrozenPhase; uniform float uStrobeMix; uniform float uActive;
      varying float vCrest; varying float vEnvelope;
      float envelopeAt(vec3 p) {
        float travel = p.z + 1.31;
        float sideFade = 1.0 - smoothstep(2.26, 2.56, abs(p.x));
        float launchFade = smoothstep(-0.03, 0.16, travel);
        float farFade = 1.0 - smoothstep(2.58, 2.93, travel);
        return sideFade * launchFade * farFade * exp(-0.045 * max(0.0, travel));
      }
      void crestValues(vec3 p) {
        float travel = p.z + 1.31;
        float rawTheta = uK * travel - uRawPhase;
        float frozenTheta = uK * travel - uFrozenPhase;
        float rawCrest = 0.5 + 0.5 * cos(rawTheta);
        float frozenCrest = 0.5 + 0.5 * cos(frozenTheta);
        vCrest = mix(rawCrest, frozenCrest, uStrobeMix);
        vEnvelope = envelopeAt(p) * uActive;
      }`;
    const waterMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: waveUniforms, vertexShader: `${commonVaryings}
      uniform float uAmplitude;
      void main(){ vec3 p=position; crestValues(p); float travel=p.z+1.31; float rawTheta=uK*travel-uRawPhase; float frozenTheta=uK*travel-uFrozenPhase; float fundamental=mix(sin(rawTheta),sin(frozenTheta),uStrobeMix); float harmonic=.13*mix(sin(2.0*rawTheta+.32),sin(2.0*frozenTheta+.32),uStrobeMix); p.y += uAmplitude*vEnvelope*(fundamental+harmonic); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`, fragmentShader: `varying float vCrest; varying float vEnvelope; void main(){ vec3 trough=vec3(.055,.42,.55); vec3 crest=vec3(.42,.86,.9); float highlight=pow(vCrest,10.0)*vEnvelope; vec3 colour=mix(trough,crest,.2+highlight*.78); colour += pow(vCrest,28.0)*vEnvelope*vec3(.4,.48,.5); gl_FragColor=vec4(colour,.54+.18*vEnvelope); }` });
    const waterGeo = new THREE.PlaneGeometry(5.08, 3.28, 96, 64); waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, waterMat); water.position.y = waterY; water.renderOrder = 9; tank.add(water);
    const projectionMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: projectionUniforms, vertexShader: `${commonVaryings}\nvoid main(){ crestValues(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`, fragmentShader: `varying float vCrest; varying float vEnvelope; void main(){ float band=smoothstep(.52,.98,vCrest)*vEnvelope; float dark=smoothstep(.0,.45,.5-vCrest)*vEnvelope; vec3 c=vec3(.82,.96,.97)*band-vec3(.18,.16,.12)*dark; gl_FragColor=vec4(clamp(c,0.0,1.0),.08+.72*max(band,dark)); }` });
    const projectionGeo = new THREE.PlaneGeometry(5.08, 3.28, 1, 1); projectionGeo.rotateX(-Math.PI / 2);
    const projection = new THREE.Mesh(projectionGeo, projectionMat); projection.position.y = .165; projection.renderOrder = 3; g.add(projection);

    const waterVolume = new THREE.Mesh(new THREE.BoxGeometry(5.08, .2, 3.28), new THREE.MeshPhysicalMaterial({ color: 0x45b8cd, transparent: true, opacity: .24, transmission: .35, roughness: .08, depthWrite: false }));
    waterVolume.position.y = waterY - .1; waterVolume.renderOrder = 6; tank.add(waterVolume); glassMeshes.push(waterVolume);
    const frontMeniscus = new THREE.Mesh(new THREE.BoxGeometry(5.02, .023, .027), new THREE.MeshBasicMaterial({ color: 0xb8f6ff, transparent: true, opacity: .82, depthWrite: false, toneMapped: false }));
    frontMeniscus.position.set(0, waterY + .006, tankD / 2 - .105); frontMeniscus.renderOrder = 11; tank.add(frontMeniscus);

    const trayFloor = new THREE.Mesh(new THREE.BoxGeometry(5.2, .055, 3.38), acrylic); trayFloor.position.y = tankBaseY; tank.add(trayFloor); glassMeshes.push(trayFloor);
    [[0, 1.18, -tankD / 2, tankW, .4, .085], [0, 1.18, tankD / 2, tankW, .4, .085], [-tankW / 2, 1.18, 0, .085, .4, tankD], [tankW / 2, 1.18, 0, .085, .4, tankD]].forEach(([x, y, z, w, h, d]) => { const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), acrylic); wall.position.set(x, y, z); wall.renderOrder = 12; tank.add(wall); glassMeshes.push(wall) });
    for (const z of [-tankD / 2, tankD / 2]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(tankW + .12, .07, .105), aluminium); rail.position.set(0, 1.4, z); tank.add(rail) }
    for (const x of [-tankW / 2, tankW / 2]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.105, .07, tankD), aluminium); rail.position.set(x, 1.4, 0); tank.add(rail) }

    const footScrews = [];
    for (const x of [-2.38, 2.38]) for (const z of [-1.5, 1.5]) {
      const pad = cylinder(.19, .09, rubber, 36); pad.position.set(x, .08, z); g.add(pad);
      const screwGroup = new THREE.Group(), stem = cylinder(.075, .75, aluminium, 24); stem.position.y = .38; screwGroup.add(stem);
      for (let i = 0; i < 7; i++) { const thread = new THREE.Mesh(new THREE.TorusGeometry(.083, .008, 6, 24), darkMetal); thread.rotation.x = Math.PI / 2; thread.position.y = .14 + i * .085; screwGroup.add(thread) }
      const thumb = cylinder(.17, .095, darkMetal, 32); thumb.position.y = .58; screwGroup.add(thumb); screwGroup.position.set(x, .1, z); g.add(screwGroup); footScrews.push(screwGroup)
    }

    // Spirit level and depth scale visibly confirm the two key controls.
    const spirit = new THREE.Group(), spiritShell = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .96, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xd6f7ec, transparent: true, opacity: .58, transmission: .45, roughness: .06, side: THREE.DoubleSide, depthWrite: false }));
    spiritShell.rotation.z = Math.PI / 2; spirit.add(spiritShell); const spiritLiquid = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .83, 28), new THREE.MeshPhysicalMaterial({ color: 0x9ed632, transparent: true, opacity: .7, roughness: .12 })); spiritLiquid.rotation.z = Math.PI / 2; spirit.add(spiritLiquid); const levelBubble = new THREE.Mesh(new THREE.SphereGeometry(.09, 24, 14), new THREE.MeshPhysicalMaterial({ color: 0xf6fff2, transparent: true, opacity: .86, transmission: .3, roughness: .06 })); levelBubble.scale.x = 1.35; spirit.add(levelBubble); spirit.position.set(-1.35, 1.52, 1.73); tank.add(spirit); glassMeshes.push(spiritShell);
    for (const x of [-.18, .18]) { const mark = new THREE.Mesh(new THREE.BoxGeometry(.018, .18, .015), darkMetal); mark.position.set(x, 0, .096); spirit.add(mark) }
    const depthGauge = new THREE.Group(), gaugeBack = new THREE.Mesh(new THREE.BoxGeometry(.24, .62, .035), new THREE.MeshPhysicalMaterial({ color: 0xf7faf5, transparent: true, opacity: .72, roughness: .25 })); gaugeBack.position.y = .31; depthGauge.add(gaugeBack); for (let i = 0; i <= 10; i++) { const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 5 === 0 ? .17 : .1, .009, .02), darkMetal); tick.position.set(.03, .06 + i * .048, .026); depthGauge.add(tick) } depthGauge.position.set(-2.37, .94, 1.62); tank.add(depthGauge);

    // Porous absorber strips suppress reflected waves at the far and side edges.
    const spongeMat = new THREE.MeshStandardMaterial({ color: 0x234f5a, roughness: .98, flatShading: true }), absorber = new THREE.Group(), absorberCore = new THREE.Mesh(new THREE.BoxGeometry(4.76, .16, .25), spongeMat); absorberCore.position.set(0, waterY + .005, 1.47); absorber.add(absorberCore);
    for (let i = 0; i < 33; i++) { const pore = new THREE.Mesh(new THREE.DodecahedronGeometry(.045 + (i % 3) * .009, 0), spongeMat); pore.position.set(-2.28 + i / 32 * 4.56, waterY + .09 + (i % 2) * .018, 1.38 + Math.sin(i * 2.2) * .035); absorber.add(pore) } tank.add(absorber);

    // Motor bridge, eccentric crank and a straight dipper produce plane waves.
    const bridge = new THREE.Group();
    for (const x of [-2.42, 2.42]) { const post = cylinder(.055, 1.6, aluminium, 24); post.position.set(x, 2.18, -1.54); bridge.add(post); const bracket = new THREE.Mesh(new THREE.BoxGeometry(.28, .18, .28), darkMetal); bracket.position.set(x, 2.64, -1.54); bridge.add(bracket) }
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(5.0, .11, .15), aluminium); crossbar.position.set(0, 2.74, -1.54); bridge.add(crossbar);
    const motorBody = new THREE.Mesh(roundedBox(.92, .58, .58, .09), new THREE.MeshPhysicalMaterial({ color: 0x183642, roughness: .3, metalness: .26, clearcoat: .55 })); motorBody.position.set(0, 2.48, -1.48); bridge.add(motorBody);
    const motorBand = new THREE.Mesh(new THREE.BoxGeometry(.94, .1, .6), metal(0x7d939a, .2)); motorBand.position.set(0, 2.48, -1.48); bridge.add(motorBand);
    const motorWheel = new THREE.Group(), wheel = cylinder(.25, .075, darkMetal, 48); wheel.rotation.x = Math.PI / 2; motorWheel.add(wheel); const drivePin = new THREE.Mesh(new THREE.SphereGeometry(.055, 20, 12), metal(0xd5e0e2, .12)); drivePin.position.set(.15, 0, .052); motorWheel.add(drivePin); motorWheel.position.set(0, 2.43, -1.16); bridge.add(motorWheel);
    const guide = cylinder(.14, .36, darkMetal, 32); guide.position.set(0, 1.84, -1.28); bridge.add(guide); const guideHole = cylinder(.07, .38, rubber, 24); guideHole.position.set(0, 1.84, -1.28); bridge.add(guideHole);
    const dipperGroup = new THREE.Group(), dipper = new THREE.Mesh(new THREE.BoxGeometry(4.25, .075, .09), new THREE.MeshPhysicalMaterial({ color: 0xc8d4d7, metalness: .72, roughness: .2, clearcoat: .4 })); dipper.position.set(0, 0, 0); dipperGroup.add(dipper); const slider = cylinder(.052, .74, aluminium, 24); slider.position.set(0, .39, 0); dipperGroup.add(slider); dipperGroup.position.set(0, waterY + .015, -1.28); bridge.add(dipperGroup);
    const driveRod = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1, 16), metal(0xbec9cc, .16)); bridge.add(driveRod); tank.add(bridge);

    // Overhead LED/strobe head. Only the small wheel and indicator pulse;
    // the whole canvas never flashes at 4–8 Hz.
    const lamp = new THREE.Group(), lampBase = new THREE.Mesh(new THREE.CylinderGeometry(.45, .53, .14, 56), black); lampBase.position.set(-3.35, .12, -1.25); lamp.add(lampBase); const lampPost = cylinder(.075, 3.25, darkMetal, 28); lampPost.position.set(-3.35, 1.76, -1.25); lamp.add(lampPost); const lampArm = this.tubeBetween(new THREE.Vector3(-3.35, 3.35, -1.25), new THREE.Vector3(-.72, 3.35, -.66), .07, darkMetal); lamp.add(lampArm);
    const lampHead = new THREE.Mesh(roundedBox(2.15, .18, 1.0, .08), new THREE.MeshPhysicalMaterial({ color: 0xe8ece7, roughness: .28, metalness: .15, clearcoat: .5 })); lampHead.position.set(.15, 3.2, -.52); lampHead.rotation.z = -.02; lamp.add(lampHead); const lampPanelMat = new THREE.MeshStandardMaterial({ color: 0xf4ffff, emissive: 0xc9f7ff, emissiveIntensity: .35, roughness: .22 }); const lampPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.78, .72), lampPanelMat); lampPanel.rotation.x = Math.PI / 2; lampPanel.position.set(.15, 3.095, -.43); lamp.add(lampPanel);
    const strobeWheel = new THREE.Group(), wheelDisc = cylinder(.32, .065, black, 48); wheelDisc.rotation.x = Math.PI / 2; strobeWheel.add(wheelDisc); for (let i = 0; i < 12; i++) { const slot = new THREE.Mesh(new THREE.BoxGeometry(.055, .24, .018), new THREE.MeshBasicMaterial({ color: 0xc7f4fb, toneMapped: false })); slot.position.set(Math.cos(i * Math.PI / 6) * .18, Math.sin(i * Math.PI / 6) * .18, .04); slot.rotation.z = i * Math.PI / 6; strobeWheel.add(slot) } strobeWheel.position.set(-1.75, 3.17, -.11); lamp.add(strobeWheel);
    const strobeLed = new THREE.Mesh(new THREE.SphereGeometry(.055, 18, 10), new THREE.MeshStandardMaterial({ color: 0x4d696e, emissive: 0x79efff, emissiveIntensity: .1 })); strobeLed.position.set(-1.35, 3.17, -.1); lamp.add(strobeLed); const strobeLight = new THREE.SpotLight(0xdafaff, 2.4, 8, .88, .58, 1.1); strobeLight.position.set(.15, 3.02, -.43); const strobeTarget = new THREE.Object3D(); strobeTarget.position.set(0, 1, .08); lamp.add(strobeLight, strobeTarget); strobeLight.target = strobeTarget; g.add(lamp);

    const makeDisplay = (w, h) => { const canvas = document.createElement('canvas'), context = canvas.getContext('2d'); canvas.width = w; canvas.height = h; const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return { canvas, context, texture, lastKey: '' } };
    const generatorDisplay = makeDisplay(640, 240), generator = new THREE.Group(), generatorBody = new THREE.Mesh(roundedBox(1.55, .92, .72, .09), new THREE.MeshPhysicalMaterial({ color: 0x1c3540, roughness: .34, metalness: .2, clearcoat: .42 })); generatorBody.position.y = .52; generator.add(generatorBody); const generatorScreen = new THREE.Mesh(new THREE.PlaneGeometry(.91, .43), new THREE.MeshBasicMaterial({ map: generatorDisplay.texture, toneMapped: false })); generatorScreen.position.set(-.22, .6, .366); generator.add(generatorScreen); const frequencyKnob = cylinder(.18, .14, metal(0xb7c4c7, .18), 48); frequencyKnob.rotation.x = Math.PI / 2; frequencyKnob.position.set(.5, .62, .42); generator.add(frequencyKnob); for (let i = 0; i < 12; i++) { const notch = new THREE.Mesh(new THREE.BoxGeometry(.018, .065, .02), darkMetal); const a = i / 12 * Math.PI * 2; notch.position.set(.5 + Math.cos(a) * .19, .62 + Math.sin(a) * .19, .493); notch.rotation.z = a; generator.add(notch) } for (const [x, colour] of [[.37, 0xe94f55], [.64, 0x17252a]]) { const socket = cylinder(.07, .055, solid(colour, .35), 28); socket.rotation.x = Math.PI / 2; socket.position.set(x, .25, .4); generator.add(socket) } const generatorLed = new THREE.Mesh(new THREE.SphereGeometry(.045, 16, 9), new THREE.MeshStandardMaterial({ color: 0x4b6267, emissive: 0x72ffd4, emissiveIntensity: .1 })); generatorLed.position.set(-.64, .24, .4); generator.add(generatorLed); generator.position.set(3.35, .1, .66); generator.rotation.y = -.07; g.add(generator);
    const leadCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(3.67, .37, .93), new THREE.Vector3(2.85, .19, .35), new THREE.Vector3(2.45, .34, -1.55), new THREE.Vector3(.43, 2.43, -1.48)], false, 'centripetal'); const lead = new THREE.Mesh(new THREE.TubeGeometry(leadCurve, 64, .035, 9, false), new THREE.MeshStandardMaterial({ color: 0xc9484c, roughness: .82 })); g.add(lead);

    // The transparent ruler glides in only after the strobe has made the
    // wavefronts appear stationary. Its 0–60 cm scale is one texture, keeping
    // every tick crisp without dozens of meshes.
    const rulerCanvas = document.createElement('canvas'), rc = rulerCanvas.getContext('2d'); rulerCanvas.width = 360; rulerCanvas.height = 2048; rc.clearRect(0, 0, 360, 2048); rc.fillStyle = 'rgba(235,250,252,.58)'; rc.fillRect(0, 0, 360, 2048); rc.strokeStyle = '#19343f'; rc.lineWidth = 8; rc.beginPath(); rc.moveTo(65, 35); rc.lineTo(65, 2013); rc.stroke(); rc.fillStyle = '#19343f'; rc.font = '700 58px ui-monospace, Menlo, monospace'; rc.textAlign = 'left'; rc.textBaseline = 'middle'; for (let i = 0; i <= 60; i++) { const yy = 35 + i / 60 * 1978, major = i % 10 === 0, mid = i % 5 === 0; rc.fillRect(65, yy - 3, major ? 135 : mid ? 102 : 68, 6); if (major) rc.fillText(String(i), 215, yy) } const rulerTexture = new THREE.CanvasTexture(rulerCanvas); rulerTexture.colorSpace = THREE.SRGBColorSpace; rulerTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); const rulerGroup = new THREE.Group(), rulerPlate = new THREE.Mesh(new THREE.BoxGeometry(.52, .025, 3.3), new THREE.MeshPhysicalMaterial({ color: 0xdaf6fa, transparent: true, opacity: .45, transmission: .35, roughness: .08, depthWrite: false })); rulerGroup.add(rulerPlate); const rulerFace = new THREE.Mesh(new THREE.PlaneGeometry(.5, 3.28), new THREE.MeshBasicMaterial({ map: rulerTexture, transparent: true, depthWrite: false, toneMapped: false })); rulerFace.rotation.x = -Math.PI / 2; rulerFace.position.y = .018; rulerFace.rotation.z = Math.PI; rulerGroup.add(rulerFace); rulerGroup.position.set(3.5, 1.48, .02); g.add(rulerGroup); glassMeshes.push(rulerPlate, rulerFace);
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0x1ed8c1, transparent: true, opacity: .94, depthWrite: false, toneMapped: false }), startCursor = new THREE.Group(), endCursor = new THREE.Group(); for (const cursor of [startCursor, endCursor]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(.66, .045, .035), cursorMat); bar.position.y = .075; cursor.add(bar); const point = new THREE.Mesh(new THREE.ConeGeometry(.07, .16, 18), cursorMat); point.rotation.x = Math.PI; point.position.set(0, .17, 0); cursor.add(point); rulerGroup.add(cursor) } startCursor.position.z = -1.2; endCursor.position.z = -1.2;
    const crestMarkers = []; for (let i = 0; i <= 10; i++) { const marker = new THREE.Mesh(new THREE.SphereGeometry(.035, 16, 9), new THREE.MeshBasicMaterial({ color: i === 0 || i === 10 ? 0xffd65a : 0xefffff, transparent: true, opacity: .92, depthWrite: false, toneMapped: false })); marker.position.set(-.27, .1, -1.2); marker.visible = false; rulerGroup.add(marker); crestMarkers.push(marker) }

    tank.position.set(-.25, 0, 0); g.add(tank);
    const prepared = shadowReady(g); water.castShadow = water.receiveShadow = projection.castShadow = projection.receiveShadow = false; waterVolume.castShadow = false; frontMeniscus.castShadow = false; lampPanel.castShadow = false; rulerFace.castShadow = false; for (const mesh of glassMeshes) { mesh.castShadow = false; mesh.receiveShadow = false }
    this.dynamic.push({ kind: 'rippleTank', tank, footScrews, levelBubble, waveUniforms, projectionUniforms, water, projection, motorWheel, drivePin, driveRod, dipperGroup, lampPanelMat, strobeWheel, strobeLed, strobeLight, generatorDisplay, generatorLed, frequencyKnob, rulerGroup, startCursor, endCursor, crestMarkers, frozenPhase: 0, previousStage: -1, rulerStartZ: -1.2, rulerScenePerCm: 3.28 / 60 });
    Object.assign(g.userData, { rippleTankRig: true, openAcrylicTray: true, visibleShallowWater: true, waterDepthCm: 1.5, adjustableFeet: 4, straightDipper: true, planeWaveShader: true, projectedWavefronts: true, strobeWithoutFullScreenFlashing: true, absorbingFoam: true, rulerSpanCm: 60, measuredWavelengthCount: 10 });
    return prepared
  }
  newton2Rig(state) {
    const g = new THREE.Group();
    const pos = state.newtonPos || 0;
    const force = state.newtonForce || 0.2;

    // 1. Solid Heavy Metallic Support Pillars elevating the runway to height y = 1.0
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.8, roughness: 0.25 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.42), pillarMat);
    legL.position.set(-1.6, 0.55, 0);
    g.add(legL);

    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.42), pillarMat);
    legR.position.set(1.6, 0.55, 0);
    g.add(legR);

    // 2. Elevated Extruded Aluminum Runway Track at y = 1.0
    const trackMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.85, roughness: 0.2 });
    const track = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.38), trackMat);
    track.position.set(0, 1.0, 0);
    g.add(track);

    // Side guide rails
    const railMat = new THREE.MeshStandardMaterial({ color: 0x0288d1, roughness: 0.3 });
    [-0.18, 0.18].forEach(rz => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.03, 0.02), railMat);
      rail.position.set(0, 1.05, rz);
      g.add(rail);
    });

    // 3. End Pulley Assembly with a compact 45-degree overhanging arm at right end of runway
    const pulleyGroup = new THREE.Group();
    const clampMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.8, roughness: 0.3 });
    const pClamp = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.20), clampMat);
    pClamp.position.set(2.04, 1.02, 0);
    pulleyGroup.add(pClamp);

    // Compact 45-degree Angled Pole (length = 0.22)
    const armMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.85, roughness: 0.2 });
    const pArm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 16), armMat);
    pArm.rotation.z = -Math.PI / 4; // 45 degrees up and right
    pArm.position.set(2.12, 1.12, 0);
    pulleyGroup.add(pArm);

    // Pulley Wheel & Axle at top of angled pole (x = 2.20, y = 1.20)
    const wheelCenter = new THREE.Vector3(2.20, 1.20, 0);
    const pWheelMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.3 });
    const pWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 24), pWheelMat);
    pWheel.rotation.x = Math.PI / 2;
    pWheel.position.copy(wheelCenter);
    pulleyGroup.add(pWheel);

    const axleMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.9, roughness: 0.1 });
    const pAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 12), axleMat);
    pAxle.position.copy(wheelCenter);
    pulleyGroup.add(pAxle);

    g.add(pulleyGroup);

    // 4. Two proper U-shaped IR light gates, both wired to one two-channel logger.
    const gateXs = [-0.6, 1.0], gateProgress = gateXs.map(gx => (gx + 1.8) / 3.5);
    const gateMat = new THREE.MeshPhysicalMaterial({ color: 0xe63d45, roughness: 0.28, clearcoat: 0.72, clearcoatRoughness: 0.16 });
    const gateDark = new THREE.MeshStandardMaterial({ color: 0x641820, roughness: 0.46 });
    const gateFootMat = new THREE.MeshPhysicalMaterial({ color: 0x34474f, metalness: 0.48, roughness: 0.34, clearcoat: 0.28 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff685f, transparent: true, opacity: 0.24, depthWrite: false, toneMapped: false });
    const gateConnectors = [];
    gateXs.forEach((gx, index) => {
      const gate = new THREE.Group();
      const foot = new THREE.Mesh(roundedBox(0.22, 0.055, 0.74, 0.025, 4), gateFootMat);
      foot.position.set(gx, 1.075, 0);
      gate.add(foot);
      for (const z of [-0.29, 0.29]) {
        const upright = new THREE.Mesh(roundedBox(0.095, 0.48, 0.105, 0.026, 5), gateMat);
        upright.position.set(gx, 1.32, z);
        gate.add(upright);
      }
      const bridge = new THREE.Mesh(roundedBox(0.105, 0.105, 0.68, 0.03, 5), gateMat);
      bridge.position.set(gx, 1.56, 0);
      gate.add(bridge);
      const emitter = cylinder(0.034, 0.045, new THREE.MeshBasicMaterial({ color: 0xffd15c, emissive: 0xff4a38, emissiveIntensity: 1.1, toneMapped: false }), 24);
      emitter.rotation.x = Math.PI / 2;
      emitter.position.set(gx, 1.35, 0.226);
      gate.add(emitter);
      const receiver = cylinder(0.039, 0.045, gateDark, 24);
      receiver.rotation.x = Math.PI / 2;
      receiver.position.set(gx, 1.35, -0.226);
      gate.add(receiver);
      const beam = cylinder(0.008, 0.43, beamMat, 12);
      beam.rotation.x = Math.PI / 2;
      beam.position.set(gx, 1.35, 0);
      beam.renderOrder = 8;
      gate.add(beam);
      const socket = cylinder(0.045, 0.052, gateDark, 24);
      socket.rotation.x = Math.PI / 2;
      socket.position.set(gx, 1.18, 0.365);
      gate.add(socket);
      gateConnectors.push(new THREE.Vector3(gx, 1.18, 0.395));

      const numberCanvas = document.createElement('canvas'), numberContext = numberCanvas.getContext('2d');
      numberCanvas.width = 128; numberCanvas.height = 128;
      numberContext.fillStyle = '#fffaf2'; numberContext.beginPath(); numberContext.arc(64, 64, 52, 0, Math.PI * 2); numberContext.fill();
      numberContext.fillStyle = '#7b1d25'; numberContext.font = '800 72px Inter, system-ui, sans-serif'; numberContext.textAlign = 'center'; numberContext.textBaseline = 'middle'; numberContext.fillText(String(index + 1), 64, 68);
      const numberTexture = new THREE.CanvasTexture(numberCanvas); numberTexture.colorSpace = THREE.SRGBColorSpace;
      const numberBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.105), new THREE.MeshBasicMaterial({ map: numberTexture, transparent: true, depthWrite: false, toneMapped: false }));
      numberBadge.position.set(gx, 1.56, 0.346); numberBadge.renderOrder = 9; gate.add(numberBadge);
      g.add(gate);
    });

    const v1 = Number.isFinite(state.newtonGate1Velocity) ? state.newtonGate1Velocity : null;
    const v2 = Number.isFinite(state.newtonGate2Velocity) ? state.newtonGate2Velocity : null;
    const loggerCanvas = document.createElement('canvas'), loggerContext = loggerCanvas.getContext('2d');
    loggerCanvas.width = 768; loggerCanvas.height = 360;
    const screenGradient = loggerContext.createLinearGradient(0, 0, 0, loggerCanvas.height);
    screenGradient.addColorStop(0, '#102f38'); screenGradient.addColorStop(1, '#071a22');
    loggerContext.fillStyle = screenGradient; loggerContext.fillRect(0, 0, loggerCanvas.width, loggerCanvas.height);
    loggerContext.fillStyle = '#8aa9b0'; loggerContext.font = '700 34px Inter, system-ui, sans-serif'; loggerContext.textAlign = 'left'; loggerContext.textBaseline = 'middle';
    loggerContext.fillText('DUAL LIGHT GATE  •  VELOCITY', 40, 42);
    loggerContext.strokeStyle = '#315660'; loggerContext.lineWidth = 3; loggerContext.beginPath(); loggerContext.moveTo(38, 73); loggerContext.lineTo(730, 73); loggerContext.stroke();
    const drawLoggerRow = (label, value, y, active) => {
      loggerContext.fillStyle = active ? '#78ffe0' : '#527078'; loggerContext.beginPath(); loggerContext.arc(56, y, 10, 0, Math.PI * 2); loggerContext.fill();
      loggerContext.fillStyle = '#dffcff'; loggerContext.font = '800 78px ui-monospace, SFMono-Regular, Menlo, monospace'; loggerContext.fillText(label, 92, y + 2);
      loggerContext.fillStyle = active ? '#8dffe5' : '#67838a'; loggerContext.textAlign = 'right'; loggerContext.fillText(active ? value.toFixed(2) : '—.——', 588, y + 2);
      loggerContext.fillStyle = '#9fc1c7'; loggerContext.font = '700 34px Inter, system-ui, sans-serif'; loggerContext.fillText('m s⁻¹', 716, y + 4);
      loggerContext.textAlign = 'left';
    };
    drawLoggerRow('v₁', v1, 158, v1 !== null);
    drawLoggerRow('v₂', v2, 282, v2 !== null);
    const loggerTexture = new THREE.CanvasTexture(loggerCanvas); loggerTexture.colorSpace = THREE.SRGBColorSpace; loggerTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); loggerTexture.needsUpdate = true;
    const logger = new THREE.Group(), loggerBodyMat = new THREE.MeshPhysicalMaterial({ color: 0xe4e9e8, roughness: 0.34, metalness: 0.08, clearcoat: 0.62, clearcoatRoughness: 0.18 });
    const loggerBody = new THREE.Mesh(roundedBox(1.54, 0.82, 0.48, 0.11, 7), loggerBodyMat); loggerBody.position.y = 0.43; logger.add(loggerBody);
    const loggerBezel = new THREE.Mesh(roundedBox(1.30, 0.61, 0.045, 0.055, 5), new THREE.MeshStandardMaterial({ color: 0x12272e, roughness: 0.42 })); loggerBezel.position.set(0, 0.49, 0.263); logger.add(loggerBezel);
    const loggerScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.51), new THREE.MeshBasicMaterial({ map: loggerTexture, toneMapped: false, depthTest: true, depthWrite: false })); loggerScreen.position.set(0, 0.49, 0.318); loggerScreen.renderOrder = 10; logger.add(loggerScreen);
    const loggerFeetMat = new THREE.MeshStandardMaterial({ color: 0x26373d, roughness: 0.76 });
    for (const x of [-0.55, 0.55]) { const foot = new THREE.Mesh(roundedBox(0.23, 0.06, 0.28, 0.025, 3), loggerFeetMat); foot.position.set(x, 0.035, -0.02); logger.add(foot) }
    const loggerPosition = new THREE.Vector3(-0.28, 0.05, 1.14); logger.position.copy(loggerPosition); g.add(logger);

    const loggerPorts = [-0.42, 0.42].map(x => new THREE.Vector3(loggerPosition.x + x, loggerPosition.y + 0.13, loggerPosition.z + 0.315));
    const cableColours = [0x26343a, 0x31576b];
    loggerPorts.forEach((port, index) => {
      const portRing = cylinder(0.057, 0.044, new THREE.MeshStandardMaterial({ color: index ? 0x3b7188 : 0x26363d, metalness: 0.35, roughness: 0.4 }), 28);
      portRing.rotation.x = Math.PI / 2; portRing.position.copy(port); g.add(portRing);
      const start = gateConnectors[index];
      const cableCurve = new THREE.CatmullRomCurve3([
        start,
        new THREE.Vector3(start.x + (index ? 0.2 : -0.2), 0.82, 0.58),
        new THREE.Vector3(index ? 0.72 : -1.02, 0.16, 1.22),
        new THREE.Vector3(port.x, 0.14, port.z - 0.03),
        port
      ], false, 'centripetal');
      const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 72, 0.022, 10, false), new THREE.MeshStandardMaterial({ color: cableColours[index], roughness: 0.86, metalness: 0.02 }));
      cable.castShadow = true; cable.receiveShadow = true; cable.userData.connectsGateToSharedLogger = index + 1; g.add(cable);
    });

    // 5. Rounded dynamics trolley with four rubber wheels, bumpers and a timing card.
    const trolleyX = -1.8 + pos * 3.5;
    const trolleyGroup = new THREE.Group();
    const chassisMat = new THREE.MeshPhysicalMaterial({ color: 0x168fc2, roughness: 0.24, metalness: 0.12, clearcoat: 0.88, clearcoatRoughness: 0.12 });
    const chassis = new THREE.Mesh(roundedBox(0.62, 0.16, 0.33, 0.065, 7), chassisMat);
    chassis.position.y = 1.15;
    trolleyGroup.add(chassis);

    const deck = new THREE.Mesh(roundedBox(0.47, 0.04, 0.26, 0.026, 5), new THREE.MeshPhysicalMaterial({ color: 0x78d6eb, roughness: 0.22, clearcoat: 0.78 }));
    deck.position.y = 1.25; trolleyGroup.add(deck);
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x26373e, roughness: 0.76 });
    for (const x of [-0.33, 0.33]) { const bumper = new THREE.Mesh(roundedBox(0.075, 0.095, 0.30, 0.031, 4), bumperMat); bumper.position.set(x, 1.135, 0); trolleyGroup.add(bumper) }

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.5 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xc7d0d3, metalness: 0.88, roughness: 0.2 });
    [[-0.20, -0.178], [-0.20, 0.178], [0.20, -0.178], [0.20, 0.178]].forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 28), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 1.075, wz);
      trolleyGroup.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.045, 20), hubMat);
      hub.rotation.x = Math.PI / 2; hub.position.set(wx, 1.075, wz); trolleyGroup.add(hub);
    });

    // 2 Stacked Mass Disks for Constant 1.0 kg Mass
    const weightMat = new THREE.MeshStandardMaterial({ color: 0x78909c, metalness: 0.7, roughness: 0.3 });
    for (let w = 0; w < 2; w++) {
      const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.046, 36), weightMat);
      weight.position.set(0.14, 1.295 + w * 0.05, 0);
      trolleyGroup.add(weight);
    }
    const card = new THREE.Mesh(roundedBox(0.19, 0.27, 0.022, 0.016, 4), new THREE.MeshPhysicalMaterial({ color: 0xf8faf4, roughness: 0.5, clearcoat: 0.22, side: THREE.DoubleSide }));
    card.position.set(-0.12, 1.405, 0); trolleyGroup.add(card);
    const cardStripe = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.04), new THREE.MeshBasicMaterial({ color: 0x263b45, toneMapped: false }));
    cardStripe.position.set(-0.12, 1.415, 0.013); cardStripe.renderOrder = 8; trolleyGroup.add(cardStripe);
    trolleyGroup.position.x = trolleyX;
    g.add(trolleyGroup);

    // 6. Connecting String & Descending Mass Hanger
    // String drops vertically from the rightmost edge of pulley wheel (x = 2.29)
    const stringDropX = 2.29;
    const stringTopY = 1.29;
    const stringDropY = 1.20;
    const hangerY = 1.05 - pos * 0.65;
    const holderBaseY = hangerY - 0.15;
    const hookY = holderBaseY + 0.27;

    const stringMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const stringGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(trolleyX + 0.33, 1.12, 0),
      new THREE.Vector3(wheelCenter.x, stringTopY, 0),
      new THREE.Vector3(stringDropX, stringDropY, 0),
      new THREE.Vector3(stringDropX, hookY, 0)
    ]);
    const stringLine = new THREE.Line(stringGeo, stringMat);
    g.add(stringLine);

    // School-lab slotted mass set: a 10 g central carrier plus separate 10 g masses.
    const hangerGroup = new THREE.Group();
    const holderMat = new THREE.MeshStandardMaterial({ color: 0xc7cdd0, metalness: 0.9, roughness: 0.2 });
    const massMat = new THREE.MeshStandardMaterial({ color: 0x87939a, metalness: 0.82, roughness: 0.28 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x45545c, metalness: 0.88, roughness: 0.24 });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.022, 40), holderMat);
    platform.position.set(stringDropX, holderBaseY, 0);
    hangerGroup.add(platform);
    const underside = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.055, 28), darkMetal);
    underside.position.set(stringDropX, holderBaseY - 0.038, 0);
    hangerGroup.add(underside);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.235, 20), holderMat);
    stem.position.set(stringDropX, holderBaseY + 0.13, 0);
    hangerGroup.add(stem);
    const topCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.023, 0.035, 24), darkMetal);
    topCollar.position.set(stringDropX, holderBaseY + 0.245, 0);
    hangerGroup.add(topCollar);
    const hookRing = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.006, 12, 28), holderMat);
    hookRing.position.set(stringDropX, hookY, 0);
    hangerGroup.add(hookRing);

    const slottedMassCount = Math.max(0, Math.min(4, Math.round(force * 10) - 1));
    const outerRadius = 0.122, innerRadius = 0.031, slotHalfWidth = 0.015;
    const outerAngle = Math.asin(slotHalfWidth / outerRadius), innerAngle = Math.asin(slotHalfWidth / innerRadius);
    const slottedShape = new THREE.Shape();
    slottedShape.moveTo(Math.cos(outerAngle) * outerRadius, slotHalfWidth);
    for (let i = 1; i <= 40; i++) {
      const angle = outerAngle + (Math.PI * 2 - outerAngle * 2) * i / 40;
      slottedShape.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
    }
    slottedShape.lineTo(Math.cos(innerAngle) * innerRadius, -slotHalfWidth);
    for (let i = 1; i <= 24; i++) {
      const angle = -innerAngle - (Math.PI * 2 - innerAngle * 2) * i / 24;
      slottedShape.lineTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
    }
    slottedShape.closePath();
    for (let i = 0; i < slottedMassCount; i++) {
      const geometry = new THREE.ExtrudeGeometry(slottedShape, { depth: 0.027, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.004, bevelThickness: 0.003, curveSegments: 32 });
      geometry.center();
      geometry.rotateX(Math.PI / 2);
      const slottedMass = new THREE.Mesh(geometry, massMat);
      slottedMass.position.set(stringDropX, holderBaseY + 0.025 + i * 0.033, 0);
      slottedMass.rotation.y = -Math.PI / 2;
      slottedMass.userData.slottedMassGrams = 10;
      hangerGroup.add(slottedMass);
    }
    hangerGroup.userData.massHolder = { holderMassGrams: 10, slottedMassGrams: 10, slottedMassCount };
    g.add(hangerGroup);
    Object.assign(g.userData, {
      newtonSecondLawRig: true,
      lightGateSystem: { gateCount: 2, gateWorldX: gateXs, gateProgress, oneSharedDataLogger: true, cableCount: 2, displayedChannels: ['v₁', 'v₂'] },
      trolley: { roundedBody: true, wheelCount: 4, rubberBumpers: 2, interruptCard: true, relativeSizeFromPrevious: 0.86 },
      logger: { position: { x: loggerPosition.x, y: loggerPosition.y, z: loggerPosition.z }, closerToCamera: true, shiftedLeft: true }
    });
    const prepared = shadowReady(g); loggerScreen.castShadow = false; loggerScreen.receiveShadow = false; beamMat.depthWrite = false;
    return prepared;
  }
  electromagnetRig(state) {
    const g = new THREE.Group(), turns = Math.max(10, Math.min(50, state.electromagnetTurns || 10));
    const steel = new THREE.MeshPhysicalMaterial({ color: 0x86959c, metalness: .92, roughness: .16, clearcoat: .42 });
    const darkSteel = metal(0x34464e, .22), enamel = new THREE.MeshPhysicalMaterial({ color: 0xe9edf0, roughness: .24, clearcoat: .72, clearcoatRoughness: .12 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xc65f28, metalness: .72, roughness: .26, emissive: 0x441306, emissiveIntensity: 0 });
    const blue = new THREE.MeshPhysicalMaterial({ color: 0x3159a7, roughness: .22, metalness: .18, clearcoat: .85 });
    const standX = .42, coilRootX = .72, highY = 2.16, lowY = .61, poleTipX = coilRootX + 1.47, poleZ = .08;

    // The fixed stand sits well to the right of the power pack. Its complete
    // boss-and-arm carriage slides down the rod while keeping the core's long
    // axis horizontal and its working pole pointed toward the right.
    const standBase = new THREE.Mesh(roundedBox(1.36, .14, 1.02, .08, 5), darkSteel); standBase.position.set(standX + .03, .08, -.12); g.add(standBase);
    const standRod = cylinder(.065, 3.32, steel, 36); standRod.position.set(standX, 1.72, -.52); g.add(standRod);
    const carriage = new THREE.Group(); carriage.position.y = highY;
    const boss = new THREE.Mesh(roundedBox(.4, .34, .4, .06, 4), darkSteel); boss.position.set(standX, 0, -.47); carriage.add(boss);
    const arm = this.tubeBetween(new THREE.Vector3(standX + .08, .02, -.44), new THREE.Vector3(coilRootX + .1, .02, poleZ), .055, steel); carriage.add(arm);
    const clampJaw = new THREE.Mesh(new THREE.TorusGeometry(.235, .042, 12, 52, Math.PI * 1.56), darkSteel);
    clampJaw.position.set(coilRootX + .12, 0, poleZ); clampJaw.rotation.set(0, Math.PI / 2, .7); carriage.add(clampJaw);

    const coreAssembly = new THREE.Group();
    const core = cylinder(.19, 1.34, new THREE.MeshPhysicalMaterial({ color: 0x75858c, metalness: .94, roughness: .14, clearcoat: .56 }), 64);
    core.rotation.z = Math.PI / 2; core.position.x = .7; coreAssembly.add(core);
    const pole = cylinder(.205, .12, steel, 64); pole.rotation.z = Math.PI / 2; pole.position.x = 1.4; coreAssembly.add(pole);
    const helixPoints = [];
    const renderedTurns = turns;
    for (let i = 0; i <= renderedTurns * 10; i++) {
      const u = i / (renderedTurns * 10), angle = u * renderedTurns * Math.PI * 2;
      helixPoints.push(new THREE.Vector3(.23 + u * .96, Math.cos(angle) * .275, Math.sin(angle) * .275));
    }
    const helix = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPoints), renderedTurns * 12, .026, 10, false), copper);
    coreAssembly.add(helix);
    const startTail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(.23, .275, 0), new THREE.Vector3(.1, .1, .12), new THREE.Vector3(-.04, -.26, .24)
    ]), 28, .023, 10, false), copper);
    const returnTail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.19, .275, 0), new THREE.Vector3(1.31, .36, -.14), new THREE.Vector3(.18, .4, -.24), new THREE.Vector3(-.02, .28, -.22)
    ]), 56, .023, 10, false), copper);
    coreAssembly.add(startTail, returnTail);
    coreAssembly.position.set(coilRootX, 0, poleZ);
    carriage.add(coreAssembly);
    g.add(carriage);

    // The paper-clip tray follows the new right-hand working pole.
    const clipCentreX = 2.08;
    const trayMat = new THREE.MeshPhysicalMaterial({ color: 0xe8ecee, metalness: .72, roughness: .24, clearcoat: .48 });
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(1.02, .94, .12, 72), trayMat); tray.scale.z = .58; tray.position.set(clipCentreX, .1, .1); g.add(tray);
    const trayRim = new THREE.Mesh(new THREE.TorusGeometry(.97, .05, 14, 72), trayMat); trayRim.scale.z = .58; trayRim.rotation.x = Math.PI / 2; trayRim.position.set(clipCentreX, .18, .1); g.add(trayRim);
    const clipWire = metal(0xcbd3d6, .1);
    const outerPoints = [], innerPoints = [];
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2;
      outerPoints.push(new THREE.Vector3(Math.cos(a) * .17, Math.sin(a) * .38, 0));
      innerPoints.push(new THREE.Vector3(Math.cos(a) * .105 + .025, Math.sin(a) * .285, .006));
    }
    const outerClipGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outerPoints, true), 96, .018, 8, true);
    const innerClipGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(innerPoints, true), 96, .014, 8, true);
    const paperClips = [];
    for (let i = 0; i < 18; i++) {
      const clip = new THREE.Group(), outer = new THREE.Mesh(outerClipGeo, clipWire), inner = new THREE.Mesh(innerClipGeo, clipWire);
      clip.add(outer, inner);
      const angle = i * 2.399, radius = .16 + (i % 6) * .135;
      const origin = new THREE.Vector3(clipCentreX + Math.cos(angle) * radius, .235 + (i % 3) * .012, .1 + Math.sin(angle) * radius * .52);
      clip.position.copy(origin); clip.rotation.set(Math.PI / 2 + (i % 3) * .08, angle, (i % 5 - 2) * .22); clip.scale.setScalar(.62);
      g.add(clip);
      const chainRow = Math.floor(i / 4), chainColumn = i % 4;
      paperClips.push({
        mesh: clip,
        origin,
        originRotation: clip.rotation.clone(),
        pickupOffset: new THREE.Vector3((chainColumn - 1.5) * .045, -chainRow * .025, (chainColumn % 2 - .5) * .11),
        chainOffset: new THREE.Vector3((chainColumn - 1.5) * .045, -.18 - chainRow * .22, (chainColumn % 2 - .5) * .11),
        phase: i * .61
      });
    }

    // Regulated 3 V supply with a real two-line digital current/voltage display.
    const supply = new THREE.Group(), supplyBody = new THREE.Mesh(roundedBox(1.55, .96, .92, .1, 6), blue);
    supplyBody.position.y = .48; supply.add(supplyBody);
    const supplyPanel = new THREE.Mesh(roundedBox(1.22, .62, .045, .055, 4), solid(0x081a25, .42)); supplyPanel.position.set(-.08, .61, .48); supply.add(supplyPanel);
    const supplyCanvas = document.createElement('canvas'), supplyContext = supplyCanvas.getContext('2d');
    supplyCanvas.width = 512; supplyCanvas.height = 300;
    const paintSupplyDisplay = (current, voltage, active) => {
      const dc = supplyContext;
      dc.clearRect(0, 0, supplyCanvas.width, supplyCanvas.height);
      const bg = dc.createLinearGradient(0, 0, supplyCanvas.width, supplyCanvas.height); bg.addColorStop(0, '#03131d'); bg.addColorStop(1, '#0a2632'); dc.fillStyle = bg; dc.fillRect(0, 0, supplyCanvas.width, supplyCanvas.height);
      dc.strokeStyle = 'rgba(107,203,232,.32)'; dc.lineWidth = 3; dc.strokeRect(8, 8, supplyCanvas.width - 16, supplyCanvas.height - 16);
      dc.fillStyle = '#8caeb8'; dc.font = '800 25px Inter, sans-serif'; dc.textAlign = 'left'; dc.textBaseline = 'middle'; dc.fillText('CURRENT', 28, 45); dc.fillText('VOLTAGE', 28, 166);
      dc.shadowColor = active ? '#4edcff' : '#506b74'; dc.shadowBlur = 18; dc.fillStyle = active ? '#76e4ff' : '#718990'; dc.font = '800 72px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'right'; dc.fillText(`${current.toFixed(2)} A`, supplyCanvas.width - 27, 101); dc.fillText(`${voltage.toFixed(2)} V`, supplyCanvas.width - 27, 222);
      dc.shadowBlur = 0; dc.fillStyle = active ? '#73f2c4' : '#7f9297'; dc.font = '800 22px Inter, sans-serif'; dc.textAlign = 'center'; dc.fillText(active ? 'OUTPUT ON' : 'OUTPUT OFF', supplyCanvas.width / 2, 273);
    };
    paintSupplyDisplay(0, 0, false);
    const supplyTexture = new THREE.CanvasTexture(supplyCanvas); supplyTexture.colorSpace = THREE.SRGBColorSpace;
    const supplyDisplay = { canvas: supplyCanvas, context: supplyContext, texture: supplyTexture, paint: paintSupplyDisplay, lastKey: '0.00|0.00|false' };
    const display = new THREE.Mesh(new THREE.PlaneGeometry(1.08, .56), new THREE.MeshBasicMaterial({ map: supplyTexture, toneMapped: false, depthWrite: false }));
    display.position.set(-.08, .61, .575); display.renderOrder = 8; supply.add(display);
    for (const [x, color] of [[.25, 0xe54343], [.52, 0x171c22]]) {
      const terminal = cylinder(.075, .12, solid(color, .24), 32); terminal.rotation.x = Math.PI / 2; terminal.position.set(x, .2, .53); supply.add(terminal);
    }
    supply.position.set(-2.45, 0, -.15); g.add(supply);
    const switchBase = new THREE.Mesh(roundedBox(.92, .12, .62, .055, 4), enamel); switchBase.position.set(-2.28, .12, 1.02); g.add(switchBase);
    const contactMat = metal(0xd3ae54, .12);
    for (const x of [-2.53, -2.03]) { const contact = cylinder(.07, .12, contactMat, 28); contact.position.set(x, .23, 1.02); g.add(contact) }
    const switchPivot = new THREE.Group(); switchPivot.position.set(-2.53, .3, 1.02);
    const switchLever = new THREE.Mesh(new THREE.BoxGeometry(.58, .055, .12), contactMat); switchLever.position.x = .29; switchPivot.add(switchLever);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(.095, 28, 18), solid(0xb93537, .3)); handle.position.x = .56; switchPivot.add(handle);
    switchPivot.rotation.z = .38; g.add(switchPivot);
    const switchGlow = new THREE.PointLight(0x5a7dff, 0, 3.2, 1.8); switchGlow.position.set(1.25, 1.8, .1); g.add(switchGlow);
    const leadMat = new THREE.MeshStandardMaterial({ color: 0xb72d34, roughness: .62 });
    const returnMat = new THREE.MeshStandardMaterial({ color: 0x182329, roughness: .7 });
    const makeFlexibleLead = (points, material) => {
      const lead = new THREE.Group(), segments = [], joints = [];
      for (let i = 0; i < points.length - 1; i++) {
        const segment = cylinder(.025, 1, material, 14); lead.add(segment); segments.push(segment);
      }
      for (let i = 1; i < points.length - 1; i++) {
        const joint = new THREE.Mesh(new THREE.SphereGeometry(.026, 12, 8), material); lead.add(joint); joints.push(joint);
      }
      g.add(lead);
      return { lead, segments, joints, points: points.map(point => point.clone()) };
    };
    const updateFlexibleLead = lead => {
      for (let i = 0; i < lead.segments.length; i++) {
        const a = lead.points[i], b = lead.points[i + 1], delta = b.clone().sub(a), length = delta.length(), segment = lead.segments[i];
        segment.position.copy(a).add(b).multiplyScalar(.5); segment.scale.set(1, length, 1);
        segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      }
      for (let i = 0; i < lead.joints.length; i++) lead.joints[i].position.copy(lead.points[i + 1]);
    };
    const redLead = makeFlexibleLead([
      new THREE.Vector3(-2.2, .2, .38), new THREE.Vector3(-1.78, .14, .78), new THREE.Vector3(-1.05, .2, .95),
      new THREE.Vector3(-.2, .64, .58), new THREE.Vector3(coilRootX - .04, highY - .26, poleZ + .24)
    ], leadMat);
    const blackLead = makeFlexibleLead([
      new THREE.Vector3(-1.93, .2, .38), new THREE.Vector3(-1.68, .13, 1.12), new THREE.Vector3(-.84, .2, 1.2),
      new THREE.Vector3(.08, .8, .42), new THREE.Vector3(coilRootX - .02, highY + .28, poleZ - .22)
    ], returnMat);
    updateFlexibleLead(redLead); updateFlexibleLead(blackLead);

    this.dynamic.push({
      kind: 'electromagnet',
      carriage,
      coreAssembly,
      highY,
      lowY,
      poleTip: new THREE.Vector3(poleTipX, -.12, poleZ),
      redLead,
      blackLead,
      updateFlexibleLead,
      switchPivot,
      switchGlow,
      copper,
      paperClips,
      supplyDisplay
    });
    Object.assign(g.userData, {
      electromagnetRig: true,
      orientation: 'horizontal, working pole facing right',
      powerPackSide: 'left',
      paperClipPosition: 'beneath the right-hand working pole',
      digitalDisplay: 'current in A and voltage in V'
    });
    return shadowReady(g);
  }
  convectionRig(state) {
    const g = new THREE.Group();
    const lowerCentreY = 1.38, upperCentreY = 2.78, glassRadius = .29;
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.45, lowerCentreY, .12), new THREE.Vector3(-1.72, 1.60, .12), new THREE.Vector3(-1.72, 2.48, .12),
      new THREE.Vector3(-1.38, upperCentreY, .12), new THREE.Vector3(1.38, upperCentreY, .12), new THREE.Vector3(1.72, 2.48, .12),
      new THREE.Vector3(1.72, 1.60, .12), new THREE.Vector3(1.43, lowerCentreY, .12), new THREE.Vector3(-1.45, lowerCentreY, .12)
    ], true, 'centripetal');
    const glass = new THREE.Mesh(new THREE.TubeGeometry(path, 256, glassRadius, 40, true), GLASS()); glass.renderOrder = 5; g.add(glass);
    const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x61b8da, transparent: true, opacity: .42, transmission: .38, roughness: .08, depthWrite: false });
    const water = new THREE.Mesh(new THREE.TubeGeometry(path, 256, .205, 32, true), waterMat); water.renderOrder = 4; g.add(water);
    const innerHighlight = new THREE.Mesh(new THREE.TubeGeometry(path, 256, .235, 20, true), new THREE.MeshBasicMaterial({ color: 0xd9f8ff, transparent: true, opacity: .08, wireframe: true, depthWrite: false })); g.add(innerHighlight);

    // Two retort stands with padded clamps supporting the glass loop.
    const standMat = metal(0x51656d, .2), clampMat = metal(0x9aa8ad, .16);
    for (const sx of [-2.45, 2.45]) {
      const base = new THREE.Mesh(roundedBox(1.05, .13, .78, .065, 4), standMat); base.position.set(sx, .08, -.28); g.add(base);
      const rod = cylinder(.055, 3.15, clampMat, 32); rod.position.set(sx, 1.65, -.28); g.add(rod);
      const arm = this.tubeBetween(new THREE.Vector3(sx, 2.08, -.28), new THREE.Vector3(sx > 0 ? 1.72 : -1.72, 2.08, .08), .04, clampMat); g.add(arm);
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(.315, .035, 10, 44, Math.PI * 1.32), new THREE.MeshStandardMaterial({ color: 0x303b40, roughness: .55 })); jaw.position.set(sx > 0 ? 1.72 : -1.72, 2.08, .1); jaw.rotation.z = sx > 0 ? .65 : -2.5; g.add(jaw);
    }
    const mat = new THREE.Mesh(roundedBox(1.3, .08, 1.05, .05, 4), solid(0xcbd1c7, .88)); mat.position.set(-1.7, .05, .14); g.add(mat);
    const bunsen = this.bunsen(state.convectionStage === 3 && state.running, .66); bunsen.scale.setScalar(.72); bunsen.position.set(-1.72, .08, .15); g.add(bunsen);
    const heatLight = new THREE.PointLight(0xff7a35, 0, 3.8, 1.8); heatLight.position.set(-1.7, lowerCentreY, .12); g.add(heatLight);

    const crystal = new THREE.Group(), crystalMat = new THREE.MeshStandardMaterial({ color: 0xe56f22, roughness: .44, emissive: 0x4b1604, emissiveIntensity: .2 });
    for (let i = 0; i < 12; i++) {
      const grain = new THREE.Mesh(new THREE.OctahedronGeometry(.045 + (i % 3) * .012, 1), crystalMat);
      grain.position.set((i % 4 - 1.5) * .047, Math.floor(i / 4) * .037, (i % 3 - 1) * .035); grain.rotation.set(i, i * .7, i * .31); crystal.add(grain);
    }
    crystal.position.set(-2.35, .36, .52); g.add(crystal);
    const tracerParticles = [];
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xff8b2e, transparent: true, opacity: .82, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 72; i++) {
      const particle = new THREE.Mesh(new THREE.SphereGeometry(.035 + (i % 4) * .006, 12, 10), tracerMat.clone());
      particle.visible = false; particle.renderOrder = 9; g.add(particle);
      tracerParticles.push({ mesh: particle, u: i / 72, spread: (i % 7 - 3) * .012, phase: i * .73 });
    }
    const arrows = [];
    for (let i = 0; i < 12; i++) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(.07, .18, 16), new THREE.MeshBasicMaterial({ color: 0xffb153, transparent: true, opacity: .5, depthWrite: false, toneMapped: false }));
      arrow.visible = false; arrow.renderOrder = 8; g.add(arrow); arrows.push(arrow);
    }
    this.dynamic.push({ kind: 'convection', path, crystal, tracerParticles, arrows, heatLight });
    g.userData.convectionRig = true;
    g.userData.convectionGeometry = {
      centrelineBottomY: lowerCentreY,
      centrelineTopY: upperCentreY,
      outsideBottomY: lowerCentreY - glassRadius,
      outsideTopY: upperCentreY + glassRadius,
      burnerBodyTopY: 1.023,
      burnerClearance: lowerCentreY - glassRadius - 1.023
    };
    return shadowReady(g);
  }
  conductionRig(state) {
    const g = new THREE.Group(), rodY = 1.63, startX = -1.48, endX = 2.38, leftStandX = -3.2, rightStandX = 2.75;
    const stand = metal(0x4c5d65, .22), clamp = metal(0x9ba8ad, .14);
    for (const sx of [leftStandX, rightStandX]) {
      const base = new THREE.Mesh(roundedBox(.98, .13, 1.32, .065, 4), stand); base.position.set(sx, .08, 0); g.add(base);
      const post = cylinder(.055, 2.5, clamp, 32); post.position.set(sx, 1.32, -.12); g.add(post);
      for (const z of [-.86, 0, .86]) {
        const arm = this.tubeBetween(new THREE.Vector3(sx, rodY, -.12), new THREE.Vector3(sx > 0 ? endX : startX, rodY, z), .035, clamp); g.add(arm);
        const jaw = new THREE.Mesh(new THREE.TorusGeometry(.115, .025, 9, 36, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: 0x27363d, roughness: .5 })); jaw.position.set(sx > 0 ? endX : startX, rodY, z); jaw.rotation.x = Math.PI / 2; g.add(jaw);
      }
    }
    const heatBlockMat = new THREE.MeshPhysicalMaterial({ color: 0x4d5960, metalness: .9, roughness: .19, clearcoat: .35, emissive: 0x270600, emissiveIntensity: 0 });
    const heatBlock = new THREE.Mesh(roundedBox(.36, .74, 2.16, .05, 4), heatBlockMat); heatBlock.position.set(startX, rodY, 0); g.add(heatBlock);
    const rodDefs = [
      { id: 'copper', z: -.86, color: 0xb96b34, material: new THREE.MeshStandardMaterial({ color: 0xb96b34, metalness: .92, roughness: .16, emissive: 0x2c0900, emissiveIntensity: 0 }) },
      { id: 'aluminium', z: 0, color: 0xc5cdd0, material: new THREE.MeshStandardMaterial({ color: 0xc5cdd0, metalness: .92, roughness: .12, emissive: 0x2c0900, emissiveIntensity: 0 }) },
      { id: 'steel', z: .86, color: 0x60727b, material: new THREE.MeshStandardMaterial({ color: 0x60727b, metalness: .9, roughness: .21, emissive: 0x2c0900, emissiveIntensity: 0 }) }
    ];
    const rods = [], pins = [], pinXs = [-.62, .32, 1.26, 2.08];
    const waxMat = new THREE.MeshPhysicalMaterial({ color: 0xf2d382, transparent: true, opacity: .92, roughness: .36, clearcoat: .28 });
    const drawingPinHeadRadius = .115, drawingPinHeadHeight = .052, drawingPinShaftLength = .29, drawingPinPointLength = .105;
    const drawingPinHeadTop = drawingPinHeadHeight / 2;
    const drawingPinHeadGeometry = new THREE.LatheGeometry([
      new THREE.Vector2(0, -drawingPinHeadHeight / 2),
      new THREE.Vector2(.094, -drawingPinHeadHeight / 2),
      new THREE.Vector2(.106, -.022),
      new THREE.Vector2(.113, -.014),
      new THREE.Vector2(drawingPinHeadRadius, -.003),
      new THREE.Vector2(.112, .012),
      new THREE.Vector2(.102, drawingPinHeadTop),
      new THREE.Vector2(0, drawingPinHeadTop)
    ], 56);
    const drawingPinBrass = new THREE.MeshPhysicalMaterial({
      color: 0xc5942e,
      metalness: .9,
      roughness: .18,
      clearcoat: .42,
      clearcoatRoughness: .14
    });
    const drawingPinSteel = metal(0xb8c2c5, .1);
    rodDefs.forEach(def => {
      const rod = this.tubeBetween(new THREE.Vector3(startX, rodY, def.z), new THREE.Vector3(endX, rodY, def.z), .075, def.material); g.add(rod); rods.push({ id: def.id, mesh: rod, material: def.material });
      pinXs.forEach((x, index) => {
        const pin = new THREE.Group();
        const head = new THREE.Mesh(drawingPinHeadGeometry, drawingPinBrass); pin.add(head);
        const shaft = cylinder(.013, drawingPinShaftLength, drawingPinSteel, 20);
        shaft.position.y = drawingPinHeadTop + drawingPinShaftLength / 2 - .002;
        pin.add(shaft);
        const point = new THREE.Mesh(new THREE.ConeGeometry(.013, drawingPinPointLength, 20), drawingPinSteel);
        point.position.y = drawingPinHeadTop + drawingPinShaftLength + drawingPinPointLength / 2 - .004;
        pin.add(point);
        pin.position.set(x, rodY + .17, def.z + .03); pin.rotation.z = .035 * (index % 2 ? 1 : -1);
        Object.assign(pin.userData, {
          drawingPin: true,
          headMaterial: 'polished brass',
          headShape: 'flat circular disc with a rounded rim',
          shaftAttachment: 'exact head centre',
          shaftAngleToHeadDegrees: 90
        });
        g.add(pin);
        const wax = new THREE.Mesh(new THREE.SphereGeometry(.105, 28, 18), waxMat.clone()); wax.scale.set(1.2, .48, .8); wax.position.set(x, rodY + .085, def.z); g.add(wax);
        pins.push({ mesh: pin, wax, metal: def.id, threshold: ({ copper: [1.55, 2.55, 3.75, 5.05], aluminium: [2.15, 3.45, 4.95, 6.55], steel: [3.35, 5.25, 7.15, 8.85] })[def.id][index], origin: pin.position.clone(), phase: index + def.z * 2.2 });
      });
    });
    const heatMatWidth = 1.4, heatMatDepth = 1.45;
    const heatMatMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb3a78d, roughness: .99, metalness: 0, clearcoat: .005, clearcoatRoughness: 1 });
    const heatMat = new THREE.Mesh(roundedBox(heatMatWidth, .08, heatMatDepth, .045, 4), heatMatMaterial); heatMat.position.set(startX, .05, 0); g.add(heatMat);
    const stainCanvas = document.createElement('canvas'), stainContext = stainCanvas.getContext('2d'); stainCanvas.width = stainCanvas.height = 512;
    stainContext.fillStyle = '#cfc7af'; stainContext.fillRect(0, 0, 512, 512);
    const softStain = (x, y, radiusX, radiusY, rgb, opacity) => {
      stainContext.save(); stainContext.translate(x, y); stainContext.scale(radiusX, radiusY);
      const gradient = stainContext.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, `rgba(${rgb},${opacity})`); gradient.addColorStop(.58, `rgba(${rgb},${opacity * .52})`); gradient.addColorStop(1, `rgba(${rgb},0)`);
      stainContext.fillStyle = gradient; stainContext.beginPath(); stainContext.arc(0, 0, 1, 0, Math.PI * 2); stainContext.fill(); stainContext.restore();
    };
    softStain(126, 132, 108, 72, '116,119,105', .2);
    softStain(391, 126, 91, 68, '113,128,112', .19);
    softStain(306, 346, 124, 82, '151,138,101', .16);
    softStain(79, 336, 72, 95, '111,119,107', .16);
    softStain(258, 258, 148, 112, '116,96,68', .12);
    softStain(438, 304, 58, 92, '111,109,92', .13);
    const mottledPatch = (x, y, radiusX, radiusY, rgb, opacity, rotation = 0) => {
      const lobes = [[0, 0, 1, .8], [-.42, -.12, .58, .52], [.38, -.2, .68, .44], [-.24, .32, .72, .5], [.35, .3, .5, .62], [.02, -.38, .52, .48]];
      stainContext.save(); stainContext.translate(x, y); stainContext.rotate(rotation);
      for (let i = 0; i < lobes.length; i++) {
        const [offsetX, offsetY, scaleX, scaleY] = lobes[i];
        stainContext.fillStyle = `rgba(${rgb},${opacity * (i ? .48 : .34)})`;
        stainContext.beginPath(); stainContext.ellipse(offsetX * radiusX, offsetY * radiusY, radiusX * scaleX, radiusY * scaleY, i * .23, 0, Math.PI * 2); stainContext.fill();
      }
      stainContext.restore();
    };
    mottledPatch(139, 128, 92, 57, '92,103,94', .36, -.18);
    mottledPatch(386, 119, 77, 55, '101,114,101', .32, .22);
    mottledPatch(329, 347, 101, 67, '132,119,84', .3, -.12);
    mottledPatch(82, 332, 56, 74, '98,107,98', .28, .16);
    mottledPatch(438, 292, 45, 76, '98,99,87', .24, -.1);
    stainContext.save();
    stainContext.strokeStyle = 'rgba(89,65,36,.5)'; stainContext.lineWidth = 24;
    stainContext.beginPath(); stainContext.roundRect(7, 7, 498, 498, 22); stainContext.stroke();
    stainContext.strokeStyle = 'rgba(117,91,55,.3)'; stainContext.lineWidth = 10;
    stainContext.beginPath(); stainContext.roundRect(20, 20, 472, 472, 16); stainContext.stroke();
    stainContext.restore();
    softStain(62, 433, 18, 15, '69,42,15', .9);
    softStain(67, 431, 9, 7, '39,34,25', .76);
    softStain(368, 432, 15, 10, '61,68,67', .72);
    softStain(401, 445, 11, 8, '61,66,65', .68);
    softStain(429, 422, 17, 11, '76,75,69', .6);
    softStain(178, 91, 18, 10, '93,83,65', .23);
    const matSpecks = [[45, 74, 3, '92,76,53', .24], [84, 103, 2, '83,74,60', .2], [137, 284, 2, '88,83,71', .19], [178, 421, 3, '77,71,60', .24], [221, 448, 2, '82,72,55', .2], [330, 413, 3, '75,80,76', .22], [359, 439, 2, '61,70,69', .28], [392, 427, 3, '65,70,68', .25], [450, 374, 2, '96,77,52', .22], [467, 228, 3, '91,85,71', .19], [314, 79, 2, '104,87,64', .18]];
    for (const [x, y, radius, rgb, opacity] of matSpecks) { stainContext.fillStyle = `rgba(${rgb},${opacity})`; stainContext.beginPath(); stainContext.arc(x, y, radius, 0, Math.PI * 2); stainContext.fill(); }
    let matNoiseSeed = 9187; const matNoise = () => ((matNoiseSeed = Math.imul(matNoiseSeed, 1664525) + 1013904223 >>> 0) / 4294967296);
    for (let i = 0; i < 420; i++) {
      const x = matNoise() * 512, y = matNoise() * 512, alpha = .018 + matNoise() * .052, length = 1 + matNoise() * 5;
      stainContext.strokeStyle = matNoise() > .45 ? `rgba(75,72,61,${alpha})` : `rgba(248,241,216,${alpha})`; stainContext.lineWidth = .45 + matNoise() * .8;
      stainContext.beginPath(); stainContext.moveTo(x, y); stainContext.lineTo(x + length, y + (matNoise() - .5) * 1.4); stainContext.stroke();
    }
    const stainTexture = new THREE.CanvasTexture(stainCanvas); stainTexture.colorSpace = THREE.SRGBColorSpace; stainTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const surfaceWidth = heatMatWidth - .055, surfaceDepth = heatMatDepth - .055, surfaceRadius = .035, surfaceShape = new THREE.Shape();
    surfaceShape.moveTo(-surfaceWidth / 2 + surfaceRadius, -surfaceDepth / 2);
    surfaceShape.lineTo(surfaceWidth / 2 - surfaceRadius, -surfaceDepth / 2); surfaceShape.quadraticCurveTo(surfaceWidth / 2, -surfaceDepth / 2, surfaceWidth / 2, -surfaceDepth / 2 + surfaceRadius);
    surfaceShape.lineTo(surfaceWidth / 2, surfaceDepth / 2 - surfaceRadius); surfaceShape.quadraticCurveTo(surfaceWidth / 2, surfaceDepth / 2, surfaceWidth / 2 - surfaceRadius, surfaceDepth / 2);
    surfaceShape.lineTo(-surfaceWidth / 2 + surfaceRadius, surfaceDepth / 2); surfaceShape.quadraticCurveTo(-surfaceWidth / 2, surfaceDepth / 2, -surfaceWidth / 2, surfaceDepth / 2 - surfaceRadius);
    surfaceShape.lineTo(-surfaceWidth / 2, -surfaceDepth / 2 + surfaceRadius); surfaceShape.quadraticCurveTo(-surfaceWidth / 2, -surfaceDepth / 2, -surfaceWidth / 2 + surfaceRadius, -surfaceDepth / 2);
    const surfaceGeometry = new THREE.ShapeGeometry(surfaceShape, 12), surfacePositions = surfaceGeometry.getAttribute('position'), surfaceUvs = surfaceGeometry.getAttribute('uv');
    for (let i = 0; i < surfacePositions.count; i++) surfaceUvs.setXY(i, surfacePositions.getX(i) / surfaceWidth + .5, surfacePositions.getY(i) / surfaceDepth + .5);
    surfaceUvs.needsUpdate = true;
    const stainOverlay = new THREE.Mesh(surfaceGeometry, new THREE.MeshStandardMaterial({ map: stainTexture, roughness: .98, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }));
    stainOverlay.rotation.x = -Math.PI / 2; stainOverlay.position.set(startX, .139, 0); stainOverlay.renderOrder = 3; g.add(stainOverlay);
    const scorchMarks = [], addScorchMark = (offsetX, offsetZ, radiusX, radiusZ, color, opacity) => {
      const halo = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * .28, depthWrite: false, toneMapped: true }));
      halo.rotation.x = -Math.PI / 2; halo.scale.set(radiusX * 1.65, radiusZ * 1.65, 1); halo.position.set(startX + offsetX, .142, offsetZ); halo.renderOrder = 4; g.add(halo); scorchMarks.push(halo);
      const core = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: true }));
      core.rotation.x = -Math.PI / 2; core.scale.set(radiusX, radiusZ, 1); core.position.set(startX + offsetX, .143, offsetZ); core.renderOrder = 5; g.add(core); scorchMarks.push(core);
    };
    addScorchMark(-.51, .49, .075, .05, 0x2e2115, .95);
    addScorchMark(.34, .51, .05, .034, 0x3f4747, .82);
    addScorchMark(.48, .47, .038, .027, 0x414747, .78);
    addScorchMark(.58, .37, .055, .034, 0x55564f, .68);
    Object.assign(heatMat.userData, { heatproofMat: true, finish: 'worn cream fibrous laboratory mat with brown aged edges', stains: ['broad muted grey-green discoloration', 'subtle heat-darkened areas', 'small brown scorch spot', 'scattered grey burn marks', 'fine ingrained speckling'] });
    const bunsen = this.bunsen(state.conductionStage === 1 && state.running, .69); bunsen.scale.setScalar(.72); bunsen.position.set(startX, .08, 0); g.add(bunsen);
    const heatLight = new THREE.PointLight(0xff7130, 0, 4.2, 1.8); heatLight.position.set(startX, 1.48, 0); g.add(heatLight);
    const heatBands = [];
    rodDefs.forEach(def => {
      for (let i = 0; i < 12; i++) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(.082, .012, 8, 24), new THREE.MeshBasicMaterial({ color: 0xff6a28, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
        band.rotation.z = Math.PI / 2; band.position.set(startX + .18 + i * .29, rodY, def.z); g.add(band);
        heatBands.push({ mesh: band, metal: def.id, distanceIndex: i });
      }
    });
    this.dynamic.push({ kind: 'conduction', pins, rods, heatBands, heatBlockMat, heatLight });
    g.userData.conductionRig = true;
    g.userData.conductionLayout = {
      leftStandX,
      leftStandBaseRightX: leftStandX + .49,
      heatproofMatLeftX: startX - heatMatWidth / 2,
      standToMatGap: startX - heatMatWidth / 2 - (leftStandX + .49),
      bunsenPosition: [startX, .08, 0],
      bunsenScale: .72,
      bunsenFlameHeight: .69,
      drawingPinDesign: {
        headMaterial: 'polished brass',
        headShape: 'flat circular disc with softly rounded rim',
        shaftAttachment: 'exact head centre',
        shaftAngleToHeadDegrees: 90,
        settledPose: 'brass head flat on bench with sharp point upright'
      }
    };
    const ready = shadowReady(g); stainOverlay.castShadow = false; for (const mark of scorchMarks) mark.castShadow = false; return ready;
  }
  thermalFrameState(state) {
    const heat = Math.max(0, Math.min(1, ((state.temp || 21) - 21) / 61)), angle = -.24 + (state.thermalRotation || 0), surfaces = [
      { id: 'matt black', target: 82, normal: Math.cos(angle) },
      { id: 'white paint', target: 74, normal: -Math.sin(angle) },
      { id: 'brushed metal', target: 52, normal: -Math.cos(angle) },
      { id: 'polished metal', target: 39, normal: Math.sin(angle) }
    ].map(surface => ({ ...surface, temperature: 21 + (surface.target - 21) * heat }));
    const facing = [...surfaces].sort((a, b) => b.normal - a.normal)[0];
    return { heat, angle, surfaces, facing }
  }
  paintThermalCameraScreen(dynamic, state) {
    const dc = dynamic.screenContext, cw = dynamic.screenCanvas.width, ch = dynamic.screenCanvas.height, frame = this.thermalFrameState(state), hot = frame.heat > .02;
    dc.clearRect(0, 0, cw, ch);
    drawThermalBenchScene(dc, { x: 0, y: 0, width: cw, height: ch, frame: { ...frame, stage: state.thermalStage || 0, timer: state.thermalTimer || 0 } });
    dc.fillStyle = 'rgba(4,8,25,.76)'; dc.fillRect(0, 0, cw, 38); dc.fillStyle = '#e9f4ff'; dc.font = '700 16px ui-monospace,monospace'; dc.textBaseline = 'middle'; dc.fillText(state.thermalStage >= 3 ? `LIVE IR · ${frame.facing.id.toUpperCase()}` : state.thermalStage === 1 ? 'WARMING · LIVE' : 'STANDBY', 18, 20); dc.textAlign = 'right'; dc.fillText(`${frame.facing.temperature.toFixed(1)} °C`, cw - 22, 20); dc.textAlign = 'left';
    const palette = dc.createLinearGradient(0, 318, cw, 318); palette.addColorStop(0, '#07143c'); palette.addColorStop(.23, '#5c1a88'); palette.addColorStop(.5, '#ee2737'); palette.addColorStop(.73, '#ffcf31'); palette.addColorStop(1, '#fffbd2'); dc.fillStyle = palette; dc.fillRect(24, 325, cw - 48, 14); dc.fillStyle = '#dce9ff'; dc.font = '700 13px ui-monospace,monospace'; dc.fillText('20', 24, 352); dc.textAlign = 'right'; dc.fillText('90 °C', cw - 24, 352); dc.textAlign = 'left'; dynamic.screenTexture.needsUpdate = true
  }
  thermalRadiationRig(state) {
    const g = new THREE.Group();
    // Four-surface Leslie cube with a hot-water filler neck.
    const cube = new THREE.Group(), cubeBody = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.35, 1.25), new THREE.MeshPhysicalMaterial({ color: 0x79848a, metalness: .78, roughness: .24 }));
    cubeBody.position.y = .78; cube.add(cubeBody);
    const faces = [
      { pos: [0, .78, .631], rot: [0, 0, 0], color: 0x121416, roughness: .92, metalness: .02 },
      { pos: [.631, .78, 0], rot: [0, Math.PI / 2, 0], color: 0xe8e5dc, roughness: .64, metalness: .02 },
      { pos: [0, .78, -.631], rot: [0, Math.PI, 0], color: 0x8d979d, roughness: .34, metalness: .7 },
      { pos: [-.631, .78, 0], rot: [0, -Math.PI / 2, 0], color: 0xdce4e7, roughness: .06, metalness: .96 }
    ];
    faces.forEach((f, i) => {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.13, 1.23, 16, 16), new THREE.MeshPhysicalMaterial({ color: f.color, roughness: f.roughness, metalness: f.metalness, clearcoat: i === 3 ? .8 : .12 }));
      face.position.set(...f.pos); face.rotation.set(...f.rot); cube.add(face);
    });
    const edgeMat = metal(0x3d484e, .18);
    for (const y of [.12, 1.44]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(1.38, .06, 1.38), edgeMat); rail.position.y = y; cube.add(rail) }
    const neck = cylinder(.18, .42, metal(0x909ca1, .12), 48); neck.position.y = 1.67; cube.add(neck);
    const neckRim = new THREE.Mesh(new THREE.TorusGeometry(.18, .025, 12, 48), edgeMat); neckRim.rotation.x = Math.PI / 2; neckRim.position.y = 1.88; cube.add(neckRim);
    cube.position.set(0, 0, -.08); cube.rotation.y = -.24; g.add(cube);
    const hotLight = new THREE.PointLight(0xff4b24, state.thermalStage >= 2 ? 2.4 : 0, 4.5, 1.8); hotLight.position.set(0, 1.1, .25); g.add(hotLight);
    const heatWaves = [];
    for (let i = 0; i < 8; i++) {
      const wave = new THREE.Mesh(new THREE.TorusGeometry(.72 + i * .11, .018, 8, 56), new THREE.MeshBasicMaterial({ color: 0xff5c31, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      wave.scale.y = .8; wave.position.set(0, .82, .62); wave.rotation.x = Math.PI / 2; wave.visible = false; g.add(wave); heatWaves.push(wave);
    }

    const flask = this.flask(.7, 0xe7f6fb); flask.scale.setScalar(.86); flask.position.set(-2.35, 0, .16); g.add(flask);
    const waterDrops = [];
    const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x8ad9ef, transparent: true, opacity: .8, roughness: .08, transmission: .18 });
    for (let i = 0; i < 9; i++) { const drop = new THREE.Mesh(new THREE.SphereGeometry(.045, 16, 12), waterMat); drop.visible = false; g.add(drop); waterDrops.push(drop) }

    // A textured, school-lab thermal camera with a large rear display.
    const cameraGroup = new THREE.Group(), cameraBodyMat = new THREE.MeshPhysicalMaterial({ color: 0x2a3035, roughness: .34, metalness: .2, clearcoat: .46 });
    const body = new THREE.Mesh(roundedBox(1.76, 1.18, .48, .12, 7), cameraBodyMat); body.position.y = .92; cameraGroup.add(body);
    const grip = new THREE.Mesh(roundedBox(.46, .9, .4, .11, 6), cameraBodyMat); grip.position.set(.48, .18, -.02); grip.rotation.z = -.12; cameraGroup.add(grip);
    const bezel = new THREE.Mesh(roundedBox(1.56, .94, .08, .08, 6), solid(0x080d12, .42)); bezel.position.set(0, .94, .285); cameraGroup.add(bezel);
    const screenCanvas = document.createElement('canvas'); screenCanvas.width = 640; screenCanvas.height = 360;
    const screenContext = screenCanvas.getContext('2d'), screenTexture = new THREE.CanvasTexture(screenCanvas); screenTexture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .79), new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, depthTest: false })); screen.position.set(0, .94, .395); screen.renderOrder = 20; cameraGroup.add(screen);
    const lensBarrel = cylinder(.31, .42, cameraBodyMat, 56); lensBarrel.rotation.x = Math.PI / 2; lensBarrel.position.set(-.43, 1.01, -.38); cameraGroup.add(lensBarrel);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(.235, 56), new THREE.MeshPhysicalMaterial({ color: 0x481b57, metalness: .6, roughness: .08, clearcoat: 1 })); lens.position.set(-.43, 1.01, -.605); lens.rotation.y = Math.PI; cameraGroup.add(lens);
    const trigger = new THREE.Mesh(roundedBox(.22, .12, .12, .03, 3), solid(0xb83c45, .3)); trigger.position.set(.37, .55, .25); cameraGroup.add(trigger);
    cameraGroup.position.set(2.52, .1, 1.1); cameraGroup.rotation.y = -.35; cameraGroup.scale.setScalar(.72); g.add(cameraGroup);
    this.dynamic.push({ kind: 'thermalRadiation', cube, flask, waterDrops, cameraGroup, screenCanvas, screenContext, screenTexture, hotLight, heatWaves });
    g.userData.thermalRadiationRig = true;
    const rig = shadowReady(g);
    heatWaves.forEach(wave => {
      wave.castShadow = false;
      wave.receiveShadow = false;
      wave.userData.shadowlessThermalPropagation = true;
    });
    return rig;
  }
  densityRig(state) {
    const g = new THREE.Group();
    const stage = state.densityStage || 0;
    const timer = state.densityTimer || 0;
    const sampleIndex = state.densitySample || 0;
    const samples = [
      { name: 'Granite stone', mass: 187.5, vol: 75.0, density: 2.50, color: 0x78909c, shape: 'stone' },
      { name: 'Brass weight', mass: 212.5, vol: 25.0, density: 8.50, color: 0xd4af37, shape: 'brass' },
      { name: 'Aluminum block', mass: 108.0, vol: 40.0, density: 2.70, color: 0xb0bec5, shape: 'block' },
      { name: 'Steel nut', mass: 157.0, vol: 20.0, density: 7.85, color: 0x546e7a, shape: 'nut' }
    ];
    const sample = samples[sampleIndex] || samples[0];
    const clamp = value => Math.max(0, Math.min(1, value));
    const smooth = value => {
      value = clamp(value);
      return value * value * (3 - 2 * value);
    };
    const transferDuration = 3.6;
    const fillProgress = stage < 2 ? 0 : stage > 2 ? 1 : smooth(timer / .82);
    const transferProgress = stage < 2 ? 0 : stage > 2 ? 1 : smooth((timer - .58) / (transferDuration - .58));
    const lowerProgress = stage < 4 ? 0 : stage > 4 ? 1 : smooth(timer / 2.8);
    const displacementProgress = stage < 4 ? 0 : stage > 4 ? 1 : smooth((timer - .95) / (4.4 - 1.2));
    const balanceX = -2.15, canX = -.25;

    // Electronic balance and a settling readout on the left.
    const reading = stage === 1 || stage === 2 && transferProgress < .055 ? sample.mass : 0;
    const bal = this.balance(reading);
    bal.scale.setScalar(0.85);
    bal.position.set(balanceX, 0, .04);
    g.add(bal);

    // Open-topped Eureka can: the wall is deliberately open so the water surface
    // remains visible from the raised student camera.
    const eurekaGroup = new THREE.Group();
    eurekaGroup.position.set(canX, 0, 0);

    const riserMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.3 });
    const riser = new THREE.Mesh(new THREE.BoxGeometry(.98, .12, .92), riserMat);
    riser.position.y = 0.06;
    eurekaGroup.add(riser);

    const canMat = new THREE.MeshPhysicalMaterial({ color: 0xb9c6ca, metalness: .88, roughness: .17, clearcoat: .45, side: THREE.DoubleSide });
    const canBody = new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, 1.2, 64, 1, true), canMat);
    canBody.position.y = .72;
    eurekaGroup.add(canBody);
    const bottom = cylinder(.455, .09, canMat, 64);
    bottom.position.y = .16;
    eurekaGroup.add(bottom);
    const innerShade = new THREE.Mesh(new THREE.CylinderGeometry(.422, .422, 1.08, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x40545b, metalness: .45, roughness: .32, transparent: true, opacity: .38, side: THREE.BackSide }));
    innerShade.position.y = .76;
    eurekaGroup.add(innerShade);
    const rimMat = new THREE.MeshPhysicalMaterial({ color: 0xdce5e7, metalness: .92, roughness: .09, clearcoat: .75 });
    const outerRim = new THREE.Mesh(new THREE.TorusGeometry(.46, .035, 16, 72), rimMat);
    outerRim.rotation.x = Math.PI / 2;
    outerRim.position.y = 1.32;
    eurekaGroup.add(outerRim);
    const innerRim = new THREE.Mesh(new THREE.TorusGeometry(.414, .014, 12, 64), new THREE.MeshBasicMaterial({ color: 0xf2fdff, transparent: true, opacity: .72, depthWrite: false, toneMapped: false }));
    innerRim.rotation.x = Math.PI / 2;
    innerRim.position.y = 1.312;
    eurekaGroup.add(innerRim);

    // A gently descending, open outlet. Its endpoint is the same x/z anchor used
    // by the cylinder and overflow stream below.
    const spoutMat = new THREE.MeshPhysicalMaterial({ color: 0xb8c6ca, metalness: .9, roughness: .12, clearcoat: .55 });
    const spoutCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(.4, 1.24, .015),
      new THREE.Vector3(.57, 1.23, .015),
      new THREE.Vector3(.72, 1.17, .015),
      new THREE.Vector3(.82, 1.12, .015)
    ], false, 'centripetal');
    const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 36, .043, 18, false), spoutMat);
    eurekaGroup.add(spout);
    const outletLocal = spoutCurve.getPoint(1), outletTangent = spoutCurve.getTangent(1).normalize();
    const outletRim = new THREE.Mesh(new THREE.TorusGeometry(.044, .009, 10, 36), rimMat);
    outletRim.position.copy(outletLocal);
    outletRim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outletTangent);
    eurekaGroup.add(outletRim);

    const waterTop = .2 + (1.245 - .2) * fillProgress;
    let eurekaWater = null, waterSurface = null, waterMeniscus = null;
    const waterMaxHeight = 1.245 - .19;
    if (stage >= 2) {
      const waterMat = new THREE.MeshPhysicalMaterial({
        color: 0x20aee8,
        transparent: true,
        opacity: .82,
        roughness: .075,
        transmission: .12,
        ior: 1.333,
        clearcoat: .8,
        clearcoatRoughness: .035,
        depthWrite: false
      });
      const waterHeight = Math.max(.025, waterTop - .19);
      eurekaWater = new THREE.Mesh(new THREE.CylinderGeometry(.408, .408, waterMaxHeight, 64), waterMat);
      eurekaWater.scale.y = waterHeight / waterMaxHeight;
      eurekaWater.position.y = .19 + waterHeight / 2;
      eurekaWater.visible = fillProgress > .004;
      eurekaWater.renderOrder = 5;
      eurekaGroup.add(eurekaWater);
      const surfaceMat = new THREE.MeshPhysicalMaterial({
        color: 0x67d5f5,
        transparent: true,
        opacity: .94,
        roughness: .035,
        transmission: .08,
        clearcoat: 1,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      waterSurface = new THREE.Mesh(new THREE.CircleGeometry(.408, 72), surfaceMat);
      waterSurface.rotation.x = -Math.PI / 2;
      waterSurface.position.y = waterTop + (stage === 4 ? Math.sin(timer * 8.5) * .004 * displacementProgress : 0);
      waterSurface.visible = fillProgress > .004;
      waterSurface.renderOrder = 8;
      eurekaGroup.add(waterSurface);
      waterMeniscus = new THREE.Mesh(new THREE.TorusGeometry(.402, .012, 10, 72), new THREE.MeshBasicMaterial({ color: 0xdffaff, transparent: true, opacity: .86, depthWrite: false, toneMapped: false }));
      waterMeniscus.rotation.x = Math.PI / 2;
      waterMeniscus.position.y = waterSurface.position.y + .006;
      waterMeniscus.visible = fillProgress > .004;
      waterMeniscus.renderOrder = 10;
      eurekaGroup.add(waterMeniscus);
    }
    g.add(eurekaGroup);

    // The cylinder shares the spout outlet's world x/z coordinate, so it is
    // unmistakably directly below the outlet rather than merely beside it.
    const spoutOutlet = new THREE.Vector3(canX + outletLocal.x, outletLocal.y, outletLocal.z);
    const cylinderScale = new THREE.Vector3(.74, .58, .74);
    const currentVol = sample.vol * displacementProgress;
    const fillFraction = currentVol / 100;
    const cylinderMesh = this.measuringCylinder(fillFraction);
    cylinderMesh.scale.copy(cylinderScale);
    cylinderMesh.position.set(spoutOutlet.x, 0, spoutOutlet.z);
    g.add(cylinderMesh);
    const cylinderBaseHeight = Math.max(.025, fillFraction * .78);
    const cylinderLiquidY = (.1 + cylinderBaseHeight) * cylinderScale.y;
    const cylinderLiquid = cylinderMesh.children[4], cylinderMeniscus = cylinderMesh.children[5];

    let overflowStream = null;
    if (stage === 4) {
      const streamStart = spoutOutlet.clone().addScaledVector(outletTangent, .025);
      const streamEnd = new THREE.Vector3(spoutOutlet.x, .095, spoutOutlet.z);
      overflowStream = this.liquidPourStream(streamStart, streamEnd, {
        color: 0x4eb7e5,
        time: timer,
        radius: .021,
        opacity: .82,
        sag: .008,
        breakup: .68,
        droplets: 7,
        splash: true
      });
      overflowStream.visible = displacementProgress > .008 && displacementProgress < .992;
      g.add(overflowStream);
    }

    let objGeo;
    if (sample.shape === 'brass') {
      objGeo = new THREE.OctahedronGeometry(0.16, 1);
    } else if (sample.shape === 'block') {
      objGeo = new THREE.BoxGeometry(0.22, 0.18, 0.20);
    } else if (sample.shape === 'nut') {
      objGeo = new THREE.TorusGeometry(0.12, 0.06, 12, 6);
    } else {
      objGeo = new THREE.DodecahedronGeometry(0.18, 1);
    }
    const objMat = new THREE.MeshStandardMaterial({
      color: sample.color,
      metalness: sample.shape === 'brass' || sample.shape === 'nut' ? 0.8 : 0.2,
      roughness: sample.shape === 'stone' ? 0.8 : 0.3
    });
    const solidMesh = new THREE.Mesh(objGeo, objMat);

    // Separate, continuous balance → can transfer and can → water lowering.
    let objX, objY, objZ = .02;
    if (stage <= 1) {
      objX = balanceX;
      objY = .78;
      objZ = .04;
    } else if (stage === 2) {
      objX = THREE.MathUtils.lerp(balanceX, canX, transferProgress);
      objY = THREE.MathUtils.lerp(.78, 1.92, transferProgress) + Math.sin(Math.PI * transferProgress) * .52;
      objZ = THREE.MathUtils.lerp(.04, .02, transferProgress) - Math.sin(Math.PI * transferProgress) * .13;
    } else if (stage === 3) {
      objX = canX;
      objY = 1.92;
    } else if (stage === 4) {
      objX = canX;
      objY = THREE.MathUtils.lerp(1.92, .58, lowerProgress);
      if (timer > 2.8) objY += Math.sin((timer - 2.8) * 8) * Math.exp(-(timer - 2.8) * 2.2) * .035;
    } else {
      objX = canX;
      objY = .58;
    }
    solidMesh.position.set(objX, objY, objZ);
    solidMesh.rotation.set(.12 + transferProgress * .42, transferProgress * .78 + lowerProgress * .3, transferProgress * -.18);
    g.add(solidMesh);

    let stringLine = null, knot = null;
    if (stage >= 2) {
      const stringMat = new THREE.LineBasicMaterial({ color: 0xe8f0ef, transparent: true, opacity: .92 });
      const stringGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(objX, 2.72, objZ),
        new THREE.Vector3(objX, objY + .15, objZ)
      ]);
      stringLine = new THREE.Line(stringGeo, stringMat);
      stringLine.visible = stage > 2 || transferProgress > .018;
      g.add(stringLine);
      knot = new THREE.Mesh(new THREE.TorusGeometry(.045, .008, 8, 24), new THREE.MeshStandardMaterial({ color: 0xe4ecec, roughness: .75 }));
      knot.rotation.x = Math.PI / 2;
      knot.position.set(objX, objY + .145, objZ);
      knot.visible = stringLine.visible;
      g.add(knot);
    }

    // Prebuild the entry effects once, then update them continuously in
    // render(). This keeps the transfer smooth without reconstructing the
    // complete balance/can/cylinder scene for every animation frame.
    const ripples = [], splashDrops = [], airBubbles = [];
    if (stage === 4) {
      for (let ringIndex = 0; ringIndex < 3; ringIndex++) {
        const ripple = new THREE.Mesh(new THREE.TorusGeometry(.075, .014, 10, 56), new THREE.MeshBasicMaterial({ color: 0x9eeeff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
        ripple.rotation.x = Math.PI / 2;
        ripple.position.set(canX, 1.306 + ringIndex * .003, .01);
        ripple.visible = false;
        ripple.renderOrder = 13;
        g.add(ripple);
        ripples.push(ripple);
      }
      for (let i = 0; i < 12; i++) {
        const droplet = new THREE.Mesh(new THREE.SphereGeometry(.02 + (i % 3) * .004, 14, 9), new THREE.MeshBasicMaterial({ color: 0xc8f7ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
        droplet.visible = false;
        droplet.scale.set(.78, 1.35, .78);
        droplet.renderOrder = 15;
        g.add(droplet);
        splashDrops.push(droplet);
      }
      for (let i = 0; i < 16; i++) {
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(.024 + (i % 4) * .006, 16, 11), new THREE.MeshPhysicalMaterial({ color: 0xe8fbff, transparent: true, opacity: .68, transmission: .22, roughness: .05, depthWrite: false }));
        bubble.visible = false;
        bubble.renderOrder = 12;
        bubble.castShadow = false;
        g.add(bubble);
        airBubbles.push(bubble);
      }
    }

    this.dynamic.push({
      kind: 'density',
      canX,
      balanceX,
      solidMesh,
      stringLine,
      knot,
      eurekaWater,
      waterSurface,
      waterMeniscus,
      waterMaxHeight,
      cylinderLiquid,
      cylinderMeniscus,
      cylinderBaseHeight,
      sampleVolume: sample.vol,
      overflowStream,
      ripples,
      splashDrops,
      airBubbles
    });

    g.userData.densityRig = true;
    g.userData.spoutOutlet = spoutOutlet;
    g.userData.measuringCylinderAligned = true;
    g.userData.waterSurfaceVisible = fillProgress > .004;
    g.userData.objectTransferProgress = transferProgress;
    g.userData.displacementProgress = displacementProgress;
    return shadowReady(g);
  }
  wireResistanceRig(state) {
    const g = new THREE.Group(), rulerStartX = -2.65, rulerLength = 5.3, rulerZ = .78, rulerTopY = .205;
    const dark = solid(0x1b2b32, .3), steel = metal(0xb8c2c5, .12), brass = metal(0xd0a249, .16);
    const red = new THREE.MeshStandardMaterial({ color: 0xc83d42, roughness: .5 }), black = new THREE.MeshStandardMaterial({ color: 0x1b2429, roughness: .58 });
    const voltageRed = new THREE.MeshStandardMaterial({ color: 0xa84f94, roughness: .48 }), voltageBlack = new THREE.MeshStandardMaterial({ color: 0x6e55a4, roughness: .52 });
    const wireMaterial = new THREE.MeshPhysicalMaterial({ color: 0x71777b, metalness: .94, roughness: .23, clearcoat: .25, emissive: 0x2f0d05, emissiveIntensity: 0 });

    // A full wooden metre ruler with engraved millimetre, centimetre and
    // numbered ten-centimetre marks.
    const ruler = new THREE.Mesh(roundedBox(rulerLength + .22, .12, .54, .035, 4), new THREE.MeshPhysicalMaterial({ color: 0xd8b06a, roughness: .66, clearcoat: .18 }));
    ruler.position.set(0, .105, rulerZ); g.add(ruler);
    const rulerInset = new THREE.Mesh(new THREE.BoxGeometry(rulerLength, .012, .475), new THREE.MeshStandardMaterial({ color: 0xe5c47e, roughness: .72 }));
    rulerInset.position.set(0, .172, rulerZ); g.add(rulerInset);
    const markMat = new THREE.MeshBasicMaterial({ color: 0x3a2a1c, toneMapped: false });
    for (let cm = 0; cm <= 100; cm++) {
      const x = rulerStartX + rulerLength * cm / 100, major = cm % 10 === 0, mid = cm % 5 === 0;
      const mark = new THREE.Mesh(new THREE.BoxGeometry(.009, .012, major ? .26 : mid ? .18 : .115), markMat);
      mark.position.set(x, .184, rulerZ - .11 + (major ? 0 : mid ? -.04 : -.072)); g.add(mark);
      if (major) {
        const labelCanvas = document.createElement('canvas'), lc = labelCanvas.getContext('2d');
        labelCanvas.width = 128; labelCanvas.height = 64; lc.clearRect(0, 0, 128, 64); lc.fillStyle = '#3c2b1b';
        lc.font = '800 34px ui-monospace, Menlo, monospace'; lc.textAlign = 'center'; lc.textBaseline = 'middle'; lc.fillText(String(cm), 64, 32);
        const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Mesh(new THREE.PlaneGeometry(.25, .105), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }));
        label.rotation.x = -Math.PI / 2; label.position.set(x, .194, rulerZ + .095); label.renderOrder = 9; g.add(label);
      }
    }
    const wire = this.tubeBetween(new THREE.Vector3(rulerStartX, rulerTopY + .045, rulerZ), new THREE.Vector3(rulerStartX + rulerLength, rulerTopY + .045, rulerZ), .018, wireMaterial);
    g.add(wire);

    // A subtle cyan overlay makes the exact test length legible without
    // hiding the physical nichrome wire or the ruler graduations beneath it.
    const measuredSegment = cylinder(.031, 1, new THREE.MeshBasicMaterial({ color: 0x26aebc, transparent: true, opacity: .54, depthWrite: false, toneMapped: false }), 24);
    measuredSegment.rotation.z = Math.PI / 2;
    measuredSegment.position.set(rulerStartX, rulerTopY + .047, rulerZ);
    measuredSegment.renderOrder = 8;
    measuredSegment.castShadow = false;
    measuredSegment.receiveShadow = false;
    g.add(measuredSegment);

    const makeCrocodile = (colourMaterial, fixed = false) => {
      const clip = new THREE.Group(), lowerJaw = new THREE.Group(), upperJaw = new THREE.Group();
      const lower = new THREE.Mesh(new THREE.BoxGeometry(.28, .045, .48), steel); lower.position.z = .04; lowerJaw.add(lower);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(.28, .05, .48), steel); upper.position.z = .04; upperJaw.add(upper);
      const lowerTip = new THREE.Mesh(new THREE.BoxGeometry(.26, .055, .17), brass); lowerTip.position.z = -.285; lowerJaw.add(lowerTip);
      const upperTip = new THREE.Mesh(new THREE.BoxGeometry(.26, .055, .17), brass); upperTip.position.z = -.285; upperJaw.add(upperTip);
      for (const jaw of [lowerJaw, upperJaw]) {
        for (let tooth = -2; tooth <= 2; tooth++) {
          const serration = new THREE.Mesh(new THREE.ConeGeometry(.018, .055, 8), steel);
          serration.rotation.x = jaw === upperJaw ? Math.PI : 0; serration.position.set(tooth * .047, jaw === upperJaw ? -.052 : .052, -.345); jaw.add(serration);
        }
      }
      lowerJaw.position.y = -.035; upperJaw.position.y = .045;
      const hinge = cylinder(.09, .34, dark, 28); hinge.rotation.z = Math.PI / 2; hinge.position.set(0, .015, .15); clip.add(hinge);
      clip.add(lowerJaw, upperJaw);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(.15, .48, 10, 24), colourMaterial); sleeve.rotation.x = Math.PI / 2; sleeve.position.set(0, .02, .49); clip.add(sleeve);
      const cableFerrule = cylinder(.075, .17, dark, 24); cableFerrule.rotation.x = Math.PI / 2; cableFerrule.position.set(0, .02, .84); clip.add(cableFerrule);
      clip.scale.setScalar(.74); clip.rotation.y = Math.PI;
      Object.assign(clip.userData, { upperJaw, lowerJaw, fixed, serratedJaws: true });
      return shadowReady(clip);
    };
    const contactX = rulerStartX + rulerLength * Math.max(20, Math.min(100, state.wireLengthCm || 20)) / 100;
    const initialMeasuredLength = contactX - rulerStartX;
    measuredSegment.position.x = rulerStartX + initialMeasuredLength / 2;
    measuredSegment.scale.set(1, initialMeasuredLength, 1);
    const fixedClip = makeCrocodile(red, true); fixedClip.position.set(rulerStartX, .34, rulerZ + .02); g.add(fixedClip);
    const sliderClip = makeCrocodile(black); sliderClip.position.set(contactX, .34, rulerZ + .02); g.add(sliderClip);

    const makeDisplay = (label, accent) => {
      const meter = new THREE.Group(), body = new THREE.Mesh(roundedBox(1.3, .76, .64, .09, 5), new THREE.MeshPhysicalMaterial({ color: 0xe9edef, roughness: .3, clearcoat: .62 }));
      body.position.y = .38; meter.add(body);
      const bezel = new THREE.Mesh(roundedBox(1.02, .4, .05, .045, 4), dark); bezel.position.set(0, .47, .345); meter.add(bezel);
      const canvas = document.createElement('canvas'), dc = canvas.getContext('2d'); canvas.width = 512; canvas.height = 180;
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(.91, .31), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, depthWrite: false }));
      screen.position.set(0, .48, .405); screen.renderOrder = 7; meter.add(screen);
      for (const [x, c] of [[-.4, 0x171c22], [.4, 0xd83e43]]) {
        const terminal = cylinder(.075, .11, solid(c, .25), 28); terminal.rotation.x = Math.PI / 2; terminal.position.set(x, .18, .37); meter.add(terminal);
      }
      const badgeCanvas = document.createElement('canvas'), bc = badgeCanvas.getContext('2d'); badgeCanvas.width = 256; badgeCanvas.height = 64;
      bc.fillStyle = `#${accent.toString(16).padStart(6, '0')}`; bc.fillRect(0, 0, 256, 64); bc.fillStyle = '#ffffff'; bc.font = '800 25px Inter, sans-serif'; bc.textAlign = 'center'; bc.textBaseline = 'middle'; bc.fillText(label, 128, 32);
      const badgeTexture = new THREE.CanvasTexture(badgeCanvas); badgeTexture.colorSpace = THREE.SRGBColorSpace;
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(.88, .16), new THREE.MeshBasicMaterial({ map: badgeTexture, toneMapped: false }));
      badge.position.set(0, .74, .34); meter.add(badge);
      Object.assign(meter.userData, { display: { canvas, context: dc, texture }, meterLabel: label });
      return shadowReady(meter);
    };
    const ammeter = makeDisplay('A · SERIES', 0xd45757); ammeter.position.set(.28, 0, -1.04); g.add(ammeter);
    const voltmeter = makeDisplay('V · PARALLEL', 0x9b54a1); voltmeter.position.set(1.9, 0, -1.04); g.add(voltmeter);

    // Regulated low-voltage supply with a live indicator.
    const supply = new THREE.Group(), supplyBody = new THREE.Mesh(roundedBox(1.55, .88, .75, .1, 6), new THREE.MeshPhysicalMaterial({ color: 0x385a99, roughness: .24, metalness: .16, clearcoat: .8 }));
    supplyBody.position.y = .44; supply.add(supplyBody);
    const supplyFace = new THREE.Mesh(roundedBox(1.25, .5, .045, .05, 4), solid(0x132836, .42)); supplyFace.position.set(0, .49, .4); supply.add(supplyFace);
    const supplyCanvas = document.createElement('canvas'), sc = supplyCanvas.getContext('2d'); supplyCanvas.width = 512; supplyCanvas.height = 170;
    const supplyTexture = new THREE.CanvasTexture(supplyCanvas); supplyTexture.colorSpace = THREE.SRGBColorSpace;
    const supplyScreen = new THREE.Mesh(new THREE.PlaneGeometry(.82, .27), new THREE.MeshBasicMaterial({ map: supplyTexture, toneMapped: false, depthWrite: false })); supplyScreen.position.set(-.08, .53, .455); supplyScreen.renderOrder = 7; supply.add(supplyScreen);
    const powerLed = new THREE.Mesh(new THREE.SphereGeometry(.055, 24, 16), new THREE.MeshStandardMaterial({ color: 0x40575d, emissive: 0x26ffaf, emissiveIntensity: 0 }));
    powerLed.position.set(.52, .58, .44); supply.add(powerLed);
    for (const [x, c] of [[-.45, 0x171c22], [.45, 0xd83e43]]) { const terminal = cylinder(.075, .12, solid(c, .24), 28); terminal.rotation.x = Math.PI / 2; terminal.position.set(x, .22, .43); supply.add(terminal) }
    supply.position.set(-2.35, 0, -1.02); g.add(supply);

    // The switch now occupies the instrument row between the supply and
    // ammeter, so the series path reads naturally from left to right.
    const switchCenterX = -1.02, switchZ = -.72;
    const switchBase = new THREE.Mesh(roundedBox(.92, .11, .55, .055, 4), new THREE.MeshPhysicalMaterial({ color: 0xf2f0e7, roughness: .32, clearcoat: .5 }));
    switchBase.position.set(switchCenterX, .075, switchZ); g.add(switchBase);
    const switchInputX = switchCenterX - .23, switchOutputX = switchCenterX + .23;
    for (const x of [switchInputX, switchOutputX]) { const post = cylinder(.065, .15, brass, 28); post.position.set(x, .2, switchZ); g.add(post) }
    const switchPivot = new THREE.Group(); switchPivot.position.set(switchInputX, .29, switchZ);
    const switchArm = new THREE.Mesh(new THREE.BoxGeometry(.54, .045, .11), brass); switchArm.position.x = .27; switchPivot.add(switchArm);
    const switchGrip = new THREE.Mesh(new THREE.SphereGeometry(.085, 24, 16), red); switchGrip.position.x = .54; switchPivot.add(switchGrip);
    switchPivot.rotation.z = .42; g.add(switchPivot);

    // Flexible leads are routed in separated cable lanes. The thick red/black
    // leads form the series loop; the thinner violet pair connects only across
    // the two test-length endpoints, making the voltmeter branch unmistakable.
    const makeFlexibleLead = (points, material, radius = .023) => {
      const lead = new THREE.Group(), segments = [], joints = [];
      for (let i = 0; i < points.length - 1; i++) {
        const segment = cylinder(radius, 1, material, 14); lead.add(segment); segments.push(segment);
      }
      for (let i = 1; i < points.length - 1; i++) {
        const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 12, 8), material); lead.add(joint); joints.push(joint);
      }
      g.add(lead); return { lead, segments, joints, points: points.map(point => point.clone()) };
    };
    const updateFlexibleLead = lead => {
      for (let i = 0; i < lead.segments.length; i++) {
        const a = lead.points[i], b = lead.points[i + 1], delta = b.clone().sub(a), length = delta.length(), segment = lead.segments[i];
        segment.position.copy(a).add(b).multiplyScalar(.5); segment.scale.set(1, length, 1);
        segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      }
      for (let i = 0; i < lead.joints.length; i++) lead.joints[i].position.copy(lead.points[i + 1]);
    };
    const clipAnchorZ = rulerZ - .59;
    const fixedAnchor = new THREE.Vector3(rulerStartX, .36, clipAnchorZ), sliderAnchor = new THREE.Vector3(contactX, .36, clipAnchorZ);
    const supplyNegative = new THREE.Vector3(-2.8, .22, -.59), supplyPositive = new THREE.Vector3(-1.9, .22, -.59);
    const ammeterNegative = new THREE.Vector3(-.12, .18, -.67), ammeterPositive = new THREE.Vector3(.68, .18, -.67);
    const voltmeterNegative = new THREE.Vector3(1.5, .18, -.67), voltmeterPositive = new THREE.Vector3(2.3, .18, -.67);
    const fixedLead = makeFlexibleLead([fixedAnchor, new THREE.Vector3(rulerStartX, .12, -.14), new THREE.Vector3(-.12, .12, -.14), ammeterNegative], black);
    const sliderLead = makeFlexibleLead([sliderAnchor, new THREE.Vector3(contactX + .16, .1, 1.48), new THREE.Vector3(-3.02, .1, 1.48), new THREE.Vector3(-3.02, .14, -.59), supplyNegative], black);
    const voltFixedLead = makeFlexibleLead([fixedAnchor.clone().add(new THREE.Vector3(0, .035, .045)), new THREE.Vector3(rulerStartX, .115, 1.2), new THREE.Vector3(2.3, .115, 1.2), voltmeterPositive], voltageRed, .017);
    const voltSliderLead = makeFlexibleLead([sliderAnchor.clone().add(new THREE.Vector3(0, .035, -.045)), new THREE.Vector3(contactX + .12, .105, 1.02), new THREE.Vector3(1.5, .105, 1.02), voltmeterNegative], voltageBlack, .017);
    const circuitLeadA = makeFlexibleLead([supplyPositive, new THREE.Vector3(-1.72, .12, -.76), new THREE.Vector3(switchInputX, .2, switchZ)], red);
    const circuitLeadB = makeFlexibleLead([new THREE.Vector3(switchOutputX, .2, switchZ), new THREE.Vector3(-.42, .12, -.76), ammeterPositive], red);
    [fixedLead, sliderLead, voltFixedLead, voltSliderLead, circuitLeadA, circuitLeadB].forEach(updateFlexibleLead);

    const chargeParticles = [];
    const chargeMat = new THREE.MeshBasicMaterial({ color: 0xffbb6a, transparent: true, opacity: .88, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 34; i++) {
      const particle = new THREE.Mesh(new THREE.SphereGeometry(.025, 12, 8), chargeMat.clone()); particle.visible = false; particle.renderOrder = 12; g.add(particle);
      chargeParticles.push({ mesh: particle, phase: i / 34 });
    }
    this.dynamic.push({
      kind: 'wireResistance',
      rulerStartX, rulerLength, rulerZ, clipAnchorZ, measuredSegment, sliderClip, sliderUpperJaw: sliderClip.userData.upperJaw, sliderLowerJaw: sliderClip.userData.lowerJaw,
      sliderLead, voltSliderLead, fixedLead, voltFixedLead, circuitLeadA, circuitLeadB, updateFlexibleLead,
      ammeterDisplay: ammeter.userData.display, voltmeterDisplay: voltmeter.userData.display,
      supplyDisplay: { canvas: supplyCanvas, context: sc, texture: supplyTexture }, powerLed, switchPivot, wireMaterial, chargeParticles
    });
    Object.assign(g.userData, {
      wireResistanceRig: true,
      rulerRangeCm: [0, 100],
      slidingCrocodileContact: true,
      uniformNichromeWire: true,
      circuitLayout: {
        seriesPath: 'supply positive → switch → ammeter → fixed contact → nichrome test length → sliding contact → supply negative',
        parallelPath: 'voltmeter connected directly across fixed and sliding contacts',
        separatedCableLanes: true,
        ammeterRoleLabel: 'series',
        voltmeterRoleLabel: 'parallel'
      }
    });
    return shadowReady(g);
  }
  magneticFieldRig(state) {
    const g = new THREE.Group(), paperY = .47, paperWidth = 6.15, paperDepth = 3.58;
    const acrylicMat = new THREE.MeshPhysicalMaterial({ color: 0xcceeff, transparent: true, opacity: .26, transmission: .72, roughness: .05, thickness: .08, clearcoat: .8, depthWrite: false });
    const acrylic = new THREE.Mesh(roundedBox(6.35, .12, 3.78, .07, 5), acrylicMat); acrylic.position.set(0, .29, .05); acrylic.renderOrder = 2; g.add(acrylic);
    for (const x of [-2.9, 2.9]) for (const z of [-1.55, 1.55]) {
      const foot = cylinder(.12, .24, new THREE.MeshPhysicalMaterial({ color: 0xdde9ea, metalness: .42, roughness: .24 }), 32);
      foot.position.set(x, .12, z); g.add(foot);
    }
    const paperMat = new THREE.MeshPhysicalMaterial({ color: 0xfffdf4, transparent: true, opacity: .91, roughness: .92, transmission: .015, side: THREE.DoubleSide, depthWrite: false });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(paperWidth, paperDepth, 36, 22), paperMat); paper.rotation.x = -Math.PI / 2; paper.position.set(0, paperY, .05); paper.renderOrder = 5; g.add(paper);
    const paperEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(paperWidth, .018, paperDepth)), new THREE.LineBasicMaterial({ color: 0xb9ad96, transparent: true, opacity: .72 }));
    paperEdge.position.set(0, paperY, .05); g.add(paperEdge);

    const makePoleLabel = (letter, colour) => {
      const c = document.createElement('canvas'), dc = c.getContext('2d'); c.width = c.height = 128;
      dc.fillStyle = `#${colour.toString(16).padStart(6, '0')}`; dc.fillRect(0, 0, 128, 128); dc.fillStyle = '#fff'; dc.font = '800 78px Inter, sans-serif'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(letter, 64, 66);
      const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(.36, .36), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, depthTest: false, depthWrite: false }));
      label.rotation.x = -Math.PI / 2; label.renderOrder = 7; return label;
    };
    const makeBarMagnet = (length = 1.85, northOnLeft = true) => {
      const magnet = new THREE.Group(), half = length / 2;
      const northColour = 0xd84f52, southColour = 0x3777b8;
      const leftColour = northOnLeft ? northColour : southColour, rightColour = northOnLeft ? southColour : northColour;
      const left = new THREE.Mesh(roundedBox(half, .24, .56, .055, 5), new THREE.MeshPhysicalMaterial({ color: leftColour, roughness: .26, metalness: .18, clearcoat: .74 }));
      const right = new THREE.Mesh(roundedBox(half, .24, .56, .055, 5), new THREE.MeshPhysicalMaterial({ color: rightColour, roughness: .26, metalness: .18, clearcoat: .74 }));
      left.position.x = -half / 2; right.position.x = half / 2; magnet.add(left, right);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(.025, .255, .575), metal(0xe5e4dc, .18)); magnet.add(seam);
      const leftLabel = makePoleLabel(northOnLeft ? 'N' : 'S', leftColour); leftLabel.position.set(-half / 2, .132, 0); magnet.add(leftLabel);
      const rightLabel = makePoleLabel(northOnLeft ? 'S' : 'N', rightColour); rightLabel.position.set(half / 2, .132, 0); magnet.add(rightLabel);
      Object.assign(magnet.userData, { northOnLeft, length }); return shadowReady(magnet);
    };
    const configurations = [
      (() => { const group = new THREE.Group(), magnet = makeBarMagnet(2.15, true); group.add(magnet); return group })(),
      (() => { const group = new THREE.Group(), left = makeBarMagnet(1.72, true), right = makeBarMagnet(1.72, true); left.position.x = -1.35; right.position.x = 1.35; group.add(left, right); return group })(),
      (() => { const group = new THREE.Group(), left = makeBarMagnet(1.72, false), right = makeBarMagnet(1.72, true); left.position.x = -1.35; right.position.x = 1.35; group.add(left, right); return group })()
    ];
    configurations.forEach((configuration, index) => {
      configuration.position.set(index === state.fieldConfigIndex ? 0 : 7 + index * .4, .31, .05);
      configuration.visible = index === state.fieldConfigIndex;
      g.add(configuration);
    });

    const poleDefinitions = [
      [{ x: -1.02, z: .05, q: 1 }, { x: 1.02, z: .05, q: -1 }],
      [{ x: -1.78, z: .05, q: 1 }, { x: -.92, z: .05, q: -1 }, { x: .92, z: .05, q: 1 }, { x: 1.78, z: .05, q: -1 }],
      [{ x: -1.78, z: .05, q: -1 }, { x: -.92, z: .05, q: 1 }, { x: .92, z: .05, q: 1 }, { x: 1.78, z: .05, q: -1 }]
    ][state.fieldConfigIndex || 0];
    const localField = (x, z) => {
      let bx = 0, bz = 0, magnitude = 0;
      for (const pole of poleDefinitions) {
        const dx = x - pole.x, dz = z - pole.z, r2 = dx * dx + dz * dz + .045, inv = pole.q / Math.pow(r2, 1.5);
        bx += dx * inv; bz += dz * inv; magnitude += Math.abs(inv);
      }
      return { bx, bz, magnitude };
    };
    let seed = 7391 + (state.fieldConfigIndex || 0) * 1709;
    const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    const filings = [], filingMat = new THREE.MeshPhysicalMaterial({ color: 0x41484b, metalness: .9, roughness: .23, clearcoat: .12 });
    const filingGeo = new THREE.BoxGeometry(.11, .015, .022);
    for (let row = 0; row < 15; row++) for (let col = 0; col < 25; col++) {
      const x = -2.88 + col * (5.76 / 24) + (random() - .5) * .075, z = -1.53 + row * (3.06 / 14) + (random() - .5) * .075;
      const field = localField(x, z), finalAngle = -Math.atan2(field.bz, field.bx), initialAngle = random() * Math.PI * 2;
      const mesh = new THREE.Mesh(filingGeo, filingMat.clone()), start = new THREE.Vector3(x + (random() - .5) * .13, paperY + .025, z + (random() - .5) * .13);
      mesh.position.copy(start); mesh.rotation.y = initialAngle; mesh.scale.x = .62 + Math.min(.8, Math.sqrt(field.magnitude) * .095) + random() * .28;
      mesh.visible = false; mesh.renderOrder = 8; mesh.castShadow = false; g.add(mesh);
      filings.push({ mesh, start, target: new THREE.Vector3(x, paperY + .025, z), initialAngle, finalAngle, threshold: random() * .88, hopPhase: random() * Math.PI * 2 });
    }

    // Clear shaker with a perforated metal lid and visible reservoir of fine filings.
    const shaker = new THREE.Group(), shakerGlass = new THREE.MeshPhysicalMaterial({ color: 0xe4f7fb, transparent: true, opacity: .42, transmission: .62, roughness: .04, clearcoat: .8, depthWrite: false });
    const shakerBody = new THREE.Mesh(new THREE.CylinderGeometry(.32, .35, .82, 56, 1, true), shakerGlass); shakerBody.position.y = .47; shaker.add(shakerBody);
    const shakerBottom = cylinder(.34, .055, shakerGlass, 56); shakerBottom.position.y = .06; shaker.add(shakerBottom);
    const reservoir = cylinder(.29, .28, new THREE.MeshStandardMaterial({ color: 0x363c3e, metalness: .74, roughness: .36 }), 48); reservoir.position.y = .2; shaker.add(reservoir);
    const lid = cylinder(.36, .13, metal(0xaeb9bc, .18), 56); lid.position.y = .93; shaker.add(lid);
    for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 8 + ring * 4; i++) {
      const a = i / (8 + ring * 4) * Math.PI * 2, r = .08 + ring * .085;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .145, 12), solid(0x12191d, .8));
      hole.position.set(Math.cos(a) * r, .94, Math.sin(a) * r); shaker.add(hole);
    }
    const shakerStart = new THREE.Vector3(-2.85, .48, 1.72); shaker.position.copy(shakerStart); shaker.scale.setScalar(.86); g.add(shaker);
    const fallingGrains = [];
    for (let i = 0; i < 72; i++) {
      const grain = new THREE.Mesh(new THREE.SphereGeometry(.014 + (i % 3) * .004, 8, 6), filingMat.clone()); grain.visible = false; grain.renderOrder = 10; grain.castShadow = false; g.add(grain);
      fallingGrains.push({ mesh: grain, phase: (i % 18) / 18, lane: Math.floor(i / 18), lateral: (random() - .5) * .18 });
    }

    // Soft rubber-tipped tapping tool and a wide natural-bristle clearing brush.
    const tapper = new THREE.Group(), tapHandle = this.tubeBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.12, 0), .075, new THREE.MeshStandardMaterial({ color: 0xc38b4a, roughness: .68 }));
    tapper.add(tapHandle); const tapTip = new THREE.Mesh(new THREE.SphereGeometry(.13, 28, 18), new THREE.MeshPhysicalMaterial({ color: 0x526067, roughness: .72 })); tapTip.scale.y = .65; tapper.add(tapTip);
    tapper.position.set(2.9, .18, 1.72); tapper.rotation.z = -.28; g.add(tapper);
    const brush = new THREE.Group(), brushHandle = new THREE.Mesh(roundedBox(1.85, .18, .28, .075, 5), new THREE.MeshPhysicalMaterial({ color: 0xb87942, roughness: .65, clearcoat: .22 }));
    brushHandle.position.x = -.72; brush.add(brushHandle);
    const brushHead = new THREE.Mesh(roundedBox(.65, .22, .68, .06, 4), new THREE.MeshPhysicalMaterial({ color: 0x825231, roughness: .72 })); brushHead.position.x = .48; brush.add(brushHead);
    for (let i = 0; i < 18; i++) {
      const bristle = new THREE.Mesh(new THREE.BoxGeometry(.025, .25, .5), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe1c49b : 0xcaa97a, roughness: .9 }));
      bristle.position.set(.2 + (i % 6) * .11, -.21, (Math.floor(i / 6) - 1) * .12); brush.add(bristle);
    }
    brush.position.set(-3.9, .9, 1.48); brush.scale.setScalar(.8); brush.visible = false; g.add(brush);

    this.dynamic.push({
      kind: 'magneticField', paper, paperEdge, paperY, filings, shaker, shakerStart, fallingGrains, tapper, brush,
      configurationGroups: configurations, currentConfiguration: state.fieldConfigIndex || 0
    });
    Object.assign(g.userData, { magneticFieldRig: true, paperOnClearSupport: true, magnetsBelowPaper: true, individuallyModelledFilings: filings.length });
    return shadowReady(g);
  }
  hookeLawRig(state) {
    const g = new THREE.Group(), clamp = value => Math.max(0, Math.min(1, value));
    const smooth = value => { value = clamp(value); return value * value * (3 - 2 * value) };
    const extensionSeriesCm = [0, 2, 4, 6, 8, 10, 13], stage = state.hookeStage || 0;
    const declaredForce = Math.max(0, Math.min(6, Math.round(state.hookeForceN || 0)));
    const trialForce = Math.max(0, Math.min(6, Math.round(state.hookeTrialIndex || 0)));
    const visualForce = stage === 1 ? Math.max(1, declaredForce, trialForce) : Math.max(declaredForce, trialForce);
    const previousForce = stage === 1 ? Math.max(0, visualForce - 1) : visualForce;
    const steel = new THREE.MeshPhysicalMaterial({ color: 0xc4cdd0, metalness: .94, roughness: .13, clearcoat: .5, clearcoatRoughness: .1 });
    const darkSteel = metal(0x35474f, .22), black = solid(0x18262c, .35), brass = metal(0xc89d3c, .18);
    const massMaterial = new THREE.MeshPhysicalMaterial({ color: 0x8d969a, metalness: .9, roughness: .19, clearcoat: .36 });
    const springMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd6dfe1, metalness: .96, roughness: .095, clearcoat: .62, clearcoatRoughness: .08 });
    const springX = -.3, springZ = .14, springTopY = 2.92, baseSpringLength = 1.03, scenePerCm = .075;
    const zeroPointerY = springTopY - baseSpringLength - .16, rulerX = .72, rulerTopY = 3.3, rulerBottomY = .43;

    // Heavy retort stand, boss and a proper two-jaw spring clamp.
    const base = new THREE.Mesh(roundedBox(1.62, .17, 1.18, .085, 6), new THREE.MeshPhysicalMaterial({ color: 0x263a43, metalness: .78, roughness: .24, clearcoat: .4 }));
    base.position.set(-1.17, .085, -.22); g.add(base);
    const baseInset = new THREE.Mesh(roundedBox(1.36, .035, .93, .04, 4), new THREE.MeshStandardMaterial({ color: 0x51656d, metalness: .58, roughness: .32 }));
    baseInset.position.set(-1.17, .185, -.22); g.add(baseInset);
    const standRod = cylinder(.065, 3.36, steel, 40); standRod.position.set(-1.42, 1.82, -.48); g.add(standRod);
    const boss = new THREE.Mesh(roundedBox(.42, .36, .42, .065, 5), darkSteel); boss.position.set(-1.42, 3.03, -.42); g.add(boss);
    const bossScrew = cylinder(.075, .34, brass, 28); bossScrew.rotation.z = Math.PI / 2; bossScrew.position.set(-1.62, 3.03, -.42); g.add(bossScrew);
    const clampArm = this.tubeBetween(new THREE.Vector3(-1.28, 3.03, -.4), new THREE.Vector3(springX - .08, 3.03, springZ), .05, steel); g.add(clampArm);
    const clampBridge = new THREE.Mesh(roundedBox(.43, .16, .34, .045, 4), darkSteel); clampBridge.position.set(springX - .08, 3.03, springZ); g.add(clampBridge);
    for (const side of [-1, 1]) {
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(.085, .28, .2), steel); jaw.position.set(springX + side * .11, 2.9, springZ); jaw.rotation.z = side * .08; g.add(jaw);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(.07, .12, .22), black); pad.position.set(springX + side * .055, 2.83, springZ); g.add(pad);
    }

    // White vertical ruler with a full-height scale that starts at zero at
    // its top edge, plus a red 10 cm limit-of-proportionality marker.
    const ruler = new THREE.Mesh(roundedBox(.49, rulerTopY - rulerBottomY, .085, .028, 3), new THREE.MeshPhysicalMaterial({ color: 0xf7f8f2, roughness: .42, clearcoat: .28 }));
    ruler.position.set(rulerX, (rulerTopY + rulerBottomY) / 2, .03); g.add(ruler);
    const rulerEdge = new THREE.Mesh(new THREE.BoxGeometry(.035, rulerTopY - rulerBottomY - .08, .105), metal(0x929fa4, .24)); rulerEdge.position.set(rulerX + .25, (rulerTopY + rulerBottomY) / 2, .03); g.add(rulerEdge);
    const rulerScaleTopY = rulerTopY - .07, rulerScaleBottomY = rulerBottomY + .07;
    const rulerScaleMaxMm = Math.floor((rulerScaleTopY - rulerScaleBottomY) / scenePerCm * 5) * 2;
    const tickMaterial = new THREE.MeshBasicMaterial({ color: 0x27383e, toneMapped: false }), rulerLabels = [], rulerTickMeshes = [];
    const makeLabel = (label, width = .28, height = .12, colour = '#26383e', fontSize = 34) => {
      const canvas = document.createElement('canvas'), dc = canvas.getContext('2d'); canvas.width = 256; canvas.height = 96;
      dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = colour; dc.font = `800 ${fontSize}px ui-monospace, Menlo, monospace`; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(label, 128, 48);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false })); mesh.renderOrder = 11; rulerLabels.push(mesh); return mesh;
    };
    const tickDefinitions = [
      { length: .22, values: [] },
      { length: .16, values: [] },
      { length: .1, values: [] }
    ];
    for (let mm = 0; mm <= rulerScaleMaxMm; mm++) {
      const rulerReadingCm = mm / 10, y = rulerScaleTopY - rulerReadingCm * scenePerCm, centimetre = mm % 10 === 0, fiveMm = mm % 5 === 0;
      tickDefinitions[centimetre ? 0 : fiveMm ? 1 : 2].values.push(y);
      if (centimetre && mm % 20 === 0) { const label = makeLabel(String(Math.round(rulerReadingCm))); label.position.set(rulerX + .08, y, .088); g.add(label) }
    }
    for (const definition of tickDefinitions) {
      const geometry = new THREE.BoxGeometry(definition.length, .0075, .012), ticks = new THREE.InstancedMesh(geometry, tickMaterial, definition.values.length), matrix = new THREE.Matrix4();
      definition.values.forEach((y, index) => { matrix.makeTranslation(rulerX - .235 + definition.length / 2, y, .087); ticks.setMatrixAt(index, matrix) });
      ticks.instanceMatrix.needsUpdate = true; ticks.castShadow = false; ticks.receiveShadow = false; rulerTickMeshes.push(ticks); g.add(ticks);
    }
    const limitY = zeroPointerY - 10 * scenePerCm;
    const limitLine = new THREE.Mesh(new THREE.BoxGeometry(.5, .014, .018), new THREE.MeshBasicMaterial({ color: 0xc74f52, toneMapped: false })); limitLine.position.set(rulerX, limitY, .095); g.add(limitLine);
    const limitLabel = makeLabel('5 N LIMIT', .48, .11, '#b53f44', 25); limitLabel.position.set(rulerX + .43, limitY, .09); g.add(limitLabel);

    // One continuous, polished steel helix. Scaling only its axial direction
    // changes coil pitch while the separate terminal hooks keep their shape.
    const helixTurns = 18, helixRadius = .17, helixPoints = [];
    for (let i = 0; i <= helixTurns * 14; i++) {
      const q = i / (helixTurns * 14), angle = q * helixTurns * Math.PI * 2;
      helixPoints.push(new THREE.Vector3(Math.cos(angle) * helixRadius, -q * baseSpringLength, Math.sin(angle) * helixRadius));
    }
    const springHelix = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPoints), helixTurns * 16, .024, 10, false), springMaterial);
    springHelix.position.set(springX, springTopY, springZ); g.add(springHelix);
    const topHook = new THREE.Mesh(new THREE.TorusGeometry(.13, .024, 10, 54, Math.PI * 1.72), springMaterial); topHook.position.set(springX, springTopY + .08, springZ); topHook.rotation.z = -.35; g.add(topHook);
    const topStem = this.tubeBetween(new THREE.Vector3(springX, springTopY + .01, springZ), new THREE.Vector3(springX, springTopY + .13, springZ), .024, springMaterial); g.add(topStem);
    const bottomHook = new THREE.Group();
    const bottomRing = new THREE.Mesh(new THREE.TorusGeometry(.13, .024, 10, 54, Math.PI * 1.72), springMaterial); bottomRing.rotation.z = Math.PI + .35; bottomRing.position.y = -.08; bottomHook.add(bottomRing);
    bottomHook.add(this.tubeBetween(new THREE.Vector3(0, .015, 0), new THREE.Vector3(0, -.13, 0), .024, springMaterial)); g.add(bottomHook);

    // A tared mass hanger and six individually modelled 100 g slotted discs.
    const slotOuter = .175, slotInner = .055, slotHalf = .03, outerAngle = Math.asin(slotHalf / slotOuter), innerAngle = Math.asin(slotHalf / slotInner);
    const slotShape = new THREE.Shape(); slotShape.moveTo(Math.cos(outerAngle) * slotOuter, slotHalf);
    for (let i = 1; i <= 48; i++) { const angle = outerAngle + (Math.PI * 2 - outerAngle * 2) * i / 48; slotShape.lineTo(Math.cos(angle) * slotOuter, Math.sin(angle) * slotOuter) }
    slotShape.lineTo(Math.cos(innerAngle) * slotInner, -slotHalf);
    for (let i = 1; i <= 30; i++) { const angle = -innerAngle - (Math.PI * 2 - innerAngle * 2) * i / 30; slotShape.lineTo(Math.cos(angle) * slotInner, Math.sin(angle) * slotInner) }
    slotShape.closePath();
    const discGeometry = new THREE.ExtrudeGeometry(slotShape, { depth: .045, bevelEnabled: true, bevelSegments: 3, bevelSize: .006, bevelThickness: .005, curveSegments: 36 }); discGeometry.center(); discGeometry.rotateX(Math.PI / 2);
    const hanger = new THREE.Group(), hangerRing = new THREE.Mesh(new THREE.TorusGeometry(.085, .014, 9, 36), steel); hangerRing.position.y = 0; hanger.add(hangerRing);
    const hangerStem = cylinder(.024, .5, steel, 24); hangerStem.position.y = -.29; hanger.add(hangerStem);
    const hangerPlate = cylinder(.23, .055, steel, 48); hangerPlate.position.y = -.54; hanger.add(hangerPlate);
    const hangerLip = new THREE.Mesh(new THREE.TorusGeometry(.23, .018, 9, 48), steel); hangerLip.rotation.x = Math.PI / 2; hangerLip.position.y = -.51; hanger.add(hangerLip);
    const attachedDiscCount = stage === 1 ? previousForce : visualForce, attachedDiscs = [];
    for (let i = 0; i < attachedDiscCount; i++) { const disc = new THREE.Mesh(discGeometry, massMaterial); disc.position.y = -.49 + i * .052; disc.rotation.y = -.12; hanger.add(disc); attachedDiscs.push(disc) }
    g.add(hanger);

    // A catch tray sits directly below the suspended load; a separate storage
    // tray keeps the remaining discs organised to the right.
    const catchTray = new THREE.Mesh(roundedBox(.94, .075, .72, .045, 4), new THREE.MeshPhysicalMaterial({ color: 0xd8e1e3, metalness: .58, roughness: .3, clearcoat: .28 })); catchTray.position.set(-.2, .045, .16); g.add(catchTray);
    const catchWell = new THREE.Mesh(roundedBox(.78, .018, .57, .035, 3), new THREE.MeshStandardMaterial({ color: 0x6f7f84, metalness: .42, roughness: .5 })); catchWell.position.set(-.2, .088, .16); g.add(catchWell);
    const catchStripe = new THREE.Mesh(new THREE.BoxGeometry(.82, .012, .045), new THREE.MeshBasicMaterial({ color: 0xe5a840, toneMapped: false })); catchStripe.position.set(-.2, .102, .47); g.add(catchStripe);
    const tray = new THREE.Mesh(roundedBox(1.72, .13, 1.03, .065, 5), new THREE.MeshPhysicalMaterial({ color: 0xdfe5e6, metalness: .65, roughness: .3, clearcoat: .3 })); tray.position.set(2.05, .075, .48); g.add(tray);
    const trayWell = new THREE.Mesh(roundedBox(1.48, .025, .8, .045, 4), new THREE.MeshStandardMaterial({ color: 0x66767b, metalness: .4, roughness: .48 })); trayWell.position.set(2.05, .15, .48); g.add(trayWell);
    const trayLabel = makeLabel('6 × 100 g', .75, .16, '#f4fbfb', 30); trayLabel.rotation.x = -Math.PI / 2; trayLabel.position.set(2.05, .175, .79); g.add(trayLabel);
    const trayPositions = [];
    for (let i = 0; i < 6; i++) {
      const row = Math.floor(i / 3), column = i % 3;
      trayPositions.push(new THREE.Vector3(1.48 + column * .48 + row * .16, .205 + row * .058, .3 + row * .34));
    }
    const movingDiscIndex = stage === 1 ? visualForce - 1 : -1, spareDiscs = [];
    for (let i = 0; i < 6; i++) {
      const disc = new THREE.Mesh(discGeometry, massMaterial); disc.position.copy(trayPositions[i]); disc.rotation.y = -.12 + i * .18;
      disc.visible = i >= attachedDiscCount && i !== movingDiscIndex; g.add(disc); spareDiscs.push(disc);
    }
    const movingDisc = new THREE.Mesh(discGeometry, massMaterial); movingDisc.visible = stage === 1 && movingDiscIndex >= 0; movingDisc.position.copy(trayPositions[Math.max(0, movingDiscIndex)] || trayPositions[0]); g.add(movingDisc);

    // Red fiducial pointer moves rigidly with the lower hook and hanger.
    const pointer = new THREE.Group(), pointerShaft = this.tubeBetween(new THREE.Vector3(springX + .05, 0, springZ + .05), new THREE.Vector3(rulerX - .28, 0, .1), .018, new THREE.MeshStandardMaterial({ color: 0xc43e43, roughness: .42 })); pointer.add(pointerShaft);
    const pointerTip = new THREE.Mesh(new THREE.ConeGeometry(.055, .16, 24), new THREE.MeshStandardMaterial({ color: 0xd84a4d, roughness: .34 })); pointerTip.rotation.z = -Math.PI / 2; pointerTip.position.set(rulerX - .22, 0, .1); pointer.add(pointerTip); g.add(pointer);

    const settledExtensionCm = extensionSeriesCm[visualForce], initialLength = baseSpringLength + settledExtensionCm * scenePerCm;
    springHelix.scale.y = initialLength / baseSpringLength;
    const initialBodyBottomY = springTopY - initialLength; bottomHook.position.set(springX, initialBodyBottomY, springZ);
    hanger.position.set(springX, initialBodyBottomY - .16, springZ); pointer.position.y = zeroPointerY - settledExtensionCm * scenePerCm;

    this.dynamic.push({
      kind: 'hookeLaw', springHelix, bottomHook, hanger, pointer, movingDisc, movingDiscStart: trayPositions[Math.max(0, movingDiscIndex)]?.clone() || trayPositions[0].clone(),
      springX, springZ, springTopY, baseSpringLength, scenePerCm, zeroPointerY, extensionSeriesCm, visualForce, previousForce, movingDiscIndex
    });
    Object.assign(g.userData, {
      hookeLawRig: true,
      apparatus: { clampStand: 'heavy metal base, rod, boss and two-jaw clamp', ruler: 'vertical white 0–36.4 cm length scale with fiducial pointer', massHanger: 'tared steel hanger' },
      spring: { material: 'polished steel', helicalTurns: helixTurns, terminalHooks: 2, unloadedLengthSceneUnits: baseSpringLength, extensionSeriesCm, proportionalFitSpringConstantNPerM: 50, limitOfProportionalityN: 5 },
      slottedMasses: { individuallyModelled: 6, eachMassG: 100, appliedForcePerDiscN: 1, attached: attachedDiscCount, spareTray: true, staggeredForVisibility: true },
      safetyCatchTray: { directlyBelowHanger: true, centre: catchTray.position.toArray(), raisedRim: true },
      animation: { durationS: 3.4, movingDiscFromTray: stage === 1, dampedSpringSettling: stage === 1, coupledParts: ['coil pitch', 'lower hook', 'hanger', 'pointer'] }
    });
    const rig = shadowReady(g);
    for (const mesh of [...rulerTickMeshes, ...rulerLabels]) { mesh.castShadow = false; mesh.receiveShadow = false }
    return rig;
  }
  specificHeatRig(state) {
    const g = new THREE.Group(), clamp = value => Math.max(0, Math.min(1, value));
    const smooth = value => { value = clamp(value); return value * value * (3 - 2 * value) }, stage = state.shcStage || 0;
    const aluminium = new THREE.MeshPhysicalMaterial({ color: 0xaebbc0, metalness: .88, roughness: .2, clearcoat: .48, emissive: 0x4a1404, emissiveIntensity: 0 });
    const steel = metal(0xc4ced1, .13), dark = solid(0x1c2c33, .36), red = new THREE.MeshStandardMaterial({ color: 0xc63e43, roughness: .45 }), black = new THREE.MeshStandardMaterial({ color: 0x19242a, roughness: .58 });
    const foam = new THREE.MeshPhysicalMaterial({ color: 0xd9e1dc, roughness: .88, metalness: 0, clearcoat: .06 }), pasteMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe9eef0, metalness: .18, roughness: .42, clearcoat: .3 });
    const blockX = .25, blockZ = .55, blockW = 1.55, blockH = 1.15, blockD = 1.22, blockBottomY = .14, blockTopY = blockBottomY + blockH;
    const heaterBore = new THREE.Vector3(blockX - .32, blockTopY, blockZ + .02), thermometerBore = new THREE.Vector3(blockX + .34, blockTopY, blockZ + .02);

    // One-kilogram aluminium calorimetry block with two dark, recessed bores.
    const block = new THREE.Mesh(roundedBox(blockW, blockH, blockD, .055, 6), aluminium); block.position.set(blockX, blockBottomY + blockH / 2, blockZ); g.add(block);
    const lowerPlate = new THREE.Mesh(roundedBox(blockW + .09, .08, blockD + .09, .035, 4), new THREE.MeshStandardMaterial({ color: 0x7f9096, metalness: .84, roughness: .26 })); lowerPlate.position.set(blockX, blockBottomY + .02, blockZ); g.add(lowerPlate);
    const boreMaterial = new THREE.MeshStandardMaterial({ color: 0x28373d, metalness: .58, roughness: .5, side: THREE.DoubleSide });
    for (const bore of [heaterBore, thermometerBore]) {
      const well = cylinder(.085, .94, boreMaterial, 40); well.position.set(bore.x, blockTopY - .47, bore.z); g.add(well);
      const opening = new THREE.Mesh(new THREE.TorusGeometry(.088, .014, 10, 42), steel); opening.rotation.x = Math.PI / 2; opening.position.set(bore.x, blockTopY + .018, bore.z); g.add(opening);
      const darkness = new THREE.Mesh(new THREE.CircleGeometry(.074, 36), new THREE.MeshBasicMaterial({ color: 0x17252b, toneMapped: false })); darkness.rotation.x = -Math.PI / 2; darkness.position.set(bore.x, blockTopY + .021, bore.z); g.add(darkness);
    }
    const massStamp = (() => { const canvas = document.createElement('canvas'), dc = canvas.getContext('2d'); canvas.width = 512; canvas.height = 128; dc.clearRect(0, 0, 512, 128); dc.fillStyle = '#3f535a'; dc.font = '800 58px Inter, sans-serif'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText('ALUMINIUM · 1.00 kg', 256, 64); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.18, .26), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false })); mesh.position.set(blockX, .67, blockZ + blockD / 2 + .031); mesh.renderOrder = 8; return mesh })(); g.add(massStamp);

    // Four side panels and a bored lid start opened out, then close snugly
    // around the block while leaving both probe collars accessible.
    const jacketPanels = [];
    const addJacketPanel = (geometry, closed, open, closedRotation, openRotation) => {
      const panel = new THREE.Mesh(geometry, foam); panel.position.copy(stage >= 2 ? closed : open); panel.rotation.copy(stage >= 2 ? closedRotation : openRotation); g.add(panel); jacketPanels.push({ mesh: panel, closed, open, closedRotation, openRotation }); return panel;
    };
    addJacketPanel(new THREE.BoxGeometry(.15, 1.03, blockD + .18), new THREE.Vector3(blockX - blockW / 2 - .105, .665, blockZ), new THREE.Vector3(blockX - 1.55, .16, blockZ + .12), new THREE.Euler(0, 0, 0), new THREE.Euler(0, 0, -1.45));
    addJacketPanel(new THREE.BoxGeometry(.15, 1.03, blockD + .18), new THREE.Vector3(blockX + blockW / 2 + .105, .665, blockZ), new THREE.Vector3(blockX + 1.55, .16, blockZ + .12), new THREE.Euler(0, 0, 0), new THREE.Euler(0, 0, 1.45));
    addJacketPanel(new THREE.BoxGeometry(blockW + .16, 1.03, .14), new THREE.Vector3(blockX, .665, blockZ - blockD / 2 - .1), new THREE.Vector3(blockX, .13, blockZ - 1.38), new THREE.Euler(0, 0, 0), new THREE.Euler(1.42, 0, 0));
    addJacketPanel(new THREE.BoxGeometry(blockW + .16, .76, .14), new THREE.Vector3(blockX, .53, blockZ + blockD / 2 + .1), new THREE.Vector3(blockX, .13, blockZ + 1.42), new THREE.Euler(0, 0, 0), new THREE.Euler(-1.42, 0, 0));
    const lidShape = new THREE.Shape();
    lidShape.moveTo(-blockW / 2 - .08, -blockD / 2 - .08); lidShape.lineTo(blockW / 2 + .08, -blockD / 2 - .08); lidShape.lineTo(blockW / 2 + .08, blockD / 2 + .08); lidShape.lineTo(-blockW / 2 - .08, blockD / 2 + .08); lidShape.closePath();
    for (const bore of [heaterBore, thermometerBore]) { const hole = new THREE.Path(); hole.absarc(bore.x - blockX, bore.z - blockZ, .135, 0, Math.PI * 2, true); lidShape.holes.push(hole) }
    const lidGeometry = new THREE.ExtrudeGeometry(lidShape, { depth: .12, bevelEnabled: true, bevelSegments: 2, bevelSize: .018, bevelThickness: .012, curveSegments: 28 }); lidGeometry.center(); lidGeometry.rotateX(Math.PI / 2);
    addJacketPanel(lidGeometry, new THREE.Vector3(blockX, blockTopY + .075, blockZ), new THREE.Vector3(blockX + 2.15, .2, blockZ + .28), new THREE.Euler(0, 0, 0), new THREE.Euler(0, 0, 1.36));

    const makeProbe = (type, colour) => {
      const probe = new THREE.Group(), sheath = cylinder(type === 'heater' ? .062 : .042, 1.12, steel, 36); sheath.position.y = -.45; probe.add(sheath);
      const tip = cylinder(type === 'heater' ? .068 : .048, .12, new THREE.MeshStandardMaterial({ color: type === 'heater' ? 0x555e61 : 0x7c8b90, metalness: .72, roughness: .28 }), 32); tip.position.y = -1.04; probe.add(tip);
      const collar = cylinder(type === 'heater' ? .12 : .09, .18, new THREE.MeshPhysicalMaterial({ color: colour, roughness: .28, clearcoat: .58 }), 34); collar.position.y = .18; probe.add(collar);
      const grip = new THREE.Mesh(roundedBox(type === 'heater' ? .25 : .18, .33, type === 'heater' ? .25 : .18, .055, 4), new THREE.MeshPhysicalMaterial({ color: colour, roughness: .3, clearcoat: .66 })); grip.position.y = .42; probe.add(grip);
      const connector = cylinder(type === 'heater' ? .055 : .04, .18, dark, 24); connector.position.y = .68; probe.add(connector);
      Object.assign(probe.userData, { type, connectorLocal: new THREE.Vector3(0, .76, 0), insertionDepth: .95 }); return shadowReady(probe);
    };
    const heaterProbe = makeProbe('heater', 0xd64b43), thermometerProbe = makeProbe('thermometer', 0x2d879e);
    const heaterStart = new THREE.Vector3(-1.58, .31, .72), thermometerStart = new THREE.Vector3(-1.5, .24, 1.22), heaterInserted = new THREE.Vector3(heaterBore.x, blockTopY + .14, heaterBore.z), thermometerInserted = new THREE.Vector3(thermometerBore.x, blockTopY + .14, thermometerBore.z);
    if (stage >= 2) { heaterProbe.position.copy(heaterInserted); thermometerProbe.position.copy(thermometerInserted) } else { heaterProbe.position.copy(heaterStart); heaterProbe.rotation.z = Math.PI / 2; thermometerProbe.position.copy(thermometerStart); thermometerProbe.rotation.z = Math.PI / 2 }
    g.add(heaterProbe, thermometerProbe);

    // Thermal-paste syringe, visible white paste beads and a small tool tray.
    const toolTray = new THREE.Mesh(roundedBox(1.65, .09, .82, .055, 5), new THREE.MeshPhysicalMaterial({ color: 0xdce3e4, metalness: .62, roughness: .33 })); toolTray.position.set(-1.5, .065, .94); g.add(toolTray);
    const syringe = new THREE.Group(), barrel = cylinder(.105, .78, new THREE.MeshPhysicalMaterial({ color: 0xe9f5f6, transparent: true, opacity: .72, transmission: .35, roughness: .12 }), 36); barrel.position.y = .22; syringe.add(barrel);
    const pasteColumn = cylinder(.075, .52, pasteMaterial, 28); pasteColumn.position.y = .18; syringe.add(pasteColumn);
    const plunger = cylinder(.055, .45, steel, 24); plunger.position.y = .78; syringe.add(plunger); const thumb = cylinder(.17, .04, steel, 30); thumb.position.y = 1.01; syringe.add(thumb);
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(.055, .42, 28), pasteMaterial); nozzle.rotation.z = Math.PI; nozzle.position.y = -.39; syringe.add(nozzle);
    syringe.position.set(-2.02, .25, .93); syringe.rotation.z = Math.PI / 2; syringe.scale.setScalar(.72); g.add(syringe);
    const pasteDrops = [];
    for (const [i, bore] of [heaterBore, thermometerBore].entries()) { const drop = new THREE.Mesh(new THREE.SphereGeometry(.09, 28, 18), pasteMaterial); drop.scale.set(1, .12, 1); drop.position.set(bore.x, blockTopY + .035, bore.z); drop.visible = stage >= 2; drop.userData.dropIndex = i; g.add(drop); pasteDrops.push(drop) }

    const makeInstrument = (label, bodyColour, accent) => {
      const instrument = new THREE.Group(), body = new THREE.Mesh(roundedBox(1.18, .76, .62, .085, 5), new THREE.MeshPhysicalMaterial({ color: bodyColour, roughness: .27, metalness: .08, clearcoat: .68 })); body.position.y = .38; instrument.add(body);
      const bezel = new THREE.Mesh(roundedBox(.98, .43, .045, .04, 4), dark); bezel.position.set(0, .46, .335); instrument.add(bezel);
      const canvas = document.createElement('canvas'), dc = canvas.getContext('2d'); canvas.width = 512; canvas.height = 220; dc.fillStyle = '#071b22'; dc.fillRect(0, 0, 512, 220);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(.88, .35), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, depthWrite: false })); screen.position.set(0, .47, .37); screen.renderOrder = 8; instrument.add(screen);
      for (const [x, colour] of [[-.37, 0x171c22], [.37, 0xd44247]]) { const terminal = cylinder(.068, .11, solid(colour, .26), 28); terminal.rotation.x = Math.PI / 2; terminal.position.set(x, .16, .34); instrument.add(terminal) }
      Object.assign(instrument.userData, { label, display: { canvas, context: dc, texture }, accent }); return shadowReady(instrument);
    };
    const supply = makeInstrument('12 V SUPPLY', 0x315a9b, '#78ffe2'); supply.position.set(-2.35, 0, -.82); g.add(supply);
    const ammeter = makeInstrument('AMMETER', 0xe8edef, '#ff8d92'); ammeter.position.set(-1.05, 0, -.82); g.add(ammeter);
    const joulemeter = makeInstrument('JOULEMETER', 0x354d61, '#8fffe8'); joulemeter.position.set(.78, 0, -.82); g.add(joulemeter);
    const digitalThermometer = makeInstrument('THERMOMETER', 0xe8edef, '#ffca70'); digitalThermometer.position.set(2.15, 0, -.82); g.add(digitalThermometer);
    const powerLed = new THREE.Mesh(new THREE.SphereGeometry(.05, 20, 14), new THREE.MeshStandardMaterial({ color: 0x40565c, emissive: 0x36ffc1, emissiveIntensity: 0 })); powerLed.position.set(-2.02, .69, -.47); g.add(powerLed);

    // Articulated insulated leads follow both probes during insertion without a
    // per-frame TubeGeometry rebuild.
    const makeFlexibleLead = (points, material, radius = .022) => {
      const lead = new THREE.Group(), segments = [], joints = [];
      for (let i = 0; i < points.length - 1; i++) { const segment = cylinder(radius, 1, material, 14); lead.add(segment); segments.push(segment) }
      for (let i = 1; i < points.length - 1; i++) { const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06, 12, 8), material); lead.add(joint); joints.push(joint) }
      g.add(lead); return { lead, segments, joints, points: points.map(point => point.clone()) };
    };
    const updateFlexibleLead = lead => {
      for (let i = 0; i < lead.segments.length; i++) { const a = lead.points[i], b = lead.points[i + 1], delta = b.clone().sub(a), length = delta.length(), segment = lead.segments[i]; segment.position.copy(a).add(b).multiplyScalar(.5); segment.scale.set(1, length, 1); segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()) }
      for (let i = 0; i < lead.joints.length; i++) lead.joints[i].position.copy(lead.points[i + 1]);
    };
    // Complete series circuit: supply (+) → ammeter → joulemeter → heater →
    // supply (−). The two short front links make every instrument connection
    // explicit instead of leaving the live displays on an open circuit.
    const supplyToAmmeterLead = makeFlexibleLead([new THREE.Vector3(-1.98, .16, -.47), new THREE.Vector3(-1.72, .085, -.28), new THREE.Vector3(-1.42, .16, -.47)], red, .024);
    const ammeterToJoulemeterLead = makeFlexibleLead([new THREE.Vector3(-.68, .16, -.47), new THREE.Vector3(-.18, .075, -.25), new THREE.Vector3(.41, .16, -.47)], red, .024);
    const heaterRedLead = makeFlexibleLead([new THREE.Vector3(1.15, .16, -.47), new THREE.Vector3(1.34, .11, -.02), new THREE.Vector3(.82, .15, .32), heaterStart.clone()], red, .026);
    const heaterBlackLead = makeFlexibleLead([new THREE.Vector3(-2.72, .16, -.47), new THREE.Vector3(-2.86, .09, .12), new THREE.Vector3(-1.12, .12, .42), heaterStart.clone().add(new THREE.Vector3(.04, 0, .05))], black, .026);
    const thermometerLead = makeFlexibleLead([new THREE.Vector3(2.1, .16, -.47), new THREE.Vector3(2.0, .12, .12), new THREE.Vector3(1.26, .14, .36), thermometerStart.clone()], new THREE.MeshStandardMaterial({ color: 0x2b7388, roughness: .6 }), .021);
    updateFlexibleLead(supplyToAmmeterLead); updateFlexibleLead(ammeterToJoulemeterLead); updateFlexibleLead(heaterRedLead); updateFlexibleLead(heaterBlackLead); updateFlexibleLead(thermometerLead);

    const heaterCoreMaterial = heaterProbe.children[0].material.clone(); heaterCoreMaterial.emissive = new THREE.Color(0xff3d18); heaterCoreMaterial.emissiveIntensity = 0; heaterProbe.children[0].material = heaterCoreMaterial;
    const heatLight = new THREE.PointLight(0xff632c, 0, 3.2, 1.9); heatLight.position.set(heaterBore.x, blockTopY - .25, heaterBore.z); g.add(heatLight);
    const energyParticles = [];
    for (let i = 0; i < 26; i++) { const particle = new THREE.Mesh(new THREE.SphereGeometry(.018 + (i % 3) * .005, 12, 8), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xff9a43 : 0xffe18a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })); particle.visible = false; particle.castShadow = false; particle.userData = { phase: (i * .137) % 1, angle: i * 2.399, speed: .42 + (i % 5) * .055 }; g.add(particle); energyParticles.push(particle) }
    const heatWaves = [];
    for (let i = 0; i < 4; i++) { const wave = new THREE.Mesh(new THREE.TorusGeometry(.25, .012, 8, 52), new THREE.MeshBasicMaterial({ color: 0xffa457, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); wave.rotation.x = Math.PI / 2; wave.visible = false; wave.castShadow = false; wave.receiveShadow = false; g.add(wave); heatWaves.push(wave) }

    const paintDisplay = (display, label, value, unit, accent, active, digits = 1, status = active ? 'LIVE' : 'READY') => {
      const valueText = Number(value || 0).toFixed(digits), displayKey = `${label}|${valueText}|${unit}|${active}|${status}`;
      if (display.lastKey === displayKey) return;
      display.lastKey = displayKey;
      const { canvas, context: dc, texture } = display; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#061920'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.strokeStyle = 'rgba(130,190,203,.28)'; dc.lineWidth = 4; dc.strokeRect(7, 7, canvas.width - 14, canvas.height - 14); dc.fillStyle = '#9cb2b7'; dc.font = '800 29px Inter, sans-serif'; dc.textAlign = 'left'; dc.textBaseline = 'middle'; dc.fillText(label, 25, 42); dc.shadowColor = active ? accent : '#50656b'; dc.shadowBlur = 20; dc.fillStyle = active ? accent : '#7e9297'; dc.font = '800 72px ui-monospace, Menlo, monospace'; dc.textAlign = 'right'; dc.fillText(`${valueText} ${unit}`, canvas.width - 24, 120); dc.shadowBlur = 0; dc.fillStyle = active ? '#8fe4cb' : '#788e93'; dc.font = '800 24px Inter, sans-serif'; dc.textAlign = 'center'; dc.fillText(status, canvas.width / 2, 185); texture.needsUpdate = true;
    };
    this.dynamic.push({
      kind: 'specificHeat', aluminium, heaterProbe, thermometerProbe, heaterStart, thermometerStart, heaterInserted, thermometerInserted, syringe, pasteDrops, jacketPanels,
      heaterRedLead, heaterBlackLead, thermometerLead, updateFlexibleLead, heaterCoreMaterial, heatLight, energyParticles, heatWaves, blockX, blockZ, blockTopY, heaterBore, thermometerBore,
      supplyDisplay: supply.userData.display, ammeterDisplay: ammeter.userData.display, joulemeterDisplay: joulemeter.userData.display, thermometerDisplay: digitalThermometer.userData.display, powerLed, paintDisplay
    });
    Object.assign(g.userData, {
      specificHeatCapacityRig: true,
      block: { material: 'aluminium', massKg: 1, boreHoles: 2, heaterBorePosition: heaterBore.toArray(), thermometerBorePosition: thermometerBore.toArray() },
      preparation: { thermalPasteSyringe: true, pasteDrops: 2, probesInserted: stage >= 2, probeInsertionDepthSceneUnits: .95, foamInsulationPanels: 5, boredInsulatingLid: true, foamInsulationClosed: stage >= 2, durationS: 3.8 },
      electrical: { supplyVoltageV: 12, currentA: 2, powerW: 24, instruments: ['12 V supply', 'ammeter', 'joulemeter', 'digital thermometer'], flexibleInsulatedCables: true, completeSeriesCircuit: true, route: 'supply positive → ammeter → joulemeter → heater → supply negative' },
      measurement: { energyRangeJ: [0, 18000], temperatureRangeC: [20, 40], heatingDurationS: 8, targetSpecificHeatCapacityJPerKgC: 900 },
      animation: { preparationSequence: ['apply paste', 'insert heater', 'insert thermometer', 'close foam jacket'], liveHeaterGlow: stage === 3, energyParticles: energyParticles.length }
    });
    const rig = shadowReady(g);
    for (const particle of energyParticles) { particle.castShadow = false; particle.receiveShadow = false }
    for (const wave of heatWaves) { wave.castShadow = false; wave.receiveShadow = false }
    return rig;
  }
  rebuild(state, p) {
    this.clear(); const id = p.id; this.configureEnvironment(id);
    if (id === 'free') {
      for (const it of state.workspace) {
        let anchor = it, elevation = 0, attachedTarget = null;
        if ((it.type === 'beaker' || it.type === 'flask') && it.snappedTo) { const support = state.workspace.find(a => a.uid === it.snappedTo && a.type === 'tripod'); if (support) { anchor = support; elevation = 2.1 } }
        if (it.type === 'phmeter' && it.attachedTo) { attachedTarget = state.workspace.find(a => a.uid === it.attachedTo && (a.type === 'beaker' || a.type === 'tube')); if (attachedTarget) { anchor = attachedTarget; if (attachedTarget.type === 'beaker' && attachedTarget.snappedTo) { const support = state.workspace.find(a => a.uid === attachedTarget.snappedTo && a.type === 'tripod'); if (support) { anchor = support; elevation = 2.1 } } } }
        const pos = this.posFromScreen(anchor.x, anchor.y), flameHeight = it.type === 'bunsen' ? this.freeBunsenHeight(it, state) : 1, o = this.itemObject(it, flameHeight);
        if (it.type === 'phmeter' && attachedTarget) { o.rotation.z = -.085; o.rotation.y = .025; this.add(o, pos.x + .08, pos.z + .015, elevation + .36, 1.02) }
        else { if (it.type === 'phmeter') { o.rotation.z = -.16; o.rotation.y = .04 } this.add(o, pos.x, pos.z, elevation + (it.type === 'phmeter' ? .2 : 0), it.type === 'phmeter' ? 1.02 : 1.15) }
        if (state.drag?.targetUid === it.uid) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .045, 12, 48), new THREE.MeshBasicMaterial({ color: 0x20d4b0 })); ring.rotation.x = Math.PI / 2; ring.position.set(pos.x, elevation + .05, pos.z); this.root.add(ring) }
        if (it.type === 'tripod' && state.drag?.snapUid === it.uid) { const target = new THREE.Mesh(new THREE.TorusGeometry(.88, .055, 16, 72), new THREE.MeshBasicMaterial({ color: 0x21d6b1, transparent: true, opacity: .92, depthWrite: false })); target.rotation.x = Math.PI / 2; target.position.set(pos.x, 2.17, pos.z); target.renderOrder = 12; this.root.add(target) }
      }
      if (state.drag?.kind === 'palette') { const pos = this.posFromScreen(state.drag.x, state.drag.y), ghost = this.itemObject({ type: state.drag.type }); ghost.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.opacity = .35 } }); this.add(ghost, pos.x, pos.z, 0, 1.08) }
    }
    else if (id === 'rates') {
      const transfer = Math.min(1, state.transferred || 0), stage = state.ratesStage || 0, moveQ = stage === 1 ? Math.max(0, Math.min(1, (state.ratesStageTimer || 0) / 1.8)) : stage === 0 ? 0 : 1, ease = moveQ * moveQ * (3 - 2 * moveQ), bathPos = new THREE.Vector3(2.55, .43, -.42), crossPos = new THREE.Vector3(-.15, .12, .25), receiverPos = new THREE.Vector3().lerpVectors(bathPos, crossPos, ease); if (stage === 1) receiverPos.y += Math.sin(Math.PI * ease) * .72;
      this.add(this.ratesCrossPaper(), crossPos.x, crossPos.z, 0, .98); this.add(this.electricWaterBath(state.ratesBathTemp || 20, state.ratesTargetTemp || 20, !!state.ratesConditioning), bathPos.x, bathPos.z, 0, .95);
      const source = this.add(this.flask(.6 - transfer * .34, 0xc8e8ee), -2.1, .1, 0, .88), q = Math.max(0, Math.min(1, state.progress || 0)), solutionColor = new THREE.Color(0xd8eef1).lerp(new THREE.Color(0xe5cc55), q).getHex(), receiver = this.flask(.46 + transfer * .22, solutionColor); receiver.scale.setScalar(.9); receiver.position.copy(receiverPos); if (stage === 3 && (!state.pour || transfer > .03)) receiver.add(this.bubbleCloud(18, .44, .5, 0xffeb8a)); if (q > .015) receiver.add(this.ratesSulfurCloud(q)); this.root.add(receiver); const target = receiver;
      if (state.pour) {
        const t = state.pour.t || 0, clamp = v => Math.max(0, Math.min(1, v)), smooth = v => { v = clamp(v); return v * v * (3 - 2 * v) }, approach = smooth(t / .9), retreat = smooth((t - 2.78) / .82), tilt = smooth((t - .68) / .48) * (1 - smooth((t - 2.42) / .42)), lipAnchor = smooth((t - .82) / .26) * (1 - smooth((t - 2.5) / .28)), start = new THREE.Vector3(-2.1, 0, .1), pourPosition = new THREE.Vector3(crossPos.x - 1.87, 1.52, crossPos.z - .20), pose = new THREE.Vector3().lerpVectors(start, pourPosition, approach);
        if (retreat > 0) pose.lerpVectors(pourPosition, start, retreat);
        pose.y += retreat > 0 ? Math.sin(retreat * Math.PI) * .16 : Math.sin(approach * Math.PI) * .12; source.position.copy(pose); source.rotation.z = -1.2 * tilt;
        const aligned = this.anchorPouringLip(source, target, { sourceLip: new THREE.Vector3(0, 1.95, 0), receiverOpening: new THREE.Vector3(0, 1.72, 0), clearance: .4, weight: lipAnchor });
        if (t > 1.08 && t < 2.5) {
          this.root.add(this.liquidPourStream(aligned.mouth, aligned.opening, { color: 0xa9f0ff, time: t, radius: .053, opacity: .76, sag: .025, breakup: .72, droplets: 5, splash: true }));
        }
      }
    }
    else if (id === 'temp') {
      const transfer = Math.min(1, state.transferred || 0), source = this.add(this.flask(.62 - transfer * .34, 0xc8e8ee), -2.1, .1, 0, .88), receiver = this.flask(.48 + transfer * .24, 0xc05b8e); if (state.running && (!state.pour || transfer > .03)) receiver.add(this.bubbleCloud(12, .46, .55, 0xf8ffff)); const target = this.add(receiver, 1.25, .05, 0, 1.04);
      if (state.pour) { const t = state.pour.t || 0, clamp = v => Math.max(0, Math.min(1, v)), smooth = v => { v = clamp(v); return v * v * (3 - 2 * v) }, approach = smooth(t / .9), retreat = smooth((t - 2.78) / .82), tilt = smooth((t - .68) / .48) * (1 - smooth((t - 2.42) / .42)), lipAnchor = smooth((t - .82) / .26) * (1 - smooth((t - 2.5) / .28)), start = new THREE.Vector3(-2.1, 0, .1), pourPosition = new THREE.Vector3(-1.15, 1.52, .05), pose = new THREE.Vector3().lerpVectors(start, pourPosition, approach); if (retreat > 0) pose.lerpVectors(pourPosition, start, retreat); pose.y += retreat > 0 ? Math.sin(retreat * Math.PI) * .16 : Math.sin(approach * Math.PI) * .12; source.position.copy(pose); source.rotation.z = -1.2 * tilt; const aligned = this.anchorPouringLip(source, target, { sourceLip: new THREE.Vector3(0, 1.95, 0), receiverOpening: new THREE.Vector3(0, 1.72, 0), clearance: .4, weight: lipAnchor }); if (t > 1.08 && t < 2.5) this.root.add(this.liquidPourStream(aligned.mouth, aligned.opening, { color: 0xa9f0ff, time: t, radius: .053, opacity: .76, sag: .025, breakup: .72, droplets: 5, splash: true })) }
      this.add(this.thermometer(state.temp), 1.25, .24, .02, .8)
    }
    else if (id === 'salts') {
      const stage = state.saltsStage || 0, t = state.saltsTimer || 0;
      if (stage === 0 || stage === 1) {
        const beaker = this.beaker(stage === 1 ? 0.35 + (t / 2.5) * 0.05 : 0.35, 0xd0e8ef); this.add(beaker, 0, .1, 0, 1.0);
        if (stage === 1) {
          const pourQ = Math.min(1, t / 1.5), cPos = new THREE.Vector3(1.5, 0, .1).lerp(new THREE.Vector3(-.28, 2.05, .1), pourQ), cRot = pourQ * -1.8, c = this.crucible({ product: true, productColor: 0x111111, productScale: 1 - Math.max(0, (t - 1.5)) }); c.position.copy(cPos); c.rotation.z = cRot; this.root.add(c);
          if (t > 1.4 && t < 2.5) { this.root.updateMatrixWorld(true); const powderStart = c.localToWorld(new THREE.Vector3(.47, .39, 0)), powderEnd = beaker.localToWorld(new THREE.Vector3(0, .49, 0)); this.root.add(this.granularPour(powderStart, powderEnd, t, { color: 0x111111, count: 32 })) }
        }
      } else if (stage === 2) {
        const appearQ = Math.min(1, t / 1.0), pourQ = Math.max(0, Math.min(1, (t - 1.2) / 1.5)), flask = this.flask(.1 + pourQ * .25, 0x319bd3), funnel = this.filterFunnel(); funnel.position.y = 1.9; flask.add(funnel); const fPos = new THREE.Vector3(2.5, .1, .1).lerp(new THREE.Vector3(0, .1, .1), Math.pow(appearQ, .5)); this.add(flask, fPos.x, fPos.z, fPos.y, 1.0); const bPos = appearQ < 1 ? new THREE.Vector3(0, .1, 0).lerp(new THREE.Vector3(-1.8, 0, .1), Math.pow(appearQ, .5)) : new THREE.Vector3(-1.8, 0, .1).lerp(new THREE.Vector3(-1.45, 3.36, .1), pourQ > 0 ? Math.min(1, pourQ * 3) : 0), bRot = pourQ > 0 ? -1.4 * Math.min(1, pourQ * 3) : 0, beaker = this.beaker(.4 - pourQ * .4, 0x319bd3); beaker.position.copy(bPos); beaker.rotation.z = bRot; this.root.add(beaker);
        if (pourQ > .2 && pourQ < .9) { this.root.updateMatrixWorld(true); const sourceMouth = beaker.localToWorld(new THREE.Vector3(.62, 1.3, 0)), funnelMouth = flask.localToWorld(new THREE.Vector3(0, 2.8, .02)), filterExit = flask.localToWorld(new THREE.Vector3(0, 1.91, .02)), filtrateSurface = flask.localToWorld(new THREE.Vector3(0, .43, .02)); this.root.add(this.liquidPourStream(sourceMouth, funnelMouth, { color: 0x4eb7e5, time: t, radius: .043, opacity: .76, sag: .035, breakup: .7, droplets: 4, splash: true })); this.root.add(this.liquidPourStream(filterExit, filtrateSurface, { color: 0x4eb7e5, time: t + .37, radius: .023, opacity: .68, sag: .012, breakup: .42, droplets: 7, splash: false })) }
      } else if (stage === 3 || stage === 4) {
        let baseZ = .1, dishY = 1.88, dishX = 0, dishZ = .1, dishScale = .96, crystalsQ = 0;
        if (stage === 4) {
          // Take the basin forward past the gauze first, then lower it.  The
          // two eased phases avoid the old diagonal path through the tripod.
          const moveQ = Math.min(1, t / 2.8), frontQ = Math.min(1, moveQ / .62), dropQ = Math.max(0, Math.min(1, (moveQ - .62) / .38));
          const ease = q => q * q * (3 - 2 * q), frontEase = ease(frontQ), dropEase = ease(dropQ);
          baseZ = .1 - dropEase * .4;
          dishZ = .1 + frontEase * 2.35 + dropEase * .2;
          dishY = 1.88 - dropEase * 1.80;
          crystalsQ = Math.max(0, Math.min(1, (t - 2.8) / 2.2));
        }
        this.add(this.tripod(), 0, baseZ); this.add(this.bunsen(state.burner, .76), 0, baseZ); const basin = this.evaporatingBasin(crystalsQ); if (stage === 3 && state.burner) basin.add(this.bubbleCloud(18, .4, .3)); this.add(basin, dishX, dishZ, dishY, dishScale)
      }
    }
    else if (id === 'mass') { const stage = state.massStage || 0, transfer = state.massTransfer, q = Math.min(1, (transfer?.t || 0) / 1.55), settle = transfer?.direction === 'toBalance' && q > .66 ? 4.18 + Math.sin(q * 34) * (1 - q) * .24 : 0, reading = stage === 0 ? 4.01 : stage === 7 ? 4.18 : settle; this.add(this.balance(reading), -2.5, .2, 0, .9); this.add(this.tripod(), 1.3, .05); this.add(this.bunsen(state.burner, .8), 1.3, .05); let pos = stage === 0 || stage === 7 ? new THREE.Vector3(-2.5, .83, .2) : new THREE.Vector3(1.3, 1.87, .05); if (transfer) { const from = transfer.direction === 'toTripod' ? new THREE.Vector3(-2.5, .83, .2) : new THREE.Vector3(1.3, 1.87, .05), to = transfer.direction === 'toTripod' ? new THREE.Vector3(1.3, 1.87, .05) : new THREE.Vector3(-2.5, .83, .2), ease = q * q * (3 - 2 * q); pos = new THREE.Vector3().lerpVectors(from, to, ease); pos.y += Math.sin(Math.PI * q) * 1.12 } const product = stage >= 5; this.add(this.crucible({ burning: stage === 4 && state.running, lidOn: state.massLidOn, product }), pos.x, pos.z, pos.y, 1.08) }
    else if (id === 'hydrogen') { this.root.add(this.hydrogenRig(state)) }
    else if (id === 'titration') { this.root.add(this.titrationRig(state)) }
    else if (id === 'co2') {
      const q = Math.max(0, Math.min(1, state.progress || 0)), scale = .98, leftX = -1.68, rightX = 1.58, z = .05;
      const reaction = this.flask(.5 + (state.transferred || 0) * .12, 0xd6d0ad); reaction.add(this.oneHoleBung(1.65, 2.19)); if (state.running) reaction.add(this.bubbleCloud(18, .42, .72)); this.add(reaction, leftX, z, 0, scale);
      const limeColour = new THREE.Color(0xcceff3).lerp(new THREE.Color(0xf0efe5), q).getHex(), limewater = this.flask(.68, limeColour), liquid = limewater.userData.liquid, meniscus = limewater.userData.meniscus;
      if (liquid) { liquid.material.opacity = .38 + q * .5; liquid.material.transmission = .52 * (1 - q); liquid.material.roughness = .08 + q * .62 }
      if (meniscus) { meniscus.material.opacity = .34 + q * .46; meniscus.material.transmission = .46 * (1 - q); meniscus.material.roughness = .08 + q * .55 }
      limewater.add(this.oneHoleBung(.14, 2.19), this.co2TurbidityCloud(q), this.co2BubblePlume()); this.add(limewater, rightX, z, 0, scale);
      const tubeY = 2.19 * scale; this.root.add(this.co2DeliveryTube(new THREE.Vector3(leftX, tubeY, z), new THREE.Vector3(rightX, tubeY, z)));
    }
    else if (id === 'electro') { this.root.add(this.electrolysisRig(state)) }
    else if (id === 'flame') { this.root.add(this.flameTestRig(state)) }
    else if (id === 'displacement') { this.root.add(this.displacementRig(state)) }
    else if (id === 'alkali') { this.root.add(this.alkaliMetalRig(state)) }
    else if (id === 'chrom') { this.add(this.beaker(.16, 0x87cad8), 0, .1, 0, 1.18); this.add(this.chromatographyPaper(), 0, .18, 1.25, 1.05) }
    else if (id === 'water') { this.root.add(this.waterDistillationRig(state)) }
    else if (id === 'thermite') { this.root.add(this.thermiteRig(state)) }
    else if (id === 'starchleaf') { this.root.add(this.starchLeafRig(state)) }
    else if (id === 'lipase') { this.root.add(this.lipaseRig(state)) }
    else if (id === 'osmosis') { this.root.add(this.osmosisRig(state)) }
    else if (id === 'potometer') { this.root.add(this.potometerRig(state)) }
    else if (id === 'pondweed') { this.root.add(this.pondweedRig(state)) }
    else if (id === 'quadrats') { this.root.add(this.randomSamplingRig(state)) }
    else if (id === 'shoretransect') { this.root.add(this.rockyShoreRig(state)) }
    else if (id === 'ripple') { this.root.add(this.rippleTankRig(state)) }
    else if (id === 'newton2') { this.root.add(this.newton2Rig(state)) }
    else if (id === 'electromagnet') { this.root.add(this.electromagnetRig(state)) }
    else if (id === 'convection') { this.root.add(this.convectionRig(state)) }
    else if (id === 'conduction') { this.root.add(this.conductionRig(state)) }
    else if (id === 'thermal') { this.root.add(this.thermalRadiationRig(state)) }
    else if (id === 'density') { this.root.add(this.densityRig(state)) }
    else if (id === 'hooke') { this.root.add(this.hookeLawRig(state)) }
    else if (id === 'specificheat') { this.root.add(this.specificHeatRig(state)) }
    else if (id === 'wirelength') { this.root.add(this.wireResistanceRig(state)) }
    else if (id === 'fieldlines') { this.root.add(this.magneticFieldRig(state)) }
  }
  advanceBunsenLoad(dt) {
    const needsFrame = this.bunsenTransitionActive;
    if (needsFrame) {
      this.bunsenLoadElapsed = Math.min(this.bunsenLoadDuration, this.bunsenLoadElapsed + Math.max(0, dt || 0));
      if (this.bunsenLoadElapsed >= this.bunsenLoadDuration) this.bunsenTransitionActive = false
    }
    return needsFrame
  }
  bunsenLoadState() {
    const elapsed = this.bunsenLoadElapsed, clamp = value => Math.max(0, Math.min(1, value)), smooth = value => { value = clamp(value); return value * value * (3 - 2 * value) };
    const collarOpen = smooth(elapsed / 2.65), heatMix = smooth((elapsed - .28) / (this.bunsenLoadDuration - .28)), collarRotation = THREE.MathUtils.lerp(.72, 0, collarOpen);
    return {
      elapsed_s: elapsed,
      progress: clamp(elapsed / this.bunsenLoadDuration),
      collar_open_fraction: collarOpen,
      collar_rotation_radians: collarRotation,
      collar_rotation_degrees: collarRotation * 180 / Math.PI,
      heat_mix: heatMix,
      phase: heatMix < .18 ? 'wavy red-orange safety flame' : heatMix < .9 ? 'collar opening · flame changing to blue' : 'powerful blue heating flame',
      complete: elapsed >= this.bunsenLoadDuration
    }
  }
  advanceFlameTestLoad(dt) { return this.advanceBunsenLoad(dt) }
  flameTestLoadState() { return this.bunsenLoadState() }
  sync(state, p) {
    if (!this.available) return;
    // Pointer moves can fire dozens of times per second. Keep the WebGL scene
    // stable while dragging instead of rebuilding all glassware on every
    // pixel; pointer-up commits the position and rebuilds once. Snap feedback
    // remains live through targetUid/snapUid.
    const dragUid = state.drag?.kind === 'workspace' ? state.drag.uid : null;
    const visualDrag = state.drag && ['palette', 'free-reactant', 'workspace'].includes(state.drag.kind) ? { kind: state.drag.kind, type: state.drag.type, uid: state.drag.uid, targetUid: state.drag.targetUid, snapUid: state.drag.snapUid } : state.drag ? { kind: state.drag.kind } : null;
    const visualWorkspace = state.workspace.map(({ temperature, reaction, ph, ...it }) => { const frozen = dragUid === it.uid && state.drag?.origin; const view = frozen ? { ...it, x: state.drag.origin.x, y: state.drag.origin.y, attachedTo: state.drag.origin.attachedTo } : it; return { ...view, temperatureBand: Math.floor((temperature || 20) / 10), reaction: reaction && { ruleId: reaction.ruleId, progress: Math.round((reaction.progress || 0) * 20), complete: !!reaction.complete } } });
    const temperatureKey = p.id === 'temp' ? Math.round((state.temp || 20) * 10) : p.id === 'rates' ? Math.round((state.ratesBathTemp || 20) * 10) : p.id === 'lipase' ? Math.round((state.lipaseBathTemp || 20) * 10) : 0;
    const signature = JSON.stringify({ id: p.id, workspace: visualWorkspace, drag: visualDrag, running: p.id === 'titration' || p.id === 'thermite' || p.id === 'displacement' || p.id === 'density' || p.id === 'starchleaf' || p.id === 'lipase' || p.id === 'osmosis' || p.id === 'potometer' || p.id === 'ripple' || p.id === 'hooke' || p.id === 'specificheat' || p.id === 'wirelength' || p.id === 'fieldlines' ? false : state.running, burner: state.burner, coolingWater: state.coolingWater, pour: !!state.pour, pourTick: state.pour && Math.round(state.pour.t * 24), lastReactant: state.lastReactant, transferred: Math.round((state.transferred || 0) * 20), temperature: temperatureKey, ratesStage: state.ratesStage, ratesTick: p.id === 'rates' ? Math.round((state.ratesStageTimer || 0) * 18) : 0, ratesTarget: state.ratesTargetTemp, ratesConditioning: !!state.ratesConditioning, massStage: state.massStage, massLidOn: state.massLidOn, massTransfer: state.massTransfer && { direction: state.massTransfer.direction, tick: Math.round(state.massTransfer.t * 12) }, massProgress: ['water', 'electro', 'titration', 'thermite', 'displacement', 'starchleaf', 'lipase', 'osmosis', 'potometer', 'ripple', 'electromagnet', 'convection', 'conduction', 'thermal', 'hooke', 'specificheat', 'wirelength', 'fieldlines'].includes(p.id) ? 0 : Math.round((state.progress || 0) * 20), electroWeighing: !!state.electroWeighing, electroRecorded: !!state.electroRecorded, hydrogenStage: state.hydrogenStage, hydrogenTick: Math.round((state.hydrogenTimer || 0) * 6), hydrogenGas: Math.round((state.hydrogenGas || 0) / 2), saltsStage: state.saltsStage, saltsTick: Math.round((state.saltsTimer || 0) * 10), flameTestStage: state.flameTestStage, flameTestSalt: state.flameTestSalt, flameTestTested: state.flameTestTested, titrationStage: state.titrationStage, titrationIndicator: state.titrationIndicator, titrationIndicatorAdding: (state.titrationIndicatorTimer || 0) > 0, titrationComplete: p.id === 'titration' && !!state.complete, titrationDropping: (state.titrationDropTimer || 0) > 0, titrationReading: p.id === 'titration' && !state.running ? Math.round((state.titrationVolume || 0) * 20) : 0, displacementStage: state.displacementStage, thermiteComplete: p.id === 'thermite' && !!state.complete, starchStage: state.starchStage, lipaseStage: state.lipaseStage, lipaseTarget: state.lipaseTargetTemp, lipaseConditioning: !!state.lipaseConditioning, osmosisStage: state.osmosisStage, osmosisConcentration: state.osmosisConcentration, potometerStage: state.potometerStage, potometerWindSpeed: state.potometerWindSpeed, pondweedDistance: state.pondweedDistance, pondweedLampOn: state.pondweedLampOn, newtonForce: state.newtonForce, newtonMass: state.newtonMass, newtonPos: Math.round((state.newtonPos || 0) * 50), newtonGate1Velocity: state.newtonGate1Velocity, newtonGate2Velocity: state.newtonGate2Velocity, electromagnetStage: state.electromagnetStage, electromagnetTurns: state.electromagnetTurns, convectionStage: state.convectionStage, conductionStage: state.conductionStage, thermalStage: state.thermalStage, densityStage: state.densityStage, densitySample: state.densitySample, densityTick: 0, hookeStage: state.hookeStage, hookeTrialIndex: state.hookeTrialIndex, hookeForceN: state.hookeForceN, shcStage: state.shcStage, wireStage: state.wireStage, wireLengthCm: state.wireLengthCm, wireTrialIndex: state.wireTrialIndex, fieldStage: state.fieldStage, fieldConfigIndex: state.fieldConfigIndex });
    if (signature !== this.signature) { this.signature = signature; this.rebuild(state, p); this.sceneNeedsCompile = true; this.sceneWarmupFrames = 3 }
  }
  render(time, state, p) {
    if (!this.available || this.contextLost) return;
    const practicalChanged = this.lastPracticalId !== p.id, previousLitBunsens = this.flames.filter(f => f.loadTransition).length;
    if (practicalChanged) { this.lastPracticalId = p.id }
    const frameDt = this.lastRenderTime ? Math.min(.05, Math.max(0, (time - this.lastRenderTime) / 1000)) : 1 / 60; this.lastRenderTime = time; this.coolantTransitionTarget = state.coolingWater ? 1 : 0; this.coolantVisualLevel = THREE.MathUtils.lerp(this.coolantVisualLevel, this.coolantTransitionTarget, 1 - Math.exp(-frameDt * 4.4)); if (Math.abs(this.coolantVisualLevel - this.coolantTransitionTarget) < .002) this.coolantVisualLevel = this.coolantTransitionTarget; this.sync(state, p);
    const litBunsens = this.flames.filter(f => f.loadTransition).length;
    if (litBunsens && (practicalChanged || litBunsens > previousLitBunsens)) this.bunsenLoadElapsed = 0;
    this.bunsenTransitionActive = litBunsens > 0 && this.bunsenLoadElapsed < this.bunsenLoadDuration;
    this.applyCameraForPractical(p.id, state.hookeFocusProgress || 0);
    if (this.sceneNeedsCompile) {
      this.renderer.compile(this.scene, this.camera); this.sceneNeedsCompile = false;
      if (this.pendingCanvasReveal && this.renderer.compileAsync) {
        const compileGeneration = ++this.sceneCompileGeneration; this.sceneCompiling = true;
        this.renderer.compileAsync(this.scene, this.camera).then(() => {
          if (compileGeneration !== this.sceneCompileGeneration || this.contextLost) return;
          this.sceneCompiling = false; this.canvas.dispatchEvent(new CustomEvent('lab3dneedsredraw'))
        }, () => {
          if (compileGeneration !== this.sceneCompileGeneration || this.contextLost) return;
          this.sceneCompiling = false; this.canvas.dispatchEvent(new CustomEvent('lab3dneedsredraw'))
        })
      }
    }
    for (const f of this.flames) {
      const seconds = time * .001, load = f.loadTransition ? this.bunsenLoadState() : { heat_mix: 1 }, heatMix = load.heat_mix, safety = 1 - heatMix, colourMix = THREE.MathUtils.smoothstep(heatMix, .28, .9);
      if (f.airIntakeCollar) f.airIntakeCollar.rotation.y = load.collar_rotation_radians || 0;
      const pulse = 1 + Math.sin(time * .009 + f.seed) * THREE.MathUtils.lerp(.055, .018, heatMix) + Math.sin(time * .021 + f.seed) * THREE.MathUtils.lerp(.024, .009, heatMix);
      const lean = Math.sin(time * .0047 + f.seed) * THREE.MathUtils.lerp(.038, .0018, heatMix) + Math.sin(time * .011 + f.seed * .7) * .012 * safety;
      const widthScale = THREE.MathUtils.lerp(1.12, 1, heatMix), heightScale = THREE.MathUtils.lerp(.78, 1, heatMix);
      f.uniforms.uTime.value = seconds; f.veilUniforms.uTime.value = seconds; f.uniforms.uHeatMix.value = heatMix;
      f.sheet.scale.set(pulse * widthScale, f.height * heightScale * (1 + Math.sin(time * .012 + f.seed) * THREE.MathUtils.lerp(.055, .022, heatMix)), 1);
      f.veil.scale.set(.82 * widthScale / pulse, f.height * heightScale * (1.02 + Math.sin(time * .015 + f.seed) * THREE.MathUtils.lerp(.065, .026, heatMix)), .82);
      f.sheet.rotation.z = lean; f.veil.rotation.z = -lean * .7;
      f.glow.color.setRGB(THREE.MathUtils.lerp(1, .141, colourMix), THREE.MathUtils.lerp(.19, .616, colourMix), THREE.MathUtils.lerp(.03, 1, colourMix));
      f.glow.intensity = THREE.MathUtils.lerp(2.45, 3.4, heatMix) + Math.sin(time * .011 + f.seed) * .28;
      f.rimMat.color.setRGB(THREE.MathUtils.lerp(1, .467, colourMix), THREE.MathUtils.lerp(.24, .871, colourMix), THREE.MathUtils.lerp(.025, 1, colourMix));
      f.rimMat.opacity = THREE.MathUtils.lerp(.48, .64, heatMix);
      f.hotBaseMat.color.setRGB(THREE.MathUtils.lerp(1, .863, colourMix), THREE.MathUtils.lerp(.78, .984, colourMix), THREE.MathUtils.lerp(.18, 1, colourMix));
      if (f.wrap) { const wrapPulse = .92 + .1 * Math.sin(time * .014 + f.seed); f.wrap.scale.set(wrapPulse, .98, wrapPulse * .72); f.wrap.material.opacity = .22 + .08 * Math.sin(time * .011 + f.seed); for (const jet of f.wrapJets) jet.scale.x = wrapPulse }
      if (f.jets) {
        const spatulaAbove = p.id === 'flame' && (state.flameTestStage === 3 || state.flameTestStage >= 4);
        for (let i = 0; i < f.jets.length; i++) {
          const jet = f.jets[i], dy = (Math.sin(seconds * 24 + i * 2.3 + f.seed) * .007 + Math.sin(seconds * 48 + i * 4.1) * .0035) * (1 + (spatulaAbove ? .6 : 0));
          jet.position.y = 1.38 + dy; jet.scale.y = 1 + Math.sin(seconds * 32 + i * 3.3) * .18;
          jet.material.color.setRGB(THREE.MathUtils.lerp(1, .475, heatMix), THREE.MathUtils.lerp(.27, .875, heatMix), THREE.MathUtils.lerp(.015, 1, heatMix));
          const n1 = Math.sin(seconds * 16 + i * 3.7 + f.seed), n2 = Math.sin(seconds * 35 + i * 5.3), rawFlicker = n1 * .6 + n2 * .4, thresh = spatulaAbove ? .22 : .78; let opacity = .52 * THREE.MathUtils.lerp(.16, 1, heatMix);
          if (rawFlicker > thresh) { const dip = Math.abs(Math.sin((rawFlicker - thresh) * 22)); opacity *= spatulaAbove ? .05 + .25 * dip : .2 + .3 * dip }
          jet.material.opacity = opacity
        }
      }
    }
    for (const d of this.dynamic) {
      if (d.kind === 'bubble') { const q = (time * .001 * d.speed + d.phase) % 1; d.mesh.position.y = d.baseY + q * d.height; const pulse = .82 + Math.sin(time * .006 + d.phase * 20) * .18; d.mesh.scale.setScalar(pulse) }
      else if (d.kind === 'phMeterDisplay') { const meter = state.workspace.find(item => item.uid === d.meterUid && item.type === 'phmeter'), target = meter?.attachedTo && state.workspace.find(item => item.uid === meter.attachedTo && (item.type === 'beaker' || item.type === 'tube')), reading = Number.isFinite(target?.ph) ? target.ph : null; this.paintPhDisplay(d.display, reading) }
      else if (d.kind === 'rippleTank') {
        const stage = state.rippleStage || 0, t = Math.max(0, state.rippleTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, frequency = state.rippleFrequencyHz || state.rippleFrequency || [4, 5, 6, 7, 8][state.rippleTrialIndex || 0] || 4, distanceLookup = { 4: 50, 5: 40.2, 6: 33, 7: 28.8, 8: 24.9 }, tenWavelengthCm = distanceLookup[frequency] || state.rippleTenWavelengthCm || 50, wavelengthCm = tenWavelengthCm / 10, speed = frequency * tenWavelengthCm / 1000, wavelengthScene = wavelengthCm * d.rulerScenePerCm, waveNumber = Math.PI * 2 / Math.max(.08, wavelengthScene), clock = state.rippleWaveClock || state.rippleClock || 0, rawPhase = clock * Math.PI * 2 * frequency;
        const levelQ = stage === 1 ? smooth(t / 2.4) : stage >= 2 ? 1 : 0, waveRamp = stage === 3 ? smooth(t / 3.2) : stage >= 4 ? 1 : 0;
        if (stage !== d.previousStage) { if (stage === 5) d.frozenPhase = rawPhase; d.previousStage = stage }
        const strobeMix = stage === 5 ? smooth(t / 2.8) : stage >= 6 && stage <= 7 ? 1 : 0;
        d.tank.rotation.x = -.012 * (1 - levelQ); d.tank.rotation.z = .021 * (1 - levelQ); d.levelBubble.position.x = .24 * (1 - levelQ) + (stage === 1 ? Math.sin(t * 9) * .025 * (1 - levelQ) : 0);
        d.footScrews.forEach((foot, i) => { foot.rotation.y = stage === 1 ? (i % 2 ? -1 : 1) * t * 4.8 : stage >= 2 ? (i % 2 ? -1 : 1) * 2.4 * 4.8 : 0 });
        for (const uniforms of [d.waveUniforms, d.projectionUniforms]) { uniforms.uK.value = waveNumber; uniforms.uRawPhase.value = rawPhase; uniforms.uFrozenPhase.value = d.frozenPhase; uniforms.uStrobeMix.value = strobeMix; uniforms.uActive.value = waveRamp }
        d.waveUniforms.uAmplitude.value = .034 + .004 * Math.sin(clock * .37);
        d.motorWheel.rotation.z = stage >= 3 ? -rawPhase : 0; d.frequencyKnob.rotation.y = (frequency - 4) * .48;
        const lowerQ = stage === 3 ? smooth(t / .75) : stage >= 4 ? 1 : 0, dipperOscillation = stage >= 3 ? Math.sin(rawPhase) * .032 * waveRamp : 0; d.dipperGroup.position.y = 1.23 + THREE.MathUtils.lerp(.085, .014, lowerQ) + dipperOscillation;
        const pin = new THREE.Vector3(.15, 0, .052).applyAxisAngle(new THREE.Vector3(0, 0, 1), d.motorWheel.rotation.z).add(d.motorWheel.position), rodEnd = d.dipperGroup.position.clone().add(new THREE.Vector3(0, .72, 0)), rodDirection = rodEnd.clone().sub(pin), rodLength = rodDirection.length(); d.driveRod.position.lerpVectors(pin, rodEnd, .5); d.driveRod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rodDirection.normalize()); d.driveRod.scale.set(1, rodLength, 1);
        const measuring = stage === 5, measured = stage >= 6, rulerQ = measuring ? smooth(t / 1.05) : measured ? 1 : 0, cursorQ = measuring ? smooth((t - .82) / 1.65) : measured ? 1 : 0, targetSpan = tenWavelengthCm * d.rulerScenePerCm;
        d.rulerGroup.visible = stage >= 5; d.rulerGroup.position.x = THREE.MathUtils.lerp(3.5, 1.55, rulerQ); d.endCursor.position.z = d.rulerStartZ + targetSpan * cursorQ; d.startCursor.visible = d.endCursor.visible = stage >= 5;
        d.crestMarkers.forEach((marker, i) => { const markerQ = i / 10, visible = stage >= 5 && cursorQ + .035 >= markerQ; marker.visible = visible; marker.position.z = d.rulerStartZ + targetSpan * markerQ; marker.scale.setScalar(visible && measuring ? .82 + .2 * Math.sin(t * 8 - i * .38) : 1) });
        const strobeActive = stage >= 5, strobeSync = stage === 5 ? smooth(t / 2.8) : measured ? 1 : 0; d.strobeWheel.rotation.z = strobeActive ? -clock * (9 + frequency) * (1 - strobeSync * .82) : 0; d.strobeLed.material.emissiveIntensity = strobeActive ? 1.8 + 1.1 * strobeSync + .25 * Math.sin(clock * 9) : .08; d.strobeLed.material.color.setHex(strobeActive ? 0x9dffff : 0x4d696e); d.strobeLight.intensity = 2.25 + strobeSync * 1.15; d.lampPanelMat.emissiveIntensity = .32 + strobeSync * .56; d.generatorLed.material.emissiveIntensity = stage >= 3 ? 2.4 + .25 * Math.sin(clock * 7) : .12;
        const status = stage < 1 ? 'LEVEL TANK' : stage === 1 ? 'LEVELLING' : stage === 2 ? 'READY' : stage === 3 ? 'WAVES FORMING' : stage === 4 ? 'TRAVELLING WAVES' : stage === 5 ? 'STROBE SYNC' : stage === 6 ? '10 WAVELENGTHS' : 'TRIAL RECORDED', displayKey = `${frequency}|${stage}|${Math.round(t * 8)}|${tenWavelengthCm}`;
        if (d.generatorDisplay.lastKey !== displayKey) {
          const { canvas, context: dc, texture } = d.generatorDisplay; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#061b23'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.shadowColor = '#6fffe5'; dc.shadowBlur = 22; dc.fillStyle = '#86ffe8'; dc.font = '800 88px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(`${frequency.toFixed(1)} Hz`, canvas.width / 2, 76); dc.shadowBlur = 0; dc.fillStyle = stage >= 5 ? '#8ee9ff' : '#b7c8cc'; dc.font = '750 31px Inter, sans-serif'; dc.fillText(status, canvas.width / 2, 145); dc.fillStyle = '#e9f8fa'; dc.font = '650 25px ui-monospace, Menlo, monospace'; dc.fillText(stage >= 6 ? `10λ ${tenWavelengthCm.toFixed(1)} cm  ·  v ${speed.toFixed(3)} m/s` : `DEPTH 1.5 cm  ·  AMP 2 mm`, canvas.width / 2, 202); texture.needsUpdate = true; d.generatorDisplay.lastKey = displayKey
        }
      }
      else if (d.kind === 'hookeLaw') {
        const stage = state.hookeStage || 0, t = Math.max(0, state.hookeTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) };
        const fromExtensionCm = d.extensionSeriesCm[d.previousForce] || 0, targetExtensionCm = d.extensionSeriesCm[d.visualForce] || 0;
        let extensionCm = targetExtensionCm;
        if (stage === 1) {
          const settleElapsed = Math.max(0, t - .78), response = settleElapsed <= 0 ? 0 : 1 - Math.exp(-3.6 * settleElapsed) * (Math.cos(9 * settleElapsed) + .4 * Math.sin(9 * settleElapsed));
          extensionCm = THREE.MathUtils.lerp(fromExtensionCm, targetExtensionCm, Math.max(0, Math.min(1.18, response)));
        }
        const springLength = d.baseSpringLength + extensionCm * d.scenePerCm, bodyBottomY = d.springTopY - springLength;
        d.springHelix.scale.y = springLength / d.baseSpringLength;
        d.bottomHook.position.set(d.springX, bodyBottomY, d.springZ);
        d.hanger.position.set(d.springX, bodyBottomY - .16, d.springZ);
        d.pointer.position.y = d.zeroPointerY - extensionCm * d.scenePerCm;
        const discInFlight = stage === 1 && d.movingDiscIndex >= 0;
        d.movingDisc.visible = discInFlight;
        if (discInFlight) {
          const hover = new THREE.Vector3(d.springX, bodyBottomY + .22, d.springZ), target = new THREE.Vector3(d.springX, bodyBottomY - .65 + (d.visualForce - 1) * .052, d.springZ);
          const travelQ = smooth(t / .72), lowerQ = smooth((t - .72) / .5);
          d.movingDisc.position.lerpVectors(d.movingDiscStart, hover, travelQ);
          d.movingDisc.position.y += Math.sin(Math.PI * travelQ) * .38;
          if (lowerQ > 0) d.movingDisc.position.lerpVectors(hover, target, lowerQ);
          if (lowerQ >= 1) d.movingDisc.position.copy(target);
          d.movingDisc.rotation.y = THREE.MathUtils.lerp(.48, -.12, smooth(t / 1.12));
        }
      }
      else if (d.kind === 'specificHeat') {
        const stage = state.shcStage || 0, t = Math.max(0, state.shcTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) };
        const syringeRest = new THREE.Vector3(-2.02, .25, .93), heaterPastePose = new THREE.Vector3(d.heaterBore.x, d.blockTopY + .47, d.heaterBore.z), thermometerPastePose = new THREE.Vector3(d.thermometerBore.x, d.blockTopY + .47, d.thermometerBore.z);
        const arcLerp = (object, from, to, q, arc = 0) => { object.position.lerpVectors(from, to, q); object.position.y += Math.sin(Math.PI * q) * arc };
        d.syringe.visible = stage < 2;
        if (stage === 1) {
          if (t < .68) { const q = smooth(t / .68); arcLerp(d.syringe, syringeRest, heaterPastePose, q, .3); d.syringe.rotation.z = THREE.MathUtils.lerp(Math.PI / 2, 0, q) }
          else if (t < 1.05) { d.syringe.position.copy(heaterPastePose); d.syringe.rotation.z = 0 }
          else if (t < 1.36) { const q = smooth((t - 1.05) / .31); arcLerp(d.syringe, heaterPastePose, thermometerPastePose, q, .18); d.syringe.rotation.z = 0 }
          else if (t < 1.62) { d.syringe.position.copy(thermometerPastePose); d.syringe.rotation.z = 0 }
          else { const q = smooth((t - 1.62) / .4); arcLerp(d.syringe, thermometerPastePose, syringeRest, q, .28); d.syringe.rotation.z = THREE.MathUtils.lerp(0, Math.PI / 2, q) }
        } else { d.syringe.position.copy(syringeRest); d.syringe.rotation.z = Math.PI / 2 }
        const firstPasteQ = stage >= 2 ? 1 : stage === 1 ? smooth((t - .58) / .3) : 0, secondPasteQ = stage >= 2 ? 1 : stage === 1 ? smooth((t - 1.28) / .28) : 0;
        d.pasteDrops.forEach((drop, index) => { const q = index ? secondPasteQ : firstPasteQ; drop.visible = q > .01; drop.scale.set(q, .12 * q, q) });
        const heaterInsertQ = stage >= 2 ? 1 : stage === 1 ? smooth((t - 1.64) / .92) : 0, thermometerInsertQ = stage >= 2 ? 1 : stage === 1 ? smooth((t - 1.92) / .94) : 0;
        arcLerp(d.heaterProbe, d.heaterStart, d.heaterInserted, heaterInsertQ, .36); d.heaterProbe.rotation.z = THREE.MathUtils.lerp(Math.PI / 2, 0, heaterInsertQ);
        arcLerp(d.thermometerProbe, d.thermometerStart, d.thermometerInserted, thermometerInsertQ, .32); d.thermometerProbe.rotation.z = THREE.MathUtils.lerp(Math.PI / 2, 0, thermometerInsertQ);
        const jacketQ = stage >= 2 ? 1 : stage === 1 ? smooth((t - 2.62) / 1.18) : 0;
        for (const panel of d.jacketPanels) {
          panel.mesh.position.lerpVectors(panel.open, panel.closed, jacketQ);
          panel.mesh.rotation.set(THREE.MathUtils.lerp(panel.openRotation.x, panel.closedRotation.x, jacketQ), THREE.MathUtils.lerp(panel.openRotation.y, panel.closedRotation.y, jacketQ), THREE.MathUtils.lerp(panel.openRotation.z, panel.closedRotation.z, jacketQ));
        }
        const connectorWorld = probe => probe.userData.connectorLocal.clone().applyQuaternion(probe.quaternion).add(probe.position), heaterConnector = connectorWorld(d.heaterProbe), thermometerConnector = connectorWorld(d.thermometerProbe);
        d.heaterRedLead.points[d.heaterRedLead.points.length - 1].copy(heaterConnector).add(new THREE.Vector3(-.035, 0, 0));
        d.heaterBlackLead.points[d.heaterBlackLead.points.length - 1].copy(heaterConnector).add(new THREE.Vector3(.035, 0, .035));
        d.thermometerLead.points[d.thermometerLead.points.length - 1].copy(thermometerConnector);
        d.updateFlexibleLead(d.heaterRedLead); d.updateFlexibleLead(d.heaterBlackLead); d.updateFlexibleLead(d.thermometerLead);
        const active = stage === 3, prepared = stage >= 2, energyJ = Math.max(0, Math.min(18000, Number(state.shcEnergyJ) || 0)), temperatureC = Math.max(20, Math.min(40, Number(state.shcTemperatureC) || 20));
        const heatFraction = (temperatureC - 20) / 20, heatRamp = active ? smooth(t / 1.05) : 0, pulse = .9 + .1 * Math.sin(time * .011);
        d.heaterCoreMaterial.emissiveIntensity = active ? (2.05 + .75 * pulse) * heatRamp : 0;
        d.heatLight.intensity = active ? (2.25 + .55 * pulse) * heatRamp : 0;
        d.aluminium.emissiveIntensity = .015 + heatFraction * .24;
        d.powerLed.material.emissiveIntensity = active ? 2.8 + .45 * pulse : 0;
        const displayEnergyJ = Math.round(energyJ / 100) * 100, readingStatus = stage === 3 ? 'LIVE' : stage >= 4 ? 'HOLD' : stage === 2 ? 'READY' : 'SETUP';
        d.paintDisplay(d.supplyDisplay, '12 V SUPPLY', active ? 12 : 0, 'V', '#78ffe2', active, 1, active ? 'ON' : 'OFF');
        d.paintDisplay(d.ammeterDisplay, 'AMMETER', active ? 2 : 0, 'A', '#ff8d92', active, 1, active ? 'ON' : 'OFF');
        d.paintDisplay(d.joulemeterDisplay, 'JOULEMETER', displayEnergyJ, 'J', '#8fffe8', prepared, 0, readingStatus);
        d.paintDisplay(d.thermometerDisplay, 'THERMOMETER', temperatureC, '°C', '#ffca70', prepared, 1, readingStatus);
        for (const particle of d.energyParticles) {
          particle.visible = active && heatRamp > .015;
          if (particle.visible) {
            const q = (t * particle.userData.speed + particle.userData.phase) % 1, radius = .06 + q * .88, angle = particle.userData.angle + q * .62;
            particle.position.set(d.heaterBore.x + Math.cos(angle) * radius, d.blockTopY + .055 + Math.sin(Math.PI * q) * (.1 + heatFraction * .12), d.heaterBore.z + Math.sin(angle) * radius * .72);
            particle.material.opacity = Math.sin(Math.PI * q) * (.34 + heatRamp * .58); particle.scale.setScalar(.7 + Math.sin(Math.PI * q) * .75);
          }
        }
        const warm = stage >= 3 && temperatureC > 20, heatClock = active ? t : time * .001;
        d.heatWaves.forEach((wave, index) => {
          const q = (heatClock * .34 + index / d.heatWaves.length) % 1; wave.visible = warm; wave.position.set(d.blockX, d.blockTopY + .12 + q * .68, d.blockZ); wave.scale.setScalar(.65 + q * 1.25); wave.material.opacity = warm ? (1 - q) * (.08 + heatFraction * .24) : 0;
        });
      }
      else if (d.kind === 'electromagnet') {
        const stage = state.electromagnetStage || 0, t = Math.max(0, state.electromagnetTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, highY = d.highY, lowY = d.lowY;
        const switchQ = stage === 0 || stage === 7 ? 0 : stage === 1 ? smooth(t / 1.05) : 1;
        d.switchPivot.rotation.z = THREE.MathUtils.lerp(.38, -.025, switchQ);
        d.copper.emissiveIntensity = switchQ * (.38 + .12 * Math.sin(time * .01));
        d.switchGlow.intensity = switchQ * (1.3 + .22 * Math.sin(time * .012));
        const displayCurrent = .5 * switchQ, displayVoltage = 3 * switchQ, displayKey = `${displayCurrent.toFixed(2)}|${displayVoltage.toFixed(2)}|${switchQ > .02}`;
        if (d.supplyDisplay.lastKey !== displayKey) {
          d.supplyDisplay.paint(displayCurrent, displayVoltage, switchQ > .02); d.supplyDisplay.texture.needsUpdate = true; d.supplyDisplay.lastKey = displayKey
        }
        let lowerQ = 0; if (stage === 3) lowerQ = smooth(t / 1.55); else if (stage >= 4 && stage <= 6) lowerQ = 1;
        let liftQ = 0; if (stage === 5) liftQ = smooth(t / 1.85); else if (stage === 6) liftQ = 1;
        d.carriage.position.y = THREE.MathUtils.lerp(highY, lowY, lowerQ); if (stage >= 5 && stage <= 6) d.carriage.position.y = THREE.MathUtils.lerp(lowY, highY, liftQ);
        d.coreAssembly.rotation.x = .012 * Math.sin(time * .004);
        d.redLead.points[d.redLead.points.length - 1].y = d.carriage.position.y - .26; d.blackLead.points[d.blackLead.points.length - 1].y = d.carriage.position.y + .28;
        d.updateFlexibleLead(d.redLead); d.updateFlexibleLead(d.blackLead);
        const clipCount = Math.max(0, Math.min(d.paperClips.length, state.electromagnetClips || ({ 10: 2, 20: 4, 30: 7, 40: 10, 50: 13 })[state.electromagnetTurns] || 2));
        let attachQ = 0; if (stage === 3) attachQ = smooth((t / 1.55 - .68) / .32); else if (stage >= 4 && stage <= 6) attachQ = 1;
        const poleAnchor = new THREE.Vector3(d.poleTip.x, d.carriage.position.y + d.poleTip.y, d.poleTip.z);
        for (let i = 0; i < d.paperClips.length; i++) { const clip = d.paperClips[i], attached = i < clipCount && attachQ > 0, pickupTarget = poleAnchor.clone().add(clip.pickupOffset), hangingTarget = poleAnchor.clone().add(clip.chainOffset), target = pickupTarget.lerp(hangingTarget, liftQ); if (attached) { clip.mesh.position.lerpVectors(clip.origin, target, attachQ); clip.mesh.rotation.set(.04 * Math.sin(time * .004 + clip.phase), .18 * (i % 4 - 1.5), .05 * Math.sin(time * .006 + clip.phase)); clip.mesh.position.x += Math.sin(time * .005 + clip.phase) * .012 * attachQ; clip.mesh.position.z += Math.cos(time * .004 + clip.phase) * .008 * attachQ } else { clip.mesh.position.copy(clip.origin); clip.mesh.rotation.copy(clip.originRotation) } }
      }
      else if (d.kind === 'convection') {
        const stage = state.convectionStage || 0, t = Math.max(0, state.convectionTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) };
        const crystalStart = new THREE.Vector3(-2.35, .36, .52), crystalTarget = d.path.getPointAt(.985), dropQ = stage === 1 ? smooth(t / 1.9) : stage >= 2 ? 1 : 0;
        d.crystal.position.lerpVectors(crystalStart, crystalTarget, dropQ); d.crystal.position.y += Math.sin(Math.PI * dropQ) * .45; d.crystal.rotation.set(dropQ * .9, dropQ * 1.4, dropQ * .35); d.crystal.scale.setScalar(stage >= 3 ? .45 : 1);
        const active = stage >= 3, runQ = stage === 3 ? clamp(t / 8.4) : stage >= 4 ? 1 : 0, head = (stage === 3 ? t * .075 : time * .000018) % 1, trail = Math.min(1, .08 + runQ * 1.15);
        for (let i = 0; i < d.tracerParticles.length; i++) { const particle = d.tracerParticles[i], visible = active && (runQ > .015 || stage >= 4) && (i / d.tracerParticles.length <= Math.min(1, runQ * 1.35 + .08)); particle.mesh.visible = visible; if (visible) { const u = (head - i / d.tracerParticles.length * trail + 1) % 1, point = d.path.getPointAt(u), tangent = d.path.getTangentAt(u); particle.mesh.position.copy(point); particle.mesh.position.z += particle.spread + Math.sin(time * .004 + particle.phase) * .018; particle.mesh.position.x += -tangent.y * particle.spread * .6; particle.mesh.position.y += tangent.x * particle.spread * .6; particle.mesh.material.opacity = .34 + .55 * (1 - i / d.tracerParticles.length) * (stage === 3 ? .8 + .2 * Math.sin(time * .006 + particle.phase) : 1); particle.mesh.scale.setScalar(.75 + .35 * Math.sin(time * .005 + particle.phase)) } }
        for (let i = 0; i < d.arrows.length; i++) { const arrow = d.arrows[i], visible = active && runQ > .18; arrow.visible = visible; if (visible) { const u = (i / d.arrows.length + head * .18) % 1, point = d.path.getPointAt(u), tangent = d.path.getTangentAt(u).normalize(); arrow.position.copy(point); arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent); arrow.material.opacity = .22 + .25 * Math.sin(time * .004 + i) } }
        d.heatLight.intensity = stage === 3 ? 2.2 + .35 * Math.sin(time * .009) : 0;
      }
      else if (d.kind === 'conduction') {
        const t = Math.max(0, state.conductionTimer || 0), active = state.conductionStage === 1 && state.running, clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) };
        const speed = { copper: .82, aluminium: .61, steel: .42 };
        d.heatLight.intensity = active ? 2.7 + .4 * Math.sin(time * .011) : 0; d.heatBlockMat.emissiveIntensity = active ? 1.2 + 1.1 * smooth(t / 2) : .18 * (state.complete ? 1 : 0);
        for (const rod of d.rods) { const front = clamp(t * speed[rod.id] / 3.7); rod.material.emissiveIntensity = (active || state.complete) ? front * (.18 + .18 * Math.sin(time * .006)) : 0 }
        for (const band of d.heatBands) { const reach = t * speed[band.metal], distance = band.distanceIndex * .29, age = reach - distance, visible = (active || state.complete) && age > 0; band.mesh.material.opacity = visible ? Math.max(.04, .48 * Math.exp(-Math.max(0, age) * .42)) * (.76 + .24 * Math.sin(time * .008 + band.distanceIndex)) : 0; band.mesh.scale.setScalar(visible ? 1 + .06 * Math.sin(time * .009 + band.distanceIndex) : 1) }
        for (const pin of d.pins) { const melt = smooth((t - (pin.threshold - .85)) / .85), fall = state.complete ? 1 : smooth((t - pin.threshold) / .5); pin.wax.material.opacity = .92 * (1 - melt * .86); pin.wax.scale.set(1.2 * (1 + .15 * melt), .48 * (1 - .72 * melt), .8 * (1 + .2 * melt)); pin.wax.position.y = pin.origin.y - .085 - .035 * melt; if (fall <= 0) { pin.mesh.position.copy(pin.origin); pin.mesh.rotation.set(0, 0, .035 * Math.sin(pin.phase)) } else { const wobble = Math.sin(Math.PI * fall) * (1 - fall * .35); pin.mesh.position.set(pin.origin.x + .18 * Math.sin(pin.phase) * fall, THREE.MathUtils.lerp(pin.origin.y, .17, fall), pin.origin.z + .12 * Math.cos(pin.phase) * fall); pin.mesh.rotation.x = .28 * Math.cos(pin.phase) * wobble; pin.mesh.rotation.y = fall * (.65 + .18 * Math.sin(pin.phase)); pin.mesh.rotation.z = .34 * Math.sin(pin.phase) * wobble } }
      }
      else if (d.kind === 'thermalRadiation') {
        const stage = state.thermalStage || 0, t = Math.max(0, state.thermalTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, hot = stage >= 2;
        const fillQ = stage === 1 ? smooth(t / 2.65) : hot ? 1 : 0, start = new THREE.Vector3(-2.35, 0, .16), pour = new THREE.Vector3(-1.53, 1.52, -.08), returnQ = stage === 1 ? smooth((fillQ - .78) / .22) : 0, approach = stage === 1 ? smooth(fillQ / .42) : 0;
        if (stage === 1) { d.flask.position.lerpVectors(start, pour, approach); if (returnQ > 0) d.flask.position.lerpVectors(pour, start, returnQ); d.flask.position.y += Math.sin(Math.PI * approach) * (returnQ ? 0 : .2); d.flask.rotation.z = -1.18 * smooth((fillQ - .28) / .24) * (1 - returnQ) } else { d.flask.position.copy(start); d.flask.rotation.z = 0 }
        for (let i = 0; i < d.waterDrops.length; i++) { const drop = d.waterDrops[i], local = (fillQ - (.43 + i * .035)) / .13, fall = clamp(local), visible = stage === 1 && local >= 0 && local <= 1; drop.visible = visible; if (visible) { drop.position.set(i % 2 ? .018 : -.018, THREE.MathUtils.lerp(2.2, 1.9, fall * fall), -.08); drop.material.opacity = Math.sin(Math.PI * Math.min(.999, fall)) * .84; drop.scale.set(.78, 1.25 - fall * .3, .78) } }
        d.hotLight.intensity = (hot || stage === 1) ? 1.2 + 1.8 * fillQ : 0;
        for (let i = 0; i < d.heatWaves.length; i++) { const wave = d.heatWaves[i], cycle = (time * .00022 + i / d.heatWaves.length) % 1; wave.visible = hot || stage === 1 && fillQ > .55; wave.scale.set(1 + cycle * .55, .78 + cycle * .35, 1 + cycle * .55); wave.material.opacity = wave.visible ? (1 - cycle) * (.1 + .06 * (i % 3)) : 0 }
        d.cube.rotation.y = -.24 + (state.thermalRotation || 0);
        const moveQ = stage === 3 ? smooth(t / 2.7) : stage >= 4 ? 1 : 0, rest = new THREE.Vector3(2.52, .1, 1.1), foreground = new THREE.Vector3(0, 1.68, 5.25), screenFacingTilt = -Math.atan2(3.6, 8.55);
        d.cameraGroup.position.lerpVectors(rest, foreground, moveQ); d.cameraGroup.position.y += stage === 3 ? Math.sin(Math.PI * moveQ) * .2 : 0; d.cameraGroup.rotation.y = THREE.MathUtils.lerp(-.35, 0, moveQ); d.cameraGroup.rotation.x = THREE.MathUtils.lerp(0, screenFacingTilt, moveQ); d.cameraGroup.scale.setScalar(THREE.MathUtils.lerp(.72, 1.55, moveQ));
        this.paintThermalCameraScreen(d, state);
      }
      else if (d.kind === 'density') {
        const stage = state.densityStage || 0, t = Math.max(0, state.densityTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, fill = stage < 2 ? 0 : stage > 2 ? 1 : smooth(t / .82), transfer = stage < 2 ? 0 : stage > 2 ? 1 : smooth((t - .58) / (3.6 - .58)), lower = stage < 4 ? 0 : stage > 4 ? 1 : smooth(t / 2.8), displacement = stage < 4 ? 0 : stage > 4 ? 1 : smooth((t - .95) / (4.4 - 1.2));
        const waterTop = .2 + (1.245 - .2) * fill, waterHeight = Math.max(.025, waterTop - .19), waterVisible = stage >= 2 && fill > .004;
        if (d.eurekaWater) { d.eurekaWater.visible = waterVisible; d.eurekaWater.scale.y = waterHeight / d.waterMaxHeight; d.eurekaWater.position.y = .19 + waterHeight / 2 }
        if (d.waterSurface) { d.waterSurface.visible = waterVisible; d.waterSurface.position.y = waterTop + (stage === 4 ? Math.sin(t * 8.5) * .004 * displacement : 0) }
        if (d.waterMeniscus) { d.waterMeniscus.visible = waterVisible; d.waterMeniscus.position.y = (d.waterSurface?.position.y || waterTop) + .006 }
        let x = d.balanceX, y = .78, z = .04;
        if (stage === 2) { x = THREE.MathUtils.lerp(d.balanceX, d.canX, transfer); y = THREE.MathUtils.lerp(.78, 1.92, transfer) + Math.sin(Math.PI * transfer) * .52; z = THREE.MathUtils.lerp(.04, .02, transfer) - Math.sin(Math.PI * transfer) * .13 }
        else if (stage === 3) { x = d.canX; y = 1.92; z = .02 }
        else if (stage === 4) { x = d.canX; y = THREE.MathUtils.lerp(1.92, .58, lower) + (t > 2.8 ? Math.sin((t - 2.8) * 8) * Math.exp(-(t - 2.8) * 2.2) * .035 : 0); z = .02 }
        else if (stage > 4) { x = d.canX; y = .58; z = .02 }
        d.solidMesh.position.set(x, y, z); d.solidMesh.rotation.set(.12 + transfer * .42, transfer * .78 + lower * .3, transfer * -.18);
        if (d.stringLine) { const visible = stage > 2 || transfer > .018; d.stringLine.visible = visible; const position = d.stringLine.geometry.attributes.position; position.setXYZ(0, x, 2.72, z); position.setXYZ(1, x, y + .15, z); position.needsUpdate = true; if (d.knot) { d.knot.visible = visible; d.knot.position.set(x, y + .145, z) } }
        const cylinderHeight = Math.max(.025, displacement * (d.sampleVolume / 100) * .78);
        if (d.cylinderLiquid) { d.cylinderLiquid.scale.y = cylinderHeight / d.cylinderBaseHeight; d.cylinderLiquid.position.y = .1 + cylinderHeight / 2 }
        if (d.cylinderMeniscus) d.cylinderMeniscus.position.y = .1 + cylinderHeight;
        if (d.overflowStream) d.overflowStream.visible = stage === 4 && displacement > .008 && displacement < .992;
        for (let i = 0; i < d.ripples.length; i++) { const ripple = d.ripples[i], q = clamp((t - .88 - i * .16) / .9), visible = stage === 4 && q > 0 && q < 1; ripple.visible = visible; if (visible) { ripple.scale.setScalar(1 + q * 3.6); ripple.material.opacity = (1 - q) * .78 } }
        for (let i = 0; i < d.splashDrops.length; i++) { const drop = d.splashDrops[i], q = clamp((t - .9 - (i % 4) * .045) / (.66 + (i % 3) * .08)), visible = stage === 4 && q > 0 && q < 1; drop.visible = visible; if (visible) { const angle = i * 2.399, radial = .055 + q * (.2 + (i % 3) * .03); drop.position.set(d.canX + Math.cos(angle) * radial, 1.28 + Math.sin(Math.PI * q) * (.17 + (i % 4) * .026) - q * .035, Math.sin(angle) * radial * .72); drop.material.opacity = Math.sin(Math.PI * q) * .92 } }
        for (let i = 0; i < d.airBubbles.length; i++) { const bubble = d.airBubbles[i], visible = stage === 4 && t >= 1.02; bubble.visible = visible; if (visible) { const cycle = (t * (.42 + (i % 4) * .035) + i * .137) % 1, angle = i * 2.399, radius = .07 + (i % 5) * .035; bubble.position.set(d.canX + Math.cos(angle) * radius, 1.13 + cycle * .2, Math.sin(angle) * radius); bubble.scale.set(1, 1.08 + cycle * .22, 1); bubble.material.opacity = .38 + .42 * (1 - cycle) } }
      }
      else if (d.kind === 'wireResistance') {
        const stage = state.wireStage || 0, t = Math.max(0, state.wireTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) };
        const currentLength = Math.max(20, Math.min(100, state.wireLengthCm || 20)), currentX = d.rulerStartX + d.rulerLength * currentLength / 100, nextLength = Math.min(100, currentLength + 20), nextX = d.rulerStartX + d.rulerLength * nextLength / 100;
        const switchQ = stage === 1 ? smooth(t / .58) : stage === 2 ? 1 : 0;
        d.switchPivot.rotation.z = THREE.MathUtils.lerp(.42, -.02, switchQ);
        d.powerLed.material.emissiveIntensity = switchQ * (3.1 + .28 * Math.sin(time * .012)); d.powerLed.material.color.setHex(switchQ > .02 ? 0x39d79c : 0x40575d);
        d.wireMaterial.emissiveIntensity = switchQ * (.1 + .025 * Math.sin(time * .009));
        let clipX = currentX, clipY = .34, openQ = 0;
        if (stage === 4) {
          openQ = smooth(t / .36) * (1 - smooth((t - 2.05) / .4));
          const moveQ = smooth((t - .28) / 1.78); clipX = THREE.MathUtils.lerp(currentX, nextX, moveQ); clipY = .34 + Math.sin(Math.PI * moveQ) * .42;
        }
        d.sliderClip.position.set(clipX, clipY, d.rulerZ + .02);
        d.sliderUpperJaw.rotation.x = -.34 * openQ; d.sliderLowerJaw.rotation.x = .16 * openQ;
        for (const lead of [d.sliderLead, d.voltSliderLead]) { lead.points[0].x = clipX; lead.points[0].y = clipY + .02; lead.points[1].x = clipX + .18; lead.points[1].y = .13 + Math.sin(Math.PI * clamp((t - .28) / 1.78)) * .1; d.updateFlexibleLead(lead) }
        const measuredLength = Math.max(.02, clipX - d.rulerStartX);
        d.measuredSegment.position.set(d.rulerStartX + measuredLength / 2, .252, d.rulerZ);
        d.measuredSegment.scale.set(1, measuredLength, 1);
        const targetResistance = ({ 20: 1.8, 40: 3.6, 60: 5.4, 80: 7.2, 100: 9 })[currentLength] || 1.8, targetCurrent = 1.5 / targetResistance;
        const settle = stage === 1 ? smooth(t / 1.45) : stage === 2 ? 1 : 0, wobble = stage === 1 ? (1 - settle) * Math.sin(t * 18) * .12 : 0, displayVoltage = switchQ * (1.5 * settle + wobble), displayCurrent = switchQ * (targetCurrent * settle + wobble * .18);
        const paintDisplay = (display, value, unit, accent, label) => {
          const { canvas, context: dc, texture } = display; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#071c22'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.shadowColor = accent; dc.shadowBlur = 20; dc.fillStyle = switchQ > .02 ? accent : '#8ba0a3'; dc.font = '800 88px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'right'; dc.textBaseline = 'middle'; dc.fillText(`${Math.max(0, value).toFixed(2)} ${unit}`, canvas.width - 25, 84); dc.shadowBlur = 0; dc.fillStyle = '#aec1c5'; dc.font = '700 26px Inter, sans-serif'; dc.textAlign = 'left'; dc.fillText(label, 24, 148); texture.needsUpdate = true
        };
        paintDisplay(d.ammeterDisplay, displayCurrent, 'A', '#ff8c90', 'CURRENT THROUGH WIRE'); paintDisplay(d.voltmeterDisplay, displayVoltage, 'V', '#c59cff', 'P.D. ACROSS TEST LENGTH');
        { const { canvas, context: dc, texture } = d.supplyDisplay; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#071c22'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.shadowColor = switchQ > .02 ? '#75ffe0' : '#6f8589'; dc.shadowBlur = 18; dc.fillStyle = switchQ > .02 ? '#8affdf' : '#9badaf'; dc.font = '800 70px ui-monospace, Menlo, monospace'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(switchQ > .02 ? '1.50 V' : '0.00 V', 256, 72); dc.shadowBlur = 0; dc.fillStyle = '#b4c3c5'; dc.font = '700 26px Inter, sans-serif'; dc.fillText(switchQ > .02 ? 'OUTPUT ON' : 'OUTPUT ISOLATED', 256, 136); texture.needsUpdate = true }
        for (const particle of d.chargeParticles) { particle.mesh.visible = switchQ > .05; if (particle.mesh.visible) { const phase = (particle.phase + time * .00018 * (.5 + targetCurrent)) % 1; particle.mesh.position.set(THREE.MathUtils.lerp(d.rulerStartX, clipX, phase), .286, d.rulerZ); particle.mesh.material.opacity = .36 + .58 * Math.sin(Math.PI * phase); particle.mesh.scale.setScalar(.72 + .25 * Math.sin(time * .01 + particle.phase * 12)) } }
      }
      else if (d.kind === 'magneticField') {
        const stage = state.fieldStage || 0, t = Math.max(0, state.fieldTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) };
        const sprinkleQ = stage === 1 ? clamp(t / 3.35) : stage > 1 ? 1 : 0, alignQ = stage === 3 ? smooth((t - .48) / 3.6) : stage >= 4 ? 1 : 0, clearQ = stage === 5 ? smooth(t / 1.38) : 0;
        if (stage === 1) {
          const approach = smooth(t / .58), work = smooth((t - .42) / 2.48), returnQ = smooth((t - 2.82) / .53), lanes = 3, laneRaw = work * lanes, lane = Math.min(lanes - 1, Math.floor(laneRaw)), laneQ = laneRaw - lane, passX = lane % 2 === 0 ? THREE.MathUtils.lerp(-2.55, 2.55, laneQ) : THREE.MathUtils.lerp(2.55, -2.55, laneQ), passZ = THREE.MathUtils.lerp(1.18, -1.18, lane / (lanes - 1)), workPos = new THREE.Vector3(passX, 2.1, passZ), rest = d.shakerStart;
          d.shaker.position.lerpVectors(rest, workPos, approach); if (returnQ > 0) d.shaker.position.lerpVectors(workPos, rest, returnQ); d.shaker.position.y += Math.sin(Math.PI * approach) * (returnQ ? 0 : .18); d.shaker.rotation.z = -1.02 * smooth((t - .35) / .45) * (1 - returnQ); d.shaker.rotation.y = .07 * Math.sin(t * 14);
        } else { d.shaker.position.copy(d.shakerStart); d.shaker.rotation.set(0, 0, 0) }
        for (const grain of d.fallingGrains) { const local = (sprinkleQ - grain.phase * .18 - grain.lane * .18) / .18, fall = clamp(local), visible = stage === 1 && local >= 0 && local <= 1; grain.mesh.visible = visible; if (visible) { const origin = d.shaker.position.clone().add(new THREE.Vector3(grain.lateral, -.12, (grain.lane - 1.5) * .04)), targetY = d.paperY + .04; grain.mesh.position.set(origin.x + Math.sin(grain.phase * 31) * .07 * fall, THREE.MathUtils.lerp(origin.y, targetY, fall * fall), origin.z + Math.cos(grain.phase * 27) * .08 * fall); grain.mesh.material.opacity = Math.sin(Math.PI * Math.min(.999, fall)) * .9; grain.mesh.scale.set(.75, 1.28 - fall * .34, .75) } }
        for (const filing of d.filings) {
          const deposited = sprinkleQ >= filing.threshold, alignment = alignQ, visible = stage !== 0 && deposited && !(stage === 5 && clearQ > clamp((filing.target.x + 3.05) / 6.1));
          filing.mesh.visible = visible;
          if (!visible) continue;
          filing.mesh.position.lerpVectors(filing.start, filing.target, alignment);
          const angleDelta = Math.atan2(Math.sin(filing.finalAngle - filing.initialAngle), Math.cos(filing.finalAngle - filing.initialAngle));
          filing.mesh.rotation.y = filing.initialAngle + angleDelta * alignment;
          if (stage === 1) { const age = clamp((sprinkleQ - filing.threshold) / .12); filing.mesh.position.y = d.paperY + .025 + Math.sin(age * Math.PI) * .08 * (1 - age) }
          else if (stage === 3) { const hop = Math.abs(Math.sin(t * 12 + filing.hopPhase)) * Math.max(0, 1 - alignment) * .055; filing.mesh.position.y = d.paperY + .025 + hop }
          else if (stage === 5) { filing.mesh.position.x += clearQ * .75; filing.mesh.position.y = d.paperY + .025 + Math.sin(Math.PI * clearQ) * .12; filing.mesh.material.transparent = true; filing.mesh.material.opacity = Math.max(0, 1 - clearQ * 1.12) }
          else { filing.mesh.position.y = d.paperY + .025; filing.mesh.material.opacity = 1 }
        }
        if (stage === 3) {
          const approach = smooth(t / .42), tapWindow = clamp((t - .35) / 3.55), tapIndex = Math.floor(tapWindow * 8), edgeX = tapIndex % 2 === 0 ? -2.78 : 2.78, edgeZ = -1.34 + (tapIndex % 4) * .9, tipY = d.paperY + .13 + Math.abs(Math.sin(t * 13.5)) * .34;
          d.tapper.position.lerpVectors(new THREE.Vector3(2.9, .18, 1.72), new THREE.Vector3(edgeX, tipY, edgeZ), approach); d.tapper.rotation.z = THREE.MathUtils.lerp(-.28, edgeX < 0 ? .4 : -.4, approach);
          const vibration = (1 - alignQ) * Math.sin(t * 38) * .008; d.paper.position.y = d.paperY + vibration; d.paperEdge.position.y = d.paperY + vibration;
        } else { d.tapper.position.set(2.9, .18, 1.72); d.tapper.rotation.set(0, 0, -.28); d.paper.position.y = d.paperY; d.paperEdge.position.y = d.paperY }
        d.brush.visible = stage === 5;
        if (stage === 5) { d.brush.position.set(THREE.MathUtils.lerp(-3.55, 3.55, clearQ), .88 + Math.sin(Math.PI * clearQ) * .12, 1.44 - Math.sin(clearQ * Math.PI * 2) * .18); d.brush.rotation.z = -.08 + .05 * Math.sin(t * 6) }
        const current = d.currentConfiguration, next = Math.min(d.configurationGroups.length - 1, current + 1);
        for (let i = 0; i < d.configurationGroups.length; i++) { const group = d.configurationGroups[i]; group.visible = i === current || (stage === 5 && i === next) }
        if (stage === 5) { const swap = smooth((t - 1.12) / 1.92); d.configurationGroups[current].position.x = THREE.MathUtils.lerp(0, -7, swap); d.configurationGroups[next].position.set(THREE.MathUtils.lerp(7, 0, swap), .31, .05) }
      }
      else if (d.kind === 'filamentLamp') { const pulse = .94 + .04 * Math.sin(time * .019) + .02 * Math.sin(time * .047 + 1.2); d.filamentMat.color.setRGB(1, .72 + .2 * pulse, .3 + .25 * pulse); d.bulbMat.emissiveIntensity = .66 + .14 * pulse; d.light.intensity = 6.2 + .32 * pulse; d.bulbGlow.intensity = 2.25 + .28 * pulse }
      else if (d.kind === 'flameTest') {
        const stage = state.flameTestStage || 0, t = Math.max(0, state.flameTestTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, above = d.jarPoint.clone().add(new THREE.Vector3(0, .4, 0)), dip = d.jarPoint.clone().add(new THREE.Vector3(0, -.16, 0)); let point = d.restPoint.clone(), rotation = .05;
        if (stage === 1) { if (t < .62) { const q = smooth(t / .62); point.lerpVectors(d.restPoint, above, q); point.y += Math.sin(Math.PI * q) * .5; rotation = THREE.MathUtils.lerp(.05, -.08, q) } else if (t < 1.24) { const q = smooth((t - .62) / .62); point.lerpVectors(above, dip, q); rotation = THREE.MathUtils.lerp(-.08, -.24, q) } else { const q = smooth((t - 1.24) / .91); point.lerpVectors(dip, above, q); rotation = THREE.MathUtils.lerp(-.24, -.44, q) } } else if (stage === 2) { point.copy(above); rotation = -.44 } else if (stage === 3) { const q = smooth(t / 1.18); point.lerpVectors(above, d.flamePoint, q); point.y += Math.sin(Math.PI * q) * .7; rotation = -.44 } else if (stage >= 4) { point.copy(d.flamePoint); rotation = -.44 }
        d.spatula.position.copy(point); d.spatula.rotation.set(0, 0, rotation); d.saltLoad.visible = stage >= 2 || stage === 1 && t > .78;
        const saltX = point.x + (d.saltLocalX ?? -.12), saltY = point.y + .035, saltZ = point.z;
        d.outer.position.set(saltX, saltY, saltZ); d.core.position.set(saltX, saltY, saltZ); d.halo.position.set(saltX, saltY, saltZ); d.colourLight.position.set(saltX, saltY + .5, saltZ);
        const active = stage >= 4 || stage === 3 && t > .95, level = stage >= 4 ? 1 : active ? smooth((t - .95) / .55) : 0, pulse = active ? 1 + .045 * Math.sin(time * .027 + d.seed) + .018 * Math.sin(time * .053) : 1; d.outer.visible = d.core.visible = d.halo.visible = active; d.outer.scale.set(pulse, 1 + .035 * Math.sin(time * .031 + d.seed), pulse); d.core.scale.set(1 / pulse, 1 + .048 * Math.sin(time * .037 + d.seed), 1 / pulse); d.halo.scale.set(.9 * pulse, 1.18 * (1 + .025 * Math.sin(time * .021)), .9 * pulse); d.outerMat.opacity = .23 * level; d.coreMat.opacity = .38 * level; d.haloMat.opacity = .12 * level; d.colourLight.intensity = level * (5.4 + .6 * Math.sin(time * .023 + d.seed))
      }
      else if (d.kind === 'co2Bubble') { const active = !!state.running, q = (time * .001 * d.speed + d.phase) % 1, spread = .018 + q * .13, side = Math.sin(q * 12.4 + d.angle) * spread; d.mesh.visible = active; d.mesh.position.set(Math.cos(d.angle) * spread * .55 + side * .32, THREE.MathUtils.lerp(d.startY, d.surfaceY, q), Math.sin(d.angle) * spread * .46); d.mesh.material.opacity = active ? Math.sin(Math.PI * Math.min(.999, q)) * (.72 + (d.angle % 1) * .12) : 0; const pulse = .78 + q * .52 + Math.sin(time * .009 + d.angle) * .08; d.mesh.scale.set(pulse, pulse * (1.06 + q * .22), pulse) }
      else if (d.kind === 'electroCopper') { const q = Math.max(0, Math.min(1, state.progress || 0)), height = .012 + d.maxHeight * q; d.sleeve.visible = q > .004; d.sleeve.scale.y = height / d.maxHeight; d.sleeve.position.y = d.baseY + height / 2; for (const n of d.nodules) { const raw = Math.max(0, Math.min(1, (q - n.threshold) / .18)), grow = raw * raw * (3 - 2 * raw); n.mesh.visible = grow > .008; n.mesh.scale.setScalar(Math.max(.001, grow * (.82 + .18 * Math.sin(time * .004 + n.threshold * 17)))) } d.solution.material.color.copy(d.startColor).lerp(d.endColor, q * .62); d.meniscus.material.color.copy(d.startColor).lerp(d.endColor, q * .62) }
      else if (d.kind === 'displacementTube') { const clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, stage = state.displacementStage || 0, t = stage === 0 ? 0 : stage >= 2 ? 6.4 : Math.max(0, state.displacementTimer || 0), drop = smooth((t - d.index * .12) / 1.08), reaction = smooth(clamp((t - 1.0 - d.index * .15) / (4.75 / d.rate))); d.strip.position.y = THREE.MathUtils.lerp(2.72, .79, drop); d.coat.visible = reaction > .008; d.coat.scale.y = Math.max(.001, reaction); d.liquidMat.color.copy(d.startColor).lerp(d.endColor, reaction); d.meniscusMat.color.copy(d.startColor).lerp(d.endColor, reaction); d.liquidMat.opacity = .72 + .08 * reaction; d.meniscusMat.opacity = .68 + .1 * reaction; for (const n of d.nodules) { const grow = smooth((reaction - n.threshold) / .18); n.mesh.visible = grow > .008; n.mesh.scale.setScalar(Math.max(.001, grow * (.76 + .16 * Math.sin(time * .004 + n.threshold * 21)))) } for (const flake of d.settled) { const grow = smooth((reaction - flake.threshold) / .16); flake.mesh.visible = grow > .008; flake.mesh.scale.setScalar(Math.max(.001, grow * (.72 + .2 * Math.sin(time * .003 + flake.threshold * 17)))) } const active = stage === 1 && reaction > .02 && reaction < .99; d.swirl.visible = active; d.swirl.position.y = .56 + .32 * ((time * .00045 + d.index * .21) % 1); d.swirl.rotation.z = time * .0008 * (d.index % 2 ? 1 : -1); d.swirl.scale.set(.6 + reaction * .8, .6 + reaction * .8, .44 + reaction * .52); d.swirlMat.opacity = active ? (1 - reaction) * .22 + .035 : 0 }
      else if (d.kind === 'electroWeigh') { const active = !!state.electroWeighing || !!state.electroRecorded, t = state.electroRecorded ? d.duration : Math.max(0, state.electroWeighTimer || 0), smooth = value => { value = Math.max(0, Math.min(1, value)); return value * value * (3 - 2 * value) }; d.movingCathode.visible = active; d.cathodeRod.visible = !active; d.cathodeBand.visible = !active; d.originalSleeve.visible = !active && d.originalSleeve.visible; for (const n of d.originalNodules) n.mesh.visible = !active && n.mesh.visible; const release = active ? smooth(t / .34) : 0; d.cathodeClip.rotation.z = -.24 * release; d.cathodeClip.position.x = d.start.x - .065 * release; if (active) { if (t < .8) { const q = smooth(t / .8); d.movingCathode.position.lerpVectors(d.start, d.lifted, q); d.movingCathode.rotation.z = 0 } else if (t < 2.5) { const q = smooth((t - .8) / 1.7); d.movingCathode.position.lerpVectors(d.lifted, d.aboveBalance, q); d.movingCathode.position.y += Math.sin(q * Math.PI) * .24; d.movingCathode.rotation.z = 0 } else if (t < 3.6) { const q = smooth((t - 2.5) / 1.1); d.movingCathode.position.lerpVectors(d.aboveBalance, d.onBalance, q); d.movingCathode.rotation.z = Math.PI / 2 * q } else { const settle = Math.max(0, Math.min(1, (t - 3.6) / (d.duration - 3.6))); d.movingCathode.position.copy(d.onBalance); d.movingCathode.position.y += Math.abs(Math.sin((t - 3.6) * 19)) * (1 - settle) * .035; d.movingCathode.rotation.z = Math.PI / 2 } } else { d.movingCathode.position.copy(d.start); d.movingCathode.rotation.z = 0 } let reading = 0; if (state.electroRecorded) reading = 13.24; else if (state.electroWeighing && t >= 3.55) { const settle = Math.max(0, Math.min(1, (t - 3.55) / (d.duration - 3.55))); reading = 13.24 + Math.sin(t * 24) * (1 - settle) * .28 } if (d.balanceDisplay) { const { canvas, context: dc, texture } = d.balanceDisplay; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#071d20'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.shadowColor = '#77ffe1'; dc.shadowBlur = 18; dc.fillStyle = '#83f7df'; dc.font = '700 70px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'right'; dc.textBaseline = 'middle'; dc.fillText(`${reading.toFixed(2)} g`, 476, 67); texture.needsUpdate = true } }
      else if (d.kind === 'freeReaction') { const reaction = d.reaction, q = Math.max(0, Math.min(1, reaction.progress || 0)), active = !reaction.complete, pulse = .9 + .15 * Math.sin(time * .012 + d.seed); d.glow.material.opacity = (active ? .09 : .035) + Math.sin(time * .01 + d.seed) * .018; d.glow.scale.setScalar(pulse * (1 + .22 * Math.sin(q * Math.PI))); d.precip.visible = !!reaction.precipitate; d.precip.scale.setScalar(Math.max(.05, q)); for (let i = 0; i < d.precip.children.length; i++) { const flake = d.precip.children[i], phase = (time * .0007 + i * .13) % 1; flake.position.y = .12 + (i % 5) * .045 + phase * .08; flake.material.opacity = reaction.precipitate ? (.18 + .55 * q) * (active ? .85 : 1) : 0 } for (let i = 0; i < d.bubbles.length; i++) { const bubble = d.bubbles[i], phase = (time * .0008 * (.8 + (i % 3) * .12) + i * .173) % 1, visible = !!reaction.gas && (active || phase < .34); bubble.visible = visible; if (visible) { const angle = bubble.userData.angle, r = .055 + (i % 4) * .045; bubble.position.set(Math.cos(angle) * r, .18 + phase * .7, Math.sin(angle) * r); bubble.material.opacity = (active ? .7 : .28) * (1 - phase * .45); bubble.scale.setScalar(.8 + Math.sin(time * .008 + i) * .15) } } }
      else if (d.kind === 'starchLeaf') {
        const stage = state.starchStage || 0, t = Math.max(0, state.starchTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, q = stage === 1 ? clamp(t / 3.8) : stage === 3 ? clamp(t / 4.8) : stage === 5 ? clamp(t / 3.2) : stage === 7 ? clamp(t / 3.8) : 0;
        const benchLift = d.benchLift || 0, ethanolX = d.ethanolX ?? -.72, ethanolZ = d.ethanolZ ?? -.42, tubeTopY = d.ethanolTubeTopY ?? 1.89, fresh = new THREE.Vector3(-2.38, 1.98 + benchLift, .08), boil = new THREE.Vector3(-2.38, .98 + benchLift, .06), afterBoil = new THREE.Vector3(-1.5, 1.82 + benchLift, -.08), ethanol = new THREE.Vector3(ethanolX, 1.17 + benchLift, ethanolZ), curlPoint = new THREE.Vector3(ethanolX, tubeTopY + .39, ethanolZ), highPoint = new THREE.Vector3(ethanolX, tubeTopY + .81, ethanolZ), afterEthanol = new THREE.Vector3(.18, 1.82 + benchLift, -.08), rinse = new THREE.Vector3(1.1, .83, .1), tile = new THREE.Vector3(2.48, .16, .12), pos = new THREE.Vector3();
        let horizontal = 0, wilt = 0, fold = 0;
        if (stage === 0) pos.copy(fresh);
        else if (stage === 1) {
          if (q < .22) pos.lerpVectors(fresh, boil, smooth(q / .22));
          else if (q < .74) { pos.copy(boil); pos.y += Math.sin(time * .013) * .025; wilt = smooth((q - .22) / .52) }
          else pos.lerpVectors(boil, afterBoil, smooth((q - .74) / .26));
        } else if (stage === 2) pos.copy(afterBoil);
        else if (stage === 3) {
          if (q < .26) { const move = smooth(q / .26); pos.lerpVectors(afterBoil, highPoint, move); pos.y += Math.sin(Math.PI * move) * .16 }
          else if (q < .44) pos.lerpVectors(highPoint, curlPoint, smooth((q - .26) / .18));
          else if (q < .52) { pos.copy(curlPoint); fold = smooth((q - .44) / .08) }
          else if (q < .72) { pos.lerpVectors(curlPoint, ethanol, smooth((q - .52) / .2)); fold = 1 }
          else if (q < .84) { pos.copy(ethanol); pos.y += Math.sin(time * .01) * .018; fold = 1 }
          else { const exit = smooth((q - .84) / .16); pos.lerpVectors(ethanol, afterEthanol, exit); pos.y += Math.sin(Math.PI * exit) * .12; fold = 1 - exit }
        } else if (stage === 4) pos.copy(afterEthanol);
        else if (stage === 5) {
          if (q < .27) pos.lerpVectors(afterEthanol, rinse, smooth(q / .27));
          else if (q < .58) { pos.copy(rinse); pos.y += Math.sin(time * .012) * .02 }
          else { const move = smooth((q - .58) / .42); pos.lerpVectors(rinse, tile, move); pos.y += Math.sin(Math.PI * move) * .56; horizontal = move }
        } else { pos.copy(tile); horizontal = 1 }
        const leafTilt = THREE.MathUtils.lerp(-.18, -Math.PI / 2, horizontal), leafYaw = .08 * (1 - horizontal) + fold * .42, leafRoll = .12 + .16 * horizontal;
        d.leaf.position.copy(pos); d.leaf.rotation.set(leafTilt, leafYaw, leafRoll);
        const baseScale = .5, wiltScale = 1 - .08 * wilt, foldX = THREE.MathUtils.lerp(baseScale, .3, fold), foldZ = baseScale * (1 + .22 * fold); d.leaf.scale.set(foldX, baseScale * wiltScale, foldZ);
        const decolour = stage < 3 ? 0 : stage === 3 ? smooth((q - .54) / .28) : 1, iodine = stage < 7 ? 0 : stage === 7 ? smooth((q - .28) / .64) : 1, green = new THREE.Color(0x4b9851), pale = new THREE.Color(0xe6dcae), amber = new THREE.Color(0xa56a31), blueBlack = new THREE.Color(0x1c2442), leafColour = green.clone().lerp(pale, decolour);
        if (iodine > 0) leafColour.lerp(iodine < .42 ? amber : blueBlack, iodine); d.leafMat.color.copy(leafColour); d.leafMat.roughness = .48 + .18 * decolour; d.veinMat.color.copy(new THREE.Color(0xcfe0a0).lerp(new THREE.Color(iodine > .45 ? 0x0f1630 : 0x9a8550), Math.max(decolour, iodine)));
        const forcepsRoll = .08 + Math.sin(time * .003) * .01, holderOffset = new THREE.Vector3(0, .455 * (1 - horizontal), 0).applyEuler(new THREE.Euler(leafTilt, leafYaw, forcepsRoll));
        d.forceps.visible = stage < 6 || (stage === 5 && q < .72); d.forceps.position.copy(pos).add(holderOffset); d.forceps.rotation.set(leafTilt, leafYaw, forcepsRoll); d.forceps.scale.setScalar(.56);
        const pipStart = new THREE.Vector3(3.05, 1.45 + benchLift, -.57), pipTarget = new THREE.Vector3(2.48, 1.16, .12), pipQ = stage === 7 ? smooth(q / .28) : stage >= 8 ? 1 : 0; d.pipette.position.lerpVectors(pipStart, pipTarget, pipQ); d.pipette.rotation.set(0, 0, -.04 * pipQ); d.pipette.scale.setScalar(.66);
        for (let i = 0; i < d.iodineDrops.length; i++) { const drop = d.iodineDrops[i], local = (q - (.29 + i * .105)) / .18, fall = clamp(local), visible = stage === 7 && local >= 0 && local <= 1; drop.visible = visible; if (visible) { drop.position.set(pipTarget.x + (i - 1.5) * .07, THREE.MathUtils.lerp(.98, .2, fall * fall), pipTarget.z + (i % 2 ? -.05 : .04)); drop.material.opacity = Math.sin(Math.PI * Math.min(.999, fall)) * .92; drop.scale.set(.8, 1.25 - fall * .35, .8) } }
        for (let i = 0; i < d.patches.length; i++) { const threshold = .39 + (i % 6) * .065, spread = stage === 7 ? smooth((q - threshold) / .22) : 0; d.patches[i].visible = spread > .01; d.patches[i].scale.setScalar(.22 + spread * .92); d.patches[i].material.opacity = spread * (.55 + iodine * .32) }
        if (d.ethanolLiquid) { const greenQ = stage < 3 ? 0 : stage === 3 ? smooth((q - .54) / .28) : 1; d.ethanolLiquid.material.color.copy(new THREE.Color(0xe7eee6).lerp(new THREE.Color(0x6f9f62), greenQ)); d.ethanolLiquid.material.opacity = .62 + greenQ * .16 }
      }
      else if (d.kind === 'lipase') {
        const stage = state.lipaseStage || 0, t = Math.max(0, state.lipaseTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, reactionQ = stage < 2 ? 0 : stage > 2 ? 1 : clamp(t / (2.7 + (({ 20: 68, 30: 39, 40: 22, 50: 34, 60: 104 })[state.lipaseTargetTemp] || 68) / 25));
        if (d.solution) { const pink = new THREE.Color(0xdc669d), cream = new THREE.Color(0xf1ead7), fade = smooth((reactionQ - .08) / .86); d.solution.material.color.copy(pink.lerp(cream, fade)); d.solution.material.opacity = .88 - .08 * fade; d.solution.material.roughness = .2 + .22 * fade }
        const lift = d.benchLift || 0, start = new THREE.Vector3(-2.05, 1.18 + lift, .05), target = new THREE.Vector3(.18, 2.18 + lift, -.4), approach = stage === 1 ? smooth(t / .68) : 0, retreat = stage === 1 ? smooth((t - 1.4) / .4) : stage >= 2 ? 1 : 0; d.pipette.position.lerpVectors(start, target, approach); if (retreat > 0) d.pipette.position.lerpVectors(target, start, retreat); d.pipette.position.y += stage === 1 ? Math.sin(Math.PI * approach) * .12 : 0; d.pipette.rotation.set(0, 0, -.08 * approach * (1 - retreat)); d.pipette.scale.setScalar(.72);
        for (let i = 0; i < d.drops.length; i++) { const drop = d.drops[i], local = (t - (.63 + i * .14)) / .22, fall = clamp(local), visible = stage === 1 && local >= 0 && local <= 1; drop.visible = visible; if (visible) { drop.position.set(.18 + (i % 2 ? -.018 : .018), THREE.MathUtils.lerp(2.05 + lift, 1.5 + lift, fall * fall), -.4); drop.material.opacity = Math.sin(Math.PI * Math.min(.999, fall)) * .9; drop.scale.set(.78, 1.28 - fall * .3, .78) } }
        for (let i = 0; i < d.globules.length; i++) { const globule = d.globules[i], a = i * 2.399 + time * .00045 * (stage === 2 ? 1 : 0), r = .025 + (i % 5) * .022, phase = (time * .00028 + i * .137) % 1; globule.position.set(Math.cos(a) * r, .2 + (i % 9) * .055 + Math.sin(phase * Math.PI * 2) * .012, Math.sin(a) * r); const digest = Math.max(.12, 1 - reactionQ * (.58 + (i % 4) * .08)); globule.scale.setScalar(digest); globule.material.opacity = .72 * (1 - reactionQ * .62) }
        if (d.display) { const { canvas, context: dc, texture } = d.display, seconds = Math.max(0, state.time || 0), running = stage === 2; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#071c22'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.shadowColor = running ? '#ff7fb6' : '#7af4dc'; dc.shadowBlur = 18; dc.fillStyle = running ? '#ff9bc6' : '#8af4df'; dc.font = '800 82px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(`${seconds.toFixed(1)} s`, 256, 86); dc.shadowBlur = 0; dc.fillStyle = '#b6c9cd'; dc.font = '700 29px Inter, sans-serif'; dc.fillText(`${state.lipaseTargetTemp || 20} °C  ${stage === 3 ? 'ENDPOINT' : running ? 'TIMING' : 'READY'}`, 256, 171); texture.needsUpdate = true }
      }
      else if (d.kind === 'potometer') {
        const stage = state.potometerStage || 0, t = Math.max(0, state.potometerTimer || 0), wind = Math.max(0, state.potometerWindSpeed || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, duration = stage === 1 ? 2.5 : stage === 3 ? 2.6 : stage === 5 ? 6.2 : 1, q = clamp(t / duration), active = stage === 5;
        const distance = Math.max(0, state.potometerBubbleMm || 0); d.bubble.visible = stage >= 1; d.bubble.position.set(d.bubbleZeroX - distance * d.mmScale, .46, .115); d.bubble.scale.set(1, .88 + .08 * Math.sin(time * .006), 1);
        const separation = stage === 1 ? Math.sin(Math.PI * smooth(q)) * .29 : 0; d.cup.position.y = d.cupBaseY - separation;
        const press = stage === 3 ? smooth((q - .18) / .54) : 0, release = stage === 3 ? smooth((q - .8) / .18) : 0, travel = .34 * (press - release), stopcockOpen = stage === 3 ? smooth(q / .2) * (1 - smooth((q - .78) / .16)) : 0;
        d.plungerRod.position.y = d.plungerBase.rod - travel; d.plungerSeal.position.y = d.plungerBase.seal - travel; d.plungerTop.position.y = d.plungerBase.top - travel; d.stopcockPivot.rotation.z = THREE.MathUtils.lerp(.52, -.04, stopcockOpen);
        const rotorSpeed = active && wind > 0 ? (.0055 + wind * .0045) : 0; d.fanRotor.rotation.x = time * rotorSpeed; d.anemometerRotor.rotation.z = time * rotorSpeed * .8;
        const windLevel = wind / 1.5, sway = active ? .008 + windLevel * .036 : 0; d.shoot.rotation.z = Math.sin(time * (.0024 + windLevel * .0018)) * sway; d.shoot.rotation.x = Math.sin(time * .0017 + 1.2) * sway * .32;
        for (const entry of d.leafEntries) { const flutter = active ? Math.sin(time * (.0048 + windLevel * .005) + entry.phase) * windLevel * .105 : Math.sin(time * .0015 + entry.phase) * .006; entry.leaf.rotation.set(entry.base.x + flutter * .24, entry.base.y + flutter * .5, entry.base.z + flutter * entry.side) }
        for (let i = 0; i < d.airflowDashes.length; i++) { const dash = d.airflowDashes[i], cycle = (time * (.00042 + windLevel * .00062) + i * .127) % 1, visible = active && wind > 0; dash.visible = visible; if (visible) { dash.position.set(THREE.MathUtils.lerp(-1.88, -.18, cycle), 1.2 + (i % 5) * .31 + Math.sin(cycle * Math.PI + i) * .07, -.2 + (i % 4 - 1.5) * .16); dash.scale.set(1.1 + windLevel * .8, .72 + windLevel * .24, .72); dash.material.opacity = Math.sin(Math.PI * Math.min(.999, cycle)) * (.24 + .34 * windLevel) } }
        for (let i = 0; i < d.vapour.length; i++) { const mote = d.vapour[i], cycle = (time * (.00019 + windLevel * .0002) + i * .173) % 1, visible = active; mote.visible = visible; if (visible) { const side = i % 2 ? -1 : 1, sourceY = 1.55 + (i % 8) * .18; mote.position.set(side * (.18 + (i % 4) * .1) + cycle * (.1 + .35 * windLevel), sourceY + cycle * (.22 + .28 * (1 - windLevel)), .03 + (i % 5 - 2) * .12); mote.scale.setScalar(.62 + Math.sin(Math.PI * Math.min(.999, cycle)) * .72); mote.material.opacity = Math.sin(Math.PI * Math.min(.999, cycle)) * (.2 + .34 * (.35 + windLevel)) } }
        if (d.timerDisplay) { const { canvas, context: dc, texture } = d.timerDisplay, minutes = stage < 5 ? 0 : stage === 5 ? 5 * q : 5, running = stage === 5; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#071c22'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.shadowColor = running ? '#72f4de' : '#8fb4ba'; dc.shadowBlur = 18; dc.fillStyle = running ? '#91ffe8' : '#a8c0c3'; dc.font = '800 82px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(`${String(Math.floor(minutes)).padStart(2, '0')}:${String(Math.floor((minutes % 1) * 60)).padStart(2, '0')}`, 256, 86); dc.shadowBlur = 0; dc.fillStyle = '#b6c9cd'; dc.font = '700 29px Inter, sans-serif'; dc.fillText(running ? 'UPTAKE RUN' : stage === 6 ? '5 MIN COMPLETE' : 'READY', 256, 171); texture.needsUpdate = true }
        if (d.windDisplay) { const { canvas, context: dc, texture } = d.windDisplay; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#071c22'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.shadowColor = wind > 0 ? '#75f1d8' : '#91a8ad'; dc.shadowBlur = 14; dc.fillStyle = wind > 0 ? '#8ff7df' : '#b0bec0'; dc.font = '800 66px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(`${wind.toFixed(1)} m/s`, 210, 67); dc.shadowBlur = 0; dc.fillStyle = '#aec1c5'; dc.font = '700 23px Inter, sans-serif'; dc.fillText('ANEMOMETER', 210, 132); texture.needsUpdate = true }
      }
      else if (d.kind === 'randomSampling') {
        const clock = Math.max(0, state.meadowWindClock || 0), stage = state.quadratStage || 0, timer = Math.max(0, state.quadratTimer || 0), sampleIndex = Math.max(0, Math.min(d.targets.length - 1, state.quadratSampleIndex || 0)), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, grow = smooth(clock / 2.8), wind = .72 + .28 * Math.sin(clock * .41);
        d.grassUniforms.uTime.value = clock; d.grassUniforms.uWind.value = wind; d.grassUniforms.uGrow.value = grow; d.mossMaterial.opacity = smooth((clock - .28) / 1.9) * .96;
        for (const cloud of d.clouds) cloud.group.position.x = cloud.baseX + Math.sin(clock * (.055 + cloud.phase * .006) + cloud.phase) * .7;
        for (const tree of d.trees) { const gust = Math.sin(clock * .55 + tree.phase) * (.012 + tree.depthRow * .002) + Math.sin(clock * 1.35 + tree.phase * 1.7) * .004; tree.swayPivot.rotation.z = gust; tree.swayPivot.rotation.x = Math.sin(clock * .48 + tree.phase * .7) * Math.abs(gust) * .35; tree.outerLobes.forEach(lobe => { lobe.mesh.rotation.z = lobe.base.z + Math.sin(clock * 1.18 + lobe.phase) * .005; lobe.mesh.rotation.x = lobe.base.x + Math.sin(clock * .93 + lobe.phase * .74) * .003 }) }
        const count = stage >= 6 ? [4, 7, 5, 3, 6][sampleIndex] : Math.max(0, state.quadratCurrentCount || 0), highlighting = stage === 5 || stage === 6;
        for (let i = 0; i < d.daisies.length; i++) { const plant = d.daisies[i], delay = .18 + (i % 17) * .035, flowerGrow = smooth((clock - delay) / 2.25), gust = Math.sin(clock * 1.8 + i * .61) * (.022 + .018 * wind) + Math.sin(clock * .63 + i) * .012; plant.scale.set(1, Math.max(.001, flowerGrow), 1); plant.rotation.z = gust; plant.rotation.x = Math.sin(clock * 1.27 + i * .43) * .018; const included = plant.userData.sampleIndex === sampleIndex && plant.userData.localIndex < count && highlighting; plant.userData.highlight.visible = included; plant.userData.discMat.emissiveIntensity = included ? .75 + .25 * Math.sin(clock * 5 + i) : .08; plant.userData.head.scale.setScalar(included ? 1.08 + .08 * Math.sin(clock * 5 + i) : 1) }
        const [tx, tz] = d.targets[sampleIndex], start = new THREE.Vector3(-3.02, .43, 1.5), target = new THREE.Vector3(tx, .39, tz), q = stage === 3 ? clamp(timer / 2.35) : stage > 3 ? 1 : 0, eased = smooth(q), rotations = [-.18, .14, -.08, .2, -.12];
        if (stage < 3) d.quadrat.position.copy(start); else d.quadrat.position.lerpVectors(start, target, eased);
        if (stage === 3) { d.quadrat.position.y += Math.sin(Math.PI * eased) * 1.78; if (q > .76) d.quadrat.position.y += Math.abs(Math.sin((q - .76) * Math.PI * 7)) * (1 - q) * .24; d.quadrat.rotation.set(Math.sin(Math.PI * q) * .18, (1 - eased) * Math.PI * 2.15 + rotations[sampleIndex], Math.sin(Math.PI * q * 2) * .13) } else d.quadrat.rotation.set(0, stage >= 4 ? rotations[sampleIndex] : -.12, 0);
        if (d.display) { const { canvas, context: dc, texture } = d.display, cycling = stage === 1, cx = cycling ? (Math.floor(clock * 8) % 10) + 1 : [2, 8, 5, 1, 7][sampleIndex], cy = cycling ? (Math.floor(clock * 13 + 3) % 10) + 1 : [7, 3, 5, 2, 8][sampleIndex]; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#071d20'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.fillStyle = cycling ? '#fff07b' : '#85f3d2'; dc.shadowColor = cycling ? '#f9cf43' : '#57e8c1'; dc.shadowBlur = 18; dc.font = '800 90px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(`X ${cx}   Y ${cy}`, 256, 91); dc.shadowBlur = 0; dc.fillStyle = '#bed3d3'; dc.font = '700 29px Inter, sans-serif'; dc.fillText(cycling ? 'RANDOMISING COORDINATES' : 'UNBIASED GRID POINT', 256, 174); texture.needsUpdate = true }
      }
      else if (d.kind === 'rockyShoreSampling') {
        const clock = Math.max(0, state.shoreTideClock || 0), tide = Math.max(0, Math.min(.8, state.shoreTideProgress || 0)), stage = state.transectStage || 0, timer = Math.max(0, state.transectTimer || 0), index = Math.max(0, Math.min(d.stationZ.length - 1, state.transectStationIndex || 0)), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, tapeQ = stage === 1 ? smooth(timer / 3.15) : stage > 1 ? 1 : 0;
        d.tapeSegments.forEach(segment => segment.mesh.visible = segment.fraction <= tapeQ + .001); d.reel.rotation.z = -tapeQ * Math.PI * 6;
        const fromZ = index === 0 ? -.92 : d.stationZ[index - 1], toZ = d.stationZ[index], q = stage === 3 ? smooth(timer / 2.15) : stage > 3 ? 1 : 0, start = new THREE.Vector3(index === 0 ? -1.55 : 0, this.shoreHeight(index === 0 ? -1.55 : 0, fromZ) + .12, fromZ), target = new THREE.Vector3(0, this.shoreHeight(0, toZ) + .11, toZ);
        if (stage < 3) d.quadrat.position.copy(start); else d.quadrat.position.lerpVectors(start, target, q); if (stage === 3) { d.quadrat.position.y += Math.sin(Math.PI * q) * .56 + (q > .78 ? Math.abs(Math.sin((q - .78) * Math.PI * 7)) * (1 - q) * .13 : 0); d.quadrat.rotation.set(Math.sin(Math.PI * q) * .1, (1 - q) * .34, Math.sin(Math.PI * q * 2) * .06) } else d.quadrat.rotation.set(0, 0, 0);
        const highlight = stage === 5 || stage === 6; for (let i = 0; i < d.organisms.length; i++) { const organism = d.organisms[i], active = highlight && organism.userData.station === index; if (organism.material?.emissive) { organism.material.emissive.setHex(active ? 0x2b9f8b : 0x000000); organism.material.emissiveIntensity = active ? .42 : 0 } if (organism.userData.species === 'seaweed') organism.rotation.z = Math.sin(clock * 1.7 + i * .61) * (.025 + .045 * tide) }
        d.poolSeaweed?.forEach((clump, i) => { clump.rotation.z = Math.sin(clock * 1.18 + i * .83) * (.018 + .028 * tide); clump.rotation.x = Math.sin(clock * .86 + i * .47) * .012 });
        const edgeZ = THREE.MathUtils.lerp(3.95, .62, tide); d.water.position.set(0, .16, edgeZ + d.waterDepth / 2); d.waterUniforms.uTime.value = clock; d.waterUniforms.uAlpha.value = .66 + Math.sin(clock * .53) * .035;
        d.foamBands.forEach((foam, i) => { foam.position.z = edgeZ + .03 + i * .16 + Math.sin(clock * (1.25 + i * .14) + i) * .08; foam.position.y = .02 + Math.sin(clock * 2.1 + i) * .012; foam.scale.x = 1 + Math.sin(clock * .37 + i) * .025; foam.material.opacity = (.7 - i * .14) * (.76 + .24 * Math.sin(clock * 1.7 + i)) });
        d.clouds.forEach(cloud => cloud.group.position.x = cloud.baseX + Math.sin(clock * .035 + cloud.phase) * .65);
      }
      else if (d.kind === 'osmosis') {
        const stage = state.osmosisStage || 0, t = Math.max(0, state.osmosisTimer || 0), clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, duration = stage === 1 ? 2.6 : stage === 2 ? 5.4 : stage === 4 ? 3.4 : stage === 6 ? 3.2 : 1, q = clamp(t / duration), finalQ = stage < 2 ? 0 : stage === 2 ? smooth(q) : 1, finalMass = +(5 * (1 + d.change / 100)).toFixed(2), balancePos = new THREE.Vector3(d.balanceX, .95, .06), beakerPos = new THREE.Vector3(d.beakerX, .52, d.beakerZ), aboveBeaker = new THREE.Vector3(d.beakerX, 2.02, d.beakerZ), blotPos = new THREE.Vector3(d.blotX, .3, d.blotZ), pos = new THREE.Vector3(); let horizontal = 0;
        if (stage === 0 || stage === 7) { pos.copy(balancePos); horizontal = 1 }
        else if (stage === 1) {
          if (q < .16) { pos.copy(balancePos); horizontal = 1 }
          else if (q < .43) { const move = smooth((q - .16) / .27); pos.lerpVectors(balancePos, new THREE.Vector3(-1.48, 2.12, -.02), move); pos.y += Math.sin(Math.PI * move) * .16; horizontal = 1 - move * .48 }
          else if (q < .72) { const move = smooth((q - .43) / .29); pos.lerpVectors(new THREE.Vector3(-1.48, 2.12, -.02), aboveBeaker, move); pos.y += Math.sin(Math.PI * move) * .22; horizontal = .52 * (1 - move) }
          else pos.lerpVectors(aboveBeaker, beakerPos, smooth((q - .72) / .28))
        } else if (stage === 2 || stage === 3) pos.copy(beakerPos);
        else if (stage === 4) {
          if (q < .18) pos.copy(beakerPos);
          else if (q < .38) pos.lerpVectors(beakerPos, aboveBeaker, smooth((q - .18) / .2));
          else if (q < .52) { pos.copy(aboveBeaker); pos.y += Math.sin(time * .013) * .018 }
          else if (q < .72) { const move = smooth((q - .52) / .2); pos.lerpVectors(aboveBeaker, new THREE.Vector3(d.blotX, 1.18, d.blotZ), move); pos.y += Math.sin(Math.PI * move) * .32; horizontal = move }
          else if (q < .82) { const move = smooth((q - .72) / .1); pos.lerpVectors(new THREE.Vector3(d.blotX, 1.18, d.blotZ), blotPos, move); horizontal = 1 }
          else { pos.copy(blotPos); horizontal = 1 }
        } else if (stage === 5) { pos.copy(blotPos); horizontal = 1 }
        else if (stage === 6) {
          if (q < .18) { pos.copy(blotPos); horizontal = 1 }
          else if (q < .72) { const move = smooth((q - .18) / .54); pos.lerpVectors(blotPos, new THREE.Vector3(d.balanceX, 1.78, .04), move); pos.y += Math.sin(Math.PI * move) * .7; horizontal = 1 }
          else { pos.lerpVectors(new THREE.Vector3(d.balanceX, 1.78, .04), balancePos, smooth((q - .72) / .28)); horizontal = 1 }
        }
        const sharedYaw = .04, sharedTilt = -horizontal * Math.PI / 2;
        d.potato.position.copy(pos); d.potato.rotation.set(0, sharedYaw, sharedTilt);
        const radialScale = 1 + d.change / 100 * .55 * finalQ, lengthScale = 1 + d.change / 100 * .35 * finalQ; d.potato.scale.set(radialScale, lengthScale, radialScale);
        const wrinkleQ = d.change < 0 ? clamp(-d.change / 17) * finalQ : 0; for (let i = 0; i < d.wrinkles.length; i++) { const wrinkle = d.wrinkles[i]; wrinkle.visible = wrinkleQ > .04; wrinkle.material.opacity = wrinkleQ * (.28 + (i % 2) * .12); wrinkle.scale.set(1 - .025 * wrinkleQ, 1, 1 - .025 * wrinkleQ) }
        const holding = stage === 0 || stage === 1 || stage === 4 && q < .83 || stage === 6, offset = new THREE.Vector3(horizontal ? .21 : 0, horizontal ? .02 : .47, 0); d.forceps.visible = holding; d.forceps.position.copy(pos).add(offset); d.forceps.rotation.copy(d.potato.rotation); d.forceps.scale.setScalar(.58);
        const sharedAngleDegrees = +THREE.MathUtils.radToDeg(sharedTilt).toFixed(2), relativeAngleDegrees = +THREE.MathUtils.radToDeg(d.potato.rotation.z - d.forceps.rotation.z).toFixed(3); this.osmosisRotationState = { shared_angle_degrees: sharedAngleDegrees, potato_angle_degrees: sharedAngleDegrees, forceps_angle_degrees: +THREE.MathUtils.radToDeg(d.forceps.rotation.z).toFixed(2), relative_angle_degrees: relativeAngleDegrees, shared_rotation_source: true, same_rate_and_direction: true, remain_parallel: Math.abs(relativeAngleDegrees) < .001, forceps_visible: holding };
        for (let i = 0; i < d.waterMolecules.length; i++) { const molecule = d.waterMolecules[i], active = stage === 2, cycle = (time * .00046 * (.86 + (i % 5) * .07) + i * .137) % 1, localDirection = Math.abs(d.change) < 2 ? (i % 2 ? 1 : -1) : d.change > 0 ? 1 : -1, r = localDirection > 0 ? THREE.MathUtils.lerp(.62, .17, smooth(cycle)) : THREE.MathUtils.lerp(.17, .62, smooth(cycle)), angle = i * 2.399 + time * .00018 * (i % 2 ? 1 : -1); molecule.visible = active; if (active) { molecule.position.set(d.beakerX + Math.cos(angle) * r, .24 + (i % 9) * .082 + Math.sin(cycle * Math.PI) * .05, d.beakerZ + Math.sin(angle) * r * .72); const envelope = Math.sin(Math.PI * Math.min(.999, cycle)); molecule.scale.setScalar(.68 + envelope * .38); molecule.children.forEach(child => { child.material.opacity = (child === molecule.children[0] ? .86 : .92) * (.35 + .65 * envelope) }) } }
        for (let i = 0; i < d.movementArrows.length; i++) { const arrow = d.movementArrows[i], active = stage === 2, pulse = .86 + .2 * Math.sin(time * .006 + i), side = i % 2 ? -1 : 1, inward = Math.abs(d.change) < 2 ? i % 2 === 0 : d.change > 0; arrow.visible = active; arrow.position.set(d.beakerX + side * .36, .43 + Math.floor(i / 2) * .27, d.beakerZ + .62); arrow.rotation.y = (inward ? (side < 0 ? 0 : Math.PI) : (side < 0 ? Math.PI : 0)); arrow.scale.setScalar(pulse) }
        for (let i = 0; i < d.drainDrops.length; i++) { const drop = d.drainDrops[i], local = (q - (.27 + i * .025)) / .27, fall = clamp(local), visible = stage === 4 && local >= 0 && local <= 1; drop.visible = visible; if (visible) { const source = pos.clone(); source.y -= horizontal ? .18 : .5; drop.position.set(source.x + (i % 3 - 1) * .035, THREE.MathUtils.lerp(source.y, stage === 4 && q < .58 ? 1.02 : .16, fall * fall), source.z + (i % 2 ? -.025 : .025)); drop.material.opacity = Math.sin(Math.PI * Math.min(.999, fall)) * .82 } }
        d.topPaper.visible = stage === 4 && q > .78; if (d.topPaper.visible) { const press = smooth((q - .78) / .12), release = smooth((q - .94) / .06); d.topPaper.position.set(d.blotX, THREE.MathUtils.lerp(1.25, .5, press) + release * .36, d.blotZ); d.topPaper.rotation.z = .035 * (1 - press) }
        if (d.timerDisplay) { const { canvas, context: dc, texture } = d.timerDisplay, minutes = stage < 2 ? 0 : stage === 2 ? 30 * q : 30, soaking = stage === 2; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#071c22'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.shadowColor = soaking ? '#58d5ff' : '#7af4dc'; dc.shadowBlur = 18; dc.fillStyle = soaking ? '#8de8ff' : '#8af4df'; dc.font = '800 82px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(`${String(Math.floor(minutes)).padStart(2, '0')}:${String(Math.floor((minutes % 1) * 60)).padStart(2, '0')}`, 256, 86); dc.shadowBlur = 0; dc.fillStyle = '#b6c9cd'; dc.font = '700 29px Inter, sans-serif'; dc.fillText(soaking ? 'OSMOSIS SOAK' : '30 MIN TIMER', 256, 171); texture.needsUpdate = true }
        if (d.balanceDisplay) { let reading = 0; if (stage === 0) reading = 5; else if (stage === 1 && q < .16) reading = 5 * (1 - smooth(q / .16)); else if (stage === 6 && q > .72) { const settle = smooth((q - .72) / .28); reading = finalMass + Math.sin(q * 64) * (1 - settle) * .32 } else if (stage === 7) reading = finalMass; const { canvas, context: dc, texture } = d.balanceDisplay; dc.clearRect(0, 0, canvas.width, canvas.height); dc.fillStyle = '#071d20'; dc.fillRect(0, 0, canvas.width, canvas.height); dc.shadowColor = '#77ffe1'; dc.shadowBlur = 18; dc.fillStyle = '#83f7df'; dc.font = '700 70px ui-monospace, SFMono-Regular, Menlo, monospace'; dc.textAlign = 'right'; dc.textBaseline = 'middle'; dc.fillText(`${Math.max(0, reading).toFixed(2)} g`, 476, 67); texture.needsUpdate = true }
      }
      else if (d.kind === 'electricHeater') { const pulse = d.active ? .82 + .18 * Math.sin(time * .009 + d.seed) : 0; d.coil.material.emissiveIntensity = d.active ? 2.25 + pulse * .65 : 0; d.indicator.material.color.setHex(d.active ? 0xff6b3c : 0x5b2721); d.indicator.scale.setScalar(d.active ? .92 + pulse * .1 : 1); d.indicator.scale.z = .36; d.light.intensity = d.active ? 3.2 + pulse * .9 : 0 }
      else if (d.kind === 'bathWater') { const pulse = Math.sin(time * .0043) * .5 + Math.sin(time * .0071 + 1.2) * .5; d.surface.position.y = d.baseY + pulse * .006; d.surface.material.opacity = .74 + Math.sin(time * .0037) * .035; if (d.volume) d.volume.material.opacity = .56 + Math.sin(time * .0029 + 1.1) * .025; if (d.ripples) d.ripples.forEach((r, i) => { const cycle = (time * .00022 + i * .46) % 1, s = .78 + cycle * .48; r.scale.set(s, s * .58, s); r.material.opacity = .52 * (1 - cycle) }); d.indicator.material.color.setHex(d.active ? 0xff7b3d : 0x41d38b); d.indicator.scale.setScalar(d.active ? .96 + .08 * Math.sin(time * .01) : 1); d.indicator.scale.z = .32; d.light.intensity = d.active ? 2.2 + .45 * Math.sin(time * .008) : .2 }
      else if (d.kind === 'coolantSleeve') { d.mesh.material.opacity = .07 + this.coolantVisualLevel * (.17 + Math.sin(time * .004) * .018) }
      else if (d.kind === 'translucencyFlow') { const active = d.source === 'coolant' ? this.coolantVisualLevel : !!state.burner && !!state.coolingWater && !state.complete && (state.progress || 0) > d.onset; d.uniforms.uTime.value = time * .001; d.uniforms.uActive.value = d.source === 'coolant' ? active : THREE.MathUtils.lerp(d.uniforms.uActive.value, active ? 1 : 0, .14) }
      else if (d.kind === 'waterBoiling') { d.group.visible = !!state.burner && !!state.coolingWater && !state.complete && (state.progress || 0) > d.onset }
      else if (d.kind === 'distillationThermometer') { const q = Math.max(0, Math.min(1, ((state.temp || 25) - 25) / 72)), height = THREE.MathUtils.lerp(d.minHeight, d.maxHeight, q); d.column.scale.y = height; d.column.position.y = d.baseY + height / 2 }
      else if (d.kind === 'receiverFill') { const fill = Math.max(0, Math.min(1, ((state.progress || 0) - .18) / .82)), level = .055 + fill * .62, height = Math.max(.08, level * 1.08); d.liquid.scale.y = height / d.maxHeight; d.liquid.position.y = .085 + height / 2; d.meniscus.position.y = .085 + height; d.surfaceY = d.groupScale * (.085 + height) }
      else if (d.kind === 'receiverDrip') { const active = !!state.burner && !!state.coolingWater && !state.complete && (state.progress || 0) > .22, q = ((state.time || 0) * d.speed + d.phase) % 1, fallQ = Math.min(1, q / .79), surface = d.fill.surfaceY + .018; d.drop.visible = active && q < .81; if (d.drop.visible) { const eased = fallQ * fallQ; d.drop.position.set(d.start.x + Math.sin(fallQ * Math.PI) * .008, THREE.MathUtils.lerp(d.start.y, surface + .025, eased), d.start.z); d.drop.material.opacity = Math.min(1, fallQ * 5) * (1 - Math.max(0, (fallQ - .92) / .08)) * .9; d.drop.scale.set(.82, 1.18 + fallQ * .42, .82) } const splashQ = Math.max(0, Math.min(1, (q - .78) / .22)), splashing = active && q >= .78; d.ring.visible = splashing; d.ring.position.set(1.55, surface, .04); d.ring.scale.setScalar(.45 + splashQ * 1.65); d.ring.material.opacity = splashing ? (1 - splashQ) * .68 : 0; for (let i = 0; i < d.splashDrops.length; i++) { const splash = d.splashDrops[i], angle = i / d.splashDrops.length * Math.PI * 2 + .35, radius = .018 + splashQ * (.075 + (i % 2) * .025); splash.visible = splashing; splash.position.set(1.55 + Math.cos(angle) * radius, surface + .012 + Math.sin(Math.PI * splashQ) * (.055 + (i % 3) * .014), .04 + Math.sin(angle) * radius * .65); splash.scale.setScalar(.72 + (1 - splashQ) * .48) } d.splashDrops[0].material.opacity = splashing ? Math.sin(Math.PI * splashQ) * .88 : 0 }
      else if (d.kind === 'titrationIndicator') { const timer = Math.max(0, state.titrationIndicatorTimer || 0), active = timer > 0, q = active ? Math.min(1, timer / d.duration) : 0, smooth = value => { value = Math.max(0, Math.min(1, value)); return value * value * (3 - 2 * value) }; let tilt = 0; if (!active) { d.group.position.copy(d.start) } else if (q < .34) { const move = smooth(q / .34); d.group.position.lerpVectors(d.start, d.pour, move); tilt = 1.64 * smooth((q - .2) / .14) } else if (q < .72) { d.group.position.copy(d.pour); tilt = 1.64 } else if (q < .84) { d.group.position.copy(d.pour); tilt = 1.64 * (1 - smooth((q - .72) / .12)) } else { d.group.position.lerpVectors(d.pour, d.start, smooth((q - .84) / .16)) } d.group.rotation.z = tilt; d.cap.visible = !active; d.nozzle.visible = active; d.group.updateMatrix(); const mouth = new THREE.Vector3(0, 1.09, 0).applyMatrix4(d.group.matrix), target = new THREE.Vector3(.06, 1.585, .1); for (let i = 0; i < d.drops.length; i++) { const drop = d.drops[i], dropQ = (q - (.44 + i * .14)) / .105, falling = active && dropQ >= 0 && dropQ <= 1; drop.visible = falling; if (falling) { const fall = smooth(dropQ); drop.position.lerpVectors(mouth, target, fall); drop.position.x += Math.sin(dropQ * Math.PI) * (.012 * (i ? 1 : -1)); drop.material.opacity = Math.sin(Math.PI * Math.min(.999, dropQ)) * .92; drop.scale.set(.78, 1.34 - dropQ * .34, .78) } } }
      else if (d.kind === 'titrationSwirl') { const active = state.titrationStage === 2 && state.running || (state.titrationDropTimer || 0) > 0, pulse = active ? Math.sin(time * .0085) : 0; d.group.position.x = d.baseX + pulse * .045; d.group.position.z = d.baseZ + Math.cos(time * .0085) * .018 * (active ? 1 : 0); d.group.rotation.y = active ? Math.sin(time * .0092) * .055 : 0; d.group.rotation.z = active ? pulse * .018 : 0 }
      else if (d.kind === 'titrationPinkBurst') { const stream = state.titrationStage === 2 && state.running, dropping = (state.titrationDropTimer || 0) > 0, fallQ = dropping ? Math.max(0, Math.min(1, 1 - state.titrationDropTimer / .42)) : 0, cycle = stream ? ((state.time || 0) * 1.78 + .08) % 1 : 1; let active = false, q = 0; if (stream && cycle < .72) { active = true; q = cycle / .72 } else if (dropping && fallQ >= .68) { active = true; q = Math.min(1, (fallQ - .68) / .32) } const envelope = active ? Math.sin(Math.PI * Math.min(.999, q)) : 0; d.group.visible = active && !state.complete && !!state.titrationIndicator; if (d.group.visible) { const expansion = .72 + q * 1.34, wobble = Math.sin(time * .013) * .018; d.group.position.set(wobble * .42, d.surfaceY + .012 - q * .026, .015 + wobble); d.core.scale.set(expansion, .09 + q * .08, .72 + q * .82); d.core.rotation.y = time * .0018; d.coreMat.opacity = envelope * (stream ? .56 : .68); d.ring.scale.setScalar(.62 + q * 1.9); d.ring.position.y = .012 - q * .018; d.ringMat.opacity = (1 - q) * envelope * .76; for (let i = 0; i < d.wisps.length; i++) { const wisp = d.wisps[i], angle = wisp.userData.angle + q * .62 * (i % 2 ? 1 : -1), reach = wisp.userData.reach * (.34 + q * 1.35); wisp.position.set(Math.cos(angle) * reach, -q * wisp.userData.sink, Math.sin(angle) * reach * .72); wisp.scale.set(1.2 + q * 1.8, .38 + q * .26, .52 + q * .5); wisp.rotation.y = -angle + .18 * Math.sin(time * .006 + i); wisp.material.opacity = envelope * (.38 + (i % 3) * .06) } } else { d.coreMat.opacity = 0; d.ringMat.opacity = 0; d.wispMat.opacity = 0 } }
      else if (d.kind === 'titrationFlow') { const reading = Math.max(0, Math.min(50, state.titrationVolume || 0)), height = Math.max(.025, d.maxHeight * (1 - reading / 50)), open = state.titrationStage === 2 && state.running, dropping = (state.titrationDropTimer || 0) > 0; d.liquid.scale.y = height; d.liquid.position.y = d.bottomY + height / 2; d.meniscus.position.y = d.bottomY + height; d.flow.visible = open; d.drop.visible = dropping; d.endpointRing.visible = false; if (dropping) { const q = Math.max(0, Math.min(1, 1 - state.titrationDropTimer / .42)), eased = q * q; d.drop.position.set(.06, THREE.MathUtils.lerp(1.62, 1.59, eased), THREE.MathUtils.lerp(.04, .095, q)); d.drop.material.opacity = Math.sin(Math.PI * Math.min(.999, q)) * .94; d.drop.scale.set(.78, 1.34 - q * .34, .78); if (q > .72) { const splashQ = (q - .72) / .28; d.endpointRing.visible = true; d.endpointRing.scale.setScalar(.6 + splashQ * 1.4); d.endpointRing.material.opacity = (1 - splashQ) * .5 } } }
      else if (d.kind === 'chromatographySolvent') { const q = Math.min(1, state.progress || 0), height = .28 + q * 1.5, frontY = -.66 + q * 1.5; d.wet.scale.y = height; d.wet.position.y = -1.01 + height / 2; d.front.position.y = frontY; d.front.material.opacity = q >= .94 ? .72 : 0 }
      else if (d.kind === 'chromatographyInk') { const q = Math.min(1, state.progress || 0), fade = Math.max(0, Math.min(1, (q - .03) / .2)); d.mesh.material.opacity = .96 * (1 - fade) }
      else if (d.kind === 'chromatographyDye') { const q = Math.min(1, state.progress || 0), ease = 1 - Math.pow(1 - q, 1.35), frontY = -.66 + q * 1.5, rawTravel = d.startY + (d.endY - d.startY) * ease, travel = Math.min(rawTravel, frontY - .045), split = Math.max(0, Math.min(1, (q - .03) / .2)), spread = 1 + Math.sin(q * Math.PI) * .72; d.mesh.position.x = 0; d.mesh.position.y = travel; d.mesh.scale.set(1 + .2 * q, spread, 1); d.tail.position.x = 0; d.tail.position.y = Math.min(d.startY + (travel - d.startY) * .72, frontY - .07); d.tail.scale.set(1.15, 1 + q * 2.4, 1); d.mesh.material.opacity = split * (.86 + .1 * Math.sin(time * .004 + d.phase)); d.tail.material.opacity = split * .15 }
      else if (d.kind === 'thermite') {
        const t = state.complete ? 8 : state.running ? Math.max(0, state.thermiteTimer || 0) : 0, clamp = q => Math.max(0, Math.min(1, q)), smooth = q => { q = clamp(q); return q * q * (3 - 2 * q) }, running = !!state.running;
        const approach = smooth(t / 1.1), retreat = smooth((t - 2.05) / .65); d.torch.position.lerpVectors(d.torchStart, d.torchTarget, approach); if (retreat > 0) d.torch.position.lerpVectors(d.torchTarget, d.torchStart, retreat); d.torch.position.y += Math.sin(approach * Math.PI) * .05; d.torch.visible = !state.complete && t < 2.72;
        const doorCloseQ = state.complete ? 1 : state.running ? smooth((t - 2.05) / .65) : 0; if (d.rightDoor) d.rightDoor.rotation.y = 0.9 * (1 - doorCloseQ);
        const torchActive = running && t < 2.46; d.outerFlame.visible = torchActive; d.innerFlame.visible = torchActive; d.torchLight.intensity = torchActive ? 1.65 + .22 * Math.sin(time * .028) : 0; if (torchActive) { const flicker = 1 + Math.sin(time * .035) * .045; d.outerFlame.scale.set(flicker, 1 + .035 * Math.sin(time * .051), flicker); d.innerFlame.scale.set(1 / flicker, 1 + .026 * Math.sin(time * .043), 1 / flicker) }
        const fuseQ = clamp((t - 1.1) / 1.5), remainingFuse = 1 - fuseQ, fuseBurning = running && t >= 1.1 && t < 2.64, emberPoint = d.fuseCurve.getPoint(remainingFuse); d.fuseEmber.visible = fuseBurning; d.fuseEmber.position.copy(emberPoint); d.fuseEmber.material.opacity = fuseBurning ? .9 : 0; d.fuseEmber.scale.setScalar(.8 + .28 * Math.sin(time * .042)); d.fuseLight.position.copy(emberPoint); d.fuseLight.intensity = fuseBurning ? 2.8 + .65 * Math.sin(time * .031) : 0;
        for (const segment of d.fuseSegments) { const distance = remainingFuse - segment.userData.mid, atFront = fuseBurning && distance >= 0 && distance < .075; segment.visible = segment.userData.mid <= remainingFuse + .008; segment.material.emissive.setHex(atFront ? 0x9a2d00 : 0x191919); segment.material.emissiveIntensity = atFront ? 1.55 : 0; segment.material.transparent = atFront; segment.material.opacity = atFront ? clamp(distance / .075) * .78 + .2 : 1 }
        const powderFade = 1 - smooth((t - 2.58) / .62); for (const grain of d.mgoPowder) { const threshold = 1 - grain.u, age = fuseQ - threshold, visible = age >= 0 && powderFade > .01 && running; grain.mesh.visible = visible; if (visible) { const source = d.fuseCurve.getPoint(grain.u), scatter = clamp(age / .2), settle = smooth((age - .06) / .48), floorY = grain.u < .3 ? 1.515 : 1.155, lift = Math.sin(Math.PI * clamp(age / .32)) * (.045 + (grain.u % 5) * .008); grain.mesh.position.set(source.x + Math.cos(grain.angle) * grain.spread * scatter, THREE.MathUtils.lerp(source.y + lift, floorY, settle), source.z + Math.sin(grain.angle) * grain.spread * scatter * .72); grain.mesh.rotation.set(grain.angle + time * .002, grain.angle * .7 + time * .0015, time * .001); grain.mesh.scale.setScalar(grain.scale * powderFade * (.78 + .18 * Math.sin(time * .008 + grain.angle))) } }
        for (let i = 0; i < d.mgoPuffs.length; i++) { const puff = d.mgoPuffs[i], q = (fuseQ * 5.4 + i * .173) % 1; puff.visible = fuseBurning; puff.position.set(emberPoint.x + Math.cos(i * 2.399) * (.018 + q * .13), emberPoint.y + .02 + q * .14, emberPoint.z + Math.sin(i * 2.399) * (.018 + q * .095)); puff.material.opacity = fuseBurning ? (1 - q) * (.12 + (i % 3) * .055) : 0; puff.scale.setScalar(.55 + q * 1.7) }
        for (let i = 0; i < d.fuseSparks.length; i++) { const spark = d.fuseSparks[i], q = (time * .001 * (1.2 + (i % 5) * .13) + i * .137) % 1; spark.visible = fuseBurning; spark.position.set(emberPoint.x + Math.cos(i * 2.399) * (.02 + q * .16), emberPoint.y + .02 + q * .2 - q * q * .13, emberPoint.z + Math.sin(i * 2.399) * (.02 + q * .12)); spark.material.opacity = fuseBurning ? (1 - q) * .9 : 0; spark.scale.setScalar(.5 + (1 - q) * .8) }
        const flashAge = t - 2.6, flashActive = running && flashAge >= 0 && flashAge < 1.08, flashEnvelope = flashActive ? Math.exp(-flashAge * 3.25) : 0, fountain = running && t >= 2.62 && t < 6.65, fountainIn = smooth((t - 2.62) / .36), fountainOut = 1 - smooth((t - 5.55) / 1.1), fountainLevel = fountain ? fountainIn * fountainOut : 0;
        d.flashCore.visible = flashActive; d.corona.visible = flashActive; d.fireColumn.visible = fountain; d.flashCore.material.opacity = flashActive ? .95 * flashEnvelope : 0; d.corona.material.opacity = flashActive ? .7 * flashEnvelope : 0; d.flashCore.scale.setScalar(.45 + 2.8 * (1 - flashEnvelope) + flashEnvelope * .7); d.corona.scale.set(1.1 + flashAge * 1.6, .78 + flashAge * 2.2, 1.1 + flashAge * 1.6); d.fireColumn.material.opacity = .055 + .14 * fountainLevel; d.fireColumn.scale.set(.54 + .22 * Math.sin(time * .029), .32 + fountainLevel * (.78 + .1 * Math.sin(time * .041)), .54 + .19 * Math.sin(time * .033 + 1)); d.flashLight.intensity = flashActive ? 38 * flashEnvelope : fountain ? 6.5 * fountainLevel : state.complete ? .65 : 0;
        d.shockwaves.forEach((wave, i) => { const q = clamp((flashAge - i * .12) / .58), visible = flashActive && flashAge >= i * .12; wave.visible = visible; wave.scale.setScalar(.7 + q * 7.5); wave.material.opacity = visible ? (1 - q) * (.72 - i * .14) : 0 });
        const local = t - 2.62; d.sparkMesh.visible = fountain; for (let i = 0; i < d.sparkData.length; i++) { const s = d.sparkData[i], elapsed = local - s.delay; let scale = 0, x = 0, y = 1.54, z = 0, velocity = new THREE.Vector3(0, 1, 0); if (fountain && elapsed >= 0) { const cycle = Math.floor(elapsed / s.life), age = elapsed - cycle * s.life, q = age / s.life, angle = s.angle + cycle * .37, speed = s.speed * (s.heavy ? .62 : 1), vy = s.vy * (s.heavy ? .62 : 1); x = Math.cos(angle) * (.05 + speed * age); z = Math.sin(angle) * (.04 + speed * age * .78); y = 1.54 + vy * age - (s.heavy ? 2.7 : 2.2) * age * age; if (y > .18) { scale = (1 - q) * (.86 + (i % 5) * .16) * fountainLevel; velocity.set(Math.cos(angle) * speed, vy - (s.heavy ? 5.4 : 4.4) * age, Math.sin(angle) * speed * .78) } } d.dummy.position.set(x, y, z); d.dummy.scale.set(scale, scale * (1.15 + (i % 3) * .38), scale); d.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), velocity.normalize()); d.dummy.rotation.y += s.spin; d.dummy.updateMatrix(); d.sparkMesh.setMatrixAt(i, d.dummy.matrix) } if (d.sparkMesh.visible) d.sparkMesh.instanceMatrix.needsUpdate = true;
        for (let i = 0; i < d.nearSparks.length; i++) { const trail = d.nearSparks[i], s = d.sparkData[i * 3], elapsed = local - s.delay * .55; trail.visible = fountain && elapsed >= 0; if (trail.visible) { const cycle = Math.floor(elapsed / s.life), age = elapsed - cycle * s.life, q = age / s.life, angle = s.angle + cycle * .41, speed = s.speed * .86, vy = s.vy * .92, y = 1.56 + vy * age - 2.35 * age * age, velocity = new THREE.Vector3(Math.cos(angle) * speed, vy - 4.7 * age, Math.sin(angle) * speed * .72); trail.position.set(Math.cos(angle) * (.05 + speed * age), y, Math.sin(angle) * (.04 + speed * age * .72)); trail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), velocity.normalize()); trail.scale.setScalar((1 - q) * (.72 + (i % 4) * .13) * fountainLevel); trail.material.opacity = .55 + .43 * (1 - q) } }
        const ironVisible = t >= 3.02 || state.complete, ironQ = state.complete ? 1 : smooth((t - 3.02) / .92), ironPulse = running && fountain ? 1 + .025 * Math.sin(time * .018) : 1; d.ironBlob.visible = ironVisible; d.ironBlob.scale.set((.12 + .8 * ironQ) * ironPulse, (.05 + .29 * ironQ) * (1 + .014 * Math.sin(time * .022)), (.1 + .69 * ironQ) / ironPulse); let ironGlow = 0; if (ironVisible && !state.complete) { const coolQ = smooth((t - 5.9) / 2.1); ironGlow = fountain ? .82 + .13 * Math.sin(time * .021) : .22 + .6 * (1 - coolQ); d.ironBlob.material.color.setHex(0xff6f19).lerp(new THREE.Color(0xa43f24), coolQ); d.ironBlob.material.emissive.setHex(0xff2600).lerp(new THREE.Color(0x6f170b), coolQ); d.ironBlob.material.roughness = .2 + .16 * coolQ; d.afterglowStart = 0 } else if (state.complete) { if (!d.afterglowStart) d.afterglowStart = time; const afterQ = clamp((time - d.afterglowStart) / 4600), fade = 1 - smooth(afterQ); ironGlow = .24 * fade; d.ironBlob.material.color.setHex(0xa13e24).lerp(new THREE.Color(0x3c3430), afterQ); d.ironBlob.material.emissive.setHex(0x8d210e).lerp(new THREE.Color(0x160604), afterQ); d.ironBlob.material.roughness = .36 + .22 * afterQ; this.thermiteAfterglowUntil = d.afterglowStart + 4650 } d.ironBlob.material.emissiveIntensity = .055 + ironGlow * 3.15; d.ironGlowLight.intensity = ironGlow * 7.4; this.thermiteGlowFraction = ironGlow;
        for (const puff of d.smoke) { const age = t - 4.45 - puff.delay, active = running && !state.complete && age >= 0 && age < 2.6; puff.mesh.visible = active; if (active) { const q = clamp(age / 2.6), fade = (1 - q) * (1 - q), r = .14 + puff.drift * age; puff.mesh.position.set(Math.cos(puff.angle) * r, 1.72 + puff.speed * age, Math.sin(puff.angle) * r - .08); puff.mesh.scale.setScalar(.45 + q * 1.9); puff.mesh.material.opacity = fade * (.18 + .16 * (1 - fountainLevel)) } else { puff.mesh.material.opacity = 0 } }
        for (const mote of d.sandDust) { const age = t - 2.64 - mote.delay, active = running && age >= 0 && age < 1.35; mote.mesh.visible = active; if (active) { const q = age / 1.35, r = .18 + mote.speed * age * 2.2; mote.mesh.position.set(Math.cos(mote.angle) * r, 1.14 + Math.sin(Math.PI * q) * (.28 + (mote.delay % 3) * .08), Math.sin(mote.angle) * r); mote.mesh.material.opacity = (1 - q) * .62; mote.mesh.rotation.set(time * .004 + mote.angle, time * .003, 0) } }
        d.shieldGlow.material.opacity = flashActive ? .18 + flashEnvelope * .42 : fountain ? .06 + .12 * fountainLevel : 0;
        if (running && t > 2.58 && t < 4.2) { const amp = .055 * (1 - smooth((t - 2.58) / 1.62)); this.camera.position.x += Math.sin(time * .071) * amp; this.camera.position.y += Math.sin(time * .093 + 1) * amp * .42; this.camera.position.z += Math.sin(time * .057 + 2) * amp * .34; this.camera.lookAt(0, 1.05, 0) }
      }
      else if (d.kind === 'magnesiumBurn') { const pulse = 1 + Math.sin(time * .024 + d.seed) * .16 + Math.sin(time * .057 + d.seed) * .06; d.core.scale.set(pulse, .48 * pulse, pulse); d.corona.scale.set(1.05 * pulse, .62 * pulse, 1.05 * pulse); d.light.intensity = 10 + Math.sin(time * .031 + d.seed) * 2.2; for (const spark of d.sparks) { const q = (time * .001 * spark.userData.speed + spark.userData.phase) % 1, r = .06 + q * .28; spark.position.set(Math.cos(spark.userData.angle) * r, .37 + q * .72, Math.sin(spark.userData.angle) * r); spark.material.opacity = .95 * (1 - q); spark.scale.setScalar(.65 + (1 - q) * .8) } }
    }
    for (const d of this.dynamic) {
      if (d.kind !== 'alkaliMetals') continue;
      const stage = state.alkaliStage || 0;
      const timer = Math.max(0, state.alkaliTimer || 0);
      const metalIndex = Math.max(0, Math.min(2, state.alkaliMetal || 0));
      const reaction = Math.max(0, Math.min(1, state.alkaliReactionProgress || 0));
      const clamp = value => Math.max(0, Math.min(1, value));
      const smooth = value => { value = clamp(value); return value * value * (3 - 2 * value) };
      const profiles = [
        { sample: 0xe4e7e5, flame: 0xffdb85, speed: .62, wobble: .07 },
        { sample: 0xe1e5e5, flame: 0xffb52f, speed: 1.42, wobble: .14 },
        { sample: 0xdddfe7, flame: 0xc48dff, speed: 1.75, wobble: .19 }
      ];
      const profile = profiles[metalIndex];
      d.vialCaps.forEach((cap, index) => {
        cap.emissive.setHex(index === metalIndex ? profiles[index].flame : 0x000000);
        cap.emissiveIntensity = index === metalIndex ? .34 + .14 * Math.sin(time * .008) : 0;
        const ring = d.vialRings[index];
        ring.material.color.setHex(profiles[index].flame);
        ring.material.opacity = index === metalIndex ? .68 + .18 * Math.sin(time * .007 + index) : 0;
        ring.scale.setScalar(index === metalIndex ? 1 + .07 * Math.sin(time * .009) : 1);
      });

      const reactivePoint = new THREE.Vector3(-.72, d.waterY + .06, .28);
      let held = false;
      const clearQ = stage === 5 ? smooth(timer / 1.35) : 0;
      if (stage === 0) {
        d.forceps.position.copy(d.forcepsRest);
        d.forceps.rotation.set(.04, -.15, .14);
        held = true;
      } else if (stage === 1) {
        const approach = smooth(timer / .84);
        const lower = smooth((timer - .84) / 1.01);
        d.forceps.position.lerpVectors(d.forcepsRest, d.forcepsAbove, approach);
        if (timer > .84) d.forceps.position.lerpVectors(d.forcepsAbove, d.forcepsDrop, lower);
        d.forceps.position.y += Math.sin(Math.PI * Math.min(1, approach)) * .14;
        d.forceps.rotation.set(.04, THREE.MathUtils.lerp(-.15, .06, approach), THREE.MathUtils.lerp(.14, -.44, Math.max(approach, lower)));
        held = true;
      } else if (stage === 5) {
        d.forceps.position.lerpVectors(d.forcepsDrop, d.forcepsRest, clearQ);
        d.forceps.position.y += Math.sin(Math.PI * clearQ) * .1;
        d.forceps.rotation.set(.04, THREE.MathUtils.lerp(.06, -.15, clearQ), THREE.MathUtils.lerp(-.44, .14, clearQ));
      } else {
        d.forceps.position.copy(d.forcepsRest);
        d.forceps.rotation.set(.04, -.15, .14);
      }
      d.forceps.updateMatrixWorld(true);
      if (held) {
        reactivePoint.copy(d.forceps.localToWorld(new THREE.Vector3(-1.34, -.025, 0)));
      } else if (stage === 2) {
        reactivePoint.x = -.78 + profile.speed * reaction;
        reactivePoint.z = .18 + Math.sin(reaction * Math.PI * (4.4 + metalIndex * 2.3)) * profile.wobble;
        reactivePoint.y = d.waterY + .065 + Math.sin(time * .012) * .008;
      } else if (stage === 3 || stage === 4) {
        reactivePoint.x = -.78 + profile.speed;
        reactivePoint.z = .18 + Math.sin(4.4 + metalIndex * 2.3) * profile.wobble;
      }

      d.sampleMat.color.setHex(profile.sample);
      d.sampleMat.emissive.setHex(metalIndex === 0 ? 0x000000 : profile.flame);
      d.sampleMat.emissiveIntensity = stage === 2 ? .12 + reaction * .32 : 0;
      const sampleVisible = held || stage === 2 && reaction < .95;
      d.sample.visible = sampleVisible;
      d.sample.position.copy(reactivePoint);
      if (sampleVisible) {
        const shrink = held ? 1 : 1 - reaction * .58;
        const molten = metalIndex === 1 ? .64 + .32 * reaction : 1;
        d.sample.scale.set(shrink * (metalIndex === 1 ? 1.28 : 1), shrink * molten, shrink * (metalIndex === 1 ? 1.1 : 1));
        d.sample.rotation.set(time * .0014 * (1 + metalIndex), time * .0011, time * .0009 * (metalIndex + 1));
      }

      const purple = stage === 2 ? smooth(reaction) : stage === 3 || stage === 4 ? 1 : stage === 5 ? 1 - clearQ : 0;
      d.waterMat.color.copy(d.startWater).lerp(d.endWater, purple * .78);
      d.surfaceMat.color.copy(new THREE.Color(0xa5ebef)).lerp(new THREE.Color(0xb27bc6), purple);
      d.waterMat.opacity = .66 + purple * .1;
      d.surfaceMat.opacity = .58 + purple * .13;
      const settledIndicator = stage === 3 || stage === 4;
      for (const entry of d.indicatorEntries) {
        const level = Math.max(0, purple - entry.phase * .18);
        const visible = level > .008;
        entry.mesh.visible = visible;
        if (visible) {
          const spread = .3 + smooth(level / .62) * (settledIndicator ? .78 + entry.radius * .62 : 1.25 + entry.radius);
          const angle = entry.angle + reaction * .7;
          entry.mesh.position.set(reactivePoint.x + Math.cos(angle) * spread, d.waterY + .02 + Math.sin(time * .01 + entry.phase * 8) * .004, reactivePoint.z + Math.sin(angle) * spread * .62);
          entry.mesh.scale.setScalar(.32 + smooth(level / .7) * (settledIndicator ? .78 + entry.phase % .2 : 1.45 + entry.phase % .3));
          entry.mesh.material.opacity = Math.min(settledIndicator ? .16 : .32, level * (settledIndicator ? .11 : .25));
        }
      }

      const activeReaction = stage === 2 && reaction > .015 && reaction < .99;
      for (const entry of d.bubbleEntries) {
        const cycle = (time * .001 * (1.18 + metalIndex * .44) + entry.phase) % 1;
        const visible = activeReaction && cycle < .92;
        entry.mesh.visible = visible;
        if (visible) {
          const radius = .035 + cycle * (.16 + metalIndex * .035);
          const drift = Math.sin(cycle * 13 + entry.angle) * .028;
          entry.mesh.position.set(reactivePoint.x + Math.cos(entry.angle) * radius + drift, d.waterY + .03 + cycle * (.42 + metalIndex * .14), reactivePoint.z + Math.sin(entry.angle) * radius * .68);
          entry.mesh.scale.setScalar(entry.scale * (.66 + cycle * .7));
          entry.mesh.material.opacity = Math.sin(Math.PI * Math.min(.999, cycle / .92)) * (.46 + metalIndex * .1);
        }
      }
      for (const entry of d.rippleEntries) {
        const cycle = (time * .001 * (1.05 + metalIndex * .32) + entry.phase) % 1;
        entry.mesh.visible = activeReaction;
        if (activeReaction) {
          entry.mesh.position.set(reactivePoint.x, d.waterY + .015, reactivePoint.z);
          entry.mesh.scale.setScalar(.38 + cycle * (2.1 + metalIndex * .45));
          entry.mesh.material.opacity = (1 - cycle) * (.38 + metalIndex * .06);
        }
      }

      const burning = activeReaction && metalIndex > 0 && reaction > .18 && reaction < .9;
      const flameLevel = burning ? Math.sin(Math.PI * clamp((reaction - .18) / .72)) : 0;
      d.flameOuter.visible = d.flameCore.visible = d.flameHalo.visible = burning;
      d.flameOuter.position.set(reactivePoint.x, d.waterY + .52, reactivePoint.z);
      d.flameCore.position.set(reactivePoint.x, d.waterY + .46, reactivePoint.z);
      d.flameHalo.position.set(reactivePoint.x, d.waterY + .49, reactivePoint.z);
      d.flameOuterMat.color.setHex(profile.flame);
      d.flameCoreMat.color.setHex(metalIndex === 1 ? 0xffffb4 : 0xf5d7ff);
      d.flameOuterMat.opacity = .26 * flameLevel;
      d.flameCoreMat.opacity = .48 * flameLevel;
      d.flameHalo.material.color.setHex(profile.flame);
      d.flameHalo.material.opacity = .1 * flameLevel;
      const flicker = 1 + Math.sin(time * .031 + metalIndex) * .1 + Math.sin(time * .057) * .05;
      d.flameOuter.scale.set(flicker * flameLevel, (1.05 + .12 * Math.sin(time * .041)) * flameLevel, flicker * flameLevel);
      d.flameCore.scale.set((.72 / flicker) * flameLevel, (1 + .08 * Math.sin(time * .052)) * flameLevel, (.72 / flicker) * flameLevel);
      d.flameHalo.scale.setScalar((.62 + .24 * Math.sin(time * .025)) * flameLevel);
      d.reactionLight.position.set(reactivePoint.x, d.waterY + .82, reactivePoint.z);
      d.reactionLight.color.setHex(profile.flame);
      d.reactionLight.intensity = burning ? 4.3 * flameLevel : 0;
      d.sampleHalo.position.copy(reactivePoint);
      d.sampleHaloMat.color.setHex(profile.flame);
      d.sampleHaloMat.opacity = activeReaction ? (.05 + .12 * Math.sin(reaction * Math.PI)) * (1 + metalIndex * .35) : 0;
      d.sampleHalo.scale.setScalar(.75 + reaction * (1.1 + metalIndex * .2));
      d.reflection.material.opacity = .075 + (activeReaction ? .035 * Math.sin(time * .006) : 0);
    }
    this.renderer.render(this.scene, this.camera);
    if (this.pendingCanvasReveal && !this.sceneCompiling) { this.pendingCanvasReveal = false; this.canvas.style.visibility = 'visible' }
    if (this.sceneWarmupFrames > 0) this.sceneWarmupFrames--;
    if (practicalChanged && litBunsens) this.lastRenderTime = performance.now()
  }
  get isTransitioning() {
    const now = performance.now();
    return Math.abs(this.coolantVisualLevel - this.coolantTransitionTarget) > .01 ||
      now < this.thermiteAfterglowUntil ||
      this.bunsenTransitionActive && this.bunsenLoadElapsed < this.bunsenLoadDuration ||
      this.sceneWarmupFrames > 0
  }
  get info() { return { enabled: this.available, renderer: this.available ? 'WebGL / Three.js' : 'unavailable', objects: this.root?.children.length || 0, context_lost: this.contextLost, scene_compiling: this.sceneCompiling, scene_warmup_frames: this.sceneWarmupFrames, canvas_visible: this.canvas?.style.visibility !== 'hidden' } }
}
