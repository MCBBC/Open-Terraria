// ★BJ658 一次性物证提炼（用户世界档 十周年纪念种子(2).wld）：
// 找明胶水晶（tile 129 凝胶域 frameX≥324，样式 18-23；生成端 WorldGen.cs:70168-70172
// `Next(50)==0 → style=18+Next(6)`，MapHelper.cs:2806-2813 `fx>=324 → baseOption 1`）。
// 载体=TileID.cs:345 CanGrowCrystalShards 全 5 型（116 珍珠沙/117 珍珠石/164 神圣冰/
// 402 神圣硬化沙/403 神圣沙岩）——全神圣族 → 顺带扫神圣域范围（载体 tile + 墙 200-203
// HallowUnsafe1-4；任务原文"墙95"误锚，反编译 WallID.cs:259 =BlueDungeonTileUnsafe）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readLocalFixture, localFixtureMissing } from '../tests/fixturePath';
import { parseWld } from '../src/wld/WldParser';

const WLD = 'bj641-anniversary-seed.wld';   // ★C档收编+脱敏:原微信收件档(与 Downloads 副本 md5 全等)→ tests/fixtures/local

// 原版天然实心地形（地表扫描白名单，vanilla id 域；少量误差可接受）
const NAT_SOLID = new Set([1, 2, 23, 25, 53, 56, 57, 58, 59, 60, 70, 116, 117, 147, 161, 162, 163, 164, 199, 203, 211, 396, 397, 398, 399, 400, 401, 402, 403, 404]);
const CARRIERS = new Set([116, 117, 164, 402, 403]);
const CARRIER_NAME: Record<number, string> = { 116: '珍珠沙', 117: '珍珠石', 164: '神圣冰', 402: '神圣硬化沙', 403: '神圣沙岩' };
const HALLOW_WALLS = new Set([200, 201, 202, 203]); // WallID.HallowUnsafe1-4（天然地下神圣洞壁）

function dir8(dx: number, dy: number): string {
  const ang = Math.atan2(dy, dx); // +x 东 / +y 南
  const names = ['正东', '东南', '正南', '西南', '正西', '西北', '正北', '东北'];
  const idx = Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return names[idx];
}

it.skipIf(localFixtureMissing(WLD))('BJ658 wld gel-crystal evidence', () => {
  const buf = readLocalFixture(WLD);
  const w = parseWld(new Uint8Array(buf));
  const t = w.tiles as unknown as { active: Uint8Array; type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array; wall: Uint16Array };
  console.log('meta:', JSON.stringify({
    version: w.version, title: w.title, seed: w.seed,
    size: `${w.tilesWide}x${w.tilesHigh}`, spawnTile: [w.spawnX, w.spawnY],
    spawnPx: [w.spawnX * 16, w.spawnY * 16],
    groundLevel: w.groundLevel, rockLevel: w.rockLevel,
    hardMode: w.hardMode, seedFlags: w.seedFlags,
    dungeon: [w.dungeonX, w.dungeonY],
  }));

  const W = w.tilesWide, H = w.tilesHigh;
  // 每列地表：首个天然实心块 y（无则 NaN）
  const surface = new Int32Array(W).fill(-1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (t.active[i] && NAT_SOLID.has(t.type[i])) { surface[x] = y; break; }
    }
  }

  const gel: Array<{ x: number; y: number; fx: number; fy: number }> = [];
  const normal: Array<{ x: number; y: number; fx: number }> = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!t.active[i] || t.type[i] !== 129) continue;
      const fx = t.frameX[i];
      if (fx >= 324) gel.push({ x, y, fx, fy: t.frameY[i] });
      else normal.push({ x, y, fx });
    }
  }
  console.log(`tile129 总数=${gel.length + normal.length}  明胶域(fx>=324)=${gel.length}  普通碎块域(fx<324)=${normal.length}`);
  const styleHist = new Map<number, number>();
  for (const n of normal) styleHist.set(Math.floor(n.fx / 18), (styleHist.get(Math.floor(n.fx / 18)) || 0) + 1);
  console.log('普通碎块 style(fx/18) 直方图:', [...styleHist.entries()].sort((a, b) => a[0] - b[0]).map(([s, c]) => `s${s}=${c}`).join(' '));

  // 明胶水晶逐个：像素坐标/深度/方位
  console.log('--- 明胶水晶全表（tile 坐标 / 像素 / 深度 / 相对出生点） ---');
  for (const g of gel) {
    const sf = surface[g.x] >= 0 ? surface[g.x] : w.groundLevel;
    const dx = g.x - w.spawnX, dy = g.y - w.spawnY;
    const dist = Math.round(Math.hypot(dx, dy));
    console.log(`(${g.x},${g.y}) px=(${g.x * 16},${g.y * 16}) fx=${g.fx} fy=${g.fy} style=${Math.floor(g.fx / 18)} ` +
      `列地表y=${surface[g.x]} 地下${g.y - sf}格 groundLevel=${w.groundLevel}(+${g.y - w.groundLevel}) rockLevel=${w.rockLevel}(+${g.y - w.rockLevel}) ` +
      `出生点(${w.spawnX},${w.spawnY}) → ${dir8(dx, dy)} 距${dist}格(${dist * 16}px) dx=${dx} dy=${dy}`);
  }

  // 明胶水晶聚类（距离≤30格连簇）
  const clusters: Array<{ pts: typeof gel }> = [];
  for (const g of gel) {
    let best: { pts: typeof gel } | null = null;
    let bd = 31;
    for (const c of clusters) {
      for (const p of c.pts) {
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        if (d < bd) { bd = d; best = c; }
      }
    }
    if (best) best.pts.push(g); else clusters.push({ pts: [g] });
  }
  console.log(`--- 明胶水晶簇 ${clusters.length} 簇 ---`);
  clusters.forEach((c, k) => {
    const xs = c.pts.map((p) => p.x), ys = c.pts.map((p) => p.y);
    const cx = Math.round(xs.reduce((a, b) => a + b) / xs.length), cy = Math.round(ys.reduce((a, b) => a + b) / ys.length);
    const sf = surface[cx] >= 0 ? surface[cx] : w.groundLevel;
    const dx = cx - w.spawnX, dy = cy - w.spawnY;
    const dist = Math.round(Math.hypot(dx, dy));
    // 最近 NPC 家（导航参照）
    let nn = '', nd = Infinity;
    for (const n of w.npcs) {
      if (n.homeless || n.homeX === 0) continue;
      const d = Math.hypot(n.homeX - cx, n.homeY - cy);
      if (d < nd) { nd = d; nn = `${n.name}(${n.homeX},${n.homeY})`; }
    }
    console.log(`簇${k + 1}: ${c.pts.length}颗 包络x[${Math.min(...xs)}..${Math.max(...xs)}] y[${Math.min(...ys)}..${Math.max(...ys)}] ` +
      `中心(${cx},${cy}) px(${cx * 16},${cy * 16}) 中心列地表y=${sf} 地下${cy - sf}格 ` +
      `出生点→${dir8(dx, dy)} 距${dist}格 dx=${dx} dy=${dy} 最近NPC家=${nn} 距${Math.round(nd)}格 ` +
      `明细=[${c.pts.map((p) => `${p.x},${p.y}`).join(' ')}]`);
  });

  // 神圣域范围：载体 tile / 神圣墙
  const hallowWallCount = { w200: 0, w201: 0, w202: 0, w203: 0 };
  const carrCount = new Map<number, number>();
  const cols: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (t.active[i] && CARRIERS.has(t.type[i])) {
        carrCount.set(t.type[i], (carrCount.get(t.type[i]) || 0) + 1);
        cols.push(x);
      }
      if (HALLOW_WALLS.has(t.wall[i])) hallowWallCount[`w${t.wall[i]}` as keyof typeof hallowWallCount]++;
    }
  }
  const carrPts: Array<{ x: number; y: number; ty: number }> = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (t.active[i] && CARRIERS.has(t.type[i])) carrPts.push({ x, y, ty: t.type[i] });
    }
  }
  console.log('神圣载体计数:', [...carrCount.entries()].map(([k, v]) => `${CARRIER_NAME[k]}(${k})=${v}`).join(' '),
    `墙200-203=${JSON.stringify(hallowWallCount)}`);
  // 载体按 x 聚区（列间隙>80 分区）
  carrPts.sort((a, b) => a.x - b.x);
  const regions: Array<Array<{ x: number; y: number; ty: number }>> = [];
  for (const p of carrPts) {
    const r = regions[regions.length - 1];
    if (r && p.x - r[r.length - 1].x <= 80) r.push(p);
    else regions.push([p]);
  }
  console.log(`--- 神圣地载体分区 ${regions.length} 区（列间隙>80 分割） ---`);
  regions.forEach((r, k) => {
    const xs = r.map((p) => p.x), ys = r.map((p) => p.y);
    const mix = new Map<number, number>();
    for (const p of r) mix.set(p.ty, (mix.get(p.ty) || 0) + 1);
    const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
    const sf = surface[cx] >= 0 ? surface[cx] : w.groundLevel;
    const yTop = Math.min(...ys);
    console.log(`区${k + 1}: x[${Math.min(...xs)}..${Math.max(...xs)}] y[${yTop}..${Math.max(...ys)}] 计${r.length} ` +
      `构成=${[...mix.entries()].map(([k2, v]) => `${CARRIER_NAME[k2]}=${v}`).join(' ')} ` +
      `顶面约y=${yTop}(列${cx}地表${sf},地表下${yTop - sf}格) 出生点→${dir8(cx - w.spawnX, yTop - w.spawnY)}`);
  });

  // 独立结构自证：生成端锚在载体旁（hardUpdateWorld 对 active 载体格 PlaceTile 相邻空格）
  // → 每颗 gel 水晶四邻必有 CanGrowCrystalShards 载体；若无=分类可疑
  console.log('--- gel 水晶贴附自证（四邻载体） ---');
  let ok = 0;
  for (const g of gel) {
    const nb: string[] = [];
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const i2 = (g.y + oy) * W + (g.x + ox);
      if (t.active[i2] && CARRIERS.has(t.type[i2])) nb.push(`${CARRIER_NAME[t.type[i2]]}@(${g.x + ox},${g.y + oy})`);
    }
    if (nb.length) ok++;
    else console.log(`⚠ 无载体邻居: (${g.x},${g.y}) 四邻=`, [g.x - 1, g.x + 1].map((x) => `(${x},${g.y})=${t.active[g.y * W + x] ? t.type[g.y * W + x] : 0}`).join(' '),
      [g.y - 1, g.y + 1].map((y) => `(${g.x},${y})=${t.active[y * W + g.x] ? t.type[y * W + g.x] : 0}`).join(' '));
  }
  console.log(`贴附载体自证: ${ok}/${gel.length} 通过`);

  // 出生点周边快照（玩家找路锚）
  const sf0 = surface[w.spawnX] >= 0 ? surface[w.spawnX] : w.groundLevel;
  console.log(`出生点(${w.spawnX},${w.spawnY}) 列地表y=${sf0} → 出生即地下${w.spawnY - sf0}格（负=地面上）`);
});
