import { it } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { moveAndCollide } from '../src/physics/TileCollision';

it('debug2', () => {
  const w = new World(90, 160, 7, 'dbg');
  const st = w.store;
  for (let x = 0; x < 90; x++) { st.setTile(x, 100, 1); st.setTile(x, 101, 1); }
  // 回旋镖体 38×38,底缘贴地上 2px
  const body:any = { x: 701, y: 1560, w: 38, h: 38, vx: 14, vy: 0,
    onGround:false,hitWall:false,hitHead:false,collideY:false,tileCollide:true,dropThrough:true };
  moveAndCollide(body, w, body.vx, body.vy);
  console.log('after', 'x=',body.x.toFixed(1),'y=',body.y.toFixed(1),
    'hitWall',body.hitWall,'collideY',body.collideY,'onGround',body.onGround,
    'vx',body.vx.toFixed(2),'vy',body.vy.toFixed(2));
  // 列出 body 覆盖行涉及的格子实况
  const y0=Math.floor(body.y/16), y1=Math.floor((body.y+body.h-0.01)/16);
  for(let ty=y0;ty<=y1;ty++)for(let tx=45;tx<=48;tx++){
    console.log('cell',tx,ty,'solid',st.isSolid(tx,ty),'type',st.type[st.idx(tx,ty)],'half',st.half[st.idx(tx,ty)]);
  }
});
