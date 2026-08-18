// WWW #57 定位（SW_WWW57=1）：golden56 基座重放 LifeCrystals；
// ① JS 放置序（包装 setTileSilent）vs golden57 心集；
// ② C# 直译参考谓词（overlay=已放心晶）逐尝试对拍；
// ③ 扩展枚举 500 窗：golden-only 24 心的成因尝试是否存在于同一条流里。
import { it } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runLifeCrystalsPass } from '../src/world/gen/vanilla/StructuresPass';

const RUN = process.env.SW_WWW57 === '1';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const VAN_SOLID_EXTRA = new Set([19, 239, 380, 427, 435, 436, 437, 438, 439]);

(RUN ? it : it.skip)('#57 attempt trace', () => {
  const t = rd16(56, 'typ'), a = rd8(56, 'act'), w = rd16(56, 'wal'), l = rd8(56, 'liq');
  const hf = rd8(56, 'half'), sl = rd8(56, 'slope'), lt = rd8(56, 'lty');
  const dir = `${BDIR}/s16`;
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${dir}/frames.bin`).buffer.slice(0));
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);

  const solidOf = (sh: number): boolean => {
    const id = REV.get(sh) ?? -1;
    if (gensolid.has(id)) return !!gensolid.get(id);
    return VAN_SOLID_EXTRA.has(sh) || !!TILE_DEFS[id]?.solid;
  };

  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = a[i]!;
    st.flags[i] = act;
    let id = ids35.has(i) ? ids35.get(i)! : -1;
    if (id < 0 || SHEET[id] !== (t[i] ?? 0)) id = REV.get(t[i]!) ?? 0;
    st.type[i] = id;
    st.wall[i] = w[i]!; st.liquid[i] = l[i]!; st.liquidType[i] = l[i] ? lt[i]! + 1 : 0;
    st.half[i] = hf[i]!; st.slope[i] = sl[i]!; st.wire[i] = 0;
  }
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; st.frameX[i] = fw[q + 1]!; st.frameY[i] = fw[q + 2]!; st.wire[i] = fw[q + 3]! & 0x1f; }

  const HEART = REV.get(12)!;
  const placed: string[] = [];
  const orig = st.setTileSilent.bind(st);
  (st as unknown as { setTileSilent: (...args: unknown[]) => unknown }).setTileSilent = (...args: unknown[]) => {
    const [x, y, tp] = args as [number, number, number];
    if (tp === HEART) placed.push(`${x},${y}`);
    return orig(...(args as []));
  };

  // golden57 心集（左上角）
  const t57 = rd16(57, 'typ'), a57 = rd8(57, 'act');
  const goldList: Array<[number, number]> = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (a57[i] && t57[i] === 12 && (!a57[i - 1] || t57[i - 1] !== 12) && (!a57[i - W] || t57[i - W] !== 12)) goldList.push([x, y]);
  }
  const goldSet = new Set(goldList.map(([x, y]) => `${x},${y}`));

  // 参考谓词（C# cs:32077 直译 + overlay 已放心晶）
  const refOv = (i: number, j: number, ov: Uint8Array): { ok: boolean; k?: number; why?: string } => {
    for (let k = j; k < H; k++) {
      const c = k * W + i;
      if (!(a[c] || ov[c])) continue;
      const sh = a[c] ? t[c]! : 12;
      if (!solidOf(sh)) continue;
      const num = k - 1;
      const at = (xx: number, yy: number) => yy * W + xx;
      if (i < 1 || num - 1 < 0 || num + 1 >= H) return { ok: false, k, why: 'bounds' };
      if ((l[at(i, num - 1)] > 0 && lt[at(i, num - 1)] + 1 === 2) || (l[at(i - 1, num - 1)] > 0 && lt[at(i - 1, num - 1)] + 1 === 2)) return { ok: false, k, why: 'lava' };
      if (l[at(i, num - 1)] > 0 && lt[at(i, num - 1)] + 1 === 4) return { ok: false, k, why: 'shimmer' };
      for (let xx = i - 1; xx <= i; xx++) for (let yy = num - 1; yy <= num; yy++) if (a[at(xx, yy)] || ov[at(xx, yy)]) return { ok: false, k, why: 'empty' };
      if ([7, 8, 9, 94, 95, 96, 97, 98, 99].includes(w[at(i, num)])) return { ok: false, k, why: 'dungeonwall' };
      for (const bx of [i - 1, i]) {
        const bi = at(bx, num + 1);
        if (!a[bi] || hf[bi]) return { ok: false, k, why: 'base-nactive' };
        if (!solidOf(t[bi]!)) return { ok: false, k, why: 'base-solid' };
      }
      return { ok: true, k };
    }
    return { ok: false, why: 'noscan' };
  };

  const yMin = Math.floor((gs.worldSurface * 2 + gs.rockLevel) / 3);
  const count = Math.floor(W * H * 0.00002);

  // 主驱动：记录尝试 + 放置
  const attempts: Array<{ n: number; tryN: number; j: number; x: number; ref: string }> = [];
  const overlay = new Uint8Array(N);
  const myPlaced: Array<[number, number]> = [];
  {
    const rng = new RNG(SEED);
    for (let n = 0; n < count; n++) {
      let done = false;
      for (let tr = 0; !done && tr < 10000; tr++) {
        const j = rng.int(yMin, H - 301);
        const x = rng.int(40, W - 41);
        const r = refOv(x, j, overlay);
        attempts.push({ n, tryN: tr, j, x, ref: `${r.ok ? 'OK' : 'NO:' + r.why}${r.k !== undefined ? '@k' + r.k : ''}` });
        done = r.ok;
        if (r.ok) {
          const hx = x - 1, hy = (r.k as number) - 2;
          myPlaced.push([hx, hy]);
          for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) overlay[(hy + dy) * W + hx + dx] = 1;
        }
      }
    }
  }
  console.log(`ref: ${myPlaced.length} crystals yMin=${yMin}`);
  const mySet = new Set(myPlaced.map(([x, y]) => `${x},${y}`));
  const goldOnly = goldList.filter(([x, y]) => !mySet.has(`${x},${y}`));
  const myOnly = myPlaced.filter(([x, y]) => !goldSet.has(`${x},${y}`));
  console.log(`match=${goldList.length - goldOnly.length} goldOnly=${goldOnly.length} myOnly=${myOnly.length}`);
  let firstMiss = -1;
  myPlaced.forEach(([x, y], q) => { if (!goldSet.has(`${x},${y}`) && firstMiss < 0) firstMiss = q; });
  console.log(`first MISS (my order) at #${firstMiss}`);

  // ③ 扩展枚举 500 窗：golden-only 心的成因尝试（x=心x+1、锚 k=心y+2、j≤k）在我的流里出现于何处
  {
    const rngX = new RNG(SEED);
    const ovX = new Uint8Array(N);
    const needX = new Map<number, number[]>();
    for (const [gx, gy] of goldOnly) { const li = needX.get(gx + 1) ?? []; li.push(gy); needX.set(gx + 1, li); }
    const found: string[] = [];
    let win = 0;
    outer:
    for (; win < 500; win++) {
      let done = false;
      for (let tr = 0; !done && tr < 10000; tr++) {
        const j = rngX.int(yMin, H - 301);
        const x = rngX.int(40, W - 41);
        const ys = needX.get(x);
        if (ys) {
          let k = -1;
          for (let y = j; y < H; y++) { const c = y * W + x; if (a[c] || ovX[c]) { k = y; break; } }
          if (k > 0) {
            for (const gy of ys) {
              if (k === gy + 2) { found.push(`heart(${x - 1},${gy}) ← win${win} try${tr} (j=${j},k=${k}) verdict=${(refOv(x, j, ovX)).why ?? 'OK?'}`); break; }
            }
            if (found.length >= Math.min(goldOnly.length, 6)) break outer;
          }
        }
        const r = refOv(x, j, ovX);
        if (r.ok) { const hx = x - 1, hy = (r.k as number) - 2; for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) ovX[(hy + dy) * W + hx + dx] = 1; }
        done = r.ok;
      }
    }
    console.log(`golden-only 成因尝试（前 ${found.length} 个，枚举 ${win} 窗）:`);
    for (const f of found) console.log('  ' + f);
  }

  // JS 重放（对照：应与 ref 全等）
  restoreGenSolid(gensolid);
  const rng = new RNG(SEED);
  runLifeCrystalsPass(st, rng, gs);
  console.log(`js placements: ${placed.length / 4}（首 ${placed.filter((_, q) => q % 4 === 0).slice(0, 3).join(' ')}）`);
  writeFileSync('/tmp/www57-placed.json', JSON.stringify(placed.filter((_, q) => q % 4 === 0)));

}, 300_000);
