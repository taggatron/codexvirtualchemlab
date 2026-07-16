import {chromium} from 'playwright';
import fs from 'node:fs';

const out='/private/tmp/chem-beaker-custom';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];
page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`)});
page.on('pageerror',error=>errors.push(`page: ${error.message}`));
await page.goto(`http://localhost:4187/?qa=${Date.now()}`,{waitUntil:'networkidle'});
await page.waitForTimeout(250);

const click=async(x,y)=>{await page.mouse.click(x,y);await page.waitForTimeout(40)};
const drag=async(x1,y1,x2,y2)=>{await page.mouse.move(x1,y1);await page.mouse.down();await page.mouse.move(x2,y2,{steps:8});await page.mouse.up();await page.waitForTimeout(80)};
const state=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text()));

await click(1120,222);
await click(1120,387);
await click(1120,332);
await drag(450,500,650,500);
await drag(555,480,650,480);
await click(1185,96);
await click(1120,167);
await click(760,423);

let beforeSnap=await state();
const target=beforeSnap.tripod_gauze_snap_targets[0];
await drag(345,480,target.x,target.y-48);
const snapped=await state();

await click(812,500);
await page.evaluate(()=>window.advanceTime(8500));
await page.waitForTimeout(80);
const heated=await state();
await page.screenshot({path:`${out}/beaker-heated.png`,fullPage:true});

const beaker=heated.workspace_items.find(item=>item.type==='beaker');
const tripod=heated.workspace_items.find(item=>item.type==='tripod');
const burner=heated.workspace_items.find(item=>item.type==='bunsen');
const result={target,snappedBeaker:snapped.workspace_items.find(item=>item.type==='beaker'),heatedBeaker:beaker,tripod,burner,temperature_c:heated.temperature_c,guidance:heated.guidance,errors};
fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));
if(beaker?.snapped_to!==tripod?.uid)throw new Error('Beaker did not snap to the tripod');
if(!burner?.lit)throw new Error('Bunsen gas valve did not open');
if(!beaker?.heating||beaker.temperature_c<=25)throw new Error('Snapped beaker contents did not heat');
if(errors.length)throw new Error(errors.join('\n'));
await browser.close();
console.log(JSON.stringify(result,null,2));
