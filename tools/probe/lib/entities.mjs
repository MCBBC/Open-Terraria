/**
 * IIII242 统一探针框架 —— 实体/物品/反查包装组(IIIRS241 缺口矩阵 G4 收编)。
 *
 * 四域纯包装(桥/表全在 src,本件零业务逻辑;~150 行消除 14% 探针的手写重复):
 *   反查  tileIdBySheet(vanilla sheet → 内部 tile id,查表版;与 world.findTileBySheet
 *         扫描版并存——查表=定坐标前先拿 id,扫描=直接找场上格子);
 *         vid→内部物品 id=world.itemByVid(IIII236 已收编,不在此重复)。
 *   生成  spawnEnemy(vid/中心锚/aiInit;走 __swFlow.spawnVanillaEnemy 桥)/
 *         spawnTownNPC(key/tile 锚/home;走 TownNPC ctor+_iii234 mkNpc 判例)。
 *   清场  clearEnemies(实体桶 length=0 清;EntityManager 桶名防臆造)。
 *   给物  giveItems(vid→slot 批量;0-49 背包/50-53 钱币/54-57 弹药,Inventory.ts:142)。
 *
 * 坑史锚:
 *  - 坑表 I1/memory: spikeball 探针锚点三踩 —— Enemy ctor x−w/2/y−h/2【中心锚】
 *    (src/entities/Enemy.ts:1984),把 (x,y) 当盒左上算期望=偏 w/2;
 *  - 坑表 I2/memory: spikeball ① —— 出生帧把链画向世界原点:刷怪相位在
 *    entities.update 之后,ai 字段类默认 (0,0) → aiInit 在出生帧前补齐链字段;
 *  - 坑表 I3/I4 —— vid→内部 id 唯一合法通道=__swFlow.itemByVid(键名卫生后
 *    裸键已退役);NPC 键=TOWN_NPC_IDS 登记键(src/data/vanillaNpcs.ts:166,
 *    40 键含宠物/旅商),未登记 ctor 会静默兜底向导贴图(TownNPC.ts:1322)
 *    → 本件先验键,防 typo 空转成 vacuous 断言;
 *  - memory: iii234(_iii234-probe mkNpc)/paladin(spawnPaladin) —— spawn+home
 *    +清桶三件套的判例形态,本件为其库化。
 *
 * 页内实现函数(`__*InPage`)独立导出:框架自测(tests/probe-framework.test.ts)
 * 在 Node 里对假 window 直跑,零浏览器(staging.mjs 同款纪律)。`__Ctor`/
 * `__TILE_DEFS`/`__TOWN_NPC_IDS` 注入口仅供框架自测换替身——生产路径禁传
 * (函数/类不跨 evaluate 序列化,传了也到不了页面)。
 *
 * import 纪律(坑表 A4):数据表(tiles.ts/vanillaNpcs.ts)带 ?t= 击穿 stale 转换
 * 缓存(无状态表合法);**TownNPC.ts 裸 import**——引擎多处 `instanceof TownNPC`
 * 消费实例(Game.ts:3596/6134/6818/6824/6995),?t= 副本=另一 class 身份,生成物
 * 会被引擎静默排除;裸 import 与引擎模块图同源。
 */
import { front } from './browser.mjs';

/** 页内:vanilla sheet → 内部 tile id(TILE_DEFS 查表;内部 id ≠ 原版 vid)。 */
export async function __tileIdBySheetInPage({ sheet, __TILE_DEFS = null } = {}) {
  let defs = __TILE_DEFS;
  if (!defs) ({ TILE_DEFS: defs } = await import(`/src/data/tiles.ts?t=${Date.now()}`));
  const id = (defs ?? []).findIndex((d) => d?.vanilla?.sheet === sheet);   // 谓词与 world.findTileBySheet 同源
  return id >= 0 ? { ok: true, id, key: defs[id].key } : { ok: false, why: 'no-sheet', sheet };
}

/** 查表反查:vanilla sheet → 内部 tile id(返回 {ok,id,key};未登记报 no-sheet)。 */
export async function tileIdBySheet(page, sheet) {
  return page.evaluate(__tileIdBySheetInPage, { sheet });
}

/** 页内:桥生成原版敌怪+出生帧前 aiInit(aiSrc 为函数源码,new Function 重建,pumpUntil 同款)。 */
export async function __spawnEnemyInPage({ vid, x, y, aiSrc = null } = {}) {
  const g = window.__swGame;
  const flow = window.__swFlow;
  if (!g || typeof flow?.spawnVanillaEnemy !== 'function') return { ok: false, why: 'no-bridge' };
  const meta = await flow.spawnVanillaEnemy(vid, x, y);   // 桥内 Enemy.fromVanilla+entities.add('enemies')
  if (!meta) return { ok: false, why: 'spawn-failed', vid };
  let refFound = false;
  if (aiSrc) {
    const e = (g.entities.enemies ?? []).find((en) => en.id === meta.id);
    if (e) { refFound = true; new Function('e', 'g', `return (${aiSrc})(e, g);`)(e, g); }
  }
  return { ok: true, ...meta, refFound };
}

/**
 * 生成原版敌怪(vid=原版 NPC id;x,y=盒【中心】世界像素,坑表 I1)。
 * aiInit(e,g):出生帧前对实体补 ai 字段(坑表 I2 链族必带,防首帧画向原点);
 * 返回 {ok,id,x,y,hp,refFound}(refFound=false=aiInit 没找到实体,断言自行裁决)。
 */
export async function spawnEnemy(page, vid, x, y, aiInit = null) {
  await front(page);
  return page.evaluate(__spawnEnemyInPage, { vid, x, y, aiSrc: aiInit ? aiInit.toString() : null });
}

/** 页内:TownNPC 生成(tile 锚/盒中心对列心/脚底=地面行顶/home 站格;键先验)。 */
export async function __spawnTownNPCInPage({ key, tx = null, ty = null, x = null, yFoot = null, home = null, __Ctor = null, __TOWN_NPC_IDS = null } = {}) {
  const g = window.__swGame;
  if (!g) return { ok: false, why: 'no-game' };
  let TownNPC = __Ctor, TOWN_NPC_IDS = __TOWN_NPC_IDS;
  // ★TownNPC.ts 禁 ?t= 击穿(坑表 A4 单例类纪律):Game.ts:3596/6134/6818/6824/6995
  //   用 instanceof TownNPC 消费实例——?t= 新开模块副本=另一 class 身份,生成物被
  //   引擎判 false 静默排除;裸 import 与引擎图同源。vanillaNpcs=无状态表,?t= 合法。
  if (!TownNPC) ({ TownNPC } = await import('/src/entities/TownNPC.ts'));
  if (!TOWN_NPC_IDS) ({ TOWN_NPC_IDS } = await import(`/src/data/vanillaNpcs.ts?t=${Date.now()}`));
  if (!TOWN_NPC_IDS?.[key]) return { ok: false, why: `unknown-key:${key}` };   // 未登记键 ctor 静默兜底向导(TownNPC.ts:1322),先验防 vacuous
  const cx = tx != null ? tx * 16 + 8 : x;               // tile 列心 px(tx 锚)或直给 px
  const foot = ty != null ? (ty + 1) * 16 : yFoot;        // 脚底=地面行顶(站格 ty 的下一行顶)
  const n = new TownNPC(key, cx, foot);                   // ctor:y=foot−h(TownNPC.ts:1330 底锚)
  n.x = cx - n.w / 2;                                     // 盒中心对列心(ctor 只写 raw x,不居中)
  n.home = home ?? (tx != null && ty != null ? { x: tx, y: ty } : null);
  g.entities.add(n, 'npcs');
  return { ok: true, key, vid: n.vanillaId, x: n.x, y: n.y, w: n.w, h: n.h, home: n.home };
}

/**
 * 生成城镇 NPC(key=TOWN_NPC_IDS 登记键)。
 * tile 锚:{tx, ty} —— ty=站格(地面行−1);脚底落在 (ty+1)*16(地面行顶,ctor 底锚
 * 语义 TownNPC.ts:1330,免 _iii234 mkNpc 顶锚后的 unembed 沉降依赖);
 * home 缺省={x:tx,y:ty}(TownNPC.home 站格口径:home.y=地面行−1,TownNPC.ts:1873 注,
 * 非原版 homeTileY 地面行)。像素直给:{x, yFoot, home}。
 * 返回 {ok,key,vid,x,y,w,h,home}。
 */
export async function spawnTownNPC(page, key, opts = {}) {
  await front(page);
  return page.evaluate(__spawnTownNPCInPage, { key, ...opts });
}

/** 页内:实体桶清空(先验后清——桶名臆造不产生半清场)。 */
export function __clearEnemiesInPage({ kinds = ['enemies', 'drops', 'projectiles'] } = {}) {
  const g = window.__swGame;
  if (!g?.entities) return { ok: false, why: 'no-game' };
  const buckets = [];
  for (const k of kinds) {
    const arr = g.entities[k];
    if (!Array.isArray(arr)) return { ok: false, why: `no-bucket:${k}` };   // 桶名=enemies/drops/npcs/projectiles/props/critters
    buckets.push([k, arr]);
  }
  const cleared = {};
  for (const [k, arr] of buckets) { cleared[k] = arr.length; arr.length = 0; }   // length=0 清桶(EntityManager 素数组;cheatsheet entities 判例)
  return { ok: true, cleared };
}

/**
 * 清实体桶(缺省 enemies/drops/projectiles;pump.clearEnemies 同款+drops+npcs 等可选)。
 * 返回 {ok, cleared:{桶名:清掉个数}}(计数可作"场上有怪"预断言)。
 */
export async function clearEnemies(page, opts = {}) {
  await front(page);
  return page.evaluate(__clearEnemiesInPage, opts);
}

/** 页内:批量给物(vid→iid 走 __swFlow.itemByVid;wipe 先清 0-57;select 钉选中格)。 */
export function __giveItemsInPage({ items = [], wipe = false, select = null } = {}) {
  const g = window.__swGame;
  const inv = g?.player?.inv;
  const flow = window.__swFlow;
  if (!inv?.slots) return { ok: false, why: 'no-inv' };
  if (typeof flow?.itemByVid !== 'function') return { ok: false, why: 'no-bridge' };
  if (wipe) for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = null;   // 全 58 格清(含钱币/弹药)
  const placed = [], failed = [];
  let auto = 0;
  const nextFree = () => { while (auto < 50 && inv.slots[auto]) auto++; return auto < 50 ? auto : null; };   // 自动位只扫 0-49 背包(钱币/弹药不自动占)
  for (const it of items) {
    const stack = it.stack ?? 1;
    const slot = it.slot != null ? it.slot : nextFree();
    if (slot == null || slot < 0 || slot >= inv.slots.length) { failed.push({ vid: it.vid, why: 'no-slot' }); continue; }
    const iid = flow.itemByVid(it.vid);
    if (iid == null || iid < 0) { failed.push({ vid: it.vid, why: 'no-vid' }); continue; }
    inv.slots[slot] = { id: iid, stack };   // 格形 {id,stack}(cheatsheet inv.slots 判例;直接写位,不走上包链)
    placed.push({ vid: it.vid, iid, slot, stack });
  }
  if (select != null) inv.selected = select;
  return { ok: failed.length === 0, placed, failed, selected: inv.selected };
}

/**
 * 批量给物([{vid, stack?, slot?}], {wipe?, select?}):vid→内部 id 反查唯一走
 * __swFlow.itemByVid(坑表 I3);slot 缺省自动占 0-49 首个空格,弹药槽 54-57/
 * 钱币 50-53 显式给 slot(Inventory.ts:142 布局);wipe=true 先清全 58 格做净夹具;
 * select=格号钉 inv.selected(单件手持用 world.holdItem 即可)。
 * 返回 {ok, placed:[{vid,iid,slot,stack}], failed:[{vid,why}], selected}。
 */
export async function giveItems(page, items, opts = {}) {
  await front(page);
  return page.evaluate(__giveItemsInPage, { items, ...opts });
}
