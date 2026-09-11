import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='output/playwright/mains',errors=[],report={rooms:[],checks:[],errors};
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
 await page.goto('http://127.0.0.1:4173/?socket-count-final=4',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__labPerformance?.rendererLoaded());
 await page.evaluate(async()=>{window.__manualSimulationTime=true;const {LabRenderer3D}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/lab3d.js?')).name);const render=LabRenderer3D.prototype.render;LabRenderer3D.prototype.render=function(...a){window.__socketRenderer=this;return render.apply(this,a)};window.__lab.draw()});
 const cases={free:0,rates:1,mass:1,water:1,starchleaf:2,lipase:1,electro:2,antibiotics:1,transformation:3,respiration:5,osmosis:1,density:1,potometer:1,pondweed:1,ripple:2,electromagnet:1,wirelength:1,ivdevices:1,nuclear:1,specificheat:1,thermal:0,hooke:0};
 for(const [id,count] of Object.entries(cases)){
  const room=await page.evaluate(id=>{const r=window.__socketRenderer,{state,practicals}=window.__lab,p=practicals.find(p=>p.id===id);r.rebuild(state,p);const sockets=r.room.sockets.children.filter(s=>s.visible).map(s=>({x:s.position.x,contacts:s.userData.mainsContacts}));return {id,sockets,leads:r.mainsConnections.map(({lead})=>lead.userData)}},id);
  assert.equal(room.sockets.length,Math.max(2,count),`${id}: exactly the required number of sockets`);assert.equal(room.leads.length,count);assert.equal(new Set(room.leads.map(l=>l.socket.join(','))).size,count);
  for(const l of room.leads){assert.ok(room.sockets.some(s=>s.contacts.some(c=>JSON.stringify(c)===JSON.stringify(l.socket))));assert.ok(l.routePoints.every(p=>p.every(Number.isFinite)&&p[1]>=.13-.0001));assert.ok(Math.abs(Math.hypot(...l.routePoints.at(-1).map((v,i)=>v-l.appliance[i]))-.165)<.001)}
  if(id==='antibiotics')assert.ok(room.leads[0].socket[0]>4);
  if(id==='free')assert.deepEqual(room.sockets.map(s=>s.x),[-4.35,1.45]);report.rooms.push(room);
 }
 for(const id of ['quadrats','capture','shoretransect']){const hidden=await page.evaluate(id=>{const r=window.__socketRenderer;r.configureEnvironment(id);r.connectMainsAppliances(id);return !r.room.sockets.visible&&r.mainsConnections.length===0},id);assert.ok(hidden)}
 console.log('Socket count and attachment checks pass for22 indoor rooms and3 outdoors');
 const select=async id=>{await page.evaluate(id=>{const r=window.__socketRenderer,{state,practicals,draw}=window.__lab;state.selected=practicals.findIndex(p=>p.id===id);state.subject=practicals[state.selected].subject;state.tab='instructions';state.running=false;state.progress=0;r.signature='';draw()},id);for(let i=0;i<8;i++){await page.waitForTimeout(100);await page.evaluate(()=>window.__lab.draw())}await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).renderer.canvas_visible)};
 for(const id of ['free','starchleaf','antibiotics','respiration','transformation','wirelength']){console.log(`Final screenshot ${id}`);await select(id);if(id==='transformation'){await page.evaluate(()=>{window.__lab.state.transformationStage=12;window.__lab.draw()});await page.waitForTimeout(100)}await page.screenshot({path:`${out}/final-${id}.png`})}
 await select('pondweed');const before=await page.evaluate(()=>window.__socketRenderer.mainsConnections[0].lead.userData);await page.evaluate(()=>{window.__lab.state.pondweedDistance=50;window.__lab.draw()});for(let i=0;i<6;i++){await page.waitForTimeout(100);await page.evaluate(()=>window.__lab.draw())}const after=await page.evaluate(()=>window.__socketRenderer.mainsConnections[0].lead.userData);assert.notEqual(after.appliance[0],before.appliance[0]);assert.deepEqual(after.socket,before.socket);report.checks.push('Two-socket lamp keeps its plug fixed while lead follows50cm setting');
 await select('wirelength');await page.evaluate(()=>{const r=window.__socketRenderer;r.camera.position.set(-4.45,1.55,.25);r.camera.lookAt(-4.30,1.1,-2.84);r.camera.fov=22;r.camera.updateProjectionMatrix();r.renderer.render(r.scene,r.camera)});await page.screenshot({path:`${out}/final-plug-close-up.png`});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({rooms:report.rooms.length,checks:report.checks,errors}));
}finally{fs.writeFileSync(`${out}/final-socket-report.json`,JSON.stringify(report,null,2));await browser.close()}
