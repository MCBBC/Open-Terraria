// M-3 子样式液体台账审计仪（一次性）：线性模拟 Terraria.ObjectData/TileObjectData.cs
// Initialize() builder，把 newSubTile.* 液体写入解析成 per-style 记录，并验证
// alternate 维度液体恒等（不建 alternate 记录的定谳依据）。
// 语义依据（1457 亲读）：
//   · addSubTile/addSubTileRange（:2016-2096）：newSubTile.Calculate() 先行（death 耦合
//     :1821-1831）→ list[style]=newSubTile → newSubTile 复位 new(_baseObject)。
//   · GetTileData（:5127-5162）：style → SubTiles[style]（null/越界回落基记录）→
//     alternate-1 → 该记录.Alternates[idx]。
//   · CanPlace（TileObject.cs:205-208/:342）：逐 alternate 取 GetTileData(type,style,num7)
//     做 LiquidPlace → alternate 结构上参与液体判定。
//   · CopyFrom（:1698-1715）共享模块引用 + setter COW（:520-547 WaterDeath setter）→
//     子样式覆写不落基记录；_hasOwn* 旗不经 CopyFrom 拷贝（首次写必 COW）。
//   · 子样式缺省液体 = _baseObject（SetupBaseObject :1767-1768 water=Allowed/lava=NotAllowed）。
import { readFileSync } from 'node:fs';

const SRC = process.env.TOD_SRC ?? '/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria.ObjectData/TileObjectData.cs';
const lines = readFileSync(SRC, 'utf8').split(/\r?\n/);

const D = () => ({ water: 'allowed', lava: 'notAllowed' });
const clone = (o) => structuredClone(o);

// ---- 工作面（只跟踪液体四维 + 表达式所需字段）----
// work/newTile · sub/newSubTile · alt/newAlternate。liq 为 placement 两维；wd/ld 为 death。
let work = { liq: D(), wd: false, ld: false, wrap: 0 };
let sub = { liq: D(), wd: false, ld: false, wLns: [] };
let alt = { liq: D(), wd: false, ld: false };
const bases = new Map();          // StyleX → {liq,wd,ld}（addBaseTile 快照，Calculate 后终值）
let pendingSub = new Map();       // style → {liq, ln}（addSubTile 提交,death 耦合已应用）
let pendingAltDiverge = [];       // addAlternate 提交的 alternate 与当时 newTile 液体发散记录
let inlineAltDiverge = [];        // 内联 newSubTile.Alternates.Add 与所属子样式发散记录
let curInlineAlts = [];           // 当前子样式块内联 alternate 的液体（随 addSubTile 提交校验）
let manifest = {};                // tile → {liq, liqStyles, ln}
let curTileWrites = [];           // 本 tile 的 (style, writes ln) 记账
const locals = new Map();         // int num = 39; 局部变量

function coupled(r) {
  // Calculate() :1821-1831 —— waterDeath/lavaDeath ⇒ 对应维 NotAllowed
  const out = { water: r.liq.water, lava: r.liq.lava };
  if (r.wd) out.water = 'notAllowed';
  if (r.ld) out.lava = 'notAllowed';
  return out;
}
function evalExpr(e) {
  let s = e.trim()
    .replace(/newTile\.StyleWrapLimit/g, `(${work.wrap})`)
    .replace(/newSubTile\.StyleWrapLimit/g, `(${work.wrap})`);
  // ★整词替换（num2 含 num 前缀,裸 split/join 会把 num2 吃成 (39)2）
  for (const [k, v] of [...locals].sort((a, b) => b[0].length - a[0].length)) {
    s = s.replace(new RegExp(`\\b${k}\\b`, 'g'), `(${v})`);
  }
  if (!/^[\d\s()+\-*/]+$/.test(s)) return NaN;
  try { return Function(`"use strict";return (${s})`)(); } catch { return NaN; }
}
function resetSub() { sub = { liq: D(), wd: false, ld: false, wLns: [] }; curInlineAlts = []; }

let lastTileId = -1;
for (let ln = 0; ln < lines.length; ln++) {
  const L = lines[ln].trim();
  if (!L || L.startsWith('//')) continue;
  let m;
  if ((m = L.match(/^newTile\.CopyFrom\((\w+)\)\s*;/))) {
    const b = bases.get(m[1]);
    if (b) work = { liq: clone(b.liq), wd: b.wd, ld: b.ld, wrap: work.wrap };
    continue;
  }
  if ((m = L.match(/^newTile\.FullCopyFrom\((\d+)\)\s*;/))) {
    const src = manifest[m[1]];
    if (src) {
      work.liq = clone(src.liq);
      for (const [st, r] of Object.entries(src.liqStyles ?? {})) pendingSub.set(+st, { liq: clone(r), ln: src.ln });
    }
    continue;
  }
  if ((m = L.match(/^(newTile|newSubTile|newAlternate)\.WaterPlacement\s*=\s*LiquidPlacement\.(\w+)\s*;/))) {
    const v = { Allowed: 'allowed', NotAllowed: 'notAllowed', OnlyInFullLiquid: 'onlyInFull', OnlyInLiquid: 'onlyInLiquid' }[m[2]] ?? `?${m[2]}`;
    const t = m[1] === 'newTile' ? work : m[1] === 'newSubTile' ? sub : alt;
    t.liq.water = v; t.wroteLn = ln + 1;
    if (t === sub) sub.wLns.push(ln + 1);
    continue;
  }
  if ((m = L.match(/^(newTile|newSubTile|newAlternate)\.LavaPlacement\s*=\s*LiquidPlacement\.(\w+)\s*;/))) {
    const v = { Allowed: 'allowed', NotAllowed: 'notAllowed', OnlyInFullLiquid: 'onlyInFull', OnlyInLiquid: 'onlyInLiquid' }[m[2]] ?? `?${m[2]}`;
    const t = m[1] === 'newTile' ? work : m[1] === 'newSubTile' ? sub : alt;
    t.liq.lava = v; t.wroteLn = ln + 1;
    if (t === sub) sub.wLns.push(ln + 1);
    continue;
  }
  if ((m = L.match(/^(newTile|newSubTile|newAlternate)\.(WaterDeath|LavaDeath)\s*=\s*(true|false)\s*;/))) {
    const dv = m[3] === 'true';
    const t = m[1] === 'newTile' ? work : m[1] === 'newSubTile' ? sub : alt;
    if (m[2] === 'WaterDeath') t.wd = dv; else t.ld = dv;
    if (t === sub) sub.wLns.push(ln + 1);
    continue;
  }
  if ((m = L.match(/^newSubTile\.CopyFrom\((newTile|newSubTile|newAlternate|Style\w+)\)\s*;/))) {
    const src = m[1] === 'newTile' ? work : m[1] === 'newSubTile' ? sub : m[1] === 'newAlternate' ? alt : bases.get(m[1]);
    if (src) sub = { liq: clone(src.liq), wd: src.wd, ld: src.ld, wLns: [] };
    else console.error(`[warn] CopyFrom 未知名 ${m[1]} @${ln + 1}`);
    continue;
  }
  if ((m = L.match(/^newTile\.StyleWrapLimit\s*=\s*(.+?);\s*$/))) { work.wrap = evalExpr(m[1]); continue; }
  if ((m = L.match(/^int (\w+) = (.+?);\s*$/))) { locals.set(m[1], evalExpr(m[2])); continue; }
  if ((m = L.match(/^addBaseTile\(out (\w+)\)\s*;/))) {
    bases.set(m[1], { liq: coupled(work), wd: work.wd, ld: work.ld });
    work = { liq: D(), wd: false, ld: false, wrap: 0 };
    continue;
  }
  if ((m = L.match(/^addSubTileRange\(([^,]+),\s*([^)]+)\)\s*;/))) {
    const start = evalExpr(m[1]), cnt = evalExpr(m[2]);
    const snap = { liq: coupled(sub), ln: sub.wroteLn ?? ln + 1, wLns: [...sub.wLns], commitLn: ln + 1 };
    for (let i = 0; i < cnt; i++) pendingSub.set(start + i, clone(snap));
    resetSub();
    continue;
  }
  if ((m = L.match(/^addSubTile\(([^)]*)\)\s*;/))) {
    const styles = m[1].split(',').map((s) => evalExpr(s));
    const snap = { liq: coupled(sub), ln: sub.wroteLn ?? ln + 1, wLns: [...sub.wLns], commitLn: ln + 1 };
    for (const st of styles) {
      if (!Number.isFinite(st)) { console.error(`[warn] addSubTile 样式表达式不可求值 @${ln + 1}: ${m[1]}`); continue; }
      pendingSub.set(st, clone(snap));
      curTileWrites.push({ style: st, ln: snap.ln, water: snap.liq.water, lava: snap.liq.lava });
    }
    resetSub();
    continue;
  }
  // 内联 alternate（newAlternate.CopyFrom(newSubTile) + newSubTile.Alternates.Add）
  if ((m = L.match(/^newAlternate\.CopyFrom\((newTile|newSubTile|Style\w+)\)\s*;/))) {
    const src = m[1] === 'newTile' ? work : m[1] === 'newSubTile' ? sub : bases.get(m[1]);
    if (src) alt = { liq: clone(src.liq), wd: src.wd, ld: src.ld };
    continue;
  }
  if (/^newSubTile\.Alternates\.Add\(newAlternate\)/.test(L)) {
    curInlineAlts.push(coupled(alt));
    alt = { liq: D(), wd: false, ld: false };
    continue;
  }
  if (/^addAlternate\(/.test(L)) {
    // addAlternate（:2098-2109）：newAlternate.Calculate() → newTile.Alternates.Add
    const a = coupled(alt);
    if (a.water !== work.liq.water || a.lava !== work.liq.lava) {
      pendingAltDiverge.push({ ln: ln + 1, tile: lastTileId, alt: a, base: clone(work.liq) });
    }
    alt = { liq: D(), wd: false, ld: false };
    continue;
  }
  if ((m = L.match(/^addTile\((-?\d+)\)\s*;/))) {
    const id = parseInt(m[1]);
    if (id > 0) {
      const liqStyles = {};
      const liqStyleMeta = {};
      for (const [st, r] of pendingSub) {
        // 内联 alternate 发散校验（alternate 液体必须与所属子样式一致）
        for (const a of curInlineAlts) {
          if (a.water !== r.liq.water || a.lava !== r.liq.lava) {
            inlineAltDiverge.push({ tile: id, style: st, sub: clone(r.liq), alt: clone(a) });
          }
        }
        liqStyles[st] = r.liq;
        liqStyleMeta[st] = { wLns: r.wLns, commitLn: r.commitLn };
      }
      manifest[id] = { liq: coupled(work), liqStyles, liqStyleMeta, ln: ln + 1 };
      lastTileId = id;
      curTileWrites = [];
    }
    pendingSub = new Map(); curInlineAlts = [];
    work = { liq: D(), wd: false, ld: false, wrap: 0 };
    continue;
  }
  if ((m = L.match(/^newTile\.(\w+)\s*=/))) {
    if (m[1] === 'WaterPlacement' || m[1] === 'LavaPlacement' || m[1] === 'WaterDeath' || m[1] === 'LavaDeath' || m[1] === 'StyleWrapLimit') continue;
    // 基样式无关字段
    continue;
  }
  if (/^newSubTile\./.test(L)) continue;       // 非液体子样式字段（几何等）
  if (/^newAlternate\./.test(L)) continue;
}

// ---- 输出台账：只列与基记录发散的子样式（其余按 GetTileData 回落语义等价）----
const LEDGER = [];
for (const [id, r] of Object.entries(manifest)) {
  for (const [st, lq] of Object.entries(r.liqStyles)) {
    if (lq.water !== r.liq.water || lq.lava !== r.liq.lava) {
      const meta = r.liqStyleMeta?.[st] ?? {};
      LEDGER.push({ tile: +id, style: +st, base: r.liq, sub: lq, wLns: meta.wLns, commitLn: meta.commitLn });
    } else {
      LEDGER.push({ tile: +id, style: +st, base: r.liq, sub: lq, same: true });
    }
  }
}
LEDGER.sort((a, b) => a.tile - b.tile || a.style - b.style);
console.log('==== 子样式液体台账（全部 addSubTile 提交,含与基记录同值者） ====');
for (const e of LEDGER) {
  const tag = e.same ? ' (=基)' : '';
  console.log(`tile ${String(e.tile).padStart(3)} style ${String(e.style).padStart(2)}  base={${e.base.water},${e.base.lava}} sub={${e.sub.water},${e.sub.lava}}${tag}${e.wLns ? `  writes@cs:${e.wLns.join('/')} commit@cs:${e.commitLn}` : ''}`);
}
console.log(`\ntiles-with-subTiles=${Object.values(manifest).filter((r) => Object.keys(r.liqStyles).length).length}, divergent=${LEDGER.filter((e) => !e.same).length}, same=${LEDGER.filter((e) => e.same).length}`);
console.log(`addAlternate 液体发散数=${pendingAltDiverge.length}`, pendingAltDiverge.length ? JSON.stringify(pendingAltDiverge) : '');
console.log(`内联 alternate 液体发散数=${inlineAltDiverge.length}`, inlineAltDiverge.length ? JSON.stringify(inlineAltDiverge) : '');
const unknown = LEDGER.filter((e) => e.sub.water.startsWith('?') || e.sub.lava.startsWith('?'));
console.log(`未知枚举值=${unknown.length}`, unknown.length ? JSON.stringify(unknown) : '');

// ---- M-3b 交叉校验：extractor 产物（recon-tileobj.mjs 的 liqStyles）↔ 本台账逐条对拍 ----
if (process.env.TOA_JSON) {
  const toa = JSON.parse(readFileSync(process.env.TOA_JSON, 'utf8'));
  const diffs = [];
  // 台账发散条目 ⊆ extractor（tile 19/427 为 extractor 既有 unparsed 回落域——
  //   家族头无 Width/Height 声明,基记录本就 null,per-style 无处挂载,豁免并备案）
  for (const e of LEDGER.filter((x) => !x.same)) {
    const rec = toa.tiles[String(e.tile)];
    if (!rec) { console.log(`  [豁免备案] tile ${e.tile}（extractor unparsed 回落域,基记录缺失）style ${e.style} ${JSON.stringify(e.sub)}`); continue; }
    const got = rec.liqStyles?.[String(e.style)];
    if (!got) diffs.push(`缺 extractor: tile ${e.tile} style ${e.style} 期望 ${JSON.stringify(e.sub)}`);
    else if (got.water !== e.sub.water || got.lava !== e.sub.lava) diffs.push(`值差: tile ${e.tile} style ${e.style} 期望 ${JSON.stringify(e.sub)} 实得 ${JSON.stringify(got)}`);
  }
  // extractor 条目 ⊆ 台账（防 extractor 多记/错挂）
  for (const [id, r] of Object.entries(toa.tiles)) {
    for (const [st, lq] of Object.entries(r?.liqStyles ?? {})) {
      const exp = LEDGER.find((x) => x.tile === +id && x.style === +st);
      if (!exp) diffs.push(`多 extractor: tile ${id} style ${st} 台账无此发散条目`);
      else if (exp.sub.water !== lq.water || exp.sub.lava !== lq.lava) diffs.push(`错值: tile ${id} style ${st}`);
    }
  }
  console.log(`\n==== extractor↔台账对拍（TOA_JSON=${process.env.TOA_JSON}）: ${diffs.length === 0 ? '全等 0 差' : diffs.length + ' 差'} ====`);
  for (const d of diffs) console.log(' ', d);
}
