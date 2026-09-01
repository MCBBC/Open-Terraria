// 3 格缝 Smart 吸附 E2E:落地面上造左右墙夹缝,点首/中/尾格走真 Game.tryPlace
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP='/Users/vinlic/Downloads/map-Starter_World (23).json';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',protocolTimeout:600000});
const page=await browser.newPage();
await page.goto('http://localhost:5201',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  const g=window.__swGame;
  const items=await import('/src/data/items.ts');
  const tiles=await import('/src/data/tiles.ts');
  const st=g.world.store;
  // 找开阔地并手工造缝:平台地面行 y0,缝 x∈[x0..x0+2],两侧立 3 高实心柱
  let y0=null,x0=null;
  outer:
  for(y0=210;y0<380;y0++)for(x0=430;x0<560;x0++){
    let ok=true;
    for(let dx=-4;dx<=7;dx++)if(!st.isSolid(x0+dx,y0+3)&&!st.isSolid(x0+dx,y0+2))ok=false; // 地表层任取
    for(let dy=-2;dy<=5;dy++)for(let dx=-4;dx<=7;dx++)if(st.isActive(x0+dx,y0+dy))ok=false;
    if(ok)break outer;
  }
  if(x0===null)return {fail:'no flat area'};
  const DIRT=tiles.TILE_BY_KEY['dirt'];
  // 缝:三格地表 = y0+2 行 x0..x0+2;两侧墙覆盖 y0-1..y0+2(高于物件顶)
  for(let dx=x0-1;dx<=x0+3;dx++)if(!st.isSolid(dx,y0+2))st.setTile(dx,y0+2,DIRT);
  for(const col of [x0-2,x0+3])for(let dy=y0-1;dy<=y0+2;dy++)if(!st.isSolid(col,dy))st.setTile(col,dy,DIRT);
  for(let dx=x0-2;dx<=x0+3;dx++)for(let dy=y0-1;dy<=y0+1;dy++)if(st.isActive(dx,dy)&&dx!==x0-2&&dx!==x0+3)st.setTile(dx,dy,0,0,0);
  g.player.x=(x0+1)*16; g.player.y=(y0-3)*16; g.player.vx=0;g.player.vy=0;
  await new Promise(r=>setTimeout(r,300));
  const inv=g.player.inv, selIdx=inv.selected, savedSlot=inv.slots[selIdx];
  inv.slots[selIdx]={id:items.ITEM_BY_KEY['place_v_220_solidifier'],stack:99,favorited:false,prefix:0};
  const def=items.ITEM_DEFS[items.ITEM_BY_KEY['place_v_220_solidifier']];
  const res={};
  for(const [name,cx] of [['left',x0],['mid',x0+1],['right',x0+2]]){
    // 清缝(防前次成功占用影响),重建柱与地表
    for(let dx=0;dx<3;dx++)for(let dy=-1;dy<=2;dy++)if(st.isActive(x0+dx,y0+dy))st.setTile(x0+dx,y0+dy,0,0,0);
    for(const col of [x0-2,x0+3])for(let dy=y0-1;dy<=y0+2;dy++)st.setTile(col,dy,DIRT);
    g.player.useTime=0;
    g['tryPlace'].call(g,cx,y0+2,def);   // 点击【地表固体块】本体
    let p=false,anchor=null;
    for(let dx=x0;dx<=x0+2&&!p;dx++)for(let dy=y0-1;dy<=y0+1;dy++)if(st.isActive(dx,dy)){p=true;}
    for(let dx=x0;dx<=x0+2&&anchor===null;dx++)for(let dy=y0-1;dy<=y0+1;dy++)if(st.isActive(dx,dy)){anchor=[dx,dy];break;}
    if(anchor){/*anchor found*/}
    res[name]=p?{placed:true,at:anchor}:{placed:false};
  }
  inv.slots[selIdx]=savedSlot;
  return {gap:[x0,y0],...res};
});
fs.writeFileSync('/tmp/gap-e2e.json',JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
