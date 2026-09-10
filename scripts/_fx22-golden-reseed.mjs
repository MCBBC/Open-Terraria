// SW-FX22 golden md5 oracle 重产工具(留档;经 tools/run-diag.mjs 运行)。
// 用途:tests/atlas-append-golden.test.ts 的 PIXEL_ANCHORS(16 锚点 PNG 矩形 md5)在
// 「有意的全量重排被批准后」重产冻结值。反伪影纪律:在途金标禁顺手重冻——重产前
// 必须先有「重排被批准」的裁决;本工具只做 oracle 复算与打印,不写盘(--write 才写)。
//
// 语义:对每个锚点 id,从 vanilla.json 该键自身 icon 指向的页、按其 ix/iy/iw/ih 裁矩形,
// 以与测试逐位一致的算法(RGBA 行连续化 + md5 前 12 位)重算;页号与 md5 一并输出
// (重排后页号本身就会变,冻结表须两者同更)。
//
// 用法:
//   node tools/run-diag.mjs scripts/_fx22-golden-reseed.mjs           # 报告模式(默认):只打印新旧对照
//   node tools/run-diag.mjs scripts/_fx22-golden-reseed.mjs --write   # 写回测试文件(先备份到 /tmp)
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const TEST = join(ROOT, 'tests/atlas-append-golden.test.ts');
const WRITE = process.argv.includes('--write');

const vanilla = JSON.parse(readFileSync(join(ROOT, 'public/sprites/vanilla.json'), 'utf8'));

// —— 从测试文件提取冻结表(页号, md5)——
const testSrc = readFileSync(TEST, 'utf8');
const block = testSrc.match(/const PIXEL_ANCHORS[^=]*= \{([\s\S]*?)\};/);
if (!block) throw new Error('测试文件中找不到 PIXEL_ANCHORS 表');
const frozen = {};
for (const m of block[1].matchAll(/(\d+):\s*\[(\d+),\s*'([0-9a-f]{12})'\]/g)) {
  frozen[m[1]] = { page: Number(m[2]), md5: m[3] };
}
if (!Object.keys(frozen).length) throw new Error('冻结表解析为空——测试文件形态变了,先人工核对');

const pages = new Map();
const readPage = (n) => {
  if (!pages.has(n)) pages.set(n, PNG.sync.read(readFileSync(join(ROOT, `public/sprites/vanilla/Item_Atlas_${n}.png`))));
  return pages.get(n);
};
function rectMd5(png, ix, iy, iw, ih) {
  const buf = Buffer.alloc(iw * ih * 4);
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const si = ((iy + y) * png.width + (ix + x)) * 4;
      const di = (y * iw + x) * 4;
      buf[di] = png.data[si]; buf[di + 1] = png.data[si + 1];
      buf[di + 2] = png.data[si + 2]; buf[di + 3] = png.data[si + 3];
    }
  }
  return createHash('md5').update(buf).digest('hex').slice(0, 12);
}

console.log(`PIXEL_ANCHORS oracle 重产(模式=${WRITE ? '写回' : '报告'});锚点 ${Object.keys(frozen).length} 个`);
console.log('id | 冻结页@md5 | 现算页@md5(json 自指页) | 判定');
const rows = [];
let drift = 0;
for (const [idStr, f] of Object.entries(frozen)) {
  const e = vanilla.items?.[idStr];
  if (!e || e.ix == null) { console.log(`${idStr} | ${f.page}@${f.md5} | 缺键/单体直引,无法重算 | ⚠人工`); drift++; continue; }
  const page = Number(/Item_Atlas_(\d)\.png$/.exec(e.icon ?? '')?.[1] ?? -1);
  if (page < 0) { console.log(`${idStr} | ${f.page}@${f.md5} | icon 非 Atlas 页(${e.icon}) | ⚠人工`); drift++; continue; }
  const got = rectMd5(readPage(page), e.ix, e.iy, e.iw, e.ih);
  const same = got === f.md5 && page === f.page;
  if (!same) drift++;
  rows.push({ idStr, f, page, got });
  console.log(`${idStr} | ${f.page}@${f.md5} | ${page}@${got} | ${same ? '✓一致' : '✗漂移'}`);
}

if (!WRITE) {
  console.log(drift === 0
    ? `结论: ${drift} 处漂移——冻结 golden 与盘上像素全等,无需重产(在途金标保持)。`
    : `结论: ${drift} 处漂移。若且唯若「有意的全量重排已获批准」,再以 --write 重产;否则先按 CLAUDE.md 走恢复流程。`);
} else {
  if (drift === 0) { console.log('零漂移,无写回必要——拒绝写。'); process.exit(0); }
  const backup = `/tmp/atlas-append-golden.test.ts.bak-${Date.now()}`;
  copyFileSync(TEST, backup);
  let out = testSrc;
  for (const { idStr, f, page, got } of rows) {
    if (f.page === page && f.md5 === got) continue;
    const pat = new RegExp(`(${idStr}:\\s*\\[)${f.page},\\s*'${f.md5}'(\\])`);
    if (!pat.test(out)) throw new Error(`${idStr} 冻结行匹配失败——中止写回`);
    out = out.replace(pat, `$1${page}, '${got}'$2`);
  }
  writeFileSync(TEST, out);
  console.log(`已写回 PIXEL_ANCHORS(备份: ${backup});须附:重排批准凭证 + SW 缓存链评估,并全量跑 vitest。`);
}
console.log('OK');
