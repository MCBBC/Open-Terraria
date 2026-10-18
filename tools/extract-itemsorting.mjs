// SW-FX29：ItemSorting 整库提取 v2（1457 基线重跑，2026-09-11）。
// ★SW-RB13c 红蓝复审修复（同日）——六处既有盲区修复之外的五处新盲区：
//   ⑦ 嵌套 switch(type) 双写序逆置（collectCaseSegments）——外层体在嵌套体之后才 flush,
//     重放 last-write-wins 反取外层基值（DD2 哨兵杖 3819-3834 rare 5/8 → 3）;
//   ⑧ 助手体内嵌套 DefaultTo* 转发不递归（expandHelperCall）——DefaultToInfoAccessory →
//     DefaultToAccessory(accessory=true) 断链,22 件信息饰品 accessory 整缺;
//   ⑨ `field = false;` 直赋被丢（replaySegment/expandHelperCall 只认 true）——
//     5629 Acorn Slingshot ranged=false 被 DefaultToRangedWeapon 的 true 顶回;
//   ⑩ IsFood 分派面（SetFoodDefaults 先于 SetDefaults1-5,Item.cs:48685）——对全部
//     IsFood 强行 consumable=true+buffType=26,无 SetFoodDefaults case 的 4010 误入
//     PotionsFood;染料/染发剂升级为 DyeInitializer 绑定序精确 shader id（dye/hairDye
//     比较器键）,hairDye 终值门按 Item.cs:48717-48721（case 段 0 标记 ∪ Hair 绑定集）;
//   ⑪ switch 外顶层 if(type>=A&&type<=B)/if(type==X) 范围分派支（39 支）——旗帜座
//     1479-1494/染发剂 1977-1986/头饰 2104-2113/平衡配件 3309-3314/蛋糕块 3390-3452
//     等家族字段整缺,234 件塌进 LastMaterials（48 层 2242→2443、21 层 474→502、
//     47 层 578→331）。SetShopValues(ItemRarityColor.X) rare 终值同批补提。
// 旧版（2026-08-20）只产 layers 6147 条（1456 基线,1457 缺 6147-6195 共 49 件——
// ItemID.Count 1456:13833=6147 → 1457:13938=6196）；本版按 1457 重跑并补齐
// ItemSorting.Sort 运行时引擎所需全量数据面：
//   · layers          vid → 白名单层下标 0-51（SetupWhiteLists :1272-1354 固定序逐层
//                     跑谓词先到先得；QuickStacking 消费面形状不变）
//   · prio            ItemID.Sets.SortingPriority* 全 20 张 CreateIntSet 键值对
//                     （ItemID.cs:1124-1162）——谓词成员(>-1)与比较器数值共用
//   · buffFoodPrio    BuffID.Sets.SortingPriorityFoodBuffs（BuffID.cs:18）——
//                     Potions - Food 比较器首键（ItemSorting.cs:712）
//   · bools           IsFood / IsFishingCrate / IsBasicFish（CreateBoolSet）
//   · frameImportant  Main.cs tileFrameImportant[N] = true 直赋行（LastTilesImportant）
//   · attrs           逐 vid 稀疏属性记录（52 层谓词+比较器所需全字段）：
//                     Item.cs SetDefaults1-5 case 段（melee/ranged/magic/summon/
//                     consumable/notAmmo/questItem/accessory/vanity/mech/damage/
//                     defense/pick/axe/hammer/ammo/shoot/buffType/healLife/healMana/
//                     mountType/headSlot/bodySlot/legSlot/paint/paintCoating/
//                     createTile/createWall/makeNPC/rare）+ dye/hairDye=DyeInitializer
//                     绑定序精确 shader id（RB13c；旧 vanilla-equip.json/vanilla-hairdyes.json
//                     布尔近似退役为对照校验源）+ vanilla-itemvalue.json
//                     value + 衍生旗：fk=projHook[shoot]（Main.cs:6752-6762 aiStyle==7）、
//                     lp/vp=Main.lightPet/vanityPet[buffType]（Main.cs 直赋表）、
//                     ca=MountID.Sets.Cart[mountType]（MountID.cs:21）、fo/fc/fb=布尔集、
//                     nm=英文名（ItemID.cs const short + en-US Items.json ItemName——
//                     Last - Tiles 两层名字比较器 ItemSorting.cs:1068/1088 的真值源）
// 不变量对齐：:1353 Invariant.Assert(LastNotTrash 白名单空) —— 本版等价断言
// 「vid 0..6195 全部被层 0-49 认领」；未认领即提取器/源码面有缺,直接 fail。
// 对照校验：与旧版 layers 全量 diff（预期仅新增 49 件);与 vanilla-equip.json
// hook/pet/light/cart 旧近似集 diff（预期 fk/lp/vp/ca 语义等价,差异打印定谳）。
//
// ★BJ298 2026-09-23 era guard 落闸（四要素习语 docs/era-guard-family.md,BJ284 banners
//   同构;BJ261 续批排期②【洗库险·B 形】清偿——原缺省无 env 无旗直写现库）：
//   ① SW_ITEM_VER 白名单 {1457,1458}——读域七源逐域亲核（BJ298）:Item.cs/ItemID.cs/
//     BuffID.cs/AmmoID.cs 整文件 1457↔1458 全等（15ebd617/49a0e26a/fe0ee6b2/165b7018）;
//     MountID.cs/Projectile.cs/Main.cs 整文件两版有差,但本器读域（MountID Cart 集/
//     Projectile.SetDefaults 体/Main.cs lightPet+vanityPet+tileFrameImportant 三表域）
//     逐字节全等 → 1458 交叉重放 byte-perfect;1456 退役显式拒+指引）;缺省 1457（拍板#7A）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级 diff——live-only=洗库预警/
//     fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=<dir>=沙箱 / --write-real=
//     写真库（diff 非纯增量拒,强推须 --force-full --overwrite-append-era 双旗）;SW_OUT 与
//     --write-real 双旗互斥;非 1457 禁写真库;探测注入面 SW_ITEMSORTING_JSON 与
//     --write-real 混用拒（g1 footgun）;
//   ③ 锚 fail-loud：SortingPriority 清单/SetFoodDefaults/Cart/Load 缺档 throw + LastNotTrash
//     不变量（原有）+基数护栏（layers 全 0..6195 认领,原有）;④ 判别力自证：
//     tests/extract-tables2-era-guard.test.ts（M1 摘干跑门/M3 摘 fresh-only 轴）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)
// ---- ★BJ298 era guard ①②：版本白名单 + 输出通道开关（对拍在文末落盘段） ----
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}/Terarria${VER}/Terraria/Item.cs`)) {
  console.error(`[extract-itemsorting] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（2026-09-11 SW-FX29 v2 基准 1457,BJ298 落闸）；1456 回拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-itemsorting] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-itemsorting] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-itemsorting.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_ITEMSORTING_JSON !== undefined) {
  console.error('[extract-itemsorting] 拒绝运行：探测注入面（SW_ITEMSORTING_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
const LIVE_JSON = process.env.SW_ITEMSORTING_JSON ?? `${ROOT}/game/src/data/vanilla-itemsorting.json`;
const OUT_JSON = WRITE_REAL
  ? LIVE_JSON
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-itemsorting.json` : null);
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');
const SRCVER = `Terarria${VER}`;

const itemSrc = read(`${SRCVER}/Terraria/Item.cs`);
const itemidSrc = read(`${SRCVER}/Terraria.ID/ItemID.cs`);
const buffidSrc = read(`${SRCVER}/Terraria.ID/BuffID.cs`);
const mountidSrc = read(`${SRCVER}/Terraria.ID/MountID.cs`);
const projSrc = read(`${SRCVER}/Terraria/Projectile.cs`);
const ammoSrc = read(`${SRCVER}/Terraria.ID/AmmoID.cs`);
const mainSrc = read(`${SRCVER}/Terraria/Main.cs`);

// AmmoID 常量（Item.cs 79 处枚举形赋值——AmmoID.cs `public static int X = N;`）
const AMMO_ID = {};
{
  const re = /public static int (\w+) = (\d+);/g;
  let m;
  while ((m = re.exec(ammoSrc))) AMMO_ID[m[1]] = Number(m[2]);
}

// ---------- ItemID.Sets / BuffID.Sets 数值表（CreateIntSet）与布尔表 ----------
function parseIntSets(src) {
  const sets = {};
  const re = /public static int\[\] (\w+) = Factory\.CreateIntSet\((-?\d+)((?:,\s*-?\d+(?:\s*,\s*-?\d+)*)?)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1], def = Number(m[2]);
    const nums = (m[3] ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number);
    const pairs = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]]);
    sets[name] = { def, pairs, map: new Map(pairs) };
  }
  return sets;
}
function parseBoolSets(src) {
  const sets = {};
  const re = /public static bool\[\] (\w+) = Factory\.CreateBoolSet\(((?:\s*[^)]*?))\)\s*;/g;
  let m;
  while ((m = re.exec(src))) {
    const raw = m[2];
    // CreateBoolSet(defaultState, ids...) | CreateBoolSet(ids...)——首元 false/true 才是缺省态
    const toks = raw.split(',').map((x) => x.trim()).filter((x) => x !== '');
    let def = false, ids = toks;
    if (toks[0] === 'true' || toks[0] === 'false') { def = toks[0] === 'true'; ids = toks.slice(1); }
    sets[m[1]] = def ? { defaultTrue: true, ids: ids.map(Number) } : { defaultTrue: false, ids: ids.map(Number) };
  }
  return sets;
}
const INT_SETS = parseIntSets(itemidSrc);
const BUFF_INT_SETS = parseIntSets(buffidSrc);
const BOOL_SETS = parseBoolSets(itemidSrc);
const prio = (name, id) => (INT_SETS[name] ? (INT_SETS[name].map.get(id) ?? -1) : -1);

// SortingPriority* 集合清单守门（ItemID.cs:1124-1162 恰 20 张 + BuffID 1 张 = 21）
const EXPECTED_PRIO = ['SortingPriorityMiscAcorns', 'SortingPriorityMiscGems', 'SortingPriorityMiscHerbsAndSeeds',
  'SortingPriorityMiscBossBags', 'SortingPriorityToolsInstruments', 'SortingPriorityToolsFishing', 'SortingPriorityToolsGolf',
  'SortingPriorityToolsKites', 'SortingPriorityToolsKeys', 'SortingPriorityToolsMisc', 'SortingPriorityWeaponsRanged',
  'SortingPriorityPotionsBuffs', 'SortingPriorityPotionsDyeMaterial', 'SortingPriorityMiscImportants',
  'SortingPriorityWiring', 'SortingPriorityMaterials', 'SortingPriorityExtractibles', 'SortingPriorityRopes',
  'SortingPriorityPainting', 'SortingPriorityTerraforming'];
const PRIO_KEYS = Object.keys(INT_SETS).filter((k) => k.startsWith('SortingPriority'));
{
  const missing = EXPECTED_PRIO.filter((k) => !PRIO_KEYS.includes(k));
  const extra = PRIO_KEYS.filter((k) => !EXPECTED_PRIO.includes(k));
  if (missing.length || extra.length) {
    throw new Error(`SortingPriority 集清单漂移: 缺=${missing} 多=${extra}——ItemSorting.cs 谓词引用面已变,先核对再重跑`);
  }
  if (!BUFF_INT_SETS.SortingPriorityFoodBuffs) throw new Error('BuffID.Sets.SortingPriorityFoodBuffs 缺档');
}

// ---------- Item.cs / Projectile.cs case 段 ----------
function methodBodyOf(src, name) {
  const idx = src.indexOf(name);
  if (idx < 0) return '';
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return '';
}
/** case 段 → itemId: segment（最近一层 switch(type)；★fall-through 组共享体——
 *  `case A: case B: case C: <体>` 的体归属组内全部标签;旧实现只赋末位标签,
 *  曾致 Lunar Hook 3020-3022 拿到空段（3023 独得共享体）） */
function collectCaseSegments(body, out) {
  const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
  const stack = [];
  const flush = (top, segText) => {
    // 空段（纯白化间）= fall-through 组累积,不重置;非空段=组体,赋给全部累积标签后清组
    if (!segText.trim()) return;
    for (const l of top.pending) if (l !== null) out.set(l, out.has(l) ? out.get(l) + segText : segText);
    top.pending = [];
  };
  let depth = 0, m;
  while ((m = tokRe.exec(body))) {
    const t = m[0];
    if (t.startsWith('switch')) {
      // ★SW-RB13c 修复⑦：嵌套 switch(type) 双写序逆置——case 体内嵌 switch(type) 时,
      // 原版执行序 = 外层体先跑、嵌套体后跑（后写覆盖先写）。旧实现外层体要等下一个
      // 外层标签才 flush,晚于嵌套体落盘 → 重放 last-write-wins 反取外层基值
      // （DD2 哨兵杖 3819/3820/3825/3826/3830/3831/3833/3834 的 rare=5/8 被外层 rare=3 覆盖）。
      // 修复：遇嵌套 switch 先把外层已累积段按执行序落盘,外层 segStart 跳到嵌套 switch
      // 之后（嵌套文本在重放端由 depth 守卫跳过,不重复生效）,嵌套体随后追加=执行序正确。
      const outer = stack[stack.length - 1];
      if (outer && outer.opened && outer.isType) {
        flush(outer, body.slice(outer.segStart, m.index));
        outer.segStart = m.index + t.length;
      }
      stack.push({ isType: /switch\s*\(\s*(?:type|currentItem\.type|Type)\b/.test(t), opened: false, bodyDepth: -1, pending: [null], segStart: 0 });
    } else if (t === '{') {
      depth++;
      const top = stack[stack.length - 1];
      if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
    } else if (t === '}') {
      const top = stack[stack.length - 1];
      if (top && top.opened && depth === top.bodyDepth) {
        if (top.isType) flush(top, body.slice(top.segStart, m.index));
        stack.pop();
        // ★SW-RB13c：自嵌套关闭处恢复外层续段（跳过已落盘的嵌套文本,防重复追加）
        const outer = stack[stack.length - 1];
        if (outer && outer.opened && outer.isType) outer.segStart = m.index + 1;
      }
      depth--;
    } else {
      const top = stack[stack.length - 1];
      if (top && top.opened && top.isType) {
        flush(top, body.slice(top.segStart, m.index));
        top.pending.push(t === 'default:' ? null : +m[2]);
        top.segStart = m.index + t.length;
      }
    }
  }
}
/** if 链段 → itemId: segment（Projectile.SetDefaults 用 if(type==N)/else if(type==N)
 *  长链,无 switch;头部含多条件 `type == A || type == B`（DualHookBlue=73||74 等）与
 *  区间 `type >= A && type <= B`——逐 if 头提取条件集,花括号配对截段） */
function collectIfChainSegments(body, out) {
  const headRe = /(?:else\s+)?if\s*\(([^)]*)\)/g;
  let m;
  while ((m = headRe.exec(body))) {
    const cond = m[1];
    if (!/\btype\b/.test(cond)) continue;
    const ids = [];
    const eqRe = /type\s*==\s*(\d+)/g;
    let e;
    while ((e = eqRe.exec(cond))) ids.push(Number(e[1]));
    const rangeRe = /type\s*>=\s*(\d+)\s*&&\s*type\s*<=\s*(\d+)/g;
    while ((e = rangeRe.exec(cond))) for (let v = +e[1]; v <= +e[2]; v++) ids.push(v);
    if (!ids.length) continue;
    const braceOpen = body.indexOf('{', m.index + m[0].length - 1);
    if (braceOpen < 0) continue;
    let depth = 0, end = -1;
    for (let i = braceOpen; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    for (const id of ids) out.set(id, out.has(id) ? out.get(id) + body.slice(braceOpen + 1, end) : body.slice(braceOpen + 1, end));
    headRe.lastIndex = braceOpen;
  }
}
const SEGS = new Map();
const ITEM_COUNT = 6196;   // ItemID.Count（Terarria1457/Terraria.ID/ItemID.cs:13938 public static readonly short Count = 6196）
{
  const braceBodyOf = (text, openIdx) => {
    let depth = 0;
    for (let i = openIdx; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
  };
  for (let n = 1; n <= 5; n++) {
    const body = methodBodyOf(itemSrc, `public void SetDefaults${n}(int type)`)
      || methodBodyOf(itemSrc, `private void SetDefaults${n}(int type)`);
    if (!body) continue;
    // ★SW-RB13c 修复⑪：switch 外顶层 if(type>=A && type<=B)/if(type==X) 范围分派支——
    //  反编译器把大量家族（火把座/旗帜座/染发剂 1977-1986/宠物牌 3453-3455/头饰
    //  2104-2113/平衡配件 3309-3314/蛋糕块 3390-3452 等全 39 支）放在 switch 之后,
    //  旧实现只扫 switch 段 → 这批 vid 的 SORT 字段整缺,层归属塌进 LastMaterials
    //  （234 件实测）。执行序 = switch 先、if 支后;case `return;` 结尾者不再执行 if 支,
    //  `break;` 结尾/无 case 者执行——据此判登记资格。
    const segsN = new Map();
    collectCaseSegments(body, segsN);
    const switchSpans = [];
    {
      let pos = 0;
      for (;;) {
        const mm = /switch\s*\(\s*type\s*\)/.exec(body.slice(pos));
        if (!mm) break;
        const s = pos + mm.index;
        const open = body.indexOf('{', s);
        const close = braceBodyOf(body, open);
        switchSpans.push([s, close]);
        pos = close + 1;
      }
    }
    const inSwitch = (i) => switchSpans.some(([a, b]) => a <= i && i <= b);   // ★JS 无链式比较
    const registerBranch = (condStart, condText, blockOpen, depth) => {
      const blockClose = braceBodyOf(body, blockOpen);
      if (blockClose < 0) return;
      const segText = body.slice(blockOpen + 1, blockClose);
      const lo = /type\s*>=\s*(\d+)/.exec(condText);
      const hi = /type\s*<=\s*(\d+)/.exec(condText);
      const eq = [...condText.matchAll(/type\s*==\s*(\d+)/g)].map((x) => Number(x[1]));
      let vids = [];
      if (lo && hi) {
        for (let v = Number(lo[1]); v <= Number(hi[1]); v++) vids.push(v);
      } else {
        vids = eq;
      }
      for (const v of vids) {
        if (v < 0 || v >= ITEM_COUNT) continue;
        const existing = segsN.get(v);
        if (existing !== undefined && !existing.trimEnd().endsWith('break;')) continue;  // return 结尾=已 return,if 支不可达
        segsN.set(v, (existing ?? '') + segText);
      }
      // 嵌套 if 支递归（外层体内再分派,如染发剂 1980/1984/1985 的 value 特例）
      if (depth < 4) collectTopIfs(body, blockOpen + 1, blockClose, segsN, depth + 1);
    };
    const collectTopIfs = (text, from, to, segsN2, depth) => {
      const re = /\b(?:else\s+)?if\s*\(([^)]*\btype\b[^)]*)\)\s*\{/g;
      re.lastIndex = from;
      let mm;
      while ((mm = re.exec(text)) && mm.index < to) {
        if (inSwitch(mm.index)) continue;
        const open = text.indexOf('{', mm.index + mm[0].length - 1);
        if (open < 0) continue;
        const close = braceBodyOf(text, open);
        if (close < 0) continue;
        const cond = mm[1];
        if (!/\btype\b\s*(>=|<=|==)/.test(cond)) continue;
        registerBranch(mm.index, cond, open, depth);
        re.lastIndex = close;   // 跳过块内已递归处理的嵌套支
      }
    };
    collectTopIfs(body, 0, body.length, segsN, 0);
    for (const [v, s] of segsN) SEGS.set(v, s);
  }
}
// ★SW-RB13c 修复⑩：SetFoodDefaults 分派面（Item.cs:48685 `else if (ItemID.Sets.IsFood[type])
//  SetFoodDefaults(type)` 先于 SetDefaults1-5）——IsFood 物品走此处,SetDefaults1-5 的同名
//  case 是死码。无 case 的 IsFood 物品（4010 Apple Pie Slice）基值=ResetStats 全零
//  （consumable=false）→ 层归属 LastMaterials;旧实现对全部 IsFood 强行 consumable=true
//  +buffType=26 曾致 4010 误入 PotionsFood。此处只取 SetFoodDefaults 的 case 标签集作分派门。
const FOOD_CASE_IDS = new Set();
{
  const body = methodBodyOf(itemSrc, 'private void SetFoodDefaults(int type)')
    || methodBodyOf(itemSrc, 'public void SetFoodDefaults(int type)');
  if (!body) throw new Error('SetFoodDefaults 缺档——SetDefaults 分派面已变,先核对 Item.cs:48685');
  const re = /case (\d+):/g;
  let m;
  while ((m = re.exec(body))) FOOD_CASE_IDS.add(Number(m[1]));
}
const PROJ_SEGS = new Map();
{
  const body = methodBodyOf(projSrc, 'public void SetDefaults(int Type)');
  if (body) collectIfChainSegments(body, PROJ_SEGS);
}
// projHook（Main.cs:6752-6762）：projHook[i] = aiStyle == 7
const HOOK_PROJS = new Set();
{
  // ★禁用 /g+test（lastIndex 跨段共享 → 奇偶交替假阴,曾致 231/233/235 等 gem hook 丢失）
  for (const [pid, seg] of PROJ_SEGS) if (seg.includes('aiStyle = 7;')) HOOK_PROJS.add(Number(pid));
}

// ---------- Main.cs 直赋集合（lightPet/vanityPet/tileFrameImportant）+ MountID Cart ----------
const collectAssign = (src, name) => {
  const set = new Set();
  const re = new RegExp(`\\b${name}\\[(\\d+)\\] = true;`, 'g');
  let m;
  while ((m = re.exec(src))) set.add(Number(m[1]));
  return set;
};
const LIGHT_PETS = collectAssign(mainSrc, 'lightPet');       // Main.cs:9427-9441（15 条）
const VANITY_PETS = collectAssign(mainSrc, 'vanityPet');     // Main.cs:9353-9426 等（77 条）
const FRAME_IMPORTANT = collectAssign(mainSrc, 'tileFrameImportant');
const CART_MOUNTS = new Set((() => {
  const m = mountidSrc.match(/public static bool\[\] Cart = Factory\.CreateBoolSet\(([^)]*)\)/);
  if (!m) throw new Error('MountID.Sets.Cart 缺档');
  return m[1].split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
})());

// ---------- 染料/染发剂 shader id（DyeInitializer 执行序 = ArmorShaderDataSet/HairShaderDataSet
//  BindShader 的 `++_shaderDataCount` 自增 id,ArmorShaderDataSet.cs:16）——Item.dye/hairDye
//  的逐件精确值（PotionsDyes/PotionsHairDyes 比较器 `dye.CompareTo` / `hairDye.CompareTo`
//  消费面）。旧模型 dye 恒 1 / hairDye 恒 1 → 层内排序退化为槽序（非原版）。 ----------
const DYEINIT_SRC = read('Terarria1457/Terraria.Initializers/DyeInitializer.cs');
const ARMOR_SHADER_ID = new Map();
const HAIR_SHADER_ID = new Map();
{
  const methodOf = (name) => {
    const m = DYEINIT_SRC.match(new RegExp(`(?:public|private)\\s+static\\s+void\\s+${name}\\s*\\(([^)]*)\\)\\s*\\{`));
    if (!m) return null;
    const start = m.index + m[0].length - 1;
    let depth = 0, end = -1;
    for (let i = start; i < DYEINIT_SRC.length; i++) {
      if (DYEINIT_SRC[i] === '{') depth++;
      else if (DYEINIT_SRC[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return { params: m[1], body: DYEINIT_SRC.slice(start + 1, end) };
  };
  const seen = new Set();
  const exec = (name, argText, depth) => {
    if (depth > 4 || seen.has(name + argText)) return;
    seen.add(name + argText);
    const meth = methodOf(name);
    if (!meth) return;
    const args = argText.split(',').map((x) => x.trim()).filter(Boolean);
    const paramNames = meth.params.split(',').map((p) => p.trim().split(/\s+/).pop().replace(/=.*$/, ''));
    const env = new Map();
    paramNames.forEach((p, i) => env.set(p, args[i] ?? ''));
    const resolved = (s) => {
      let v = String(s ?? '').trim();
      for (let k = 0; k < 6 && env.has(v); k++) v = String(env.get(v) ?? '').trim();
      return v;
    };
    const callRe = /(GameShaders\.(?:Armor|Hair)\.BindShader|LoadBasicColorDye|Load\w+)\s*\(/g;
    let cm;
    while ((cm = callRe.exec(meth.body))) {
      const open = meth.body.indexOf('(', cm.index + cm[0].length - 1);
      let pd = 0, close = -1;
      for (let i = open; i < meth.body.length; i++) {
        if (meth.body[i] === '(') pd++;
        else if (meth.body[i] === ')') { pd--; if (pd === 0) { close = i; break; } }
      }
      const rawArgs = meth.body.slice(open + 1, close).split(',').map((x) => x.trim());
      if (cm[1].endsWith('.BindShader')) {
        const vid = Number(resolved(rawArgs[0]).replace(/^\(\w+\)\s*/, ''));
        if (Number.isInteger(vid)) {
          if (cm[1].includes('Armor.')) { if (!ARMOR_SHADER_ID.has(vid)) ARMOR_SHADER_ID.set(vid, ARMOR_SHADER_ID.size + 1); }
          else if (!HAIR_SHADER_ID.has(vid)) HAIR_SHADER_ID.set(vid, HAIR_SHADER_ID.size + 1);
        }
      } else if (cm[1] === 'LoadBasicColorDye') {
        // 双载展开：4 实参形=逐件绑定;1 实参形=base/base+12/base+31/base+44（LoadBasicColorDye.cs:22）
        const vals = rawArgs.map(resolved).map((x) => Number(x.replace(/^\(\w+\)\s*/, '')));
        if (vals.length >= 4 && vals.slice(0, 4).every(Number.isInteger)) {
          exec('LoadBasicColorDye', `${vals[0]}, ${vals[1]}, ${vals[2]}, ${vals[3]}`, depth + 1);
        } else if (Number.isInteger(vals[0])) {
          const b = vals[0];
          exec('LoadBasicColorDye', `${b}, ${b + 12}, ${b + 31}, ${b + 44}`, depth + 1);
        }
      } else if (cm[1] !== 'Load') {
        exec(cm[1], rawArgs.map(resolved).join(', '), depth + 1);
      }
      callRe.lastIndex = close;
    }
  };
  const loadBody = methodOf('Load');
  if (!loadBody) throw new Error('DyeInitializer.Load 缺档——染料绑定序提取失败');
  // Load() 依序执行的方法（LoadArmorDyes → LoadHairDyes → LoadMisc,DyeInitializer.cs:490-494）
  const entryRe = /(Load\w+)\s*\(\s*\)/g;
  let em;
  while ((em = entryRe.exec(loadBody.body))) exec(em[1], '', 0);
}

// ---------- 既有产物复用 ----------
const func = JSON.parse(read('game/src/data/vanilla-itemfunc.json'));
const equip = JSON.parse(read('game/src/data/vanilla-equip.json'));
const hairDyeIds = new Set(Object.keys(JSON.parse(read('game/src/data/vanilla-hairdyes.json')).hairDyes ?? {}));
const shimmer = JSON.parse(read('game/src/data/vanilla-shimmer.json'));
const makeNPC = shimmer.itemMakeNPC ?? {};
const rareTable = JSON.parse(read('game/src/data/vanilla-itemrare.json'));
const valueTable = JSON.parse(read('game/src/data/vanilla-itemvalue.json'));

// 英文名（ItemID.cs const short + en-US Items.json ItemName,尾逗号容忍）
const NAMES = {};
{
  const nameId = {};   // const name → vid
  const re = /public const short (\w+) = (\d+);/g;
  let m;
  while ((m = re.exec(itemidSrc))) nameId[m[1]] = Number(m[2]);
  let locRaw = read('Terarria1457/Terraria.Localization.Content.en-US.Items.json').replace(/,(\s*[}\]])/g, '$1');
  const loc = JSON.parse(locRaw);
  const itemName = loc.ItemName ?? {};
  let named = 0;
  for (const [key, text] of Object.entries(itemName)) {
    const vid = nameId[key];
    if (vid === undefined) continue;
    NAMES[vid] = text;
    named++;
  }
  console.log(`英文名: ${named} 条（ItemName ${Object.keys(itemName).length} → ItemID const 映射）`);
}

// ---------- 逐物品字段聚合 ----------
const SORT_FIELDS = new Set(['melee', 'ranged', 'magic', 'summon', 'consumable', 'notAmmo', 'questItem',
  'accessory', 'vanity', 'mech', 'damage', 'defense', 'pick', 'axe', 'hammer', 'ammo', 'shoot', 'buffType',
  'healLife', 'healMana', 'mountType', 'headSlot', 'bodySlot', 'legSlot', 'paint', 'paintCoating',
  'createTile', 'createWall', 'makeNPC', 'rare', 'hairDye']);   // ★SW-RB13c：+hairDye（case 段 hairDye=0
//   标记是 PotionsHairDyes 白名单成员的原文判据——Hair Dye Remover 1990 曾因此漏认领,落入 LastMaterials）
// ★value 不走扫描——`value = dungeonPrice/sellPrice(...)` 算式文本不可直读,
//   权威源 = vanilla-itemvalue.json（4928 条,含 1457 新物品,计算值已折算）
/** itemfunc 表同名字段映射（其嵌套 case/区间块已按源码校对修补——在档键优先） */
const FUNC_KEYS = { melee: 'melee', ranged: 'ranged', magic: 'magic', summon: 'summon',
  consumable: 'consumable', notAmmo: 'notAmmo', damage: 'damage', pick: 'pick', axe: 'axe',
  hammer: 'hammer', shoot: 'shoot', buffType: 'buffType', healLife: 'healLife', healMana: 'healMana',
  createTile: 'createTile', createWall: 'createWall' };

// ---------- DefaultTo* 助手展开（★提取器盲区族 FX3 教训：mountType/createTile/
//  makeNPC/buffType/healLife 等大量走 DefaultToMinecart/PlaceableTile/Vanitypet/
//  CapturedCritter/HealingPotion/Headgear… 助手,直赋正则扫不到——逐助手体参数
//  代换后按 case 段内出现序重放,后写覆盖先写） ----------
// ★SW-RB13c 修复⑧：同名多载（DefaultToPlaceableTile 有 int/ushort 两体）——旧 HELPERS
//  只留末位声明;改为按名收集全载,调用期按实参数+首参类型(cast)选体。
const HELPERS = new Map();
{
  const re = /(?:public|private)\s+void\s+(DefaultTo\w+)\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(itemSrc))) {
    const params = m[2].split(',').map((x) => x.trim()).filter(Boolean)
      .map((p) => {
        const parts = p.replace(/=\s*[^,]+$/, '').trim().split(/\s+/);
        return { type: parts.length > 1 ? parts[0] : '', name: parts[parts.length - 1] };
      });
    const start = m.index + m[0].length;
    let depth = 1, end = -1;
    for (let i = start; i < itemSrc.length; i++) {
      if (itemSrc[i] === '{') depth++;
      else if (itemSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    if (!HELPERS.has(m[1])) HELPERS.set(m[1], []);
    HELPERS.get(m[1]).push({ params, body: itemSrc.slice(start, end) });
  }
}
/** 实参文本解析：剥 (ushort)/(short)/(byte)/(int) cast 后取整数字面量 */
function argLiteral(a) {
  const v = String(a ?? '').trim().replace(/^\(\w+\)\s*/, '');
  return /^-?\d+$/.test(v) ? Number(v) : null;
}
/** 展开单条助手调用：助手体内【顶层】`field = 常量|参数|AmmoID.X;` → 赋值对列表
 *  （条件支内的赋值是运行时世界态分支,非基值——跳过,如 rare=2 + if(remix) rare=8）。
 *  ★SW-RB13c 修复⑨：助手体内的嵌套 DefaultTo* 转发调用递归展开——
 *  DefaultToInfoAccessory 体 = DefaultToAccessory(newwidth,newheight)（accessory=true
 *  在彼处）,旧实现不递归 → 22 件信息饰品(表/罗盘/GPS/探鱼器族) accessory 整缺。 */
function expandHelperCall(name, argsRaw, env = new Map(), depthGuard = 0) {
  const overloads = HELPERS.get(name);
  if (!overloads || depthGuard > 6) return [];
  const args = argsRaw.split(',').map((x) => x.trim());
  // 选载：优先首实参 cast 与首形参类型匹配者,否则取可容实参的最后一个声明
  const firstCast = /^\((\w+)\)/.exec(args[0] ?? '');
  let h = null;
  for (const cand of overloads) {
    if (args.length > cand.params.length) continue;
    h = cand;
    if (firstCast && cand.params[0] && cand.params[0].type === firstCast[1]) break;
  }
  if (!h) h = overloads[overloads.length - 1];
  const paramVal = new Map();
  h.params.forEach((p, i) => {
    const a = args[i] ?? '';
    // 缺省参数（= xxx）在参数名里已剥,实参缺位时取 decl 缺省——params 提取只留了
    // 尾名,缺省值丢失可接受（本域助手缺省参数仅 useGulpSound/animationTime 等无关面）
    paramVal.set(p.name, a);
  });
  if (env.size) for (const [k, v] of env) if (!paramVal.has(k)) paramVal.set(k, v);
  const out = [];
  let depth = 0;
  // ★值域禁跨行/跨花括号——否则 `if (Variant == X)` 头部的 `==` 会被当作赋值吞掉
  //  整个 if 块,块内赋值（rare=8）顶层面化（157 Aqua Scepter 教训）
  const tokRe = /[{}]|(\w+)\s*=(?!=)\s*([^;{}\n]+);|(DefaultTo\w+)\s*\(/g;
  let am;
  while ((am = tokRe.exec(h.body))) {
    const t = am[0];
    if (t === '{') { depth++; continue; }
    if (t === '}') { depth--; continue; }
    if (depth !== 0) continue;
    if (am[3]) {
      // 嵌套转发调用：先解出实参（参数代换 + cast 剥除）再递归
      const open = h.body.indexOf('(', am.index + am[0].length - 1);
      let pd = 0, close = -1;
      for (let i = open; i < h.body.length; i++) {
        if (h.body[i] === '(') pd++;
        else if (h.body[i] === ')') { pd--; if (pd === 0) { close = i; break; } }
      }
      const innerArgs = h.body.slice(open + 1, close).split(',').map((x) => x.trim())
        .map((a) => {
          const lit = argLiteral(a);
          if (lit !== null) return String(lit);
          if (paramVal.has(a)) {
            const lit2 = argLiteral(paramVal.get(a));
            if (lit2 !== null) return String(lit2);
          }
          return a;
        }).join(', ');
      const innerEnv = new Map();
      for (const [k, v] of paramVal) innerEnv.set(k, v);
      for (const [field, v] of expandHelperCall(am[3], innerArgs, innerEnv, depthGuard + 1)) {
        out.push([field, v]);
      }
      tokRe.lastIndex = close;
      continue;
    }
    const field = am[1], expr = am[2].trim();
    if (paramVal.has(expr)) {
      const v = argLiteral(paramVal.get(expr));
      if (v !== null) out.push([field, v]);
      else if (String(paramVal.get(expr)).startsWith('AmmoID.')) out.push([field, AMMO_ID[String(paramVal.get(expr)).slice(7)] ?? 0]);
      // 非字面量实参（算式）不代换——守门留痕（DefaultToVanitypet(881+type-4797) 族
      // 的算式实参由 itemfunc buffType 权威承载）
    } else if (/^-?\d+$/.test(expr)) {
      out.push([field, Number(expr)]);
    } else if (expr === 'true') {
      out.push([field, true]);
    } else if (expr === 'false') {
      // ★SW-RB13c：false 直赋同权重放（5629 染色弹弓 ranged=false 曾被丢,层 1≠4）
      out.push([field, false]);
    } else if (expr.startsWith('AmmoID.')) {
      out.push([field, AMMO_ID[expr.slice(7)] ?? 0]);
    }
  }
  return out;
}
/** case 段顺序重放：【顶层】直赋 `field = 字面量;` + DefaultTo* 调用展开 + SetShopValues,
 *  后写覆盖先写。itemId 供 `shoot = 486 + type - 3020` 型算式代换（Lunar Hook 3020-3023 族）。
 *  ★条件支（if 内）赋值不重放——基值才是排序语义（157 rare=2 + if(remix) rare=8 教训） */
const RARITY_ENUM = { TrashMinus1: -1, AmberMinus11: -11, White0: 0, Blue1: 1, Green2: 2, Orange3: 3,
  LightRed4: 4, Pink5: 5, LightPurple6: 6, Lime7: 7, Yellow8: 8, Cyan9: 9, StrongRed10: 10, Purple11: 11 };
function replaySegment(seg, target, consider, itemId = 0) {
  let depth = 0;
  // ★值域禁跨行/跨花括号 + == 防误配（同 expandHelperCall 注）
  const re = /[{}]|(\w+)\s*=(?!=)\s*([^;{}\n]+);|(DefaultTo\w+)\s*\(|(SetShopValues)\s*\(/g;
  // 实参提取 = 括号配对（[^)]* 会被 `(ushort)726, 0` 的内层 ')' 截断——旧实现此盲区
  // 由 itemfunc createTile 兜底掩盖,本版直取全参）
  const scanArgs = (openIdx) => {
    let pd = 0, close = -1;
    for (let i = openIdx; i < seg.length; i++) {
      if (seg[i] === '(') pd++;
      else if (seg[i] === ')') { pd--; if (pd === 0) { close = i; break; } }
    }
    return { args: seg.slice(openIdx + 1, close), close };
  };
  let m;
  while ((m = re.exec(seg))) {
    const t = m[0];
    if (t === '{') { depth++; continue; }
    if (t === '}') { depth--; continue; }
    if (depth !== 0) continue;
    if (m[3]) {
      const { args, close } = scanArgs(m.index + m[0].length - 1);
      for (const [field, v] of expandHelperCall(m[3], args)) {
        if (consider.has(field)) target.set(field, v);
      }
      re.lastIndex = close;
      continue;
    }
    if (m[4]) {
      // ★SW-RB13c：SetShopValues(ItemRarityColor.X, 价格式) —— rare 取枚举终值
      //  （5356 Used Gas Trap rare=-1、各食物 SetShopValues 覆写 DefaultToFood rare=1;
      //  value 面 = vanilla-itemvalue.json 权威表,不在此重放）
      const { args, close } = scanArgs(m.index + m[0].length - 1);
      const firstArg = args.split(',')[0]?.trim() ?? '';
      const em = /^ItemRarityColor\.(\w+)$/.exec(firstArg);
      if (em && consider.has('rare') && em[1] in RARITY_ENUM) target.set('rare', RARITY_ENUM[em[1]]);
      re.lastIndex = close;
      continue;
    }
    const field = m[1];
    if (!consider.has(field)) continue;
    const expr = m[2].trim();
    if (/^-?\d+$/.test(expr)) target.set(field, Number(expr));
    else if (expr === 'true') target.set(field, true);
    else if (expr === 'false') target.set(field, false);   // ★SW-RB13c：false 直赋重放（5629 ranged=false）
    else if (expr.startsWith('AmmoID.')) target.set(field, AMMO_ID[expr.slice(7)] ?? 0);
    else if (/type\b/.test(expr) && /^[\d\s+\-*()%|]+$/.test(expr.replace(/type/g, ''))) {
      // 算式（type 与 itemId 代换,白名单字符防注入）——工具期求值,非运行时代码
      try {
        const v = Function(`"use strict"; return (${expr.replace(/\btype\b/g, String(itemId))});`)();
        if (Number.isFinite(v)) target.set(field, Math.round(v));
      } catch { /* 非算式,跳过 */ }
    }
  }
}

const items = [];
for (let id = 0; id < ITEM_COUNT; id++) {
  const f = func[String(id)] ?? {};
  const isFood = (BOOL_SETS.IsFood?.ids ?? []).includes(id);
  // ★SW-RB13c 修复⑩：IsFood 分派——SetDefaults(Type) 对 IsFood 物品先走 SetFoodDefaults
  //  （Item.cs:48685）,SetDefaults1-5 同名 case = 死码,不重放（4010 死码组曾借尸还魂）;
  //  字段面 = itemfunc（全 85 个有 case 食物均有档,consumable/buffType/healLife 全覆盖）。
  const seg = isFood ? undefined : SEGS.get(id);
  const it = {
    id,
    melee: !!f.melee, ranged: !!f.ranged, magic: !!f.magic, summon: !!f.summon,
    consumable: !!f.consumable, notAmmo: !!f.notAmmo, questItem: !!f.questItem,
    damage: f.damage ?? 0, defense: 0, pick: f.pick ?? 0, axe: f.axe ?? 0, hammer: f.hammer ?? 0,
    ammo: f.ammo ?? 0, shoot: f.shoot ?? 0, buffType: f.buffType ?? 0,
    healLife: f.healLife ?? 0, healMana: f.healMana ?? 0,
    fishingPole: f.fishingPole ?? 0, bait: f.bait ?? 0,
    createTile: f.createTile ?? -1, createWall: f.createWall ?? 0,
    accessory: false, vanity: false, mech: false, mountType: -1,
    headSlot: -1, bodySlot: -1, legSlot: -1, paint: 0, paintCoating: 0,
    rare: rareTable[String(id)] ?? 0,
    value: valueTable[String(id)] ?? 0,
    hairDye: -1,   // ★SW-RB13c：缺省 -1（ResetStats 基值）;case 段 hairDye=0 标记/Hair 绑定 id 终门在 seg 重放后
    // ★染料面（SW-RB13c 升级为精确 shader id）：Item.dye = Armor 绑定序 id（DyeInitializer
    //  执行序 ++_shaderDataCount）,染发剂不在 Armor 集 → dye=0（原 48716 直读语义）;
    //  旧模型 dye 恒 1 且混入染发剂（equip.dye 曾含 1977-1986）曾令 PotionsHairDyes 整层被抢
    dye: ARMOR_SHADER_ID.get(id) ?? 0,
    makeNPC: makeNPC[String(id)] ?? 0,
    isFood,
    isCrate: (BOOL_SETS.IsFishingCrate?.ids ?? []).includes(id),
    isBasicFish: (BOOL_SETS.IsBasicFish?.ids ?? []).includes(id),
  };
  if (seg) {
    // 顺序重放直赋 + DefaultTo* 助手展开（FX3 提取器盲区族防误报）；itemfunc 在档
    // 键优先（其嵌套 switch/区间块已按源码校对修补）,扫描值只补缺
    const scanned = new Map();
    replaySegment(seg, scanned, SORT_FIELDS, id);
    for (const [name, v] of scanned) {
      const fKey = FUNC_KEYS[name];
      if (fKey && f[fKey] !== undefined) continue;
      if (name === 'rare') { it.rare = v; continue; }   // 1457 直读（itemrare 表为后备,差集打印）
      it[name] = v;
    }
  }
  // ★SW-RB13c hairDye 终值门（Item.cs:48717-48721）：`if (hairDye != 0) hairDye =
  //  GameShaders.Hair.GetShaderIdFromItemId(type)` —— case 段 hairDye=0 标记者终值 0
  //  （Hair Dye Remover 1990）;无标记者取 Hair 绑定序 id（染发剂 1977-1986/2863/3259）,
  //  未绑定 → -1（HairShaderDataSet.cs:57-63 GetShaderIdFromItemId 未命中返回 -1）。
  if (it.hairDye !== 0) it.hairDye = HAIR_SHADER_ID.get(id) ?? -1;
  // 衍生旗（运行时谓词面）
  it.hook = HOOK_PROJS.has(it.shoot);                                   // Main.projHook[shoot]
  it.isLightPet = (LIGHT_PETS.has(it.buffType));                        // Main.lightPet[buffType]
  it.isVanityPet = (VANITY_PETS.has(it.buffType));                      // Main.vanityPet[buffType]
  it.isCart = it.mountType >= 0 && CART_MOUNTS.has(it.mountType);       // MountID.Sets.Cart
  items.push(it);
}

// ---------- 旧近似集对照（vanilla-equip.json hook/pet/light/cart 逐物品旗 vs 忠实集合） ----------
const itemsWith = (pred) => new Set(items.filter(pred).map((it) => it.id));
const diffFlags = (label, oldArr, newSet) => {
  const onlyOld = [], onlyNew = [];
  for (let id = 0; id < ITEM_COUNT; id++) {
    const o = oldArr.includes(id), n = newSet.has(id);
    if (o && !n) onlyOld.push(id);
    if (!o && n) onlyNew.push(id);
  }
  console.log(`对照 ${label}: 旧=${onlyOld.length} 新=${onlyNew.length} 仅旧=[${onlyOld.slice(0, 8)}] 仅新=[${onlyNew.slice(0, 8)}]`);
};
diffFlags('hook(equip.hook vs projHook[shoot])', equip.hook, itemsWith((it) => it.hook));
diffFlags('light(equip.light vs lightPet[buffType])', equip.light, itemsWith((it) => it.isLightPet));
diffFlags('pet(equip.pet vs vanityPet[buffType])', equip.pet, itemsWith((it) => it.isVanityPet));
diffFlags('cart(equip.cart vs Cart[mountType])', equip.cart, itemsWith((it) => it.isCart));
// rare：itemrare 表 vs 1457 直读差集
{
  let diff = 0, samples = [];
  for (const it of items) {
    const t = rareTable[String(it.id)];
    if (t !== undefined && t !== it.rare) { diff++; if (samples.length < 8) samples.push(`${it.id}:${t}→${it.rare}`); }
  }
  console.log(`rare 差集: ${diff} 条 ${samples.join(' ')}`);
}
// ★SW-RB13c：shader id 集与既有 vanilla-equip/vanilla-hairdyes 表交叉校验
{
  const armorSet = new Set(ARMOR_SHADER_ID.keys());
  const legacyArmor = new Set(equip.dye.filter((v) => !hairDyeIds.has(String(v))));
  const onlyA = [...armorSet].filter((v) => !legacyArmor.has(v));
  const onlyL = [...legacyArmor].filter((v) => !armorSet.has(v));
  console.log(`Armor 绑定集 vs equip.dye(-hair): ${armorSet.size} vs ${legacyArmor.size} 仅新=[${onlyA.slice(0, 8)}] 仅旧=[${onlyL.slice(0, 8)}]`);
  const hairSet = new Set(HAIR_SHADER_ID.keys());
  const legacyHair = new Set([...hairDyeIds].map(Number));
  const onlyH = [...hairSet].filter((v) => !legacyHair.has(v));
  const onlyH2 = [...legacyHair].filter((v) => !hairSet.has(v));
  console.log(`Hair 绑定集 vs vanilla-hairdyes: ${hairSet.size} vs ${legacyHair.size} 仅新=[${onlyH.slice(0, 8)}] 仅旧=[${onlyH2.slice(0, 8)}]`);
}

// ---------- 52 层谓词（SetupWhiteLists :1278-1329 固定序;ItemSorting.cs 谓词逐条对照） ----------
const layerOf = (it) => {
  // 前 4 层（SetupWhiteLists 固定序 Melee→Ranged→Magic→Minions;排序时才按玩家倍率换序）
  if (it.damage > 0 && !it.consumable && it.ammo === 0 && it.melee && it.pick < 1 && it.hammer < 1 && it.axe < 1) return 0;
  if ((it.damage > 0 && !it.consumable && it.ammo === 0 && it.ranged) || prio('SortingPriorityWeaponsRanged', it.id) > -1) return 1;
  if (it.damage > 0 && !it.consumable && it.ammo === 0 && it.magic) return 2;
  if (it.damage > 0 && !it.consumable && it.summon) return 3;
  if (it.damage > 0 && it.ammo === 0 && it.pick === 0 && it.axe === 0 && it.hammer === 0) return 4;      // WeaponsAssorted
  if (it.ammo > 0 && it.damage > 0) return 5;                                                            // WeaponsAmmo
  if (it.pick > 0 && it.axe > 0) return 6;                                                               // ToolsPicksaws
  if (it.hammer > 0 && it.axe > 0) return 7;                                                             // ToolsHamaxes
  if (it.pick > 0) return 8;                                                                             // ToolsPickaxes
  if (it.axe > 0) return 9;                                                                              // ToolsAxes
  if (it.hammer > 0) return 10;                                                                          // ToolsHammers
  if (prio('SortingPriorityTerraforming', it.id) > -1) return 11;
  if (it.fishingPole > 0 || it.bait > 0 || it.questItem || it.isCrate || it.isBasicFish
    || prio('SortingPriorityToolsFishing', it.id) > -1) return 12;
  if (prio('SortingPriorityToolsGolf', it.id) > -1) return 13;
  if (prio('SortingPriorityToolsInstruments', it.id) > -1) return 14;
  if (prio('SortingPriorityToolsKeys', it.id) > -1) return 15;
  if (prio('SortingPriorityToolsKites', it.id) > -1) return 16;
  if (it.ammo > 0 && !it.isFood && prio('SortingPriorityMiscAcorns', it.id) === -1) return 17;            // AmmoLeftovers
  if (prio('SortingPriorityToolsMisc', it.id) > -1) return 18;
  if ((it.bodySlot >= 0 || it.headSlot >= 0 || it.legSlot >= 0) && !it.vanity) return 19;                 // ArmorCombat
  if ((it.bodySlot >= 0 || it.headSlot >= 0 || it.legSlot >= 0) && it.vanity) return 20;                  // ArmorVanity
  if (it.accessory) return 21;                                                                           // ArmorAccessories
  if (it.hook) return 22;                                                                                // EquipGrapple（projHook[shoot]）
  if (it.mountType !== -1 && !it.isCart) return 23;                                                      // EquipMount
  if (it.mountType !== -1 && it.isCart) return 24;                                                       // EquipCart
  if (it.buffType > 0 && it.isLightPet) return 25;                                                       // EquipLightPet
  if (it.buffType > 0 && it.isVanityPet) return 26;                                                      // EquipVanityPet
  if (it.dye > 0 || prio('SortingPriorityPotionsDyeMaterial', it.id) > -1) return 27;                     // PotionsDyes
  if (it.hairDye >= 0) return 28;                                                                        // PotionsHairDyes
  if (it.consumable && it.healLife > 0 && it.healMana < 1 && it.id !== 5) return 29;                      // PotionsLife
  if (it.id === 5) return 30;                                                                            // PotionsJustTheMushroom
  if (it.consumable && it.healLife < 1 && it.healMana > 0) return 31;                                     // PotionsMana
  if (it.consumable && it.healLife > 0 && it.healMana > 0) return 32;                                     // PotionsElixirs
  if ((it.consumable && it.buffType > 0 && !it.isFood) || prio('SortingPriorityPotionsBuffs', it.id) > -1) return 33; // PotionsBuffs
  if (it.consumable && it.buffType > 0 && it.isFood) return 34;                                          // PotionsFood
  if (prio('SortingPriorityMiscImportants', it.id) > -1) return 35;                                      // MiscValuables
  if (prio('SortingPriorityPainting', it.id) > -1 || it.paint > 0) return 36;                             // MiscPainting
  if (prio('SortingPriorityWiring', it.id) > -1 || it.mech) return 37;                                    // MiscWiring
  if (prio('SortingPriorityMaterials', it.id) > -1) return 38;                                           // MiscMaterials
  if (it.id === 183) return 39;                                                                          // MiscJustTheGlowingMushroom
  if (prio('SortingPriorityRopes', it.id) > -1) return 40;                                               // MiscRopes
  if (prio('SortingPriorityMiscHerbsAndSeeds', it.id) > -1) return 41;                                   // MiscHerbsAndSeeds
  if (prio('SortingPriorityMiscAcorns', it.id) > -1) return 42;                                          // MiscAcorns
  if (prio('SortingPriorityMiscGems', it.id) > -1) return 43;                                            // MiscGems
  if (prio('SortingPriorityMiscBossBags', it.id) > -1) return 44;                                        // MiscBossBags
  if (it.makeNPC > 0) return 45;                                                                         // MiscCritters
  if (prio('SortingPriorityExtractibles', it.id) > -1) return 46;                                        // MiscExtractinator
  if (it.createTile < 0 && it.createWall < 1 && it.rare !== -1) return 47;                               // LastMaterials
  if (it.createTile >= 0 && FRAME_IMPORTANT.has(it.createTile)) return 48;                               // LastTilesImportant
  if (it.createWall > 0 || it.createTile >= 0) return 49;                                                // LastTilesCommon
  if (it.rare >= 0) return 50;                                                                           // LastNotTrash
  return 51;                                                                                             // LastTrash
};

// ---------- 顺序消费（先到先得;等价 SetupWhiteLists 逐层跑谓词+itemsToSort 移除） ----------
const claimed = new Uint8Array(ITEM_COUNT);
const layerIndex = new Int16Array(ITEM_COUNT).fill(-1);
for (let L = 0; L < 52; L++) {
  for (const it of items) {
    if (claimed[it.id]) continue;
    if (layerOf(it) === L) { claimed[it.id] = 1; layerIndex[it.id] = L; }
  }
}
// ★原版不变量（ItemSorting.cs:1353 Invariant.Assert）：LastNotTrash 白名单必须为空
// —— vid 0..6195 全部被层 0-49 认领（50/51 层是模组物品的运行时尾接面,白名单恒空）
const unclaimed = [];
for (let id = 0; id < ITEM_COUNT; id++) if (layerIndex[id] < 0) unclaimed.push(id);
const toLastNotTrash = [];
for (let id = 0; id < ITEM_COUNT; id++) if (layerIndex[id] === 50) toLastNotTrash.push(id);
if (unclaimed.length || toLastNotTrash.length) {
  console.error(`★不变量破约: 未认领=${unclaimed.length} [${unclaimed.slice(0, 10)}] LastNotTrash=${toLastNotTrash.length} [${toLastNotTrash.slice(0, 10)}]`);
  process.exit(1);
}

// ---------- 稀疏 attrs（0/假/缺省不落键） ----------
const attrs = {};
for (const it of items) {
  const a = {};
  if (it.damage > 0) a.d = it.damage;
  if (it.defense > 0) a.df = it.defense;
  if (it.melee) a.m = 1;
  if (it.ranged) a.rg = 1;   // ★rg=远程旗——曾用 r 与 rare(a.r) 键冲突:rare≠0 覆写远程旗
                             //  + 全部 rare≠0 物品被 view 读成 ranged=真(层归属漂移)
  if (it.magic) a.g = 1;
  if (it.summon) a.s = 1;
  if (it.consumable) a.c = 1;
  if (it.notAmmo) a.na = 1;
  if (it.questItem) a.q = 1;
  if (it.accessory) a.ac = 1;
  if (it.vanity) a.v = 1;
  if (it.mech) a.me = 1;
  if (it.ammo > 0) a.am = it.ammo;
  if (it.pick > 0) a.pk = it.pick;
  if (it.axe > 0) a.ax = it.axe;
  if (it.hammer > 0) a.ha = it.hammer;
  if (it.fishingPole > 0) a.fp = it.fishingPole;
  if (it.bait > 0) a.bt = it.bait;
  if (it.headSlot >= 0) a.hs = it.headSlot;
  if (it.bodySlot >= 0) a.bs = it.bodySlot;
  if (it.legSlot >= 0) a.ls = it.legSlot;
  if (it.mountType >= 0) a.mt = it.mountType;
  if (it.paint > 0) a.pt = it.paint;
  if (it.paintCoating > 0) a.pc = it.paintCoating;
  if (it.buffType > 0) a.bf = it.buffType;
  if (it.healLife > 0) a.hl = it.healLife;
  if (it.healMana > 0) a.hm = it.healMana;
  if (it.dye > 0) a.dy = it.dye;
  if (it.hairDye >= 0) a.hd = it.hairDye;
  if (it.createTile >= 0) a.ct = it.createTile;
  if (it.createWall > 0) a.cw = it.createWall;
  if (it.makeNPC > 0) a.mn = it.makeNPC;
  if (it.rare !== 0) a.r = it.rare;
  if (it.value > 0) a.vl = it.value;
  if (it.hook) a.fk = 1;
  if (it.isLightPet) a.lp = 1;
  if (it.isVanityPet) a.vp = 1;
  if (it.isCart) a.ca = 1;
  if (it.isFood) a.fo = 1;
  if (it.isCrate) a.fc = 1;
  if (it.isBasicFish) a.fb = 1;
  // 名字只在名字比较器消费面落键（Last - Tiles 两层=createTile/createWall 族）
  if ((it.createTile >= 0 || it.createWall > 0) && NAMES[it.id]) a.nm = NAMES[it.id];
  attrs[String(it.id)] = a;
}

const out = {
  meta: {
    source: 'Terarria1457 Terraria.UI/ItemSorting.cs SetupWhiteLists :1272-1354',
    layerCount: 52, itemCount: ITEM_COUNT, version: 2, extracted: '2026-09-11 SW-FX29',
  },
  layers: {},
  prio: {}, buffFoodPrio: BUFF_INT_SETS.SortingPriorityFoodBuffs.pairs,
  bools: {
    IsFood: [...(BOOL_SETS.IsFood?.ids ?? [])],
    IsFishingCrate: [...(BOOL_SETS.IsFishingCrate?.ids ?? [])],
    IsBasicFish: [...(BOOL_SETS.IsBasicFish?.ids ?? [])],
  },
  frameImportant: [...FRAME_IMPORTANT].sort((a, b) => a - b),
  attrs,
};
for (let id = 0; id < ITEM_COUNT; id++) out.layers[String(id)] = layerIndex[id];
for (const k of PRIO_KEYS) out.prio[k] = INT_SETS[k].pairs;

// ---- ★BJ298 era guard ②：干跑对拍 / 沙箱 / 逃生门（banners 同构 deepWash）----
/** 现库 vs 重产双向路径级 diff。live-only=洗库预警面 / fresh-only=现库退化缺键型面
 *  （★G-1/S3 处方）/ drift=同路径值漂移。（旧"已覆写后 void diff"死码块由本闸取代） */
function deepWash(live, fresh, prefix = '') {
  const w = { liveOnly: [], freshOnly: [], drift: [] };
  const base = prefix || '<root>';
  if (live === null || fresh === null || typeof live !== 'object' || typeof fresh !== 'object') {
    if (JSON.stringify(live) !== JSON.stringify(fresh)) w.drift.push(`${base}: ${JSON.stringify(live)}→${JSON.stringify(fresh)}`);
    return w;
  }
  if (Array.isArray(live) !== Array.isArray(fresh)) {
    w.drift.push(`${base}: 类型漂移 ${Array.isArray(live) ? 'arr' : 'obj'}↔${Array.isArray(fresh) ? 'arr' : 'obj'}`);
    return w;
  }
  const lk = new Set(Object.keys(live));
  const fk = new Set(Object.keys(fresh));
  for (const k of Object.keys(live)) {
    const p = `${prefix}.${k}`;
    if (!fk.has(k)) { w.liveOnly.push(p); continue; }
    const sub = deepWash(live[k], fresh[k], p);
    w.liveOnly.push(...sub.liveOnly); w.freshOnly.push(...sub.freshOnly); w.drift.push(...sub.drift);
  }
  for (const k of Object.keys(fresh)) if (!lk.has(k)) w.freshOnly.push(`${prefix}.${k}`);
  return w;
}
const washEmpty = (v) => !v.liveOnly.length && !v.freshOnly.length && !v.drift.length;
function washReport(v) {
  console.error('  物证：');
  if (v.liveOnly.length) console.error(`    [live-only] 现库独有 ${v.liveOnly.length} 处（重产缺=提取器退化/洗库面）: ${v.liveOnly.slice(0, 6).join(', ')}`);
  if (v.freshOnly.length) console.error(`    [fresh-only] 重产独有 ${v.freshOnly.length} 处（现库缺=源侧新增/现库退化）: ${v.freshOnly.slice(0, 6).join(', ')}`);
  if (v.drift.length) console.error(`    [drift] 值漂移 ${v.drift.length}: ${v.drift.slice(0, 6).join(' | ')}`);
}
const json = JSON.stringify(out);
let live = null;
if (existsSync(LIVE_JSON)) { try { live = JSON.parse(readFileSync(LIVE_JSON, 'utf8')); } catch { /* 坏损:不拦（npcdrops 同款） */ } }
const wash = live === null ? null : deepWash(live, JSON.parse(json));
if (OUT_JSON) {
  if (WRITE_REAL && wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error('[extract-itemsorting] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, json);
  console.error(`[extract-itemsorting] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-itemsorting] 干跑（零写盘）：现库缺 vanilla-itemsorting.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-itemsorting] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error('[extract-itemsorting] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
}

// ---------- 摘要 ----------
const counts = {};
for (let id = 0; id < ITEM_COUNT; id++) { const L = layerIndex[id]; counts[L] = (counts[L] ?? 0) + 1; }
const names = ['WeaponsMelee', 'WeaponsRanged', 'WeaponsMagic', 'WeaponsMinions', 'WeaponsAssorted', 'WeaponsAmmo',
  'ToolsPicksaws', 'ToolsHamaxes', 'ToolsPickaxes', 'ToolsAxes', 'ToolsHammers', 'ToolsTerraforming', 'ToolsFishing',
  'ToolsGolf', 'ToolsInstruments', 'ToolsKeys', 'ToolsKites', 'ToolsAmmoLeftovers', 'ToolsMisc', 'ArmorCombat',
  'ArmorVanity', 'ArmorAccessories', 'EquipGrapple', 'EquipMount', 'EquipCart', 'EquipLightPet', 'EquipVanityPet',
  'PotionsDyes', 'PotionsHairDyes', 'PotionsLife', 'PotionsJustTheMushroom', 'PotionsMana', 'PotionsElixirs',
  'PotionsBuffs', 'PotionsFood', 'MiscValuables', 'MiscPainting', 'MiscWiring', 'MiscMaterials',
  'MiscJustTheGlowingMushroom', 'MiscRopes', 'MiscHerbsAndSeeds', 'MiscAcorns', 'MiscGems',
  'MiscBossBags', 'MiscCritters', 'MiscExtractinator', 'LastMaterials', 'LastTilesImportant', 'LastTilesCommon', 'LastNotTrash', 'LastTrash'];
console.log('=== 分层计数（1457） ===');
for (let L = 0; L < 52; L++) console.log(`${String(L).padStart(2)} ${names[L].padEnd(26)} ${counts[L] ?? 0}`);
// （旧"与旧版全量 diff"死码块已由 ★BJ298 era guard 干跑对拍闸取代——见文末 deepWash）
console.log('spot checks:',
  '1(IronPickaxe→', out.layers['1'], ')',
  '4(IronBroadsword→', out.layers['4'], ')',
  '71(CopperCoin→', out.layers['71'], ')',
  '2(DirtBlock→', out.layers['2'], ')',
  '23(Gel→', out.layers['23'], ')',
  '27(Acorn→', out.layers['27'], ')',
  '8(Torch→', out.layers['8'], ')',
  '149(Anvil?→', out.layers['149'], ')',
  '6147(GiantTiki→', out.layers['6147'], ')',
  '905(MoneyTrough→', out.layers['905'], ')');
console.log('json size:', Math.round(JSON.stringify(out).length / 1024), 'KiB');
