// 一次性审计：seed 12345 地牢陈设四症状实况（2026-08-13）
// ①门帧/可开性 ②宝箱四格帧 ③装饰物分布 ④灯-开关-电线
// 运行：npx vitest run tests/_dungeon-furnish-audit.test.ts
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { openDoor, doorStyleOf } from '../src/world/Door';

const WALL_DG = new Set([7, 8, 9, 17, 18, 19, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105]);

describe('地牢陈设审计(一次性)', () => {
  it('seed 12345: 门/宝箱/电线/装饰实况', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    const st = world.store;
    const dX = world.dungeonX, dY = world.dungeonY;
    console.log(`dungeon=(${dX},${dY})`);

    const id = (k: string) => TILE_BY_KEY[k]!;
    const DOOR = id('door_closed');
    const CHEST = id('chest');
    const CHEST2 = id('v_467_chests_group_2');
    const LANTERN = id('lantern');
    const CHAND = id('chandelier');
    const DSWITCH = id('v_136_switch');
    const LAMP = id('v_93_lamps');

    const inDG = (x: number, y: number) => WALL_DG.has(st.wall[st.idx(x, y)]);

    // ---- ① 门：每扇打印帧 + openDoor 试开 ----
    const doorSeen = new Set<number>();
    let doorOpenOK = 0, doorOpenFail = 0;
    for (let y = dY - 40; y < st.h - 200; y++) {
      for (let x = dX - 200; x < dX + 200; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== DOOR || !st.flags[i] || doorSeen.has(i)) continue;
        // 找锚点：同列向上找 frameY%54===0
        let ay = y;
        while (ay > 0 && st.type[st.idx(x, ay)] === DOOR && st.frameY[st.idx(x, ay)] % 54 !== 0) ay--;
        const frames: string[] = [];
        for (let dy = 0; dy < 3; dy++) {
          const ii = st.idx(x, ay + dy);
          if (st.type[ii] !== DOOR) { frames.push('(缺)'); continue; }
          doorSeen.add(ii);
          frames.push(`fx=${st.frameX[ii]},fy=${st.frameY[ii]}`);
        }
        const anchorFy = st.frameY[st.idx(x, ay)];
        const anchorFx = st.frameX[st.idx(x, ay)];
        const style = (anchorFy % 54 === 0) ? doorStyleOf(anchorFx, anchorFy) : -1;
        const ok = openDoor(st, x, ay + 1, 1) || openDoor(st, x, ay + 1, -1);
        if (ok) doorOpenOK++; else doorOpenFail++;
        console.log(`[门] (${x},${ay}) style=${style} ${inDG(x, ay) ? '地牢墙' : '墙' + st.wall[st.idx(x, ay)]} 帧:[${frames.join(' | ')}] 开门=${ok ? '✓' : '✗✗'}`);
      }
    }
    console.log(`门合计: 开门成功=${doorOpenOK} 失败=${doorOpenFail}`);

    // ---- ② 宝箱：2×2 组四格帧 ----
    const chestSeen = new Set<number>();
    let chestBad = 0;
    for (let y = dY - 40; y < st.h - 200; y++) {
      for (let x = dX - 200; x < dX + 200; x++) {
        const i = st.idx(x, y);
        const t = st.type[i];
        if ((t !== CHEST && t !== CHEST2) || !st.flags[i] || chestSeen.has(i)) continue;
        if (st.type[st.idx(Math.max(0, x - 1), y)] === t || st.type[st.idx(x, Math.max(0, y - 1))] === t) continue;
        const cells: string[] = [];
        let nonZero = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const ii = st.idx(x + dx, y + dy);
          chestSeen.add(ii);
          const fx = st.frameX[ii], fy = st.frameY[ii];
          if (fx || fy) nonZero++;
          cells.push(`(${dx},${dy})=${fx},${fy}`);
        }
        const bad = nonZero !== 0 && nonZero !== 4;
        if (bad || nonZero > 0) {
          chestBad += bad ? 1 : 0;
          console.log(`[箱] (${x},${y}) ${t === CHEST2 ? '467锁' : '21'} 非零格=${nonZero}/4 ${bad ? '★损坏' : ''} [${cells.join(' ')}]`);
        }
      }
    }
    console.log(`宝箱: 部分非零帧(损坏形态)组数=${chestBad}`);

    // ---- ④ 灯/开关/电线 ----
    let lanterns = 0, chands = 0, switches = 0, wireCells = 0, lamps = 0;
    let lanternOff = 0; // frameX==18 的灯笼(灭档)
    for (let y = dY - 40; y < st.h - 200; y++) {
      for (let x = dX - 200; x < dX + 200; x++) {
        const i = st.idx(x, y);
        if (!st.flags[i]) { if (st.wire[i] & 1) wireCells++; continue; }
        if (st.wire[i] & 1) wireCells++;
        const t = st.type[i];
        if (t === LANTERN) { lanterns++; if (st.frameX[i] === 18) lanternOff++; }
        else if (t === CHAND) chands++;
        else if (t === DSWITCH) switches++;
        else if (t === LAMP) lamps++;
      }
    }
    console.log(`灯笼=${lanterns}(灭档${lanternOff}) 吊灯=${chands} 开关=${switchs(switches)} 灯柱=${lamps} 红线格数=${wireCells}`);

    // ---- ③ 地牢墙内装饰物直方图(每类型样例位置) ----
    const hist = new Map<string, { n: number; pos: [number, number] }>();
    for (let y = dY - 40; y < st.h - 200; y++) {
      for (let x = dX - 200; x < dX + 200; x++) {
        const i = st.idx(x, y);
        if (!st.flags[i] || !inDG(x, y)) continue;
        const t = st.type[i];
        if (t === 0) continue;
        const sh = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
        if ([41, 43, 44, 481, 482, 483].includes(sh)) continue; // 地牢砖族本身
        const key = `${TILE_DEFS[t]?.key ?? t}(sheet${sh})`;
        const e = hist.get(key);
        if (e) e.n++; else hist.set(key, { n: 1, pos: [x, y] });
      }
    }
    const rows = [...hist.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25);
    for (const [k, v] of rows) console.log(`  陈设 ${k} ×${v.n} 样例(${v.pos[0]},${v.pos[1]})`);

    function switchs(n: number) { return n; } // 避免与 switch 关键字冲突的哑函数
    expect(true).toBe(true);
  }, 300000);
});
