import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='output/playwright/mains', errors=[], report={gcse:[],aaq:[],checks:[],errors};
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const shot=async name=>page.screenshot({path:`${out}/${name}.png`});
const inspect=()=>page.evaluate(()=>{
 const r=window.__powerRenderer, mains=[];
 r.root.traverse(o=>{if(o.userData.mainsLead)mains.push({...o.userData,visible:o.visible,connectorPosition:o.getObjectByName('appliance-mains-inlet').position.toArray()})});
 return mains;
});
const check=(mains,count,id)=>{
 assert.equal(mains.length,count,`${id}: all powered apparatus connected`);
 assert.equal(new Set(mains.map(m=>m.socket.join(','))).size,count,`${id}: each plug has its own socket`);
 for(const m of mains){
  assert.deepEqual(m.connectorPosition,m.appliance,`${id}: connector attached to inlet`);
  assert.ok(m.routePoints.every(p=>p.every(Number.isFinite)&&p[1]>=m.floorY-.0001&&p[2]>=m.socket[2]+.0549),`${id}: cable stays above bench and in front of wall`);
  const end=m.routePoints.at(-1);assert.ok(Math.abs(Math.hypot(...end.map((v,i)=>v-m.appliance[i]))-.165)<.002,`${id}: cable meets inlet strain relief`);
 }
};
const settle=async()=>{for(let i=0;i<8;i++){await page.waitForTimeout(110);await page.evaluate(()=>window.__lab.draw())}await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).renderer.canvas_visible)};
try{
 await page.goto('http://127.0.0.1:4173/?mains-regression=3',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__labPerformance?.rendererLoaded());
 await page.evaluate(async()=>{
  window.__manualSimulationTime=true;
  const {LabRenderer3D}=await import('./lab3d.js?v=20260908-3');const render=LabRenderer3D.prototype.render;
  LabRenderer3D.prototype.render=function(...args){window.__powerRenderer=this;return render.apply(this,args)};
  window.__lab.draw();
 });
 const cases={rates:1,mass:1,water:1,starchleaf:2,lipase:1,electro:2,antibiotics:1,transformation:3,respiration:5,osmosis:1,density:1,potometer:1,pondweed:1,ripple:2,electromagnet:1,wirelength:1,ivdevices:1,nuclear:1,specificheat:1,thermal:0,quadrats:0};
 const captures=new Set(['rates','electro','antibiotics','transformation','respiration','pondweed','ripple','wirelength','specificheat','quadrats']);
 for(const [id,count] of Object.entries(cases)){
  console.log(`GCSE ${id}`);
  await page.evaluate(id=>{const {state,practicals,draw}=window.__lab;state.selected=practicals.findIndex(p=>p.id===id);state.subject=practicals[state.selected].subject;state.running=false;state.complete=false;state.progress=0;state.tab='equipment';draw()},id);
  await settle();const mains=await inspect();check(mains,count,id);report.gcse.push({id,mains});if(captures.has(id))await shot(`gcse-${id}`);
  if(id==='pondweed'){
   const before=mains[0].appliance;
   await page.evaluate(()=>{window.__lab.state.pondweedDistance=50;window.__lab.draw()});await settle();const after=await inspect();check(after,1,id);assert.notEqual(after[0].appliance[0],before[0]);assert.deepEqual(after[0].socket,mains[0].socket);await shot('gcse-pondweed-50cm');report.checks.push('Lamp mains lead follows changed lamp distance');
  }
  if(id==='transformation'){
   assert.equal(mains.find(m=>m.id.includes('viewer')).visible,false);
   await page.evaluate(()=>{window.__lab.state.transformationStage=12;window.__lab.draw()});await settle();const shown=await inspect();assert.equal(shown.find(m=>m.id.includes('viewer')).visible,true);await shot('gcse-transformation-viewer');report.checks.push('Viewer plug and cable follow viewer visibility');
  }
 }
 await page.evaluate(()=>{const r=window.__powerRenderer;r.configureEnvironment('capture');if(r.room.sockets.visible)throw Error('Capture sockets visible');r.configureEnvironment('shoretransect');if(r.room.sockets.visible)throw Error('Shore sockets visible')});
 await page.locator('#course-select').selectOption('aaq');await page.waitForFunction(()=>window.__aaq?.getState().renderer==='Three.js');
 await page.evaluate(async()=>{const {AAQScene}=await import('./aaq-scene.js?v=20260908-3');const render=AAQScene.prototype.render;AAQScene.prototype.render=function(...args){window.__powerRenderer=this;return render.apply(this,args)};window.__aaq.select('aaq-microscopy');window.advanceTime(16)});
 const cards=await page.locator('.aaq-practical').evaluateAll(nodes=>nodes.map(n=>n.dataset.practical));
 const powered=new Set(['aaq-microscopy','aaq-electrophoresis','aaq-colorimetry','aaq-centrifugation','aaq-lipase','aaq-food-tests','aaq-spirometry','aaq-cardiovascular']);
 for(const id of cards){
  console.log(`AAQ ${id}`);await page.evaluate(id=>{window.__aaq.select(id);window.advanceTime(16)},id);await page.waitForTimeout(80);const mains=await inspect();
  // The scene catalogue is authoritative about which instruments use mains.
  const mapped=await page.evaluate(()=>{const a=[];window.__powerRenderer.root.traverse(o=>{if(o.userData.powerSource==='mains')a.push(o.userData.mainsId)});return a});
  check(mains,mapped.length,id);report.aaq.push({id,mains});if(mains.length)await shot(id);
 }
 assert.equal(report.aaq.reduce((n,p)=>n+p.mains.length,0),8);
 await page.evaluate(()=>window.__aaq.select('aaq-microscopy'));
 for(let i=0;i<4;i++){await page.locator('#aaq-primary').click();await page.evaluate(()=>window.advanceTime(4000))}
 assert.equal(await page.evaluate(()=>window.__aaq.getState().completed),true);
 report.checks.push('Microscopy four-step practical completes with mains lead');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({gcse:report.gcse.length,aaq:report.aaq.length,checks:report.checks,errors}));
}finally{fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close()}
