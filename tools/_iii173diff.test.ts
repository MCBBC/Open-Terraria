// IIII173 批一次性对拍：JS/oracle 裸网格 dump 十通道逐格 diff（internal id → vanilla sheet 映射）
// 用法：cd game && SW_173D_RUN=1 npx vitest run tools/_iii173diff.test.ts
// 可调 env：SW_173D_JS（js dump 前缀，默认 /tmp/iii173-out/js-livingtrees）
//          SW_173D_OR（oracle dump 前缀，默认 /tmp/iii173-out/or-lt）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = !!process.env.SW_173D_RUN;
const JS = process.env.SW_173D_JS ?? '/tmp/iii173-out/js-livingtrees';
const OR = process.env.SW_173D_OR ?? '/tmp/iii173-out/or-lt';
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('iii173 grid diff', () => {
  const rd = (p: string) => readFileSync(p);
  const le16 = (b: Buffer) => new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const jT = le16(rd(`${JS}.typ`)), jA = rd(`${JS}.act`), jW = le16(rd(`${JS}.wal`)), jL = rd(`${JS}.liq`),
    jH = rd(`${JS}.half`), jS = rd(`${JS}.slope`), jLt = rd(`${JS}.lty`);
  const oT = le16(rd(`${OR}.typ`)), oA = rd(`${OR}.act`), oW = le16(rd(`${OR}.wal`)), oL = rd(`${OR}.liq`),
    oH = rd(`${OR}.half`), oS = rd(`${OR}.slope`), oLt = rd(`${OR}.lty`);
  const ch: Record<string, number[]> = { typ: [], act: [], wal: [], liq: [], half: [], slope: [], lty: [] };
  for (let i = 0; i < N; i++) {
    // JS: flags bit0=active；oracle act 0/1。JS 幽灵 type 直接比（oracle 无幽灵域——act=0 时 typ 已清）
    const jt = jA[i] ? SHEET[jT[i]] : 0;
    const ot = oA[i] ? oT[i] : 0;
    if (jt !== ot) ch.typ.push(i);
    if ((jA[i] ? 1 : 0) !== oA[i]) ch.act.push(i);
    if (jW[i] !== oW[i]) ch.wal.push(i);
    if (jL[i] !== oL[i]) ch.liq.push(i);
    if ((jH[i] ? 1 : 0) !== oH[i]) ch.half.push(i);
    if (jS[i] !== oS[i]) ch.slope.push(i);
    if ((jLt[i] - 1) !== oLt[i]) ch.lty.push(i);
  }
  for (const [k, v] of Object.entries(ch)) {
    console.log(`III173D ${k}: ${v.length}`);
    for (const i of v.slice(0, 40)) {
      const x = i % W, y = (i / W) | 0;
      const jt = jA[i] ? SHEET[jT[i]] : 0, ot = oA[i] ? oT[i] : 0;
      console.log(`   (${x},${y}) js t${jt}/a${jA[i] ? 1 : 0}/fx${le16(rd(`${JS}.frx`))[i]}/fy${le16(rd(`${JS}.fry`))[i]} | or t${ot}/a${oA[i]}/fx${le16(rd(`${OR}.frx`))[i]}/fy${le16(rd(`${OR}.fry`))[i]}`);
    }
  }
}, 300000);
