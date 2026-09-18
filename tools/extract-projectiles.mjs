// 从 Terarria1456 Projectile.cs SetDefaults 提取投射物数据。
// 注意：与 Item.cs 不同，Projectile.cs 的 SetDefaults(Type) 用的是
// `if (type == N) {...} else if (type == M) {...}` 链（约 436 行起），
// 不是 switch-case —— 之前按 switch 解析提取到 0 条就是这个原因。
// 深度 1 赋值捕获；输出 src/data/vanilla-projectiles.json
//
// ★追加时代守卫（2026-09-18，清债 BJ114-e 同族普查）：vanilla-projectiles.json 已进入
//   recon+手补双通道时代——现库含本 producer 输出面之外的增量字段（鞭/多弹族
//   localNPCHitCooldown / idStaticNPCHitCooldown / 1117·1122 宽高元组等 33 键，
//   恢复指引=src/data/vanillaProjectiles.ts 头注手补清单），本 producer=纯全量覆写
//   （不读现有），任何跑都会把上述增量洗掉；SW_ITEM_VER=1456 跑更会把 1457 特有弹段
//   1111-1135（ProjectileID.Count=1136 的 25 弹）整段洗掉——CLAUDE.md「vanilla-
//   projectiles.json 曾被 1456 提取器重跑，须对照 1457 逐值校验」的制度化解法。照
//   era guard 判例（atlas 四连 / recipes R25-B5② / npcs 债刀-3）落闸——守卫=重产输出
//   vs 现库【动态 diff】：①缺 id（现库有而重产盖不住；1111-1135 段整缺=1456 源指纹，
//   探测动态比对不硬编码 id 清单）+②值漂移（同 id 键值 deep-equal 不等，含「现库
//   独有字段」与「字段值差」两形态），任一非空且未带双旗即拒 exit 1+物证。--dump
//   对账通道不受守卫限制（recon-item-1456-1457.mjs 双实例依赖）。活通道=recon-item-
//   1456-1457.mjs 三方对账（proj 键值逐值校验）；重产前增量须先反哺进本提取器输出面
//   （判例 fx3「重产前必反哺」，否则手补被静默洗回）。确需原地强推：双旗 --force-full
//   --overwrite-append-era（单旗仍拒）。测试注入面：SW_PROJ_JSON（守卫探测路径）/
//   SW_OUT（写盘路径），缺省行为不变。守卫测试：tests/extract-projectiles-era-guard.test.ts。
// ★g1 footgun 硬化（2026-09-18，红蓝-F①）：探测 env（SW_PROJ_JSON）设置而 SW_OUT
//   缺省 → 拒跑 exit 1（fail-closed）——守卫探测读夹具（零缺失→放行）而写盘落缺省
//   现库路径 game/src/data/vanilla-projectiles.json，探测与写盘分离=守卫被绕过洗库。
//   处置：显式 SW_OUT（与探测同沙箱）或同时清探测 env；--dump 对账通道不写盘不受此限。
//
// ★★2026-09-18 反哺批（BJ127 33 键收口，fx3 判例处方执行）——手补增量已反哺进本
//   producer 输出面，重产不再洗列。形态清单（1457/1458 双树 SetDefaults 逐行亲读,
//   免疫四列写面 1457↔1458 逐行 diff 全等）：
//   ①NUM_FIELDS += localNPCHitCooldown/idStaticNPCHitCooldown（字面直写族,309/301/
//     932/1112-1135 等 24 键即此）;BOOL_FIELDS += usesLocalNPCImmunity/
//     usesIDStaticNPCImmunity（成对旗;prologue :714-717 复位 -2/-1/false/false 在
//     顶层链外,不采集）。DefaultToWhip(:10706 体 :10718-10719)/DefaultToFlail
//     (:10755 体 :10762-10763) 经辅助方法展开自带该两列（15+9 调用点）。
//   ②元组 `width = (height = 16);`（:10179/:10431/:10441 = 1091/1117/1122,
//     SetDefaults 全文仅此三处）→ 展开为两条直写。
//   ③常量 switch 修正：`switch (2)`（:1584,76-78 音符弹,反编译恒走支）case 标签非
//     type 值——按实参常数匹配 case 组（case 2 恒走）;switch(type)（:4937/:7141）
//     维持按 id 匹配。
//   ④ApplyGemStaffStats()（:10685-10691,private）纳入辅助方法展开——121-126/597
//     七调用点（:2114-2159/:6470）得 friendly/usesLocalNPCImmunity/localNPCHitCooldown
//     60/timeLeft 300;UseGroupStaticImmunity(:10678) 参数化——旧判「仅 switch(2) 死支
//     可达,不展开」为假命题,已被⑨翻案展开;ResetLocalNPCHitImmunity(:747 序言复位)
//     在链外不采集。
//   ⑤算式/别名特支（BJ97 算式覆写判例:只认枚举形态,未枚举照旧跳过不猜值）——
//     `timeLeft = MaxUpdates * N`（639 :6884=2×45=90/616 :6644=90×3=270/715-718
//     :7596+:7608=360×3=1080/729 :7686=10×3=30/977 :9225=30/976 :9286=60×1=60/
//     1045 :9906=24×2=48）、`timeLeft = N * (extraUpdates + 1)`（466 :5404=120×5=600）、
//     `timeLeft = extraUpdates * N * M`（710 :7533=1×60×5=300）、
//     `localNPCHitCooldown = N / MaxUpdates`（C# 整除,933 :8872/1100 :10280=15/2=7）、
//     `localNPCHitCooldown = 局部变量`（76-78 :1592 ← int num2=30 :1583）。
//   ⑥显式标注登记（本批不解析,照 BJ97「须特支或显式标注」）：
//     · `timeLeft *= N` 复合族（SetDefaults 内 ~140 位,5/10/2/3 倍）——基值在序言
//       `timeLeft = 3600`（:789）,块内字面可再覆写,须序言基值建模方能 1:1,本批不做;
//     · `scale = 1f + (float)Main.rand.Next(30) * 0.01f` 随机表意式（先决限制）;
//     · `alpha` 未入 NUM_FIELDS（496 alpha=255 :5695 仍走 vanillaProjectiles.ts
//       DATA_PATCH 层,json 面不载,与既有约定一致）。
//   ⑦守卫判据细化：损失面（拒绝）=缺 id/现库独有字段/同字段值差;增益面（放行+
//     高声通告）=重产新增覆盖字段——反哺后 producer 面超前于 json 冻结态=预期
//     （重产写盘将新增这些列,须运行时消费面审计+recon-item-1456-1457.mjs 收口）。
//   ⑧★BJ129③ 已修（2026-09-18,登记债③清偿）：嵌套 if/else 链【裸 else 块】曾经尾随
//     expandTypeSwitchLines(block.slice(cursor)) 无条件并入（(?:else\s+)?if 正则不吃
//     `else {`,而 lastMatch 取末条 ⇒ else 支值覆盖真值）——76/77 宽高吃 else 支 22×24
//     （源码 :1560-1572 实为 76=10×22/77=18×24）。SetDefaults 全文裸 else 站点 6 处
//     （:1570/:4207/:4826/:6194/:10330 五处在链块内 + :10669 顶层 `else { active=false; }`
//     兜底=提取器顶层链不收集尾随支,天然无涉）,受影响 id 9 个：
//     76/77（音符）、326/327（GreekFire1/2）、400/401（MolotovFire1/2）、567（SporeTrap,
//     SW-FX1 DATA_PATCH 先例）、1107/1108（ObsidianFire1/2）——其余 78/328/402/568/1109
//     走 else 支本即真值,修复后值不变。修法=collectLinesForId 链态语义（命中一支后
//     余下 else-if/else 全跳;全未命中走裸 else;裸 else 归属链尾显式消费,peekBareElse）。
//     连带：json 重产（era guard 通道）+运行时消费面审计（MolotovFire 400-402 火云经
//     Arrow ctor+placeAtShootSpawn 读数据面盒径,Game.ts 燃烧瓶支 R9 批四注已预告自动跟随;
//     567/568 SporeSacProj 实体侧硬编码 14/16 已对,数据面对齐零行为差）。
//   ⑨★J1 反哺批（2026-09-18,红蓝-J1 两处确认级缺口①数据面收口）：UseGroupStaticImmunity
//     (int Type)（:10678-10683,private,1457 新增——1456 无此 helper,1458 两树行号全等）
//     参数化辅助展开落刀:usesIDStaticNPCImmunity=true + idStaticNPCHitCooldown=10 +
//     immunityIdentity=Type。活调用点 7 处（:2686=181/:5816=511/:5828=511/:5840=511/
//     :6185=181/:6206=567/:6219=569,重定位亲读核实;:1587 确在 switch(2) case 1 死支
//     照弃）覆盖 10 id:181/511/512/513/566/567/568/569/570/571——组键映射 566→181、
//     512/513→511、568→567、570/571→569（其余=自身;perIDStaticNPCImmunity 行共享语义,
//     消费面 :12595 门/:13823/:14037 写）。immunityIdentity 入 NUM_FIELDS(全文件仅
//     :784 序言 `immunityIdentity = type` 非数字直写,不误捕)。json 重产走 era guard
//     增益通道(10 id ×3 列);recon-item-1456-1457.mjs proj 面 fieldsOf/pushSurface
//     同步扩三列（红蓝-F g3 部分收口:usesLocalNPCImmunity 列仍登记未扩）。运行时
//     消费面（Arrow idStaticGroup 常量补 511-513/181/566+189、SporeSacProj 组键 567）
//     先于本刀存在,数据列暂无通用消费者=零行为差,仅数据面 1:1 收口。
import { readFileSync, writeFileSync, writeSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
// 源版本可选(recon-item-1456-1457.mjs 双实例分别取 1456/1457;缺省 1456 = 既有产物基线)
// ★2026-08-23 基准切换 1457：缺省源版本 1456→1457（裸跑不再把 1457 专属字段打回 1456;
// 旧 1456 档仍可 SW_ITEM_VER=1456 显式取）
export const SRC_VER = process.env.SW_ITEM_VER ?? '1457';
const src = readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria/Projectile.cs`, 'utf8');

// ---- SetDefaults(int Type) 方法体 ----
const fnIdx = src.indexOf('void SetDefaults(int Type');
if (fnIdx < 0) throw new Error('SetDefaults not found');
const start = src.indexOf('{', fnIdx);
let depth = 0, end = start;
for (let i = start; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const body = src.slice(start + 1, end);

// ---- else-if 链通配拆分:纯 type 布尔式逐 id 求值,先匹配者生效 ----
// 1456 SetDefaults 是互斥 else-if 链,条件形态多样(单值/区间/复合 OR/括号混排,
// 如 `(type >= 360 && type <= 366) || type == 381 || type == 760`)——正则枚举
// 永远追不完(链锤 947||948 复合块曾漏提 → Mace 分类落入 shot 兜底"射出锤子")。
// 语义模型:仅【顶层链】互斥(每 id 吃第一个命中块);块内嵌套的纯 type if
// (如 986-993 块内 `if (type >= 987 && type <= 993) { light = 1f; }`)随外块
// 对该 id 求值后一并并入;非纯 type 条件(Main.expertMode 等)不可静态求值,跳过。
const MAX_ID = 1140; // 1457 新增 25 弹(1111-1135,ProjectileID.Count 1136)——登记面含新弹 SetDefaults
/** 平衡括号取 if 条件串;返回 { cond, condEnd } 或 null */
function readCond(text, ifParenAt) {
  let d = 0;
  for (let i = ifParenAt; i < text.length; i++) {
    if (text[i] === '(') d++;
    else if (text[i] === ')') { d--; if (d === 0) return { cond: text.slice(ifParenAt, i + 1), condEnd: i + 1 }; }
  }
  return null;
}
/** 条件纯度:只含 小写 type/数字/比较/逻辑/括号/空白(大写 Type 初始化段跳过) */
function tryCompile(cond) {
  if (/\bType\b/.test(cond)) return null;
  const stripped = cond.replace(/\btype\b/g, '');
  if (!/^[\s\d()&|=<>!*]+$/.test(stripped)) return null;
  try { return new Function('type', `return (${cond});`); } catch { return null; }
}
/** 平衡花括号取块体;返回 { text, end } 或 null(end = 块尾 } 的下一位) */
function readBlock(text, from) {
  const braceAt = text.indexOf('{', from);
  if (braceAt < 0 || text.slice(from, braceAt).trim() !== '') return null;
  let d = 0;
  for (let i = braceAt; i < text.length; i++) {
    if (text[i] === '{') d++;
    else if (text[i] === '}') { d--; if (d === 0) return { text: text.slice(braceAt + 1, i), end: i + 1 }; }
  }
  return null;
}
/** 块内收集:id 视角的有效行 = 语句层行 + 嵌套纯 type if(对该 id 为真)的递归行
 *  ★三轮蓝队 F4（2026-08-31）修正：语句层还含 `switch (type)` 分派（663 族
 *  SetDefaults :7132-7157 三档盒覆写等）——旧实现整块照收全部 case 体,
 *  lastMatch 恒取末 case 行 ⇒ 三个 id 全被写成 667 的 28×60。现对【纯 type】
 *  switch 逐 id 求值:命中 case 体并入、其余丢弃（含 default）。非纯表达式
 *  switch 维持旧行为照收并登记。 */
function expandTypeSwitchLines(block, id) {
  // 找第一个语句层 switch；无 → 原文返回（递归基,先于任何递归调用防同串自旋）
  const swRe = /switch\s*\(/g;
  let m;
  while ((m = swRe.exec(block))) {
    // switch 头须位于块语句层（其前括号深度为 0）
    let d0 = 0;
    for (let i = 0; i < m.index; i++) {
      if (block[i] === '(' || block[i] === '{') d0++;
      else if (block[i] === ')' || block[i] === '}') d0--;
    }
    if (d0 !== 0) continue;
    const cond = readCond(block, m.index + m[0].length - 1);
    if (!cond) return block.slice(0, m.index).split('\n').map((l) => l.trim());
    const body = readBlock(block, cond.condEnd);
    if (!body) return block.slice(0, m.index).split('\n').map((l) => l.trim());

    const out = [...expandTypeSwitchLines(block.slice(0, m.index), id)];
    const switchFn = tryCompile(cond.cond);
    if (!switchFn) {
      // 非纯 type switch：不可静态求值,保守沿用旧行为=整个 body 照收
      out.push(...body.text.split('\n').map((l) => l.trim()));
    } else {
      // 拆 case 标签（case N 连排且之间无实体语句时共享一体=C# 穿透仅空标脚）；
      // 有体的组遇新标签即开新组。命中体并入、其余丢弃（default 同法并入尾组）。
      const caseRe = /\b(?:case\s+(-?\d+)\s*:|default\s*:)/g;
      const defaultSentinel = Symbol('default');   // default 只在无任何 case 命中时生效(C# 跳转),此保守实现仅记录不并入
      const groups = [];          // { ids:Set, text }——default 以 -Infinity 假值入组首标签位?不,default 仅在无穿透依赖时并入尾组文本前
      let curIds = null;
      let curStart = null;
      let cs;
      const isEmptySeg = (t) => t.replace(/[\s;}|]|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '') === '';
      const pushGroup = (endAt) => {
        if (curIds !== null && curStart !== null) {
          groups.push({ ids: curIds, text: body.text.slice(curStart, endAt) });
        }
      };
      while ((cs = caseRe.exec(body.text))) {
        if (cs[1] !== undefined) {
          const v = Number(cs[1]);
          const prevEmpty = curStart === null || isEmptySeg(body.text.slice(curStart, cs.index));
          if (!prevEmpty) {
            pushGroup(cs.index);
            curIds = new Set();
          } else if (curIds === null) {
            curIds = new Set();
          } else {
            curIds = new Set(curIds);   // 复制防跨组串写
          }
          curIds.add(v);
          curStart = caseRe.lastIndex;
        } else {
          // default：并入当前组文本域（default 与 case 同体)或自成一组
          if (curIds === null || !isEmptySeg(body.text.slice(curStart ?? caseRe.lastIndex, cs.index))) {
            pushGroup(cs.index);
            curIds = new Set();
          }
          curIds.add(defaultSentinel);
          curStart = caseRe.lastIndex;
        }
      }
      pushGroup(body.text.length);
      // ★反哺批：switch 实参不含 type 时=常量 switch（SetDefaults 全文仅 :1584
      //  `switch (2)` 一处,76-78 音符弹免疫三元组）——case 标签不是 type 值,按
      //  【实参求值常数】匹配 case 组（case 2 恒走,case 1 死支照弃）;含 type 的
      //  （663 族 :4937/:7141）维持按 id 匹配。default 哨兵为 Symbol,数字键不命中。
      let matchKey = id;
      if (!/\btype\b/.test(cond.cond)) {
        try { matchKey = Number(switchFn(id)); } catch { matchKey = NaN; }
      }
      for (const g of groups) {
        if (g.ids.has(matchKey)) out.push(...g.text.split('\n').map((l) => l.trim()));
      }
    }
    out.push(...expandTypeSwitchLines(block.slice(body.end), id));
    return out;
  }
  return block.split('\n').map((l) => l.trim());
}

/** 裸 else 探测（★BJ129③）：from 起首个非空白 token 若为 else 且其后非 if（即裸
 *  `else {` 块,非 else-if 接力）→ 返回块体定位入参。else-if 由主循环
 *  (?:else\s+)?if 正则自然接力,裸 else 块无 `if(` 不匹配——旧实现任其漏给尾随
 *  expandTypeSwitchLines(block.slice(cursor)) 无条件并入 = else 支字段漏入（76/77
 *  宽高吃 else 支 22×24 的病根）。 */
function peekBareElse(text, from) {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (!text.startsWith('else', i)) return null;
  let j = i + 4;
  while (j < text.length && /\s/.test(text[j])) j++;
  if (text.startsWith('if', j)) return null; // else-if → 主循环处理
  return { bodyFrom: j };
}

/** 块内收集:id 视角的有效行 = 语句层行 + 嵌套 if/else 链按【链态】求值的命中支行。
 *  ★BJ129③ 链态语义：命中一支（if 或 else-if）后,同链余下 else-if/else 整块跳过;
 *  全支未命中走裸 else;裸 else 归属链尾显式消费（peekBareElse+readBlock）,cursor
 *  越过其块体,不再漏给尾随收集。新独立 if 语句（m[0] 无 else 前缀）重置链态。 */
function collectLinesForId(block, id, depth = 0) {
  const out = [];
  const re = /(?:else\s+)?if\s*\(/g;
  let cursor = 0;
  let chainTaken = false; // 当前 if/else 链是否已有命中支
  let m;
  while ((m = re.exec(block))) {
    const chainCont = m[0].startsWith('else');
    // 条件前的语句层文本行并入（★F4:语句层的 switch(type) 在此展开逐 id 求值）
    out.push(...expandTypeSwitchLines(block.slice(cursor, m.index), id));
    const c = readCond(block, m.index + m[0].length - 1);
    if (!c) break;
    const b = readBlock(block, c.condEnd);
    if (!b) break;
    if (!(chainCont && chainTaken)) {
      // 链已命中时余下 else-if 支整块跳过（不显式求值）;新 if 语句重置链态
      if (!chainCont) chainTaken = false;
      const fn = tryCompile(c.cond);
      if (fn) {
        let hit = false;
        try { hit = !!fn(id); } catch { hit = false; }
        if (hit) {
          out.push(...collectLinesForId(b.text, id, depth + 1));
          chainTaken = true;
        }
      }
      // 非纯条件(Main.expertMode 等)不可静态判定,整块跳过(记录在案的限制)
    }
    cursor = b.end;
    // ★BJ129③ 裸 else 归属：全支未命中(!chainTaken)才吃;命中过即整块跳过。
    //  两种情形 cursor 都越过裸 else 块体（跳过形态不再漏给尾随收集）。
    const bare = peekBareElse(block, cursor);
    if (bare) {
      const eb = readBlock(block, bare.bodyFrom);
      if (eb) {
        if (!chainTaken) {
          out.push(...collectLinesForId(eb.text, id, depth + 1));
          chainTaken = true;
        }
        cursor = eb.end;
      }
    }
    re.lastIndex = cursor;
    if (depth > 4) break;
  }
  out.push(...expandTypeSwitchLines(block.slice(cursor), id));
  return out;
}
const blocks = [];
{
  // 顶层链:if 关键字必须位于方法体语句层(其前的花括号深度为 0)
  const chainRe = /(?:else\s+)?if\s*\(/g;
  const seen = new Set();
  let m;
  while ((m = chainRe.exec(body))) {
    let d0 = 0;
    for (let i = 0; i < m.index; i++) {
      if (body[i] === '{') d0++;
      else if (body[i] === '}') d0--;
    }
    if (d0 !== 0) continue; // 嵌套 if 由 collectLinesForId 处理
    const c = readCond(body, m.index + m[0].length - 1);
    if (!c) break;
    const fn = tryCompile(c.cond);
    const blk = readBlock(body, c.condEnd);
    if (!blk) { chainRe.lastIndex = c.condEnd; continue; }
    const block = blk.text;
    if (fn) {
      for (let id = 0; id <= MAX_ID; id++) {
        let hit = false;
        try { hit = !!fn(id); } catch { hit = false; }
        if (hit && !seen.has(id)) {
          seen.add(id);
          blocks.push({ id, block });
        }
      }
    }
    chainRe.lastIndex = c.condEnd;
  }
}
if (blocks.length < 500) throw new Error(`链块过少: ${blocks.length}，疑似源码结构变化`);

// ---- 深度 1 赋值（块内语句深度 0） ----
const depth1Lines = (block) => {
  const out = [];
  let d = 0;
  for (const raw of block.split('\n')) {
    const opens = (raw.match(/\{/g) || []).length;
    const closes = (raw.match(/\}/g) || []).length;
    if (d === 0 && opens === 0) out.push(raw.trim());
    d += opens - closes;
    if (d < 0) d = 0;
  }
  return out;
};

// armorPenetration:Projectile.cs:260 弹幕自带穿甲(SetDefaults 逐型直写,如 85=15/917=50;
// StrikeNPC :12068 num3 = 玩家 GetArmorPenetration + 弹幕 armorPenetration)。
// 条件档(Main.remixWorld 148=20)非纯 type 条件,按既有限制跳过(登记)
// ★反哺批(2026-09-18 BJ127 33 键):+= 1457 局部/静态免疫四列(字面直写族;
//   76-78 的 num2 别名与 933/1100 的 15/MaxUpdates 除式走 apply() 内算式特支)
// ★J1 反哺批(2026-09-18 红蓝-J1①):+= immunityIdentity(UseGroupStaticImmunity 形参
//   实值,组键行;全 SetDefaults 仅 :784 序言 `= type` 非数字直写,字面捕获不误伤)
const NUM_FIELDS = ['aiStyle', 'width', 'height', 'penetrate', 'timeLeft', 'damage', 'light', 'scale', 'extraUpdates', 'armorPenetration',
  'localNPCHitCooldown', 'idStaticNPCHitCooldown', 'immunityIdentity'];
const BOOL_FIELDS = ['friendly', 'melee', 'ranged', 'magic', 'minion', 'hostile', 'tileCollide', 'ignoreWater', 'pierce',
  'usesLocalNPCImmunity', 'usesIDStaticNPCImmunity'];
// 同块同字段重复赋值取【最后一条】(C# 顺序执行语义/仓库"取最终态"约定——
// 96 火焰 `scale = 0.9f; scale = 1.3f;` 曾被首匹配读成 0.9,与提交产物漂移)
const lastMatch = (ls, re) => {
  let hit = null;
  for (const l of ls) if (re.test(l)) hit = l;
  return hit;
};

// ---- DefaultTo* 辅助方法展开（1456 惯例：DefaultToSpear()/DefaultToYoyo()/DefaultToFlail() 等
//      内部设 aiStyle 19/99/15 —— 长矛/悠悠球/连枷不在链内直写 aiStyle，必须展开才有值） ----
// ★反哺批：ApplyGemStaffStats()（:10685-10691,private）纳入——121-126/597 七调用点
//（:2114-2159/:6470）经此得 friendly/usesLocalNPCImmunity/localNPCHitCooldown 60/
// timeLeft 300（recon NON_LITERAL_57 手钉面转由解析直出）。
const helper = {};
for (const hm of src.matchAll(/(?:public|private) void ((?:DefaultTo\w+|ApplyGemStaffStats))\(\)\s*\{/g)) {
  const hs = src.indexOf('{', hm.index);
  let d = 0, he = hs;
  for (let i = hs; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { he = i; break; } }
  }
  const rec = {};
  const hlines = depth1Lines(src.slice(hs + 1, he));
  for (const f of NUM_FIELDS) {
    const line = lastMatch(hlines, new RegExp(`^${f} = -?[\\d.]+f?;`));
    if (line) rec[f] = parseFloat(line.match(/-?[\d.]+/)[0]);
  }
  for (const f of BOOL_FIELDS) {
    if (hlines.some((l) => l === `${f} = true;`)) rec[f] = true;
    else if (hlines.some((l) => l === `${f} = false;`)) rec[f] = false;
  }
  helper[hm[1]] = rec;
}
// ★J1 反哺批（2026-09-18 红蓝-J1①）：UseGroupStaticImmunity(int Type)（:10678-10683,
//   private,1457 新增——1456 无此 helper,匹配空集自然跳过）参数化辅助方法表。活调用点
//   7 处（:2686=181/:5816=511/:5828=511/:5840=511/:6185=181/:6206=567/:6219=569）,
//   覆盖 10 id（566→181/512·513→511/568→567/570·571→569 组键共享）。展开法=调用点
//   实值代入形参还原为三条直写行（行序保持,C# 后设覆盖语义同直写一致）。
const paramHelper = {};
for (const hm of src.matchAll(/(?:public|private) void (UseGroupStaticImmunity)\(int (\w+)\)\s*\{/g)) {
  const hs = src.indexOf('{', hm.index);
  let d = 0, he = hs;
  for (let i = hs; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { he = i; break; } }
  }
  paramHelper[hm[1]] = {
    param: hm[2],
    lines: src.slice(hs + 1, he).split('\n').map((l) => l.trim()).filter(Boolean),
  };
}
// 展开顺序内的行序列（DefaultTo* 调用与直写赋值按出现顺序合并，后设覆盖）
const data = {};
for (const { id, block } of blocks) {
  // 语句层行 + 嵌套纯 type if 对本 id 的递归行(顶层链互斥已在此前择块)
  // ★反哺批:元组赋值展开 `width = (height = 16);`（:10179/:10431/:10441 =
  //   1091/1117/1122,SetDefaults 全文仅此三处;AI 域元组在切片外）→ 两条直写
  const lines = collectLinesForId(block, id).flatMap((l) => {
    const t = /^(\w+) = \((\w+) = (-?[\d.]+)f?\);$/.exec(l);
    if (t) return [`${t[1]} = ${t[3]};`, `${t[2]} = ${t[3]};`];
    // ★J1 反哺批:参数化辅助调用展开——`UseGroupStaticImmunity(181);` 还原为
    //   usesIDStaticNPCImmunity=true/idStaticNPCHitCooldown=10/immunityIdentity=181
    //   三条直写行（形参实值代入;死支 switch(2) case 1 的 :1587 已被常量修正剔除,
    //   76-78 不得命中此支）
    const g = /^UseGroupStaticImmunity\((-?[\d.]+)\);$/.exec(l);
    if (g && paramHelper.UseGroupStaticImmunity) {
      const { param, lines: hls } = paramHelper.UseGroupStaticImmunity;
      return hls.map((hl) => hl.replace(new RegExp(`\\b${param}\\b`, 'g'), g[1]));
    }
    return [l];
  });
  const rec = {};
  const apply = (ls) => {
    for (const f of NUM_FIELDS) {
      const line = lastMatch(ls, new RegExp(`^${f} = -?[\\d.]+f?;`));
      if (line) rec[f] = parseFloat(line.match(/-?[\d.]+/)[0]);
    }
    // ★2026-09-03 640 行 extraUpdates 列缺修复：1457 SetDefaults 有六族经 MaxUpdates
    //  属性别名直写（496 :5702 / 582 :6325 / 636 :6850 / 639 :6883 / 640 :6898 / 902 :8609）
    //  ——P.cs:556-565 getter=extraUpdates+1 / setter `extraUpdates = value - 1`，即
    //  MaxUpdates=N ≙ extraUpdates=N−1（每拍子步数,Update :16780 numUpdates=extraUpdates
    //  走 >=0 循环 = N+1 步/拍,与仓内 Arrow u<=extraUpdates 同拍口径,3053-shadowflame-
    //  cast.test.ts:270 同解读）。json 列语义=原版 extraUpdates 字段 → 折算 −1；
    //  直写 `extraUpdates = ` 的族不经过此支（lastMatch 同行结果一致）。表达式形态
    //  （639 `timeLeft = MaxUpdates * 45`）仍按既有限制跳过,不在本修范围。
    const euLine = lastMatch(ls, /^(MaxUpdates|extraUpdates) = -?[\d.]+f?;/);
    if (euLine) {
      const euM = euLine.match(/^(MaxUpdates|extraUpdates) = (-?[\d.]+)f?;/);
      if (euM) rec.extraUpdates = Number(euM[2]) - (euM[1] === 'MaxUpdates' ? 1 : 0);
    }
    // ★反哺批（2026-09-18 BJ127 33 键）：算式/别名形态特支（BJ97 算式覆写判例——
    //  只认下方枚举形态逐字面求值,未枚举形态照旧跳过不猜值）。单趟源序扫描:
    //  局部变量/extraUpdates/MaxUpdates 赋值先行入环境,表达式行按【当时】取值
    //  （C# 顺序语义;MaxUpdates getter = extraUpdates+1,P.cs:556-565 同口径）。
    //  已证形态清单（行号=1457）:
    //  · timeLeft = MaxUpdates * N（639 :6884=90/616 :6644=270/715-718 :7596+:7608=
    //    1080/729 :7686=30/977 :9225=30/976 :9286=60/1045 :9906=48）
    //  · timeLeft = N * (extraUpdates + 1)（466 :5404=600）
    //  · timeLeft = extraUpdates * N * M（710 :7533=300）
    //  · localNPCHitCooldown = N / MaxUpdates（C# 整除截断,933 :8872/1100 :10280=7）
    //  · localNPCHitCooldown = 局部变量（76-78 :1592 ← int num2=30 :1583,
    //    switch(2) 常量支经 expandTypeSwitchLines 常量修正进入）
    //  登记不解析（头注⑥）:timeLeft *= N 复合族（~140 位,基值序言 :789=3600）、
    //  scale 随机表意式。字面在场时以字面为先（fill-when-undefined;已证无同块
    //  字面+算式混写形态）。
    const env = { eu: 0, mu: 1, vars: new Map() };
    for (const l of ls) {
      let m = /^(?:int|float)\s+(\w+)\s*=\s*(-?[\d.]+)f?;\s*$/.exec(l);
      if (m) { env.vars.set(m[1], Number(m[2])); continue; }
      m = /^MaxUpdates = (-?[\d.]+)f?;\s*$/.exec(l);
      if (m) { env.mu = Number(m[1]); env.eu = env.mu - 1; continue; }
      m = /^extraUpdates = (-?[\d.]+)f?;\s*$/.exec(l);
      if (m) { env.eu = Number(m[1]); env.mu = env.eu + 1; continue; }
      const hc = /^(\w+)\(\);$/.exec(l);
      if (hc && helper[hc[1]] && helper[hc[1]].extraUpdates !== undefined) {
        env.eu = helper[hc[1]].extraUpdates;
        env.mu = env.eu + 1;
        continue;
      }
      if (rec.timeLeft === undefined) {
        if ((m = /^timeLeft = MaxUpdates \* (-?[\d.]+)f?;$/.exec(l))) rec.timeLeft = env.mu * Number(m[1]);
        else if ((m = /^timeLeft = (-?[\d.]+)f? \* MaxUpdates;$/.exec(l))) rec.timeLeft = Number(m[1]) * env.mu;
        else if ((m = /^timeLeft = (-?[\d.]+)f? \* \(extraUpdates \+ 1\);$/.exec(l))) rec.timeLeft = Number(m[1]) * (env.eu + 1);
        else if ((m = /^timeLeft = extraUpdates \* (-?[\d.]+)f? \* (-?[\d.]+)f?;$/.exec(l))) rec.timeLeft = env.eu * Number(m[1]) * Number(m[2]);
      }
      if (rec.localNPCHitCooldown === undefined) {
        if ((m = /^localNPCHitCooldown = (-?[\d.]+)f? \/ MaxUpdates;$/.exec(l))) rec.localNPCHitCooldown = Math.trunc(Number(m[1]) / env.mu);
        else if ((m = /^localNPCHitCooldown = (\w+);$/.exec(l)) && env.vars.has(m[1])) rec.localNPCHitCooldown = env.vars.get(m[1]);
      }
    }
    for (const f of BOOL_FIELDS) {
      if (ls.some((l) => l === `${f} = true;`)) rec[f] = true;
      else if (ls.some((l) => l === `${f} = false;`)) rec[f] = false;
    }
  };
  for (const raw of lines) {
    const call = raw.match(/^((?:DefaultTo\w+|ApplyGemStaffStats))\(\);$/);
    if (call && helper[call[1]]) {
      // 展开辅助方法赋值（与直写同字段语义）
      const h = helper[call[1]];
      for (const f of NUM_FIELDS) if (h[f] !== undefined) rec[f] = h[f];
      for (const f of BOOL_FIELDS) if (h[f] !== undefined) rec[f] = h[f];
    }
  }
  apply(lines);
  if (Object.keys(rec).length) data[id] = { ...(data[id] || {}), ...rec }; // 区间与单值重叠时合并（后设覆盖）
}

// 库模式出口(recon-item-1456-1457.mjs 三方对账用);写盘仅 CLI 直跑时执行,
// 被 import 时不落盘(否则 1457 实例会覆写 1456 基线产物)
export const PROJ_DATA = data;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // --dump:全量数据出 stdout 不落盘(recon 双版本对账用;vitest 模块运行器按路径
  //  缓存忽略 query-string,库模式双实例不可靠——子进程各带 env 最稳)。
  //  ★writeSync 直写 fd 1:process.exit/大载荷走管道时异步 write 会在 64KB 截断
  //  （守卫不拦 dump——recon-item-1456-1457.mjs 双实例 1456/1457 都走此通道）
  if (process.argv.includes('--dump')) {
    const s = JSON.stringify({ src: SRC_VER, projectiles: data, count: Object.keys(data).length });
    writeSync(1, s);
    process.exit(0);
  }
  // ★g1 footgun 硬化（红蓝-F①,2026-09-18）：探测注入面设置而 SW_OUT 缺省 →
  //  fail-closed 拒跑。定谳：守卫探测读 SW_PROJ_JSON（夹具，零缺失→放行）而
  //  writeFileSync 落缺省 OUT_JSON=现库 game/src/data/vanilla-projectiles.json——
  //  探测与写盘分离=守卫被绕过洗库。变异判别：tests/extract-projectiles-era-guard.test.ts。
  const PROBE_ENV_SET = process.env.SW_PROJ_JSON !== undefined;
  if (PROBE_ENV_SET && process.env.SW_OUT === undefined) {
    console.error('[extract-projectiles] 拒绝运行：探测注入面（SW_PROJ_JSON）已设置而 SW_OUT 缺省（fail-closed）。');
    console.error('  守卫将探测注入夹具（零缺失→放行），写盘却落缺省现库路径 game/src/data/vanilla-projectiles.json——探测与写盘分离=守卫被绕过（footgun 洗库面）。');
    console.error('  处置：显式设置 SW_OUT 指向与探测一致的沙箱目录，或同时清掉探测 env 走真实现库守卫；--dump 对账通道不写盘不受此限。');
    process.exit(1);
  }
  // ---- ★追加时代守卫（头注见上）：重产 vs 现库动态 diff,缺 id/值漂移任一非空即拒 ----
  const FORCE_FULL = process.argv.includes('--force-full');
  const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
  const OUT_JSON = process.env.SW_OUT ?? `${ROOT}/game/src/data/vanilla-projectiles.json`;
  const GUARD_JSON = process.env.SW_PROJ_JSON ?? OUT_JSON;
  // deep-equal（现库记录=扁平 {field: number|boolean},递归比较防键序噪声）
  const jsonEq = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => jsonEq(a[k], b[k]));
  };
  let prev = null;
  if (existsSync(GUARD_JSON)) {
    try {
      prev = JSON.parse(readFileSync(GUARD_JSON, 'utf8'));
      if (prev == null || typeof prev !== 'object' || Array.isArray(prev)) prev = null;
    } catch { prev = null; }   // 现库坏损时不拦——同 npcs 判例,让正常流程自行报错
  }
  const missingIds = prev
    ? Object.keys(prev).filter((k) => data[k] === undefined).sort((a, b) => Number(a) - Number(b))
    : [];
  // ★反哺批判据细化（头注⑦）：逐 id 三分——现库独有字段（重产不再产出=洗列）/
  //   同字段值差（真值变）→ 损失面（拒绝）;重产新增覆盖字段（现库缺、重产有,
  //   源码推导值）→ 增益面（放行+高声通告）。反哺后 producer 面超前于 json 冻结态
  //   =预期,拦截增益=把反哺成果当事故（守卫章程=防洗,不防补全）。
  const lossKeys = [];   // { id, liveOnly: string[], valDiff: string[] }
  const gainKeys = [];   // { id, prodOnly: string[] }
  if (prev) {
    for (const k of Object.keys(prev)) {
      if (data[k] === undefined) continue;   // 已计入 missingIds
      const a = prev[k];
      const b = data[k];
      const liveOnly = Object.keys(a).filter((f) => b[f] === undefined);
      const valDiff = Object.keys(a).filter((f) => b[f] !== undefined && !jsonEq(a[f], b[f]));
      const prodOnly = Object.keys(b).filter((f) => a[f] === undefined);
      if (liveOnly.length > 0 || valDiff.length > 0) lossKeys.push({ id: k, liveOnly, valDiff });
      else if (prodOnly.length > 0) gainKeys.push({ id: k, prodOnly });
    }
  }
  const liveOnlyFields = new Set();
  for (const l of lossKeys) for (const f of l.liveOnly) liveOnlyFields.add(f);
  const valDiffKeys = lossKeys.filter((l) => l.valDiff.length > 0).map((l) => l.id);
  const gainFields = new Set();
  for (const g of gainKeys) for (const f of g.prodOnly) gainFields.add(f);
  const appendEra = missingIds.length > 0 || lossKeys.length > 0;
  if (appendEra && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error(`[extract-projectiles] 拒绝全量覆写：现库与重产(SW_ITEM_VER=${SRC_VER})存在损失面 diff（追加时代）。`);
    if (missingIds.length) console.error(`  物证①缺 id：现库有而重产盖不住 ${missingIds.length} 个（${missingIds.slice(0, 8).join(', ')}${missingIds.length > 8 ? '…' : ''}）——1457 特有弹段 1111-1135 整缺=1456 源指纹。`);
    if (lossKeys.length) console.error(`  物证②损失面：${lossKeys.length} 键（${lossKeys.slice(0, 8).map((l) => l.id).join(', ')}${lossKeys.length > 8 ? '…' : ''}）${liveOnlyFields.size ? `；现库独有字段 {${[...liveOnlyFields].join(', ')}}（重产即洗）` : ''}${valDiffKeys.length ? `；值差 ${valDiffKeys.length} 键（${valDiffKeys.slice(0, 8).join(', ')}${valDiffKeys.length > 8 ? '…' : ''}）` : ''}。`);
    console.error('  全量覆写会把上述增量与 1457 特征值打回重产源版本态（vanilla-projectiles.json 曾被 1456 重跑事故的制度化拦截）。');
    console.error('  对账/校验走活通道：node tools/recon-item-1456-1457.mjs（proj 键值逐值三方对账）；增量恢复指引=src/data/vanillaProjectiles.ts 头注手补清单；重产前先反哺进本提取器输出面（判例 fx3）。');
    console.error('  确需原地强推：双旗 --force-full --overwrite-append-era（单旗仍拒）；事后必须全绿 recon-item 双闸门 + tests/item-stats-golden-1457 + proj 消费面测试。');
    process.exit(1);
  }
  if (gainKeys.length > 0) {
    console.error(`[extract-projectiles] 反哺增益面（重产新增覆盖 ${gainKeys.length} 键 / ${gainFields.size} 字段 {${[...gainFields].slice(0, 12).join(', ')}${gainFields.size > 12 ? '…' : ''}}）——现库冻结态未重产=预期滞后,不拦截。`);
    console.error('  写盘将新增这些列（运行时行为面变化:免疫冷却列入 Arrow 命中环消费域）——重产落盘前须走运行时消费面审计 + recon-item-1456-1457.mjs 收口。');
  }
  writeFileSync(OUT_JSON, JSON.stringify(data));
  console.error(`共 ${Object.keys(data).length} 投射物（源 Terarria${SRC_VER}）`);
  console.error('手里剑(3):', JSON.stringify(data['3']));
  console.error('回旋镖(6):', JSON.stringify(data['6']));
  console.error('手雷(28):', JSON.stringify(data['28']));
  console.error('长矛(23):', JSON.stringify(data['23']));
  console.error('悠悠球(546):', JSON.stringify(data['546']));
}
