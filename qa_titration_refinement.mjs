import {chromium} from 'playwright';
import fs from 'node:fs';

const out='/private/tmp/chem-titration-refinement';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
page.on('pageerror',error=>errors.push(`page: ${error.message}`));
await page.goto(`http://localhost:4173/?titration-refinement=${Date.now()}`,{waitUntil:'networkidle'});
await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
await page.evaluate(()=>{window.__manualSimulationTime=true});
const read=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));

await page.mouse.click(135,282);
await page.waitForTimeout(160);
await page.screenshot({path:`${out}/01-aligned-rig.png`,fullPage:true});
const initial=await read();

await page.mouse.click(375,837);
await page.evaluate(()=>window.advanceTime(1050));
await page.waitForTimeout(70);
await page.screenshot({path:`${out}/02-indicator-lift-and-tilt.png`,fullPage:true});
const lifting=await read();

await page.evaluate(()=>window.advanceTime(520));
await page.waitForTimeout(70);
await page.screenshot({path:`${out}/03-first-indicator-drop.png`,fullPage:true});
const firstDrop=await read();

await page.evaluate(()=>window.advanceTime(450));
await page.waitForTimeout(70);
await page.screenshot({path:`${out}/04-second-indicator-drop.png`,fullPage:true});
const secondDrop=await read();

await page.evaluate(()=>window.advanceTime(1200));
await page.waitForTimeout(70);
await page.screenshot({path:`${out}/05-indicator-complete.png`,fullPage:true});
const indicatorComplete=await read();

await page.mouse.click(375,837);
await page.evaluate(()=>window.advanceTime(2500));
await page.waitForTimeout(70);
await page.screenshot({path:`${out}/06-tap-open-vertical.png`,fullPage:true});
const flowing=await read();
await page.evaluate(()=>window.advanceTime(2800));
await page.waitForTimeout(70);
await page.screenshot({path:`${out}/07-tap-reclosed-horizontal.png`,fullPage:true});
const near=await read();
for(let i=0;i<5;i++){
  await page.mouse.click(375,837);
  await page.evaluate(()=>window.advanceTime(470));
}
await page.waitForTimeout(70);
await page.screenshot({path:`${out}/06-pale-pink-endpoint.png`,fullPage:true});
const endpoint=await read();
await page.mouse.click(375,837);
const recorded=await read();

const result={initial:initial.titration,lifting:lifting.titration,firstDrop:firstDrop.titration,secondDrop:secondDrop.titration,indicatorComplete:indicatorComplete.titration,flowing:flowing.titration,near:near.titration,endpoint:endpoint.titration,recorded:recorded.titration,renderer:initial.renderer,errors};
fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));
if(initial.renderer?.enabled!==true||initial.titration?.stage!==0||initial.titration?.indicator_added)throw new Error('Initial titration rig failed');
if(lifting.titration?.phase!=='adding phenolphthalein'||lifting.titration?.indicator_addition?.progress<.3)throw new Error('Indicator lift phase failed');
if(firstDrop.titration?.phase!=='adding phenolphthalein'||secondDrop.titration?.phase!=='adding phenolphthalein')throw new Error('Indicator drop phases failed');
if(indicatorComplete.titration?.stage!==1||!indicatorComplete.titration?.indicator_added||indicatorComplete.running)throw new Error('Indicator addition did not complete');
if(!flowing.titration?.tap_open||flowing.titration?.burette_final_reading_cm3<11||flowing.titration?.burette_final_reading_cm3>13)throw new Error('Burette flow regression');
if(near.titration?.stage!==3||near.titration?.burette_final_reading_cm3!==24.8)throw new Error('Near-endpoint regression');
if(!endpoint.complete||endpoint.titration?.titre_cm3!==25.05||endpoint.titration?.flask_colour!=='permanent very pale pink')throw new Error('Endpoint regression');
if(!recorded.titration?.titre_recorded||recorded.tab!=='graph')throw new Error('Titre recording regression');
if(errors.length)throw new Error(errors.join('\n'));
await browser.close();
console.log(JSON.stringify(result,null,2));
