import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP=needInput(join(DOWNLOADS, 'map-Starter_World (23).json'));
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
  const AV=await import('/src/world/TileAnchorValidator.ts');
  const st=g.world.store;
  const DIRT=tiles.TILE_BY_KEY['dirt'];
  const x0=450,y0=330;
  // 清空区域并重建缝
  for(let dx=-3;dx<=6;dx++)for(let dy=-2;dy<=5;dy++)if(st.inBounds(x0+dx,y0+dy))st.setTile(x0+dx,y0+dy,0,0,0);
  for(let dx=-2;dx<=6;dx++)st.setTile(x0+dx,y0+3,DIRT);
  for(let dy=-1;dy<=1;dy++){st.setTile(x0-2,y0+dy,DIRT);st.setTile(x0+3,y0+dy,DIRT);}
  const rec=AV.anchorSpecOf(220);
  const direct={};
  for(const [n,cx] of [['left',x0],['mid',x0+1],['right',x0+2]])
    direct[n]=AV.chooseAnchorFromClick(st,cx,y0+1,rec);
  const vPrim=AV.validateAnchors(st,x0,y0-1,rec);
  // tryPlace 内部各门的返回值探测:把关键门逐个旁路调用太深;先看 spot判定基础
  const defItem=items.ITEM_DEFS[items.ITEM_BY_KEY['place_v_220_solidifier']];
  const cloned=(m)=>JSON.parse(JSON.stringify(rec));
  const bare=cloned(); bare.anchorBottom=null;bare.anchorTop=null;bare.anchorLeft=null;bare.anchorRight=null;
  const botOnly=cloned(); botOnly.anchorTop=null;botOnly.anchorLeft=null;botOnly.anchorRight=null;
  const sweep={bare:AV.validateAnchors(st,x0,y0-1,bare),botOnly:AV.validateAnchors(st,x0,y0-1,botOnly)};
  // 关键格字段
  const cells=[];
  for(const [cx,cy] of [[x0,y0+2],[x0+1,y0+2],[x0+2,y0+2]])
    {const i=st.idx(cx,cy);cells.push({cx,cy,tile:st.get(cx,cy),solidTileDef:tiles.TILE_DEFS[st.get(cx,cy)]?.key,slope:st.slope[i],half:st.half[i],active:st.isActive(cx,cy)});}
  const anchoredRec = rec ? {w:rec.w,h:rec.h,ox:rec.ox,oy:rec.oy} : null;
  const diagnostics={
    direct, vPrim, sweep, cells,
    defTile:defItem?.tile, anchoredRec,
    isTrackLike:false,
    playerAt:[g.player.x,g.player.y],
    interactRange:(()=>{const pr=g.player; const dx=Math.abs((x0+1)*16-(pr.x+pr.w/2)), dy=Math.abs((y0+1)*16-(pr.y+pr.h/2)); return {dx,dy};})(),
    useTimeNow:g.player.useTime,
  };
  return diagnostics;
});
console.log(JSON.stringify(out));
process.exit(0);
