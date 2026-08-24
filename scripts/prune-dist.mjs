// dist 裁剪(2026-08-19,用户选定部署形态:zip + 极小散文件子集 ≈350MB)。
// vite build 后删 dist 里的 sprites/vanilla/**、sounds/**、audios/music/**
// (−428M,已全部在 zip 分片里,SW 解压直写缓存);保留:
//   壳(index.html/assets/*)、sw.js、vendor/、assets-zip/、l10n/、fonts/、
//   sprites/vanilla-ui 全目录(首访菜单/选人/捏人完整可用)、audios/ 平铺的
//   main.mp3+title.mp3(菜单标题曲)、顶层 html 调试页与其 json。
// ★登记代价:?nosw(禁 SW)用户进图无散件可回退(用户决策接受);
//   PRUNE_DIST=0 跳过(特殊部署全量兜底)。
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(import.meta.dirname, '..', 'dist');
const PRUNE_DIRS = ['sprites/vanilla', 'sounds', 'audios/music'];

if (process.env.PRUNE_DIST === '0') {
  console.log('[prune-dist] PRUNE_DIST=0 跳过(全量部署)');
  process.exit(0);
}
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[prune-dist] dist/index.html 不存在——请在 vite build 之后运行');
  process.exit(1);
}

const du = (p) => {
  const st = statSync(p);
  if (st.isFile()) return st.size;
  let n = 0;
  for (const e of readdirSync(p)) n += du(join(p, e));
  return n;
};
const countFiles = (p) => {
  const st = statSync(p);
  if (st.isFile()) return 1;
  return readdirSync(p).reduce((a, e) => a + countFiles(join(p, e)), 0);
};

let freed = 0, files = 0;
for (const rel of PRUNE_DIRS) {
  const dir = join(DIST, rel);
  if (!existsSync(dir)) continue;
  freed += du(dir);
  files += countFiles(dir);
  rmSync(dir, { recursive: true, force: true });
}

// RELEASE=1 档(anti-decompile-plan-v2 B0-2;build:release 专用):裁调试工作台。
// 这些是 public/ 静态拷贝的独立调试页(vite build 入口只有 index.html,游戏本体
// 零引用——src 内命中全是注释;唯一运行时 fetch 是 DebugLinePage 拉 debug-save,
// 属调试功能,release 缺文件只影响该调试函数)。缺省(非 RELEASE)不裁,行为不变。
if (process.env.RELEASE === '1') {
  const RELEASE_FILES = [
    'annotator.html', 'faeling-frames.html', 'hitbox-lab.html', 'sheet-probe.html',
    'tree-inspect.html', 'water-audit.html', 'remaster.html',
    'debug-save.sbw.json', 'hitbox-names.json',
  ];
  let rFreed = 0, rCount = 0;
  for (const f of RELEASE_FILES) {
    const p = join(DIST, f);
    if (!existsSync(p)) continue;
    rFreed += statSync(p).size;
    rCount++;
    rmSync(p, { force: true });
  }
  console.log(`[prune-dist] RELEASE 档:裁调试工作台 ${rCount} 文件(${(rFreed / 1048576).toFixed(1)}MB)`);
}

console.log(`[prune-dist] 裁 ${PRUNE_DIRS.join('+')}(${files} 文件/${(freed / 1048576).toFixed(0)}MB) → dist ≈ ${(du(DIST) / 1048576).toFixed(0)}MB`);
