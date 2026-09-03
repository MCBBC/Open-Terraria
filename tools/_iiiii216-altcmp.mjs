// ★IIIII216 一次性取证:SW_ALT(x86 run.log m/f 行)↔JS(SW_HM_ALT_STATS log)回填段序列对齐。
// 用法: node tools/_iiiii216-altcmp.mjs <x86run.log> <jsConsoleLog或"-"(stdin)>
// 输出: 双侧 attempts/match/floods/ok 汇总 + 首个分歧行。
import { readFileSync } from 'node:fs';

const x86Path = process.argv[2] ?? '/tmp/hm1458-rig/out/alt216b/run.log';
const jsPath = process.argv[3] ?? '-';

const xM = [], xF = [];
for (const line of readFileSync(x86Path, 'utf8').split('\n')) {
  let m = /^SW_ALT: m (\d+) (\d+),(\d+) t(\d+) w(\d+)/.exec(line);
  if (m) { xM.push({ a: +m[1], x: +m[2], y: +m[3], t: +m[4], w: +m[5] }); continue; }
  m = /^SW_ALT: f (\d+) (\d+),(\d+) n(\d+) c(\w+) (OK|FAIL)/.exec(line);
  if (m) { xF.push({ a: +m[1], x: +m[2], y: +m[3], n: +m[4], c: m[5] === 'true', ok: m[6] === 'OK' }); }
}
const xDone = /SW_ALT: done attempts=(\d+) match=(\d+) floods=(\d+) ok=(\d+)/.exec(readFileSync(x86Path, 'utf8'));

let jsLog = '';
if (jsPath === '-') jsLog = readFileSync(0, 'utf8');
else jsLog = readFileSync(jsPath, 'utf8');
const jLine = /attempts=(\d+) successes=(\d+) c15000=(\d+) floods=(\d+) budgetLeft=(\d+) samples=(\[[^\]]*\])/.exec(jsLog);
const jSucc = [];
if (jLine) for (const m of jLine[6].matchAll(/(\d+): (\d+),(\d+) w(\d+) n(\d+)/g)) {
  jSucc.push({ a: +m[1], x: +m[2], y: +m[3], w: +m[4], n: +m[5] });
}

console.log('== x86 SW_ALT ==');
if (xDone) console.log(`attempts=${xDone[1]} match=${xDone[2]} floods=${xDone[3]} ok=${xDone[4]}  (账: 2A+M=${2 * +xDone[1] + +xDone[2]} vs 实测 179442)`);
else console.log('done 行缺失', xM.length, xF.length);
console.log(`m 行=${xM.length} f 行=${xF.length}  ok=${xF.filter(f => f.ok).length}`);
console.log('== JS ==');
if (jLine) console.log(`attempts=${jLine[1]} successes=${jLine[2]} c15000=${jLine[3]} floods=${jLine[4]}  (账: 2A+M 待定)  成功斑=${jSucc.length}`);
else console.log('JS log 无 ALT 行');

// 成功斑序对齐(两侧按出现序)
console.log('== 成功斑序对照(x86 f OK vs JS samples) ==');
const xOk = xF.filter(f => f.ok);
const n = Math.max(xOk.length, jSucc.length);
let firstDiv = -1;
for (let i = 0; i < n; i++) {
  const x = xOk[i], j = jSucc[i];
  const same = x && j && x.x === j.x && x.y === j.y && x.n === j.n;
  if (!same && firstDiv < 0) firstDiv = i;
  console.log(`#${i + 1} x86=${x ? `${x.a}@${x.x},${x.y} n${x.n}` : '(none)'}  js=${j ? `${j.a}@${j.x},${j.y} n${j.n}` : '(none)'}  ${same ? '=' : 'DIFF'}`);
  if (i > (firstDiv >= 0 ? firstDiv + 6 : 30)) break;
}
