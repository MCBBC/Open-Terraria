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

// 输出目录:默认 dist(单独跑行为不变);build:release 链经 SW_DIST_DIR 指向 dist-release
const DIST = join(import.meta.dirname, '..', process.env.SW_DIST_DIR ?? 'dist');
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

// 调试页裁剪(2026-08-24 用户定案二次澄清:**发布包默认裁调试页**——保留的是
// 游戏内 F6/F2/F5 等调试功能(在主 chunk 里,与此无关);9 个独立调试 HTML 工作台
// +调试存档不进发布包。dev 服务器不受影响(页面活在 public/,此处只裁 dist 拷贝)。
// build:release 链默认带 STRIP_DEBUG=1;显式 STRIP_DEBUG=0 可保留;普通 build 不设=保留。
if (process.env.STRIP_DEBUG === '1') {
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
  console.log(`[prune-dist] STRIP_DEBUG=1:裁调试页 ${rCount} 文件(${(rFreed / 1048576).toFixed(1)}MB)`);
} else {
  console.log('[prune-dist] 调试页保留(STRIP_DEBUG 未设或=0;游戏内调试功能不受影响)');
}

console.log(`[prune-dist] 裁 ${PRUNE_DIRS.join('+')}(${files} 文件/${(freed / 1048576).toFixed(0)}MB) → dist ≈ ${(du(DIST) / 1048576).toFixed(0)}MB`);
