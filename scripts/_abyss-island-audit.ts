// ★652b-4:岛屿/箱段 C# 忠实计数审计(Abyss.cs:40-1179 全程独立重转录)。
// 状态链:pre 快照 → fill 落格(层 tile)→ chasm 雕空 → 岛 overlay。
// ★已知仪器局限:pre 快照无 active 位,type==0 的活性泥格与空格不可分(按空处理)。
// 对照面:scripts/_replay-abyss.ts 的 [seg]/[island] 实测(掷数)。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { RNG, translateSeed } from '../src/core/rng.ts';
import { TILE_DEFS } from '../src/data/tiles.ts';

const F = Math.fround;
// exact vanilla solid 集(引擎 TILE_DEFS.vanilla.sheet → solid)
const VAN_SOLID = (() => {
  const set = new Set<number>();
  for (let i2 = 1; i2 < TILE_DEFS.length; i2++) {
    const d2 = TILE_DEFS[i2] as { vanilla?: { sheet: number } } & { solid?: boolean } | undefined;
    if (d2?.vanilla && d2.vanilla.sheet < 753 && ((d2 as { solid?: boolean }).solid ?? false)) set.add(d2.vanilla.sheet);
  }
  return set;
})();
const SOLID_VAN = VAN_SOLID;
const SOLID_MOD = new Set<number>([T_GRAVEL, T_PYRE, T_VOID, T_SHALE, T_PLANTY, T_SCORIA, 816]);

const LOGS = '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
const W = 4200, H = 1200, N = W * H;

// C# tile id 常量(Abyss 域消费面)
const T_SHALE = 847, T_GRAVEL = 806, T_PYRE = 815, T_VOID = 852;
const T_SCORIA = 853, T_PLANTY = 820, T_MOLTEN = 816;   // 值不影响掷数,仅占位
const TDIRT = 0;

function fnvOf(buf: Uint8Array): string {
  let hh = 0x811c9dc5;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const o = (x * H + y) * 4;
    hh ^= buf[o]; hh = Math.imul(hh, 0x01000193) >>> 0;
    hh ^= buf[o + 1]; hh = Math.imul(hh, 0x01000193) >>> 0;
  }
  return hh.toString(16).padStart(8, '0');
}
const passTf = new Map<string, string>();
for (const line of readFileSync(join(LOGS, 'genprobe.log'), 'utf8').split('\n')) {
  const cols = line.split('\t');
  if (cols[0] === 'PASS') passTf.set(cols[2], cols[3]);
}
const TF_IN = passTf.get('Draedon Structures');
let preFile = '';
for (const f of readdirSync(LOGS).sort()) {
  if (!f.startsWith('genprobe-snap-') || !f.endsWith('.bin.gz')) continue;
  if (fnvOf(gunzipSync(readFileSync(join(LOGS, f)))) === TF_IN) { preFile = f; break; }
}
if (!preFile) throw new Error('pre 快照未找到');
const buf = gunzipSync(readFileSync(join(LOGS, preFile)));
const preType = new Uint16Array(N);
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
  const o = (x * H + y) * 4;
  preType[y * W + x] = buf[o] | (buf[o + 1] << 8);
}
console.log('[audit2] pre=', preFile);

// ── 状态:type(C# id,0=空)+ active ──
const type = new Uint16Array(N), act = new Uint8Array(N);
for (let i = 0; i < N; i++) { type[i] = preType[i]; act[i] = preType[i] !== 0 ? 1 : 0; }
const idx = (x: number, y: number) => y * W + x;
const has = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? false : act[idx(x, y)] === 1;
const typ = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : type[idx(x, y)];
const put = (x: number, y: number, t: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = idx(x, y); type[i] = t; act[i] = 1; };
const clear = (x: number, y: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = idx(x, y); act[i] = 0; };
// 岛 overlay:C# 只置 HasTile/TileType(等价 put),但 m-scan 需读「本岛已铺」→
// 直接写 state 即可(审计独占 state,不与真链并行)。

const rng = new RNG(translateSeed('9293480'));
let draws = 0;
const VALS: number[] = [];
const nx = (a: number, b: number) => { draws++; const v = rng.next(); VALS.push(v); bumpChunk(v); return a + Math.floor(v * (b - a)); };
const nd = () => { draws++; const v = rng.next(); VALS.push(v); bumpChunk(v); return v; };
const rawN = () => { draws++; const v = rng.next(); VALS.push(v); bumpChunk(v); return v; };
let CHUNK_H = 0x811c9dc5;
const CHUNKS: number[] = [];
const bumpChunk = (v: number) => { const f = new Float64Array(1); f[0] = v; const u = new Uint32Array(f.buffer); let hh = CHUNK_H ^ u[0]; hh = Math.imul(hh, 0x01000193) >>> 0; hh ^= u[1]; hh = Math.imul(hh, 0x01000193) >>> 0; CHUNK_H = hh; if (draws % 4096 === 0) { CHUNKS.push(CHUNK_H); CHUNK_H = 0x811c9dc5; } };

// ── fill(Abyss.cs:54-310;层 tile 落格)──
const rock = 535, topGate = rock - Math.floor(H / 15) + 35;
const chasmX = 4030, atLeft = false;
const minX = chasmX - 160, maxX = W;
const abyssChasmY = H - 250, chasmBottom = abyssChasmY - 100;
const surfLow = 194;
function layerTile(Y: number): number {
  if (Y > rock + H * 0.27) return T_VOID;
  if (Y > rock + H * 0.268) return T_VOID;   // dither 掷在调用方
  if (Y > rock + H * 0.145) return T_PYRE;
  if (Y > rock + H * 0.143) return T_PYRE;
  if (Y >= rock - 10 && Y <= rock) return T_GRAVEL;
  if (Y <= rock - 10) return T_SHALE;
  return T_GRAVEL;
}
{
  const d0 = draws;
  for (let X = minX; X < maxX; X++) {
    for (let Y = 0; Y < abyssChasmY + 50 && Y < H; Y++) {
      if (Y <= topGate) continue;
      const i = idx(X, Y);
      const canConvert = act[i] === 1 && type[i] < 753;
      if (canConvert || act[i] === 0) {
        let t: number;
        if (Y > rock + H * 0.27) t = T_VOID;
        else if (Y > rock + H * 0.268) { nd(); t = T_VOID; }
        else if (Y > rock + H * 0.145) t = T_PYRE;
        else if (Y > rock + H * 0.143) { nd(); t = T_PYRE; }
        else if (Y >= rock - 10 && Y <= rock) { t = nd() < 0.5 ? T_GRAVEL : T_SHALE; }
        else if (Y <= rock - 10) t = T_SHALE;
        else t = T_GRAVEL;
        type[i] = t; act[i] = 1;
      }
    }
  }
  console.log('[audit2] fill 掷数=', draws - d0, '(replay=4880)');
}

// ── chasm(已验证转录)──
const CHASM_BOTTOM = 850, FIVE = 5;
function chasmCSharp(i: number, jScan: number, steps: number): number {
  const d0 = draws;
  let j = jScan;
  {
    const probe = atLeft ? i + 125 : i - 125;
    let ty = Math.max(0, j);
    while (ty < H - 1 && !has(probe, ty)) ty++;
    j = ty;
  }
  const F01 = F(0.1), F02 = F(0.2), F05 = F(0.5), F001 = F(0.01), F002 = F(0.02);
  let maxChasmSize = steps;
  let X = F(i), Y = F(j);
  let offX = F(nx(-1, 2) * F01), offY = F(F(nx(3, 8) * F02) + F05);
  let cw = nx(5, 7) + 20;
  while (cw > 0) {
    if (maxChasmSize > 0) {
      cw += nx(0, 10); cw -= nx(0, 10);
      if (maxChasmSize > 790) { if (cw < 7) cw = 7; if (cw > 45) cw = 45; }
      else { if (cw < 30) cw = 30; if (cw > 70) cw = 70; if (maxChasmSize === 1 && cw < 50) cw = 50; }
    } else if (Y > CHASM_BOTTOM) {
      cw -= nx(0, 5) + 8;
    }
    if (maxChasmSize > 0 && Y > CHASM_BOTTOM) maxChasmSize = 0;
    maxChasmSize = F(maxChasmSize - 1);
    if (maxChasmSize > FIVE) {
      let x0 = Math.trunc(X - cw * 0.5), x1 = Math.trunc(X + cw * 0.5);
      let y0 = Math.trunc(Y - cw * 0.5), y1 = Math.trunc(Y + cw * 0.5);
      if (x0 < 0) x0 = 0; if (x1 > W - 1) x1 = W - 1;
      if (y0 < 0) y0 = 0; if (y1 > H) y1 = H;
      if (x1 > x0 && y1 > y0) for (let k = x0; k < x1; k++) for (let l = y0; l < y1; l++) {
        if (F(F(Math.abs(k - X)) + F(Math.abs(l - Y))) < cw * 0.5 * (1 + nx(-5, 6) * 0.015)) clear(k, l);
      }
    }
    X = F(X + offX); Y = F(Y + offY);
    offX = F(offX + F(nx(-1, 2) * F001));
    if (offX > 0.02) offX = F002;
    if (offX < -0.02) offX = -F002;
    let wx0 = Math.trunc(X - cw * 1.1), wx1 = Math.trunc(X + cw * 1.1);
    let wy0 = Math.trunc(Y - cw * 1.1), wy1 = Math.trunc(Y + cw * 1.1);
    if (wx0 < 1) wx0 = 1; if (wx1 > W - 1) wx1 = W - 1;
    if (wy0 < 0) wy0 = 0; if (wy1 > H) wy1 = H;
    if (wx1 > wx0 && wy1 > wy0) {
      for (let m = wx0; m < wx1; m++) for (let n = wy0; n < wy1; n++) {
        if (F(F(Math.abs(m - X)) + F(Math.abs(n - Y))) < cw * 1.1 * (1 + nx(-5, 6) * 0.015)) {
          nx(7, 16);
          if (n > j + 0) clear(m, n);   // Next 值不关心
        }
      }
      for (let r = wx0; r < wx1; r++) for (let s = wy0; s < wy1; s++) {
        if (F(F(Math.abs(r - X)) + F(Math.abs(s - Y))) < cw * 1.1 * (1 + nx(-5, 6) * 0.015)) clear(r, s);
      }
    }
  }
  return draws - d0;
}
{
  const c1 = chasmCSharp(chasmX, surfLow + 65, chasmBottom);
  const c2 = chasmCSharp(chasmX - 22, surfLow, chasmBottom);
  const c3 = chasmCSharp(chasmX + 22, surfLow, chasmBottom);
  console.log(`[audit2] chasm ${c1}/${c2}/${c3} (replay 11962542/17687535/6543626)`);
}

// ── AbyssIsland(Abyss.cs:805-1026)独立转录;逐相掷数 ──
let ilog: string[] | null = [];
function abyssIsland(i: number, j: number, sizeMin: number, sizeMax: number, sizeMin2: number, sizeMax2: number, tileType: number, hasChest: boolean, hasClumps: boolean, hasScoria: boolean): void {
  const d0 = draws;
  const ph: number[] = [0, 0, 0, 0];
  let islandWidth = nx(sizeMin, sizeMax);
  let smallIslandWidth = F(nx(sizeMin, sizeMax) / 5);
  let orgX = F(i), orgY = F(j);
  let posMinX = i, posMaxX = i, posMinY = j, posMaxY = j;
  let vX = F(nx(-20, 21) * F(0.2));
  while (vX > -2 && vX < 2) vX = F(nx(-20, 21) * F(0.2));
  let vY = F(nx(-20, -10) * F(0.02));
  while (islandWidth > 0 && smallIslandWidth > 0) {
    islandWidth -= nx(0, 4);
    smallIslandWidth = F(smallIslandWidth - 1);
    const leftX = Math.min(Math.max(Math.trunc(orgX - islandWidth * 0.5), 0), W);
    const rightX = Math.min(Math.max(Math.trunc(orgX + islandWidth * 0.5), 0), W);
    const topY = Math.min(Math.max(Math.trunc(orgY - islandWidth * 0.5), 0), H);
    const botY = Math.min(Math.max(Math.trunc(orgY + islandWidth * 0.5), 0), H);
    const extraW = islandWidth * nx(sizeMin, sizeMax) * 0.01;
    let yOff = F(orgY + 1);
    for (let k = leftX; k < rightX; k++) {
      if (nd() < 0.5) yOff = F(yOff + nx(-1, 2));
      if (yOff < orgY) yOff = orgY;
      if (yOff > orgY + 2) yOff = F(orgY + 2);
      for (let l = topY; l < botY; l++) {
        if (l > yOff) {
          const dx = F(Math.abs(k - orgX)), dy = F(Math.abs(l - orgY) * 3);
          if (Math.sqrt(F(F(dx * dx) + F(dy * dy))) < extraW * 0.4) {
            if (k < posMinX) posMinX = k;
            if (k > posMaxX) posMaxX = k;
            if (l < posMinY) posMinY = l;
            if (l > posMaxY) posMaxY = l;
            put(k, l, tileType);
          }
        }
      }
    }
    orgX = F(orgX + vX); orgY = F(orgY + vY);
    vX = F(vX + F(nx(-20, 21) * F(0.05)));
    if (vX > 1) vX = 1;
    if (vX < -1) vX = -1;
    if (vY > 0.2) vY = -F(0.2);
    if (vY < -0.2) vY = -F(0.2);
  }
  ph[0] = draws - d0;
  // m-loop(团块)
  let m = posMinX + nx(0, 5);
  let randV = 4;
  while (m < posMaxX) {
    let ty = posMaxY;
    while (!has(m, ty)) ty--;          // C# 无守卫(审计状态保证有格)
    ty += nx(-3, 4);
    randV = nx(4, 8);
    let placed = tileType;
    if (hasClumps && nd() < 1 / 3) {
      if (tileType !== T_PYRE) placed = hasScoria ? T_SCORIA : T_PLANTY;
      else placed = hasScoria ? T_SCORIA : T_MOLTEN;
    }
    for (let n = m - randV; n <= m + randV; n++) {
      for (let p = ty - randV; p <= ty + randV; p++) {
        if (p > posMinY) {
          const dx = F(Math.abs(n - m)), dy = F(Math.abs(p - ty) * 2);
          if (Math.sqrt(F(F(dx * dx) + F(dy * dy))) < randV + nx(0, 2)) put(n, p, placed);
        }
      }
    }
    m += nx(randV, Math.trunc(randV * 1.5));
  }
  ph[1] = draws - d0;
  // 燃烧段(:952-986)
  {
    const smin2 = Math.trunc(sizeMin2 / 8), smax2 = Math.trunc(sizeMax2 / 8);
    let iw2 = nx(sizeMin2, sizeMax2);
    let siw2 = nx(smin2, smax2);
    let bX = F(nx(-20, 21) * F(0.2));
    while (bX > -2 && bX < 2) bX = F(nx(-20, 21) * F(0.2));
    let bY = F(nx(-20, -10) * F(0.02));
    while (iw2 > 0 && siw2 > 0) {
      iw2 -= nx(0, 4);
      siw2 -= 1;
      bX = F(bX + F(nx(-20, 21) * F(0.05)));
      if (bX > 1) bX = 1;
      if (bX < -1) bX = -1;
      if (bY > 0.2) bY = -F(0.2);
      if (bY < -0.2) bY = -F(0.2);
    }
  }
  ph[2] = draws - d0;
  // phase3(:987-1025)——Dirt 门按 state 字面
  let x3 = posMinX + nx(0, 5);
  let dirtHits = 0;
  while (x3 < posMaxX) {
    let y3 = posMaxY;
    while ((!has(x3, y3) || typ(x3, y3) !== TDIRT) && x3 < posMaxX) {
      y3--;
      if (y3 < posMinY) {
        y3 = posMaxY;
        x3 += nx(1, 4);
      }
    }
    if (x3 < posMaxX) {
      dirtHits++;
      y3 += nx(0, 4);
      const rv = nx(2, 5);
      for (let r = x3 - rv; r <= x3 + rv; r++) {
        for (let s = y3 - rv; s <= y3 + rv; s++) {
          if (s > posMinY) {
            const dx = Math.abs(r - x3), dy = Math.abs(s - y3) * 2;
            if (Math.sqrt(dx * dx + dy * dy) < rv) type[idx(r, s)] = tileType;   // 只写型
          }
        }
      }
      x3 += nx(rv, Math.trunc(rv * 1.5));
    }
  }
  ph[3] = draws - d0;
  if (ilog) ilog.push(`${i},${j},${sizeMin}-${sizeMax}/${sizeMin2}-${sizeMax2},cl=${hasClumps ? 1 : 0},sc=${hasScoria ? 1 : 0} p1=${ph[0]} m=${ph[1]} burn=${ph[2]} p3=${ph[3]} tot=${draws - d0} dirt=${dirtHits}`);
}

// ── Blotches 圆斑(Shapes.Circle+Blotches(2,0.4);仅掷数,落格 ClearTile)──
function blotchDiscClear(cx: number, cy: number, r: number): void {
  const out = new Set<number>();
  const K = 1 << 14;
  for (let i = cy - r; i <= cy + r; i++) {
    const dy = i - cy;
    const span = Math.min(r, Math.trunc(Math.sqrt((r + 1) * (r + 1) - dy * dy)));
    for (let j2 = cx - span; j2 <= cx + span; j2++) {
      nd();
      if (nd() < 0.4) {
        const a0 = nx(-1, 1), a1 = nx(0, 2), b0 = nx(-1, 1), b1 = nx(0, 2);
        for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) out.add((i + b) * K + (j2 + a));
      } else out.add(i * K + j2);
    }
  }
  for (const key of out) {
    const x = key % K, y = Math.floor(key / K);
    if (x >= 0 && x < W && y >= 0 && y < H) clear(x, y);
  }
}

// ── vanilla TileRunner 特化面(strength 8/steps 5/addTile/overRide)──
function tileRunner(i0: number, j0: number, strength: number, steps: number, t: number): void {
  let valX = i0, valY = j0;
  let spdX = nx(-10, 11) * 0.1, spdY = nx(-10, 11) * 0.1;
  nx(0, 4);
  let num2 = steps;
  while (strength > 0 && num2 > 0) {
    const num = strength * (num2 / steps);
    num2--;
    const x0 = Math.max(1, Math.trunc(valX - num * 0.5)), x1 = Math.min(W - 1, Math.trunc(valX + num * 0.5));
    const y0 = Math.max(1, Math.trunc(valY - num * 0.5)), y1 = Math.min(H - 1, Math.trunc(valY + num * 0.5));
    for (let k = x0; k < x1; k++) for (let l = y0; l < y1; l++) {
      if (!(Math.abs(k - valX) + Math.abs(l - valY) < strength * 0.5 * (1 + nx(-10, 11) * 0.015))) continue;
      put(k, l, t);
    }
    valX += spdX; valY += spdY;
  }
}

// ── PlaceSnailFossil(Abyss.cs:1138-1179)──
{
  const d0 = draws;
  const i = chasmX, j = chasmBottom + 45;
  abyssIsland(i, j + 2, 55, 75, 35, 45, T_VOID, false, false);
  for (let cX = i - 2; cX <= i + 2; cX++) for (let cY = j - 8; cY <= j - 1; cY++) {
    const radius = Math.trunc(nx(3, 5) * (0.74 + nd() * 0.08));
    blotchDiscClear(cX, cY, radius);
  }
  tileRunner(i, j + 4, 8, 5, T_VOID);
  for (let cX = i - 7; cX <= i + 7; cX++) for (let cY = j - 1; cY <= j + 5; cY++) {
    if (!has(cX, cY)) put(cX, cY, T_VOID);
  }
  console.log('[audit2] snailFossil 掷数=', draws - d0, '(replay island=1583 clears=6591 runner=139)');
}
// ── terminus 岛(:326)──
{
  const d0 = draws;
  abyssIsland(chasmX, chasmBottom + 5, 65, 75, 40, 45, T_VOID, false, false);
  console.log('[audit2] terminusIsland 掷数=', draws - d0, '(replay=2436)');
}
// ── 神殿(:329 PlaceAbyssShrine;掷数面:帽 Next(1,3)×n + 箱 loot)──
{
  const d0 = draws;
  let halfWidth = 4, yTop = chasmBottom - 5 - 1;
  while (halfWidth > -1) {
    halfWidth -= nx(1, 3);
    yTop--;
  }
  // AddChestWithLoot:scan 零掷;PlaceChest 零掷;loot 掷序(PlaceLootInChest 默认支+FillAbyssShrineChest)
  nx(0, 2); nx(3, 11);
  if (nx(0, 2) === 0) nx(25, 51);
  nx(0, 6); if (nx(0, 2) === 0) nx(1, 3);
  nx(0, 7); if (nx(0, 2) === 0) nx(1, 3);
  if (nx(0, 2) === 0) nx(1, 3);
  nx(1, 3);
  nx(0, 3);                       // SelectRandom dropType(3)
  nx(0, 2);                       // SelectRandom potionType(2)
  nx(100, 111); nx(8, 11); nx(10, 13); nx(10, 13);
  nx(0, 4);                       // Terminus Prefix(-1) 非配饰 1 掷
  nx(0, 4);                       // dropType Prefix(-1)
  console.log('[audit2] shrine 掷数=', draws - d0, '(replay=23)');
}
// ── 层1 硫磺岛带(:333-377)──
{
  const yStart = 248;
  const startH = Math.floor((yStart + 337) / 2) + 90;
  let it = 0;
  for (let sy = startH; sy <= rock - 25; sy++) {
    it++;
    const d0 = draws;
    const off = nx(15, 22), rp = nx(35, 80), kind = nx(0, 5);
    const cx = chasmX;
    if (kind === 0) {
      abyssIsland(cx - rp - 10, sy + 15, 60, 65, 45, 55, T_SHALE, false, false);
      abyssIsland(cx, sy, 60, 65, 45, 55, T_SHALE, false, false);
      abyssIsland(cx + rp + 10, sy + 15, 60, 65, 45, 55, T_SHALE, false, false);
    } else if (kind === 1) {
      abyssIsland(cx - rp, sy + 10, 60, 85, 30, 35, T_SHALE, false, false);
      abyssIsland(cx, sy + 15, 60, 85, 30, 35, T_SHALE, false, false);
      abyssIsland(cx + rp, sy, 60, 85, 30, 35, T_SHALE, false, false);
    } else if (kind === 2) {
      abyssIsland(cx - rp, sy + 15, 55, 65, 30, 35, T_SHALE, false, false);
      abyssIsland(cx + nx(15, 30), sy + 15, 60, 85, 30, 35, T_SHALE, false, false);
    } else if (kind === 3) {
      abyssIsland(cx - nx(15, 30), sy + 10, 55, 65, 30, 35, T_SHALE, false, false);
      abyssIsland(cx + rp, sy + 15, 60, 85, 30, 35, T_SHALE, false, false);
    } else {
      abyssIsland(cx - rp, sy, 60, 75, 30, 40, T_SHALE, false, false);
      abyssIsland(cx + rp, sy + 5, 60, 75, 30, 40, T_SHALE, false, false);
    }
    console.log(`[audit2] sulphur#it${it} y=${sy} kind=${kind} 掷数=${draws - d0}`);
    sy += off;
  }
  console.log(`[audit2] sulphurIslands 合计掷数=${draws - (draws - draws)} 迭代=${it}`);
}
// ── 层2 岛带(:380-438)──
{
  let iy = rock, it = 0;
  const islandPositions: Array<{ x: number; y: number }> = [];
  for (let n = 0; n < 11; n++) {
    it++;
    const d0 = draws;
    const off = nx(18, 25), rp = nx(45, 80);
    islandPositions.push({ x: chasmX, y: iy });
    const kind = nx(0, 5);
    const cx = chasmX;
    const cl = true;
    if (kind === 0) {
      abyssIsland(cx - rp - 10, iy + 15, 60, 65, 30, 35, T_GRAVEL, false, cl, false);
      abyssIsland(cx, iy, 60, 65, 30, 35, T_GRAVEL, false, cl, true);
      abyssIsland(cx + rp + 10, iy + 15, 60, 65, 30, 35, T_GRAVEL, false, cl, false);
    } else if (kind === 1) {
      abyssIsland(cx - rp, iy + 10, 60, 65, 30, 35, T_GRAVEL, false, cl, true);
      abyssIsland(cx, iy + 15, 60, 65, 30, 35, T_GRAVEL, false, cl, false);
      abyssIsland(cx + rp, iy, 60, 65, 30, 35, T_GRAVEL, false, cl, false);
    } else if (kind === 2) {
      abyssIsland(cx - rp - 20, iy, 55, 65, 30, 35, T_GRAVEL, false, cl, true);
      abyssIsland(cx + 15, iy + 15, 55, 65, 30, 35, T_GRAVEL, false, cl, false);
      abyssIsland(cx + rp + 20, iy + 10, 55, 65, 30, 35, T_GRAVEL, false, cl, false);
    } else if (kind === 3) {
      abyssIsland(cx - rp, iy + 15, 60, 65, 30, 45, T_GRAVEL, false, cl, false);
      abyssIsland(cx - 15, iy + 5, 60, 65, 30, 45, T_GRAVEL, false, cl, false);
      abyssIsland(cx + rp, iy, 60, 65, 30, 45, T_GRAVEL, false, cl, true);
    } else {
      abyssIsland(cx - rp, iy, 60, 75, 30, 40, T_GRAVEL, false, cl, false);
      abyssIsland(cx, iy + 15, 60, 75, 30, 40, T_GRAVEL, false, cl, false);
      abyssIsland(cx + rp, iy + 5, 60, 75, 30, 40, T_GRAVEL, false, cl, false);
    }
    islandPositions[it - 1].x = kind === 1 ? cx + 30 : kind === 2 ? cx - 30 : kind === 3 ? cx + 25 : kind === 4 ? cx - 25 : cx;
    console.log(`[audit2] layer2#it${it} y=${iy} kind=${kind} 掷数=${draws - d0}`);
    iy += off;
    if (iy >= rock + 1200 * 0.145 - 10) break;
  }
  // ── 层3 岛带(:441-488)──
  {
    let ty = Math.trunc(rock + 1200 * 0.145), it3 = 0;
    while (ty <= Math.trunc(rock + 1200 * 0.27)) {
      it3++;
      const d0 = draws;
      const off = nx(18, 30), rp = nx(40, 75);
      const sc = nd() < 0.5;
      const kind = nx(0, 4);
      const cx = chasmX;
      if (kind === 0) {
        abyssIsland(cx - rp - 10, ty + 15, 55, 65, 45, 55, T_PYRE, false, true, false);
        abyssIsland(cx, ty, 60, 65, 45, 55, T_PYRE, false, true, true);
        abyssIsland(cx + rp + 10, ty + 15, 60, 65, 45, 55, T_PYRE, false, true, true);
      } else if (kind === 1) {
        abyssIsland(cx - rp, ty + 10, 60, 75, 30, 35, T_PYRE, false, true, true);
        abyssIsland(cx, ty + 15, 75, 85, 30, 35, T_PYRE, false, true, false);
        abyssIsland(cx + rp, ty, 55, 85, 30, 35, T_PYRE, false, true, false);
      } else if (kind === 2) {
        abyssIsland(cx - rp - 20, ty, 55, 65, 30, 35, T_PYRE, false, true, true);
        abyssIsland(cx - 20, ty + 15, 60, 70, 30, 35, T_PYRE, false, true, false);
        abyssIsland(cx + rp + 20, ty + 10, 65, 70, 30, 35, T_PYRE, false, true, true);
      } else {
        abyssIsland(cx - rp, ty + 15, 60, 75, 30, 55, T_PYRE, false, true, true);
        abyssIsland(cx + 20, ty + 5, 60, 75, 30, 55, T_PYRE, false, true, false);
        abyssIsland(cx + rp, ty, 60, 75, 30, 55, T_PYRE, false, true, true);
      }
      console.log(`[audit2] layer3#it${it3} y=${ty} kind=${kind} 掷数=${draws - d0}`);
      ty += off;
      if (ty >= rock + 1200 * 0.27 - 10) break;
      ty++;
    }
  }
  // ── 层4(:491-516)──
  // vyStart=(int)(rock+1200*0.275)=865 > chasmBottom-20=830 → 零迭代零掷
  // ── 箱(:519-528 + AbyssChest :1028-1136)──
  {
    // ShuffleArray(rand=null) → new Random() → 世界流零掷
    const chestTileId = 856;   // AbyssTreasureChest 值不涉掷
    let placedChests = 0;
    for (let house = 0; house < islandPositions.length && house < 20; house++) {
      const d0 = draws;
      const cx2 = islandPositions[house].x, cy2 = islandPositions[house].y;
      abyssIsland(cx2, cy2 + 2, 55, 75, 35, 45, T_GRAVEL, false, true, false);
      for (let cX = cx2 - 2; cX <= cx2 + 2; cX++) for (let cY = cy2 - 8; cY <= cy2 - 1; cY++) {
        const radius = Math.trunc(nx(3, 5) * (0.74 + nd() * 0.08));
        blotchDiscClear(cX, cY, radius);
      }
      tileRunner(cx2, cy2 + 4, 8, 5, T_GRAVEL);
      for (let cX = cx2 - 7; cX <= cx2 + 7; cX++) for (let cY = cy2 - 1; cY <= cy2 + 5; cY++) {
        if (!has(cX, cY)) put(cX, cY, T_GRAVEL);
      }
      // PlaceChest(i, j-2):足迹全空+支撑行实心(零掷);失败→战利品全跳
      const chestX = cx2, chestY = cy2 - 2;
      let ok = chestX >= 1 && chestY >= 1;
      if (ok) {
        for (let ccx = chestX; ccx <= chestX + 1 && ok; ccx++) {
          for (let ccy = chestY - 1; ccy <= chestY && ok; ccy++) if (has(ccx, ccy)) ok = false;
          if (ok && !has(ccx, chestY + 1)) ok = false;
        }
      }
      if (ok) {
        placedChests++;
        for (let ccx = chestX; ccx <= chestX + 1; ccx++) for (let ccy = chestY - 1; ccy <= chestY; ccy++) put(ccx, ccy, chestTileId);
        // item[0] Prefix(-1):配饰三件套 1-2 掷,余 1 掷——值面:用配饰概率近似不可,须按 house 流值
        //   这里按「主物品=abyssItemArray[house>9?house-10:house]」的配饰属性——审计简化:1 掷
        nx(0, 4);
        nx(0, 4);   // P1 pick
        nx(1, 3);   // P1 stack
        nx(0, 4);   // P2 pick
        nx(1, 3);
        nx(1, 3);   // healing
        nx(2, 5);   // mana
        nx(3, 12);  // kelp torch
        nx(2, 5);   // gold coin
      }
      console.log(`[audit2] chest#${house} pos=(${cx2},${cy2}) placed=${ok} 掷数=${draws - d0}`);
    }
    console.log('[audit2] placedChests=', placedChests, '(replay=8+shrine1)');
  }
  // ── in-pass 清理(:531-568):SmoothSlope 状态 + 孤格杀(active 才真杀,stale 型存续)──
  const slopeA = new Uint8Array(N), halfA = new Uint8Array(N);
  const smoothSlopeA = (x: number, y: number, neigh: boolean): void => {
    if (neigh) { smoothSlopeA(x + 1, y, false); smoothSlopeA(x - 1, y, false); smoothSlopeA(x, y + 1, false); smoothSlopeA(x, y - 1, false); }
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
    const i = idx(x, y);
    if (act[i] !== 1 || !(type[i] < 753 ? SOLID_VAN.has(type[i]) : SOLID_MOD.has(type[i]))) return;
    const tileEmpty = (xx: number, yy: number) => !has(xx, yy);
    const solidOr = (xx: number, yy: number) => has(xx, yy) && (SOLID_VAN.has(type[idx(xx, yy)]) || SOLID_MOD.has(type[idx(xx, yy)]) || halfA[idx(xx, yy)] === 1 || slopeA[idx(xx, yy)] > 0);
    const flag = !tileEmpty(x, y - 1);
    const flag2 = !solidOr(x, y - 1) && flag;
    const flag3 = solidOr(x, y + 1);
    const flag4 = solidOr(x - 1, y);
    const flag5 = solidOr(x + 1, y);
    const num = ((flag ? 1 : 0) << 3) | ((flag3 ? 1 : 0) << 2) | ((flag4 ? 1 : 0) << 1) | (flag5 ? 1 : 0);
    switch (num) {
      case 10: if (!flag2) { halfA[i] = 0; slopeA[i] = 3; } break;
      case 9: if (!flag2) { halfA[i] = 0; slopeA[i] = 4; } break;
      case 6: halfA[i] = 0; slopeA[i] = 1; break;
      case 5: halfA[i] = 0; slopeA[i] = 2; break;
      case 4: slopeA[i] = 0; halfA[i] = 1; break;
      default: halfA[i] = 0; slopeA[i] = 0; break;
    }
  };
  const FAM_SET = new Set([T_GRAVEL, T_PYRE, T_VOID, T_PLANTY, T_SCORIA, T_SHALE]);
  let killActive = 0;
  for (let X = minX + 5; X < maxX - 5; X++) for (let Y = 5; Y < abyssChasmY && Y < H; Y++) {
    const i = idx(X, Y);
    if (FAM_SET.has(type[i])) {
      smoothSlopeA(X, Y, true);
      if (!has(X, Y - 1) && !has(X, Y + 1) && !has(X - 1, Y) && !has(X + 1, Y) && act[i] === 1) { act[i] = 0; type[i] = 0; killActive++; }
    }
    if (type[i] === 56 && act[i] === 1) { act[i] = 0; type[i] = 0; killActive++; }
  }
  console.log('[audit2] cleanup active-kill=', killActive);
  // ── 环境装饰/罐/藤(:570-799)──
  {
    const d0 = draws;
    const V_VIPER = 900, V_SULPH = 901;
    const solid = (x: number, y: number) => has(x, y) && (type[idx(x, y)] < 753 ? SOLID_VAN.has(type[idx(x, y)]) : SOLID_MOD.has(type[idx(x, y)])) && halfA[idx(x, y)] === 0 && slopeA[idx(x, y)] === 0;
    const underworld = H - 200;
    for (let X = minX + 5; X < maxX - 5; X++) {
      for (let Y = 0; Y < underworld && Y < H; Y++) {
        const curType = typ(X, Y);
        if (!has(X, Y)) {
          const floorType = typ(X, Y + 1);
          if (Y < underworld && solid(X, Y + 1)) {
            if (floorType === T_SHALE) {
              if (nx(0, 85) === 0) { /* PlaceObject tube coral */ }
              if (nx(0, 18) === 0) nx(0, 3);
              if (nx(0, 15) === 0) nx(0, 3);
              if (nx(0, 12) === 0) nx(0, 3);
              if (nx(0, 12) === 0) nx(0, 5);
            }
            if (floorType === T_PLANTY) {
              if (nx(0, 8) === 0) nx(0, 3);
            }
            if (floorType === T_GRAVEL) {
              if (nx(0, 125) === 0 && !has(X, Y - 1)) {
                const r = nx(3, 4);
                blotchDiscClear(X, Y, r);   // 简化:coral blotch 落格面=PlaceTile 只落空格——审计按 clear 反例无关掷数
              }
              if (nx(0, 50) === 0) { /* pearl */ }
              if (nx(0, 15) === 0) nx(0, 4);
              if (nx(0, 15) === 0) nx(0, 3);
              if (nx(0, 15) === 0) nx(0, 3);
              if (nx(0, 45) === 0) nx(0, 3);
              if (nx(0, 17) === 0) nx(0, 6);
            }
            if (floorType === T_PYRE) {
              if (nx(0, 12) === 0) nx(0, 5);
              if (nx(0, 15) === 0) nx(0, 3);
            }
            if (floorType === T_VOID) {
              if (nx(0, 25) === 0) nx(0, 3);
            }
          }
          if ((floorType === T_GRAVEL || floorType === T_PYRE || floorType === T_VOID) && Y > rock) {
            if (nx(0, 5) === 0) { /* PlacePot */ }
          } else if (floorType === T_SHALE && Y < 337) {
            if (nx(0, 3) === 0) { /* PlacePot */ }
          }
        }
        if (curType === T_PLANTY && slopeA[idx(X, Y)] === 0 && !has(X, Y + 1)) {
          if (nd() < 0.5) put(X, Y + 1, V_VIPER);
        }
        if (curType === V_VIPER) {
          nx(1, 4);   // GrowVines 长度掷(PlaceTile 零掷)
        }
        if (curType === T_SHALE && slopeA[idx(X, Y)] === 0 && !has(X, Y + 1)) {
          if (nx(0, 5) === 0) put(X, Y + 1, V_SULPH);
        }
        if (curType === V_SULPH) {
          nx(1, 4);
        }
      }
    }
    console.log('[audit2] decor 掷数=', draws - d0, '(replay=19360)');
  }
  console.log('[audit2] 主段累计掷数=', draws, '(真链 Abyss pass dN=36541499;+decor 后对比)');
}
for (const l of ilog ?? []) console.log('[audit2-island]', l);
writeFileSync('/tmp/vals-sim-chunks.txt', CHUNKS.map((h, k) => `${k}\t${(h >>> 0).toString(16)}`).join('\n'));
console.log('[audit2] vals dumped:', VALS.length);
process.exit(0);
