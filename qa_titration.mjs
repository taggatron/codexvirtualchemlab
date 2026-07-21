import {chromium} from 'playwright';
import fs from 'node:fs';

const out='/private/tmp/chem-titration';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
page.on('pageerror',error=>errors.push(`page: ${error.message}`));
await page.goto(`http://localhost:4173/?titration-qa=${Date.now()}`,{waitUntil:'networkidle'});
await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
await page.waitForTimeout(350);
await page.evaluate(()=>{window.__manualSimulationTime=true});
const state=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));

await page.mouse.click(135,282);
await page.waitForTimeout(180);
await page.screenshot({path:`${out}/01-complete-apparatus.png`,fullPage:true});
const ready=await state();

await page.mouse.click(375,837);
await page.waitForTimeout(140);
await page.screenshot({path:`${out}/02-indicator-added.png`,fullPage:true});
const indicator=await state();

await page.mouse.click(375,837);
await page.evaluate(()=>window.advanceTime(2500));
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/03-tap-open-mid-titration.png`,fullPage:true});
const flowing=await state();

await page.evaluate(()=>window.advanceTime(2800));
await page.waitForTimeout(120);
await page.screenshot({path:`${out}/04-near-endpoint.png`,fullPage:true});
const near=await state();

const dropStates=[];
for(let i=0;i<5;i++){
  await page.mouse.click(375,837);
  await page.evaluate(()=>window.advanceTime(470));
  await page.waitForTimeout(70);
  dropStates.push(await state());
}
await page.screenshot({path:`${out}/05-pale-pink-endpoint.png`,fullPage:true});
const endpoint=dropStates.at(-1);

await page.mouse.click(375,837);
await page.waitForTimeout(100);
await page.screenshot({path:`${out}/06-recorded-titre-table.png`,fullPage:true});
const recorded=await state();

const result={ready:ready.titration,indicator:indicator.titration,flowing:flowing.titration,near:near.titration,drops:dropStates.map(s=>({reading:s.titration.burette_final_reading_cm3,ph:s.ph,colour:s.titration.flask_colour,complete:s.complete})),endpoint:endpoint.titration,recorded:{tab:recorded.tab,titration:recorded.titration},renderer:ready.renderer,errors};
fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));

if(ready.practical!=='Acid–alkali titration'||ready.renderer?.enabled!==true)throw new Error('Titration practical or WebGL renderer did not load');
if(!ready.titration?.apparatus.includes('burette')||!ready.titration?.apparatus.includes('clamp stand')||!ready.titration?.apparatus.includes('boss')||!ready.titration?.apparatus.includes('white tile'))throw new Error('Complete titration apparatus is not exposed');
if(ready.ph!==1||ready.titration.burette_final_reading_cm3!==0||ready.titration.indicator_added)throw new Error('Initial HCl or burette state is incorrect');
if(!indicator.titration.indicator_added||indicator.titration.flask_colour!=='colourless'||indicator.titration.stage!==1)throw new Error('Phenolphthalein addition state is incorrect');
if(!flowing.running||!flowing.titration.tap_open||flowing.titration.burette_final_reading_cm3<11||flowing.titration.burette_final_reading_cm3>13)throw new Error('Open-tap delivery or live burette reading is incorrect');
if(near.running||near.titration.stage!==3||near.titration.burette_final_reading_cm3!==24.8||near.titration.flask_colour!=='colourless')throw new Error('Near-endpoint automatic stop is incorrect');
if(dropStates.length!==5||dropStates[3].titration.burette_final_reading_cm3!==25||dropStates[3].ph!==7||dropStates[3].complete||endpoint.titration.burette_final_reading_cm3!==25.05||!endpoint.complete||endpoint.titration.flask_colour!=='permanent very pale pink')throw new Error('Dropwise neutral point or phenolphthalein endpoint is incorrect');
if(recorded.tab!=='graph'||!recorded.titration.titre_recorded||recorded.titration.titre_cm3!==25.05||recorded.results_columns?.join(',')!=='reading,burette_cm3')throw new Error('Titre result table was not recorded correctly');
if(errors.length)throw new Error(errors.join('\n'));
await browser.close();
console.log(JSON.stringify(result,null,2));
