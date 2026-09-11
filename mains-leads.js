import * as THREE from './vendor/three.module.js?v=20260823-1';

function mouldedShape(points, depth, bevel) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelSegments: 3, bevelSize: bevel, bevelThickness: bevel, curveSegments: 6, steps: 1 });
  geometry.translate(0, 0, bevel);
  return geometry;
}

// All positions are in the parent's coordinates. The socket anchor is the
// centre of its pin pattern on the front face; appliance is its rear inlet.
export function createMainsLead(parent, { id, socket, appliance, via = [], floorY = .13, color = 0x262a2d, direction = [0, 0, -1] }) {
  const group = new THREE.Group(); group.name = `mains-lead-${id}`;
  const rubber = new THREE.MeshStandardMaterial({ color, roughness: .62, metalness: .02 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xe9e7de, roughness: .37, metalness: .02 });
  const seam = new THREE.MeshStandardMaterial({ color: 0xb9bcb6, roughness: .66 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171c1e, roughness: .5 });
  const add = (geometry, material, target, position) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.fromArray(position);
    mesh.castShadow = true; mesh.receiveShadow = true; target.add(mesh); return mesh;
  };
  const plug = new THREE.Group(); plug.name = 'inserted-uk-mains-plug'; plug.position.fromArray(socket); group.add(plug);
  const outline = [[-.098, -.105], [.098, -.105], [.11, -.015], [.07, .108], [-.07, .108], [-.11, -.015]];
  add(mouldedShape(outline, .025, .008), seam, plug, [0, 0, .001]);
  add(mouldedShape(outline, .125, .014), ivory, plug, [0, 0, .022]);
  // Recessed fuse-cover seam, moulded grip ridges and a small screw head on
  // the rear cover read clearly in close views, without showing live pins.
  add(new THREE.BoxGeometry(.092, .023, .002), seam, plug, [0, .027, .16]);
  add(new THREE.BoxGeometry(.078, .014, .002), ivory, plug, [0, .027, .162]);
  const screw = add(new THREE.CylinderGeometry(.011, .011, .004, 16), seam, plug, [0, -.031, .16]); screw.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(.013, .002, .002), dark, plug, [0, -.031, .163]);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const grip = add(new THREE.BoxGeometry(.008, .035, .064), seam, plug, [side * (.101 - i * .002), -.025 + i * .024, .087]);
    grip.rotation.z = -side * .16;
  }
  const plugExit = new THREE.Vector3(socket[0], socket[1] - .20, socket[2] + .107);
  add(new THREE.CylinderGeometry(.037, .026, .12, 20), rubber, plug, [0, -.151, .107]);
  for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(.038 - i * .0024, .038 - i * .0024, .009, 20), dark, plug, [0, -.111 - i * .021, .107]);

  const inlet = new THREE.Vector3(...appliance), outward = new THREE.Vector3(...direction).normalize();
  const connector = new THREE.Group(); connector.name = 'appliance-mains-inlet'; connector.position.copy(inlet);
  connector.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward); group.add(connector);
  add(new THREE.BoxGeometry(.13, .092, .032), dark, connector, [0, 0, .004]);
  add(new THREE.BoxGeometry(.09, .069, .095), rubber, connector, [0, 0, .045]);
  const neck = add(new THREE.CylinderGeometry(.029, .035, .085, 20), rubber, connector, [0, 0, .13]); neck.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const rib = add(new THREE.TorusGeometry(.031 - i * .0015, .004, 6, 18), dark, connector, [0, 0, .105 + i * .018]);
    rib.name = 'inlet-strain-relief-rib';
  }
  const end = inlet.clone().addScaledVector(outward, .165);
  const rearZ = socket[2] + .23, sx = socket[0], bendSide = Math.sign((via[0]?.[0] ?? inlet.x) - sx) || 1;
  const route = [plugExit, new THREE.Vector3(sx, socket[1] - .42, rearZ), new THREE.Vector3(sx + bendSide * .025, floorY + .2, rearZ + .055), new THREE.Vector3(sx + bendSide * .13, floorY, rearZ + .23)];
  if (via.length) route.push(...via.map(p => new THREE.Vector3(...p)));
  else {
    const side = inlet.x >= sx ? 1 : -1;
    route.push(new THREE.Vector3(sx + side * .4, floorY, rearZ + .34), new THREE.Vector3(end.x + side * .16, floorY, Math.min(end.z - .35, rearZ + .7)));
  }
  route.push(end.clone().addScaledVector(outward, .24), end);
  // A centripetal spline supplies relaxed bends; clamp the interpolated
  // centreline to the worktop so slack never dips through the surface.
  const spline = new THREE.CatmullRomCurve3(route, false, 'centripetal');
  const curve = new THREE.Curve();
  curve.getPoint = (t, target = new THREE.Vector3()) => {
    spline.getPoint(t, target); target.y = Math.max(floorY, target.y); target.z = Math.max(socket[2] + .055, target.z); return target;
  };
  const cable = add(new THREE.TubeGeometry(curve, 112, .023, 10, false), rubber, group, [0, 0, 0]); cable.name = 'continuous-mains-cable';
  Object.assign(group.userData, { mainsLead: true, id, socket: [...socket], appliance: [...appliance], direction: [...direction], floorY, routePoints: curve.getPoints(80).map(p => p.toArray()), plug: 'fully inserted moulded UK plug', cable: 'continuous insulated lead with ribbed strain relief at both ends' });
  parent.add(group); return group;
}
