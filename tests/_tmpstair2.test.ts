import { it } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { moveAndCollide } from '../src/physics/TileCollision';

it('trace landing', () => {
  const w = new World(120, 220, 7, 'dbg');
  const st = w.store;
  // 完全复刻 halfbrick 测试的阶梯构建
  for (let k = -4; k <= 10; k++) {
    const tx = 46 + (k + 4);
    const r0 = 362 + 2 * k - 12;
    if (r0 < 8 || r0 + 8 >= 220) continue;
    st.setTile(tx, r0, 2); st.setSlope(tx, r0, 1);
    st.setTile(tx, r0 + 1, 2);
    st.setTile(tx, r0 + 2, 2); st.setSlope(tx, r0 + 2, 4);
  }
  // 打印所有实心/坡面格
  for (let ty = 346; ty < 372; ty++) {
    let s = '';
    for (let tx = 44; tx < 64; tx++) {
      const i = st.idx(tx, ty);
      const sl = st.slope[i], hf = st.half[i], sd = st.isSolid(tx, ty);
      s += !sd && !sl && !hf ? '.' : sl === 1 ? '/' : sl === 4 ? '\\' : hf ? '_' : '#';
    }
    console.log(String(ty).padStart(4), s, `cols${44}-${63}`);
  }
  const b: any = { x: 54 * TILE + 2, y: 340 * TILE, w: 20, h: 42, vx: 0, vy: 0,
    onGround:false,hitWall:false,hitHead:false,collideY:false,tileCollide:true,dropThrough:true };
  for (let i=0;i<80;i++){
    b.vy=Math.min(b.vy+0.4,10); moveAndCollide(b,w as never,b.vx,b.vy);
    if(i%5===0||b.onGround)
      console.log('t'+i,'y',(b.y+b.h).toFixed(0),'row',Math.floor((b.y+b.h)/16),'og',b.onGround,
        'vx',b.vx.toFixed(2));
    if(b.onGround&&i>20){console.log('LANDED@t'+i);break;}
  }
});
