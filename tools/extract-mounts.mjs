// 坐骑全量提取器（1.4.5.6）：
//   Terarria1456/Terraria.ID/MountID.cs  → 全部 id→内部名 + Sets 能力位
//   Terarria1456/Terraria/Mount.cs       → Initialize() 每坐骑 MountData 数值/帧组/贴图引用
//                                           + SetAsMinecart/Horse/RollerSkate/Chillet 助手展开
//   Terarria1456/Terraria/Item.cs        → SetDefaults switch：case 块内 `mountType = N`
//                                           （含 40+(type-4785) / 44+type-4792 两条公式族）
//   Terarria1456/Terraria.ID/BuffID.cs   → BuffID.Sets.MountType（buff → mount）
// 输出 src/data/vanilla-mounts.json：
//   { mounts: { id: MountData }, itemMount: { itemId: mountId }, buffMount: { buffId: mountId },
//     sets: { Cart: [...], ... }, names: { id: internalName }, textureOk: { id: bool } }
// 贴图可得性：terraria-assets/Images 下查 Mount_*.png / Rudolph_N.png / Extra_N.png；
// 不可得（QueenSlime 走 RenderTarget / 部分新坐骑 Extra 缺表）登记 textureOk=false，
// 运行侧回退色块近似渲染。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOUNT_ID = join(ROOT, 'Terarria1456', 'Terraria.ID', 'MountID.cs');
const MOUNT = join(ROOT, 'Terarria1456', 'Terraria', 'Mount.cs');
const ITEM = join(ROOT, 'Terarria1456', 'Terraria', 'Item.cs');
const BUFF_ID = join(ROOT, 'Terarria1456', 'Terraria.ID', 'BuffID.cs');
const IMG = join(ROOT, 'terraria-assets', 'Images');
const OUT = join(ROOT, 'game', 'src', 'data', 'vanilla-mounts.json');

const mountIdSrc = readFileSync(MOUNT_ID, 'utf8');
const mountSrc = readFileSync(MOUNT, 'utf8');
const itemSrc = readFileSync(ITEM, 'utf8');
const buffIdSrc = readFileSync(BUFF_ID, 'utf8');

// ---- MountID.cs：const int 名表 ----
const names = {};
for (const m of mountIdSrc.matchAll(/^\tpublic const int (\w+) = (\d+);$/gm)) names[+m[2]] = m[1];
const mountCount = +(mountIdSrc.match(/public static int Count = (\d+);/)?.[1] ?? 0);

// ---- MountID.cs Sets：CreateBoolSet(...) / CreateIntSet(...) 展开 ----
//  bool 集：args 全部为置位索引；int 集：首参为缺省值、其后 (键, 值) 成对
const sets = {};
for (const m of mountIdSrc.matchAll(/^\tpublic static (bool|int)\[\] (\w+) = Factory\.Create(?:Bool|Int)Set\(([^;]*)\);$/gm)) {
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
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return '';
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
  let yBase = null;                 // playerYOffsets 循环基值
  const yDelta = new Map();         // 帧索引 → 增量
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
    // playerYOffsets 循环填充：array[i] = <num> - vertOff + pVertOff
    const fill = t.match(/^array\[i\] = (-?\d+)(?: - (\w+))?(?: \+ (\w+))?;/);
    if (fill) yBase = { v: +fill[1], minus: fill[2] ?? null, plus: fill[3] ?? null };
    const plus = t.match(/^array\[(\w+)\] \+= (-?\d+);$/);
    if (plus) {
      const k = plus[1] === 'array.Length - 1' ? -1 : +plus[1];
      yDelta.set(k, (yDelta.get(k) ?? 0) + (+plus[2]));
    }
    const set = t.match(/^array\[(\d+)\] -= (-?\d+);$/);
    if (set) yDelta.set(+set[1], (yDelta.get(+set[1]) ?? 0) - (+set[2]));
    // 贴图四层
    for (const slot of ['backTexture', 'backTextureGlow', 'backTextureExtra', 'frontTexture', 'frontTextureGlow', 'frontTextureExtra']) {
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
  for (const slot of ['backTexture', 'backTextureGlow', 'backTextureExtra', 'frontTexture', 'frontTextureGlow', 'frontTextureExtra']) {
    if (typeof d[slot] === 'string') d[slot] = texOf(d[slot]) ?? d[slot];
  }
  // playerYOffsets 定稿
  if (yBase !== null && d.totalFrames) {
    const n = d.totalFrames;
    const off = yBase.minus === 'verticalOffset' ? (extra.verticalOffset ?? 0) : 0;
    const add = yBase.plus === 'playerVerticalOffset' ? (extra.playerVerticalOffset ?? 0) : 0;
    d.playerYOffsets = Array.from({ length: n }, (_, i) =>
      yBase.v - off + add + (yDelta.get(i) ?? 0));
    if (yDelta.has(-1)) d.playerYOffsets[n - 1] += yDelta.get(-1);
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

// ---- 贴图可得性登记 ----
const textureOk = {};
const texAvailable = (file) => typeof file === 'string' && /\.png$/.test(file) && existsSync(join(IMG, file));
for (const [id, d] of Object.entries(mounts)) {
  const layers = [d.backTexture, d.frontTexture, d.backTextureExtra, d.frontTextureExtra,
    d.backTextureGlow, d.frontTextureGlow].filter((f) => f !== undefined);
  const main = [d.backTexture, d.frontTexture].filter((f) => f !== undefined);
  textureOk[id] = main.length > 0 && main.every(texAvailable);
  // 全层缺素材的层剔除（不进管线），保留登记信息
  for (const slot of ['backTexture', 'frontTexture', 'backTextureExtra', 'frontTextureExtra',
    'backTextureGlow', 'frontTextureGlow']) {
    if (typeof d[slot] === 'string' && !texAvailable(d[slot])) delete d[slot];
  }
  if (d.playerYOffsets) d.playerYOffsets = d.playerYOffsets.map((v) => +v.toFixed(2));
}

const out = { count: mountCount, names, sets, mounts, itemMount, buffMount, textureOk };
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
const okN = Object.values(textureOk).filter(Boolean).length;
const total = Object.keys(mounts).length;
console.log(`vanilla-mounts.json: ${total}/${mountCount} mounts, ${okN} 有主贴图, ` +
  `${Object.keys(itemMount).length} 召唤物品, ${Object.keys(buffMount).length} 坐骑 buff`);
const missing = Object.entries(mounts)
  .filter(([id]) => !textureOk[id])
  .map(([id]) => `${id}:${names[id] ?? '?'}`);
if (missing.length) console.log(`贴图不可得（色块近似渲染登记）: ${missing.join(' ')}`);
