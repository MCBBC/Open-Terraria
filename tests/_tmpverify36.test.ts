import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSaveData } from '../src/save/SaveFile';
import { Boomerang } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';

it('verify: slope-top scenario', () => {
  const json = readFileSync('/Users/vinlic/Downloads/map-Starter_World (25).json','utf8');
  const { world } = loadSaveData(JSON.parse(json));
  // 行为日志站位:x=53562, y=5675 → 瓦片 (3348, 354)
  const PX = 53562, PY = 5675;
  const st = world.store;
  console.log('== 地形 @ 玩家位置 ==');
  for (let ty = Math.floor(PY/16)-2; ty <= Math.floor((PY+42)/16)+5; ty++) {
    let row='';
    for (let tx=Math.floor(PX/16)-4;tx<=Math.floor(PX/16)+8;tx++) {
      const i=st.idx(tx,ty);
      row += !st.isSolid(tx,ty)&&!st.slope[i]&&!st.half[i]?'.':st.slope[i]===1?'/':st.slope[i]===2?'\\':st.slope[i]===4?'\\':st.half[i]?'_':st.slope[i]?'S':'#';
    }
    console.log(`r${ty}`,row);
  }
  // 模拟投掷:标准右侧平射 + 右下角度
  const hooks = {
    world,
    player: { x: PX, y: PY, w: 20, h: 42, cx: PX+10, cy: PY+21, dead: false,
      attackSpeedMult: 1, buffs: new Set(), critChance: () => 0 },
    enemies: () => [], playSfx() {}, playSfxFiles() {}, spawnParticles() {},
  } as unknown as GameHooks;

  for (const [label, aimX, aimY] of [['右下(+35°)',11.46,8.04],['平射',14,0],['直下',0,12]]) {
    const cx = PX+10, cy = PY+21;
    const spd = Math.sqrt(aimX*aimX+aimY*aimY);
    const ang = Math.atan2(aimY, aimX);
    const bom = new Boomerang(cx, cy, Math.cos(ang)*14, Math.sin(ang)*14, 25, 8, 33, 1);
    bom.x -= bom.w / 2; bom.y -= bom.h / 2;
    // Anti-embed grace
    {
      const bx0=Math.floor(bom.x/16), bx1=Math.floor((bom.x+bom.w-0.01)/16);
      const by0=Math.floor(bom.y/16), by1=Math.floor((bom.y+bom.h-0.01)/16);
      for(let ty2=by0;ty2<=by1;ty2++)for(let tx2=bx0;tx2<=bx1;tx2++){
        if(st.inBounds(tx2,ty2)&&st.isSolid(tx2,ty2)){bom.embedGrace=12;ty2=by1+1;break;}
        if(bom.embedGrace>0)break;
      }
    }
    let maxDx=0, maxDy=0, aboveTicks=0, alive=true;
    for (let t=0;t<60&&!bom.dead;t++) {
      bom.fixedUpdate(1/60, hooks); alive=!bom.dead;
      if(!alive) break;
      const dx=bom.cx-cx, dy=bom.cy-cy;
      maxDx=Math.max(maxDx,Math.abs(dx)); maxDy=Math.max(maxDy,dy);
      if(dy<-24)aboveTicks++;
    }
    console.log(`${label}: maxDx=${maxDx.toFixed(0)} maxDownDy=${maxDy.toFixed(0)} upTicks=${aboveTicks} alive=${alive} ai0=${bom.ai0} verdict=${maxDx>60?'OK':'BLOCKED'}`);
  }
}, 120000);
