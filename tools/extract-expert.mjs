// 从 Item.cs SetDefaults1..5 提取 `expert = true` 旗表 → src/data/vanilla-expert.json。
// ★BJ105 登记债清偿（2026-09-17）：掉落物名 tickHoverDropName 的 expert→rare=−12 专家
// 彩虹支（Main.cs:43624-43627 `rare = inner.rare; if (inner.expert) rare = -12;`）此前
// 因旗表整缺不可达。消费面=Game.ts tickHoverDropName（VID_EXPERT 域）。
//
// 定谳（1457 Item.cs 亲读 25 处逐站点）：25 处 `expert = true;` → **43 id**（三个
// fallthrough 共享组展开）：1131 重力球/3090 史莱姆王之凝/3097 克苏鲁护盾/3223 混乱之
// 脑/3224 蠕虫围巾/3245 骨手套/3318-3332 十三主袋+王袋等 15 袋/3333 蜂巢背包/3335 恶魔
// 心脏/3336 孢子囊/3337 闪亮石/3353 机械矿车/3354-3356 机械车轮三件/3367 小猪龙鱼
// （虾米松露）/3577 可疑触手/3860-3862 撒旦三袋/4444 女巫扫帚/4782 光之女皇袋/
// 4954 长虹尾翼/4957 史莱姆女皇袋/4987 挥发凝胶/4989 女皇飞行助推器/5100 骨头盔/
// 5111 独眼巨鹿袋/5289 电动矿车。1456/1457/1458 三树 id 集全等（CLI 对拍实证）。
//
// 形态纪律（FX53 五形态盲区教正则，逐条定谳后建模）：
//   ① returns 终结旗：25 处全部 `expert = true; return;` 顶格体尾——深度栈机器在
//     return/break 处冲刷组，天然承接；
//   ② 区间 if：case 3318-3332 与 3860-3862 组内 if(type==X) 链只覆写 rare，
//     expert=true 在体顶层无条件位（所有 25 处均 case 体顶层、零 if 支内旗）；
//   ③ DefaultTo* helper：全文件 `expert` 仅 字段声明 :129/:131 + ResetStats 归零
//     :48958/:48960 + 25 处赋值——无 helper 隐式面（残文审计兜底）；
//   ④ SetDefaults 委托继承：SetDefaults 尾链 `1803-1807 → SetDefaults(1533+…)`
//     （:48721-48724）与 OnCreated `5437→5358`（:48738-48741）——委托目标 1533-1537/
//     5358 均无 expert ⇒ 零继承面；提取器加守卫：若目标集出现旗则 fail-loud；
//   ⑤ 有状态正则：不用正则扫全文——按行深度栈解析（extract-itemrare.mjs 同法），
//     只认 case 组体顶层(depth=组深+1)无条件赋值，变体 if 支内不收。
// 输出 Record<vid, 1>（itemfunc 1/0 旗惯型；recon-item SCALAR 直写）。
// 用法：SW_ITEM_VER=1457 node tools/extract-expert.mjs   （直跑落盘）
//       node tools/extract-expert.mjs --dump             （stdout 全量表，recon 双实例用）
import { readFileSync, writeFileSync, writeSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
// 源版本可选(recon-item-1456-1457.mjs 双实例分别取 1456/1457;缺省 1456 = 既有产物基线)
export const SRC_VER = process.env.SW_ITEM_VER ?? '1456';

/** 提取库：Item.cs 全文 → { EXPERT }（vid → 1；未列出 = expert=false（ResetStats 默认）） */
export function extractExpert(src) {
  const LINES = src.split('\n');

  /** 方法体切片（从签名行到配平的闭括号，含尾行） */
  function methodRange(name) {
    const sig = LINES.findIndex((l) => new RegExp(`^\\t(public|private) void ${name}\\(`).test(l));
    if (sig < 0) throw new Error(`method ${name} not found`);
    let depth = 0;
    for (let i = sig; i < LINES.length; i++) {
      depth += (LINES[i].match(/{/g) ?? []).length - (LINES[i].match(/}/g) ?? []).length;
      if (depth === 0 && i > sig) return [sig, i];
    }
    throw new Error(`method ${name} unbalanced`);
  }

  const REGIONS = ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults']
    .map((n) => methodRange(n));
  const regionNames = ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults'];

  const EXPERT = {};
  for (let r = 0; r < REGIONS.length; r++) {
    const [from, to] = REGIONS[r];
    // 深度栈：switch 关键字 depth d → case 标签 d+1 → 体语句/终止符 d+2
    const groups = []; // { ids: number[], depth }
    const groupAt = (d) => {
      for (let i = groups.length - 1; i >= 0; i--) if (groups[i].depth === d) return groups[i];
      return null;
    };
    const flush = (g) => {
      if (!g) return;
      // 先写为准：反编译 SetDefaults 是多个顺序独立 switch(type) 链，命中即 return
      // （extract-itemrare.mjs 同判词——后置 switch 里重叠标签是死代码）
      if (g.expert) for (const id of g.ids) if (EXPERT[id] === undefined) EXPERT[id] = 1;
      groups.splice(groups.indexOf(g), 1);
    };
    for (let i = from; i <= to; i++) {
      const line = LINES[i];
      const depth = (line.match(/^\t*/) ?? [''])[0].length;
      const cm = line.match(/^\t*case (\d+):\s*$/);
      if (cm) {
        const id = parseInt(cm[1], 10);
        const top = groups[groups.length - 1];
        if (top && top.depth === depth) top.ids.push(id);
        else groups.push({ ids: [id], depth });
        continue;
      }
      const s = line.trim();
      if (/^(break;|return\b|goto )/.test(s)) { flush(groupAt(depth - 1)); continue; }
      if (/^default:/.test(s)) { flush(groupAt(depth)); continue; }
      const g = groupAt(depth - 1);
      if (!g || depth !== g.depth + 1) continue;   // 只认 case 体顶层无条件语句（变体 if 支内不收）
      if (/^expert = true;$/.test(s)) { g.expert = true; continue; }
      // 任意 `expert = …` 非字面 true（表达式/变量/helper 返回值）= 未知形态 → fail-loud
      if (/^expert\s*=/.test(s)) {
        throw new Error(`${regionNames[r]}:${i + 1} 非字面 expert 赋值（五形态外新形态，人工定谳后扩表）: ${s}`);
      }
    }
    while (groups.length) flush(groups[0]);
  }

  // ---- 残文审计（③④兜底）：全文 `expert` 触点必须落在 ①五方法区 ②字段声明/ResetStats 归零，
  // 否则说明源码出现提取面外新形态（区间支/新 helper/委托继承），禁静默半表 ----
  const regions = REGIONS.map(([a, b]) => [a, b]);
  const inRegion = (ln) => regions.some(([a, b]) => ln >= a && ln <= b);
  const srcLines = LINES;
  for (let i = 0; i < srcLines.length; i++) {
    if (!/\bexpert\b/.test(srcLines[i])) continue;
    const ln = i + 1;
    if (inRegion(ln)) continue;
    // 域外白名单：字段声明（public bool expert/expertOnly;）+ ResetStats 归零 + expertOnly 全域
    if (/^\s*public bool expert(Only)?;/.test(srcLines[i])) continue;
    if (/^\s*expert(Only)? = false;\s*$/.test(srcLines[i])) continue;
    if (/\bexpertOnly\b/.test(srcLines[i])) continue;   // expertOnly 另旗非本表（无 SetDefaults 写点）
    throw new Error(`Item.cs:${ln} 域外 expert 触点（提取面外新形态）: ${srcLines[i].trim()}`);
  }
  // ④委托继承守卫：委托目标集（SetDefaults 尾链 1803-1807→1533-1537 / OnCreated 5437→5358）
  //   若出现旗，则委托方 1803-1807/5437 实际继承 expert——须人工扩表
  for (const t of [1533, 1534, 1535, 1536, 1537, 5358]) {
    if (EXPERT[t] !== undefined) {
      throw new Error(`委托目标 ${t} 带 expert 旗——1803-1807/5437 继承面须人工定谳扩表`);
    }
  }
  return { EXPERT };
}

const { EXPERT } = extractExpert(readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria/Item.cs`, 'utf8'));
export { EXPERT };
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  // --dump:全量表出 stdout 不落盘(recon-item-1456-1457.mjs 双版本对账用)
  if (process.argv.includes('--dump')) {
    writeSync(1, JSON.stringify({ src: SRC_VER, EXPERT }));
  } else {
    writeFileSync(`${ROOT}/game/src/data/vanilla-expert.json`, JSON.stringify(EXPERT));
    console.error(`expert 条目: ${Object.keys(EXPERT).length}（源 Terarria${SRC_VER}）`);
  }
}
