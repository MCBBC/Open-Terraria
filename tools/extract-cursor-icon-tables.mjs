// 一次性提取器:指针交互图标依赖的四张 style→item 表
// (WorldGen.Get{ItemDrop_Beds,ItemDrop_Candles,ItemDrop_Chests,ItemDrop_Dressers})
// + Chest.Initialize 覆写 → src/data/vanilla-hovericons.json。
// 解析 = switch-case 机械转录(含穿透 fallthrough 区间与嵌套 default)。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const src = readFileSync(`${ROOT}/Terarria1456/Terraria/WorldGen.cs`, 'utf8');

/** 取方法体(花括号配平) */
function methodBody(name) {
  const idx = src.indexOf(name);
  if (idx < 0) throw new Error(name + ' 未找到');
  const start = src.indexOf('{', idx);
  let d = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start + 1, i); }
  }
  throw new Error(name + ' 体未闭合');
}

/** switch 文本 → {style: value}。识别:
 *  - `case N: ... result = X;`(可穿透:多个 case 共享一个 result)
 *  - `result = C + style` / `result = C + style - K` 算式
 *  - 嵌套内层 switch 同法(递归) */
function parseSwitch(body, resultVar = 'result') {
  const out = {};
  const caseRe = /case (\d+):/g;
  const matches = [...body.matchAll(caseRe)];
  for (let k = 0; k < matches.length; k++) {
    const from = matches[k].index + matches[k][0].length;
    const to = k + 1 < matches.length ? matches[k + 1].index : body.length;
    const seg = body.slice(from, to);
    // 段内首个赋值(穿透 case 的段在下一 case 前找到自己的赋值;
    // 若本段无赋值则与下一段共享——由下一段处理时回填,这里先记 null)
    let val = null;
    const direct = seg.match(new RegExp(`${resultVar} = (\\d+);`));
    // 算式两种朝向:`style + 643` / `2045 + style - 4`
    const f1 = seg.match(new RegExp(`${resultVar} = style \\+ (\\d+);`));
    const f2 = seg.match(new RegExp(`${resultVar} = (\\d+) \\+ style(?: - (\\d+))?;`));
    // 段内还有嵌套 switch(default:) → 递归并入(穿透 case 到 default 的段会被
    // 嵌套 case 切开;嵌套外的本层 case 若无赋值 = 'prev')
    const nested = /default:/.test(seg) && /switch \(style\)/.test(seg) ? parseSwitch(seg, resultVar) : null;
    if (direct) val = +direct[1];
    else if (f1) val = { base: +f1[1], off: 0, styleFirst: true };
    else if (f2) val = { base: +f2[1], off: f2[2] ? +f2[2] : 0 };
    else if (/break;/.test(seg)) val = 'prev';
    if (nested) out.__nested = nested;
    out[+matches[k][1]] = val;
  }
  return out;
}

/** 算式展开:case N 的 {base,off} → base + N - off;styleFirst → N + base。
 *  C# 穿透向下:case 1/2/3 共享 `style+643` 段时**各自代入自己的 style**(644/645/646)
 *  ——回填传递的是公式对象而非算好的值;穿透遇到直接量则同值 */
function expand(map, defaultVal) {
  const raw = {};
  const keys = Object.keys(map).filter((k) => k !== '__nested').map(Number).sort((a, b) => a - b);
  for (const n of keys) {
    const v = map[n];
    raw[n] = (typeof v === 'object' && v !== null) || typeof v === 'number' ? v : null;
  }
  const evalAt = (v, n) => typeof v === 'object' ? (v.styleFirst ? n + v.base : v.base + n - v.off) : v;
  const out = {};
  let carry = defaultVal;   // number | formula
  for (let i = keys.length - 1; i >= 0; i--) {
    const n = keys[i];
    if (raw[n] !== null) { out[n] = evalAt(raw[n], n); carry = raw[n]; }
    else out[n] = evalAt(carry, n);
  }
  if (map.__nested) Object.assign(out, expand(map.__nested, defaultVal));
  return out;
}

const beds = expand(parseSwitch(methodBody('public static int GetItemDrop_Beds')), 224);
const candles = expand(parseSwitch(methodBody('public static int GetItemDrop_Candles')), 105);
const dressers = expand(parseSwitch(methodBody('public static int GetItemDrop_Dressers')), 334);
// Chests:双表(secondType 3884 基/普通 48 基)——按 secondType 参数拆段
const chestsBody = methodBody('public static int GetItemDrop_Chests');
const secondSeg = chestsBody.slice(chestsBody.indexOf('if (secondType)'), chestsBody.indexOf('else', chestsBody.indexOf('if (secondType)')));
const firstSeg = chestsBody.slice(chestsBody.indexOf('else', chestsBody.indexOf('if (secondType)')));
const chests2 = expand(parseSwitch(secondSeg, 'num'), 3884);
const chests1 = expand(parseSwitch(firstSeg, 'num'), 48);
// Chest.Initialize 覆写(Chest.cs:224-251)
const chestSrc = readFileSync(`${ROOT}/Terarria1456/Terraria/Chest.cs`, 'utf8');
const init = chestSrc.slice(chestSrc.indexOf('public static void Initialize'), chestSrc.indexOf('public static bool IsPlayerInChest'));
for (const m of init.matchAll(/array\[(\d+)\] = (\d+);/g)) chests1[+m[1]] = +m[2];
for (const m of init.matchAll(/array2\[(\d+)\] = (\d+);/g)) chests2[+m[1]] = +m[2];

const data = {
  beds, candles, dressers,
  chests: chests1, chests2,
  // GetItemDrop_Chair(椅子 :33444 悬停表;return/result 双写法——return 版直录)
  chairs: (() => {
    const body = methodBody('public static int GetItemDrop_Chair');
    // 版本 A:`case N: ... return X;`(穿透到公式 `1703 + style - 18` 各自代入)
    const out = {};
    // 先剥掉后半 result 版(40+ 段),前段 return 版逐 case 处理
    const cut = body.indexOf('int result = 34;');
    const retSeg = body.slice(0, cut > 0 ? cut : body.length);
    const resSeg = cut > 0 ? body.slice(cut) : '';
    const caseRe = /case (\d+):/g;
    const ms = [...retSeg.matchAll(caseRe)];
    for (let k = 0; k < ms.length; k++) {
      const from = ms[k].index + ms[k][0].length;
      const to = k + 1 < ms.length ? ms[k + 1].index : retSeg.length;
      const seg = retSeg.slice(from, to);
      const dir = seg.match(/return (\d+);/);
      const fm = seg.match(/return (\d+) \+ style - (\d+);/);
      const n = +ms[k][1];
      if (fm) out[n] = { base: +fm[1], off: +fm[2] };
      else if (dir) out[n] = +dir[1];
      else out[n] = '__next__';
    }
    // return 版穿透:无 return 的 case 取下一 case 的值/【公式】(各自代入)
    const keys = Object.keys(out).map(Number).sort((a, b) => a - b);
    let carry = null;
    for (let i = keys.length - 1; i >= 0; i--) {
      if (out[keys[i]] === '__next__') out[keys[i]] = carry;
      else carry = out[keys[i]];
    }
    for (const n of keys) {
      if (typeof out[n] === 'object' && out[n] !== null) out[n] = out[n].base + n - out[n].off;
    }
    // 后半 result 版(40-67)
    Object.assign(out, expand(parseSwitch(resSeg, 'result'), 34));
    for (let s = 0; s <= 67; s++) if (out[s] === undefined) out[s] = s === 0 ? 34 : out[s];
    return out;
  })(),
  // TETeleportationPylon.GetPylonItemTypeFromTileStyle(:116-129)
  pylons: { 0: 4876, 1: 4875, 2: 4916, 3: 4917, 4: 4918, 5: 4919, 6: 4920, 7: 4921, 8: 4951, 9: 5652, 10: 5653 },
};
writeFileSync(`${ROOT}/game/src/data/vanilla-hovericons.json`, JSON.stringify(data));
const n = (o) => Object.keys(o).length;
console.log(`beds ${n(beds)} / candles ${n(candles)} / dressers ${n(dressers)} / chests ${n(chests1)}+${n(chests2)}`);
console.log('beds[1..3]:', beds[1], beds[2], beds[3], '(应 644/645/646)');
console.log('chests1[2]:', chests1[2], '(覆写后应 327); [23]:', chests1[23], '(应 1533)');
console.log('dressers[5]:', dressers[5], '(应 2386); [4]:', dressers[4], '(应 918)');
