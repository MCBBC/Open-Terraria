// IIII180：findPath 离线模拟 v2（真实 vanGenSolidType 谓词;双变体对拍 JS/oracle TH）
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_SHIM=1 npx vitest run tools/_iii180sim.test.ts
const RUN = process.env.SW_SHIM === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { vanGenSolidType } from '../src/world/gen/vanilla/GenSolid';
const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const PLAT = new Set<number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet; const d = TILE_DEFS[i] as unknown as { platform?: boolean };
  if (typeof s === 'number') SHEET[i] = s;
  if (d?.platform) PLAT.add(s);
}
const INVALID_WALLS = new Set([7, 94, 95, 8, 98, 99, 9, 96, 97, 3, 83, 68, 62, 78, 87, 86, 42, 74, 27, 149]);
const INVALID_TILES = new Set([383, 384, 15, 304, 30, 321, 245, 246, 240, 241, 242, 16, 34, 158, 377, 94, 10, 19, 86, 219, 484, 190, 664, 665, 41, 43, 44, 226, 237, 711, 712, 713, 714, 715, 716, 379, 314, 141, 411, 21, 467, 88]);
const PLACE_BLOCKED = new Set([225, 41, 481, 43, 482, 44, 483, 226, 203, 112, 25, 70, 151, 21, 31, 696, 467, 12, 665, 639, 138, 664, 711, 712, 713, 714, 715, 716]);
const UP = -1, STRAIGHT = 0, DOWN = 1, NORMAL = 0, TUNNEL = 1, AVAIL = 0, OBSTR = 1, INVAL = 2;
const HISTORY = 4096, REWRITE = 25;
const VAN_EXTRA = new Set([239, 380, 427, 435, 436, 437, 438, 439]);
const RESTORE = new Set([659, 484, 481, 482, 483, 162, 232, 229]);
// oracle 源 SOLID 集（335 项,659 经 SOLID.Remove 移除 → 有效集）
const SOLID_SRC: number[] = JSON.parse(readFileSync('/tmp/iii180-out/or-solid.json', 'utf8'));
const EFF_SOLID = new Set(SOLID_SRC.filter((s) => s !== 659));

it('findPath offline sim v2', () => {
  const le16 = (b: Buffer) => new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const Traw = le16(readFileSync('/tmp/iii180-out/js-trackdump.typ')), A = readFileSync('/tmp/iii180-out/js-trackdump.act'),
    Wl = le16(readFileSync('/tmp/iii180-out/js-trackdump.wal')), Hf = readFileSync('/tmp/iii180-out/js-trackdump.half'), Sl = readFileSync('/tmp/iii180-out/js-trackdump.slope');
  const T = new Uint16Array(Traw.length);
  for (let qi = 0; qi < Traw.length; qi++) T[qi] = Traw[qi] === 0 ? 0 : (SHEET[Traw[qi]] < 0 ? 65001 : SHEET[Traw[qi]]);
  const inW = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const shim = (process.env.SW_SHIM ?? '3966,724').split(',').map(Number);
  const WS = Number(process.env.SW_WS ?? 337), RL = Number(process.env.SW_RL ?? 571), BD = 380;
  const trace: string[] = [];
  const mkStateAt = (solidTile: (x: number, y: number) => boolean) => {
    const cache = new Map<number, number>();
    const locInvalid = (x: number, y: number) => {
      if (y > H - 200 || x < 5 || y < WS || x > W - 5) return true;
      if (shim[0] >= 0 && Math.abs(x - shim[0]) < 75 && Math.abs(y - shim[1]) < 75) return true;
      const oceanLevel = (WS + RL) / 2 + 40;
      if (y <= oceanLevel && (x < BD || x > W - BD)) return true;
      const i = y * W + x;
      if (INVALID_WALLS.has(Wl[i])) return true;
      if (A[i] && INVALID_TILES.has(T[i])) return true;
      for (let k = -1; k <= 1; k++) {
        if (!inW(x + k, y)) return true;
        const ni = y * W + x + k;
        if (A[ni] && T[ni] !== 314 && PLACE_BLOCKED.has(T[ni])) return true;
      }
      return false;
    };
    return (x: number, y: number): number => {
      const key = (x << 14) | y;
      const c = cache.get(key); if (c !== undefined) return c;
      let st = AVAIL;
      loop: {
        for (let i = 0; i < 6; i++) if (locInvalid(x, y - i)) { st = INVAL; break loop; }
        for (let j = 0; j < 6; j++) { if (!inW(x, y + j)) { st = INVAL; break loop; } const i = (y + j) * W + x; if (A[i] && T[i] === 314) { st = INVAL; break loop; } }
        for (let k = 0; k < 6; k++) if (solidTile(x, y - k)) { st = OBSTR; break loop; }
      }
      cache.set(key, st);
      if (process.env.SW_STATETRACE) trace.push(x + "," + y + "=" + st);
      return st;
    };
  };
  const runPath = (solidTile: (x: number, y: number) => boolean) => {
    const stateAt = mkStateAt(solidTile);
    const hist: Array<[number, number, number, number]> = new Array(HISTORY);
    const rewrite: Array<[number, number, number, number]> = new Array(REWRITE);
    let xDir = 1, len = 1;
    const canSlopesTouch = (left: number, right: number) => (left !== right && left !== STRAIGHT) ? right === STRAIGHT : true;
    const append = (slope: number, mode = NORMAL) => { const h = hist[len - 1]; hist[len] = [h[0] + xDir, h[1] + slope, slope, mode]; len++; };
    const rewriteSlope = (index: number, slope: number) => { const delta = slope - hist[index][2]; hist[index][2] = slope; for (let i = index; i < len; i++) hist[i][1] += delta; if (process.env.SW_SIMTRACE && index === 216) console.log("REW216 at len=" + len + " -> slope=" + slope); };
    const segmentState = (start: number, length: number) => {
      let result = AVAIL;
      for (let i = start; i < start + length; i++) {
        const s = stateAt(hist[i][0], hist[i][1]);
        if (s === INVAL) return INVAL;
        if (s === OBSTR && hist[i][3] !== TUNNEL) result = OBSTR;
      }
      return result;
    };
    const tryRewrite = (): number => {
      const start = len - 1;
      const size = Math.min(len, 25);
      for (let i = 0; i < size; i++) rewrite[i] = [...hist[start - i]] as [number, number, number, number];
      let num = start;
      while (num >= len - size) {
        if (hist[num][2] === DOWN) {
          const s = segmentState(num, len - num);
          if (process.env.SW_SIMTRACE && len === 217) console.log('TRACE len=217 num=' + num + ' seg=' + s + ' cell=' + hist[num].join(','));
          if (s === AVAIL) return s;
          rewriteSlope(num, STRAIGHT);
        }
        num--;
      }
      { const mid = segmentState(num + 1, len - (num + 1)); if (process.env.SW_SIMTRACE && len >= 217 && len <= 245) console.log("MID len=" + len + " start=" + (num + 1) + " seg=" + mid); if (mid === AVAIL) return AVAIL; }
      for (let m = len - 1; m >= len - size + 1; m--) {
        if (hist[m][2] === STRAIGHT) {
          const s = segmentState(len - size, size);
          if (s === AVAIL) return s;
          rewriteSlope(m, UP);
        }
      }
      for (let j = 0; j < size; j++) hist[len - 1 - j] = [...rewrite[j]] as [number, number, number, number];
      rewriteSlope(len - 1, STRAIGHT);
      return segmentState(num + 1, len - (num + 1));
    };
    const createTunnel = (): number => {
      let slope = STRAIGHT, num = 10, result = INVAL;
      const x = hist[len - 1][0], y = hist[len - 1][1];
      for (let s2 = UP; s2 <= DOWN; s2++) {
        let last = INVAL;
        for (let i = 1; i < num; i++) {
          last = stateAt(x + i * xDir, y + i * s2);
          if (last === OBSTR) continue;
          if (last === AVAIL) { slope = s2; num = i; result = last; }
          break;
        }
        if (result !== AVAIL && last === OBSTR && (result !== OBSTR || slope !== STRAIGHT)) { slope = s2; num = 10; result = last; }
      }
      if (len !== 0 && !canSlopesTouch(hist[len - 1][2], slope)) rewriteSlope(len - 1, STRAIGHT);
      hist[len - 1][3] = TUNNEL;
      for (let j = 1; j < num; j++) append(slope, TUNNEL);
      return result;
    };
    // 主流程：长轨 origin=754,667 min=400 max=1000
    let x = 754, y = 667;
    let state = stateAt(x, y);
    while (state !== OBSTR) { y++; if (state === INVAL) return { fail: 'origin invalid' }; if (y >= H - 1) return { fail: 'origin edge' }; state = stateAt(x, y); }
    y--;
    if (stateAt(x, y) !== AVAIL) return { fail: 'origin not avail' };
    xDir = x <= W / 2 ? 1 : -1;
    len = 1;
    for (let i = 0; i < HISTORY; i++) hist[i] = [x + i * xDir, y + i, DOWN, NORMAL];
    let length = len;
    while (len < HISTORY - 100) {
      const slope = hist[len - 1][2] !== UP ? DOWN : STRAIGHT;
      append(slope);
      const s = tryRewrite();
      if (s === INVAL) break;
      length = len;
      let s2 = s;
      while (s2 !== AVAIL) { s2 = createTunnel(); if (s2 === INVAL) break; length = len; }
      if (len >= 1000) break;
    }
    len = Math.min(1000, length);
    if (len < 400) return { fail: `shortLen ${len}` };
    let anchor = len - 1, flag = false;
    for (let i = len - 1; i >= 0; i--) {
      if (flag) {
        anchor = Math.min(i + 15, anchor);
        if (hist[i][1] >= hist[anchor][1]) {
          for (let k = i + 1; hist[k][1] > hist[i][1]; k++) { hist[k][1] = hist[i][1]; hist[k][2] = STRAIGHT; }
          if (hist[i][1] === hist[anchor][1]) flag = false;
        }
      } else if (hist[i][1] > hist[anchor][1]) flag = true;
      else anchor = i;
    }
    if (segmentState(0, len) === INVAL) return { fail: 'seg invalid' };
    const raw = hist.slice(0, len).map(h => [...h] as [number, number, number, number]);
    return { hist, len, raw };
  };
  const jsSolidTile = (x: number, y: number) => { if (!inW(x, y)) return false; const i = y * W + x; return !!A[i] && (T[i] === 0 || T[i] === 19 || EFF_SOLID.has(T[i])) && !PLAT.has(T[i]) && Hf[i] === 0 && Sl[i] === 0; };
  const orSolidTile = (x: number, y: number) => { if (!inW(x, y)) return false; const i = y * W + x; return A[i] !== 0 && ((EFF_SOLID.has(T[i]) && !VAN_EXTRA.has(T[i])) || RESTORE.has(T[i])) && !PLAT.has(T[i]) && Hf[i] === 0 && Sl[i] === 0; };
  const cmp = (tag: string, res: { hist?: Array<[number, number, number, number]>; len?: number; fail?: string }, thFile: string) => {
    if (res.fail) { console.log(`${tag}: FAIL ${res.fail}`); return; }
    const lines = readFileSync(thFile, 'utf8').split('\n').slice(0, res.len!);
    let firstBad = -1;
    for (let i = 0; i < res.len!; i++) {
      const p = lines[i]?.split(/\s+/);
      if (!p || p.length < 6 || Number(p[2]) !== res.hist![i][0] || Number(p[3]) !== res.hist![i][1] || Number(p[4]) !== res.hist![i][2] || Number(p[5]) !== res.hist![i][3]) { firstBad = i; break; }
    }
    console.log(`${tag}: len=${res.len} firstBad=${firstBad}${firstBad < 0 ? ' (全等)' : ` sim=${res.hist![firstBad].join(',')} th=${lines[firstBad]}`}`);
  };
  { const sa = mkStateAt(jsSolidTile); console.log('SIMDBG js stateAt(970,727)=', sa(970,727), ' stateAt(969,726)=', sa(969,726), ' stateAt(970,726)=', sa(970,726)); }
  { const rj = runPath(jsSolidTile);
    require('node:fs').writeFileSync('/tmp/iii180-out/sim-states.txt', trace.join('\n'));
    const ro = runPath(orSolidTile);
    require('node:fs').writeFileSync('/tmp/iii180-out/sim-js-preraw.txt', rj.raw.map(h => h.join(',')).join('\n'));
    require('node:fs').writeFileSync('/tmp/iii180-out/sim-or-preraw.txt', ro.raw.map(h => h.join(',')).join('\n'));
    const lj = rj.hist.slice(0, rj.len).map(h => h.join(',')).join('\n');
    const lo = ro.hist.slice(0, ro.len).map(h => h.join(',')).join('\n');
    require('node:fs').writeFileSync('/tmp/iii180-out/sim-js-raw.txt', lj);
    require('node:fs').writeFileSync('/tmp/iii180-out/sim-or-raw.txt', lo);
    console.log('dumped raw paths', rj.len, ro.len); }
  cmp('SIM-js', runPath(jsSolidTile), '/tmp/iii180-out/js-th-all.txt');
  cmp('SIM-or', runPath(orSolidTile), '/tmp/iii180-out/or-thraw-clean.txt');
});
