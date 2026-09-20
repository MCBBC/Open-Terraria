// 坐骑全量提取器（1.4.5.7；★BJ183 2026-09-20 基准对齐 1456→1457）：
//   Terarria1457/Terraria.ID/MountID.cs  → 全部 id→内部名 + Sets 能力位（1457 新增 64/65 TrustyChillet 系）
//   Terarria1457/Terraria/Mount.cs       → Initialize() 每坐骑 MountData 数值/帧组/贴图引用
//                                           + SetAsMinecart/Horse/RollerSkate/Chillet 助手展开
//                                           （1457: SetAsChillet 增 hardmode 分支、Basilisk 14
//                                             heightBoost 8→6 / yOffset 9→8）
//   Terarria1457/Terraria/Item.cs        → SetDefaults switch：case 块内 `mountType = N`
//                                           （含 40+(type-4785) / 44+type-4792 两条公式族）
//   Terarria1457/Terraria.ID/BuffID.cs   → BuffID.Sets.MountType（buff → mount）
// 输出 src/data/vanilla-mounts.json：
//   { mounts: { id: MountData }, itemMount: { itemId: mountId }, buffMount: { buffId: mountId },
//     sets: { Cart: [...], ... }, names: { id: internalName }, textureOk: { id: bool } }
// 贴图可得性：terraria-assets/Images 下查 Mount_*.png / Rudolph_N.png / Extra_N.png；
// 不可得（QueenSlime 走 RenderTarget / 部分新坐骑 Extra 缺表）登记 textureOk=false，
// 运行侧回退色块近似渲染。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// ================= ★BJ215 era guard（四要素习语见 docs/era-guard-family.md） =================
// ① SW_ITEM_VER 缺省 1457（白名单单值 1457——1458 MountID sets 面有真差
//   DoesNotOverrideWings（BJ215 实证）,语义收窄不放行;未来版本逐值定谳后扩白名单）;
// ② 输出通道三分离：缺省=干跑对拍零写盘（重产 vs 现库逐字节对拍——零漂移 exit 0/
//   漂移 exit 1+物证,B-form;BJ215 定谳 bare 重产=现库逐字节零漂移）/ SW_OUT=<dir> 沙箱 /
//   --write-real 逃生门;双旗互斥;SW_ITEM_VER≠1457 禁写真库;
// ③ 锚 fail-loud：fnBody 签名未找到即 throw（原实现静默返空体=「表与源码失配还全绿」
//   反模式,本刀改硬炸;playerYOffsets 未解析语句原有登记面保留）;
// ④ 判别力自证：tests/extract-mounts-expert-era-guard.test.ts（变异:摘干跑门=静默写库;
//   毒化 Initialize 签名=fail-loud）。注：本器读侧无探测注入面,g1 不适用。
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457']);
if (!VER_ALLOWED.has(VER) || !existsSync(join(ROOT, `Terarria${VER}`, 'Terraria.ID', 'MountID.cs'))) {
  console.error(`[extract-mounts] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1458') console.error('  1458 MountID sets 面有真差（DoesNotOverrideWings,BJ215 实证）——未逐值定谳前不放行;现库 vanilla-mounts.json 锚 1457。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-mounts] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  console.error('  处置：沙箱对拍用 SW_OUT=<dir>；确认定谳后更新现库用 --write-real（且 SW_ITEM_VER=1457）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-mounts] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 game/src/data/vanilla-mounts.json）。`);
  console.error('  处置：重放对拍请走 SW_OUT 沙箱；确要回写 1457 终值请去掉 SW_ITEM_VER 显式注入（缺省即 1457）。');
  process.exit(1);
}
const MOUNT_ID = join(ROOT, `Terarria${VER}`, 'Terraria.ID', 'MountID.cs');
const MOUNT = join(ROOT, `Terarria${VER}`, 'Terraria', 'Mount.cs');
const ITEM = join(ROOT, `Terarria${VER}`, 'Terraria', 'Item.cs');
const BUFF_ID = join(ROOT, `Terarria${VER}`, 'Terraria.ID', 'BuffID.cs');
const IMG = join(ROOT, 'terraria-assets', 'Images');
const LIVE_JSON = join(ROOT, 'game', 'src', 'data', 'vanilla-mounts.json');
// ★M1 变异锚:干跑臂 null(守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面)
const OUT = WRITE_REAL ? LIVE_JSON
  : (SW_OUT !== undefined && SW_OUT !== '' ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-mounts.json` : null);

const mountIdSrc = readFileSync(MOUNT_ID, 'utf8');
const mountSrc = readFileSync(MOUNT, 'utf8');
const itemSrc = readFileSync(ITEM, 'utf8');
const buffIdSrc = readFileSync(BUFF_ID, 'utf8');

// ---- MountID.cs：const int 名表 ----
const names = {};
for (const m of mountIdSrc.matchAll(/^\tpublic const int (\w+) = (\d+);$/gm)) names[+m[2]] = m[1];
let mountCount = +(mountIdSrc.match(/public static int Count = (\d+);/)?.[1] ?? 0);

// ---- MountID.cs Sets：CreateBoolSet(...) / CreateIntSet(...) 展开 ----
//  bool 集：args 全部为置位索引；int 集：首参为缺省值、其后 (键, 值) 成对
const sets = {};
for (const m of mountIdSrc.matchAll(/^\t+public static (bool|int)\[\] (\w+) = Factory\.Create(?:Bool|Int)Set\(([^;]*)\);$/gm)) {
  const [, kind, setName, argsRaw] = m;
  const args = [...argsRaw.matchAll(/-?\d+/g)].map((a) => +a[0]);
  const arr = Array.from({ length: mountCount }, () => kind === 'bool' ? false : -1);
  if (kind === 'bool') {
    for (const i of args) arr[i] = true;
  } else {
    const def = args.shift();
    arr.fill(def);
    for (let i = 0; i + 1 < args.length; i += 2) arr[args[i]] = args[i + 1];
  }
  sets[setName] = arr;
}

// ---- Mount.cs Initialize() / SetAs* 助手体切块 ----
const fnBody = (src, sig) => {
  const start = src.indexOf(sig);
  if (start < 0) throw new Error(`[extract-mounts] 锚点失配: ${sig} 未找到（源码漂移,禁止静默空体）`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  throw new Error(`[extract-mounts] 锚点失配: ${sig} 花括号不配平（源码漂移）`);
};
const initBody = fnBody(mountSrc, 'public static void Initialize()');
const helpers = {
  SetAsMinecart: fnBody(mountSrc, 'public static void SetAsMinecart('),
  SetAsHorse: fnBody(mountSrc, 'public static void SetAsHorse('),
  SetAsRollerSkate: fnBody(mountSrc, 'public static void SetAsRollerSkate('),
  SetAsChillet: fnBody(mountSrc, 'public static void SetAsChillet('),
};

// TextureAssets 字段 → terraria-assets 文件名（AssetInitializer.cs 加载路径）
const TEX_FILE = {
  RudolphMount: (i) => `Rudolph_${i}.png`,
  BunnyMount: () => 'Mount_Bunny.png',
  PigronMount: () => 'Mount_Pigron.png',
  SlimeMount: () => 'Mount_Slime.png',
  TurtleMount: () => 'Mount_Turtle.png',
  UnicornMount: () => 'Mount_Unicorn.png',
  BasiliskMount: () => 'Mount_Basilisk.png',
  BeeMount: (i) => (i === 1 ? 'Mount_BeeWings.png' : 'Mount_Bee.png'),
  UfoMount: (i) => (i === 1 ? 'Mount_UFOGlow.png' : 'Mount_UFO.png'),
  DrillMount: ['Mount_DrillRing.png', 'Mount_DrillSeat.png', 'Mount_DrillDiode.png',
    'Mount_Glow_DrillRing.png', 'Mount_Glow_DrillSeat.png', 'Mount_Glow_DrillDiode.png'],
  ScutlixMount: ['Mount_Scutlix.png', 'Mount_ScutlixEyes.png', 'Mount_ScutlixEyeGlow.png'],
  CuteFishronMount: (i) => (i === 1 ? 'Mount_CuteFishron2.png' : 'Mount_CuteFishron1.png'),
  MinecartMount: () => 'Mount_Minecart.png',
  MinecartMechMount: (i) => (i === 1 ? 'Mount_MinecartMechGlow.png' : 'Mount_MinecartMech.png'),
  MinecartWoodMount: () => 'Mount_MinecartWood.png',
  DesertMinecartMount: () => 'Mount_MinecartDesert.png',
  FishMinecartMount: () => 'Mount_MinecartMineCarp.png',
  Extra: (i) => `Extra_${i}.png`,
};
const texOf = (expr) => {
  const m = expr.match(/TextureAssets\.(\w+)\s*(?:\[(\d+)\])?/);
  if (!m) return null;
  const fn = TEX_FILE[m[1]];
  if (!fn) return null;                       // QueenSlime RenderTarget 等动态表 → 登记缺
  const f = Array.isArray(fn) ? fn[+(m[2] ?? 0)] : fn(+(m[2] ?? 0));
  return f ?? null;
};

// ---- 单块解析：`mountData.X = 值;` + playerYOffsets 循环填充 + delta + 贴图 ----
const NUM_FIELDS = ['spawnDust', 'buff', 'heightBoost', 'flightTimeMax', 'extraFall',
  'jumpHeight', 'abilityChargeMax', 'abilityDuration', 'abilityCooldown',
  'walkingGraceTimeMax', 'totalFrames', 'playerHeadOffset', 'xOffset', 'yOffset',
  'bodyFrame', 'playerXOffset', 'standingFrameCount', 'standingFrameDelay', 'standingFrameStart',
  'runningFrameCount', 'runningFrameDelay', 'runningFrameStart',
  'flyingFrameCount', 'flyingFrameDelay', 'flyingFrameStart',
  'inAirFrameCount', 'inAirFrameDelay', 'inAirFrameStart',
  'idleFrameCount', 'idleFrameDelay', 'idleFrameStart',
  'swimFrameCount', 'swimFrameDelay', 'swimFrameStart',
  'dashingFrameCount', 'dashingFrameDelay', 'dashingFrameStart'];
const FLOAT_FIELDS = ['runSpeed', 'dashSpeed', 'swimSpeed', 'acceleration', 'jumpSpeed',
  'fallDamage', 'fatigueMax'];
const BOOL_FIELDS = ['usesHover', 'constantJump', 'blockExtraJumps', 'Minecart',
  'CanRideMinecartTracks', 'CanUseWings', 'idleFrameLoop', 'spawnDustNoGravity',
  'dismountsOnItemUse', 'emitsLight'];

function parseBlock(body, prefix, extra = {}) {
  const d = { ...extra };
  const lines = body.split('\n');
  const rel = (f) => `${prefix}.${f}`;
  // ---- playerYOffsets 反编译语句微解释器（2026-09-04 blue-fix）----
  // 旧实现只认字面 `array[i]` 循环变量 + 数字下标 +=/-=，漏掉反编译器重命名循环变量
  // （num3..num27）的均匀填充型、负实参助手代入（8 - -10 + -8）、直接赋值 array[K] = N
  // 与条件增量 if (V == a || ...) { array[V] += M; } —— 34 个坐骑 playerYOffsets 缺键。
  // 形态全集（1457 Mount.cs 逐句核对，与 1456 同构）：
  //   [F1] (int[] )array = new int[(mountData|newMount).totalFrames];
  //   [F2] for (int V = 0; V < array.Length; V++) { array[V] = N; [if (V == a || ...) { array[V] += M; }] }
  //   [F3] array[K] = N; / array[K] += N; / array[K] -= N;  （K = 数字 | 循环变量 | array.Length - 1）
  //   [F4] ref int r = ref array[K]; r = r;                  （反编译 no-op，跳过）
  //   [F5] array[i] = N - verticalOffset + playerVerticalOffset;（SetAsMinecart 助手实参代入后为数字）
  // 数值表达式 = 数字/标识符的加减链；未知标识符 → 整句放弃并告警（宁缺勿错）。
  let arr = null;
  let yAssigned = false;
  const numExpr = (e) => {
    if (e === undefined) return undefined;
    const whole = String(e).trim().match(/^(?:mountData|newMount)\.(\w+)$/);
    if (whole) return d[whole[1]];
    const parts = String(e).trim().match(/-?\d+(?:\.\d+)?|[A-Za-z_]\w*|[+-]/g);
    if (!parts) return undefined;
    let val = 0, op = 1, seen = false;
    for (const p of parts) {
      if (p === '+') { op = 1; continue; }
      if (p === '-') { op = -1; continue; }
      let v;
      if (/^-?\d/.test(p)) v = +p;
      else if (p === 'verticalOffset') v = extra.verticalOffset ?? 0;
      else if (p === 'playerVerticalOffset') v = extra.playerVerticalOffset ?? 0;
      else if (/^(?:mountData|newMount)\.(\w+)$/.test(p)) v = d[RegExp.$1];
      else if (p in d) v = d[p];
      else return undefined;
      if (v === undefined) return undefined;
      val += op * v; op = 1; seen = true;
    }
    return seen ? val : undefined;
  };
  const idxOf = (k, scope) => {
    if (/^\d+$/.test(k)) return +k;
    if (k === 'array.Length - 1') return arr.length - 1;
    if (scope && k in scope) return scope[k];
    return null;
  };
  const takeBlock = (ls, open) => {
    // 开括号在头行行尾或下一行（反编译为 Allman 风格,{ 独占一行）
    let start = -1;
    for (let j = open; j < Math.min(ls.length, open + 3); j++) {
      if (ls[j].includes('{')) { start = j; break; }
    }
    if (start < 0) return [null, open + 1];
    let depth = 0;
    for (let j = start; j < ls.length; j++) {
      for (const c of ls[j]) {
        if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      if (depth <= 0 && j >= start) return [ls.slice(start + 1, j), j + 1];
    }
    return [null, ls.length];
  };
  const applyArrStmt = (t, scope) => {
    const m = t.match(/^array\[(\w+)\] (=|\+=|-=) (.+);$/);
    if (!m) return false;
    if (arr) {
      const i = idxOf(m[1], scope), v = numExpr(m[3]);   // m[2]=操作符, m[3]=数值表达式
      if (i == null || v === undefined) console.error(`[extract-mounts] playerYOffsets 语句未解析(登记缺): ${t.trim()}`);
      else if (m[2] === '=') arr[i] = v;
      else if (m[2] === '+=') arr[i] += v;
      else arr[i] -= v;
    }
    return true;
  };
  const runStmts = (ls, scope) => {
    for (let i = 0; i < ls.length; i++) {
      const t = ls[i].trim();
      if (!t) continue;
      if (/^(?:mountData|newMount)\.playerYOffsets = array;$/.test(t)) return;   // 赋值后无需再扫
      let m;
      if ((m = t.match(/^for \(int (\w+) = 0; \1 < array\.Length; \1\+\+\)$/))) {
        const [body, next] = takeBlock(ls, i);
        if (body) for (let idx = 0; idx < arr.length; idx++) runStmts(body, { ...scope, [m[1]]: idx });
        i = next - 1;
        continue;
      }
      if ((m = t.match(/^if \(([^)]*)\)$/))) {
        const [body, next] = takeBlock(ls, i);
        const cs = [...m[1].matchAll(/(\w+) == (-?\d+)/g)];
        const residue = m[1].replace(/(\w+) == -?\d+/g, '').replace(/\|\|/g, '').trim();
        if (body && !residue && cs.length && cs.every((c) => scope && c[1] in scope)
          && cs.some((c) => scope[c[1]] === +c[2])) runStmts(body, scope);
        i = next - 1;
        continue;
      }
      if (/^ref int \w+ = ref array\[\d+\];$/.test(t)) continue;   // [F4] no-op 声明
      if (/^\w+ = \w+;$/.test(t)) continue;                        // reference = reference; no-op
      applyArrStmt(t, scope);
    }
  };
  for (let li = 0; li < lines.length; li++) {
    const t = lines[li].trim();
    for (const f of NUM_FIELDS) {
      const m = t.match(new RegExp(`^${rel(f)} = (-?\\d+);?$`));
      if (m) { d[f] = +m[1]; continue; }
      // 简单算术（SetAsMinecart 的 `13 + verticalOffset` 代入后形如 `13 + 0`）
      const ar = t.match(new RegExp(`^${rel(f)} = (-?\\d+) ([+-]) (-?\\d+);$`));
      if (ar) d[f] = ar[2] === '+' ? +ar[1] + +ar[3] : +ar[1] - +ar[3];
    }
    // 跨字段引用（SetAsRollerSkate `runSpeed = dashSpeed`——取同块已解析值）
    for (const f of [...NUM_FIELDS, ...FLOAT_FIELDS]) {
      if (d[f] !== undefined) continue;
      const cr = t.match(new RegExp(`^${rel(f)} = ${rel('(\\w+)')};$`));
      if (cr && d[cr[1]] !== undefined) d[f] = d[cr[1]];
    }
    for (const f of FLOAT_FIELDS) {
      const m = t.match(new RegExp(`^${rel(f)} = (-?[\\d.]+)f?;?$`));
      if (m) d[f] = +m[1];
    }
    for (const f of BOOL_FIELDS) {
      const m = t.match(new RegExp(`^${rel(f)} = (true|false);$`));
      if (m) d[f] = m[1] === 'true';
    }
    // [F1] 数组建制：建零数组后从下一行起执行到块尾（后续字段行不匹配语句形态，安全）
    const ac = t.match(/^(?:int\[\] )?array = new int\[([\w.]+)\];$/);
    if (ac) {
      const n = numExpr(ac[1]);
      if (n !== undefined && n > 0) {
        arr = new Array(n).fill(0);
        runStmts(lines.slice(li + 1), null);
      } else {
        arr = null;
        console.error(`[extract-mounts] array 长度表达式未解析(登记缺): ${t.trim()}`);
      }
    }
    if (/^(?:mountData|newMount)\.playerYOffsets = array;$/.test(t)) yAssigned = true;
    // 贴图四层
    for (const slot of ['backTexture', 'backTextureGlow', 'backTextureExtra', 'frontTexture', 'frontTextureGlow', 'frontTextureExtra', 'frontTextureExtraGlow']) {
      if (d[slot] === undefined) {
        const m2 = t.match(new RegExp(`^${rel(slot)} = (TextureAssets\\.[^;]+?);?$`));
        if (m2 && !m2[1].includes('Asset<Texture2D>.Empty')) d[slot] = m2[1];
      }
    }
    // 发光色
    const lc = t.match(new RegExp(`^${rel('lightColor')} = new Vector3\\((-?[\\d.]+)f, *(-?[\\d.]+)f, *(-?[\\d.]+)f\\);$`));
    if (lc) d.lightColor = [+lc[1], +lc[2], +lc[3]];
  }
  // 展开贴图 → 文件名（缺素材字段保留原表达式供登记）
  for (const slot of ['backTexture', 'backTextureGlow', 'backTextureExtra', 'frontTexture', 'frontTextureGlow', 'frontTextureExtra', 'frontTextureExtraGlow']) {
    if (typeof d[slot] === 'string') d[slot] = texOf(d[slot]) ?? d[slot];
  }
  // playerYOffsets 定稿（微解释器产物；未赋值语句的块不落键 = 原版本就没有该数组）
  if (arr && yAssigned) {
    if (d.totalFrames !== undefined && d.totalFrames !== arr.length) {
      console.error(`[extract-mounts] playerYOffsets 长度 ${arr.length} ≠ totalFrames ${d.totalFrames}（登记异常）`);
    }
    d.playerYOffsets = arr;
  }
  if (d.yOffset !== undefined && extra.verticalOffset) d.yOffset += extra.verticalOffset;
  return d;
}

// ---- Initialize() 逐 mounts[N] 切块 ----
const mounts = {};
const blocks = [];
{
  const re = /mounts\[(\d+)\] = mountData;/g;
  let m;
  const marks = [];
  while ((m = re.exec(initBody))) marks.push({ id: +m[1], at: m.index });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : initBody.length;
    const seg = initBody.slice(marks[i].at, end);
    // SetAs* 助手调用：展开助手体后叠加本段覆写
    // 签名：SetAsMinecart(newMount, buff, texture[, vertOff[, pVertOff]])
    //       SetAsHorse/RollerSkate/Chillet(newMount, buff, texture)
    // 助手体内的形参（buff/texture/verticalOffset/playerVerticalOffset）按调用实参代入
    const call = seg.match(/SetAs(Minecart|Horse|RollerSkate|Chillet)\(([^;]*)\);/);
    let data = {};
    let args = [];
    if (call) {
      args = call[2].split(',').map((s) => s.trim());
      const buff = +args[1];
      const vert = call[1] === 'Minecart' ? +(args[3] ?? 0) || 0 : 0;
      const pVert = call[1] === 'Minecart' ? +(args[4] ?? 0) || 0 : 0;
      const body = helpers[`SetAs${call[1]}`]
        .replace(/\bbuff\b/g, String(buff))
        .replace(/\btexture\b/g, args[2] ?? 'Asset<Texture2D>.Empty')
        .replace(/\bverticalOffset\b/g, String(vert))
        .replace(/\bplayerVerticalOffset\b/g, String(pVert));
      data = parseBlock(body, 'newMount');
      data.buff = buff;
      if (call[1] === 'Minecart') { data.verticalOffset = vert; data.playerVerticalOffset = pVert; }
    }
    const tail = seg.slice(seg.indexOf('mounts['));
    Object.assign(data, parseBlock(tail, 'mountData'));
    // 助手段内 texture 形参（SetAsHorse 等传入 textureAsset → backTexture）
    if (call && data.backTexture === undefined && /backTexture = texture;/.test(helpers[`SetAs${call[1]}`])) {
      data.backTexture = texOf(args[2]) ?? args[2];
    }
    // 后续覆盖特例：mount 39 yOffset -= 2 / frontTextureExtra；mount 38 backTexture=frontTexture
    const sub = tail.match(/mountData\.yOffset -= (\d+);/);
    if (sub) data.yOffset = (data.yOffset ?? 0) - +sub[1];
    const btf = tail.match(/mountData\.backTexture = mountData\.frontTexture;/);
    if (btf) data.backTexture = data.frontTexture ?? data.backTexture;
    mounts[marks[i].id] = data;
    blocks.push(marks[i].id);
  }
}
// mounts[6]（默认矿车）在 Initialize 内为显式块；SetAsMinecart 族已含 Minecart=true

// ---- Item.cs：case 块 → mountType ----
const itemMount = {};
{
  let cur = null;
  let mountAssign = null;
  const flush = () => {
    if (cur != null && mountAssign != null) {
      for (const id of cur) itemMount[id] = mountAssign(id);
    }
    cur = null; mountAssign = null;
  };
  for (const line of itemSrc.split('\n')) {
    const t = line.trim();
    const cm = t.match(/^case (\d+):$/);
    if (cm) { if (cur == null) cur = []; cur.push(+cm[1]); continue; }
    if (t === 'default:') { flush(); continue; }
    // SetDefaults 每个 case 块以 return;/break; 收尾（1.4.5 拆分为多个 switch(type)），
    // 都要清标签栈——否则后续无 mountType 的 case 会把标签累积进下一处赋值
    if (t === 'return;' || t === 'break;') { flush(); continue; }
    const mm = t.match(/^mountType = (\d+);$/);
    if (mm) { mountAssign = () => +mm[1]; flush(); continue; }
    // 矿车族：DefaultToMinecart(N) → mountType = N（Item.cs:48010）
    const dm = t.match(/^DefaultToMinecart\((\d+)\);$/);
    if (dm) { mountAssign = () => +dm[1]; flush(); continue; }
    const mf = t.match(/^mountType = (\d+) \+ \(type - (\d+)\);$/);
    if (mf) { const base = +mf[1], anchor = +mf[2]; mountAssign = (id) => base + (id - anchor); flush(); continue; }
    const mf2 = t.match(/^mountType = (\d+) \+ type - (\d+);$/);
    if (mf2) { const base = +mf2[1], anchor = +mf2[2]; mountAssign = (id) => base + id - anchor; flush(); continue; }
  }
}

// ---- BuffID.cs：Sets.MountType ----
const buffMount = {};
{
  const line = buffIdSrc.match(/public static int\[\] MountType = Factory\.CreateIntSet\(([^;]*)\);/)?.[1] ?? '';
  const args = [...line.matchAll(/-?\d+/g)].map((a) => +a[0]);
  args.shift();                       // 首参 = 缺省值 -1
  for (let i = 0; i + 1 < args.length; i += 2) buffMount[args[i]] = args[i + 1];
}

// ---- ★1457 Trusty 坐骑 64/65 overlay（2026-08-23 Palworld 坐骑批,重生成保留）----
// 主源已锚 1457（BJ183 基准对齐/BJ215 落闸;MountID.cs 原生即含 Trusty 族）——
// 下表保留=重产稳定性钉值（原生解析漂移时兜底,重生成保留）。原 1456 时代两坐骑：
//   Terraria.ID/MountID.cs:162 `TrustyChillet = 64` / :164 `TrustyChilletIgnis = 65`、
//   :166 Count = 66；Mount.cs:2567-2572 `SetAsChillet(mountData, 391, Extra[301], hardmode:true)`
//   → mounts[64]、`SetAsChillet(mountData, 392, Extra[302], hardmode:true)` → mounts[65]。
// 数值 = SetAsChillet hardmode 支（1457 Mount.cs:2682-2690）：dashSpeed 9/jumpHeight 11/
// jumpSpeed 8.1。非 hardmode 支 1457 终值 dashSpeed 6.5/jumpHeight 6/jumpSpeed 8.01
// （1457 Mount.cs:2691-2697 else 支;调用点 :2562/:2565 `hardmode: false`）→ 62/63 按
// CLAUDE.md"1456 与 1457 冲突以 1457 为准"在下方显式覆盖（2026-09-04 blue-fix;
// 旧注"62/63 仍 1456 旧值 9/8 不随迁"作废——盘上 json 实为 1457 终值,提取器重跑曾回退）。
// 其余字段/帧组/playerYOffsets 与 hardmode 无关
// （1457 :2691-2756 ≡ 1456 :2652-2716 逐行同,62 条目即证）。贴图与 62/63 共用
// Extra_301/302.png（1457 :2752-2753 同一 TextureAssets.Extra 下标）。
// 召唤物品 6150/6151（1457 Item.cs:47385-47410 `mountType = 64/65`,UseSound=PalSummon）+
// 坐骑 buff 391/392（1457 BuffID.cs:152 MountType 尾段 `391, 64, 392, 65`）。
// CanDash 能力位（1457 MountID.cs:11）：62-65 在表（骑乘中可发起盾冲冲刺）。
const MOUNTS_1457_TRUSTY = {
  64: {
    spawnDust: 15, heightBoost: 4, flightTimeMax: 0, fallDamage: 0.5,
    runSpeed: 3, dashSpeed: 9, acceleration: 0.32, jumpHeight: 11, jumpSpeed: 8.1,
    walkingGraceTimeMax: 10, totalFrames: 13,
    xOffset: 7, bodyFrame: 3, yOffset: -10, playerHeadOffset: 10,
    standingFrameCount: 4, standingFrameDelay: 12, standingFrameStart: 0,
    runningFrameCount: 6, runningFrameDelay: 30, runningFrameStart: 6,
    dashingFrameCount: 7, dashingFrameDelay: 130, dashingFrameStart: 5,
    flyingFrameCount: 6, flyingFrameDelay: 6, flyingFrameStart: 1,
    inAirFrameCount: 1, inAirFrameDelay: 12, inAirFrameStart: 4,
    idleFrameCount: 4, idleFrameDelay: 4, idleFrameStart: 0, idleFrameLoop: true,
    swimFrameCount: 1, swimFrameDelay: 12, swimFrameStart: 4,
    backTexture: 'Extra_301.png', buff: 391,
    playerYOffsets: [10, 10, 10, 10, 12, 16, 12, 10, 12, 16, 16, 14, 10],
  },
  65: {
    spawnDust: 15, heightBoost: 4, flightTimeMax: 0, fallDamage: 0.5,
    runSpeed: 3, dashSpeed: 9, acceleration: 0.32, jumpHeight: 11, jumpSpeed: 8.1,
    walkingGraceTimeMax: 10, totalFrames: 13,
    xOffset: 7, bodyFrame: 3, yOffset: -10, playerHeadOffset: 10,
    standingFrameCount: 4, standingFrameDelay: 12, standingFrameStart: 0,
    runningFrameCount: 6, runningFrameDelay: 30, runningFrameStart: 6,
    dashingFrameCount: 7, dashingFrameDelay: 130, dashingFrameStart: 5,
    flyingFrameCount: 6, flyingFrameDelay: 6, flyingFrameStart: 1,
    inAirFrameCount: 1, inAirFrameDelay: 12, inAirFrameStart: 4,
    idleFrameCount: 4, idleFrameDelay: 4, idleFrameStart: 0, idleFrameLoop: true,
    swimFrameCount: 1, swimFrameDelay: 12, swimFrameStart: 4,
    backTexture: 'Extra_302.png', buff: 392,
    playerYOffsets: [10, 10, 10, 10, 12, 16, 12, 10, 12, 16, 16, 14, 10],
  },
};
const NAMES_1457_TRUSTY = { 64: 'TrustyChillet', 65: 'TrustyChilletIgnis' }; // MountID.cs:162/:164
const ITEM_MOUNT_1457 = { 6150: 64, 6151: 65 };          // Item.cs:47385-47410
const BUFF_MOUNT_1457 = { 391: 64, 392: 65 };            // BuffID.cs:152 尾段
const COUNT_1457 = 66;                                    // MountID.cs:166
for (const [id, data] of Object.entries(MOUNTS_1457_TRUSTY)) {
  mounts[id] = data;
  names[id] = NAMES_1457_TRUSTY[id];
}
Object.assign(itemMount, ITEM_MOUNT_1457);
Object.assign(buffMount, BUFF_MOUNT_1457);
mountCount = COUNT_1457;
// ★1457 终值覆盖：62/63 = SetAsChillet 非 hardmode 支（1457 Mount.cs:2691-2697
// else 支 dashSpeed 6.5/jumpHeight 6/jumpSpeed 8.01；调用点 :2562/:2565 hardmode: false）。
// 主源 1456 的 else 支是旧值 9/8/8.01，此处按 1457 钉终值（jumpSpeed 8.01 两版相同不动）。
for (const id of ['62', '63']) {
  if (mounts[id]) { mounts[id].dashSpeed = 6.5; mounts[id].jumpHeight = 6; }
}
// Sets 能力位数组随 Count 扩到 66（本表全 bool 集,缺省 false）+ CanDash 64/65 置位
for (const arr of Object.values(sets)) {
  while (arr.length < mountCount) arr.push(false);
}
sets.CanDash[64] = true;
sets.CanDash[65] = true;

// ---- 贴图可得性登记 ----
const textureOk = {};
const texAvailable = (file) => typeof file === 'string' && /\.png$/.test(file) && existsSync(join(IMG, file));
for (const [id, d] of Object.entries(mounts)) {
  const layers = [d.backTexture, d.frontTexture, d.backTextureExtra, d.frontTextureExtra,
    d.backTextureGlow, d.frontTextureGlow, d.frontTextureExtraGlow].filter((f) => f !== undefined);
  const main = [d.backTexture, d.frontTexture].filter((f) => f !== undefined);
  textureOk[id] = main.length > 0 && main.every(texAvailable);
  // 全层缺素材的层剔除（不进管线），保留登记信息
  for (const slot of ['backTexture', 'frontTexture', 'backTextureExtra', 'frontTextureExtra',
    'backTextureGlow', 'frontTextureGlow', 'frontTextureExtraGlow']) {
    if (typeof d[slot] === 'string' && !texAvailable(d[slot])) delete d[slot];
  }
  if (d.playerYOffsets) d.playerYOffsets = d.playerYOffsets.map((v) => +v.toFixed(2));
}

const out = { count: mountCount, names, sets, mounts, itemMount, buffMount, textureOk };
// ================= ★BJ215 era guard：干跑对拍 / 沙箱 / --write-real（头注见上） =================
const FRESH = JSON.stringify(out, null, 1) + '\n';
if (!OUT) {
  // 缺省干跑对拍（零写盘,B-form）
  const liveRaw = existsSync(LIVE_JSON) ? readFileSync(LIVE_JSON, 'utf8') : null;
  if (!liveRaw) {
    console.error('[extract-mounts] 干跑（零写盘）：现库缺 vanilla-mounts.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
  } else if (liveRaw === FRESH) {
    console.error('[extract-mounts] 干跑对拍：重产与现库逐字节零漂移（零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
  } else {
    let live = null;
    try { live = JSON.parse(liveRaw); } catch { /* 坏损:物证落空 */ }
    console.error('[extract-mounts] 干跑对拍：漂移（零写盘 exit 1）。');
    if (live) {
      const driftSecs = ['count', 'names', 'sets', 'mounts', 'itemMount', 'buffMount', 'textureOk']
        .filter((sec) => JSON.stringify(live[sec]) !== JSON.stringify(out[sec]));
      console.error(`  漂移节: ${driftSecs.join(', ') || '(值域)'}`);
      const liveOnlyMounts = live.mounts ? Object.keys(live.mounts).filter((k) => out.mounts[k] === undefined) : [];
      if (liveOnlyMounts.length) console.error(`  mounts 现库 ${liveOnlyMounts.length} 键重产盖不住: ${liveOnlyMounts.slice(0, 10).join(', ')}`);
      for (const sec of driftSecs.filter((s) => s !== 'count' && s !== 'mounts').slice(0, 3)) {
        const keys = [...new Set([...Object.keys(live[sec] ?? {}), ...Object.keys(out[sec] ?? {})])]
          .filter((k) => JSON.stringify((live[sec] ?? {})[k]) !== JSON.stringify((out[sec] ?? {})[k]));
        console.error(`  ${sec} 差异键 ${keys.length}: ${keys.slice(0, 6).join(', ')}`);
      }
    }
    console.error('  正常更新流：定谳漂移源后 --write-real 显式写盘（SW_ITEM_VER 缺省 1457）。');
    process.exit(1);
  }
} else {
  mkdirSync(OUT.slice(0, Math.max(OUT.lastIndexOf('/'), 0)) || '.', { recursive: true });
  writeFileSync(OUT, FRESH);
  console.error(`[extract-mounts] 已写 ${OUT}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}，SW_ITEM_VER=${VER}）`);
}
const okN = Object.values(textureOk).filter(Boolean).length;
const total = Object.keys(mounts).length;
console.log(`vanilla-mounts.json: ${total}/${mountCount} mounts, ${okN} 有主贴图, ` +
  `${Object.keys(itemMount).length} 召唤物品, ${Object.keys(buffMount).length} 坐骑 buff`);
const missing = Object.entries(mounts)
  .filter(([id]) => !textureOk[id])
  .map(([id]) => `${id}:${names[id] ?? '?'}`);
if (missing.length) console.log(`贴图不可得（色块近似渲染登记）: ${missing.join(' ')}`);
