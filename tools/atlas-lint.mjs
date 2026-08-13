// 素材自洽 lint(构建期,纯 node;2026-08-13 自动检查四件套之 B):
//   ATL-01 meta.sheet 的 PNG 不存在(ensureVImage 兜底 null="img=未载"永久形态)
//   ATL-02 (cols-1)*stride+grid ≤ PNG IHDR 尺寸(与 vframeAt 越界同式,SpriteAtlas.ts:239)
//   ATL-03 grid ≤ stride 且 stride>0(帧不重叠)
//   ATL-04 framed sheet cols/rows ≥ 1(窄条表 cols=0 陷阱,SpriteAtlas.ts:558)
//   ATL-05 TILE_DEFS 引用的 sheet 在 vanilla.json 有 meta(def↔素材脱节)
//   ATL-06 def 尺寸(fw/fh/w/h) ≡ meta.frameSize[0](TEdit frameSize 权威;豁免表带依据)
//   ATL-07 vanilla.json sheet 集 ↔ PNG 文件集对称差(孤儿图/缺表,info)
// 消费:node 直跑 / vite 插件 atlasLintAuto(dev warn+build 阻断) / tests/atlas-lint.test.ts
import { readFileSync, existsSync, openSync, readSync, closeSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** PNG IHDR 尺寸(读 24 字节,不整文件读) */
function pngSize(file) {
  const fd = openSync(file, 'r');
  const b = Buffer.alloc(24);
  try { readSync(fd, b, 0, 24, 0); } finally { closeSync(fd); }
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null; // 签名
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** ATL-06 豁免(与 src/world/audit/exemptions.ts 的 R1 豁免联动;数据修好后必须缩) */
export const ATL06_EXEMPT = new Set([
  'v_74_jungle_tall_plants',  // Style1x1Plant_Height34:占格 1×1 贴图 34px;repo fh:2 放置便利
  'v_590_gem_saplings',       // 3 style 横排:repo fw:3=带宽 54px 有意标记(frameX/54 判宝石序号)
  'v_93_lamps',               // repo w/h=占格+样式行双轴语义;fw/fh=1×3 与渲染帧一致
]);

export function auditAtlas(root = ROOT) {
  const vanillaJson = JSON.parse(readFileSync(join(root, 'public/sprites/vanilla.json'), 'utf8'));
  const tiles = vanillaJson.tiles; // sheetId → meta
  const errors = [];  // {rule, sheet?, key?, msg}
  const warns = [];
  const infos = [];

  // ATL-01..04:逐 sheet
  const sheetIds = Object.keys(tiles);
  for (const sid of sheetIds) {
    const m = tiles[sid];
    const file = join(root, 'public/sprites', m.sheet);
    if (!existsSync(file)) { errors.push({ rule: 'ATL-01', sheet: sid, msg: `PNG 缺失: ${m.sheet}` }); continue; }
    const size = pngSize(file);
    if (!size) { errors.push({ rule: 'ATL-01', sheet: sid, msg: `PNG 非法(签名失败): ${m.sheet}` }); continue; }
    // ATL-02:与 vframeAt 越界判定同式((cols-1)*stride+grid ≤ 尺寸)
    const needW = (m.cols - 1) * m.stride[0] + m.grid[0];
    const needH = (m.rows - 1) * m.stride[1] + m.grid[1];
    if (needW > size.w || needH > size.h) {
      errors.push({ rule: 'ATL-02', sheet: sid, msg: `帧网格越界:需 ${needW}×${needH} > PNG ${size.w}×${size.h} (${m.sheet})` });
    }
    // ATL-03:grid ≤ stride 且 stride>0
    if (m.grid[0] > m.stride[0] || m.grid[1] > m.stride[1] || m.stride[0] <= 0 || m.stride[1] <= 0) {
      errors.push({ rule: 'ATL-03', sheet: sid, msg: `grid>stride 或 stride≤0: grid=${m.grid} stride=${m.stride}` });
    }
    // ATL-04:framed 表帧格健在。cols/rows=0 合法形态两种:①"纯像素寻址表"(压板 135
    // 竖条 0/11——vframe(col,row) 全走 vframeAt(fx,fy),SpriteAtlas.ts:558);
    // ②单格物体双 0(frameSize[1,1]:陶罐 78/地雷 210/高尔夫 476,494/炮弹 726——
    // 16×16 单帧无需网格)。仅负值=error;多格物体双 0=帧格语义缺失 → warn。
    const fs0 = m.frameSize?.[0];
    const singleCell = fs0 && fs0[0] === 1 && fs0[1] === 1;
    if (m.framed && (m.cols < 0 || m.rows < 0)) {
      errors.push({ rule: 'ATL-04', sheet: sid, msg: `framed 表 cols/rows 为负: ${m.cols}/${m.rows}` });
    } else if (m.framed && m.cols === 0 && m.rows === 0 && !singleCell) {
      warns.push({ rule: 'ATL-04', sheet: sid, msg: `多格 framed 表 cols/rows 双 0(帧格语义缺失?)` });
    }
  }

  // ATL-05/06:TILE_DEFS 引用与尺寸交叉校验
  // 行级正则提取(node 无法 import .ts;护栏防 tiles.ts 格式漂移后 lint 失明)
  const tilesTs = readFileSync(join(root, 'src/data/tiles.ts'), 'utf8');
  const defRe = /def\(\{ key: '([^']+)'[^]*?vanilla: \{ sheet: (\d+), frame: 'style'(?:, fw: (\d+), fh: (\d+))?(?:[^}]*?)\}[^}]*?\}\);/g;
  const vanillaMark = (tilesTs.match(/vanilla: \{/g) || []).length;
  const defs = [];
  for (const line of tilesTs.split('\n')) {
    if (!line.includes("vanilla: { sheet:")) continue;
    const km = /key: '([^']+)'/.exec(line);
    const sm = /vanilla: \{ sheet: (\d+)/.exec(line);
    if (!km || !sm) continue;
    const wm = line.includes('fw:') ? /fw: (\d+), fh: (\d+)/.exec(line) : null;
    const whm = /w: (\d+), h: (\d+)/.exec(line);
    defs.push({ key: km[1], sheet: +sm[1], fw: wm ? +wm[1] : undefined, fh: wm ? +wm[2] : undefined,
      w: whm ? +whm[1] : undefined, h: whm ? +whm[2] : undefined });
  }
  // 护栏:提取数 ≥700 且等于 def( 含 vanilla: { 行数(防正则漂移后静默失明)
  if (defs.length < 700 || defs.length > vanillaMark) {
    errors.push({ rule: 'ATL-00', msg: `TILE_DEFS 行级解析护栏失败:提取 ${defs.length} / vanilla 标记 ${vanillaMark}(tiles.ts 格式漂移?请更新 tools/atlas-lint.mjs 的行级正则)` });
  }
  for (const d of defs) {
    const m = tiles[String(d.sheet)];
    if (!m) { errors.push({ rule: 'ATL-05', key: d.key, sheet: d.sheet, msg: `TILE_DEFS 引用的 sheet 无 vanilla.json meta` }); continue; }
    if (ATL06_EXEMPT.has(d.key)) continue;
    const fs0 = m.frameSize?.[0];
    if (!fs0) continue;
    const sizes = [d.fw ?? d.w, d.fh ?? d.h];
    if (sizes[0] !== undefined && sizes[0] !== fs0[0]) {
      warns.push({ rule: 'ATL-06', key: d.key, sheet: d.sheet, msg: `def 尺寸 ${sizes[0]}×${sizes[1]} vs frameSize ${fs0[0]}×${fs0[1]}` });
    } else if (sizes[1] !== undefined && sizes[1] !== fs0[1]) {
      warns.push({ rule: 'ATL-06', key: d.key, sheet: d.sheet, msg: `def 尺寸 ${sizes[0]}×${sizes[1]} vs frameSize ${fs0[0]}×${fs0[1]}` });
    }
  }

  // ATL-07:sheet 集 ↔ PNG 文件集对称差(info)
  const pngs = new Set(readdirSync(join(root, 'public/sprites/vanilla'))
    .filter((f) => /^Tiles_\d+\.png$/.test(f)).map((f) => f.replace(/^Tiles_(\d+)\.png$/, '$1')));
  for (const sid of sheetIds) if (!pngs.has(sid)) infos.push({ rule: 'ATL-07', sheet: sid, msg: 'meta 有但无 Tiles_N.png(或命名不同)' });
  for (const p of pngs) if (!tiles[p]) infos.push({ rule: 'ATL-07', sheet: p, msg: 'PNG 有但 meta 缺' });

  return { errors, warns, infos, sheets: sheetIds.length, defs: defs.length };
}

// ---- CLI ----
if (process.argv[1] && process.argv[1].endsWith('atlas-lint.mjs')) {
  const { errors, warns, infos, sheets, defs } = auditAtlas();
  for (const e of errors) console.error(`[atlas-lint][error] ${e.rule} sheet=${e.sheet ?? '-'} ${e.key ?? ''} ${e.msg}`);
  for (const w of warns) console.warn(`[atlas-lint][warn] ${w.rule} ${w.key} sheet=${w.sheet} ${w.msg}`);
  for (const i of infos.slice(0, 10)) console.log(`[atlas-lint][info] ${i.rule} sheet=${i.sheet} ${i.msg}`);
  console.log(`atlas-lint: ${sheets} 表 / ${defs} def / ${errors.length} error / ${warns.length} warn / ${infos.length} info`);
  process.exit(errors.length ? 1 : 0);
}
