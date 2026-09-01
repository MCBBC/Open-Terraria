// 固化机放置 E2E:注入背包→Game.tryPlace 双场景(落地✓/挂墙✗)
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
  const st=g.world.store;
  const itemDefId=items.ITEM_BY_KEY['place_v_220_solidifier'];
  if(itemDefId===undefined)return {fail:'no item def'};
  // 搜开阔平地(3x3 净空+底行实心)
  let spot=null;
  outer:
  for(let x=420;x<620;x++)for(let y=200;y<380;y++){
    if(!st.isSolid(x,y+2)&&st.isSolid(x,y+3)){/*底行=y+2*/}
    let ok=true;
    for(let dy=-1;dy<=1&&ok;dy++)for(let dx=0;dx<3;dx++){
      if(!st.inBounds(x+dx,y+dy))ok=false; else if(st.isActive(x+dx,y+dy))ok=false;
    }
    let hasFloor=false;
    for(let dx=0;dx<3;dx++)if(st.isSolid(x+dx,y+2))hasFloor=true;
    if(ok&&hasFloor){spot=[x,y];break outer;}
  }
  if(!spot)return {fail:'no open ground'};
  const [ax,ay]=spot;   // 锚点(占位左上)
  g.player.x=(ax-6)*16; g.player.y=(ay-3)*16; g.player.vx=0;g.player.vy=0;
  await new Promise(r=>setTimeout(r,300));
  const inv=g.player.inv, selIdx=inv.selected, savedSlot=inv.slots[selIdx];
  inv.slots[selIdx]={id:itemDefId,stack:1,favorited:false,prefix:0};
  inv.selected=selIdx;
  // 场景A:点【底中格】(vanilla Origin 底中) = (ax+1, ay+2)
  let before=st.get(ax,ay),after=-9;
  g['tryPlace'].call(g, ax+1, ay+2, items.ITEM_DEFS[itemDefId]);
  after=st.get(ax,ay);
  const placedGround = after===before && st.get(ax,ay)!==0 ? true : (function(){
    for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){if(st.isActive(ax+dx,ay+dy))return true;}
    return false;})();
  const groundTileKey=(()=>{for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){if(st.isActive(ax+dx,ay+dy))return TILE_K(st.get(ax+dx,ay+dy));}return null;})();
  function TILE_K(t){return t;}
  // 清场重置
  for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++)if(st.isActive(ax+dx,ay+dy))st.setTile(ax+dx,ay+dy,0,0,0);
  // 场景B:纯墙背景无落面 → 应拒绝。造一个封闭房间区更可靠:直接找现成室内墙?
  // 简化:临时清掉地面做"墙而有空"的人造环境(存档是内存态,用后即弃)
  const bx=ax, by=ay;   // 同位但清地面
  for(let dx=-1;dx<=4;dx++)for(const dy of [3])if(st.isSolid(bx+dx,by+dy))st.setTile(bx+dx,by+dy,0,0,0);
  const wallPlaced=(()=>{g['tryPlace'].call(g,bx+1,by+2,items.ITEM_DEFS[itemDefId]);
    let p=false;for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){if(st.isActive(bx+dx,by+dy))p=true;}return p;})();
  for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++)if(st.isActive(bx+dx,by+dy))st.setTile(bx+dx,by+dy,0,0,0);
  // 还原玩家槽位
  inv.slots[selIdx]=savedSlot;
  return {spot:[ax,ay],placedGround,groundType:groundTileKey,wallOnlyRejected:!wallPlaced};
});
fs.writeFileSync('/tmp/place-e2e.json',JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
