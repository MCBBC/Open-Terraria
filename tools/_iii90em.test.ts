// IIII90 批：x86 祭坛样本流离线仿真器——用 rig 全窗 rolllog 恢复的 pass44 原始
// InternalSample 流（/tmp/iii94-out/altars-x86-vals.txt，FNV==pc.txt 权威）逐值驱动
// pass 结构（cs:15825-15897），在 hydrate 基座上跑同一套接受门，终态对拍 G2 dump#044。
// 若八通道零差 ⇒ 门代码与消耗结构双正确，JS 管线差异必在 rng.derivation 或结构外。
// 用法：SW_I90EM=1 npx vitest run tools/_iii90em.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { idsByVanillaSheet } from '../src/world/gen/vanilla/TileRunner';
import { flipGenSolid, genSolidType } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_I90EM === '1';
const OUT = process.env.SW_I90_OUT ?? '/tmp/iii94-out/cap-remix';
const G2 = process.env.SW_I90_G2 ?? '/tmp/iii89-out/rigb/dumps';
const W = 4200, H = 1200, N = W * H;
const C = 4.656612875245797e-10;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const ALTAR = TILE_BY_KEY['v_26_altars']!;
const BOULDERS = new Set<number>([
  'v_138_boulder', 'v_484_rolling_cactus', 'v_664_bouncy_boulder', 'v_665_life_crystal_boulder',
  'v_711_rainbow_boulder', 'v_712_poo_boulder', 'v_713_lava_boulder', 'v_714_spider_boulder',
  'v_715_ghoulder', 'v_716_friendly_boulder',
].map((k) => TILE_BY_KEY[k]).filter((v): v is number => v !== undefined));
const PLATFORMS = new Set(idsByVanillaSheet(19, 427, 435, 436, 437, 438, 439));

// ---- 值流回放 RNG：只重放 derivation，不自己产数 ----
let vals: number[] = [];
let k = 0;
function draw(): number {
  if (k >= vals.length) throw new Error(`stream exhausted at slot-attempt context: exhausted-once-at k=${k}`);
  return vals[k++]!;
}
function nextIntRange(min: number, max: number): number {
  const num = max - min;   // ≤ int32 ⇒ 单样本支（本 pass 三个 range 全小）
  return (Math.trunc(draw() * C * num) + min) | 0;
}

(RUN ? it : it.skip)('simulate x86 Altars value stream vs G2 dump#044', () => {
  // 读原始流
  vals = readFileSync('/tmp/iii94-out/altars-x86-vals.txt', 'utf8').split('\n').filter(Boolean).map(Number);
  console.log(`vals=${vals.length}`);
  // hydrate 基座
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as unknown as GenState;

  // dump 名表 + #044 载入
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const pre = `${G2}/044_${DUMPNAME.get(44)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error('dump#044 missing');
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
  const xt = le16(`${pre}.typ`), xa = readFileSync(`${pre}.act`), xw = le16(`${pre}.wal`),
    xl = readFileSync(`${pre}.liq`), xhf = readFileSync(`${pre}.half`), xsl = readFileSync(`${pre}.slope`),
    xlt = readFileSync(`${pre}.lty`), xia = readFileSync(`${pre}.inact`);

  // cs:15843-15897 结构 1:1（值流来自 x86）
  const remixFlag = !!gs.seedFlags.remix;
  let count = Math.trunc(st.w * st.h * 3.3e-06);
  if (remixFlag) count *= 3;
  const yLo = Math.trunc(gs.worldSurface * 2 + gs.rockLevel) / 3 | 0;
  const yHi = Math.trunc(gs.rockLevel + (st.h - 350) * 2) / 3 | 0;
  const midLo = st.w * 0.45, midHi = st.w * 0.55;
  const oceanDepths = (x: number, y: number): boolean => {
    if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
    return x < gs.beachDistance || x > st.w - gs.beachDistance;
  };
  const isTileNearby = (x: number, y: number): boolean => {
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
      if (!st.inBounds(x + dx, y + dy)) continue;
      const i = st.idx(x + dx, y + dy);
      if (st.flags[i] && st.type[i] === ALTAR) return true;
    }
    return false;
  };
  const place3x2 = (x: number, y: number): void => {
    if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 0; dy++) {
      if (st.flags[st.idx(x + dx, y + dy)]) return;
    }
    for (let dx = -1; dx <= 1; dx++) {
      const bi = st.idx(x + dx, y + 1);
      if (!st.flags[bi]) return;
      // SolidTile2 平台特赦 + slope/half 门 + Boulders 门（genSolidType=GenSolid 生成期实心表）
      if (!genSolidType(st.type[bi])) return;
      const topSlope = st.slope[bi] === 1 || st.slope[bi] === 2;
      if (!((PLATFORMS.has(st.type[bi]) && (st.half[bi] !== 0 || topSlope)) || st.slope[bi] === 0)) return;
      if (st.half[bi] !== 0) return;
      if (BOULDERS.has(st.type[bi])) return;
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 0; dy++) {
      st.setTileSilent(x + dx, y + dy, ALTAR, dx + 1, dy + 1);   // 帧只作占位（对拍关帧位无关通道）
    }
  };
  flipGenSolid([484], false);   // cs:15843 pass 头（生成期 484 恒非实心，防静态表残留）

  console.log(`negative vals=${vals.filter((v) => v < 0).length} v[0..5]=${vals.slice(0, 6).join(',')}`);
  for (const dbg of process.env.SW_EM_DBG ? Array.from({ length: 6 }, (_, i2) => i2) : []) {
    void dbg;
  }
  const X86_SITES = new Set(readFileSync('/tmp/iii94-out/x86-sites.txt', 'utf8').split('\n').filter(Boolean));
  const extraSlot = Number(process.env.SW_EM_EX_SLOT ?? -1);   // 在该槽起始注入 N 次消耗
  const extraN = Number(process.env.SW_EM_EX_N ?? 0);
  const MODE = process.env.SW_EM_MODE ?? 'plain';
  console.log(`[cfg] mode=${MODE} exSlot=${extraSlot} exN=${extraN}`);
  let attempts = 0;
  const anchors: Array<[number, number]> = [];
  let exhausted = 0;
  const dbgFirst = Number(process.env.SW_EM_N ?? 0);
  try {
    for (let i = 0; i < count; i++) {
      if (i === extraSlot && extraN > 0) { k += extraN; console.log(`[injected] at slot ${i}: k=${k}`); }
      let broke = false;
      for (let j = 0; j < 10000; j++) {
        let x = nextIntRange(281, st.w - 283);            // Next(281, w-283)
        while (x > midLo && x < midHi) x = nextIntRange(281, st.w - 283);
        nextIntRange(yLo, yHi);                           // cs:15864 常规窗（remix 作废但入流）
        let y = remixFlag ? nextIntRange(100, Math.trunc(st.h * 0.9)) : yLo;   // cs:15865-15868
        while (oceanDepths(x, y)
          || (gs.shimmerX >= 0 && Math.hypot(x - gs.shimmerX, y - gs.shimmerY) < 150)) {
          x = nextIntRange(281, st.w - 283);
          while (x > midLo && x < midHi) x = nextIntRange(281, st.w - 283);
          nextIntRange(yLo, yHi);
          y = remixFlag ? nextIntRange(100, Math.trunc(st.h * 0.9)) : yLo;
        }
        attempts++;
        if (attempts <= dbgFirst) console.log(`att${attempts}: x=${x} y=${y} nearby=${isTileNearby(x, y)} baseClear=${st.flags[st.idx(x - 1, y - 1)]},${st.flags[st.idx(x, y - 1)]},${st.flags[st.idx(x + 1, y - 1)]},${st.flags[st.idx(x - 1, y)]},${st.flags[st.idx(x, y)]},${st.flags[st.idx(x + 1, y)]}`);
        if (!isTileNearby(x, y)) place3x2(x, y);
        if (st.type[st.idx(x, y)] === ALTAR) { broke = true; anchors.push([x, y]); break; }
      }
      if (!broke) exhausted++;
      if ((i + 1) % 12 === 0 || i === count - 1) console.log(`slot ${i}: consumed=${k}/${vals.length} anchors=${anchors.length}`);
    }
    if (MODE === 'scan') {
      // 只报与 x86 全集的对齐结果
      const got = new Set(anchors.map(([x, y]) => `${x},${y}`));
      const onlyX = [...X86_SITES].filter((s) => !got.has(s));
      const onlyJ = [...got].filter((s) => !X86_SITES.has(s));
      console.log(`SCAN v2@${Date.now() % 100000} ex=${extraSlot}+${extraN}: anchors=${anchors.length} only-x86=[${onlyX.join(' ')}] only-sim=[${onlyJ.join(' ')}] consumed=${k}/${vals.length} attempts=${attempts}`);
    }
  } catch (e) {
    console.log(`★stream state at failure: consumed=${k}/${vals.length} attempts=${attempts} anchors(${anchors.length})=[${anchors.slice(-6).map((a) => a.join(',')).join(' | ')}]`);
    throw e;
  }

  // 八通道对拍 #044
  let dA = 0, dT = 0, dW = 0, dL = 0;
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) dA++;
    else if (va && xt[i] !== (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999)) dT++;
    if (xw[i] !== st.wall[i]) dW++;
    if (xl[i] !== st.liquid[i]) dL++;
  }
  console.log(`vs#044 A=${dA} T=${dT} W=${dW} L=${dL}${dA || dT ? ` first-mismatch-anchor-list-tail=${anchors.slice(-3).join(' ')}` : ''}`);
}, 600_000);
