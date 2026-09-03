// IIIII214: golden 071_Pots ↔ JS 槽末快照 逐格 diff + 分族聚合 + y-分布 + 首差定位
// 用法：SW_I214_GOLD=<goldPrefix> SW_I214_JS=<jsDir> npx vitest run tools/_iii214potsdiff.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('iii214 pots slot diff', () => {
  const GOLD = process.env.SW_I214_GOLD ?? '';
  const JSD = process.env.SW_I214_JS ?? '/tmp/iii214-out/js-pots';
  const W = Number(process.env.SW_I214_W ?? 4200), H = Number(process.env.SW_I214_H ?? 1200);
  if (!GOLD || !existsSync(`${JSD}/base_type.bin`)) { console.log('[i214d] missing inputs, skip'); return; }
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const N = W * H;
  const idx = (x: number, y: number) => x + y * W;
  const rb = (p: string) => readFileSync(p);
  const rd16 = (p: string) => { const b = rb(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const rd8 = (p: string) => new Uint8Array(rb(p).buffer, rb(p).byteOffset, N);

  const gt = rd16(`${GOLD}.typ`), ga = rd8(`${GOLD}.act`), gh = rd8(`${GOLD}.half`), gsl = rd8(`${GOLD}.slope`);
  const gw = rd16(`${GOLD}.wal`), gl = rd8(`${GOLD}.liq`), glt = rd8(`${GOLD}.lty`);
  const jtRaw = rd16(`${JSD}/base_type.bin`);
  const jf = rd8(`${JSD}/base_flags.bin`);
  const jfx = rd16(`${JSD}/base_frameX.bin`), jfy = rd16(`${JSD}/base_frameY.bin`);
  const jh = rd8(`${JSD}/base_half.bin`), jslope = rd8(`${JSD}/base_slope.bin`);
  const jw = rd16(`${JSD}/base_wall.bin`), jl = rd8(`${JSD}/base_liquid.bin`), jlt = rd8(`${JSD}/base_liquidType.bin`);

  const famCount = new Map<string, number>();
  const firstByFam = new Map<string, { x: number; y: number }>();
  const yHist = new Map<number, number>();
  const rows: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = (ga[i] & 1) !== 0, ja = (jf[i] & 1) !== 0;
    const vt = va ? gt[i] : 0;
    const jt = ja ? (SHEET[jtRaw[i]] >= 0 ? SHEET[jtRaw[i]] : 9999) : 0;
    if (vt === jt && va === ja) continue;
    const x = i % W, y = (i / W) | 0;
    const key = `${vt}>${jt}`;
    famCount.set(key, (famCount.get(key) ?? 0) + 1);
    if (!firstByFam.has(key)) firstByFam.set(key, { x, y });
    const band = Math.floor(y / 100) * 100;
    yHist.set(band, (yHist.get(band) ?? 0) + 1);
    if (rows.length < 400000) rows.push(`(${x},${y}) x86=${va ? `t${vt} fx- fy- h${gh[i]} s${gsl[i]} w${gw[i]} l${gl[i]}/${glt[i]}` : 'off'} js=${ja ? `t${jt} fx${jfx[i]}/18=${Math.floor(jfx[i] / 18)} fy${jfy[i]}/18=${Math.floor(jfy[i] / 18)} h${jh[i]} s${jslope[i]} w${jw[i]} l${jl[i]}/${jlt[i]}` : 'off'}`);
  }

  console.log(`[i214d] diff cells: ${rows.length}`);
  console.log('[i214d] top families (x86T>jsT):');
  for (const [k, c] of [...famCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    const f = firstByFam.get(k)!;
    console.log(`  ${k.padEnd(12)} ×${c}   first=(${f.x},${f.y})`);
  }
  console.log('[i214d] y-band dist:');
  console.log([...yHist.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => `  y${b}..: ${c}`).join('\n'));

  // 85/28 分面精确统计（重扫 diff，用原始数组）
  const stat = (t: number) => {
    let xo = 0, jo = 0, minI = Infinity, minY = Infinity, maxY = -1;
    for (let i = 0; i < N; i++) {
      const va = (ga[i] & 1) !== 0, ja = (jf[i] & 1) !== 0;
      const vt = va ? gt[i] : 0;
      const jt = ja ? (SHEET[jtRaw[i]] >= 0 ? SHEET[jtRaw[i]] : 9999) : 0;
      if (vt === jt && va === ja) continue;
      if (vt !== t && jt !== t) continue;
      if (vt === t) xo++;
      if (jt === t) jo++;
      const x = i % W, y = (i / W) | 0;
      if (i < minI) { minI = i; }
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      void x;
    }
    return { x86side: xo, jsside: jo, minI, minCell: minI === Infinity ? '-' : `(${minI % W},${(minI / W) | 0})`, minY, maxY };
  };
  console.log('[i214d] tombstone(85):', JSON.stringify(stat(85)));
  console.log('[i214d] pot(28):', JSON.stringify(stat(28)));
  console.log('[i214d] gold totals: t28=', countOf(gt, ga, 28), ' t85=', countOf(gt, ga, 85));
  console.log('[i214d] js totals  : t28=', countOfJ(28), ' t85=', countOfJ(85));

  function countOf(arr: Uint16Array, act: Uint8Array, t: number) {
    let c = 0;
    for (let i = 0; i < N; i++) if ((act[i] & 1) !== 0 && arr[i] === t) c++;
    return c;
  }
  function countOfJ(t: number) {
    let c = 0;
    for (let i = 0; i < N; i++) if ((jf[i] & 1) !== 0 && SHEET[jtRaw[i]] === t) c++;
    return c;
  }

  if (process.env.SW_I214_DUMP) {
    writeFileSync(process.env.SW_I214_DUMP, rows.join('\n') + '\n');
    console.log(`[i214d] diffs -> ${process.env.SW_I214_DUMP}`);
  }
});
