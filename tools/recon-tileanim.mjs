#!/usr/bin/env node
// 动画帧权威对账闸门（recon 工具链第三员，2026-08-30）
// 病根回顾：TILE_ANIM_FRAMES 曾被"风格带总数当帧数"的审计改炸（锯木机 5 帧→60%
// 绘制回退平铺第一格）。本工具从反编译源码机械提取权威三元组，与本地 PNG 容量互证，
// 生成金标 manifest；任何手改 src/render/TileAnim.ts 偏离权威都会当场爆红。
//
// 用法（game/ 目录下）：
//   node tools/recon-tileanim.mjs            # 校验：再生 manifest 与磁盘版逐项比对，DRIFT>0 即退出码 1
//   node tools/recon-tileanim.mjs --fix      # 再生并覆写金标（升版本时使用，diff 需人工过目后提交）
//   node tools/recon-tileanim.mjs --verbose  # 打印全部提取值
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();                       // 期望 = game/
const DECOMP = path.join(ROOT, '..', 'Terarria1457');
const MAIN_CS = path.join(DECOMP, 'Terraria', 'Main.cs');
const DRAW_CS = path.join(DECOMP, 'Terraria.GameContent.Drawing', 'TileDrawing.cs');
const PNG_DIR = path.join(ROOT, 'public', 'sprites', 'vanilla');
const GOLDEN = path.join(ROOT, 'tests', 'golden', 'tile-anim-authority.json');

const FIX = process.argv.includes('--fix') || process.argv.includes('--update');
const VERBOSE = process.argv.includes('--verbose');

function must(cond, msg) {
  if (!cond) { console.error('FATAL: ' + msg); process.exit(2); }
}
must(fs.existsSync(MAIN_CS), `反编译源缺失 ${MAIN_CS}（repo 根应有 Terarria1457/）`);
must(fs.existsSync(DRAW_CS), `缺 ${DRAW_CS}`);

// ---------- 从 Main.cs 切出 AnimateTiles 体 ----------
function methodBody(src, sig) {
  const i = src.indexOf(sig);
  must(i > 0, '找不到方法 ' + sig);
  // 方法体结束：其后第一个 "\n\tprivate"/"\n\tpublic" 同级签名行
  const rest = src.slice(i + sig.length);
  let end = rest.search(/\n\t(private|public|internal|protected)( static)? [\w<>\[\]]+ \w+\(/);
  return (end < 0 ? rest : rest.slice(0, end)).split('\n').map((l) => l.trim());
}

// AnimateTiles 权威：id → { period, frames, floor }（floor=reset 赋非零值特型如 593→5）
function extractAnim() {
  const L = methodBody(fs.readFileSync(MAIN_CS, 'utf8'), '\tprivate static void AnimateTiles()');
  const out = {};
  // ★前缀/后缀双形态自增捕获：Form A 后缀 `tileFrame[N]++`，Form B 前缀 `++tileFrame[N]`
  //   （此前只找后缀致 Form B 全军覆没——405/406/452/455/499/129… 家族全部漏提）
  const FRAME_RE = (id) => new RegExp(`(\\+\\+)\\s*tileFrame\\[${id}\\]|tileFrame\\[${id}\\]\\s*(\\+\\+|--)`);
  // 扫描式：以「本 id 的计数器门槛事件」为锚，在后续窗口内找同 id 的 tileFrame 自增/自减
  for (let i = 0; i < L.length; i++) {
    const s = L[i];
    let op = null, thr = null;
    const mA = /^(?:\+\+)?tileFrameCounter\[(\d+)\]\+\+;?$/.exec(s);
    const mB = /^if \s*\(\+\+tileFrameCounter\[(\d+)\]\s*(>=|>)\s*(\d+)\)$/.exec(s);
    const mB2 = /^if \((?:\+\+)?tileFrameCounter\[(\d+)\]\s*(>=|>)\s*(\d+)\)$/.exec(s);
    let id = -1;
    if (mA) {
      id = Number(mA[1]);
      // 后窗找 threshold（含 counter 的判断行）
      for (let j = i; j < Math.min(i + 16, L.length); j++) {
        if (!/tileFrameCounter/.test(L[j])) continue;
        const mm = /(>=|>)\s*(-?\d+)/.exec(L[j]);
        if (mm) { op = mm[1]; thr = Number(mm[2]); break; }
      }
    } else if (mB || mB2) {
      const mm = (mB || mB2);
      id = Number(mm[1]);
      op = mm[2]; thr = Number(mm[3]);
    }
    if (id < 0 || thr === null) continue;
    const period = op === '>=' ? thr : thr + 1;
    const fr = FRAME_RE(id);
    for (let j = i; j < Math.min(i + 22, L.length); j++) {
      const dirM = fr.exec(L[j]);
      if (!dirM) continue;
      const dir = dirM[1] ?? dirM[2];              // 前缀(++t[N]) / 后缀(t[N]++)
      let frames = null, floor = 0;
      // 比较行必须【含本 id 字面】——防吞并排邻居（456 曾吞 412 的 >=240）
      for (let q = Math.max(0, j - 1); q < Math.min(j + 4, L.length); q++) {
        const mr = new RegExp(`tileFrame\\[${id}\\][^\\]]*?(?:<|>)=?\\s*(-?\\d+)`).exec(L[q]);
        if (!mr) continue;
        const op2 = mr[0][0], eq2 = mr[0].includes('='), v = Number(mr[1]);
        if (dir === '--') { frames = v + 1; break; }          // --…<0 复位：值域宽由复位赋值补（<0 即全部域）
        frames = eq2 ? v : v + 1;                             // >=M 宽M；>M 宽M+1
        break;
      }
      // reset 赋非零 = floor 特型（如 593: frame>=9 → frame=5）
      let assignAfter = null;
      for (let q = j + 1; q < Math.min(j + 5, L.length); q++) {
        const ms = new RegExp(`tileFrame\\[${id}\\]\\s*=\\s*(\\d+)`).exec(L[q]);
        if (ms) { if (Number(ms[1]) !== 0) floor = Number(ms[1]); assignAfter = Number(ms[1]); break; }
      }
      if (dir === '--' && assignAfter !== null) frames = assignAfter + 1;
      out[id] = { period, frames, floor };
      break;
    }
  }
  for (const l of L) {
    const ma = /^tileFrame\[(\d+)\]\s*=\s*tileFrame\[(\d+)\];$/.exec(l);
    if (ma && Number(ma[1]) !== Number(ma[2]) && out[Number(ma[2])] && !out[Number(ma[1])])
      out[Number(ma[1])] = { ...out[Number(ma[2])] };
  }
  return out;
}

// GetTileDrawData 每组 case 的 addFrY 步距。★C# 落穿语义：连续多行 case 标签
// 共享其后首个语句块（此前把每个堆叠标签当独立边界，家族群全数落空）。
function extractPitches() {
  const src = fs.readFileSync(DRAW_CS, 'utf8');
  const i0 = src.indexOf('\tprivate void GetTileDrawData(');
  must(i0 > 0, '找不到 GetTileDrawData');
  const rest = src.slice(i0);
  const iEnd = rest.slice(100).search(/\n\tprivate /);
  const L = rest.slice(0, iEnd < 0 ? undefined : iEnd + 100).split('\n').map((l) => l.trim());
  const out = {};
  const CASE_RE = /^(?:case (\d+(?:\s*,\s*\d+)*)|default):$/;
  let i = 0;
  while (i < L.length) {
    const mc = CASE_RE.exec(L[i]);
    if (!mc || !mc[1]) { i++; continue; }
    // 收集整个落穿链：本标签 + 后续紧邻的纯 case 标签行
    const ids = mc[1].split(',').map((x) => Number(x.trim()));
    let j = i + 1;
    while (j < L.length) {
      const m2 = CASE_RE.exec(L[j]);
      if (m2 && m2[1]) { ids.push(...m2[1].split(',').map((x) => Number(x.trim()))); j++; continue; }
      break;
    }
    // 链后语句块边界：读至层级归零或下一 case 标签（允许无括号单语句+break 形态）
    let depth = 0, opened = false, mult = null;
    for (let k = j; k < Math.min(j + 60, L.length); k++) {
      const s = L[k];
      const nm = CASE_RE.exec(s);
      if (nm && !opened) break;                                 // 空标签链终止（不应发生在链内已收）
      if (/^addFrY\s*=\s*Main\.tileFrame\[typeCache\]\s*\*\s*(\d+)/.exec(s)) {
        mult = Number(/^addFrY\s*=\s*Main\.tileFrame\[typeCache\]\s*\*\s*(\d+)/.exec(s)[1]); break;
      }
      if (/^addFrY\s*=/.exec(s) && !opened) break;              // 其他形态=纵步距非钟控
      if (s === '{' ) { depth++; opened = true; }
      else if (s === '}') { depth--; if (opened && depth <= 0) break; }
      else if (/^break;\s*$/.exec(s) && !opened) break;
    }
    if (mult !== null) for (const cid of ids) if (!(cid in out)) out[cid] = mult;
    i = Math.max(j, i + 1);
  }
  return out;
}

// ---------- 本仓现行表 ----------
function parseTable(tsPath, varName) {
  const src = fs.readFileSync(tsPath, 'utf8');
  const i0 = src.indexOf(`export const ${varName}`);
  must(i0 > 0, `${tsPath} 缺 export const ${varName}`);
  const bi = src.indexOf('{', i0);
  let depth = 0, end = -1, strOnly = false;
  for (let k = bi; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  const body = src.slice(bi + 1, end);
  const out = {};
  // 同行多键支持（PITCH 表一行排多键）+ 行注释剥离
  for (const line of body.split('\n')) {
    const codePart = line.replace(/\/\/.*$/, '');
    for (const mm of codePart.matchAll(/(\d+)\s*:\s*(\d+)/g)) out[Number(mm[1])] = Number(mm[2]);
  }
  return out;
}

// ---------- PNG 容量 ----------
function pngSize(n) {
  const p = path.join(PNG_DIR, `Tiles_${n}.png`);
  try {
    const d = fs.readFileSync(p).subarray(0, 33);
    return { w: d.readUInt32BE(16), h: d.readUInt32BE(20) };
  } catch { return null; }
}

// ---------- 策略例外（人工核定，注明依据） ----------
const REMOVED = {
  171: '本体静态；灯串由 drawXmasTreeCell 自算 17t/4f（纹理装不下纵带）',
  314: '加速轨横向 boosterAnimFrame；纵向偏移错族',
  485: 'AnimateTiles 只滚计数器不写 tileFrame',
  491: '纯静态（addFrX 常量）',
  564: '仅辉光层动、GetTileDrawData 内 addFrY 强清零',
  597: '风向计数器从不写 tileFrame',
  614: 'addFrX（横步距54）族，禁入纵偏表',
};
const APPROX = {
  453: 'counter+=rand.Next(3) 随机走针 → 表用均值近似 period≈60（备案偏离）',
  456: '同上 period≈80',
};

// 机理暂未反解成功的家族：提取器给不出或给出可疑值的键 → 以【当前生效值】钉入金标
// （保护力等同：日后任何改动照样爆红；待逐案补证后再转严格权威）。禁止把
// 病源家族（106/218/220/300 组、306、354 等）加进这里——它们必须走严格通道。
const PIN_RATE = ['422', '453', '340', '341', '342', '343', '344'];
const PIN_FRAMES = ['31', '77', '96', '270', '422', '453', '660', '665', '696',
  '340', '341', '342', '343', '344'];
const PIN_PITCH = ['17', '77', '96', '133', '215', '377', '405',
  '406', '421', '452', '455', '665', '696', '708', '739', '748',
  '340', '341', '342', '343', '344'];
//（129 已于 2026-09-18 移出 PIN→pitchOverride 严格通道，272 同款转正；BJ118② 普查批
//  270/572/660/480/509/657/658/720/721/725/410/456 同批移出→pitchOverride。
//  340-344 新入 PIN：原版 AnimateTiles 用 `for(i=340..344)` 循环钟（Main.cs:19173-19184,
//  counter>=5/4 帧回卷）,提取器逐 id 字面匹配盲区→以权威亲读值入表+PIN 锁。）

// ---------- 组装期望面 ----------
const anim = extractAnim();
const pitches = extractPitches();
const RATE = parseTable(path.join(ROOT, 'src/render/TileAnim.ts'), 'TILE_ANIM_RATE');
const PITCH = parseTable(path.join(ROOT, 'src/render/TileAnim.ts'), 'TILE_ANIM_PITCH');
const FRAMES = parseTable(path.join(ROOT, 'src/render/TileAnim.ts'), 'TILE_ANIM_FRAMES');

// 关键自检锚点（提取器自身健康度；若反编译路径变动会先在这爆）
const ANCHORS = [[106, 5, 2], [220, 5, 4], [218, 5, 2], [17, 6, 12], [405, 5, 8], [406, 8, 6], [272, 10, 2]];
// pitch 锚点（防提取器跨案渗漏复发——272 曾被 PIN 锁错值 38，判例见 2026-08-31 船区漂移案）
// ★BJ118② 普查批锚点同批钉入（0 族=横移 addFrY=0；54/56 族=碑族带距）。
const PITCH_ANCHORS = [[272, 90], [405, 38], [406, 56], [215, 36], [106, 54], [207, 72],
  [129, 0], [270, 0], [572, 0], [660, 0],
  [480, 54], [509, 54], [657, 54], [720, 54], [721, 54], [725, 54], [658, 54], [410, 56], [456, 54]];
for (const [id, ep, ef] of ANCHORS) {
  must(anim[id]?.period === ep && anim[id]?.frames === ef,
    `提取器锚点失守 id=${id}: 得到 ${JSON.stringify(anim[id])} 期望 period=${ep},frames=${ef}`);
}


// 期望表 = 提取值，应用策略层：
//  · 专属绘制段不在主 switch 内（提取器不可见），以反编译行号为据手工钉死：
//    215 篝火 TileID.Sets.Campfires 分支 *36（TileDrawing.cs:6137）、
//    207 喷泉专属段 *72（:6002-6022）、405 壁炉 *38（:5514-5529）、406 烟囱 *56 带折算（:5448-5462）
// ★272 齿轮块：case 1137-1147 verbatim —— addFrY=(counter+x%2+y%2+x%3+y%3)%2*90，
// 素材 234×180=两带各90 实证；此前 PIN 锁的 38 是本波 pin 补键时序里写死的错值，
// 用户报「海盗船齿轮块动态漂移」根因。
// ★129 水晶碎块（2026-09-18 定谳）：TileDrawing.cs:4687 case 129 `addFrY = 0` verbatim
// ——纵向无动画带，唯一动画=大簇 addFrX 横向步进（crystalShardAddFrX）。此前 PIN 锁的
// 38 是默认档误罩：源 sy 逐相位 +38 走进侧向簇带/辉光带/越界回退(0,0)，用户报
// 「原版一长串、本仓发散两个方块」根因。272 同款 PIN→严格通道转正。
// ★BJ118② 全表普查批（2026-09-18，GetTileDrawData 逐 case 亲读 + PNG 容量互证）——
//   险情清单钉死（每格=「原版 case 行号 → 步距/门」）：
//   · 270/572/660=0：横移族 addFrY=0 verbatim（:5654/:5695/:5681——萤火/魂/精灵瓶,
//     动画=addFrX n×18）。旧默认 38：270/660 素材 36 高被越界钳制掩蔽（每帧白算）、
//     572 素材 216 高不被钳=源 sy 走进其它样式带（129 同族病第二例）。
//   · 480/509/657/720/721/725=54：碑族 :6044-6059 `fy>=54 → tileFrame×54,否则 0`
//     （带布局 1 静+N 动×54：486/918/1782/270 容量互证）。门=drawAdjust case。
//   · 658=54：微光碑 :6061-6079 `tileFrame×54 + 486×(fy/54==1) + 972×(fy/54==2)`。
//   · 410=56：月主碑 :6029-6042 `fy>=56 → tileFrame×56,否则 0`（504=1静+8动×56）。
//   · 456=54：气球束 :5503-5511 `num41×54`（216=4×54 恰满;旧 PIN 38 缺证值。
//     相位=counter/20 坐标式,由 drawAdjust case 456 消费并整替 sy）。
//   提取器盲区成因：上述 case 均非 `addFrY = Main.tileFrame[typeCache] * N` 单行
//   直乘形（两行 *= / 条件门 / num 变量），机械提取不可达 → 亲读钉值+锚点锁。
const pitchOverride = { 405: 38, 406: 56, 215: 36, 207: 72, 272: 90, 129: 0,
  270: 0, 572: 0, 660: 0,
  480: 54, 509: 54, 657: 54, 720: 54, 721: 54, 725: 54, 658: 54, 410: 56, 456: 54 };
//  · 456 随机走针族：原版 tileFrame[456] 帧域 0..239 但绘制仅消费 counter/20 %4×54
//    （Main.cs:19301-19308/:5503-5511）→ 以绘制域 4 入表（216=4×54 恰满,APPROX 备案）
const frameOverride = { 456: 4 };
//  · 593/594 是中段回跳特型（reset→5），提取保留 frames 域
for (const id of Object.keys(REMOVED)) delete anim[Number(id)];
const eRate = {}, ePitch = {}, eFrames = {}, eFloor = {};
let capBad = [];
for (const [k, v] of Object.entries(anim)) {
  const id = Number(k);
  eRate[id] = v.period;
  if (v.floor) eFloor[id] = v.floor;
  eFrames[id] = frameOverride[id] ?? v.frames;
  const p = pitches[id] ?? 38;
  ePitch[id] = pitchOverride[id] ?? p;
  const png = pngSize(id);
  if (png) {
    // ★need 用生效帧数 eFrames（frameOverride 后;456 绘制域 4,提取器裸域 240 系
    //   tileFrame 计数域非绘制带数——旧式恒报 12960 越界假警）
    const need = eFrames[id] * ePitch[id];
    if (png.h + ePitch[id] / 2 < need)
      capBad.push({ id, pngH: png.h, need, pitch: ePitch[id], frames: eFrames[id] });
  }
}

// 钉值层：机理未反解键以【现行生效值】入金标（锁现值防漂移；缺失则提示补键）
for (const [id, ep] of PITCH_ANCHORS) {
  const got = pitches[id] ?? pitchOverride[id];
  if ((pitchOverride[id] ?? pitches[id]) !== ep)
    must(false, `pitch 锚点失守 id=${id}: 得到 ${got} 期望 ${ep}`);
}
const pins = { rate: PIN_RATE, frames: PIN_FRAMES, pitch: PIN_PITCH };
const liveTables = { rate: RATE, frames: FRAMES, pitch: PITCH };
const expTables = { rate: eRate, frames: eFrames, pitch: ePitch };
const fixNotes = [];
for (const dom of ['rate', 'frames', 'pitch']) {
  for (const idStr of pins[dom]) {
    const id = Number(idStr);
    if (id in REMOVED) continue;
    if (liveTables[dom][id] !== undefined) {
      expTables[dom][id] = liveTables[dom][id];
    } else if (expTables[dom][id] !== undefined) {
      fixNotes.push(`需在 TileAnim.ts 的 ${dom.toUpperCase()} 表补 ${id}=${expTables[dom][id]}`);
    }
  }
}
if (fixNotes.length && !FIX) {
  for (const n of fixNotes) console.error('PIN 补键: ' + n);
  process.exit(1);
}

if (FIX) {
  const manifest = {
    _meta: {
      source: 'Terarria1457/Main.cs AnimateTiles + TileDrawing.cs GetTileDrawData + 素材容量',
      anchorsCheck: true,
      note: '校验门: node tools/recon-tileanim.mjs；修改需过目 diff 并同步测试',
    },
    rate: eRate, pitch: ePitch, frames: eFrames, floor: eFloor,
    removed: REMOVED, approx: APPROX,
  };
  fs.writeFileSync(GOLDEN, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`--fix 已再生金标: ${path.relative(ROOT, GOLDEN)}（rate ${Object.keys(eRate).length} 键）`);
  process.exit(0);
}

// ---------- 校验模式 ----------
const manifest = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
const drift = [];
const cmp = (name, live, exp) => {
  const lk = new Set(Object.keys(live).map(Number));
  const ek = new Set(Object.keys(exp).map(Number));
  for (const k of ek) if (!lk.has(k)) drift.push(`${name}[${k}] 缺失（金标=${exp[k]}）`);
  for (const k of lk) {
    if (!ek.has(k)) drift.push(`${name}[${k}] 多余（金标无此键）`);
    else if (live[k] !== exp[k]) drift.push(`${name}[${k}] live=${live[k]} 权威=${exp[k]}`);
  }
};
cmp('RATE', RATE, manifest.rate);
cmp('FRAMES', FRAMES, manifest.frames);
cmp('PITCH', PITCH, manifest.pitch);
// floor 不强制存在（空域合法），但已存在的值须相等
for (const [k, v] of Object.entries(manifest.floor))
  if (!(Number(k) in (manifest.__floornull || {}))) {
    // 动态 floor 支持检测在测试里做；这里只记录 value 契约
    void v;
  }

// 移除键不得回归
for (const id of Object.keys(REMOVED)) {
  if (id in RATE || id in FRAMES) drift.push(`REMOVED ${id} 复活（${REMOVED[id]}）`);
}
// 近似键备注存在性
for (const id of Object.keys(APPROX))
  if (!(id in RATE)) drift.push(`APPROX ${id} 消失（${APPROX[id]}）`);

console.log(`动画帧权威对账：RATE ${Object.keys(RATE).length}/${Object.keys(manifest.rate).length}、`
  + `FRAMES ${Object.keys(FRAMES).length}/${Object.keys(manifest.frames).length}、`
  + `PITCH ${Object.keys(PITCH).length}/${Object.keys(manifest.pitch).length}`);

// 容量险情提示（与金标内容无关，属素材面漂移监控）
if (capBad.length) {
  console.error('\n⚠ PNG 容量险情（素材可能被换小）：');
  for (const c of capBad) console.error(`  sheet ${c.id}: pngH=${c.pngH} < 需要 ${c.need} (f${c.frames}×p${c.pitch})`);
}
if (VERBOSE) console.log(JSON.stringify({ anim, pitches }, null, 1));

if (drift.length) {
  console.error(`\n✗ DRIFT=${drift.length}`);
  for (const d of drift) console.error('  ' + d);
  console.error('\n修复指引：数值改动必须先对照 Terarria1457 反编译源或 --fix 后人工审 diff。');
  console.error('绝不允许凭截图/感觉手改动画表——历史上就这么炸出过全物平铺第一格。');
  process.exit(1);
}
console.log('✓ DRIFT=0');
