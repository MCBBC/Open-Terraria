// IIIII173 掷流对拍器：x86 rollwin.txt（SW_ROLLWIN=34-39）↔ JS win5/win6 样本流。
// 输出：每段长度、前缀恒等长度、删节对齐判定（x86 多掷 k 掷/JS 多掷 k 掷）+ 分歧点。
// 用法：node tools/_iii173st.mjs <x86-rollwin> <js-win5> <js-win6>
import { readFileSync } from 'node:fs';

const rollwin = readFileSync(process.argv[2] ?? '/tmp/iii173-out/rig173/rollwin.txt', 'utf8').split('\n');
const js5 = readFileSync(process.argv[3] ?? '/tmp/iii173-out/js-win5.txt', 'utf8').split('\n').filter(Boolean).map(Number);
const js6 = readFileSync(process.argv[4] ?? '/tmp/iii173-out/js-win6.txt', 'utf8').split('\n').filter(Boolean).map(Number);

const segs = [];
let cur = null;
for (const ln of rollwin) {
  if (ln.startsWith('---')) { cur = { tag: ln, vals: [] }; segs.push(cur); continue; }
  if (ln !== '' && cur) cur.vals.push(Number(ln));
}
for (const s of segs) console.log(`${s.tag}  vals=${s.vals.length}`);
/** ★段界语义（实测标定）：rig 在 AfterPass(idx)（pass idx 末尾）写标记，
 *  标记【之后】的值段 = pass idx+1 的掷窗（---START f 同式）。故
 *  seg(n) = pass n 的值段 = 「idx=n-1 的标记」与「idx=n 的标记」之间。 */
const seg = (n) => {
  const i = segs.findIndex((s) => s.tag.startsWith(`---PASS ${n - 1} `) || s.tag === `---START ${n - 1}`);
  return i >= 0 ? segs[i] : undefined;
};

/** 删节感知对齐：找首个分歧点，判定 x86 侧多 k 掷（k=1/2）或 JS 侧多掷，继续走查。 */
function align(name, xv, jv) {
  console.log(`\n=== ${name}: x86=${xv.length} js=${jv.length} Δ=${xv.length - jv.length} ===`);
  let i = 0, j = 0, mism = 0;
  const edits = [];
  while (i < xv.length && j < jv.length) {
    if (xv[i] === jv[j]) { i++; j++; continue; }
    mism++;
    if (mism > 40) { console.log('  过多错位,中止'); break; }
    // 尝试 x86 多 1/2 掷
    let k = 0;
    for (const step of [1, 2, 3]) {
      if (i + step < xv.length && xv[i + step] === jv[j]) { k = step; break; }
    }
    if (k > 0) {
      edits.push({ at: i, kind: `x86 多 ${k} 掷`, vals: xv.slice(i, i + k) });
      i += k;
      continue;
    }
    // 尝试 js 多 1/2 掷
    for (const step of [1, 2, 3]) {
      if (j + step < jv.length && jv[j + step] === xv[i]) {
        edits.push({ at: i, kind: `js 多 ${step} 掷`, vals: jv.slice(j, j + step) });
        j += step;
        k = -1;
        break;
      }
    }
    if (k < 0) continue;
    // 单点值差
    edits.push({ at: i, kind: '值差', xv: xv[i], jv: jv[j] });
    i++; j++;
  }
  console.log(`  前缀恒等到 idx=${edits.length ? edits[0].at : Math.min(i, j)}; edits=${edits.length}; 尾残 x86=${xv.length - i} js=${jv.length - j}`);
  for (const e of edits.slice(0, 8)) console.log(`  @${e.at} ${e.kind} ${e.vals ?? (e.kind === '值差' ? `x86=${e.xv} js=${e.jv}` : '')}`);
  return edits;
}

const x36 = seg(36)?.vals ?? [], x37 = seg(37)?.vals ?? [], x38 = seg(38)?.vals ?? [];
align('GravSand+OceanCaves(x86 36+37) vs js-win5', [...x36, ...x37], js5);
align('Shimmer(x86 38) vs js-win6', x38, js6);
