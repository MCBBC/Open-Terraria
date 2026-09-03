// ★IIIII213 一次性仪⑩：buffer 全序 + checking/skip 位图对拍（x86 扩展 dump vs JS）。
// 用法：cd game && SW_I213BUF=1 npx vitest run tools/_iii213buf.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const OUT = '/tmp/iii213-out';
const W = 4200, H = 1200;
it('iii213 buffer/chk/skp diff', () => {
  for (const anchor of [77, 78]) {
    const kb = readFileSync(`${OUT}/x86-iter1/buffer-${anchor}.txt`, 'utf8').replace(/\r/g, '').split('\n').filter(l => l && !l.startsWith('#'));
    const jbRaw = readFileSync(`${OUT}/j-entries-${anchor}.txt`, 'utf8').split('\n');
    const bStart = jbRaw.findIndex(l => l.startsWith('# buf'));
    const jb = jbRaw.slice(bStart + 1).filter(l => l.startsWith('B ')).map(l => l.split(' ').slice(2).join(','));
    const kset = kb.map(l => l.split(' ').slice(1).join(','));
    console.log(`[a${anchor}] buffer: x86=${kset.length} js=${jb.length}`);
    let firstBuf = -1;
    const n = Math.min(kset.length, jb.length);
    for (let i = 0; i < n; i++) if (kset[i] !== jb[i]) { firstBuf = i; break; }
    if (firstBuf < 0) console.log(`  前 ${n} 全序全等${kset.length === jb.length ? '' : `（长度差 ${kset.length - jb.length}）`}`);
    else {
      console.log(`  首个次序分歧 #${firstBuf + 1}: x86=${kset[firstBuf]} js=${jb[firstBuf]}`);
      const ksetS = new Set(kset), jbS = new Set(jb);
      const onlyK = kset.filter(x => !jbS.has(x)), onlyJ = jb.filter(x => !ksetS.has(x));
      console.log(`  集合差: only-x86=${onlyK.length} [${onlyK.slice(0, 8).join(' ')}] only-js=${onlyJ.length} [${onlyJ.slice(0, 8).join(' ')}]`);
    }
    // chk/skp 位图
    const kc = readFileSync(`${OUT}/x86-iter1/K.chk`), jc = readFileSync(`${OUT}/jdump1/K.chk-${anchor}`);
    let dChk = 0; const chkCells: string[] = [];
    for (let i = 0; i < W * H; i++) if (kc[i] !== jc[i]) { dChk++; if (chkCells.length < 12) chkCells.push(`(${i % W},${(i / W) | 0})k${kc[i]}/j${jc[i]}`); }
    console.log(`  checking bit diff=${dChk} ${chkCells.join(' ')}`);
    const ks = readFileSync(`${OUT}/x86-iter1/K.skp`), jsn = readFileSync(`${OUT}/jdump1/K.skp-${anchor}`);
    let dSkp = 0; const skpCells: string[] = [];
    for (let i = 0; i < W * H; i++) if (ks[i] !== jsn[i]) { dSkp++; if (skpCells.length < 8) skpCells.push(`(${i % W},${(i / W) | 0})k${ks[i]}/j${jsn[i]}`); }
    console.log(`  skip bit diff=${dSkp} ${skpCells.join(' ')}`);
  }
});
