import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const OPS: Record<number, number> = {
  0x01: 2, 0x02: 3, 0x03: 3, 0x04: 4, 0x05: 3, 0x06: 2, 0x07: 2, 0x08: 3, 0x0A: 3, 0x0B: 3,
  0x12: 4, 0x13: 2, 0x1F: 2, 0x20: 3, 0x23: 2, 0x42: 3, 0x51: 5, 0x58: 4, 0x5A: 4,
};
const SWZ = ['x','y','z','w'];
const fileOf = (t:number)=>((t>>28)&7)|((t>>8)&0x18);
const regOf = (t:number)=>t&0x7FF;
const REG=['r','v','c','t','rast','attr','o','oC','oDepth'];
function srcS(tok:number){const sw=(tok>>16)&0xFF;const s=[sw&3,(sw>>2)&3,(sw>>4)&3,(sw>>6)&3];
  const sm=(tok>>24)&0xF;const mod=sm===1?'-':'';
  const uniq=s.every(c=>c===s[0]);return mod+`${REG[fileOf(tok)]??'?'}${regOf(tok)}`+(uniq?(s[0]===0?'':'.'+SWZ[s[0]]):'.'+s.map(c=>SWZ[c]).join(''));}
it('trace obj19', () => {
  const j = JSON.parse(readFileSync('/tmp/fxScreenShader.json', 'utf8'));
  const p = j.passes.find((x: any) => x.pass === 'FilterWaterDistortion');
  const toks = p.tokens;
  const r: number[][] = Array.from({length: 8}, () => [0,0,0,0]);
  const c: number[][] = Array.from({length: 24}, () => [0,0,0,0]);
  const t: number[][] = Array.from({length: 4}, () => [0,0,0,0]);
  // t0 = 屏幕像素坐标假设(700,400); v0..v3 = 顶点色(白)
  t[0] = [700, 400, 0, 0];
  const v = [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]];
  // 常量手动注入(preshader 摩擦绕行):
  c[0] = [1/256, 1/256, 0, 0];        // rcp(uImageSize1) 噪声
  c[1] = [4, 0, 0, 0];                // +prog·0.04 (prog=100)
  c[2] = [-4, 0, 0, 0];               // −prog·0.04
  c[3] = [1/378, 1/216, 0, 0];        // rcp(uImageSize2) 波缓冲
  c[5] = [1, 1, 0, 0];                // uOpacity(1)
  c[6] = [1/378, 1/216, 0, 0];        // rcp(uImageSize3)
  c[7] = [1512, 862, 0, 0];           // uScreenResolution
  c[8] = [0, 0, 0, 0];                // uScreenPosition
  c[9] = [0, 0, 0, 0];                // uTargetPosition
  c[10] = [1.2, 0, 0, 0];             // uIntensity
  c[11] = [0, 0, 0, 0];               // uImageOffset
  const sampLog: string[] = [];
  const samp = (i: number) => (u: number, vv: number): number[] => {
    sampLog.push(`s${i}(${u.toFixed(4)},${vv.toFixed(4)})`);
    // 各通道独立可辨: R=0.1 G=0.2 B=0.3 A=0.4 + sampler index 扰动
    const base = 0.1 * (i + 1);
    return [base, base + 0.05, base + 0.1, 0.5 + 0.1 * i];
  };
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
  let i = 0; let n = 0; const lines: string[] = [];
  while (i < toks.length) {
    const tok = toks[i++]; const op = tok & 0xFFFF;
    if (op === 0xFFFF) break;
    const nOps = OPS[op]; if (nOps === undefined) { lines.push(`?? 0x${op.toString(16)}`); break; }
    const raw = toks.slice(i, i + nOps); i += nOps;
    if (op === 0x51) {
      const vals = [1,2,3,4].map(kk=>{const b=new ArrayBuffer(4);const dv=new DataView(b);dv.setUint32(0, raw[kk]>>>0, true);return dv.getFloat32(0,true);});
      if (fileOf(raw[0])===2) c[regOf(raw[0])] = vals;
      n++; continue;
    }
    if (op === 0x1F) { n++; continue; }
    const dstTok = raw[0]; const wm = (dstTok >> 16) & 0xF;
    const dArr = fileOf(dstTok) === 0 ? r[regOf(dstTok)] : r[0];
    const w = (vals: number[]) => { for (let k = 0; k < 4; k++) if (wm & (1 << k)) dArr[k] = vals[k]; };
    const srcTxt = raw.slice(1).map(srcS).join(', ');
    switch (op) {
      case 0x01: w([0,1,2,3].map(k=>get(raw[1],k))); lines.push(`#${n} mov → r0=[${r[0]}] r1=[${r[1]}] r2=[${r[2]}] r3=[${r[3]}]`); break;
      case 0x02: w([0,1,2,3].map(k=>get(raw[1],k)+get(raw[2],k))); lines.push(`#${n} add ${srcTxt} → r0=[${r[0].map(x=>x.toFixed(3))}] r1=[${r[1].map(x=>x.toFixed(3))}] r2=[${r[2].map(x=>x.toFixed(3))}] r3=[${r[3].map(x=>x.toFixed(3))}]`); break;
      case 0x04: w([0,1,2,3].map(k=>get(raw[1],k)*get(raw[2],k)+get(raw[3],k))); lines.push(`#${n} mad ${srcTxt} → r0=[${r[0].map(x=>x.toFixed(3))}] r1=[${r[1].map(x=>x.toFixed(3))}] r2=[${r[2].map(x=>x.toFixed(3))}] r3=[${r[3].map(x=>x.toFixed(3))}]`); break;
      case 0x05: w([0,1,2,3].map(k=>get(raw[1],k)*get(raw[2],k))); lines.push(`#${n} mul ${srcTxt} → r0=[${r[0].map(x=>x.toFixed(3))}] r1=[${r[1].map(x=>x.toFixed(3))}] r2=[${r[2].map(x=>x.toFixed(3))}] r3=[${r[3].map(x=>x.toFixed(3))}]`); break;
      case 0x06: w([0,1,2,3].map(k=>1/get(raw[1],k))); break;
      case 0x07: w([0,1,2,3].map(k=>1/Math.sqrt(get(raw[1],k)))); break;
      case 0x08: { const d = get(raw[1],0)*get(raw[2],0)+get(raw[1],1)*get(raw[2],1)+get(raw[1],2)*get(raw[2],2); w([d,d,d,d]); break; }
      case 0x0A: w([0,1,2,3].map(k=>Math.min(get(raw[1],k),get(raw[2],k)))); break;
      case 0x0B: w([0,1,2,3].map(k=>Math.max(get(raw[1],k),get(raw[2],k)))); break;
      case 0x12: w([0,1,2,3].map(k=>get(raw[1],k)*get(raw[3],k)+(1-get(raw[1],k))*get(raw[2],k))); break;
      case 0x13: w([0,1,2,3].map(k=>get(raw[1],k)-Math.floor(get(raw[1],k)))); break;
      case 0x23: w([0,1,2,3].map(k=>Math.abs(get(raw[1],k)))); break;
      case 0x42: { const res = samp(get(raw[2],0) & 7)(get(raw[1],0), get(raw[1],1)); w(res); lines.push(`#${n} texld s${get(raw[2],0)&7} @(${get(raw[1],0).toFixed(4)},${get(raw[1],1).toFixed(4)}) → r${regOf(dstTok)}=[${res.map(x=>x.toFixed(3))}]`); break; }
      case 0x58: w([0,1,2,3].map(k=>get(raw[1],k)>=0?get(raw[2],k):get(raw[3],k))); break;
      case 0x5A: { const d = get(raw[1],0)*get(raw[2],0)+get(raw[1],1)*get(raw[2],1)+get(raw[3],0); w([d,d,d,d]); lines.push(`#${n} dp2add ${srcTxt} → ${d.toFixed(4)}`); break; }
    }
    n++;
  }
  console.log(lines.join('\n'));
  console.log('SAMPLES:', sampLog.join(' | '));
  console.log('FINAL r0', r[0], 'r3', r[3]);
});
