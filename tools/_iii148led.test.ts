// IIII108c（2026-09-04）winter 幽灵账本系统性审计 · 第一刀（纯分析,零世界生成）。
// 输入:js-prepiles.typ/.act(CXXIV r4 reseed91 现行码快照) × G2 x86 000..076 dump 序列。
// 输出:/tmp/iii148-out/{ledger.txt,ledger-summary.txt}
//   - ledger:非活格 raw-type(ghost)账本逐格分类(A=x86 幽灵 JS 无/B=JS 幽灵 x86 无/
//     C=双方幽灵值差/D=JS sheetless 内部残型)+ x86 写入 pass 归属(G2 扫描 last-change)
//   - summary:族表/写pass 表/族×pass/小族样例
// 用法:cd game && SW_I148=1 npx vitest run tools/_iii148led.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I148 === '1';
const G2 = process.env.SW_I148_G2 ?? '/Users/vinlic/GoldenChains/golden-winter';
const PRE = process.env.SW_I148_PRE ?? '/tmp/iii139-out/js-prepiles.typ';
const PREACT = process.env.SW_I148_PREACT ?? '/tmp/iii139-out/js-prepiles.act';
const OUT = process.env.SW_I148_OUT ?? '/tmp/iii148-out';
const W = 4200, H = 1200, N = W * H;

(RUN ? it : it.skip)('III148LED ghost ledger audit (analysis only)', async () => {
  mkdirSync(OUT, { recursive: true });
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const js = new Uint16Array(readFileSync(PRE).buffer, 0, N);
  const jsAct = new Uint8Array(readFileSync(PREACT).buffer, 0, N);
  const x86 = new Uint16Array(readFileSync(`${G2}/076_Traps.typ`).buffer, 0, N);
  const x86Act = new Uint8Array(readFileSync(`${G2}/076_Traps.act`).buffer, 0, N);

  // 0) 活性面一致性自检(mile8 绿的直读复核)
  let actDiff = 0, actFirst = -1, typVisDiff = 0;
  for (let k = 0; k < N; k++) {
    if (!!x86Act[k] !== !!jsAct[k]) { actDiff++; if (actFirst < 0) actFirst = k; }
    else if (x86Act[k] && (SHEET[js[k]] ?? -1) !== x86[k]) typVisDiff++;
  }
  console.log(`act 面差=${actDiff} first=${actFirst < 0 ? '-' : `(${actFirst % W},${(actFirst / W) | 0})`} 活格 typ 差=${typVisDiff}`);

  // 1) ghost 账本逐格分类
  const cells: { x: number; y: number; vx: number; vj: number; cls: string; jraw: number }[] = [];
  for (let k = 0; k < N; k++) {
    if (x86Act[k] && jsAct[k]) continue;                 // 双活 → mile8 typ 域(绿)
    if (!x86Act[k] && !jsAct[k]) {
      const vj = SHEET[js[k]] ?? -1;
      const vx = x86[k];
      if (vx === vj) continue;                            // 幽灵等值(双 0 或同型)
      const x = k % W, y = (k / W) | 0;
      let cls: string;
      if (vj === -1) cls = 'D';                           // JS sheetless 内部残型
      else if (vx !== 0 && vj <= 0) cls = 'A';            // x86 幽灵 JS 全空(漏移植写点)
      else if (vx === 0 && vj > 0) cls = 'B';             // JS 幽灵 x86 无(JS 多写)
      else cls = 'C';                                     // 双方幽灵但型不同(值差)
      cells.push({ x, y, vx, vj, cls, jraw: js[k] });
    }
  }
  console.log(`ghost 账本总差=${cells.length}`);
  const byCls: Record<string, number> = {};
  for (const c of cells) byCls[c.cls] = (byCls[c.cls] ?? 0) + 1;
  console.log('分类:', byCls);

  // 2) x86 写入 pass 归属:扫 G2 000..076 typ,记录每格 last-change(≠前值)pass
  const allFiles = readdirSync(G2);
  const dumpIdx: number[] = [];
  for (const f of allFiles) {
    if (!f.endsWith('.typ')) continue;
    const idx = parseInt(f.split('_')[0]!, 10);
    if (Number.isFinite(idx) && idx <= 76) dumpIdx.push(idx);
  }
  dumpIdx.sort((a, b) => a - b);
  const nmOf = (idx: number) => allFiles.find((f) => f.startsWith(`${String(idx).padStart(3, '0')}_`) && f.endsWith('.typ'))!.replace(/\.typ$/, '');
  const lastChange = new Int16Array(N).fill(-1);          // -1=000 前即此值
  const prev = new Uint16Array(N);                        // Terrain 前=全 0(Reset 后 wipe)
  for (const idx of dumpIdx) {
    const buf = readFileSync(`${G2}/${nmOf(idx)}.typ`);
    const cur = new Uint16Array(buf.buffer, 0, N);
    for (let k = 0; k < N; k++) if (cur[k] !== prev[k]) { lastChange[k] = idx; prev[k] = cur[k]; }
  }
  // 3) 归属统计
  const fam: Record<string, number> = {};
  const byPass: Record<string, number> = {};
  const byPassCls: Record<string, Record<string, number>> = {};
  const famPass: Record<string, Record<string, number>> = {};
  for (const c of cells) {
    const k = c.y * W + c.x;
    const p = lastChange[k];
    const pk = p < 0 ? 'pre-000' : nmOf(p);
    const famKey = `${c.cls}|x${c.vx}|j${c.vj < 0 ? 'SLESS' : c.vj}`;
    fam[famKey] = (fam[famKey] ?? 0) + 1;
    byPass[pk] = (byPass[pk] ?? 0) + 1;
    byPassCls[pk] ??= {};
    byPassCls[pk][c.cls] = (byPassCls[pk][c.cls] ?? 0) + 1;
    famPass[famKey] ??= {};
    famPass[famKey][pk] = (famPass[famKey][pk] ?? 0) + 1;
  }
  const famSorted = Object.entries(fam).sort((a, b) => b[1] - a[1]);
  let txt = `== ghost 账本族表(分类|x86型|JS型 → 计数) 共 ${cells.length} 格 ==\n`;
  for (const [k, v] of famSorted) txt += `${k}  ${v}\n`;
  txt += `\n== x86 写入 pass 归属 ==\n`;
  for (const [k, v] of Object.entries(byPass).sort((a, b) => b[1] - a[1])) txt += `${k}  ${v}  ${JSON.stringify(byPassCls[k])}\n`;
  txt += `\n== 族×pass ==\n`;
  for (const [k, v] of famSorted) txt += `${k}: ${JSON.stringify(Object.entries(v).sort((a, b) => b[1] - a[1]))}\n`;
  // 4) 小族样例
  const byFamCells: Record<string, string[]> = {};
  for (const c of cells) {
    const k0 = c.y * W + c.x;
    const p = lastChange[k0];
    const famKey = `${c.cls}|x${c.vx}|j${c.vj < 0 ? 'SLESS' : c.vj} @${p < 0 ? 'pre-000' : nmOf(p)}`;
    (byFamCells[famKey] ??= []).push(`(${c.x},${c.y})`);
  }
  for (const [k, v] of Object.entries(byFamCells)) if (v.length <= 8) txt += `${k}: ${v.slice(0, 8).join(',')}\n`;
  writeFileSync(`${OUT}/ledger-summary.txt`, txt);
  writeFileSync(`${OUT}/ledger.txt`, cells.map((c) => {
    const k = c.y * W + c.x;
    const p = lastChange[k];
    return `(${c.x},${c.y}) cls=${c.cls} x86=${c.vx} js=${c.vj < 0 ? `SLESS(${c.jraw})` : c.vj} xwrite=${p < 0 ? 'pre-000' : nmOf(p)}`;
  }).join('\n'));
  console.log(`A=${byCls.A ?? 0} B=${byCls.B ?? 0} C=${byCls.C ?? 0} D=${byCls.D ?? 0}`);
  console.log(`写入 ${OUT}/ledger-summary.txt + ledger.txt`);
}, 600_000);
