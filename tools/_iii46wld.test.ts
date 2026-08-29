// IIIII46（celebrationmk10 T2→T1）一次性诊断：
// 1) 插桩中立性门槛——无插桩 clean 存档(.wld 解析平面) ≡ 插桩 fresh 的 #105 dump 八通道
//    （act/typ[仅活性]/wal/liq/lty(+1基)/half/slope/inact(wire>>>5)+paint 双通道仅存档↔存档比对）。
// 2) 归档污染链量化：arm64 污染归档 w.wld（sw-slp/g1458-celeb）与 x86-true fresh 终态差异计数。
// 用法：cd game && SW_I46=1 npx vitest run tools/_iii46wld.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_I46 === '1';

function ch(m8dumpDir: string, slotName: string) {
  const p = `${m8dumpDir}/105_${slotName}`;
  return {
    t: new Uint16Array(readFileSync(`${p}.typ`).buffer),
    a: readFileSync(`${p}.act`),
    w: new Uint16Array(readFileSync(`${p}.wal`).buffer),
    l: readFileSync(`${p}.liq`),
    lt: readFileSync(`${p}.lty`),
    hf: readFileSync(`${p}.half`),
    sl: readFileSync(`${p}.slope`),
    ia: readFileSync(`${p}.inact`),
  };
}

(RUN ? it : it.skip)('I46 neutrality gate', async () => {
  const DIRS = {
    fresh: '/tmp/iii48-out/x86-celeb-fresh',
    clean: '/tmp/iii48-out/x86-celeb-clean',
    polluted: '/tmp/sw-slp/g1458-celeb',
  };
  // slot 名取自 pc.txt（105 行名含空格→文件名下划线）。先读行确认。
  const pc = readFileSync(`${DIRS.fresh}/pc.txt`, 'utf8').trimEnd().split('\n');
  const last = pc[pc.length - 1]!;
  console.log('pc last:', last);
  const slotNameForFile = (dir: string) => {
    const rows = readFileSync(`${dir}/pc.txt`, 'utf8').trimEnd().split('\n');
    const nm = rows[rows.length - 1]!.split('|')[2]!;
    return nm.replace(/ /g, '_');
  };
  const dF = ch(DIRS.fresh, slotNameForFile(DIRS.fresh));
  const wf = parseWld(Uint8Array.from(readFileSync(`${DIRS.fresh}/w.wld`)));
  const wc = parseWld(Uint8Array.from(readFileSync(`${DIRS.clean}/w.wld`)));
  const wp = parseWld(Uint8Array.from(readFileSync(`${DIRS.polluted}/w.wld`)));
  console.log(`dims: fresh=${wf.tilesWide}x${wf.tilesHigh} clean=${wc.tilesWide}x${wc.tilesHigh} polluted=${wp.tilesWide}x${wp.tilesHigh}`);
  const W = wf.tilesWide, H = wf.tilesHigh, N = W * H;
  const cmpCount = (n: number): number => {
    let d = 0;
    let dT = 0, dA = 0, dW = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0, dIa = 0, dP = 0, dPw = 0;
    for (let i = 0; i < n; i++) {
      // ---- fresh-dumped (#105 dump) vs clean .wld parsed（中立性）----
      const va = dF.a[i]!, ja = wc.tiles.active[i]! ? 1 : 0;
      if (va !== ja) { dA++; }
      const vt = va ? dF.t[i]! : 0;
      const jt = ja ? wc.tiles.type[i]! : 0;
      if (vt !== jt) { dT++; }
      if (dF.w[i]! !== wc.tiles.wall[i]!) { dW++; }
      if (dF.l[i]! !== wc.tiles.liquid[i]!) { dL++; }
      const vl = dF.l[i]! > 0 ? dF.lt[i]! + 1 : 0;
      const jl = wc.tiles.liquid[i]! > 0 ? wc.tiles.liquidType[i]! : 0;
      if (vl !== jl) { dLt++; }
      if (dF.hf[i]! !== wc.tiles.half[i]!) { dHf++; }
      if (dF.sl[i]! !== wc.tiles.slope[i]!) { dSl++; }
      if ((dF.ia[i]! ? 1 : 0) !== ((wc.tiles.wire[i]! >>> 5) & 1)) { dIa++; }
      if (wc.tiles.paint[i]! !== wf.tiles.paint[i]!) { dP++; }
      if (wc.tiles.paintWall[i]! !== wf.tiles.paintWall[i]!) { dPw++; }
      // ---- 污染归档终态 vs x86-true fresh 终态（通道差计数记录）----
      if (wp.tiles.active[i]! !== wf.tiles.active[i]!) { d++; }
      else if ((wp.tiles.active[i]! ? wp.tiles.type[i]! : 0) !== (wf.tiles.active[i]! ? wf.tiles.type[i]! : 0)) { d++; }
    }
    console.log(`neutrality(dump#105 vs clean.wld): A=${dA} T=${dT} W=${dW} L=${dL} Lt=${dLt} Hf=${dHf} Sl=${dSl} Ia=${dIa}`);
    console.log(`paint(clean.wld vs fresh.wld): P=${dP} Pw=${dPw}`);
    console.log(`polluted-vs-fresh(final active+type差格数)=${d}`);
    return dA + dT + dW + dL + dLt + dHf + dSl + dIa;
  };
  const total = cmpCount(N);
  console.log(`★ neutrality total diffs = ${total} (${total === 0 ? 'PASS' : 'FAIL'})`);
}, 600_000);
