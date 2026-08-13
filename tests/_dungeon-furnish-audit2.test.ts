// 一次性审计②：seed 12345——失败门两侧格/红线归属(灯线vs陷阱线)/可疑装饰物
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { openDoor } from '../src/world/Door';

const WALL_DG = new Set([7, 8, 9, 17, 18, 19, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105]);

describe('地牢陈设审计②(一次性)', () => {
  it('seed 12345: 门侧格/红线归属/可疑陈设', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    const st = world.store;
    const dX = world.dungeonX, dY = world.dungeonY;
    const id = (k: string) => TILE_BY_KEY[k]!;
    const DOOR = id('door_closed');
    const LANTERN = id('lantern'), CHAND = id('chandelier'), DSWITCH = id('v_136_switch');
    const PLATE = id('v_135_pressure_plates'), TRAP = id('v_137_traps');

    // ---- ① 每扇失败门：两侧 3 格内容 ----
    for (let y = dY - 40; y < st.h - 200; y++) {
      for (let x = dX - 200; x < dX + 200; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== DOOR || !st.flags[i]) continue;
        let ay = y;
        while (ay > 0 && st.type[st.idx(x, ay)] === DOOR && st.frameY[st.idx(x, ay)] % 54 !== 0) ay--;
        if (ay !== y) continue;                       // 只看锚点行，去重
        const ok = openDoor(st, x, ay + 1, 1) || openDoor(st, x, ay + 1, -1);
        if (ok) continue;
        const sides: string[] = [];
        for (const dx of [-1, 1]) {
          for (let dy = 0; dy < 3; dy++) {
            const ii = st.idx(x + dx, ay + dy);
            const t = st.type[ii];
            sides.push(`(${x + dx},${ay + dy})=${t === 0 ? '空' : TILE_DEFS[t]?.key + (st.flags[ii] ? '' : '[灭]')}`);
          }
        }
        console.log(`[堵门] (${x},${ay}) 侧格: ${sides.join(' ')}`);
      }
    }

    // ---- ② 红线归属：开关→灯 可达性 BFS（沿红线）----
    const wire = (x: number, y: number) => st.inBounds(x, y) && (st.wire[st.idx(x, y)] & 1) !== 0;
    let switchWiredToLamp = 0, switchesTotal = 0;
    for (let y = dY - 40; y < st.h - 200; y++) {
      for (let x = dX - 200; x < dX + 200; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== DSWITCH || !st.flags[i]) continue;
        switchesTotal++;
        // BFS 从开关邻格沿红线（含对角接线:4向+原版电线为8向?保守4向+对角）
        const seen = new Set<number>();
        const q: [number, number][] = [];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          if (wire(x + dx, y + dy)) q.push([x + dx, y + dy]);
        }
        let reach = false;
        let hops = 0;
        while (q.length && !reach && hops < 5000) {
          const [cx, cy] = q.shift()!;
          const ci = st.idx(cx, cy);
          if (seen.has(ci)) continue;
          seen.add(ci); hops++;
          // 终点判定：相邻有灯笼/吊灯(灯线) 或 压力板/飞镖陷阱(陷阱线)
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const t = st.type[st.idx(cx + dx, cy + dy)];
            if (t === LANTERN || t === CHAND) { reach = true; break; }
          }
          if (reach) break;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            if (wire(cx + dx, cy + dy) && !seen.has(st.idx(cx + dx, cy + dy))) q.push([cx + dx, cy + dy]);
          }
        }
        if (reach) switchWiredToLamp++;
        else console.log(`[开关] (${x},${y}) 沿线${seen.size}格 未达任何灯`);
      }
    }
    console.log(`开关总数=${switchesTotal} 其中接线到灯=${switchWiredToLamp}`);

    // ---- ③ 陷阱线归属抽证：飞镖陷阱沿线到压力板 ----
    let trapsSeen = 0, trapsWired = 0;
    for (let y = dY - 40; y < st.h - 200; y++) {
      for (let x = dX - 200; x < dX + 200; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== TRAP || !st.flags[i]) continue;
        trapsSeen++;
        let hitPlate = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          if (st.type[st.idx(x + dx, y + dy)] === PLATE) hitPlate = true;
          if (wire(x + dx, y + dy)) hitPlate = true;   // 至少接线
        }
        if (hitPlate) trapsWired++;
      }
    }
    console.log(`飞镖陷阱=${trapsSeen} 邻线/板=${trapsWired}`);

    // ---- ④ 可疑陈设：living_wood/起爆器/浴缸 的落点与支撑 ----
    for (const key of ['v_191_living_wood_block', 'v_411_detonator', 'bathtub', 'v_373_water_drip']) {
      const t = id(key);
      const list: string[] = [];
      for (let y = dY - 40; y < st.h - 200 && list.length < 12; y++) {
        for (let x = dX - 200; x < dX + 200 && list.length < 12; x++) {
          const i = st.idx(x, y);
          if (st.type[i] !== t || !st.flags[i]) continue;
          const below = st.type[st.idx(x, y + 1)];
          list.push(`(${x},${y})墙${st.wall[i]}下=${below === 0 ? '空' : TILE_DEFS[below]?.key}`);
        }
      }
      console.log(`[可疑:${key}] ${list.join(' | ')}`);
    }
    expect(true).toBe(true);
  }, 300000);
});
