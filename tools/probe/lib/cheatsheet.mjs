/**
 * IIII238 统一探针框架 —— 常用字段真名速查(①)。
 *
 * 背景(IIIII237 实战摩擦 #1,/tmp/iii237-out/notes.md):无上下文代理首写探针
 * 脚本猜错三处字段名(ItemDrop.stack 误猜 count / 全局 tiles 表误猜、真名
 * __swTiles≡TILE_BY_KEY / 灰烬键误猜 'v_57_ash' 真名 'ash')——高频字段名不写
 * 下来,每支新探针都要回读 src 定锚一遍。
 *
 * 真值源纪律:每条带 `file`(game/ 相对路径)+ `token`(该文件里的字面子串)——
 * tests/probe-framework.test.ts「速查表源同步守卫」逐条断言 token 在 file 里,
 * src 改名/注释移位 → 测试爆红,速查表不许脱离 src 真定义漂移(防臆造)。
 * 与 docs/methodology/probe-guide.md「常用字段真名(速查)」节同源;CLI 直读:
 *   node tools/probe.mjs fields
 */

export const CHEATSHEET = {
  /** window.__sw* 全局哨兵(挂载点:src/main.ts enterGameHooks / src/mainFlow.ts) */
  globals: [
    { name: '__swGame', file: 'src/mainFlow.ts', token: '.__swGame = g;', note: 'Game 活单例(引擎正消费的那份;探针禁用 ?t= 击穿另造实例,坑表 A4)' },
    { name: '__swFlow', file: 'src/mainFlow.ts', token: '__swFlow?: unknown', note: '探针桥:newWorld/quickLoad/loadJson/createWorldProbe/itemByVid/itemByKey/spawnVanillaEnemy/spawnHostileProj/joinRoom/createRoom/doSave/…' },
    { name: '__swTiles', file: 'src/main.ts', token: '.__swTiles = TILE_BY_KEY;', note: '≡ TILE_BY_KEY:tile 定义键 → 内部 id(注册在 src/data/tiles.ts TILE_BY_KEY[d.key] = i)' },
    { name: '__swItems', file: 'src/main.ts', token: '.__swItems = ITEM_BY_KEY;', note: '≡ ITEM_BY_KEY:物品定义键 → 内部 id(src/data/items.ts)' },
    { name: '__swITEM_DEFS', file: 'src/main.ts', token: '.__swITEM_DEFS = ITEM_DEFS;', note: '物品定义表(下标=内部 id)' },
    { name: '__swVANILLA_ITEM_KEY_BY_ID', file: 'src/main.ts', token: '.__swVANILLA_ITEM_KEY_BY_ID = VANILLA_ITEM_KEY_BY_ID;', note: '原版 vid → 物品定义键(vid 反查第一跳)' },
    { name: '__swGore', file: 'src/main.ts', token: '.__swGore = liveGorePieces;', note: 'gore 池只读视图(气泡/碎块推进断言)' },
    { name: '__swGenUi', file: 'src/mainFlow.ts', token: '__swGenUi?: UIWorldLoadState', note: '生成中态采样句柄(60ms 高频采样,createGame(ui) 模式)' },
    { name: '__swAudio', file: 'src/mainFlow.ts', token: '__swAudio?: AudioSystem', note: '音频系统(sfx/bgm 双通道环,F5 录制用)' },
  ],

  /** TileStore(src/world/TileStore.ts:18,SoA 平面数组)——st = g.world.store */
  tileStore: [
    { name: 'w / h', file: 'src/world/TileStore.ts', token: 'readonly w: number;', note: '世界 tile 尺寸;index = st.idx(x, y)(y*w+x)' },
    { name: 'type', file: 'src/world/TileStore.ts', token: 'readonly type: Uint16Array;', note: 'tile 内部 id(__swTiles 键值域);JS 裸读 type≠0 = 幽灵格漏洞,判「有方块」用 hasTile' },
    { name: 'flags', file: 'src/world/TileStore.ts', token: 'readonly flags: Uint8Array; // bit0 active', note: 'bit0 = 原版 active();st.hasTile(x,y) 读它(坑表 G7)' },
    { name: 'frameX / frameY', file: 'src/world/TileStore.ts', token: 'readonly frameX: Uint16Array;', note: '帧坐标;药草 style = frameX/18(82 芽/83 开花/84 岩浆态)' },
    { name: 'liquid / liquidType', file: 'src/world/TileStore.ts', token: 'readonly liquidType: Uint8Array;', note: '液量 0-255;类型是【+1 编码】WATER=1/LAVA=2/HONEY=3/SHIMMER=4(照抄 C# ==0 判水必错,LIQUID_TYPE 注)' },
    { name: 'half / slope', file: 'src/world/TileStore.ts', token: 'readonly slope: Uint8Array;', note: '半砖位/坡面 0-4;setSlope 无条件清 half 位(坑表 G3)' },
    { name: 'wire / paint / coat', file: 'src/world/TileStore.ts', token: 'readonly wire: Uint8Array;', note: '电路位(bit0红…bit5已致动)/油漆 0-31/涂层位' },
    { name: 'setTile', file: 'src/world/TileStore.ts', token: 'setTile(x: number, y: number, type: number, frameX = 0, frameY = 0)', note: '唯一非静默写入口(触发 onTileChanged 级联);setTileSilent 仅生成/导入期+显式单点级联(坑表 G2)' },
    { name: 'get / hasTile', file: 'src/world/TileStore.ts', token: 'hasTile(x: number, y: number): boolean', note: 'get(x,y)=type 值;hasTile=flags bit0(原版 active() 语义)' },
  ],

  /** 实体(src/entities/Entity.ts:5 / ItemDrop.ts:40 / EntityManager.ts:100) */
  entities: [
    { name: 'Entity.x/y', file: 'src/entities/Entity.ts', token: 'x = 0; y = 0;          // 左上角 px', note: '左上角像素(w/h 缺省 16);cx/cy getter = 中心像素' },
    { name: 'Entity.vx/vy/dead', file: 'src/entities/Entity.ts', token: 'dead = false;', note: '清桶用 d.dead=true(下一 tick compact 剔除)+entities.length=0 直清' },
    { name: 'ItemDrop.itemId', file: 'src/entities/ItemDrop.ts', token: 'itemId: number;', note: '内部物品 id——原版 vid 须经 __swFlow.itemByVid(vid) 反查(坑表 I3)' },
    { name: 'ItemDrop.stack', file: 'src/entities/ItemDrop.ts', token: 'stack: number;', note: '堆叠数——【不是 count】(IIIII237 首写踩坑);掉落计数 drops.filter(d=>d.itemId===iid).reduce((a,d)=>a+d.stack,0)' },
    { name: 'ItemDrop.pickup', file: 'src/entities/ItemDrop.ts', token: "pickup?: 'heart' | 'star' | 'manastar';", note: '心/星类碰触即消永不进包' },
    { name: 'EntityManager', file: 'src/entities/Entity.ts', token: 'enemies: Entity[] = [];', note: 'g.entities 的桶:enemies/drops/npcs/projectiles/props/critters(全数组,length=0 清桶)' },
    { name: 'Enemy.fromVanilla', file: 'src/entities/Enemy.ts', token: 'static fromVanilla(id: number, x: number, y: number): Enemy | null {', note: '原版数据造怪;(x,y)=盒【中心】锚(ctor x−w/2/y−h/2,Enemy.ts:1984)——当左上算期望偏 w/2(坑表 I1);探针走 world.spawnEnemy/spawnTownNPC 包装' },
    { name: 'TOWN_NPC_IDS', file: 'src/data/vanillaNpcs.ts', token: 'export const TOWN_NPC_IDS: Record<string, { id: number; extra: number }> = {', note: '城镇 NPC 登记键→原版 vid(40 键含宠物/旅商);未登记键 ctor 静默兜底向导贴图(TownNPC.ts:1322)——spawnTownNPC 先验键防 vacuous' },
  ],

  /** 玩家(src/entities/Player.ts:579 / src/items/Inventory.ts:142) */
  player: [
    { name: 'player.x/y/cx/cy', file: 'src/entities/Player.ts', token: 'export class Player extends Entity {', note: '左上角 px + 中心 getter(Entity 基类);传送直接写 x/y+vx/vy(camera.snap 另见框架 teleport)' },
    { name: 'player.debugGod', file: 'src/entities/Player.ts', token: 'debugGod = false;', note: '上帝模式(必死类场景断言先开,框架 godMode)' },
    { name: 'player.inv', file: 'src/entities/Player.ts', token: 'inv: Inventory;', note: 'Inventory(src/items/Inventory.ts:142)' },
    { name: 'inv.slots', file: 'src/items/Inventory.ts', token: 'slots: Array<InvItem | null>;', note: '0-49 背包(0-9 快捷栏)/50-53 钱币/54-57 弹药;格形 {id, stack}' },
    { name: 'AMMO_START', file: 'src/items/Inventory.ts', token: 'export const AMMO_START = 54;', note: '弹药槽起点(54-57 ×4);批量给物走 world.giveItems([{vid,slot}]),自动位只扫 0-49 背包' },
    { name: 'inv.selected', file: 'src/items/Inventory.ts', token: 'selected = 0; // 快捷栏选中格', note: '手持 = slots[selected];armor[20]/dye[10]/miscEquips[5] 同在 inv 上' },
    { name: 'player.useTime', file: 'src/entities/Player.ts', token: 'useTime', note: '使用节拍计数(cleanUpToIdle 归 0 防段间脏态,坑表 D7)' },
  ],

  /** 时钟(src/world/World.ts:46 Clock;推进点 src/core/Game.ts:7643) */
  clock: [
    { name: 'clock.timeOfDay', file: 'src/world/World.ts', token: 'timeOfDay: number = 8.25 / 24;', note: '0..1 线性 24h(0=午夜 0.5=正午;起始 8:15AM);时辰门断言的唯一钟面口径' },
    { name: 'clock.isDay', file: 'src/world/World.ts', token: 'get isDay(): boolean', note: '昼=DAWN..DUSK(4.5/24..19.5/24),即 4:30-19:30' },
    { name: 'Clock.vanillaMainTime', file: 'src/world/World.ts', token: 'static vanillaMainTime(timeOfDay: number): number', note: 'tod → 分段 Main.time ticks(昼 0..54000/夜 0..32400);时辰门阈值(如药草 40500)必须用它换算,勿 tod×86400 直比(IIIII237 病灶)' },
    { name: 'clock.moonPhase/bloodMoon', file: 'src/world/World.ts', token: 'moonPhase: number = 0;', note: '月相 0-7(0=满月 4=新月)/血月旗' },
    { name: 'world.groundLevel', file: 'src/world/World.ts', token: 'groundLevel = 0; rockLevel = 0;', note: 'tile 坐标(地表/岩层线;场景选 y 的锚)' },
    { name: 'world.w / world.h', file: 'src/world/World.ts', token: 'get w() { return this.store.w; }', note: 'tile 尺寸(getter 转发 store)' },
  ],

  /** Game 高频方法(src/core/Game.ts)——TS private 运行时可直调(坑表 G11) */
  game: [
    { name: 'fixedUpdate(dt)', file: 'src/core/Game.ts', token: 'private fixedUpdate(dt: number) {', note: '签名 (dt,game) 少参必炸(坑表 D8);探针泵 g.fixedUpdate(1/60),框架 pump 全内置' },
    { name: 'interactAt(tx,ty)', file: 'src/core/Game.ts', token: 'private interactAt(tx: number, ty: number) {', note: '右键全格交互门(采收/开箱/家具/NPC 交谈);采收类断言直调=最快取证路(IIIII237)' },
    { name: 'breakTile(...)', file: 'src/core/Game.ts', token: 'breakTile(x: number, y: number, byPlayer = false, noItem = false, pickHit = false) {', note: '破坏原语(KillTile 头门 active() 在内);破坏掉落断言直调' },
    { name: 'isAlchemyPlantHarvestable(style,y)', file: 'src/core/Game.ts', token: 'private isAlchemyPlantHarvestable(style: number, y: number): boolean {', note: '药草时辰门(style=frameX/18;style5=火焰花昼 15:45 窗);门谓词直调免摆玩家' },
    { name: 'camera', file: 'src/core/Game.ts', token: 'this.camera = new Camera(w.w, w.h);', note: 'camera.x/y=世界像素;camera.worldToScreen(wx,wy)→[sx,sy](src/render/Camera.ts:61)' },
    { name: 'input', file: 'src/core/Input.ts', token: 'mouseDown = false;', note: 'mouseX/mouseY(屏幕 px)/mouseDown(边沿消费,用完自清)/mouseHeld/rightDown' },
    { name: 'world.dayRate()', file: 'src/world/World.ts', token: 'dayRate(): number {', note: '时间推进倍率(快进 60/旅程冻结 0/全员睡 5×);freezeClock 冻结不依赖它' },
  ],

  /** 键名惯例(两处首写踩坑的家) */
  keys: [
    { name: "tile 'ash'", file: 'src/data/tiles.ts', token: "key: 'ash',", note: '灰烬=素名 ash【不是 v_57_ash】(IIIII237 首写踩坑);vanilla.sheet=57' },
    { name: "tile 'v_<sheet>_<name>'", file: 'src/data/tiles.ts', token: "key: 'v_83_herbs_mature',", note: '原版映射族键 = v_<vanillaSheet>_<snake_name>;常见土石块用素名(dirt/stone/ash/torch…)' },
    { name: 'TILE_BY_KEY 注册', file: 'src/data/tiles.ts', token: 'TILE_BY_KEY[d.key] = i', note: 'def key → 内部 id 的唯一注册点(__swTiles 即它);不确定时用框架 world.findTileBySheet(page, vanillaSheet) 反查' },
    { name: "item 'vi_<vid>_<Name>'", file: 'src/data/items.ts', token: "const m = /^vi_(\\d+)_/", note: '物品键惯例 vi_<原版vid>_<原名>;legacy 素键已退役——vid 一律走 __swFlow.itemByVid(坑表 I3/I4)' },
  ],
};

/** 速查表标题(分组名 → 中文说明;cheatsheetText/guide 速查节共用)。 */
export const CHEATSHEET_GROUPS = {
  globals: 'window.__sw* 全局哨兵',
  tileStore: 'TileStore(g.world.store)',
  entities: '实体(Entity/ItemDrop/g.entities)',
  player: '玩家(player/inv)',
  clock: '时钟与世界标量(world.clock)',
  game: 'Game 高频方法(TS private 运行时可直调)',
  keys: '键名惯例(tile/item)',
};

/**
 * 人类可读文本(CLI `node tools/probe.mjs fields` 输出)。
 * filter:子串过滤(对组名/字段名/备注);空=全量。
 */
export function cheatsheetText(filter = '') {
  const f = String(filter).toLowerCase();
  const out = ['常用字段真名速查(IIIII238;真值源锚定 src,守卫=tests/probe-framework.test.ts)', ''];
  for (const [group, entries] of Object.entries(CHEATSHEET)) {
    const rows = entries.filter((e) => !f
      || group.toLowerCase().includes(f)
      || e.name.toLowerCase().includes(f)
      || e.note.toLowerCase().includes(f)
      || e.file.toLowerCase().includes(f));
    if (!rows.length) continue;
    out.push(`## ${CHEATSHEET_GROUPS[group] ?? group}`);
    for (const e of rows) out.push(`  ${e.name}  ← ${e.file}\n      ${e.note}`);
    out.push('');
  }
  return out.join('\n');
}
