// ItemDropDatabase 结构化规则提取器（tools/extract-npcdrops.mjs）
// 输入 Terarria${VER}/Terraria.GameContent.ItemDropRules/ItemDropDatabase.cs
// 输出 src/data/vanilla-npcdrops.json：按注册顺序的条目列表（RuleNode 类型树）
// + src/data/vanilla-npcvalue.json：NPC.value（铜币，击杀掉钱管线用）
//
// RuleNode kinds:
//   common {item,denom,min,max,num?,noLuck?}  rerolls {item,denom,min,max,rerolls,num?}
//   cond {cond,item,denom,min,max,num}        oneOf {denom,num,ids,noLuck?}
//   expert {normal,expert}                    master {def,master}   masterExpert {def,expert,master}
//   bossBag {item,cond?}                      masterCommon {item}   masterAll {item,denom}
//   local {item,denom,min,max,cond?}          perPlayer {item,denom,min,max,cond?}
//   gate {cond, chain}                        nothing
//   oneOfRules {denom,rules}                  noRepeat {count,ids}
//   dropOneByOne {item,params}                slimeBody        mechSpawn
//   statueMimic (未知内容记 unknown)
// chain: [{on:'failedRoll'|'success'|'failedConditions', rule}]
//
// ★BJ261 2026-09-22 重锚 1457 + era guard 落闸（四要素习语见 docs/era-guard-family.md）：
//   本提取器原为 1456 硬锚 + apply1457DropPatches 补丁重放 1457 差异（12 处）；BJ261
//   直接解析 Terarria1457 源码（ItemDropDatabase.cs 与 1458 逐字节全等，md5 cdc9c108；
//   NPC.cs SetDefaults/SetDefaultsFromNetId 两读域 1457↔1458 逐字节全等；SlimeBodyItemDropRule.cs
//   三版全等），补丁整体退役，改由「12 处 1457 注册锚 fail-loud + 基数护栏 + 干跑对拍」承载
//   同等判别力。1456→1457 ItemDropDatabase.cs 全量 diff=12 处（diff 实测 41 行，与旧补丁
//   ①-⑫ 一一对应）：629 硬模双池+6172(:236-237)/冰模仿怪池 8 选(:246-247)/245 石巨人 6158
//   1/6(:653)/370 猪鲨双池+3291(:669-670)/删 YoyosKraken 3291 全局(:795)/395 火星飞碟 6173
//   1/50(:925)/483·482 6167 1/80(:932)/475 池+6168(:989)/528·529 6157 1/40(:1032)/18 群
//   1/200→1/100(:1033)/393 群 1/100→1/50(:1036)/179·83 6159 1/25(:1058)。
//   ★同刀勘误①：callRule 'ScalingWithOnlyBadLuck'（:179 4271，53/536 蓝史莱姆明胶）原坍缩成
//     普通 common（noLuck:false）——正运玩家白吃加成；现补 onlyBadLuck:1 标记（消费面
//     NpcDrops.ts:432 R14-A1 语义已在），newRule 'CommonDropScalingWithOnlyBadLuck' 同修
//     （原误标 noLuck:true=整条不吃运；1457 无直接调用点，纯前瞻归一）。
//   ★同刀勘误②（活库对账逐值定谳，反编译为准）：vanilla-npcvalue.json 系 BJ174 前旧
//     正则产物——589(高尔夫球手营救) 的 value=60 系旧「定窗分段」把相邻 590/591 块的
//     value=60f 渗漏进来（1456/1457 的 type==589 块均无 value 赋值=缺省 0）；590/591
//     (TorchZombie/ArmedTorchZombie) 真值 60 反而整缺（旧 mark 正则漏 || 组）；455-458
//     同族漏组（真值 0f，缺失≡0 纯形状差）。--write-real 定谳后四组已对齐。
//
// ★BJ283 双产同库险面注记（BJ261 勘误② 的债源补全）：vanilla-npcvalue.json 曾有两个
//   生产者——本器（buyPrice/SetShopValues 形态,:764 注,守卫通道承载）与
//   tools/extract-npcvalue.mjs（旧补漏脚本:硬锚 1456、无 era guard、缺省直写现库,
//   「已有键不覆盖」= 只增不改的并集语义）。双器口径不同（旧器 else-if 链正则 vs 本器
//   结构化解析）,交叉运行=覆盖面互相渗透+版本锚漂移（旧器 1456 行号锚）。★处置落定：
//   旧器已退役删除（并行车道 2026-09-22,git D 态）——npcvalue 值域修正自此单源走本器
//   守卫通道定谳;本注存档双产险面以防同名/同域新器复活。
//
// ★era guard 四要素：
//   ① SW_ITEM_VER 缺省 1457（白名单 {1457,1458}，1456 锚集退役显式拒+指引；对应反编译
//     目录不存在也拒）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（重产 vs 现库双向动态 diff——live-only=洗库
//     预警/fresh-only=现库退化缺键型，任一非空 exit 1+物证清单）/ SW_OUT=<dir>=沙箱（两
//     产物落 <dir>/）/ --write-real=写真库（且 diff 非纯增量时拒，强推须 --force-full
//     --overwrite-append-era 双旗）；SW_OUT 与 --write-real 双旗互斥；SW_ITEM_VER≠1457
//     禁写真库；探测注入面 SW_NPCDROPS_JSON/SW_NPCVALUE_JSON（读侧现库重定向）与
//     --write-real 混用拒（g1 footgun）;
//   ③ 锚 fail-loud：12 处 1457 注册锚源码文本硬校验/POOL_METHODS 池字面量回读校验/
//     SetDefaults·SetDefaultsFromNetId·SlimeBody switch 签名/entries·values·slimeBody
//     基数护栏，失配 throw 报错退出（禁止静默空扫吃缺省）;
//   ④ 判别力自证：tests/extract-npcdrops-era-guard.test.ts（变异：摘干跑门=静默写库；
//     毒化锚=exit 1；摘 fresh-only 轴=删源注册恒绿复现）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}/Terarria${VER}/Terraria/NPC.cs`)) {
  console.error(`[extract-npcdrops] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已随 BJ261 重锚退役（apply1457DropPatches 补丁面整体移除）；1456 对拍读 BJ261 定谳或 /tmp 时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-npcdrops] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  console.error('  处置：沙箱对拍用 SW_OUT=<dir>；确认定谳后更新现库用 --write-real（且 SW_ITEM_VER=1457）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-npcdrops] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 game/src/data/vanilla-npcdrops.json / vanilla-npcvalue.json）。`);
  console.error('  处置：重放对拍请走 SW_OUT 沙箱；确要回写 1457 终值请去掉 SW_ITEM_VER 显式注入（缺省即 1457）。');
  process.exit(1);
}
// ★g1 footgun（bossbags 同款）：探测注入面（SW_NPCDROPS_JSON/SW_NPCVALUE_JSON，读侧现库
//   重定向）与 --write-real 混用 = 读夹具对拍、写真实现库——探测与写盘分离=守卫被绕过洗库面。
if (WRITE_REAL && (process.env.SW_NPCDROPS_JSON !== undefined || process.env.SW_NPCVALUE_JSON !== undefined)) {
  console.error('[extract-npcdrops] 拒绝运行：探测注入面（SW_NPCDROPS_JSON/SW_NPCVALUE_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  console.error('  处置：对拍用探测 env（零写盘干跑）或 SW_OUT 沙箱；更新现库须清掉探测 env 再 --write-real。');
  process.exit(1);
}
const LIVE_DROPS_JSON = process.env.SW_NPCDROPS_JSON ?? `${ROOT}/game/src/data/vanilla-npcdrops.json`;
const LIVE_VALUE_JSON = process.env.SW_NPCVALUE_JSON ?? `${ROOT}/game/src/data/vanilla-npcvalue.json`;
// ★M1 变异锚:干跑臂 null（守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面）
const OUT_DROPS_JSON = WRITE_REAL ? LIVE_DROPS_JSON
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-npcdrops.json` : null);
const OUT_VALUE_JSON = WRITE_REAL ? LIVE_VALUE_JSON
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-npcvalue.json` : null);

const DB = readFileSync(`${ROOT}/Terarria${VER}/Terraria.GameContent.ItemDropRules/ItemDropDatabase.cs`, 'utf8');
const npcCs = readFileSync(`${ROOT}/Terarria${VER}/Terraria/NPC.cs`, 'utf8');

// ============ 表达式解析（嵌套调用/对象初始化器/new/数字/标识符/链式调用） ============
function parseExpr(src, pos = 0) {
  const node = parsePostfix(src, pos);
  return node;
}
// 解析一个"基本表达式" + 之后的链式 .X(...) 序列
function parsePostfix(src, pos) {
  let base = parseAtom(src, pos);
  for (;;) {
    skipWs(src, base.end);
    if (src[base.end] === '.') {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(base.end + 1));
      if (!m) break;
      const name = m[0];
      let p = base.end + 1 + name.length;
      skipWs(src, p);
      const args = [];
      if (src[p] === '(') {
        const r = parseArgs(src, p);
        args.push(...r.args); p = r.end;
      }
      base = { t: 'call', fn: name, args: args.length ? [base, ...args] : [base], base: true, end: p };
      continue;
    }
    break;
  }
  return base;
}
function skipWs(src, p) { while (p < src.length && /\s/.test(src[p])) p++; return p; }
function parseArgs(src, openParen) {
  // src[openParen] === '('
  let p = openParen + 1;
  const args = [];
  for (;;) {
    p = skipWs(src, p);
    if (src[p] === ')') { p++; break; }
    // 命名参数 hideLootReport: true → 跳过名: 取值
    const named = /^[A-Za-z_][A-Za-z0-9_]*\s*:/.exec(src.slice(p, p + 40));
    if (named) p += named[0].length, p = skipWs(src, p);
    const arg = parsePostfix(src, p);
    args.push(arg);
    p = skipWs(src, arg.end);
    if (src[p] === ',') { p++; continue; }
    if (src[p] === ')') { p++; break; }
    break; // 异常 → 上层兜底
  }
  return { args, end: p };
}
function parseAtom(src, pos) {
  let p = skipWs(src, pos);
  if (src[p] === '(') {
    const r = parseArgs(src, p);
    return { t: 'paren', inner: r.args[0], end: r.end };
  }
  // 字符串字面量（NamedNPC("GuideNames.Andrew") 的具名键）
  if (src[p] === '"') {
    let q = p + 1, out = '';
    while (q < src.length && src[q] !== '"') { if (src[q] === '\\') { out += src[q]; q++; } out += src[q]; q++; }
    return { t: 'str', v: out, end: q + 1 };
  }
  // 直接函数调用（含限定名 A.B.C(args)）：点号段并入名字，'(' 跟随 → call
  const idm = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(p));
  if (idm) {
    const name = idm[0];
    const lastSeg = name.slice(name.lastIndexOf('.') + 1);
    const after = skipWs(src, p + name.length);
    if (src[after] === '(' && !CHAIN_FN[lastSeg]) {
      const r = parseArgs(src, after);
      return { t: 'call', fn: name, args: r.args, end: r.end };
    }
    // 链式调用语句头（rule.OnSuccess(...)）：idm 贪婪吃掉了 '.OnSuccess' 段，
    // 截断到点号前只返回主体名，让 parsePostfix 的 '.' 循环建出 call(base) 结构
    // ——否则返回 {t:'id', name:'rule.OnSuccess'}，外层 expr.t!=='call' 链体整体丢失
    if (src[after] === '(' && CHAIN_FN[lastSeg] && name.includes('.')) {
      const cut = name.lastIndexOf('.');
      return { t: 'id', name: name.slice(0, cut), end: p + cut };
    }
  }
  if (src[p] === 'n' && src.startsWith('new ', p)) {
    p = skipWs(src, p + 4);
    const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(p));
    const cls = m[0]; p += cls.length;
    p = skipWs(src, p);
    // 泛型参数 <T,…>（List<IItemDropRule>）：成对消耗到 '>'
    if (src[p] === '<') {
      let depth = 0;
      while (p < src.length) { if (src[p] === '<') depth++; else if (src[p] === '>') { depth--; p++; if (!depth) break; } p++; }
      p = skipWs(src, p);
    }
    let args = [], init = null;
    if (src[p] === '(') { const r = parseArgs(src, p); args = r.args; p = r.end; p = skipWs(src, p); }
    // 数组尺寸 [N]（int[3] {…}）—先消耗再找 {
    const sizeM = /^\[\d*\]/.exec(src.slice(p));
    if (sizeM) p += sizeM[0].length, p = skipWs(src, p);
    if (src[p] === '{') { // 数组 { a, b, c }
      p++;
      const items = [];
      for (;;) {
        p = skipWs(src, p);
        if (src[p] === '}') { p++; break; }
        const it = parsePostfix(src, p);
        items.push(it);
        p = skipWs(src, it.end);
        if (src[p] === ',') { p++; continue; }
        if (src[p] === '}') { p++; break; }
        break;
      }
      return { t: 'newarr', cls, items, end: p };
    }
    if (src[p] === '{') { // 对象初始化器 { Prop = N, ... }
      p++;
      const props = {};
      for (;;) {
        p = skipWs(src, p);
        if (src[p] === '}') { p++; break; }
        const pm = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(p));
        const prop = pm[0]; p += prop.length;
        p = skipWs(src, p);
        if (src[p] === '=') { p++; p = skipWs(src, p); }
        const v = parsePostfix(src, p);
        props[prop] = v;
        p = skipWs(src, v.end);
        if (src[p] === ',') { p++; continue; }
        if (src[p] === '}') { p++; break; }
        break;
      }
      return { t: 'newinit', cls, args, props, end: p };
    }
    return { t: 'new', cls, args, end: p };
  }
  const num = /^-?\d+(?:\.\d+)?f?/.exec(src.slice(p));
  if (num) return { t: 'num', v: parseFloat(num[0]), end: p + num[0].length };
  const cast = /^\(int\)/.exec(src.slice(p));
  if (cast) { p += cast[0].length; p = skipWs(src, p); }
  const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(p));
  if (id) return { t: 'id', name: id[0], end: p + id[0].length };
  return { t: 'bad', end: p + 1 };
}

// ============ AST → 类型化 RuleNode ============
const CHAIN_FN = { OnFailedRoll: 'failedRoll', OnSuccess: 'success', OnFailedConditions: 'failedConditions' };
const stats = { unknown: [], kinds: {}, conds: {} };

// 条件实参：数字取值；字符串去 "GuideNames." 式语言键前缀取本地化值本身
// （NamedNPC 的 neededName 与 npc.GivenName 比对，lang 值即 Andrew/Whitney/Jim）
function condArg(n) {
  if (n?.t === 'num') return n.v;
  if (n?.t === 'str') return n.v.replace(/^[A-Za-z]+Names\./, '');
  return undefined;
}
function condOf(n) {
  // 条件节点 → {name, args}
  if (!n) return null;
  if (n.t === 'new') {
    const name = n.cls.replace('Conditions.', '');
    stats.conds[name] = (stats.conds[name] ?? 0) + 1;
    return { name, args: n.args.map(condArg) };
  }
  if (n.t === 'id') {
    // 条件变量（Conditions.NotExpert condition = new …）：查声明表
    const v = rules.get(n.name);
    if (v && v.k === '__cond') return v.cond;
    return { name: n.name, args: [] };
  }
  return null;
}
const fields = new Map();  // 类字段常量（_masterModeDropRng = 4）——方法边界不清空
function lit(n) {
  if (n?.t === 'num') return n.v;
  // 局部 int 变量（chanceDenominator = 9 之类作规则参数）：查声明表
  if (n?.t === 'id' && ints.has(n.name)) return ints.get(n.name);
  // 类字段常量（MasterModeDropOnAllPlayers(4960, _masterModeDropRng)）：
  // 方法级 ints 在 private void 边界被清空，类字段跨方法存活，必须单独一张表
  if (n?.t === 'id' && fields.has(n.name)) return fields.get(n.name);
  return undefined;
}
function commonArgs(a, defaults = [1, 1, 1]) {
  // lit 兼顾数字字面量与局部 int 变量（chanceDenominator = 9）
  const v = (i, d) => { const x = a[i]; const l = x ? lit(x) : undefined; return l !== undefined ? l : d; };
  return [v(0, defaults[0]), v(1, defaults[1]), v(2, defaults[2])];
}

function toRule(n) {
  if (!n) return { k: 'unknown', raw: String(n).slice(0, 80) };
  if (n.t === 'call' && !n.base) return callRule(n);
  if (n.t === 'call' && n.base) {
    // 链式：主体规则 + .OnXxx(...)（多级链宿主逐级传递，见 applyChainLinks）
    const base = toRule(n.args[0]);
    applyChainLinks(base, n, false);
    return base;
  }
  if (n.t === 'new') return newRule(n);
  if (n.t === 'newarr') return { k: 'listRef', rules: n.items.map(toRule) };  // List<IItemDropRule>{…}
  if (n.t === 'id') return { k: 'varRef', name: n.name };
  if (n.t === 'paren') return toRule(n.inner);
  stats.unknown.push(render(n));
  return { k: 'unknown', raw: render(n) };
}
// 链式调用是嵌套的：postfix 把 a.OnX(b) 解析成 call(fn='OnX', args=[postfix(a), b])
// 宿主语义（Chains.cs:93-110）：host.OnX(A) 把链挂到 host 并【返回 A】——
// host.OnSuccess(A).OnFailedRoll(B) = host.chain[success A] + A.chain[failedRoll B]，
// 不是平铺挂 host（平铺会让 B 错误地以 host 的状态门控）
function applyChainLinks(host, n, resolve = false) {
  if (n.t !== 'call' || !n.base) return host;
  const inner = applyChainLinks(host, n.args[0], resolve);   // 更内层（更早）的链先挂
  let linked = n.args[1] ? toRule(n.args[1]) : null;
  if (resolve && linked) linked = linked.k === 'varRef'
    ? (rules.get(linked.name) ?? { k: 'unknown', raw: `var:${linked.name}` })  // 原实例直挂（语句级，emit 已过）
    : resolveRule(linked);
  if (linked) {
    inner.chain = inner.chain ?? [];
    inner.chain.push({ on: CHAIN_FN[n.fn] ?? 'success', rule: linked });
  }
  return linked;   // 下一层链宿主 = 本层 rule
}
function render(n) {
  if (!n) return '?';
  if (n.t === 'num') return String(n.v);
  if (n.t === 'id') return n.name;
  if (n.t === 'new') return `new ${n.cls}(${n.args.map(render).join(',')})`;
  if (n.t === 'newinit') return `new ${n.cls}{...}`;
  if (n.t === 'newarr') return `new []{${n.items.map(render).join(',')}}`;
  if (n.t === 'call') return n.base ? `${render(n.args[0])}.${n.fn}(${n.args.slice(1).map(render).join(',')})` : `${n.fn}(${n.args.map(render).join(',')})`;
  if (n.t === 'paren') return `(${render(n.inner)})`;
  return '?';
}

// ============ 已知池方法 → id 列表（方法体不参与规则流解析，按原文件原文备案） ============
// OneFromOptions(1, RegisterIceMimic_GetEasyModeItemPool(isRemix: true)) 这类把池工厂方法
// 当实参的写法，lit() 解析不出（→ ids:[] 假绿）。池内容一律照抄 ItemDropDatabase.cs 原文。
const POOL_METHODS = {
  // 1457 :244-251：int[8]{670,724,950,6153,0,987,1579,6172}，obj[4] = isRemix ? 725 : 1319
  // （1456 是 6 选 int[]{670,724,950,0,987,1579}+obj[3]——蓝队 R2-10：曾照抄 1456 形
  //  漏 6153 GlacierFang/6172 HeavySling，肉前池 6 选≠原版 8 选）
  RegisterIceMimic_GetEasyModeItemPool: (args) => {
    const isRemix = boolArg(args[0]);
    return [670, 724, 950, 6153, isRemix ? 725 : 1319, 987, 1579, 6172];
  },
};
function boolArg(n) {
  if (n?.t === 'id') return n.name === 'true' ? true : n.name === 'false' ? false : undefined;
  return undefined;
}
/** oneOf 类规则的 id 实参批量取值：数字/local int/类字段进 ids；已知池方法展开进 ids；
 *  其余无法解析的表达式 → _unresolved 备案（禁止静默丢成空数组——运行时 rng.int(0,-1) 出 undefined） */
function idsFromArgs(args) {
  const ids = [];
  const unresolved = [];
  for (const arg of args) {
    const v = lit(arg);
    if (v !== undefined) { ids.push(v); continue; }
    if (arg?.t === 'id' && arrays.has(arg.name)) { ids.push(...arrays.get(arg.name)); continue; }
    if (arg?.t === 'call' && !arg.base && POOL_METHODS[arg.fn]) {
      ids.push(...POOL_METHODS[arg.fn](arg.args));
      continue;
    }
    if (arg && arg.t !== 'bad') unresolved.push(render(arg));
  }
  return { ids, unresolved };
}

function callRule(n) {
  const a = n.args;
  const fn = n.fn.includes('.') ? n.fn.slice(n.fn.lastIndexOf('.') + 1) : n.fn;  // ItemDropRule.Common → Common
  switch (fn) {
    case 'Common': { const [d, mn, mx] = commonArgs(a.slice(1)); return { k: 'common', item: lit(a[0]), denom: d, min: mn, max: mx }; }
    case 'NotScalingWithLuck': case 'ScalingWithOnlyBadLuck': {
      const [d, mn, mx] = commonArgs(a.slice(1));
      // ★BJ261：ScalingWithOnlyBadLuck（CommonDropScalingWithOnlyBadLuck.cs:21-35 →
      //   Luck.RollOnlyBadLuck）≠普通 common——正运无加成/负运才进内掷。原坍缩成
      //   noLuck:false（=走 Luck.RollLuck，正运白吃加成）；补 onlyBadLuck:1 标记
      //   （消费面 NpcDrops.ts:432 R14-A1 语义）。noLuck:false 保留=现库形状逐键对齐。
      const out = { k: 'common', item: lit(a[0]), denom: d, min: mn, max: mx, noLuck: fn === 'NotScalingWithLuck' };
      if (fn === 'ScalingWithOnlyBadLuck') out.onlyBadLuck = 1;
      return out;
    }
    case 'WithRerolls': { // (item, rerolls, denom=1, min=1, max=1)
      const [d, mn, mx] = commonArgs(a.slice(2));
      return { k: 'rerolls', item: lit(a[0]), denom: d, min: mn, max: mx, rerolls: lit(a[1]) ?? 0 };
    }
    case 'ByCondition': { // (cond, item, denom=1, min=1, max=1, num=1)——ItemDropRule.cs:40
      // chanceNumerator 是第 6 参（a[5]）：曾误取 a[4]=maximumDropped（1130 → num=30 恒掉，
      // 应 num=3 即 75%，ItemDropDatabase.cs:551 Deerclops）
      const [d, mn, mx] = commonArgs(a.slice(2));
      return { k: 'cond', cond: condOf(a[0]), item: lit(a[1]), denom: d, min: mn, max: mx, num: lit(a[5]) ?? 1 };
    }
    case 'Food': { // (item, denom, min=1,max=1) 条件 NotFromStatue（我们恒真）
      const [mn, mx] = commonArgs(a.slice(2));
      return { k: 'cond', cond: { name: 'NotFromStatue', args: [] }, item: lit(a[0]), denom: lit(a[1]) ?? 1, min: mn, max: mx, num: 1 };
    }
    case 'OneFromOptions': case 'OneFromOptionsWithNumerator':
    case 'OneFromOptionsNotScalingWithLuck': case 'OneFromOptionsNotScalingWithLuckWithX': {
      const num = fn.includes('WithNumerator') || fn.endsWith('WithX') ? lit(a[1]) ?? 1 : 1;
      const idsFrom = fn.includes('WithNumerator') || fn.endsWith('WithX') ? 2 : 1;
      const { ids, unresolved } = idsFromArgs(a.slice(idsFrom));
      const out = { k: 'oneOf', denom: lit(a[0]) ?? 1, num, ids, noLuck: fn.includes('NotScaling') };
      if (unresolved.length) out._unresolved = unresolved.join('; ');
      return out;
    }
    case 'ExpertGetsRerolls': // (item, denom, expertRerolls)
      return { k: 'expert', normal: { k: 'rerolls', item: lit(a[0]), denom: lit(a[1]), min: 1, max: 1, rerolls: 0 }, expert: { k: 'rerolls', item: lit(a[0]), denom: lit(a[1]), min: 1, max: 1, rerolls: lit(a[2]) ?? 0 } };
    case 'NormalvsExpert': case 'NormalvsExpertNotScalingWithLuck':
      return { k: 'expert', normal: { k: 'common', item: lit(a[0]), denom: lit(a[1]), min: 1, max: 1, noLuck: fn.includes('Not') }, expert: { k: 'common', item: lit(a[0]), denom: lit(a[2]), min: 1, max: 1, noLuck: fn.includes('Not') } };
    case 'NormalvsExpertOneFromOptions': case 'NormalvsExpertOneFromOptionsNotScalingWithLuck': {
      const { ids, unresolved } = idsFromArgs(a.slice(3));
      const noLuck = fn.includes('NotScaling');
      const out = { k: 'expert',
        normal: { k: 'oneOf', denom: lit(a[1]), num: 1, ids, noLuck },
        expert: { k: 'oneOf', denom: lit(a[2]), num: 1, ids, noLuck } };
      if (unresolved.length) out._unresolved = unresolved.join('; ');
      return out;
    }
    case 'BossBag': return { k: 'bossBag', item: lit(a[0]) };
    case 'BossBagByCondition': return { k: 'bossBag', item: lit(a[1]), cond: condOf(a[0]) };
    case 'MasterModeCommonDrop': return { k: 'masterCommon', item: lit(a[0]) };
    case 'MasterModeDropOnAllPlayers': return { k: 'masterAll', item: lit(a[0]), denom: lit(a[1]) ?? 1 };
    case 'DropNothing': return { k: 'nothing' };
    case 'Gel': { // (denom=1,min=1,max=1) 物品恒 23
      const [d, mn, mx] = commonArgs(a);
      return { k: 'common', item: 23, denom: d, min: mn, max: mx, gel: true };
    }
    case 'StatusImmunityItem': // = ExpertGetsRerolls(item, x, 1)
      return { k: 'expert', normal: { k: 'rerolls', item: lit(a[0]), denom: lit(a[1]), min: 1, max: 1, rerolls: 0 }, expert: { k: 'rerolls', item: lit(a[0]), denom: lit(a[1]), min: 1, max: 1, rerolls: 1 } };
    default:
      stats.unknown.push(`call:${fn}`);
      return { k: 'unknown', raw: render(n) };
  }
}
function newRule(n) {
  const a = n.args;
  switch (n.cls) {
    case 'LeadingConditionRule':
      return { k: 'gate', cond: condOf(a[0]) };
    case 'CommonDrop': { // (item, denom, min=1, max=1, num=1)
      const [d, mn, mx] = commonArgs(a.slice(1));
      return { k: 'common', item: lit(a[0]), denom: d, min: mn, max: mx, num: lit(a[4]) ?? 1 };
    }
    case 'CommonDropNotScalingWithLuck': case 'CommonDropScalingWithOnlyBadLuck': {
      const [d, mn, mx] = commonArgs(a.slice(1));
      // ★BJ261：OnlyBadLuck 变体原误标 noLuck:true（整条不吃运≠仅负运缩分母）；
      //   1457 DB 无直接调用点（0 处），纯前瞻归一——禁止把 onlyBadLuck 挂在 noLuck:true
      //   之后（消费面 noLuck 先短路会吞掉 OnlyBadLuck 语义）
      if (n.cls === 'CommonDropScalingWithOnlyBadLuck') {
        return { k: 'common', item: lit(a[0]), denom: d, min: mn, max: mx, onlyBadLuck: 1 };
      }
      return { k: 'common', item: lit(a[0]), denom: d, min: mn, max: mx, noLuck: true };
    }
    case 'CommonDropWithRerolls': { // (item, denom, min, max, rerolls)
      const [mn, mx] = commonArgs(a.slice(2));
      return { k: 'rerolls', item: lit(a[0]), denom: lit(a[1]), min: mn, max: mx, rerolls: lit(a[4]) ?? 0 };
    }
    case 'ItemDropWithConditionRule': { // (item, denom, min, max, cond, num=1)
      const [mn, mx] = commonArgs(a.slice(2));
      return { k: 'cond', cond: condOf(a[4]), item: lit(a[0]), denom: lit(a[1]), min: mn, max: mx, num: lit(a[5]) ?? 1 };
    }
    case 'OneFromOptionsDropRule': case 'OneFromOptionsNotScaledWithLuckDropRule': {
      const { ids, unresolved } = idsFromArgs(a.slice(2));
      const out = { k: 'oneOf', denom: lit(a[0]), num: lit(a[1]) ?? 1, ids, noLuck: n.cls.includes('Not') };
      if (unresolved.length) out._unresolved = unresolved.join('; ');
      return out;
    }
    case 'DropBasedOnExpertMode': return { k: 'expert', normal: toRule(a[0]), expert: toRule(a[1]) };
    case 'DropBasedOnMasterMode': return { k: 'master', def: toRule(a[0]), master: toRule(a[1]) };
    case 'DropBasedOnMasterAndExpertMode': return { k: 'masterExpert', def: toRule(a[0]), expert: toRule(a[1]), master: toRule(a[2]) };
    case 'DropNothing': return { k: 'nothing' };
    case 'DropLocalPerClientAndResetsNPCMoneyTo0':
      return { k: 'local', item: lit(a[0]), denom: lit(a[1]) ?? 1, min: lit(a[2]) ?? 1, max: lit(a[3]) ?? 1, cond: condOf(a[4]) };
    case 'DropPerPlayerOnThePlayer':
      return { k: 'perPlayer', item: lit(a[0]), denom: lit(a[1]) ?? 1, min: lit(a[2]) ?? 1, max: lit(a[3]) ?? 1, cond: condOf(a[4]) };
    case 'OneFromRulesRule': return { k: 'oneOfRules', denom: lit(a[0]) ?? 1, rules: a.slice(1).map(toRule) };
    case 'FromOptionsWithoutRepeatsDropRule': return { k: 'noRepeat', count: lit(a[0]) ?? 1, ids: a.slice(1).map(lit).filter(v => v !== undefined) };
    case 'DropOneByOne': return { k: 'dropOneByOne', item: lit(a[0]), params: a[1] };
    case 'SlimeBodyItemDropRule': return { k: 'slimeBody' };
    case 'MechBossSpawnersDropRule': return { k: 'mechSpawn' };
    case 'StatueMimicItemDropRule': return { k: 'statueMimic' };
    default:
      stats.unknown.push(`new:${n.cls}`);
      return { k: 'unknown', raw: render(n) };
  }
}

// ============ 语句级处理（变量跟踪 + 注册调用） ============
const entries = [];   // {npcs:[], rule, global?:true}
const rules = new Map();    // 局部规则变量
const ints = new Map();     // 局部 int 变量
const arrays = new Map();   // int[] 变量
const paramss = new Map();  // DropOneByOne.Parameters 变量
let methodLine = -1;        // 方法边界（进入新 private void 清空局部变量）

// DropOneByOne 参数结构体语义（值拷贝）：对象 + 变更即克隆
function paramsObj(n) {
  // n: newinit DropOneByOne.Parameters {props} 或 varRef
  const base = { ChanceNumerator: 1, ChanceDenominator: 1, MinimumItemDropsCount: 1, MaximumItemDropsCount: 1, MinimumStackPerChunkBase: 1, MaximumStackPerChunkBase: 1, BonusMinDropsPerChunkPerPlayer: 0, BonusMaxDropsPerChunkPerPlayer: 0 };
  const fill = (node) => {
    if (!node) return;
    if (node.t === 'newinit') for (const [p, v] of Object.entries(node.props ?? {})) base[p] = lit(v) ?? base[p];
    if (node.t === 'paren') fill(node.inner);
  };
  fill(n);
  return base;
}
function resolveRule(node) {
  // varRef 解引用 + 参数对象实化
  const walk = (r) => {
    if (!r || typeof r !== 'object') return r;
    if (r.k === 'varRef') return walk(rules.get(r.name) ?? { k: 'unknown', raw: `var:${r.name}` });
    for (const key of Object.keys(r)) {
      if (key === 'chain') { r[key] = r[key].map(c => ({ ...c, rule: walk(c.rule) })); continue; }
      const v = r[key];
      if (v && typeof v === 'object' && !Array.isArray(v) && v.k) r[key] = walk({ ...v });
      else if (Array.isArray(v)) r[key] = v.map(x => (x && typeof x === 'object' && x.k ? walk({ ...x }) : x));
    }
    return r;
  };
  const out = walk({ ...node });
  // 参数对象实化（dropOneByOne.params / oneOfRules 内不含）
  if (out.k === 'dropOneByOne') {
    const pn = out.params;
    out.params = pn?.t === 'id' ? (paramss.get(pn.name) ?? null)
      : pn?.t === 'paren' ? paramsObj(pn.inner) : paramsObj(pn);
  }
  return out;
}
function emit(npcs, ruleNode, global = false) {
  const rule = resolveRule(ruleNode);
  if (rule?.k) stats.kinds[rule.k] = (stats.kinds[rule.k] ?? 0) + 1;
  entries.push(global ? { global: true, rule } : { npcs, rule });
  return rule;  // 返回 resolve 后的实例：语句级挂链（emit 之后的 var.OnXxx）必须改这份
}
/** 注册语句尾部的 .OnXxx(...) 链挂到规则上——宿主逐级传递（同 applyChainLinks 语义） */
function attachChains(rule, layers) {
  let host = rule;
  for (const layer of layers) {
    if (!host || host.k === 'unknown') return;
    const linked = toRule(layer.args[1]);
    host.chain = host.chain ?? [];
    host.chain.push({ on: CHAIN_FN[layer.fn] ?? 'success', rule: linked });
    host = linked;
  }
}
/** 剥掉 .OnXxx 链得到最内层调用（不转译） */
function stripChains(expr) {
  let n = expr;
  while (n.t === 'call' && n.base) n = n.args[0];
  return n;
}
/** 条件变量引用（条件声明语句的 RHS 是 new Conditions.X()） */
function condOfVar(n) {
  if (n?.t === 'new') return { name: n.cls.replace('Conditions.', ''), args: [] };
  return null;
}
// 已 emit 条目的活动引用（rule = RegisterTo... 时记录，供后续 rule.OnSuccess 挂链）
const emittedRefs = new Map();

/**
 * 统一注册处理。expr = 完整 postfix（可含链），rootCall = 剥链后的注册调用，
 * refVar = 可选的变量名（IItemDropRule rule = RegisterTo...(…) 时记录活动引用，
 * 之后的 rule.OnSuccess(...) 语句直接挂到已 emit 的规则上）
 */
/**
 * 注册 arg 是规则变量（RegisterToNPC(type, leadingConditionRule).OnSuccess(...)）时，
 * attachChains 必须挂到变量背后的真实规则对象——resolveRule 对 varRef 返回 rules 里
 * 的【同一实例】，故挂它即可见；挂 varRef 包装器会被 resolve 丢弃（女皇 636 两链全丢的根因）
 */
function chainHost(r) {
  return r && r.k === 'varRef' && rules.has(r.name) ? rules.get(r.name) : r;
}
function handleRegistration(s, expr, rootCall, refVar) {
  const reg = rootCall.fn;
  const a = rootCall.args;
  // 链（expr 与 rootCall 之间的层，AST 节点按出现顺序）
  const layers = [];
  if (expr !== rootCall) {
    let n = expr;
    while (n !== rootCall) { layers.unshift(n); n = n.args[0]; }
  }
  if (reg === 'RegisterToGlobal') {
    const r = toRule(a[0]);
    if (layers.length) attachChains(chainHost(r), layers);
    const resolved = emit([], r, true);
    if (refVar) { emittedRefs.set(refVar, { rule: resolved, entry: null }); rules.set(refVar, resolved); }
    return;
  }
  if (reg === 'RegisterToNPC') {
    let id = null;
    if (a[0].t === 'num') id = [a[0].v];
    else if (a[0].t === 'id' && ints.has(a[0].name)) id = [ints.get(a[0].name)];
    if (id == null) return;  // npcNetIds[i] 变体拷贝辅助
    const r = toRule(a[1]);
    if (layers.length) attachChains(chainHost(r), layers);
    const resolved = emit(id, r);
    if (refVar) { emittedRefs.set(refVar, { rule: resolved, entry: entries[entries.length - 1] }); rules.set(refVar, resolved); }
    return;
  }
  // Multiple 系
  const rule = toRule(a[0]);
  if (layers.length) attachChains(chainHost(rule), layers);
  const ids = [];
  for (const arg of a.slice(1)) {
    if (arg.t === 'num') ids.push(arg.v);
    else if (arg.t === 'id' && arrays.has(arg.name)) ids.push(...arrays.get(arg.name));
    else if (arg.t === 'newarr') ids.push(...arg.items.map(x => lit(x)).filter(v => v !== undefined));
  }
  if (ids.length) {
    const resolved = emit(ids, rule);
    if (refVar) { emittedRefs.set(refVar, { rule: resolved, entry: entries[entries.length - 1] }); rules.set(refVar, resolved); }
  }
  else stats.unknown.push(`regids:${render(a[0])}`);
}

// 按行扫描 + 语句累积（多行语句拼到分号）
let buf = '';
const flushStmt = (stmt) => {
  const s = stmt.trim();
  if (!s) return;
  // 方法边界
  const mm = /^\s*private void ([A-Za-z0-9_]+)\(\)/.exec(stmt);
  if (mm) { rules.clear(); ints.clear(); arrays.clear(); paramss.clear(); emittedRefs.clear(); return; }
  // 类字段常量（private int _masterModeDropRng = 4; :15）→ fields 表，lit() 引用回填。
  // 非锚定 + 行首匹配：类声明行的 `{` 不是语句边界（buf 尾无 ')'），首个字段语句会粘在
  // "public class …\n{" 之后，^\s* 锚定会漏；方法级 ints 在 private void 边界被清空，
  // 类字段必须单独一张跨方法存活的表
  const fm = /(?:^|\n)\s*(?:private|public|internal|protected)\s+(?:static\s+|readonly\s+|const\s+)*[\w.<>?\[\]]+\s+([A-Za-z_]\w*)\s*=\s*(-?\d+)\s*;/.exec(stmt);
  if (fm) { fields.set(fm[1], parseInt(fm[2], 10)); return; }
  try {
    // 数组声明
    let m = /^(?:\w+\[\]|\w+)\s+(\w+)\s*=\s*new\s+\w+\[\d*\]\s*\{/.exec(s) ;
    if (m) {
      const ni = s.indexOf('new');   // 从 'new int[3] {…}' 的 new 起解析（从 '{' 起会得 bad 节点 → 空数组）
      const expr = parseExpr(s, ni >= 0 ? ni : s.indexOf('{'));
      if (expr.t === 'newarr') arrays.set(m[1], expr.items.map(x => lit(x)).filter(v => v !== undefined));
      return;
    }
    // 无初始化器空数组（int[] options = new int[0]; :1191）→ 池在原版即为空
    // （OneFromOptions(8, options)，且整体挂在 NeverTrue 门后）。不捕获会被
    // idsFromArgs 误报 _unresolved
    m = /^(?:\w+\[\]|\w+)\s+(\w+)\s*=\s*new\s+\w+\[\d*\]\s*;/.exec(s);
    if (m) { arrays.set(m[1], []); return; }
    // int/short 声明（Boss helper 的 short type = 127 等）
    m = /^(?:int|short|long)\s+(\w+)\s*=\s*(-?\d+)/.exec(s);
    if (m) { ints.set(m[1], parseInt(m[2], 10)); return; }
    // Parameters 声明
    m = /^DropOneByOne\.Parameters\s+(\w+)\s*=/.exec(s);
    if (m) {
      const expr = parseExpr(s, s.indexOf('=') + 1);
      paramss.set(m[1], paramsObj(expr));
      return;
    }
    // Parameters 拷贝+变更：p2 = p; p2.Prop = N;
    m = /^DropOneByOne\.Parameters\s+(\w+)\s*=\s*(\w+)\s*;/.exec(s);
    if (m) { const src = paramss.get(m[2]); if (src) paramss.set(m[1], { ...src }); return; }
    m = /^(\w+)\.(ChanceNumerator|ChanceDenominator|MinimumItemDropsCount|MaximumItemDropsCount|MinimumStackPerChunkBase|MaximumStackPerChunkBase|BonusMinDropsPerChunkPerPlayer|BonusMaxDropsPerChunkPerPlayer)\s*=\s*(?:\(int\))?\s*([\d.]+)/.exec(s);
    if (m && paramss.has(m[1])) { const o = { ...paramss.get(m[1]) }; o[m[2]] = Math.round(parseFloat(m[3])); paramss.set(m[1], o); return; }
    // 规则/条件变量声明
    m = /^(?:IItemDropRule|IItemDropRuleCondition|LeadingConditionRule|List<IItemDropRule>|Conditions\.[A-Za-z_][A-Za-z0-9_]*)\s+(\w+)\s*=/.exec(s);
    if (m) {
      const rhs = s.slice(s.indexOf('=') + 1).replace(/;$/, '');
      const isCond = s.startsWith('IItemDropRuleCondition') || s.startsWith('Conditions.');
      const expr = parseExpr(rhs, 0);
      if (isCond) rules.set(m[1], { k: '__cond', cond: condOf(expr) ?? condOfVar(expr) });
      else {
        // RHS 是变量挂链（:202 rule2 = rule.OnSuccess(gate2)；:1192 rule = gate.OnSuccess(oneOf)）：
        // Chains 语义——host.chain 挂入被挂规则并【返回被挂规则】，故变量值 = 最后一层链的规则，
        // 后续 var.OnXxx(...) 挂到它身上（同一实例，宿主链数组内可见）。走通用 toRule 只会
        // 把链挂到 varRef 包装器上，从未 emit → 整条丢失
        if (expr.t === 'call' && expr.base && expr.args[0].t === 'id'
          && (rules.has(expr.args[0].name) || emittedRefs.has(expr.args[0].name))) {
          const ref0 = emittedRefs.get(expr.args[0].name);
          const host0 = ref0 ? ref0.rule : rules.get(expr.args[0].name);
          const last = applyChainLinks(host0, expr, true);
          if (last && last.k) rules.set(m[1], last);
          return;
        }
        // RHS 是注册调用（EoW 模式：rule = RegisterToMultipleNPCs(gate, ids)）：emit + 记活动引用
        const rootCall = stripChains(expr);
        if (rootCall.t === 'call' && rootCall.fn.startsWith('RegisterTo')) {
          handleRegistration(s, expr, rootCall, m[1]);
        } else {
          rules.set(m[1], toRule(expr));
        }
      }
      return;
    }
    // 变量上挂链 / Add：rule.OnSuccess(...) / rule2.OnFailedRoll(...)；
    // 变量可能是规则变量（rules）或已 emit 条目引用（emittedRefs，EoW 模式）
    m = /^(\w+)\.(OnSuccess|OnFailedRoll|OnFailedConditions)\(/.exec(s);
    if (m && (rules.has(m[1]) || emittedRefs.has(m[1]))) {
      const expr = parseExpr(s, s.indexOf(m[0]));
      // postfix 结构：call(fn=OnX, args=[varRef, rule])，可再套 .OnY(...)（如
      // .OnSuccess(Common(1871,15)).OnFailedRoll(OneFromOptions(...))）→ collectChain 收全部层
      if (expr.t === 'call' && expr.base) {
        const ref = emittedRefs.get(m[1]);
        const host = ref ? ref.rule : rules.get(m[1]);
        // 语句级挂链发生在 emit 之后（resolveRule 已跑过）→ resolve=true 补 varRef 解引用
        applyChainLinks(host, expr, true);
      }
      return;
    }
    // RemoveFromMultipleNPCs(entry, ids)：把 ids 从已 emit 条目的 npc 列表移除
    m = /^RemoveFromMultipleNPCs\((\w+),\s*(\w+)\)/.exec(s);
    if (m && emittedRefs.has(m[1])) {
      const ids = arrays.get(m[2]) ?? [];
      const entry = emittedRefs.get(m[1]).entry;
      if (entry) entry.npcs = entry.npcs.filter((n) => !ids.includes(n));
      return;
    }
    // 注册调用（含链式 .OnSuccess(...) 尾巴）：剥链到最内层注册调用
    for (const reg of ['RegisterToMultipleNPCsNotRemixSeed', 'RegisterToMultipleNPCsRemixSeed', 'RegisterToMultipleNPCs', 'RegisterToGlobal', 'RegisterToNPC']) {
      const idx = s.indexOf(reg + '(');
      if (idx !== 0 && !(idx > 0 && /\w/.test(s[idx - 1]) === false && idx <= 2)) continue;
      if (idx < 0) continue;
      const expr = parseExpr(s, idx);
      if (expr.t !== 'call') continue;
      const node = stripChains(expr);
      if (node.t !== 'call' || node.fn !== reg) continue;
      handleRegistration(s, expr, node, null);
      return;
    }
  } catch (e) {
    stats.unknown.push(`EXC:${s.slice(0, 70)} (${e.message})`);
  }
};

for (const line of DB.split('\n')) {
  const t = line.trim();
  if (/^(private void|public void) /.test(t)) flushStmt(t);
  // 类/方法体花括号行：语句边界。但多行数组初始化器 `int[] x = new int[18]` 后跟 `{`
  // 行不是边界——buf 尾是类型声明而非完整语句时继续累积
  if (t === '{' && /[)}]\s*$|^\s*$/.test(buf)) { flushStmt(buf); buf = ''; continue; }
  if (t === '}') { flushStmt(buf); buf = ''; continue; }
  buf += (buf ? '\n' : '') + line;
  // 对象初始化器语句未闭合时不 flush
  const opens = (buf.match(/{/g) ?? []).length, closes = (buf.match(/}/g) ?? []).length;
  if (t.endsWith(';') && opens === closes) { flushStmt(buf); buf = ''; }
}
flushStmt(buf);

// ============ NPC.value 提取（1456 NPC.cs SetDefaults :8361 起的 else-if 链首个 value = N） ============
const values = {};
{
  // SetDefaults 方法体（8361 起 → 下一个 public/private 方法前），链式 else if (type == N)
  const start = npcCs.indexOf('public void SetDefaults(int Type');
  // ★ 扫描必须限定在 SetDefaults 方法体内：旧版 slice(start) 扫到文件尾，SetDefaults
  //   之后的无关方法里同形 `if (type == N)` 会反向 clobber（1=25/134=120000/398=1000000
  //   曾被覆盖成 0 → 蓝史莱姆不掉钱、肉山后 Boss 掉钱丢失）
  const bodyRest = npcCs.slice(start + 10);
  const methodEnd = bodyRest.search(/\n\t(public|private|protected|internal) [A-Za-z]/);
  const body = npcCs.slice(start, start + 10 + (methodEnd < 0 ? bodyRest.length : methodEnd));
  // ★BJ174 反哺（2026-09-19）：联合条件块 `else if (type == 473 || type == 474 || ...)` 旧
  //   正则要求 `\)` 紧跟首个 id → 整块被跳过,473-476（宝箱怪族 value=30000f,NPC.cs:14536-14546）
  //   等 14 组联合块全部缺值（击杀零掉钱）。现捕获 `|| type == N` 尾链,组内每个 id 各取同值。
  //   重产一致性:存量单 id 块匹配面不变（纯超集）;455-458/678-684 等 value=0 组本就缺省 0。
  const re = /\b(?:else )?if \(type == (\d+)((?:\s*\|\|\s*type == \d+)*)\)/g;
  const marks = [];
  let m;
  while ((m = re.exec(body))) {
    const ids = [Number(m[1])];
    for (const t of m[2].matchAll(/type == (\d+)/g)) ids.push(Number(t[1]));
    marks.push({ ids, at: m.index });
  }
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : marks[i].at + 4000;
    const seg = body.slice(marks[i].at, end);
    const v = seg.match(/value = (\d+(?:\.\d+)?)f?;/);  // 25f / 5000f 浮点字面量
    const v2 = v ? null
      : (seg.match(/value = Item\.buyPrice\(([\d\s,]+)\)/) || seg.match(/SetShopValues\([^,]+, (?:Item\.)?(?:buyPrice|sellPrice)\(([\d\s,]+)\)\)/));
    if (!v && !v2) continue;
    let val;
    if (v) val = Math.round(parseFloat(v[1]));
    else {
      // buyPrice/SetShopValues 形态（boss value=Item.buyPrice,extract-npcvalue.mjs 同源;
      // 旧只认裸字面量 → 世花/石巨人等 15 怪每次重跑丢失,2026-08-13 补齐防再犯）
      const args = (v2[1] || v2[2]).split(',').map((x) => Number(x.trim()));
      val = args.reduce((acc, x) => acc * 100 + x, 0) * 100 ** (4 - args.length);
    }
    for (const id of marks[i].ids) {
      if (values[id] === undefined) values[id] = val;  // else-if 链组间不重复;防御首写胜
    }
  }
  // SetDefaultsFromNetId 负 id 变体（case -N: 块内的 value = Xf;——史莱姆变体专属值，
  // -1=100/-3=3/-4=10000/-5=10/-6=20…变体掉钱走这张表而非 type 表）。
  // 该方法在文件里位于 SetDefaults(:8361) 之前 → 扫全文
  const re2 = /case (-\d+):/g;
  const marks2 = [];
  while ((m = re2.exec(npcCs))) marks2.push({ id: Number(m[1]), at: m.index });
  for (let i = 0; i < marks2.length; i++) {
    const end = i + 1 < marks2.length ? marks2[i + 1].at : marks2[i].at + 800;
    const seg = npcCs.slice(marks2[i].at, end);
    const v = seg.match(/value = (\d+(?:\.\d+)?)f?;/);
    if (v && values[marks2[i].id] === undefined) values[marks2[i].id] = Math.round(parseFloat(v[1]));
  }
}

// ============ SlimeBody 数量表 ============
const slimeBody = {};
{
  const src = readFileSync(`${ROOT}/Terarria${VER}/Terraria.GameContent.ItemDropRules/SlimeBodyItemDropRule.cs`, 'utf8');
  // switch 在 CanDrop 之后（本文件方法序）：从 switch 起切到文件尾
  const swIdx = src.indexOf('switch (itemId)');
  if (swIdx < 0) throw new Error('[extract-npcdrops] 锚点失配: SlimeBodyItemDropRule switch (itemId) 未找到（源码漂移,禁止静默空扫）');
  const body = src.slice(swIdx);
  // ★ 多 case 堆叠分组（case 11:/case 12:/.../case 3347: → 同一 min/max）：
  //   逐 case 切段会把组员丢了（只留组内最后一个 case）——改为前向合并：
  //   连续 case 标签归组，组内首个赋值段归属全部组员
  const tokens = [];
  const re = /case (\d+):|amountDroppedMinimum = (\d+);|amountDroppedMaximum = (\d+);/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) tokens.push({ t: 'case', id: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: 'min', v: Number(m[2]) });
    else tokens.push({ t: 'max', v: Number(m[3]) });
  }
  let pendingCases = [];
  for (const tk of tokens) {
    if (tk.t === 'case') { pendingCases.push(tk.id); continue; }
    // 赋值 token：若当前组已有 min，本 token 是 max → 提交整组
    if (tk.t === 'min') { pendingCases._min = tk.v; continue; }
    if (tk.t === 'max' && pendingCases._min !== undefined) {
      for (const id of pendingCases) slimeBody[id] = [pendingCases._min, tk.v];
      pendingCases = [];
    }
  }
}

// ============ 1457 源码锚 fail-loud（BJ261：补丁面退役，改锚 1457 注册真值） ============
// 12 处 1456→1457 diff 锚（行号=Terarria1457 实测，md5 cdc9c1080ac171c9c98f69ead06fd837，
// 1458 同文件逐字节全等）——源文本硬校验，失配 throw（防树回滚/提取器静默退化）：
{
  const mustHave = [
    ['① 629 硬模池+6172', 'ItemDropRule.OneFromOptions(1, 676, 725, 1264, 6172)'],
    ['① 629 硬模 remix 池+6172', 'ItemDropRule.OneFromOptions(1, 676, 1319, 1264, 6172)'],
    ['② 冰模仿怪池 8 选+6153/6172', 'new int[8] { 670, 724, 950, 6153, 0, 987, 1579, 6172 }'],
    ['③ 245 石巨人 6158 1/6', 'ItemDropRule.ByCondition(condition, 6158, 6)'],
    ['④ 370 猪鲨池+3291', 'ItemDropRule.OneFromOptions(1, 5526, 2624, 2622, 2621, 5478, 3291, 2623)'],
    ['⑥ 395 火星飞碟 6173 1/50', 'RegisterToNPC(395, ItemDropRule.Common(6173, 50))'],
    ['⑦ 483/482 6167 1/80', 'RegisterToMultipleNPCs(ItemDropRule.Common(6167, 80), 483, 482)'],
    ['⑧ 475 池+6168', 'RegisterToNPC(475, ItemDropRule.OneFromOptions(1, 3029, 3030, 3051, 6168, 3022))'],
    ['⑨ 528/529 6157 1/40', 'RegisterToMultipleNPCs(ItemDropRule.Common(6157, 40), 528, 529)'],
    ['⑩ 18 群 1/100', 'RegisterToMultipleNPCs(ItemDropRule.Common(18, 100), 49, 51, 150, 93, 634)'],
    ['⑪ 393 群 1/50', 'RegisterToMultipleNPCs(ItemDropRule.Common(393, 50), 16, 185, 167, 197)'],
    ['⑫ 179/83 6159 1/25', 'RegisterToMultipleNPCs(ItemDropRule.Common(6159, 25), 179, 83)'],
  ];
  const missing = mustHave.filter(([, t]) => !DB.includes(t)).map(([n]) => n);
  if (missing.length) throw new Error(`[extract-npcdrops] 锚点失配: 1457 注册锚缺失: ${missing.join('; ')}（源树漂移/回滚,禁止静默半表）`);
  // ⑤ 1457 已删 1456 全局 YoyosKraken 3291 1/400 注册——若复现即树回滚
  if (DB.includes('RegisterToGlobal(new ItemDropWithConditionRule(3291, 400, 1, 1, new Conditions.YoyosKraken()))')) {
    throw new Error('[extract-npcdrops] 锚点失配: 1457 已删的 YoyosKraken 3291 全局注册复现（源树回滚）');
  }
  // POOL_METHODS 硬编码池必须与源码字面量逐值全等（8 选 + obj[4] isRemix 三元）
  const poolLit = DB.match(/int\[\] obj = new int\[\d+\] \{([\d,\s]+)\};\s*\n\s*obj\[\d+\] = \(isRemix \? (\d+) : (\d+)\);/);
  if (!poolLit) throw new Error('[extract-npcdrops] 锚点失配: RegisterIceMimic_GetEasyModeItemPool 池字面量未找到（形变,禁止静默吃硬编码）');
  const poolSrc = poolLit[1].split(',').map((x) => parseInt(x.trim(), 10));
  const [remixId, plainId] = [Number(poolLit[2]), Number(poolLit[3])];
  for (const isRemix of [true, false]) {
    const expect = poolSrc.map((v, i) => (v === 0 ? (isRemix ? remixId : plainId) : v));
    const got = POOL_METHODS.RegisterIceMimic_GetEasyModeItemPool([{ t: 'id', name: isRemix ? 'true' : 'false' }]);
    if (JSON.stringify(expect) !== JSON.stringify(got)) {
      throw new Error(`[extract-npcdrops] 锚点失配: POOL_METHODS 冰模仿怪池与源码不等（isRemix=${isRemix}）: 源 ${expect} vs 硬编码 ${got}`);
    }
  }
}
// NPC.cs 读域签名锚（SetDefaults 链 + SetDefaultsFromNetId 负 id 变体表）
if (!npcCs.includes('public void SetDefaults(int Type')) {
  throw new Error('[extract-npcdrops] 锚点失配: NPC.cs SetDefaults 签名未找到（源码漂移,禁止静默空扫）');
}
if (!/case -\d+:/m.test(npcCs)) {
  throw new Error('[extract-npcdrops] 锚点失配: NPC.cs SetDefaultsFromNetId 负 id case 表未找到（源码漂移,禁止静默空扫）');
}
// 基数护栏（1457 实测:entries 630/values 428/slimeBody 44——地板防静默半表）
if (entries.length < 600) throw new Error(`[extract-npcdrops] 锚点失配: entries 基数 ${entries.length} < 600（解析面漂移）`);
if (Object.keys(values).length < 400) throw new Error(`[extract-npcdrops] 锚点失配: npc values 基数 ${Object.keys(values).length} < 400（SetDefaults 链漏扫）`);
if (Object.keys(slimeBody).length < 40) throw new Error(`[extract-npcdrops] 锚点失配: slimeBody 基数 ${Object.keys(slimeBody).length} < 40（switch 漏配）`);
const unknownBase = ['new:List'];  // 已知良性 unknown 形态（List 变量声明,规则流不经过）
const unknownNew = stats.unknown.filter((u) => !unknownBase.includes(u));
if (unknownNew.length) console.error(`[extract-npcdrops] ⚠ unknown 新形态 ${unknownNew.length} 条（超出基线,人工核对是否静默漏条）:`, unknownNew.slice(0, 8));

// ================= ★BJ261 era guard：干跑对拍 / 沙箱 / 逃生门（头注见上） =================
const FRESH_DROPS = JSON.stringify({ entries, slimeBody });
const FRESH_VALUE = JSON.stringify(values);
/** 现库 vs 重产双向动态 diff。live-only=「现库有而重产无」洗库预警面（vanilla-atlas 追加
 *  时代同族）；fresh-only=「重产有而现库无」现库退化缺键型面（itemrare 缺键型同族——
 *  ★G-1/S3 处方：只算 live-only 的对拍闸对源侧删除恒绿,双向才算「重产盖住现库」）。 */
function washOf(dropsRaw, valueRaw) {
  const wash = { entriesLive: [], entriesFresh: [], slimeLive: [], slimeFresh: [], valueMissing: [], valueDrift: [], valueFresh: [] };
  let liveD = null, liveV = null;
  try { liveD = JSON.parse(dropsRaw); } catch { /* 坏损:不拦（让写盘流程自行报错） */ }
  try { liveV = JSON.parse(valueRaw); } catch { /* 坏损:不拦 */ }
  if (liveD) {
    const sig = (e) => JSON.stringify(e);
    const cnt = (arr) => { const m = new Map(); for (const e of arr) { const s = sig(e); m.set(s, (m.get(s) ?? 0) + 1); } return m; };
    const fresh = cnt(entries);
    const live = cnt(liveD.entries ?? []);
    for (const [s, n] of live) { if (n > (fresh.get(s) ?? 0)) wash.entriesLive.push(JSON.parse(s)); }
    for (const [s, n] of fresh) { if (n > (live.get(s) ?? 0)) wash.entriesFresh.push(JSON.parse(s)); }
    const liveSlime = liveD.slimeBody ?? {};
    for (const [k, v] of Object.entries(liveSlime)) {
      if (JSON.stringify(slimeBody[k] ?? null) !== JSON.stringify(v)) wash.slimeLive.push(`${k}:${JSON.stringify(v)}→${JSON.stringify(slimeBody[k] ?? '缺')}`);
    }
    for (const k of Object.keys(slimeBody)) {
      if (liveSlime[k] === undefined) wash.slimeFresh.push(`${k}:${JSON.stringify(slimeBody[k])}`);
    }
  }
  if (liveV) {
    for (const [k, v] of Object.entries(liveV)) {
      if (values[k] === undefined) wash.valueMissing.push(`${k}:${v}`);
      else if (values[k] !== v) wash.valueDrift.push(`${k}:${v}→${values[k]}`);
    }
    for (const [k, v] of Object.entries(values)) {
      if (liveV[k] === undefined) wash.valueFresh.push(`${k}:${v}`);
    }
  }
  return wash;
}
const washEmpty = (w) => w.entriesLive.length === 0 && w.entriesFresh.length === 0 && w.slimeLive.length === 0
  && w.slimeFresh.length === 0 && w.valueMissing.length === 0 && w.valueDrift.length === 0 && w.valueFresh.length === 0;
function washReport(w) {
  console.error('  物证：');
  if (w.entriesLive.length) console.error(`    [live-only] 现库独有条目（重产缺=提取器退化/洗库面）${w.entriesLive.length} 条: ${w.entriesLive.slice(0, 3).map((e) => JSON.stringify(e)).join(' | ')}`);
  if (w.entriesFresh.length) console.error(`    [fresh-only] 重产独有条目（现库缺=源侧新增/现库退化）${w.entriesFresh.length} 条: ${w.entriesFresh.slice(0, 3).map((e) => JSON.stringify(e)).join(' | ')}`);
  if (w.slimeLive.length) console.error(`    [live-only] slimeBody 现库独有: ${w.slimeLive.slice(0, 6).join(', ')}`);
  if (w.slimeFresh.length) console.error(`    [fresh-only] slimeBody 重产独有: ${w.slimeFresh.slice(0, 6).join(', ')}`);
  if (w.valueMissing.length) console.error(`    [live-only] value 现库独有键 ${w.valueMissing.length}: ${w.valueMissing.slice(0, 6).join(', ')}`);
  if (w.valueDrift.length) console.error(`    [drift] value 值漂移 ${w.valueDrift.length}: ${w.valueDrift.slice(0, 6).join(', ')}`);
  if (w.valueFresh.length) console.error(`    [fresh-only] value 重产独有键 ${w.valueFresh.length}: ${w.valueFresh.slice(0, 6).join(', ')}`);
}
const dropsRaw = existsSync(LIVE_DROPS_JSON) ? readFileSync(LIVE_DROPS_JSON, 'utf8') : null;
const valueRaw = existsSync(LIVE_VALUE_JSON) ? readFileSync(LIVE_VALUE_JSON, 'utf8') : null;
const wash = dropsRaw === null && valueRaw === null ? null : washOf(dropsRaw ?? '{}', valueRaw ?? '{}');
if (OUT_DROPS_JSON) {
  if (WRITE_REAL) {
    if (wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
      console.error('[extract-npcdrops] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
      washReport(wash);
      console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）；事后必须全绿消费面测试（tests/npc-drops.test.ts 等）。');
      process.exit(1);
    }
    if (wash && !washEmpty(wash)) console.error('[extract-npcdrops] 双旗强推：静默覆盖预警已确认（责任在操作者定谳）。');
  }
  mkdirSync(OUT_DROPS_JSON.slice(0, OUT_DROPS_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_DROPS_JSON, FRESH_DROPS);
  writeFileSync(OUT_VALUE_JSON, FRESH_VALUE);
  console.error(`[extract-npcdrops] 已写 ${OUT_DROPS_JSON} + ${OUT_VALUE_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else {
  // 缺省干跑对拍（零写盘）
  if (wash === null) {
    console.error('[extract-npcdrops] 干跑（零写盘）：现库缺 vanilla-npcdrops.json/vanilla-npcvalue.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
  } else if (!washEmpty(wash)) {
    console.error('[extract-npcdrops] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
    washReport(wash);
    console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
    process.exit(1);
  } else {
    console.error('[extract-npcdrops] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
  }
}

const npcCount = new Set(entries.filter(e => !e.global).flatMap(e => e.npcs)).size;
console.log('entries:', entries.length, '| global:', entries.filter(e => e.global).length,
  '| npcs covered:', npcCount, '| kinds:', JSON.stringify(stats.kinds));
console.log('unknown:', stats.unknown.length, stats.unknown.slice(0, 12));
console.log('npc values:', Object.keys(values).length, '| slimeBody items:', Object.keys(slimeBody).length);
console.log('conds:', JSON.stringify(stats.conds));
console.log('class fields:', JSON.stringify(Object.fromEntries(fields)));
const unresolvedNodes = [];
(function walk(o) {
  if (!o || typeof o !== 'object') return;
  if (typeof o._unresolved === 'string') unresolvedNodes.push(o._unresolved);
  for (const k in o) walk(o[k]);
})(entries);
console.log('_unresolved:', unresolvedNodes.length, unresolvedNodes.slice(0, 8));
