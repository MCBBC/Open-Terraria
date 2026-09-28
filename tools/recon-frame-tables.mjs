#!/usr/bin/env node
// tools/recon-frame-tables.mjs —— 资产/帧表完整性静态对账闸（BJ378，2026-09-28）
//
// 病根回顾（三起手工案例=对账规则的设计来源，本工具把它们变成机器一次抓完）：
//   1. Gore_1007/1008（BJ376/377）：贴图 14×144 / 10×112=竖排 8 帧图集；原版
//      GoreID.cs:9 SpecialAI==3 → NewGore Gore.cs:1416-1424 SpriteFrame(1,8)
//      随机切帧；GorePiece.ts FRAME_ROWS 漏配 → 整张竖条画出。【规则①漏配】
//   2. tile 752（BJ365/366）：TileDrawing.cs:4577-4581 verbatim tileWidth=36/
//      tileHeight=38，Tiles_752.png 仅 38×36 → 请求底 2 行越界；drawAdjust fit
//      恒败静默回退 18×18 格元=只画蛋顶残片（原版 FNA CLAMP_TO_EDGE 无恙）。
//      【规则②越界 + fit 恒败】
//   3. projFrames 族（BJ367）：projFrames[vid] 权威=Main.cs Initialize_TileAndNPCData1
//      循环赋 1（:8578-8581）+ 逐 id 覆写（:8582-8866，285 条、221 重复赋值 last-wins
//      → 284 唯一 id）；本仓 vanilla-projframes.json + Arrow.ts PROJ_GRID 消费。
//      【规则①③④全量对账】
//
// 三源交叉对账（逐 id）：
//   源 A 原版权威帧结构（反编译直读，锚 fail-loud）：
//     · gore：GoreID.cs:9 SpecialAI 分派 + :15 IsDrip + Gore.cs NewGore 体逐
//       SpriteFrame/numFrames 赋值（守卫回溯归 id）。
//     · 弹幕：Main.cs Initialize_TileAndNPCData1 内 projFrames 循环+覆写全表
//       （块连续性断言：span 内零杂行，漂移即炸）。
//     · tile：TileDrawing.cs GetTileDrawData 的 tileWidth/tileHeight 常量覆写
//       （typeCache 顶层 switch case 归属，嵌套 switch 不污染）。
//   源 B 本仓帧表：GorePiece.ts FRAME_ROWS / NatureParticles.ts DRIP_GORES+
//     LEAF_GORES / vanilla-projframes.json + Arrow.ts PROJ_GRID / vanilla.json
//     tiles 元数据 + VanillaTiler.ts drawAdjust 字面源矩形。
//   源 C 实际贴图：public/sprites/vanilla/*.png IHDR 直读实测尺寸（零依赖，
//     与 extract-gore pngSize 同范式；pngjs 未入库——IHDR 8B 签名+4B len+'IHDR'
//     +4B w+4B h 即尺寸真值，边界声明见下）。
//
// 对账规则：
//   ① 源 A 声明分帧但源 B 无条目=漏配（1007 形态；gore 按可达域判定：可经
//     GorePiece.newGore 到达者必须被 FRAME_ROWS/业主覆盖；不可达=dormant 注记）。
//   ② 绘制请求源矩形超出源 C 实际尺寸=越界（752 形态：原版 tileWidth/Height 覆写
//     > PNG；drawAdjust fit 字面恒败=同族变体）。
//   ③ 源 B 声明帧数×帧尺寸与源 C 不匹配=竖横排/尺寸错（gore 帧行/PNG 高整除；
//     projFrames 纵切或横切（yoyo 路径 Main.cs:37972 Frame(count,1)）任一整除；
//     PROJ_GRID 格积 ≤ PNG）。
//   ④ 原版权威单帧但源 B 多帧=过配（FRAME_ROWS 键必须有权威多帧条目且行数相等；
//     json 键必须有权威>1 条目；值漂移同轴）。
//   ⑤ tileHeight 覆写×atlas grid 不整除=欠高候选（BJ389：h18/h20 覆写×grid16——
//     非越界（整表直读+fit 守卫）而是欠高少画;三轴分诊=drawAdjust 承载/padOnly
//     探测豁免/underHeightDebt 债登记,候选∉三轴=红;详见 tile 域规则⑤块）。
//
// era guard（docs/era-guard-family.md 处方；基线冻结+重跑 diff 非空即拒+双旗逃生）：
//   · 缺省=干跑对拍：全量重产报告 vs tests/golden/frame-tables-recon.json 逐路径
//     diff，非空 exit 1（源漂移/数据漂移/资产换尺寸全抓住）；findings 通道（扣除
//     已验证豁免）非空独立 exit 1（基线无关的硬闸）。
//   · `--freeze --force-full` 双旗才许重冻金标（单旗拒）；SW_RECON_* 探测注入面
//     任一设置 + --freeze → 拒（g1：探测与写盘分离）。
//   · SW_ITEM_VER 白名单 {1457,1458}（1456 退役拒）。1457↔1458 读域：Gore.cs/
//     GoreID.cs/TileDrawing.cs 整文件逐字节全等（md5 3f7708af/a8018139/d1ce9177），
//     Main.cs 整文件有差但 projFrames 块（:8582-8866）两版同址零杂行且提取全表
//     相等（BJ378 亲测）→ 1458 交叉重放 fingerprint 相等（_meta.ver 豁免 diff，
//     provenance 动态字段家族例外）。
//
// 用法（game/ 目录下）：
//   node tools/recon-frame-tables.mjs                     # 干跑对拍闸
//   node tools/recon-frame-tables.mjs --out /tmp/r.json   # 附带报告沙箱落盘
//   node tools/recon-frame-tables.mjs --freeze --force-full  # 双旗重冻金标
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(join(ROOT, '..', `Terarria${VER}`, 'Terraria', 'Main.cs'))) {
  console.error(`[recon-frames] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚已退役（2026-08-23 基准切 1457；本闸读域 1457↔1458 读域全等）。');
  process.exit(1);
}
const DECOMP = join(ROOT, '..', `Terarria${VER}`);
const GORE_CS = join(DECOMP, 'Terraria', 'Gore.cs');
const GOREID_CS = join(DECOMP, 'Terraria.ID', 'GoreID.cs');
const MAIN_CS = join(DECOMP, 'Terraria', 'Main.cs');
const TILEDRAW_CS = join(DECOMP, 'Terraria.GameContent.Drawing', 'TileDrawing.cs');
const SPRITE_DIR = join(ROOT, 'public', 'sprites', 'vanilla');
const GOLDEN = process.env.SW_RECON_GOLDEN ?? join(ROOT, 'tests', 'golden', 'frame-tables-recon.json');

// 探测注入面（测试专用；缺省=真实现库路径）。任一设置 + --freeze → 拒（g1）。
const INJECT_ENVS = ['SW_RECON_GOREPIECE_SRC', 'SW_RECON_NATURE_SRC', 'SW_RECON_ARROW_SRC',
  'SW_RECON_VTILER_SRC', 'SW_RECON_PROJFRAMES_JSON', 'SW_RECON_ATLAS_JSON', 'SW_RECON_GORE_JSON'];
const GOREPIECE_TS = process.env.SW_RECON_GOREPIECE_SRC ?? join(ROOT, 'src', 'entities', 'GorePiece.ts');
const NATURE_TS = process.env.SW_RECON_NATURE_SRC ?? join(ROOT, 'src', 'render', 'NatureParticles.ts');
const ARROW_TS = process.env.SW_RECON_ARROW_SRC ?? join(ROOT, 'src', 'entities', 'Arrow.ts');
const VTILER_TS = process.env.SW_RECON_VTILER_SRC ?? join(ROOT, 'src', 'render', 'VanillaTiler.ts');
const PROJFRAMES_JSON = process.env.SW_RECON_PROJFRAMES_JSON ?? join(ROOT, 'src', 'data', 'vanilla-projframes.json');
const ATLAS_JSON = process.env.SW_RECON_ATLAS_JSON ?? join(ROOT, 'public', 'sprites', 'vanilla.json');
const GORE_JSON = process.env.SW_RECON_GORE_JSON ?? join(ROOT, 'src', 'data', 'vanilla-gore.json');

const FREEZE = process.argv.includes('--freeze');
const FORCE_FULL = process.argv.includes('--force-full');
const OUT_ARG = (() => {
  const i = process.argv.indexOf('--out');
  return i >= 0 ? process.argv[i + 1] : (process.env.SW_OUT || null);
})();
if (FREEZE && !FORCE_FULL) {
  console.error('[recon-frames] 拒绝：--freeze 须与 --force-full 双旗同给（era guard 逃生门=双旗，单旗拒）。');
  process.exit(1);
}
if (FREEZE && INJECT_ENVS.some((k) => process.env[k] !== undefined)) {
  console.error('[recon-frames] 拒绝：探测注入面（' + INJECT_ENVS.filter((k) => process.env[k] !== undefined).join('/')
    + '）已设置而 --freeze 将写真实金标（g1：探测与写盘分离 fail-closed）。');
  process.exit(1);
}

/** 锚断言 fail-loud（禁静默兜底——源码漂移即退出） */
function must(cond, msg) {
  if (!cond) { console.error('[recon-frames] FATAL: ' + msg); process.exit(2); }
}

// ============ PNG 尺寸（IHDR 直读：8B 签名 + 4B len + 4B 'IHDR' + 4B w + 4B h） ============
const pngCache = new Map();
function pngSize(file) {
  const key = file;
  if (pngCache.has(key)) return pngCache.get(key);
  let out = null;
  try {
    const p = join(SPRITE_DIR, file);
    if (existsSync(p)) {
      const b = readFileSync(p);
      if (b.length > 24 && b.readUInt32BE(12) === 0x49484452) out = [b.readUInt32BE(16), b.readUInt32BE(20)];
    }
  } catch { /* 缺贴图/坏 IHDR → null（ findings 通道裁决） */ }
  pngCache.set(key, out);
  return out;
}
const gorePng = (id) => pngSize(`Gore_${id}.png`);
const projPng = (id) => pngSize(`Projectile_${id}.png`);
const tilePng = (id) => pngSize(`Tiles_${id}.png`);

// ============ 反编译源通用切片 ============
function methodBodyLines(file, sigText, nextSigRe) {
  const src = readFileSync(file, 'utf8').split('\n');
  const start = src.findIndex((l) => l.includes(sigText));
  must(start >= 0, `${file} 找不到签名「${sigText}」（反编译面漂移，禁止静默半表）`);
  let end = src.length;
  if (nextSigRe) {
    for (let i = start + 1; i < src.length; i++) { if (nextSigRe.test(src[i])) { end = i; break; } }
  } else {
    let d = 0, seen = false;
    for (let i = start; i < src.length; i++) {
      for (const c of src[i]) { if (c === '{') { d++; seen = true; } else if (c === '}') d--; }
      if (seen && d === 0) { end = i + 1; break; }
    }
  }
  return { lines: src.slice(start, end), startLine: start + 1, endLine: end, total: src.length };
}
/** 物理行 → 逻辑行（括号深度拼接，extract-gore 同范式） */
function logicalLines(lines) {
  const out = [];
  let buf = null;
  for (let i = 0; i < lines.length; i++) {
    let d = 0;
    for (const c of lines[i]) { if (c === '(') d++; else if (c === ')') d--; }
    if (!buf) buf = { text: lines[i], line: i + 1, depthEnd: d };
    else { buf.text += ' ' + lines[i].trim(); buf.depthEnd += d; }
    if (buf.depthEnd <= 0) { out.push(buf); buf = null; }
  }
  if (buf) out.push(buf);
  return out;
}

// ================= 域 A1：gore 权威帧结构 =================
/** GoreID.cs:9 SpecialAI（CreateIntSet(default, id, v, ...)）+ :15 IsDrip（CreateBoolSet） */
function extractGoreIDSets() {
  const src = readFileSync(GOREID_CS, 'utf8').split('\n');
  const specialLine = src.findIndex((l) => l.includes('SpecialAI = Factory.CreateIntSet('));
  must(specialLine >= 0, 'GoreID.cs 找不到 SpecialAI = Factory.CreateIntSet(');
  const nums = [...src[specialLine].matchAll(/-?\d+/g)].map((m) => +m[0]);
  must(nums.length >= 2 && (nums.length - 1) % 2 === 0, `GoreID.cs:SpecialAI 数对畸形（${nums.length} 个数字）`);
  const specialAI = { default: nums[0] };
  for (let i = 1; i < nums.length; i += 2) specialAI[nums[i]] = nums[i + 1];
  const dripLine = src.findIndex((l) => l.includes('IsDrip = Factory.CreateBoolSet('));
  must(dripLine >= 0, 'GoreID.cs 找不到 IsDrip = Factory.CreateBoolSet(');
  const dripIds = [...src[dripLine].matchAll(/(\d+)/g)].map((m) => +m[1]);
  must(dripIds.length === 18, `GoreID.cs:IsDrip 基数 ${dripIds.length} ≠ 18（漂移即炸）`);
  return { specialAI, dripIds, specialLine: specialLine + 1, dripLine: dripLine + 1 };
}

/** Gore.cs NewGore 体 → 逐 id 帧结构 {cols, rows, src} */
function extractGoreFrames() {
  const { lines, startLine, endLine } = methodBodyLines(
    GORE_CS, 'public static int NewGore(Vector2 Position, Vector2 Velocity, int Type, float Scale = 1f)',
    /^\t(?:public|private|internal) static/);
  const L = logicalLines(lines);
  const frames = {};   // id → {cols, rows, src, line}
  let defaultLine = null;
  let pendingGuard = null;   // 最近 if(Type...) 守卫文本（'}' 清空）
  let specialAI3Site = null;
  let flagArmIds = null;
  const numFramesSites = [];
  const literalSites = [];
  const anchor = (rel) => startLine + rel - 1;
  for (const l of L) {
    const t = l.text.trim();
    if (/^}$/.test(t)) { pendingGuard = null; continue; }
    const im = t.match(/^if \((Type[^)]*)\)$/);
    if (im) { pendingGuard = im[1].trim(); continue; }
    if (/^if \(num2 == 3\)$/.test(t)) { pendingGuard = 'SpecialAI==3'; continue; }
    // 默认帧（无守卫）
    let m = t.match(/^Main\.gore\[num\]\.Frame = new SpriteFrame\((\d+), (\d+)\);$/);
    if (m) {
      if (pendingGuard) {
        const ids = guardIds(pendingGuard);
        literalSites.push({ ids, cols: +m[1], rows: +m[2], guard: pendingGuard, line: l.line });
        for (const id of ids) frames[id] = { cols: +m[1], rows: +m[2], src: `NewGore :${anchor(l.line)} ${pendingGuard}`, line: anchor(l.line) };
      } else if (defaultLine === null) {
        defaultLine = l.line;   // :1341 SpriteFrame(1,1)
      } else {
        must(false, `Gore.cs NewGore 出现第二个无守卫 SpriteFrame 赋值（物理行 ${anchor(l.line)}）——守卫解析漂移`);
      }
      continue;
    }
    // SpecialAI==3：SpriteFrame((!flag)?1:32, 8)
    if ((m = t.match(/new SpriteFrame\(\(byte\)\(\(!flag\) \? (\d+)u : (\d+)u\), (\d+)\)/))) {
      must(pendingGuard === 'SpecialAI==3', `Gore.cs SpecialAI3 SpriteFrame 锚失配（守卫=${pendingGuard}，行 ${anchor(l.line)}）`);
      const flagLine = L.find((x) => /^bool flag = /.test(x.text.trim()));
      must(!!flagLine, 'Gore.cs SpecialAI3 flag 表达式缺失');
      flagArmIds = parseFlagArm(flagLine.text.trim());
      // 源形 `((!flag) ? 1u : 32u)`：!flag 臂=m[1]、flag 臂=m[2]（1457 真值 1/32，
      // 32 列=油漆色变体列——NatureParticles LEAF_GORES 业主消费）
      specialAI3Site = { colsNotFlag: +m[1], colsFlag: +m[2], rows: +m[3], line: l.line };
      must(specialAI3Site.colsFlag === 32 && specialAI3Site.colsNotFlag === 1,
        `Gore.cs SpecialAI3 列数锚失配（flag 臂=${specialAI3Site.colsFlag}/非 flag 臂=${specialAI3Site.colsNotFlag}，期望 32/1）`);
      continue;
    }
    // numFrames 赋值（=RowCount=竖排行数，Gore.cs:95-102 setter 亲证）
    if ((m = t.match(/^Main\.gore\[num\]\.numFrames = (\d+);$/))) {
      must(pendingGuard, `Gore.cs numFrames=${m[1]} 无守卫（行 ${anchor(l.line)}）——解析漂移`);
      numFramesSites.push({ guard: pendingGuard, rows: +m[1], line: l.line });
      const ids = pendingGuard.includes('IsDrip') ? 'IS_DRIP' : guardIds(pendingGuard);
      must(ids !== null, `Gore.cs numFrames 守卫不可归 id：${pendingGuard}（行 ${anchor(l.line)}）`);
      const resolved = ids === 'IS_DRIP' ? null : ids;   // IsDrip 由调用方灌集
      if (resolved) for (const id of resolved) frames[id] = { cols: 1, rows: +m[1], src: `NewGore :${anchor(l.line)} numFrames=${m[1]} (${pendingGuard})`, line: anchor(l.line) };
      else numFramesSites[numFramesSites.length - 1].isDrip = true;
      continue;
    }
  }
  must(defaultLine !== null, 'Gore.cs NewGore 缺默认 SpriteFrame(1,1) 赋值');
  must(literalSites.length === 3, `Gore.cs NewGore 字面 SpriteFrame 赋值 ${literalSites.length} ≠ 3（1201/1208、1217/1218、1225）——锚漂移`);
  must(numFramesSites.length === 2, `Gore.cs NewGore numFrames 赋值 ${numFramesSites.length} ≠ 2（IsDrip 15 / 907-909 3）——锚漂移`);
  must(specialAI3Site && specialAI3Site.rows === 8, 'Gore.cs SpecialAI3 SpriteFrame(...,8) 锚失配');
  must(flagArmIds && flagArmIds.length === 35, `SpecialAI3 flag 臂基数 ${flagArmIds?.length} ≠ 35（910-925/1113-1121/1248-1255/1257/1278）`);
  // IsDrip 15 行
  return { frames, defaultLine: anchor(defaultLine), literalSites, numFramesSites, specialAI3Site, flagArmIds, span: [startLine, endLine] };

  /** 'Type == 1201 || Type == 1208' / 'Type >= 907 && Type <= 909' → id 数组 */
  function guardIds(g) {
    const ids = [];
    const eq = [...g.matchAll(/Type == (\d+)/g)].map((m) => +m[1]);
    ids.push(...eq);
    const rg = [...g.matchAll(/Type >= (\d+) && Type <= (\d+)/g)];
    for (const m of rg) for (let i = +m[1]; i <= +m[2]; i++) ids.push(i);
    return ids;
  }
  /** flag 表达式 → 32 列臂 id 集 */
  function parseFlagArm(expr) {
    const ids = [];
    for (const m of expr.matchAll(/Type >= (\d+) && Type <= (\d+)/g)) for (let i = +m[1]; i <= +m[2]; i++) ids.push(i);
    for (const m of expr.matchAll(/Type == (\d+)/g)) ids.push(+m[1]);
    return ids;
  }
}

// ================= 域 A2：projFrames 权威（Main.cs） =================
function extractProjFrames() {
  const src = readFileSync(MAIN_CS, 'utf8').split('\n');
  const mStart = src.findIndex((l) => l.includes('private static void Initialize_TileAndNPCData1()'));
  must(mStart >= 0, 'Main.cs 找不到 Initialize_TileAndNPCData1()');
  // 循环赋 1 锚
  let loopLine = -1;
  for (let i = mStart; i < Math.min(mStart + 20, src.length); i++) {
    if (/for \(int j = 0; j < ProjectileID\.Count; j\+\+\)/.test(src[i])) { loopLine = i; break; }
  }
  must(loopLine >= 0, 'Main.cs Initialize_TileAndNPCData1 缺 projFrames 循环赋 1 锚');
  let initLine = -1;
  for (let i = loopLine; i < Math.min(loopLine + 4, src.length); i++) {
    if (/projFrames\[j\] = 1;/.test(src[i])) { initLine = i; break; }
  }
  must(initLine >= 0, 'Main.cs projFrames[j] = 1 循环体锚失配');
  // 收集字面赋值：自首条起连续推进，遇到连续性破口即断（块内零杂行断言）
  const map = {}; const dupes = [];
  let i = initLine + 1, firstAssign = -1, lastAssign = -1;
  for (; i < src.length; i++) {
    const m = src[i].match(/^\s*projFrames\[(\d+)\] = (\d+);$/);
    if (m) {
      if (firstAssign < 0) firstAssign = i;
      lastAssign = i;
      const id = m[1];
      if (map[id] !== undefined) dupes.push({ id: +id, value: +m[2], line: i + 1, prev: map[id] });
      map[id] = +m[2];
      continue;
    }
    if (firstAssign >= 0 && /\S/.test(src[i])) break;   // 块结束（首个非空非赋值行）
  }
  must(firstAssign >= 0 && lastAssign >= 0, 'Main.cs projFrames 覆写表为空——锚漂移');
  // 连续性断言：first..last span 内零杂行（1457/1458 实测 0；漂移即炸强制复核）
  let foreign = 0;
  for (let k = firstAssign; k <= lastAssign; k++) if (!/^\s*projFrames\[\d+\] = \d+;$/.test(src[k]) && /\S/.test(src[k])) foreign++;
  must(foreign === 0, `Main.cs projFrames 覆写块 span 内杂行 ${foreign} ≠ 0（:${firstAssign + 1}-:${lastAssign + 1}）——块结构漂移，须人工复核重锚`);
  must(Object.keys(map).length >= 280, `projFrames 覆写基数 ${Object.keys(map).length} < 280（地板护栏）`);
  return { map, dupes, loopLine: loopLine + 1, span: [firstAssign + 1, lastAssign + 1] };
}

// ================= 域 A3：tile tileWidth/tileHeight 覆写（TileDrawing.cs） =================
function extractTileDrawSizes() {
  const src = readFileSync(TILEDRAW_CS, 'utf8').split('\n');
  const start = src.findIndex((l) => l.includes('private void GetTileDrawData('));
  must(start >= 0, 'TileDrawing.cs 找不到 GetTileDrawData(');
  let end = src.length;
  for (let i = start + 1; i < src.length; i++) { if (/^\t(?:private|public|internal) /.test(src[i])) { end = i; break; } }
  const L = src.slice(start, end);
  let depth = 0;
  const switchStack = [];   // {depth, isTop}
  let curIds = null, inTop = false;
  const map = {}; const lineOf = {};
  for (let ln = 0; ln < L.length; ln++) {
    const line = L[ln];
    const sw = line.match(/switch\s*\((\w+)\)/);
    if (sw) switchStack.push({ depth, isTop: switchStack.length === 0 && sw[1] === 'typeCache' });
    for (const c of line) {
      if (c === '{') depth++;
      else if (c === '}') { depth--; while (switchStack.length && switchStack[switchStack.length - 1].depth >= depth) switchStack.pop(); }
    }
    const top = switchStack[switchStack.length - 1];
    if (top && top.isTop) {
      const cl = [...line.matchAll(/case (\d+):/g)].map((m) => +m[1]);
      // ★BJ389 fall-through 累加修正：C# case 标签组（case A: case B: … 共享体）此前
      //  逐行【替换】curIds=只有末位标签被记账（40 条 vs 真值 103 条——h18 家具族
      //  :4954-4982 的 16/17/26/32/…/715 全部漏记,仅 716 存活）。改为累加,遇
      //  break/return（仅顶 switch 层——嵌套 switch 的 break 不清组）或 default 复位。
      if (cl.length) { curIds = [...(curIds ?? []), ...cl]; inTop = true; }
      else if (/^\t*default:/.test(line)) { curIds = null; inTop = false; }
    }
    const am = line.match(/^\s*tile(Width|Height)\s*=\s*(\d+);/);
    if (am && inTop && curIds) {
      const v = +am[2], key = am[1] === 'Width' ? 'w' : 'h';
      for (const id of curIds) {
        map[id] = map[id] || {};
        map[id][key] = Math.max(map[id][key] ?? 0, v);
        lineOf[id] = start + ln + 1;
      }
    }
    if (curIds && top && top.isTop && /^\s*(break|return)\b/.test(line)) curIds = null;
  }
  const n = Object.keys(map).length;
  // ★BJ389：fall-through 修正后真值 103（40 旧值=漏记基线）。TileDrawing.cs
  //  1457↔1458 逐字节全等（md5 d1ce9177）→ 两版同值;漂移即炸强制重定谳。
  must(n === 103, `GetTileDrawData tileWidth/tileHeight 覆写基数 ${n} ≠ 103（BJ389 fall-through 修正基线;漂移即炸重定谳）`);
  return { map, lineOf, span: [start + 1, end] };
}

// ================= 域 B1：本仓 gore 帧表 + 可达域 =================
function parseFrameRows() {
  const src = readFileSync(GOREPIECE_TS, 'utf8');
  const m = src.match(/const FRAME_ROWS: Record<number, number> = \{([^}]*)\}/);
  must(m, 'GorePiece.ts 找不到 FRAME_ROWS 声明（漂移即炸）');
  const rows = {};
  for (const e of m[1].matchAll(/(\d+):\s*(\d+)/g)) rows[+e[1]] = +e[2];
  must(Object.keys(rows).length >= 6, `FRAME_ROWS 基数 ${Object.keys(rows).length} < 6（地板护栏,整表丢失即炸;判别面注入允许逐条摘除）`);
  return rows;
}
function parseNatureSets() {
  const src = readFileSync(NATURE_TS, 'utf8');
  const dm = src.match(/const DRIP_GORES = new Set\(\[([^\]]*)\]\)/);
  must(dm, 'NatureParticles.ts 找不到 DRIP_GORES 字面集');
  const drips = [...dm[1].matchAll(/(\d+)/g)].map((m) => +m[1]);
  must(drips.length === 18, `DRIP_GORES 基数 ${drips.length} ≠ 18`);
  const lm = src.match(/const LEAF_GORES = new Set\(\[([\s\S]*?)\]\);/);
  must(lm, 'NatureParticles.ts 找不到 LEAF_GORES 字面集');
  const leaves = [];
  // 形态：`Array.from({ length: END - START + 1 }, (_, i) => START + i)`
  for (const m of lm[1].matchAll(/length: (\d+) - (\d+) \+ 1 \}, \(_, i\) => (\d+) \+ i/g)) {
    must(+m[3] === +m[2] && +m[2] <= +m[1], `LEAF_GORES 区间畸形：${m[0]}`);
    for (let i = +m[2]; i <= +m[1]; i++) leaves.push(i);
  }
  for (const m of lm[1].matchAll(/(?<![+\w])(\d+)(?![+\w])/g)) {
    const v = +m[1];
    if (!leaves.includes(v) && v >= 900) leaves.push(v);   // 裸 id（排除区间算式数字）
  }
  leaves.sort((a, b) => a - b);
  must(leaves.length === 35, `LEAF_GORES 基数 ${leaves.length} ≠ 35（910-925/1113-1121/1248-1255/1257/1278）`);
  // 业主切片锚（漏掉=ownerGap 豁免失效）
  must(/img\.height \/ 15/.test(src), 'NatureParticles.ts 滴水 15 行切片锚（img.height / 15）缺失');
  must(/img\.width \/ 32/.test(src) && /img\.height \/ 8/.test(src), 'NatureParticles.ts 落叶 32×8 网格切片锚缺失');
  return { drips, leaves };
}
/** 可达域：vanilla-gore.json 表 id ∪ _meta.tex 直调面 ∪ src/**.ts 字面 newGore(N) ∪ ChildSafety 11-13 */
function goreUniverse() {
  const ids = new Set([11, 12, 13]);   // ChildSafety 替换族（Gore.NewGore :1339-1345）
  const from = { table: 0, tex: 0, callsites: [] };
  const g = JSON.parse(readFileSync(GORE_JSON, 'utf8'));
  for (const k of Object.keys(g)) {
    if (k === '_meta') continue;
    for (const e of g[k]) {
      if (e.id != null) { ids.add(e.id); from.table++; }
      if (e.idAlt != null) { ids.add(e.idAlt); from.table++; }
      if (e.idMin != null) for (let i = e.idMin; i <= (e.idMax ?? e.idMin); i++) ids.add(i);
      if (e.ids) for (const x of e.ids) { ids.add(x); from.table++; }
    }
  }
  for (const k of Object.keys(g._meta?.tex ?? {})) { ids.add(+k); from.tex++; }
  // src/**.ts 字面调用点（确定性遍历：目录序排序，仅 src/ 游戏运行时面，不含 tests/）
  const walk = (dir) => {
    const out = [];
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) out.push(...walk(p));
      else if (name.endsWith('.ts')) out.push(p);
    }
    return out;
  };
  for (const f of walk(join(ROOT, 'src'))) {
    const txt = readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/\bnewGore\(\s*(\d+)/g)) from.callsites.push(+m[1]);
  }
  for (const id of from.callsites) ids.add(id);
  return { ids: [...ids].sort((a, b) => a - b), from, goreJson: g };
}

// ================= 域 B2：本仓 proj 帧 =================
function parseProjGrid() {
  const src = readFileSync(ARROW_TS, 'utf8');
  const m = src.match(/const PROJ_GRID: Record<string, ProjGrid> = \{([\s\S]*?)\};/);
  must(m, 'Arrow.ts 找不到 PROJ_GRID 字面表');
  const grid = {};
  for (const e of m[1].matchAll(/(\d+):\s*\{\s*cols:\s*(\d+),\s*rows:\s*(\d+),\s*cw:\s*(\d+),\s*ch:\s*(\d+),\s*fw:\s*(\d+),\s*fh:\s*(\d+)/g)) {
    grid[+e[1]] = { cols: +e[2], rows: +e[3], cw: +e[4], ch: +e[5], fw: +e[6], fh: +e[7] };
  }
  must(Object.keys(grid).length === 4, `PROJ_GRID 基数 ${Object.keys(grid).length} ≠ 4（1094/1113/1092/660）`);
  return grid;
}

// ================= 域 B3：本仓 tile 绘制源矩形 =================
function parseDrawAdjust() {
  const src = readFileSync(VTILER_TS, 'utf8').split('\n');
  const s = src.findIndex((l) => l.includes('export function drawAdjust('));
  must(s >= 0, 'VanillaTiler.ts 找不到 drawAdjust(');
  let e = -1;
  for (let i = s + 1; i < src.length; i++) { if (/^}/.test(src[i])) { e = i; break; } }
  must(e > s, 'drawAdjust 函数体未闭合');
  const L = src.slice(s, e);
  let depth = 0, curIds = null;
  const cases = {};   // id → { fit:[[w,h]], sw:[], sh:[], has752ClampBand }
  const ensure = (ids) => { for (const id of ids) cases[id] = cases[id] || { fit: [], sw: [], sh: [] }; };
  for (const line of L) {
    const cl = [...line.matchAll(/case (\d+):/g)].map((m) => +m[1]);
    // ★BJ389 fall-through 累加修正（同 extractTileDrawSizes）：多行 case 标签组此前
    //  只有末行标签存活到 body 行（h20 植物家具族 case 3/24/…/84 整批漏记）。
    if (cl.length && depth <= 2) { curIds = [...(curIds ?? []), ...cl]; ensure(curIds); }
    for (const c of line) { if (c === '{') depth++; else if (c === '}') depth--; }
    if (!curIds) continue;
    for (const m of line.matchAll(/fit\([^,]+,\s*[^,]+,\s*(\d+),\s*(\d+)\)/g)) {
      for (const id of curIds) cases[id].fit.push([+m[1], +m[2]]);
    }
    const sm = line.match(/a\.sw\s*=\s*(\d+)/), hm = line.match(/a\.sh\s*=\s*(\d+)/);
    if (sm) for (const id of curIds) cases[id].sw.push(+sm[1]);
    if (hm) for (const id of curIds) cases[id].sh.push(+hm[1]);
    // break 复位在本行 body 捕获【之后】（同行 case+体+break 的紧凑 case 才不失记）
    if (/break;/.test(line)) curIds = null;
  }
  must(Object.keys(cases).length >= 80, `drawAdjust 覆盖 ${Object.keys(cases).length} < 80（地板护栏）`);
  // 752 豁免锚：case 752 + clampBand（BJ366 FNA 越界带补画）
  const body = L.join('\n');
  const c752 = /\bcase 752:\s*\{[\s\S]*?clampBand[\s\S]*?break;/.test(body);
  // ★BJ389：HEIGHT_18 集合缺省臂（规则⑤覆盖轴 b）——集合字面 + default 臂锚双提取
  const full = src.join('\n');
  const h18m = full.match(/const HEIGHT_18 = new Set\(\[([^\]]*)\]\)/);
  must(h18m, 'VanillaTiler.ts 找不到 HEIGHT_18 集合字面（规则⑤覆盖轴 b 锚漂移）');
  const height18 = new Set([...h18m[1].matchAll(/(\d+)/g)].map((m) => +m[1]));
  must(height18.size >= 40, `HEIGHT_18 基数 ${height18.size} < 40（地板护栏,漂移即炸）`);
  const height18Anchor = body.includes('if (HEIGHT_18.has(sheet)) a.sh = 18;');
  return { cases, c752, height18, height18Anchor };
}
function parseAtlas() {
  const j = JSON.parse(readFileSync(ATLAS_JSON, 'utf8'));
  must(j.tiles && Object.keys(j.tiles).length >= 700, `vanilla.json tiles 基数 ${Object.keys(j.tiles)?.length} < 700`);
  return j.tiles;
}

// ================= 主流程：三域对账 =================
const report = { _meta: {}, gore: {}, proj: {}, tile: {} };

// ---- gore ----
{
  const ids = extractGoreIDSets();
  const gf = extractGoreFrames();
  const frameRows = parseFrameRows();
  const nature = parseNatureSets();
  const uni = goreUniverse();
  const specialAI3 = Object.entries(ids.specialAI).filter(([k, v]) => k !== 'default' && v === 3).map(([k]) => +k).sort((a, b) => a - b);
  // SpecialAI3 权威帧：flag 臂 32 列 / 其余（1007/1008）1 列，行 8
  const authority = {};
  for (const id of specialAI3) {
    const cols = gf.flagArmIds.includes(id) ? gf.specialAI3Site.colsFlag : gf.specialAI3Site.colsNotFlag;
    authority[id] = { cols, rows: gf.specialAI3Site.rows, src: `NewGore SpecialAI==3 :${gf.span[0] + gf.specialAI3Site.line - 1}` };
  }
  for (const [id, f] of Object.entries(gf.frames)) authority[+id] = { cols: f.cols, rows: f.rows, src: f.src };
  for (const site of gf.numFramesSites) {
    if (site.isDrip) for (const id of ids.dripIds) authority[id] = { cols: 1, rows: site.rows, src: `NewGore :${gf.span[0] + site.line - 1} numFrames=${site.rows} (IsDrip)` };
  }
  // 权威基数断言：63 个多帧 id（drip 18 + 907-909 + 1201/1208 + 1217/1218/1225 + SpecialAI3 37）
  const multi = Object.keys(authority).map(Number).sort((a, b) => a - b);
  must(multi.length === 63, `gore 权威多帧基数 ${multi.length} ≠ 63（drip18+907-909+1201/1208+1217/1218/1225+SpecialAI3 37）——锚漂移`);

  const universe = new Set(uni.ids);
  const findings = { missing: [], over: [], sizeMismatch: [], ownerGap: [] };
  const dormant = [];
  for (const id of multi) {
    const a = authority[id];
    const ownedByNature = nature.drips.includes(id) || nature.leaves.includes(id);
    if (frameRows[id] !== undefined) {
      if (frameRows[id] !== a.rows || a.cols !== 1) {
        findings.over.push({ id, frameRows: frameRows[id], authority: a });
      }
      continue;
    }
    if (ownedByNature) {
      // 业主覆盖（滴水/落叶，切片锚已在 parseNatureSets 断言）。但若该 id 同时可经
      // GorePiece.newGore 到达（死亡表/直调面/字面调用点），GorePiece 侧 frameRows=1
      // 会整条画出——同为 1007 形态，必须红。
      if (universe.has(id)) findings.missing.push({ id, authority: a, via: 'natureOwnerButGorePieceReachable' });
      continue;
    }
    // （M-A 变异锚：判别面测试摘本闸=替换花括号内语句，须保持自包含块）
    if (universe.has(id)) { findings.missing.push({ id, authority: a, via: 'GorePiece-reachable' }); }
    else { dormant.push({ id, authority: a }); }
  }
  // 规则④补轴：FRAME_ROWS 键必须有权威多帧条目（键不在权威=权威单帧而源 B 多帧）
  for (const idStr of Object.keys(frameRows)) {
    if (!multi.includes(+idStr)) findings.over.push({ id: +idStr, frameRows: frameRows[+idStr], authority: null, via: 'notInVanillaAuthority' });
  }
  // 规则③：FRAME_ROWS×PNG 尺寸
  for (const [idStr, rows] of Object.entries(frameRows)) {
    const id = +idStr;
    const s = gorePng(id);
    if (!s) { findings.sizeMismatch.push({ id, kind: 'pngMissing' }); continue; }
    if (s[1] % rows !== 0) findings.sizeMismatch.push({ id, kind: 'heightIndivisible', h: s[1], rows });
  }
  // 业主集与权威集等价（漏 id/多 id 都是 1007 形态的变体）
  const authDrip = multi.filter((id) => authority[id].rows === 15).sort((a, b) => a - b);
  const authLeaf = multi.filter((id) => authority[id].cols === 32).sort((a, b) => a - b);
  const setDiff = (a, b) => [...a.filter((x) => !b.includes(x)), ...b.filter((x) => !a.includes(x))].sort((x, y) => x - y);
  const dd = setDiff(authDrip, [...nature.drips].sort((a, b) => a - b));
  if (dd.length) findings.ownerGap.push({ kind: 'dripSet', diff: dd });
  const dl = setDiff(authLeaf, [...nature.leaves].sort((a, b) => a - b));
  if (dl.length) findings.ownerGap.push({ kind: 'leafSet', diff: dl });
  // 滴水/落叶 PNG 容量
  for (const id of nature.drips) {
    const s = gorePng(id);
    if (!s) { findings.sizeMismatch.push({ id, kind: 'pngMissing', owner: 'drip' }); continue; }
    if (s[1] % 15 !== 0) findings.sizeMismatch.push({ id, kind: 'heightIndivisible', h: s[1], rows: 15, owner: 'drip' });
  }
  for (const id of nature.leaves) {
    const s = gorePng(id);
    if (!s) { findings.sizeMismatch.push({ id, kind: 'pngMissing', owner: 'leaf' }); continue; }
    if (s[0] % 32 !== 0 || s[1] % 8 !== 0) findings.sizeMismatch.push({ id, kind: 'gridIndivisible', w: s[0], h: s[1], grid: [32, 8], owner: 'leaf' });
  }
  // 贴图面（universe 全量 IHDR）
  const png = {};
  let texMissing = 0;
  for (const id of uni.ids) {
    const s = gorePng(id);
    if (s) png[id] = s; else { texMissing++; png[id] = null; }
  }
  report.gore = {
    authority: Object.fromEntries(multi.map((id) => [id, authority[id]])),
    multiFrameCount: multi.length,
    frameRows,
    dripSet: [...nature.drips].sort((a, b) => a - b),
    leafSet: [...nature.leaves].sort((a, b) => a - b),
    universe: { count: uni.ids.length, fromTable: uni.from.table, fromTex: uni.from.tex, callsites: [...new Set(uni.from.callsites)].sort((a, b) => a - b), childSafety: [11, 12, 13] },
    png,
    texMissing,
    findings,
    dormant,
  };
  report._meta.gore = {
    specialAILine: ids.specialLine, isDripLine: ids.dripLine,
    newGoreSpan: gf.span, newGoreDefaultLine: gf.defaultLine,
    specialAI3Line: gf.span[0] + gf.specialAI3Site.line - 1,
    specialAI3FlagArm: gf.flagArmIds,
    projNote: undefined,
  };
}

// ---- proj ----
{
  const pf = extractProjFrames();
  const live = JSON.parse(readFileSync(PROJFRAMES_JSON, 'utf8'));
  const grid = parseProjGrid();
  const A = pf.map;
  const findings = { missing: [], over: [], drift: [], sizeMismatch: [], pngMissing: [], gridFit: [] };
  for (const [k, v] of Object.entries(A)) {
    if (v > 1 && live[k] === undefined) findings.missing.push({ id: +k, frames: v });
    if (live[k] !== undefined && live[k] !== v) findings.drift.push({ id: +k, live: live[k], authority: v });
  }
  for (const [k, v] of Object.entries(live)) {
    if (A[k] === undefined) findings.over.push({ id: +k, live: v, authority: A[k] ?? 1 });
    else if (A[k] === 1 && v !== 1) findings.over.push({ id: +k, live: v, authority: 1 });
  }
  // 规则③：帧数×帧尺寸 vs PNG（纵切 Frame(1,count) 缺省；横切 Frame(count,1)=yoyo 路径
  // Main.cs:37972——任一方向整除即过；双不整除=竖横排/尺寸错候选，逐条 triage）
  const png = {};
  for (const k of Object.keys(live)) {
    const id = +k, f = live[k];
    const s = projPng(id);
    if (!s) { findings.pngMissing.push({ id }); png[id] = null; continue; }
    png[id] = s;
    const g = grid[id];
    if (g) {
      // 网格型：格积 ≤ PNG（步距/帧矩形双验）
      if (g.cols * g.cw > s[0] || g.rows * g.ch > s[1]) findings.gridFit.push({ id, grid: g, png: s });
      if (f !== g.cols * g.rows) findings.drift.push({ id, live: f, gridCount: g.cols * g.rows });
      continue;
    }
    if (s[1] % f !== 0 && s[0] % f !== 0) findings.sizeMismatch.push({ id, frames: f, w: s[0], h: s[1] });
  }
  // 网格型全量贴合闸（含非 live-json 的 1094/1113/660——格积/PNG 资产面全冻结）
  for (const [k, g] of Object.entries(grid)) {
    const id = +k;
    const s = projPng(id);
    if (!s) { findings.pngMissing.push({ id, face: 'grid' }); continue; }
    if (!png[id]) png[id] = s;
    if (g.cols * g.cw > s[0] || g.rows * g.ch > s[1]) findings.gridFit.push({ id, grid: g, png: s });
  }
  // 豁免登记（验证锚失配即重 fired）
  const exempt = [];
  const mainText = readFileSync(MAIN_CS, 'utf8');
  for (const id of [1094, 1113, 660]) {
    const g = grid[id];
    // 锚用反编译器改名鲁棒式（★BJ378 教训：num389 局部号 1457↔1458 会重排——
    // 字面 num 锚在 1458 交叉重放假红；矩形算式形状锚跨版稳定）
    const anchorOk = id === 660
      ? mainText.includes('Rectangle(38 * proj.frame, 0, 38, 38)')
      : /new (?:Microsoft\.Xna\.Framework\.)?Rectangle\(\w+ \* 64, \w+ \* 46, 62, 44\)/.test(mainText);
    exempt.push({
      id, kind: 'gridOverConfig', grid: g ?? null, anchorOk,
      anchor: id === 660
        ? `Main.cs:30974-30980（专支横切 Rectangle(38*frame,0,38,38)）+ Arrow.ts PROJ_GRID 注`
        : `Main.cs:33738-33742（火绒狐手写矩形 num389*64/num390*46/62,44）+ Arrow.ts PROJ_GRID 注`,
    });
    // 豁免只遮蔽 over 类；网格贴合仍走 gridFit 闸
    findings.over = findings.over.filter((f) => !(f.id === id && g));
    findings.sizeMismatch = findings.sizeMismatch.filter((f) => f.id !== id);
  }
  for (const e of [
    { id: 1092, kind: 'gridOwned', anchor: 'Main.cs:8859 projFrames[1092]=54=6×9 与 Arrow.ts PROJ_GRID 格积一致' },
    { id: 1130, kind: 'degenerateTex', anchor: 'Projectile_1130.png 2×2：FNA Frame(1,6) 宽 2/6=0 与本仓 round(2/6)=0 双侧零绘制（行为等价）' },
  ]) {
    exempt.push({ ...e, ok: e.id === 1092 ? !!(grid[1092] && A[1092] === grid[1092].cols * grid[1092].rows) : JSON.stringify(projPng(1130)) === '[2,2]' });
    findings.sizeMismatch = findings.sizeMismatch.filter((f) => f.id !== e.id);
  }
  report.proj = {
    authority: Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v]).sort((a, b) => a[0] - b[0])),
    authorityCount: Object.keys(A).length,
    loopAssignLine: pf.loopLine, assignSpan: pf.span, dupes: pf.dupes,
    live,
    grid,
    png,
    findings,
    exempt,
  };
  report._meta.proj = { mainSpan: pf.span, loopLine: pf.loopLine };
}

// ---- tile ----
{
  const td = extractTileDrawSizes();
  const { cases, c752, height18, height18Anchor } = parseDrawAdjust();
  const tiles = parseAtlas();
  const findings = { vanillaOOB: [], deadFit: [], atlasGridOOB: [], atlasPngMissing: [], rule5: [] };
  const exempt = [];
  for (const [k, o] of Object.entries(td.map)) {
    const id = +k;
    const s = tilePng(id);
    if (!s) { findings.atlasPngMissing.push({ id, face: 'authority' }); continue; }
    if (o.w > s[0] || o.h > s[1]) {
      if (id === 752 && c752) {
        exempt.push({ id: 752, kind: 'fnaClampBand', anchor: `TileDrawing.cs:${td.lineOf[752]} tileWidth=36/tileHeight=38 vs Tiles_752.png ${s[0]}×${s[1]}；VanillaTiler drawAdjust case 752 钳制+clampBand（BJ365/366）` });
      } else {
        findings.vanillaOOB.push({ id, tileWidth: o.w, tileHeight: o.h, png: s });
      }
    }
  }
  if (!c752 && !exempt.some((x) => x.id === 752) && td.map[752]) {
    // 752 豁免锚（case 752 + clampBand）丢失且原版越界仍在 → 硬红
    findings.vanillaOOB.push({ id: 752, tileWidth: td.map[752].w, tileHeight: td.map[752].h, png: tilePng(752), note: 'drawAdjust case 752/clampBand 豁免锚丢失' });
  }
  // drawAdjust 字面 fit 恒败普查（BJ365 死守卫形态：case 内所有字面矩形都超出 PNG）
  for (const [k, c] of Object.entries(cases)) {
    const id = +k;
    const s = tilePng(id);
    if (!s) { findings.atlasPngMissing.push({ id, face: 'drawAdjust' }); continue; }
    const sizes = [...c.fit, ...(c.sw.length && c.sh.length ? c.sw.map((w, i) => [w, c.sh[Math.min(i, c.sh.length - 1)]]) : [])];
    if (!sizes.length) continue;
    const okAny = sizes.some(([w, h]) => w <= s[0] && h <= s[1]);
    if (!okAny) findings.deadFit.push({ id, want: sizes, png: s });
  }
  // atlas 元数据 vs PNG（grid 单格必须可画）
  const atlas = {};
  for (const [k, t] of Object.entries(tiles)) {
    const id = +k;
    const s = tilePng(id);
    atlas[id] = { grid: t.grid, stride: t.stride };
    if (!s) { if (!findings.atlasPngMissing.some((x) => x.id === id)) findings.atlasPngMissing.push({ id, face: 'atlas' }); continue; }
    if (t.grid && (t.grid[0] > s[0] || t.grid[1] > s[1])) findings.atlasGridOOB.push({ id, grid: t.grid, png: s });
  }
  const png = {};
  for (const id of Object.keys(tiles)) png[+id] = tilePng(+id);
  // ---- ★BJ389 规则⑤：tileHeight 覆写 × atlas grid 欠高对账（2026-09-28 定谳） ----
  //  定谳（亲读 GetTileDrawData 对应型 + 原版绘制行为 + 表内容带逐槽探测 pngjs）：
  //  tileHeight 覆写 = 原版【源矩形格高】（Tiles_N.png 槽位 = 内容高 + 2px 缝的打包
  //  节奏;源矩形 = Rectangle(frameX+addFrX, frameY+addFrY, tileWidth, tileHeight)
  //  TileDrawing.cs:1313 等）。本仓整表直读（vanilla/Tiles_N.png 全量随仓）+
  //  SpriteAtlas.vframeAt(sh=grid[1]) 逐格切片 + VanillaTiler.drawAdjust 逐型覆写
  //  ⇒ grid[1] < tileHeight 【不是越界】（drawAdjust fit 守卫 + VanillaTiler 源矩形
  //  越界守卫双层兜底;对照 752=请求超 PNG 的真越界案,规则②专管）。其失败形态=
  //  【欠高少画】(tileH − grid[1]) 行。
  //  运行时承载面（覆盖轴,2026-09-28 普查）：
  //   a) drawAdjust 逐型 case（h20 植物家具族 fit(16,20)/73·74·113 fit(16,32)/
  //      442/476/561/567/579/624·700/656·701/711/726/227/81/184/529/698/751 等
  //      ——capture sh ≥ tileH 即锚,case 摘除=capture 消失=当拍失覆盖即红）;
  //   b) HEIGHT_18 集合缺省臂（VanillaTiler `default: if (HEIGHT_18.has(sheet))
  //      a.sh = 18;`——h18 家具族 53 型一张集合表承载;表内容带探测实证该族多出
  //      2 行确有内容（桌第二带/箱中缝底脚/日葵高样式/樱柳苗全槽 18 行）,集合承载
  //      =必要承载非冗余);
  //   c) 条件格高特例：405/406（壁炉/烟囱）原版 tileHeight 条件覆写（405 :5516-5520
  //      =16 缺省,fy>0 才 18;406 :5450-5454=16 缺省,fy%54≥36 才 18——提取器 Math.max
  //      记 18=条件上界）。★BJ399 件1（2026-09-29）已清偿：drawAdjust 逐帧条件 sh
  //      405 `fy>0`/406 `fy%54≥36`（仅 sh,不触 sy——addFrY 仍由 TileAnim helper 独占）
  //      → case 承载轴 a 接管,债登记摘除（RULE5_DEBT 空;未来新增覆写型欠高再登记）。
  //  触发式（对账规则五）：tileHeight 覆写 × tileH % grid[1] ≠ 0（h32×grid16 整除
  //  =多格堆叠不在此列;宽度轴覆写不属本规则）→ 非 a/b 承载、非债登记、非 752 专案
  //  = findings.rule5（硬闸）——未来版本新增覆写型（1459+）/承载面漂移（集合摘员/
  //  case 摘除）即炸。
  // ★BJ399 件1（2026-09-29）：405/406 已清偿摘除（drawAdjust case 承载接管）——
  //  集合空=机制留位（未来新增「覆写×grid 不整除且无承载」的欠高债在此登记,
  //  获承载即 ok=false → exemptAnchorLost 硬红强制重定谳）。
  const RULE5_DEBT = new Set([]);
  const adjMax = (c) => c ? {
    sw: Math.max(0, ...c.sw, ...c.fit.map((f) => f[0])),
    sh: Math.max(0, ...c.sh, ...c.fit.map((f) => f[1])),
  } : null;
  for (const [k, o] of Object.entries(td.map)) {
    const id = +k;
    const tileH = o.h;
    if (tileH === undefined) continue;                       // 高度轴未覆写（宽度轴不属规则⑤）
    const g = tiles[String(id)]?.grid;
    if (!g || tileH % g[1] === 0) continue;                  // grid 整除（堆叠/覆盖）=结构自洽
    if (id === 752 && c752) continue;                        // FNA clampBand 专案（规则②豁免承载）
    const am = adjMax(cases[id]);
    // 宽度轴：case 覆写 sw 优先（698=36/751=56/711=18——grid[0]=16/18 不足由 case 补齐）;
    // case 未覆写宽 → grid[0] 必须自足
    const widthOK = am && am.sw > 0 ? am.sw >= (o.w ?? 16) : g[0] >= (o.w ?? 16);
    const caseCovered = !!am && am.sh >= tileH && widthOK;
    const setCovered = tileH === 18 && height18.has(id) && height18Anchor;
    const covered = caseCovered || setCovered;
    if (RULE5_DEBT.has(id)) {
      // 债登记（ok 锚=欠高态仍在——获承载即登记陈旧=exemptFailures 硬红强制重定谳）
      // ★BJ399 勘注：登记成员自 405/406 清偿后为空,本支为机制留位（anchor 文案按
      //   成员 id 参数化,未来登记者重写为具体行号锚）。
      exempt.push({ id, kind: 'rule5UnderHeightDebt', tileHeight: tileH, grid: g, ok: !covered,
        anchor: `条件格高欠高债:原版 GetTileDrawData tile ${id} tileHeight 条件覆写,本仓 grid 恒画低值少画 2px;修复=drawAdjust 逐帧条件 sh（参照 BJ389 登记/BJ399 清偿 405 :5516-5520、406 :5450-5454 判例）` });
      continue;
    }
    if (!covered) {
      findings.rule5.push({ id, tileHeight: tileH, grid: g,
        note: '规则⑤:tileHeight 覆写×grid 不整除且无 case/HEIGHT_18 承载、无债登记' });
    }
  }
  report.tile = {
    authority: Object.fromEntries(Object.entries(td.map).map(([k, v]) => [+k, { w: v.w, h: v.h }]).sort((a, b) => a[0] - b[0])),
    authorityLine: Object.fromEntries(Object.entries(td.lineOf).map(([k, v]) => [+k, v])),
    drawAdjustLiteral: Object.fromEntries(Object.entries(cases).map(([k, c]) => [+k, c]).sort((a, b) => a[0] - b[0])),
    atlas,
    png,
    findings,
    exempt,
  };
  report._meta.tile = { getTileDrawDataSpan: td.span, drawAdjust752Anchor: c752,
    rule5Debt: [...RULE5_DEBT], rule5Height18Count: height18.size,
    rule5Height18Anchor: height18Anchor };
}

// ================= 汇总 + 闸门 =================
report._meta = {
  ...report._meta,
  source: `Terarria${VER}（Gore.cs/GoreID.cs/TileDrawing.cs 读域 1457↔1458 逐字节全等 md5 3f7708af/a8018139/d1ce9177；Main.cs projFrames 块同址零杂行）`,
  generatedBy: 'tools/recon-frame-tables.mjs',
  ver: VER,
  rules: ['①源A多帧而源B无条目=漏配', '②绘制请求源矩形超源C=越界', '③帧数×帧尺寸与源C不匹配=竖横排/尺寸错', '④源A单帧而源B多帧=过配', '⑤tileHeight覆写×grid不整除=欠高候选(BJ389三轴分诊)'],
};
/** findings 总数（基线无关硬闸面） */
const findingsCount = (() => {
  let n = 0;
  for (const dom of ['gore', 'proj', 'tile']) {
    for (const v of Object.values(report[dom].findings)) if (Array.isArray(v)) n += v.length;
  }
  return n;
})();
// 豁免登记 ok/anchorOk=false → 豁免锚失配（防静默失效；升格为硬闸面）
const exemptFailures = [];
for (const dom of ['proj', 'tile']) {
  for (const e of report[dom].exempt ?? []) {
    if (e.ok === false || e.anchorOk === false) exemptFailures.push({ dom, id: e.id, kind: e.kind, why: 'exemptAnchorLost' });
  }
}

const summary = (r) => {
  const g = Object.entries(r.gore.findings).map(([k, v]) => `${k}=${v.length}`).join('/');
  const p = Object.entries(r.proj.findings).map(([k, v]) => `${k}=${v.length}`).join('/');
  const t = Object.entries(r.tile.findings).map(([k, v]) => `${k}=${v.length}`).join('/');
  return `gore{${g}} proj{${p}} tile{${t}}`;
};
const findingsBad = findingsCount + exemptFailures.length;

// ---- 双向 diff vs 金标（era guard：重跑漂移即拒） ----
function deepWash(live, fresh, prefix = '') {
  const wash = { liveOnly: [], freshOnly: [], drift: [] };
  if (live === null || fresh === null || typeof live !== 'object' || typeof fresh !== 'object' || Array.isArray(live) !== Array.isArray(fresh)) {
    if (JSON.stringify(live) !== JSON.stringify(fresh)) wash.drift.push(`${prefix || '<root>'}`);
    return wash;
  }
  const lk = new Set(Object.keys(live)), fk = new Set(Object.keys(fresh));
  for (const k of Object.keys(live)) {
    // provenance 动态字段豁免（research meta.source / fishing _meta.sources 同例）：
    // _meta.ver/_meta.source 随 SW_ITEM_VER 走，1458 交叉重放须 fingerprint 相等
    if (prefix === '._meta' && (k === 'ver' || k === 'source')) continue;
    if (!fk.has(k)) { wash.liveOnly.push(`${prefix}.${k}`); continue; }
    const w = deepWash(live[k], fresh[k], `${prefix}.${k}`);
    wash.liveOnly.push(...w.liveOnly); wash.freshOnly.push(...w.freshOnly); wash.drift.push(...w.drift);
  }
  for (const k of Object.keys(fresh)) if (!lk.has(k)) wash.freshOnly.push(`${prefix}.${k}`);
  return wash;
}
const FRESH = JSON.stringify(report, null, 1) + '\n';
if (OUT_ARG) {
  writeFileSync(OUT_ARG, FRESH);
  console.error(`[recon-frames] 报告已写 ${OUT_ARG}（沙箱通道）`);
}
if (FREEZE) {
  if (findingsBad > 0) {
    console.error(`[recon-frames] 拒绝冻结：findings 非空（${summary(report)}）——先逐条 triage（反编译为准）再冻。`);
    process.exit(1);
  }
  if (!existsSync(dirname(GOLDEN))) { console.error(`[recon-frames] 金标目录缺失 ${dirname(GOLDEN)}`); process.exit(1); }
  writeFileSync(GOLDEN, FRESH);
  console.error(`[recon-frames] 金标已冻结 ${GOLDEN}（${summary(report)}; gore dormant=${report.gore.dormant.length} proj exempt=${report.proj.exempt.length} tile exempt=${report.tile.exempt.length}）`);
  console.log(`frame-tables-recon: ${summary(report)} — frozen.`);
  process.exit(0);
}
// 干跑闸
let hardFail = false;
if (findingsBad > 0) {
  console.error(`[recon-frames] findings 非空（基线无关硬闸）——${summary(report)}`);
  for (const dom of ['gore', 'proj', 'tile']) {
    for (const [k, v] of Object.entries(report[dom].findings)) {
      if (Array.isArray(v) && v.length) console.error(`  ${dom}.${k}: ${JSON.stringify(v.slice(0, 6))}`);
    }
  }
  if (exemptFailures.length) console.error(`  exempt 锚失配: ${JSON.stringify(exemptFailures.slice(0, 8))}`);
  hardFail = true;
}
if (!existsSync(GOLDEN)) {
  console.error(`[recon-frames] 金标缺失 ${GOLDEN}——先双旗冻结：node tools/recon-frame-tables.mjs --freeze --force-full`);
  process.exit(1);
}
let liveGolden = null;
try { liveGolden = JSON.parse(readFileSync(GOLDEN, 'utf8')); } catch { /* 坏损当漂移 */ }
const wash = deepWash(liveGolden, JSON.parse(FRESH));
const washEmpty = !wash.liveOnly.length && !wash.freshOnly.length && !wash.drift.length;
if (!washEmpty) {
  console.error('[recon-frames] 干跑对拍：报告 vs 金标 diff 非空（源漂移/数据漂移/资产换尺寸）——exit 1。');
  if (wash.liveOnly.length) console.error(`  [live-only] 金标独有 ${wash.liveOnly.length}: ${wash.liveOnly.slice(0, 8).join(', ')}`);
  if (wash.freshOnly.length) console.error(`  [fresh-only] 重产独有 ${wash.freshOnly.length}: ${wash.freshOnly.slice(0, 8).join(', ')}`);
  if (wash.drift.length) console.error(`  [drift] 值漂移 ${wash.drift.length}: ${wash.drift.slice(0, 8).join(' | ')}`);
  console.error('  处置：逐条定谳（反编译为准）后 --freeze --force-full 双旗重冻；若系无意的帧表手改，先回滚再查。');
  hardFail = true;
}
if (hardFail) process.exit(1);
console.log(`frame-tables-recon: OK ${summary(report)}（gore dormant=${report.gore.dormant.length}, proj exempt=${report.proj.exempt.length}, tile exempt=${report.tile.exempt.length}; 基线双向零差）`);
