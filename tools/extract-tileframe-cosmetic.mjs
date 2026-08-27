// TileFrameCosmetic 转译器:把 Terarria1457/Terraria/WorldGen.cs 的 TileFrameCosmetic
// default 分支翻译成 JSON 程序(VanillaFraming.ts 求值执行)。
// 层级制解析:反编译按 tab 缩进(每级 2 空格);case 标签与 switch 同级,体 +1 级。
// 用法: node tools/extract-tileframe-cosmetic.mjs [out.json]
import fs from 'node:fs';

const SRC = '/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria/WorldGen.cs';
const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const START = 82684, END = 86071;
const region = lines.slice(START - 1, END).map((l, i) => {
  const m = l.match(/^([\t ]*)/) [1].replace(/\t/g, '  ').length;
  return { n: START + i, lv: Math.floor(m / 2), t: l.trim() };
});

let GLOBAL_STMTS = 0;

// ---------- 表达式 ----------
const ID_MAP = {
  'rectangle.X': 'R.x', 'rectangle.Y': 'R.y',
  'tileCache.halfBrick()': 'HALF', 'tileCache.slope()': 'SLOPE',
  'tileCache.frameNumber()': 'VNUM',
  'tile.type': 'T0.type', 'tile.active()': 'T0.act', 'tile.slope()': 'T0.slope', 'tile.halfBrick()': 'T0.half',
  'tile2.type': 'TD.type', 'tile2.active()': 'TD.act', 'tile2.slope()': 'TD.slope', 'tile2.halfBrick()': 'TD.half',
  'tile3.type': 'TL.type', 'tile3.active()': 'TL.act', 'tile3.slope()': 'TL.slope', 'tile3.halfBrick()': 'TL.half',
  'tile4.type': 'TR.type', 'tile4.active()': 'TR.act', 'tile4.slope()': 'TR.slope', 'tile4.halfBrick()': 'TR.half',
  'tile5.type': 'TDL.type', 'tile5.active()': 'TDL.act', 'tile5.slope()': 'TDL.slope', 'tile5.halfBrick()': 'TDL.half',
  'tile6.type': 'TDR.type', 'tile6.active()': 'TDR.act', 'tile6.slope()': 'TDR.slope', 'tile6.halfBrick()': 'TDR.half',
  'tile7.type': 'TUL.type', 'tile7.active()': 'TUL.act', 'tile7.slope()': 'TUL.slope', 'tile7.halfBrick()': 'TUL.half',
  'tile8.type': 'TUR.type', 'tile8.active()': 'TUR.act', 'tile8.slope()': 'TUR.slope', 'tile8.halfBrick()': 'TUR.half',
  'tileCache.frameX': 'OLDFX', 'tileCache.frameY': 'OLDFY', 'tileCache.type': 'NUM',
};
function mapExpr(toks) {
  let out = '', k = 0;
  const peek = (o = 0) => toks[k + o];
  const join = (n) => toks.slice(k, k + n).map((x) => x.v).join('');
  const readIndex = (start) => {
    let depth = 0, j = start;
    for (; j < toks.length; j++) {
      if (toks[j].v === '[') depth++;
      else if (toks[j].v === ']') { depth--; if (depth === 0) break; }
    }
    return [mapExpr(toks.slice(start + 1, j)), j + 1];
  };
  while (k < toks.length) {
    const t = peek();
    if (t.k === 'id') {
      if (join(2) === 'Main.') {
        const name = peek(2).v;
        if (peek(3)?.v === '[') { const [inner, nk] = readIndex(k + 3); out += `S.${name}(${inner})`; k = nk; continue; }
        throw new Error(`L${curLineN} [${region[curLineIdx]?.t?.slice(0,60)}] Main.${name} 非下标`);
      }
      if (join(3) === 'TileID.Sets.') {
        const name = peek(2).v;
        if (peek(3)?.v !== '[') throw new Error(`Sets.${name} 非下标`);
        const [inner, nk] = readIndex(k + 3);
        out += `S.${name}(${inner})`; k = nk; continue;
      }
      if (t.v === '(' && ['double','byte','int','short','ushort','float'].includes(peek(1)?.v) && peek(2)?.v === ')') { k += 3; continue; }
      if (join(2) === 'Main.' && peek(1)?.v === 'rockLayer') { out += 'ROCKLAYER'; k += 2; continue; }
      if (t.v === 'genRand' && peek(1)?.v === '.') {
        if (peek(2)?.v !== 'Next') throw new Error('genRand.???');
        out += 'VR'; k += 3; continue;
      }
      if (peek(1)?.v === '.') {
        const probe = t.v + '.' + peek(2)?.v;
        const mapped2 = ID_MAP[probe + '()'] ?? ID_MAP[probe];
        if (mapped2 !== undefined) { out += mapped2; k += 3; continue; }
      }
      if (t.v === 'tileCache' && peek(1)?.v === '.') {
        const base = 'tileCache.' + peek(2).v;
        const mapped = ID_MAP[base + '()'] ?? ID_MAP[base];
        if (mapped === undefined) throw new Error(`tileCache.${peek(2).v} 未映射`);
        out += mapped; k += 3; continue;
      }
      if (ID_MAP[t.v] !== undefined) { out += ID_MAP[t.v]; k++; continue; }
      if (/^(up|down|left|right|upLeft|upRight|downLeft|downRight|num|num11|num6|num4|num5|num7|num8|num9|num10|num12|num19|num20|num21|num22|num23|i|j|NUM|FLAG|frameX|frameY)$/.test(t.v)) { out += t.v; k++; continue; }
      if (t.v === 'true' || t.v === 'false' || t.v === 'null') { out += t.v; k++; continue; }
      throw new Error(`L${curLineN} 未知标识符 ${t.v} @ ${toks.slice(k, k + 6).map((x) => x.v).join(' ')}`);
    }
    if (t.k === 'num') { out += `(${t.v})`; k++; continue; }
    out += t.v; k++;
  }
  return out;
}
let curLineN = 0, curLineIdx = 0;
const mapCond = (src) => { try { return mapExpr(tokenize(src)); } catch (e) { throw new Error(`L${curLineN} [${region[curLineIdx]?.t?.slice(0,70)}] EXPR<${src.slice(0,80)}> : ${e.message}`); } };
function tokenize(text) {
  const toks = [];
  let i = 0;
  const isId = (c) => /[A-Za-z0-9_]/.test(c);
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < text.length && /[0-9]/.test(text[j])) j++;
      toks.push({ k: 'num', v: parseInt(text.slice(i, j), 10) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < text.length && isId(text[j])) j++;
      toks.push({ k: 'id', v: text.slice(i, j) }); i = j; continue;
    }
    const two = text.slice(i, i + 2);
    if (['==', '!=', '&&', '||'].includes(two)) { toks.push({ k: 'op', v: two }); i += 2; continue; }
    if ('(){}=;,.!+-*/%<>?:[]'.includes(c)) { toks.push({ k: 'p', v: c }); i++; continue; }
    throw new Error(`tok? @${JSON.stringify(text.slice(i, i + 30))}`);
  }
  return toks;
}

// ---------- 语句(层级制) ----------
function parseStmts(i, level, maxCount = Infinity) {
  const stmts = [];
  while (i < region.length && stmts.length < maxCount) {
    if (++GLOBAL_STMTS > 400000) { console.error(`[HARD-CAP] L${region[i]?.n} lv=${level}`); process.exit(3); }
    const { n, lv, t } = region[i];
    curLineN = n; curLineIdx = i;
    if (t === '' || t.startsWith('//')) { i++; continue; }
    if (lv < level) break;
    if (lv > level) throw new Error(`L${n}: 缩进越级 ${lv}>${level}: ${t.slice(0, 70)}`);
    if (t === '}') break; // 由调用方消费
    let m;
    if ((m = t.match(/^if \((.+)\)$/))) {
      i++;
      const body = [], elseBody = [];
      let tail = null;
      if (region[i]?.t === '{') {
        i++;
        { const [b2, i2] = parseStmts(i, level + 1); body.push(...b2); i = i2; }
        if (region[i]?.t === undefined || !region[i].t.startsWith('}')) throw new Error(`L${n}: if 体缺 }: ${region[i]?.t?.slice(0,40)}`);
        const closeLine = region[i].t;
        if (closeLine === '}') {
          i++;
          // 独立 else 行
          if (region[i]?.t === 'else') {
            i++;
            if (region[i]?.t === '{') {
              i++;
              { const [b2, i2] = parseStmts(i, level + 1); elseBody.push(...b2); i = i2; }
              if (region[i]?.t !== '}') throw new Error(`L${n}: else 体缺 }`);
              i++;
            } else {
              const [b2, i2] = parseStmts(i, level + 1, 1); elseBody.push(...b2); i = i2;
            }
          }
        } else if (closeLine.startsWith('} else if (')) {
          region[i] = { ...region[i], t: 'if (' + closeLine.slice(11) };
          const [els, ni] = parseStmts(i, level, 1); tail = els; i = ni;
        } else if (closeLine === '} else {') {
          i++;
          { const [b2, i2] = parseStmts(i, level + 1); elseBody.push(...b2); i = i2; }
          if (region[i]?.t !== '}') throw new Error(`L${n}: else 体缺 }`);
          i++;
        } else if (closeLine.startsWith('} else ')) {
          region[i] = { ...region[i], t: closeLine.slice(7) };
          const [els, ni] = parseStmts(i, level, 1); tail = els; i = ni;
        } else {
          throw new Error(`L${n}: } 后未识别: ${closeLine.slice(0, 60)}`);
        }
      } else {
        { const [b2, i2] = parseStmts(i, level + 1, 1); body.push(...b2); i = i2; }
        if (region[i]?.t?.startsWith('} else')) throw new Error(`L${n}: 无{}体后接 else(未支持)`);
      }
      stmts.push({ kind: 'if', cond: mapCond(m[1]), then: body, else: tail ?? (elseBody.length ? elseBody : null), line: n });
      continue;
    }
    if ((m = t.match(/^switch \((.+)\)$/))) {
      i++;
      if (region[i]?.t === '{') i++;
      const cases = {};
      let cur = null;
      while (i < region.length) {
        const t2 = region[i].t, l2 = region[i].lv;
        if (l2 < level) break;
        if (t2 === '}') { i++; break; }
        if (t2 === '{') { i++; continue; } // case/default 后的裸块开括号(语句在其下一级)
        const cm = t2.match(/^case (.+):$/);
        if (t2 === 'default:') { cur = 'default'; cases[cur] = []; i++; continue; }
        if (cm) { cur = cm[1]; cases[cur] = []; i++; continue; }
        if (t2 === 'break;' || t2 === '') { i++; continue; }
        const [blk, ni] = parseStmts(i, level + 1);
        cases[cur].push(...blk);
        i = ni;
        if (i >= region.length) break;
        if (region[i].t === 'break;') i++;
      }
      stmts.push({ kind: 'switch', disc: mapCond(m[1]), cases, line: n });
      continue;
    }
    if ((m = t.match(/^([A-Za-z_][A-Za-z0-9_.]*)\((.+)\);$/)) && !/^Rectangle /.test(t)) {
      const fn = m[1];
      if (!['TileMergeAttempt', 'TileMergeAttemptWeird', 'TileFrame', 'tileMergeCulling.Cull', 'CactusFrame'].includes(fn)) {
        throw new Error(`L${n}: 未知调用 ${fn}`);
      }
      stmts.push({ kind: 'call', fn: fn === 'tileMergeCulling.Cull' ? 'Cull' : fn, args: splitArgs(m[2]).map(mapCond), line: n });
      i++; continue;
    }
    if ((m = t.match(/^([A-Za-z0-9_.]+) = (.+);$/))) {
      const target = m[1] === 'rectangle.X' ? 'rectX' : m[1] === 'rectangle.Y' ? 'rectY' : m[1];
      stmts.push({ kind: 'assign', target, expr: mapCond(m[2]), line: n });
      i++; continue;
    }
    if (t === 'return;') { stmts.push({ kind: 'return', line: n }); i++; continue; }
    if (t === 'break;') { stmts.push({ kind: 'break', line: n }); i++; continue; }
    if (t.startsWith('bool ') || t.startsWith('int ') || t.startsWith('short ')) {
      const dm = t.match(/^(?:bool|int|short) ([A-Za-z0-9_]+) = (.+);$/);
      if (!dm) throw new Error(`L${n}: 声明不匹配: ${t}`);
      stmts.push({ kind: 'assign', target: dm[1], expr: mapCond(dm[2]), line: n });
      i++; continue;
    }
    if (t.startsWith('Rectangle rectangle')) { stmts.push({ kind: 'assign', target: 'rectInit', expr: 'null', line: n }); i++; continue; }
    if (/^(Tile|TileMergeCullCache|Vector2|Point)[ A-Za-z]/.test(t) && t.includes('=')) { i++; continue; } // 邻居句柄/缓存句柄声明——求值器不建模
    if (t.startsWith('tileCache.frameNumber(')) { stmts.push({ kind: 'assign', target: 'VNUM', expr: '(' + (t.match(/\(byte\)(\d+)/)?.[1] ?? 'num6') + ')', line: n }); i++; continue; }
    if (t.startsWith('if (') ) { /* 已被上方匹配,兜底 */ }
    throw new Error(`L${n}: 未识别语句: ${t.slice(0, 80)}`);
  }
  return [stmts, i];
}

function splitArgs(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// ---------- 主流程 ----------
const [top, endI] = parseStmts(0, region[0].lv);
if (top.length !== 1 || top[0].kind !== 'switch') throw new Error('顶层应为 switch(num)');
const sw = top[0];
console.error('外层 cases:', Object.keys(sw.cases).join(','));
const def = sw.cases.default;
if (!def) throw new Error('无 default 分支');
console.error('default 分支顶层语句数:', def.length);
const kinds = {};
const walk = (stmts) => { for (const s of stmts) { kinds[s.kind] = (kinds[s.kind] ?? 0) + 1; if (s.then) walk(s.then); if (s.else) walk(s.else); if (s.cases) Object.values(s.cases).forEach(walk); } };
walk(def);
console.error('语句统计:', JSON.stringify(kinds));
console.error('消耗至行:', region[Math.min(endI, region.length - 1)].n, '/', END);
fs.writeFileSync(process.argv[2] ?? '/tmp/tileframe-program.json', JSON.stringify({ region: [START, END], program: def }, null, 1));
console.error('written');
