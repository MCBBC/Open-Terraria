// dist 发布审计(anti-decompile-plan-v2 B0-1;2026-08-24)。
// 违规即非零退出(构建链末闸)。检查面:
//   ① sourcemap:dist 内 *.map 文件 / assets/*.js 内 sourceMappingURL 注释
//   ② 源码绝对路径泄漏:/Users/ /home/ C:\(构建机痕迹)
//   ③ 调试工作台残留(RELEASE=1 强制;非 RELEASE 仅警告):
//      annotator/faeling-frames/hitbox-lab/sheet-probe/tree-inspect/water-audit/
//      remaster .html + debug-save.sbw.json + hitbox-names.json
//   ④ 体积台账:JS 总量与 chunk 明细(写 dist-private/size-ledger.json 供对比)
// 已知不查(登记 TODO):F6/F2/F5 调试键名剥离属 B0-3(未实施),先不做假红。
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(import.meta.dirname, '..', 'dist');
const RELEASE = process.env.RELEASE === '1';

const errors = [];
const warns = [];

// ① sourcemap
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const all = walk(DIST);
for (const f of all) if (f.endsWith('.map')) errors.push(`sourcemap 文件残留: ${f}`);

const jsFiles = all.filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  const s = readFileSync(f, 'utf8');
  if (s.includes('sourceMappingURL=')) errors.push(`sourceMappingURL 注释: ${f}`);
  if (/\/Users\/|\/home\//.test(s) || /[A-Z]:\\\\/.test(s)) errors.push(`源码绝对路径泄漏: ${f}`);
}

// ③ 调试工作台残留
const DEBUG_FILES = [
  'annotator.html', 'faeling-frames.html', 'hitbox-lab.html', 'sheet-probe.html',
  'tree-inspect.html', 'water-audit.html', 'remaster.html',
  'debug-save.sbw.json', 'hitbox-names.json',
];
for (const f of DEBUG_FILES) {
  if (existsSync(join(DIST, f))) {
    const msg = `调试工作台残留: ${f}`;
    (RELEASE ? errors : warns).push(msg + (RELEASE ? '' : '(非 RELEASE 档,仅警告)'));
  }
}

// ④ 体积台账
let totalJs = 0;
const ledger = [];
for (const f of jsFiles) {
  const size = Buffer.byteLength(readFileSync(f));
  totalJs += size;
  ledger.push({ file: f.slice(DIST.length + 1), kb: +(size / 1024).toFixed(1) });
}
ledger.sort((a, b) => b.kb - a.kb);
mkdirSync(join(DIST, '..', 'dist-private'), { recursive: true });
writeFileSync(
  join(DIST, '..', 'dist-private', 'size-ledger.json'),
  JSON.stringify({ at: new Date().toISOString(), release: RELEASE, totalJsMb: +(totalJs / 1048576).toFixed(2), chunks: ledger }, null, 1),
);

console.log(`[audit-dist] JS 总量 ${(totalJs / 1048576).toFixed(2)}MB / ${jsFiles.length} chunk(台账 → dist-private/size-ledger.json)`);
for (const w of warns) console.warn(`[audit-dist] WARN ${w}`);
if (errors.length) {
  console.error(`[audit-dist] ✗ ${errors.length} 处违规:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[audit-dist] 全绿 ✓${RELEASE ? '(RELEASE 档)' : ''}`);
