// IIII48 仪H：双引擎原子对拍——同一份骰流喂「faithful 模型」与「src tileRunner」，逐
// attempt 比对：掷耗是否相等、写出格集是否一致。首个不一致 attempt 即定罪。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { tileRunner as srcRunner } from '../src/world/gen/vanilla/TileRunner';

const RUN = process.env.SW_I48H1 === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const SEED = 1138154190;

function rd16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1);
}
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

const FRAMED_SHEET = new Set<number>([
  4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 27, 29, 31, 33, 34, 35, 36,
  42, 49, 50, 55, 72, 77, 78, 79, 81, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97,
  98, 99, 100, 101, 102, 103, 104, 105, 106, 114, 125, 126, 128, 129, 132, 133, 134, 135,
  136, 137, 138, 139, 141, 142, 143, 144, 149, 165, 171, 172, 173, 174, 178, 185, 186, 187,
  207, 209, 210, 212, 215, 216, 217, 218, 219, 220, 227, 228, 233, 235, 237, 238, 239, 240,
  241, 242, 243, 244, 245, 246, 247, 269, 270, 271, 275, 276, 277, 278, 279, 280, 281, 282,
  283, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301,
  302, 303, 304, 305, 306, 307, 308, 309, 310, 314, 316, 317, 318, 319, 320, 323, 324, 334,
  335, 337, 338, 339, 349, 354, 355, 356, 358, 359, 360, 361, 362, 363, 364, 372, 373, 374,
  375, 376, 377, 378, 380, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 405, 406, 410,
  411, 412, 413, 414, 419, 420, 423, 424, 425, 427, 428, 429, 435, 436, 437, 438, 439, 440,
  441, 442, 443, 445, 452, 453, 455, 456, 457, 461, 462, 463, 464, 465, 466, 467, 468, 469,
  470, 471, 475, 476, 480, 486, 487, 488, 489, 490, 491, 493, 494, 497, 499, 505, 506, 509,
  510, 511, 520, 521, 522, 523, 524, 525, 527, 530, 531, 532, 533, 538, 542, 543, 544,
]);

(RUN ? it : it.skip)('i48h dual-engine atomic', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const BYSHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !BYSHEET.has(s)) BYSHEET.set(s, i);
  }

  // 两侧独立 TileStore（同一起点）
  function mkStores() {
    const mk = () => {
      const st = new TileStore(W, H);
      const t0 = rd16(`${G2}/010_Small_Holes.typ`);
      const a0 = rd8(`${G2}/010_Small_Holes.act`);
      const l0 = rd8(`${G2}/010_Small_Holes.liq`);
      const lt0 = rd8(`${G2}/010_Small_Holes.lty`);
      for (let i = 0; i < N; i++) {
        st.type[i] = BYSHEET.get(t0[i]) ?? 0;
        st.flags[i] = a0[i] ? 1 : 0;
        st.liquid[i] = l0[i];
        st.liquidType[i] = lt0[i];
      }
      return st;
    };
    return [mk(), mk()] as const;
  }

  const gsStub = {
    seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    beachDistance: 380, beachLeftEnd: 376, beachRightStart: 3873,
    undergroundDesert: null,
  } as never;

  // faithful 引擎（store 直接以 sheet 域？——不，faithful 走内部 id 域；与 src 一致。
  // 该引擎只用于洞穴 -1/-2 路径的语义重放。所有比较换算成 sheet 域后再做）
  function faithfulRunner(st: TileStore, rng: RNG, xIn: number, yIn: number, strengthIn: number,
    stepsIn: number, typeIn: number, speedX = 0.0, speedY = 0.0, noYChange = false): void {
    const maxTilesX = W, maxTilesY = H;
    const CONS_ROCK = 769, WL = 929, LL = 418, BH = 380;
    const oceanLevel = (337 + CONS_ROCK) / 2 + 40;
    // 内部 id ↔ vanilla 判定用：沙=SHEET[t]==53 的活性格跳过
    let strength = strengthIn * (1 + rng.int(-50, 50) * 0.01);
    let valX = xIn, valY = yIn;
    let vx = rng.int(-10, 10) * 0.1;
    let vy = rng.int(-10, 10) * 0.1;
    if (speedX !== 0 || speedY !== 0) { vx = speedX; vy = speedY; }
    rng.nextIntRange(0, 4);
    let num2 = stepsIn;
    while (strength > 0 && num2 > 0) {
      const num = strength * (num2 / stepsIn);
      num2--;
      let bx0 = Math.trunc(valX - num * 0.5);
      let bx1 = Math.trunc(valX + num * 0.5);
      let by0 = Math.trunc(valY - num * 0.5);
      let by1 = Math.trunc(valY + num * 0.5);
      if (bx0 < 1) bx0 = 1;
      if (bx1 > maxTilesX - 1) bx1 = maxTilesX - 1;
      if (by0 < 1) by0 = 1;
      if (by1 > maxTilesY - 1) by1 = maxTilesY - 1;
      for (let k = bx0; k < bx1; k++) {
        for (let l = by0; l < by1; l++) {
          const ti = l * W + k;
          if (st.flags[ti] && FRAMED_SHEET.has(SHEET[st.type[ti]])) continue;
          if (!(Math.abs(k - valX) + Math.abs(l - valY) < strength * 0.5 * (1 + rng.int(-10, 10) * 0.015))) continue;
          if (typeIn < 0) {
            if (st.flags[ti] && SHEET[st.type[ti]] === 53) continue;
            if (typeIn === -2 && st.flags[ti] && (l < WL || l > LL)) {
              st.liquid[ti] = 255;
              st.liquidType[ti] = 1; // JS 域水=1
              const remLava = l > LL && (l < CONS_ROCK - 80 || l > maxTilesY - 350)
                && !((l <= oceanLevel) && (k < BH || k > maxTilesX - BH));
              if (remLava) st.liquidType[ti] = 2;
            }
            st.flags[ti] = 0;
            continue;
          }
          throw new Error('unexpected');
        }
      }
      valX += vx; valY += vy;
      vx += rng.int(-10, 10) * 0.05;
      if (vx > 1) vx = 1; else if (vx < -1) vx = -1;
      if (!noYChange) {
        vy += rng.int(-10, 10) * 0.05;
        if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
      } else if (num < 3) {
        if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
      }
    }
  }

  // store 快照/恢复（只需 type/flags/liquidType 三通道参与比对）
  const snap = (st: TileStore) => ({
    t: st.type.slice(), f: st.flags.slice(), lt: st.liquidType.slice(),
  });
  const restore = (st: TileStore, s: ReturnType<typeof snap>) => {
    st.type.set(s.t); st.flags.set(s.f); st.liquidType.set(s.lt);
  };

  const [stF, stJ] = mkStores();
  const rngF = new RNG(SEED);
  const rngJ = new RNG(SEED);
  const gRoll = globalThis as { __swOnRoll?: (v: number) => void };

  const areaF = W * H;
  let divs = 0;
  function attempt(kind: string, idx: number, fnF: () => void, fnJ: () => void): boolean {
    const sA = snap(stF), sB = snap(stJ);
    let cF = 0, cJ = 0;
    gRoll.__swOnRoll = () => cF++;
    fnF();
    delete gRoll.__swOnRoll;
    gRoll.__swOnRoll = () => cJ++;
    fnJ();
    delete gRoll.__swOnRoll;
    // 差异扫描
    let bad = cF !== cJ;
    let fx = -1;
    for (let i = 0; i < N; i++) {
      if (sA.f[i] !== stF.flags[i] || sB.f[i] !== stJ.flags[i]) {
        const eq = (sA.f[i] ? 1 : 0) === (sB.f[i] ? 1 : 0);
        if (!eq) { bad = true; if (fx < 0) fx = i; }
      }
    }
    if (bad) {
      console.log(`★DIVERGE @${kind}${idx}: diceF=${cF} diceJ=${cJ} actDiff=${fx >= 0 ? `(${fx % W},${Math.floor(fx / W)})` : '-'} prog=${Math.round(rngPeek.progress)}%`);
      divs++;
      return true;
    }
    return false;
  }

  const rngPeek = { progress: 0 } as unknown as { progress: number };

  const headDraw = (r: RNG) => {
    let type = -1;
    if (r.nextInt(10) === 0) type = -2;
    let nstr = Math.trunc(r.nextIntRange(6, 20) * 0.7);
    let nstp = Math.trunc(r.nextIntRange(50, 300) * 0.7);
    const rx = r.nextIntRange(0, W);
    const ry = r.nextIntRange(769, H);
    return { type, nstr, nstp, rx, ry };
  };
  let num = Math.trunc(Math.trunc(areaF * 0.00013) * 1.1);
  for (let i = 0; i < num && divs === 0; i++) {
    const hF = headDraw(rngF), hJ = headDraw(rngJ);
    if (JSON.stringify(hF) !== JSON.stringify(hJ)) throw new Error(`header desync @M${i}`);
    const { type, nstr, nstp, rx, ry } = hF;
    rngPeek.progress = (i / num) * 55;
    attempt('M', i,
      () => faithfulRunner(stF, rngF, rx, ry, nstr, nstp, type),
      () => srcRunner(stJ, rngJ, gsStub, rx, ry, { strength: nstr, steps: nstp, type }));
  }
  num = Math.trunc(areaF * 0.00013 * 0.4);
  outer:
  for (let j = 0; j < num; j++) {
    const drawExtraHead = (r: RNG) => {
      let type2 = -1;
      if (r.nextInt(10) === 0) type2 = -2;
      const nstr2 = r.nextIntRange(7, 26);
      const nstp2 = r.nextIntRange(50, 200);
      const spX = r.nextIntRange(100, 221) * 0.1;
      const spY = r.nextIntRange(-10, 11) * 0.02;
      const x2 = r.nextIntRange(0, W);
      const y2 = r.nextIntRange(769, H);
      return { type2, nstr2, nstp2, spX, spY, x2, y2 };
    };
    const eF = drawExtraHead(rngF), eJ = drawExtraHead(rngJ);
    if (JSON.stringify(eF) !== JSON.stringify(eJ)) throw new Error(`header desync @E${j}`);
    for (const [sign, sx, sy] of [[1, eF.spX, eF.spY], [-1, -eF.spX, -eF.spY]] as const) {
      const bad = attempt(`E${j}.${sign}`, j,
        () => faithfulRunner(stF, rngF, eF.x2, eF.y2, eF.nstr2, eF.nstp2, eF.type2, sx, sy, true),
        () => srcRunner(stJ, rngJ, gsStub, eF.x2, eF.y2, { strength: eF.nstr2, steps: eF.nstp2, type: eF.type2, speedX: sx, speedY: sy, noYChange: true }));
      if (bad || divs > 0) break outer;
    }
  }
  console.log(divs === 0 ? 'ALL ATTEMPTS ATOMIC-EQUAL' : `divergent attempts=${divs}`);
}, 900_000);
