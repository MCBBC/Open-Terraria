// SW-FX22 素材域法证审计(一次性诊断;经 tools/run-diag.mjs 运行)。
// 定谳三问:
//   A. 2772/2773/2775 星旋三件 + 4722:HEAD 版图集矩形像素 vs terraria-assets 源图
//      ——Atlas_3 内容是否漂移?冻结 golden md5 是否仍正确?
//   B. TEdit 缺 id 清单(atlas-append-1457.mjs:67 注释 26 id)全量 census:
//      哪些有图集足迹/哪些无键/源图可用性。
//   C. Atlas_0/1 抽 30 旧键:HEAD 态(8/24 恢复版)与当前工作态(15:41 全量重排版)
//      各自 vs 源图逐像素比对——判定"用户发现 Item_Atlas_0/1.png 被改"的漂移面。
//   D. golden 16 锚点在 HEAD 态/当前态各算一遍 md5——复现 RB11c F7 的真实机制。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const ASSETS = join(ROOT, '..', 'terraria-assets', 'Images');

// HEAD 态(git 最后提交 = 8/24 恢复后权威态)
const HEAD_JSON = JSON.parse(readFileSync('/tmp/fx22-head-vanilla.json', 'utf8'));
const HEAD_PAGE = (n) => PNG.sync.read(readFileSync(`/tmp/fx22-head-atlas${n}.png`));
// 当前工作态(15:41 全量重排,未提交)
const CUR_JSON = JSON.parse(readFileSync(join(ROOT, 'public/sprites/vanilla.json'), 'utf8'));
const CUR_PAGE = (n) => PNG.sync.read(readFileSync(join(ROOT, `public/sprites/vanilla/Item_Atlas_${n}.png`)));

const pageOf = (icon) => Number(/Item_Atlas_(\d)\.png$/.exec(icon ?? '')?.[1] ?? -1);

/** 与 tests/atlas-append-golden.test.ts 逐位一致的矩形 RGBA 连续化 + md5(12 位) */
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

/** 逐像素 diff:返回 {equal, diffCount, bbox, first} */
function pixelDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return { equal: false, dims: `${a.width}x${a.height} vs ${b.width}x${b.height}`, diffCount: -1 };
  }
  let diffCount = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, first = null;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] ||
        a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
      diffCount++;
      const px = (i / 4) % a.width, py = Math.floor(i / 4 / a.width);
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      if (!first) first = { x: px, y: py, got: [a.data[i], a.data[i + 1], a.data[i + 2], a.data[i + 3]], want: [b.data[i], b.data[i + 1], b.data[i + 2], b.data[i + 3]] };
    }
  }
  return { equal: diffCount === 0, diffCount, bbox: diffCount ? [minX, minY, maxX, maxY] : null, first };
}

function loadSrc(id) {
  const p = join(ASSETS, `Item_${id}.png`);
  return existsSync(p) ? PNG.sync.read(readFileSync(p)) : null;
}

console.log('===== A. 星旋三件 + 4722 源真相(HEAD 态 = 8/24 恢复后权威态) =====');
// golden PIXEL_ANCHORS 冻结值(tests/atlas-append-golden.test.ts:126)
const FROZEN = { 2772: [3, '8e1fc7003902'], 2773: [3, '3213c3e4a949'], 2775: [3, 'bab8a6a3e09f'] };
for (const id of [2772, 2773, 2775]) {
  const src = loadSrc(id);
  const hj = HEAD_JSON.items[String(id)];
  const page = HEAD_PAGE(pageOf(hj.icon));
  const crop = { width: hj.iw, height: hj.ih, data: Buffer.alloc(hj.iw * hj.ih * 4) };
  for (let y = 0; y < hj.ih; y++) for (let x = 0; x < hj.iw; x++) {
    const si = ((hj.iy + y) * page.width + (hj.ix + x)) * 4, di = (y * hj.iw + x) * 4;
    crop.data[di] = page.data[si]; crop.data[di + 1] = page.data[si + 1];
    crop.data[di + 2] = page.data[si + 2]; crop.data[di + 3] = page.data[si + 3];
  }
  const d = pixelDiff(src, crop);
  const md5 = rectMd5(page, hj.ix, hj.iy, hj.iw, hj.ih);
  const [fp, fv] = FROZEN[id];
  console.log(`Item_${id}: HEAD@Atlas_${pageOf(hj.icon)}(${hj.ix},${hj.iy},${hj.iw}x${hj.ih}) vs 源图${src.width}x${src.height}` +
    ` → ${d.equal ? '像素全等' : `差异 ${d.diffCount}px bbox=${d.bbox} first=${JSON.stringify(d.first)}`}` +
    ` | golden-md5=${md5} 冻结(页${fp})=${fv} ${md5 === fv ? '✓匹配' : '✗不匹配'}`);
}
{
  const a = md5FileSync(join(ROOT, 'public/sprites/vanilla/Item_4722.png'));
  const b = md5FileSync(join(ASSETS, 'Item_4722.png'));
  console.log(`Item_4722 单图: 在盘 vanilla/Item_4722.png=${a.slice(0, 12)} vs 源图=${b.slice(0, 12)} ${a === b ? '✓全等' : '✗漂移'}`);
}
// 当前态三件(应与 HEAD 态图集同字节,但 json 已指 0/1 页——记录足迹变化)
for (const id of [2772, 2773, 2775]) {
  const cj = CUR_JSON.items[String(id)];
  console.log(`  当前态 json: Item_${id} → Atlas_${pageOf(cj.icon)}(${cj.ix},${cj.iy},${cj.iw}x${cj.ih})`);
}

console.log('===== B. TEdit 缺 id 清单 26 件 census =====');
const TEDIT_MISSING = [0, 2772, 2773, 2775, 2777, 2778, 2780, 2782, 2783, 2785, 2881, 3462, 3463, 3465,
  3847, 3848, 3849, 3850, 3851, 3861, 3862, 3978, 4010, 4058, 4143, 4722];
for (const id of TEDIT_MISSING) {
  const ks = String(id);
  const head = HEAD_JSON.items[ks], cur = CUR_JSON.items[ks];
  const hasSrc = existsSync(join(ASSETS, `Item_${id}.png`));
  const foot = head ? (head.ix != null ? `Atlas_${pageOf(head.icon)}@(${head.ix},${head.iy},${head.iw}x${head.ih})` : '单体直引') : '无键';
  console.log(`  ${ks}: HEAD=${foot} | 当前=${cur ? (cur.ix != null ? `Atlas_${pageOf(cur.icon)}@(${cur.ix},${cur.iy})` : '单体直引') : '无键'} | 源图=${hasSrc ? '在池' : '缺'}`);
}

console.log('===== C. Atlas_0/1 抽 30 旧键 vs 源图(HEAD 态 + 当前态) =====');
const anchorIds = [1, 99, 168, 756, 3013, 3665, 3679, 4364, 5092, 5567, 6018, 6064, 6087];
const spread = [2, 50, 300, 500, 800, 1000, 1300, 1500, 1800, 2000, 2300, 2500, 2800, 3000, 3300, 3500, 3800, 4000, 4300, 4500, 4800, 5000, 5300, 5500, 5800, 6100, 6120];
const sampleIds = [];
const skipped = [];
for (const id of [...anchorIds, ...spread]) {
  if (sampleIds.length >= 30) break;
  const ks = String(id);
  if (!HEAD_JSON.items[ks] || !CUR_JSON.items[ks]) { skipped.push(`${ks}:无键`); continue; }
  if (!loadSrc(id)) { skipped.push(`${ks}:无源图`); continue; }
  sampleIds.push(id);
}
let headBad = 0, curBad = 0, dimMismatch = 0;
for (const id of sampleIds) {
  const ks = String(id);
  const src = loadSrc(id);
  const hj = HEAD_JSON.items[ks], cj = CUR_JSON.items[ks];
  const hp = HEAD_PAGE(pageOf(hj.icon)), cp = CUR_PAGE(pageOf(cj.icon));
  const hDimOk = src.width === hj.iw && src.height === hj.ih;
  const cDimOk = src.width === cj.iw && src.height === cj.ih;
  if (!hDimOk || !cDimOk) { dimMismatch++; console.log(`  ${ks}: 维度不匹配 源${src.width}x${src.height} HEAD${hj.iw}x${hj.ih} 当前${cj.iw}x${cj.ih}`); continue; }
  const hcrop = cropPx(hp, hj), ccrop = cropPx(cp, cj);
  const hd = pixelDiff(src, hcrop), cd = pixelDiff(src, ccrop);
  if (!hd.equal) headBad++;
  if (!cd.equal) curBad++;
  const flag = hd.equal && cd.equal ? '✓✓' : `HEAD${hd.equal ? '✓' : '✗' + hd.diffCount} 当前${cd.equal ? '✓' : '✗' + cd.diffCount}`;
  console.log(`  ${ks}: 源图逐像素 ${flag}`);
}
function cropPx(page, e) {
  const out = { width: e.iw, height: e.ih, data: Buffer.alloc(e.iw * e.ih * 4) };
  for (let y = 0; y < e.ih; y++) for (let x = 0; x < e.iw; x++) {
    const si = ((e.iy + y) * page.width + (e.ix + x)) * 4, di = (y * e.iw + x) * 4;
    out.data[di] = page.data[si]; out.data[di + 1] = page.data[si + 1];
    out.data[di + 2] = page.data[si + 2]; out.data[di + 3] = page.data[si + 3];
  }
  return out;
}
function md5FileSync(p) { return createHash('md5').update(readFileSync(p)).digest('hex'); }
console.log(`  抽样 ${sampleIds.length} 件: HEAD 态不齐 ${headBad} 件 / 当前态不齐 ${curBad} 件 / 维度不匹配 ${dimMismatch} 件`);
console.log(`  跳过: ${skipped.join(', ') || '无'}`);

console.log('===== D. golden 16 锚点 md5 双态复算(RB11c F7 机制复现) =====');
const PIXEL_ANCHORS = {
  1: [0, 'f52de9838028'], 99: [0, 'db9ae007c5d4'], 168: [1, '16fafef49831'], 756: [0, 'b751fc7584f8'],
  2772: [3, '8e1fc7003902'], 2773: [3, '3213c3e4a949'], 2775: [3, 'bab8a6a3e09f'], 3013: [0, '2bc636bf6de2'],
  3665: [0, '6274706a8035'], 3679: [0, 'f6bd56f2ccd5'], 4364: [0, '7fc3408f202f'], 5092: [0, 'be9ed870b818'],
  5567: [0, '23999ba5c20e'], 6018: [1, 'b5205e841b74'], 6064: [1, '180fe8435269'], 6087: [0, '7c5550c53ea9'],
};
for (const [state, json, getPage] of [['HEAD态', HEAD_JSON, HEAD_PAGE], ['当前态', CUR_JSON, CUR_PAGE]]) {
  let ok = 0;
  const lines = [];
  for (const [idStr, [page, want]] of Object.entries(PIXEL_ANCHORS)) {
    const e = json.items[idStr];
    const got = e ? rectMd5(getPage(page), e.ix, e.iy, e.iw, e.ih) : '缺键';
    const m = got === want;
    if (m) ok++;
    else lines.push(`    ${idStr}@${page}(${e?.ix},${e?.iy},${e?.iw}x${e?.ih}): ${got} ≠ ${want}`);
  }
  console.log(`  ${state}: ${ok}/16 匹配冻结值${ok < 16 ? `\n${lines.join('\n')}` : ''}`);
}
console.log('===== 审计完 =====');
