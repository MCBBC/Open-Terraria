import { it } from 'vitest';
import fx from '../src/data/fxPixelShader.json';
const OPS: Record<number, number> = {
  0x01: 2, 0x02: 3, 0x04: 4, 0x05: 3, 0x06: 2, 0x07: 2, 0x0B: 3, 0x13: 2,
  0x1F: 2, 0x42: 3, 0x51: 5, 0x58: 4, 0x5A: 4,
};
const SWZ = ['x','y','z','w'];
const fileOf = (t:number)=>((t>>28)&7)|((t>>8)&0x18);
const regOf = (t:number)=>t&0x7FF;
const REG=['r','v','c','t','rast','attr','o','oC','oDepth'];
const sz = (x:number)=>x.toFixed(4);
it('trace horizon', () => {
  const p = (fx as any).passes.find((x: any) => x.pass === 'HorizonClouds');
  const toks = p.tokens;
  // registers
  const r: number[][] = Array.from({length: 8}, () => [0,0,0,0]);
  const c: number[][] = Array.from({length: 12}, () => [0,0,0,0]);
  const t: number[][] = Array.from({length: 4}, () => [0,0,0,0]);
  t[0] = [0.4, 0.4, 0, 0];
  t[1] = [120, 55, 0, 0];
  const v = [[0.6, 0.62, 0.68, 0.9]];
  // uniforms
  c[0] = [1, 0.9647, 0.8, 0];
  c[1] = [100, 50, 0, 0];
  c[2] = [200, 60, 0.8, 0];
  const samp = (u: number, vv: number) => [1, 1, 1, 1] as number[];
  const get = (tok: number, k: number): number => {
    const f = fileOf(tok), rg = regOf(tok);
    const sw = (tok >> 16) & 0xFF;
    const comp = [sw & 3, (sw >> 2) & 3, (sw >> 4) & 3, (sw >> 6) & 3][k];
    let val: number;
    if (f === 0) val = r[rg][comp];
    else if (f === 1) val = (v[rg] ?? [0,0,0,0])[comp];
    else if (f === 2) val = c[rg][comp];
    else if (f === 3) val = t[rg][comp];
    else val = 0;
    const sm = (tok >> 24) & 0xF;
    return sm === 1 ? -val : val;
  };
  let i = 0; let n = 0;
  const fmt = (arr: number[]) => arr.map(sz).join(',');
  while (i < toks.length) {
    const tok = toks[i++]; const op = tok & 0xFFFF;
    if (op === 0xFFFF) break;
    const nOps = OPS[op]; if (nOps === undefined) break;
    const raw = toks.slice(i, i + nOps); i += nOps;
    if (op === 0x51) {
      const dstTok = raw[0]; const f = fileOf(dstTok);
      const vals = [1,2,3,4].map(kk=>{const b=new ArrayBuffer(4);const dv=new DataView(b);dv.setUint32(0, raw[kk]>>>0, true);return dv.getFloat32(0,true);});
      if (f===2) c[regOf(dstTok)] = vals;
      n++; continue;
    }
    if (op === 0x1F) { n++; continue; }
    const dstTok = raw[0]; const wm = (dstTok >> 16) & 0xF;
    const dArr = fileOf(dstTok) === 0 ? r[regOf(dstTok)] : t[0];
    const w = (vals: number[]) => { for (let k = 0; k < 4; k++) if (wm & (1 << k)) dArr[k] = vals[k]; };
    let desc = '';
    switch (op) {
      case 0x01: w([0,1,2,3].map(k=>get(raw[1],k))); desc='mov'; break;
      case 0x02: w([0,1,2,3].map(k=>get(raw[1],k)+get(raw[2],k))); desc='add'; break;
      case 0x04: w([0,1,2,3].map(k=>get(raw[1],k)*get(raw[2],k)+get(raw[3],k))); desc='mad'; break;
      case 0x05: w([0,1,2,3].map(k=>get(raw[1],k)*get(raw[2],k))); desc='mul'; break;
      case 0x06: w([0,1,2,3].map(k=>1/get(raw[1],k))); desc='rcp'; break;
      case 0x07: w([0,1,2,3].map(k=>1/Math.sqrt(get(raw[1],k)))); desc='rsq'; break;
      case 0x0B: w([0,1,2,3].map(k=>Math.max(get(raw[1],k),get(raw[2],k)))); desc='max'; break;
      case 0x13: w([0,1,2,3].map(k=>get(raw[1],k)-Math.floor(get(raw[1],k)))); desc='frc'; break;
      case 0x42: { const res = samp(get(raw[1],0), get(raw[1],1)); w(res); desc='texld'; break; }
      case 0x58: w([0,1,2,3].map(k=>get(raw[1],k)>=0?get(raw[2],k):get(raw[3],k))); desc='cmp'; break;
      case 0x5A: { const d = get(raw[1],0)*get(raw[2],0)+get(raw[1],1)*get(raw[2],1)+get(raw[3],0); w([d,d,d,d]); desc='dp2add'; break; }
    }
    if (n >= 18) console.log(`#${n} ${desc} → r0=[${fmt(r[0])}] r1=[${fmt(r[1])}]`);
    n++;
  }
  console.log('FINAL r0', fmt(r[0]), 'r1', fmt(r[1]));
});
