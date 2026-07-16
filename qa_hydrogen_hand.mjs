import {chromium} from 'playwright';
import fs from 'node:fs';

const out='/private/tmp/chem-hydrogen-hand';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
page.on('pageerror',error=>errors.push(`page: ${error.message}`));
await page.goto(`http://localhost:4173/?qa=${Date.now()}`,{waitUntil:'networkidle'});
await page.waitForTimeout(300);
await page.evaluate(()=>{window.__manualSimulationTime=true});

const state=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
await page.mouse.click(135,385);
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/01-sealed-grip.png`,fullPage:true});
const sealed=await state();
console.log('captured sealed grip');

await page.mouse.click(382,657);
await page.evaluate(()=>window.advanceTime(900));
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/02-thumb-withdrawn.png`,fullPage:true});
const withdrawn=await state();
console.log('captured withdrawn thumb');

await page.evaluate(()=>window.advanceTime(1800));
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/03-collecting-grip.png`,fullPage:true});
const collecting=await state();
console.log('captured collecting grip');

await page.evaluate(()=>window.advanceTime(3100));
await page.mouse.click(382,657);
await page.evaluate(()=>window.advanceTime(240));
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/04-splint-thumb-withdrawn.png`,fullPage:true});
const ignition=await state();
console.log('captured lit-splint thumb withdrawal');

const result={sealed:sealed.hydrogen_practical,withdrawn:withdrawn.hydrogen_practical,collecting:collecting.hydrogen_practical,ignition:ignition.hydrogen_practical,renderer:collecting.renderer,errors};
fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));
if(!sealed.hydrogen_practical?.thumb_sealing)throw new Error('Initial thumb seal is missing');
if(withdrawn.hydrogen_practical?.thumb_sealing)throw new Error('Thumb did not withdraw during pouring');
if(!collecting.hydrogen_practical?.thumb_sealing)throw new Error('Thumb did not reseal for gas collection');
if(ignition.hydrogen_practical?.stage!==4||ignition.hydrogen_practical?.thumb_sealing)throw new Error('Thumb did not withdraw for the lit splint');
if(errors.length)throw new Error(errors.join('\n'));
await browser.close();
console.log(JSON.stringify(result,null,2));
