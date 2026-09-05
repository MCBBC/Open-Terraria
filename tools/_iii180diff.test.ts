// IIII180 批一次性对拍：js-microbiomes vs or-mb 差格分族（name + 位置直方图,seed 9293480）
// 用法：cd game && npx vitest run tools/_iii180diff.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const JS_P = process.env.JS_DIR ?? '/tmp/iii173-out/js-microbiomes';
const OR_P = process.env.OR_DIR ?? '/tmp/iii173-out/or-mb';
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const NAME = new Map<number, string>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!NAME.has(s)) NAME.set(s, TILE_DEFS[i].name ?? String(s)); }
}
const nm = (v: number) => NAME.get(v) ?? (v === 0x7fff ? 'UNKNOWN' : String(v));

it('iii180 diff families', () => {
  const le16 = (b: Buffer) => new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const jT = le16(readFileSync(`${JS_P}.typ`)), jA = readFileSync(`${JS_P}.act`),
    jW = le16(readFileSync(`${JS_P}.wal`)), jL = readFileSync(`${JS_P}.liq`);
  const oT = le16(readFileSync(`${OR_P}.typ`)), oA = readFileSync(`${OR_P}.act`),
    oW = le16(readFileSync(`${OR_P}.wal`)), oL = readFileSync(`${OR_P}.liq`);
  const ch: Record<string, number[]> = { typ: [], act: [], wal: [], liq: [] };
  for (let i = 0; i < N; i++) {
    const jt = jA[i] ? SHEET[jT[i]] : 0;
    const ot = oA[i] ? oT[i] : 0;
    if (jt !== ot) ch.typ.push(i);
    if ((jA[i] ? 1 : 0) !== (oA[i] ? 1 : 0)) ch.act.push(i);
    if (jW[i] !== oW[i]) ch.wal.push(i);
    if (jL[i] !== oL[i]) ch.liq.push(i);
  }
  for (const [k, v] of Object.entries(ch)) console.log(`III180F ${k}: ${v.length}`);
  // typ 差格分族:对(方向 js→or)
  const pair = new Map<string, number>();
  for (const i of ch.typ) {
    const jt = jA[i] ? SHEET[jT[i]] : 0, ot = oA[i] ? oT[i] : 0;
    const key = `${nm(jt)}(${jt})>${nm(ot)}(${ot})`;
    pair.set(key, (pair.get(key) ?? 0) + 1);
  }
  console.log('III180F typ pairs (top 40):');
  for (const [k, v] of [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`   ${v}\t${k}`);
  // 墙差分族
  const wpair = new Map<string, number>();
  for (const i of ch.wal) {
    const key = `W${jW[i]}>${oW[i]}`;
    wpair.set(key, (wpair.get(key) ?? 0) + 1);
  }
  console.log('III180F wall pairs (top 15):');
  for (const [k, v] of [...wpair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`   ${v}\t${k}`);
  // 位置直方图(x/y 各 84/60 桶)
  const hx = new Map<number, number>(), hy = new Map<number, number>();
  for (const i of ch.typ) { const x = i % W, y = (i / W) | 0; hx.set((x / 100) | 0, (hx.get((x / 100) | 0) ?? 0) + 1); hy.set((y / 100) | 0, (hy.get((y / 100) | 0) ?? 0) + 1); }
  console.log('III180F x-hist(100px): ' + [...hx.entries()].sort((a, b) => a[0] - b[0]).map(([b, v]) => `${b * 100}:${v}`).join(' '));
  console.log('III180F y-hist(100px): ' + [...hy.entries()].sort((a, b) => a[0] - b[0]).map(([b, v]) => `${b * 100}:${v}`).join(' '));
}, 300000);
