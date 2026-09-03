// IIII198: 金标 dump ↔ JS 槽末快照逐格 diff（含帧解码 frameX/18=num7+Next(3) 还原骰值）
// 用法：SW_I198_GOLD=<dumpPrefix> SW_I198_JS=<saveDir> npx vitest run tools/_iii198diff.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('iii198 slot diff', () => {
  const GOLD = process.env.SW_I198_GOLD ?? '';
  const JSD = process.env.SW_I198_JS ?? '';
  const W = Number(process.env.SW_I198_W ?? 4200), H = Number(process.env.SW_I198_H ?? 1200);
  if (!GOLD || !JSD || !existsSync(`${JSD}/base_type.bin`)) { console.log('[i198d] missing inputs, skip'); return; }
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const N = W * H;
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const gt = rd16(`${GOLD}.typ`), ga = readFileSync(`${GOLD}.act`), gh = readFileSync(`${GOLD}.half`), gs2 = readFileSync(`${GOLD}.slope`);
  const jtRaw = new Uint16Array(readFileSync(`${JSD}/base_type.bin`).buffer);
  const jf = new Uint8Array(readFileSync(`${JSD}/base_flags.bin`).buffer);
  const jfx = new Uint16Array(readFileSync(`${JSD}/base_frameX.bin`).buffer);
  const jfy = new Uint16Array(readFileSync(`${JSD}/base_frameY.bin`).buffer);
  const jh = new Uint8Array(readFileSync(`${JSD}/base_half.bin`).buffer);
  const jslope = new Uint8Array(readFileSync(`${JSD}/base_slope.bin`).buffer);
  const rows: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = (ga[i] & 1) !== 0, ja = (jf[i] & 1) !== 0;
    const vt = va ? gt[i] : 0;
    const jt = ja ? (SHEET[jtRaw[i]] >= 0 ? SHEET[jtRaw[i]] : 9999) : 0;
    if (vt !== jt || va !== ja) {
      const x = i % W, y = (i / W) | 0;
      rows.push(`(${x},${y}) x86=${va ? `t${vt} h${gh[i]} s${gs2[i]}` : 'off'} js=${ja ? `t${jt} fx${jfx[i]}/18=${Math.floor(jfx[i] / 18)} fy${jfy[i]} h${jh[i]} s${jslope[i]}` : 'off'}`);
    }
  }
  console.log(`[i198d] ${GOLD.split('/').pop()} vs ${JSD}: ${rows.length} diff cells`);
  for (const r of rows) console.log('  ' + r);
});
