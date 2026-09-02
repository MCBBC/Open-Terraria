// 收敛矩阵对拍（#22）：/tmp/vserver/ 下 server 世界头部 vs oracle terrain 行。
// 用法：zsh tools/convergence-matrix.sh gen <seeds...> 先采集，再 npx vitest run 本文件。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用

(RUN ? it : it.skip)('convergence matrix compare', () => {
  const seeds = readdirSync('/tmp/vserver')
    .filter((f) => /^s\d+\.wld$/.test(f))
    .map((f) => f.replace(/^s(\d+)\.wld$/, '$1'))
    .sort();
  if (!seeds.length) { console.log('无采集数据：先跑 tools/convergence-matrix.sh gen <seeds>'); return; }
  let allOk = true;
  for (const s of seeds) {
    let oTxt = '';
    try { oTxt = readFileSync(`/tmp/vserver/oracle_${s}.txt`, 'utf8'); } catch { /* 未采集 */ }
    const m = oTxt.match(/terrain ok: worldSurface=(\d+) rockLayer=(\d+)/);
    if (!m) { console.log(`seed=${s}: oracle 输出缺失/超时`); allOk = false; continue; }
    const [ows, orl] = [Number(m[1]), Number(m[2])].map(Number);
    const om = oTxt.match(/RESETVALS worldId=(-?\d+) .*moon=(-?\d+)/);
    const oid = Number(om?.[1]), omoon = Number(om?.[2]);
    const w = parseWld(new Uint8Array(readFileSync(`/tmp/vserver/s${s}.wld`)));
    const idOk = w.worldId === oid, moonOk = w.moonType === omoon;
    const dWs = w.groundLevel - ows, dRl = w.rockLevel - orl;
    const ok = idOk && moonOk && dWs === 0 && dRl === 0;
    if (!ok) allOk = false;
    console.log(`seed=${s}: vanilla(${w.groundLevel},${w.rockLevel}) oracle(${ows},${orl}) Δws=${dWs} Δrl=${dRl} idOk=${idOk} moonOk=${moonOk} ${ok ? '✓' : '✗'}`);
  }
  console.log(allOk ? 'MATRIX-ALL-GREEN' : 'MATRIX-HAS-DIFF');
});
