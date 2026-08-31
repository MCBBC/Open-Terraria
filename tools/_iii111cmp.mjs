// IIII111 双端窗内事件流对拍：rig TRLOG(x86) vs JS ledger(tr-sand-js.log)
// 共同词表：K(x86)/KW(JS)=KillTile 入口；SQF 双方同构。键=<kind> <x> <y>。
import { readFileSync } from 'node:fs';
const WINS = process.env.SW_CMP_WIN ?? '2417,487,16;2377,738,12';
const wins = WINS.split(';').map((s) => s.split(',').map(Number));
const inWin = (x, y) => wins.some(([cx, cy, r]) => Math.abs(x - cx) <= r && Math.abs(y - cy) <= r);
function parseRig(p) {
  const out = [];
  for (const ln of readFileSync(p, 'utf8').split('\n')) {
    let m = ln.match(/^K (\d+),(\d+) /);
    if (m && inWin(+m[1], +m[2])) { out.push({ side: 'X', k: 'K', x: +m[1], y: +m[2], extra: ln }); continue; }
    m = ln.match(/^SQF (\d+),(\d+) /);
    if (m && inWin(+m[1], +m[2])) { out.push({ side: 'X', k: 'SQF', x: +m[1], y: +m[2], extra: ln }); continue; }
    m = ln.match(/^SANDOK i=(\d+) j=(\d+)/);
    if (m && inWin(+m[1], +m[2])) { out.push({ side: 'X', k: 'SOK', x: +m[1], y: +m[2], extra: ln }); continue; }
    m = ln.match(/^STAL (\d+),(\d+)/);
    if (m && inWin(+m[1], +m[2])) { out.push({ side: 'X', k: 'STAL', x: +m[1], y: +m[2], extra: ln }); continue; }
  }
  return out;
}
function parseJs(p) {
  const out = [];
  for (const ln of readFileSync(p, 'utf8').split('\n')) {
    let m = ln.match(/^KW (\d+),(\d+)$/);
    if (m && inWin(+m[1], +m[2])) { out.push({ side: 'J', k: 'K', x: +m[1], y: +m[2], extra: ln }); continue; }
    m = ln.match(/^SQF (\d+),(\d+) /);
    if (m && inWin(+m[1], +m[2])) { out.push({ side: 'J', k: 'SQF', x: +m[1], y: +m[2], extra: ln }); continue; }
    m = ln.match(/^SAND OK (\d+) (\d+)/);
    if (m && inWin(+m[1], +m[2])) { out.push({ side: 'J', k: 'SOK', x: +m[1], y: +m[2], extra: ln }); continue; }
    m = ln.match(/^D59 .*"x":(\d+),"j":(\d+)/);
    if (m && inWin(+m[1], +m[2])) { out.push({ side: 'J', k: 'STAL', x: +m[1], y: +m[2], extra: ln.slice(0, 90) }); continue; }
  }
  return out;
}
const X = parseRig('/tmp/iii111-out/rig/tr.log');
const J = parseJs('/tmp/iii111-out/tr-sand-js.log');
console.log(`counts X=${X.length} J=${J.length}`);
let i = 0, j = 0, div = 0;
while (i < X.length && j < J.length) {
  const a = X[i], b = J[j];
  if (a.k === b.k && a.x === b.x && a.y === b.y) {
    i++; j++; continue;
  }
  div++;
  console.log(`#${div} FIRST-DIVERGENCE @stream(${i},${j}):\n  X: ${a.extra}\n  J: ${b.extra}`);
  // 探查后续 5 行各端帮助定位
  console.log('   X ctx:', X.slice(i, i + 6).map((e) => `${e.k}${e.x},${e.y}`).join(' | '));
  console.log('   J ctx:', J.slice(j, j + 6).map((e) => `${e.k}${e.x},${e.y}`).join(' | '));
  break;
}
if (!div) console.log('STREAMS ALIGNED ✓');
const n = Math.min(X.length, J.length);
for (let s = Math.max(0, n - 4); s < n; s++) console.log(`tail${s}: X=${X[s].k}${X[s].x},${X[s].y} | J=${J[s].k}${J[s].x},${J[s].y}`);
