import { it } from 'vitest';
import fx from '../src/data/fxPixelShader.json';
const OPS: Record<number, number> = {
  0x01: 2, 0x02: 3, 0x03: 3, 0x04: 4, 0x05: 3, 0x06: 2, 0x07: 2, 0x08: 3, 0x0B: 3,
  0x0E: 2, 0x13: 2, 0x1F: 2, 0x23: 2, 0x24: 2, 0x42: 3, 0x51: 5, 0x58: 4, 0x5A: 4,
};
const SWZ = ['x','y','z','w'];
const fileOf = (t:number)=>((t>>28)&7)|((t>>8)&0x18);
const regOf = (t:number)=>t&0x7FF;
const REG=['r','v','c','t','rast','attr','o','oC','oDepth'];
function dstS(tok:number){const wm=(tok>>16)&0xF;return `${REG[fileOf(tok)]??'?'}${regOf(tok)}.`+['x','y','z','w'].filter((_,i)=>wm&(1<<i)).join('');}
function srcS(tok:number){const sw=(tok>>16)&0xFF;const s=[sw&3,(sw>>2)&3,(sw>>4)&3,(sw>>6)&3];
  const sm=(tok>>24)&0xF;const mod=sm===1?'-':'';
  const uniq=s.every(c=>c===s[0]);const f=fileOf(tok);
  return mod+`${REG[f]??'?'}${regOf(tok)}`+(uniq?(s[0]===0?'':'.'+SWZ[s[0]]):'.'+s.map(c=>SWZ[c]).join(''));}
it('disasm horizon tail', () => {
  const p = (fx as any).passes.find((x: any) => x.pass === 'HorizonClouds');
  const toks = p.tokens;
  let i = 0; let n = 0; const lines: string[] = [];
  while (i < toks.length) {
    const tok = toks[i++]; const op = tok & 0xFFFF;
    if (op === 0xFFFF) break;
    const nOps = OPS[op]; if (nOps === undefined) { lines.push(`?? op 0x${op.toString(16)}`); break; }
    const raw = toks.slice(i, i + nOps); i += nOps;
    if (op === 0x51) { const f = [1,2,3,4].map(k=>{const b=new ArrayBuffer(4);const dv=new DataView(b);dv.setUint32(0, raw[k]>>>0, true);return dv.getFloat32(0,true);});
      lines.push(`def ${dstS(raw[0])} [${f.join(', ')}]`); n++; continue; }
    if (op === 0x1F) { n++; continue; }
    const nm: Record<number,string> = {0x01:'mov',0x02:'add',0x03:'sub',0x04:'mad',0x05:'mul',0x06:'rcp',0x07:'rsq',0x08:'dp3',0x0B:'max',0x0E:'exp',0x13:'frc',0x23:'abs',0x24:'nrm',0x42:'texld',0x58:'cmp',0x5A:'dp2add'};
    lines.push(`#${n} ${nm[op] ?? 'op'+op.toString(16)} ${dstS(raw[0])}, ${raw.slice(1).map(srcS).join(', ')}`);
    n++;
  }
  console.log(lines.join('\n'));
});
