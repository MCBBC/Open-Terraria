// ★IIIII213 一次性仪⑪：锚梯首分歧定位——逐锚 chk/skp/buffer/world-liq 对拍。
// 用法：cd game && SW_I213LAD=1 npx vitest run tools/_iii213ladder.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const OUT = '/tmp/iii213-out';
const W = 4200, H = 1200;
const ANCHORS = [8, 18, 28, 38, 48, 58, 68, 77, 78];
it('iii213 anchor ladder', () => {
  for (const a of ANCHORS) {
    const kc = readFileSync(`${OUT}/x86-iter1/K.chk-${a}`), jc = readFileSync(`${OUT}/jdump1/K.chk-${a}`);
    let dChk = 0; const chk: string[] = [];
    for (let i = 0; i < W * H; i++) if (kc[i] !== jc[i]) { dChk++; if (chk.length < 6) chk.push(`(${i % W},${(i / W) | 0})k${kc[i]}/j${jc[i]}`); }
    const ks = readFileSync(`${OUT}/x86-iter1/K.skp-${a}`), jsn = readFileSync(`${OUT}/jdump1/K.skp-${a}`);
    let dSkp = 0; const skp: string[] = [];
    for (let i = 0; i < W * H; i++) if (ks[i] !== jsn[i]) { dSkp++; if (skp.length < 6) skp.push(`(${i % W},${(i / W) | 0})k${ks[i]}/j${jsn[i]}`); }
    // world liq
    const kl = readFileSync(`${OUT}/x86-iter1/K.liq-${a}`), jl = readFileSync(`${OUT}/jdump1/K.liq-${a}`);
    let dL = 0; const lc: string[] = [];
    for (let i = 0; i < W * H; i++) if (kl[i] !== jl[i]) { dL++; if (lc.length < 6) lc.push(`(${i % W},${(i / W) | 0})k${kl[i]}/j${jl[i]}`); }
    // buffer 全序
    let bufDiff = -1, bufN = 0;
    try {
      const kb = readFileSync(`${OUT}/x86-iter1/buffer-${a}.txt`, 'utf8').replace(/\r/g, '').split('\n').filter(l => l && !l.startsWith('#'));
      const jbRaw = readFileSync(`${OUT}/j-entries-${a}.txt`, 'utf8').split('\n');
      const bStart = jbRaw.findIndex(l => l.startsWith('# buf'));
      const jb = jbRaw.slice(bStart + 1).filter(l => l.startsWith('B ')).map(l => l.split(' ').slice(2).join(','));
      const kset = kb.map(l => l.split(' ').slice(1).join(','));
      bufN = kset.length;
      const n = Math.min(kset.length, jb.length);
      for (let i = 0; i < n; i++) if (kset[i] !== jb[i]) { bufDiff = i; break; }
      if (bufDiff < 0 && kset.length !== jb.length) bufDiff = n;
    } catch { bufDiff = -2; }
    console.log(`a${a}: dChk=${dChk}[${chk.slice(0, 3).join(' ')}] dSkp=${dSkp}[${skp.slice(0, 3).join(' ')}] dL=${dL}[${lc.slice(0, 3).join(' ')}] bufN=${bufN} bufFirstDiff=${bufDiff}`);
  }
});
