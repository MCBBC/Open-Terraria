// WWW #58 定位（SW_WWW58=1）：Statues 干净基座重放，按放置序对比 golden58，找首个分歧雕像。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runStatuesPass } from '../src/world/gen/vanilla/StatuesPass';

const RUN = process.env.SW_WWW58 === '1';
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

(RUN ? it : it.skip)('#58 statue order', () => {
  const t = rd16(57, 'typ'), a = rd8(57, 'act'), w = rd16(57, 'wal'), l = rd8(57, 'liq'), lt = rd8(57, 'lty'), hf = rd8(57, 'half'), sl = rd8(57, 'slope');
  const dir = `${BDIR}/s17`;
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${dir}/frames.bin`).buffer.slice(0));
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
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
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; st.frameX[i] = fw[q + 1]!; st.frameY[i] = fw[q + 2]!; }
  const S105 = REV.get(105)!, S349 = REV.get(349)!;
  const placed: string[] = [];
  const orig = st.setTileSilent.bind(st);
  (st as unknown as { setTileSilent: (...args: unknown[]) => unknown }).setTileSilent = (...args: unknown[]) => {
    const [x, y, tp] = args as [number, number, number];
    if ((tp === S105 || tp === S349)) placed.push(`${x},${y}`);
    return orig(...(args as []));
  };
  restoreGenSolid(gensolid);
  // 尝试流重建：与 JS pass 同掷序，记录每个尝试 (x,y 扫描锚,verdict)
  const attempts: string[] = [];
  {
    // 复刻 runStatuesPass 的循环结构只读记录（不改 store）
    const yMin2 = Math.floor((gs.worldSurface * 2 + gs.rockLevel) / 3);
    const rng2 = new RNG(SEED);
    let num2 = 0;
    const STATUELEN = 74;
    const oceanTop = (gs.worldSurface + gs.rockLevel) / 2 + 40;
    for (let i2 = 0; i2 < Math.floor(STATUELEN * 2 * (W / 4200)); i2++) {
      if (num2 >= STATUELEN) num2 = 0;
      let done = false, fail = 0;
      while (!done) {
        let x2 = rng2.int(20, W - 21);
        let y2 = rng2.int(yMin2, H - 301);
        let guard = 100;
        while (y2 <= oceanTop && (x2 < gs.beachDistance || x2 > W - gs.beachDistance) && guard-- > 0) {
          x2 = rng2.int(20, W - 21);
          y2 = rng2.int(yMin2, H - 301);
        }
        if (guard <= 0) { done = true; break; }
        let yy = y2;
        while (yy < H && !st.flags[st.idx(x2, yy)]) yy++;
        if (yy >= H) { done = true; break; }
        yy--;
        let ok = true;
        if (yy < 2 || !st.inBounds(x2 + 1, yy - 2)) ok = false;
        for (let dx = 0; dx < 2 && ok; dx++) for (let dy = -2; dy <= 0 && ok; dy++) { if (st.flags[st.idx(x2 + dx, yy + dy)]) ok = false; }
        attempts.push(`n${i2}(x${x2},y${yy}) ${ok ? 'ACCEPT' : 'REJECT'}`);
        if (ok) { num2++; done = true; } else { fail++; if (fail >= 10000) done = true; }
      }
    }
  }
  runStatuesPass(st, new RNG(SEED), gs);
  // JS 每雕像 6 格（2×3），左上角 = placed[q], q%6==0
  const jsTL: string[] = [];
  for (let q = 0; q + 5 < placed.length; q += 6) jsTL.push(placed[q]!);
  // golden58 雕像左上角
  const t58 = rd16(58, 'typ'), a58 = rd8(58, 'act');
  const gold: string[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (a58[i] && (t58[i] === 105 || t58[i] === 349)
      && (!a58[i - 1] || (t58[i - 1] !== 105 && t58[i - 1] !== 349))
      && (!a58[i - W] || (t58[i - W] !== 105 && t58[i - W] !== 349))) gold.push(`${x},${y}`);
  }
  console.log(`golden statues=${gold.length} js=${jsTL.length}`);
  const gset = new Set(gold), jset = new Set(jsTL);
  const firstGold = gold.find(p2 => !jset.has(p2));
  console.log('前 12 尝试:', attempts.slice(0, 12).join(' | '));
  // 检查前 3 个被 JS 拒绝的尝试的雕像位是否在 golden
  for (const [rx, ry] of [[3910, 836], [2839, 493], [3759, 582]]) {
    console.log(`attempt (${rx},${ry}) → statue位(${rx},${ry - 2}) golden 有: ${gset.has(`${rx},${ry - 2}`) || gset.has(`${rx - 1},${ry - 2}`)}`);
  }
  if (firstGold) {
    const [gx, gy] = firstGold.split(',').map(Number);
    const hit = attempts.findIndex(a2 => a2.includes(`(x${gx},y${gy})`) || a2.includes(`(x${gx + 1},y${gy})`));
    console.log(`golden-only ${firstGold} 在尝试流中: ${hit >= 0 ? attempts[hit] : '未出现'}`);
  }

  let firstDiff = -1;
  jsTL.forEach((p, q) => { if (!gset.has(p) && firstDiff < 0) firstDiff = q; });
  console.log(`first diff @#${firstDiff} ${jsTL[firstDiff]}（前 ${jsTL.slice(Math.max(0, firstDiff - 2), firstDiff).join(' ')}）`);
  console.log(`golden-only 前8: ${gold.filter(p => !jset.has(p)).slice(0, 8).join(' ')}`);
  console.log(`js-only 前8: ${jsTL.filter(p => !gset.has(p)).slice(0, 8).join(' ')}`);
  // 首个分歧雕像与 golden-only 首个的邻域
  const dump = (x: number, y: number, tag: string) => {
    console.log(`${tag} (${x},${y}) golden57 邻域:`);
    for (let yy = y - 1; yy <= y + 3; yy++) {
      let row = ` y${yy}: `;
      for (let xx = x - 1; xx <= x + 2; xx++) { const i = yy * W + xx; row += `[${a[i] ? t[i] : '·'}${hf[i] ? 'h' : ''}${sl[i] || ''}${l[i] ? 'L' + lt[i] : ''}] `; }
      console.log(row);
    }
  };
  if (firstDiff >= 0) { const [dx, dy] = jsTL[firstDiff]!.split(',').map(Number); dump(dx, dy, 'JS-extra'); }
  const go = gold.find(p => !jset.has(p));
  if (go) { const [dx, dy] = go.split(',').map(Number); dump(dx, dy, 'golden-only'); }
}, 300_000);
