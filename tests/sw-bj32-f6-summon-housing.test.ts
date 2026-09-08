// SW-BJ32 2026-09-08【F6 面板召唤的哥布林工匠无法分配住房（用户实报）】
//
// 定谳（机制级）：
//   · 数据面无罪——F6 召唤形态 TownNPC('goblin_tinkerer')（npcs 桶/107/home=null/
//     bound=false/homelessDespawn=false）与自然入驻/绑缚解救形态在住房分配链
//     （HousingPanel.housingHeadRows → game.housingMode → updateUse 拦截 →
//     Game.housingAssign → housingCheckAt → home 写入）上完全同构；vanilla
//     MoveTownNPC（WorldGen.cs:4602）对 107 无任何特化门
//     （CheckSpecialTownNPCSpawningConditions 仅 160 松露人有条件,WorldGen.cs:4884+）。
//   · 断点在交互层两处（均 F6 面板专属）：
//     ① DebugSummonPanel 根节点曾是无类裸 div——不在 core/input/domTargets.ts 的
//       DOM_UI_TARGET_SELECTOR 名单（★2026-08-28 商店案同族：漏登记 = UI 点击漏成
//       世界挥击/挖掘；Game.inpOverDomUi 同名单同步盲区）；
//     ② F6 面板 fixed 右上 350×78vh z-index 99999，完整罩住住房右缘条
//       （HousingPanel right:36 top:160 z-index 60）与原版布局住房页同一角落——
//       住房 UI 开着再按 F6 召唤 ⇒ 哥布林工匠头像点击被面板吞掉 → housingMode
//       永不置位 → 点房分配静默无效（housingAssign 的 !npc 早退无反馈）。
//   · 修法（原版无此面板,规范锚 = domTargets.ts 单一名单约定 + HousingPanel 的
//     「Input mousedown UI 过滤器」.sw-panel 前例 + 双面板互斥）：
//     ① 根节点挂 .sw-summon-panel 并登记进名单；② 双向互斥——开 F6 面板经既定
//     单发通道 cb.onHousingCursor(null) 关住房条（cursorChanged(null) 自毁 +
//     onCursor(null) 清 housingMode）,开住房条先关 F6 面板。
// 原版锚（Terarria1457）：Main.DrawNPCHousesInUI :42717+（行集=_npcIndexWhoHoldsHeadIndex
//   按 HeadListOrder,SetMouseNPC :42783 选人）;Main.TryMovingNPC :45928 →
//   WorldGen.MoveTownNPC :4602 → moveRoom :4785（homeless=true→SpawnTownNPC 重安家）。
// 本文件三面：召唤形态+分配端到端（裸原型 Game,同 BJ10/BJ31 惯例）/ 多 NPC 采样 /
// 结构锁（DOM 登记与互斥双向 + 与 SW-BJ25 格交互优先级的互作不回归）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { EntityManager } from '../src/entities/Entity';
import { TownNPC } from '../src/entities/TownNPC';
import { Game } from '../src/core/Game';
import { isDomUiTarget } from '../src/core/input/domTargets';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { housingHeadRows } from '../src/ui/HousingPanel';

const DOOR_C = TILE_BY_KEY['door_closed']!;

/** 标准小房（同 housing-nearplayer-chain/sw-bj2 buildHouse 形态） */
function buildHouse(w: World, ox: number, oy: number): void {
  const st = w.store;
  for (let x = ox; x <= ox + 10; x++) {
    st.setTileSilent(x, oy, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(x, oy + 5, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) {
    st.setTileSilent(ox, y, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(ox + 10, y, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) for (let x = ox + 1; x <= ox + 9; x++) st.wall[st.idx(x, y)] = 4;
  for (const dx of [ox, ox + 10]) {
    for (let y = oy + 2; y <= oy + 4; y++) st.setTileSilent(dx, y, DOOR_C, 0, (y - oy - 2) * 18);
  }
  st.setTileSilent(ox + 1, oy + 1, TILE_BY_KEY['torch']!, 22, 0);
  st.setTileSilent(ox + 9, oy + 1, TILE_BY_KEY['torch']!, 44, 0);
  st.setTileSilent(ox + 4, oy + 3, TILE_BY_KEY['chair']!, 0, 0);
  for (let dx = 0; dx <= 2; dx++) {
    st.setTileSilent(ox + 5 + dx, oy + 3, TILE_BY_KEY['table']!, dx * 18, 0);
    st.setTileSilent(ox + 5 + dx, oy + 4, TILE_BY_KEY['table']!, dx * 18, 18);
  }
}

interface BareGame {
  entities: EntityManager;
  world: World;
  player: { cx: number; cy: number; dead: boolean };
  camera: { screenToWorld(x: number, y: number): [number, number] };
  input: { mouseX: number; mouseY: number; mouseDown: boolean; uiBlocking: boolean };
  sfx: { play(n: string, v?: number): void };
  achievements: { notifyProgressionEvent(n: number): void };
  recorder: { log(k: string, d: unknown): void };
  cb: { onHousingCursor?: (m: unknown) => void };
  summonPanel: { open: boolean; toggle(): void } | null;
  prioritizedTownNPCType: number;
  texts: string[];
  debugSpawnNpc(id: number, count: number, atMouse: boolean): string | null;
  housingAssign(x: number, y: number, npcKey: string): boolean;
  housingQuery(x: number, y: number): void;
  toggleSummonPanel(): void;
}

/** 裸原型 Game（Game 无 DOM 不可构造,BJ10/BJ31 同惯例）：真实 EntityManager+World,
 *  stub 只覆盖 Game 外部副作用面（音效/公告/成就/行为录制/相机） */
function bareGame(w: World, px = 2050, py = 320): BareGame {
  const g = Object.create(Game.prototype) as unknown as BareGame;
  g.entities = new EntityManager();
  g.world = w;
  g.player = { cx: px * TILE, cy: py * TILE, dead: false };
  g.camera = { screenToWorld: (x, y) => [x, y] };
  g.input = { mouseX: 0, mouseY: 0, mouseDown: false, uiBlocking: false };
  g.sfx = { play: () => {} };
  g.achievements = { notifyProgressionEvent: () => {} };
  g.recorder = { log: () => {} };
  g.cb = {};
  g.summonPanel = null;
  g.prioritizedTownNPCType = 0;
  g.texts = [];
  (g as unknown as { newText: (t: string) => void }).newText =
    (t: string) => { g.texts.push(t); };
  return g;
}

describe('SW-BJ32 ① F6 召唤形态（debugSpawnNpc 城镇臂）', () => {
  it('107 哥布林工匠 → npcs 桶 TownNPC：npcKey/vanillaId/无 bound/home=null/底锚', () => {
    const w = new World(4200, 1200, 321, 'open');
    const g = bareGame(w);
    expect(g.debugSpawnNpc(107, 1, false)).toBeNull();
    expect(g.entities.npcs.length).toBe(1);
    const goblin = g.entities.npcs[0] as TownNPC;
    expect(goblin instanceof TownNPC).toBe(true);
    expect(goblin.npcKey).toBe('goblin_tinkerer');
    expect(goblin.vanillaId).toBe(107);            // 城镇态本体（绑缚态 105 是另一型,BJ31 域）
    expect(goblin.bound).toBe(false);              // F6 直出即解救后形态（bound 臂只属救援链）
    expect(goblin.home).toBeNull();                // homeless（本仓 home=null 承接）
    expect(goblin.homelessDespawn).toBe(false);    // 非流浪生成,不进夜扫（UnspawnHomelessNPC :5127 门）
    // 底锚：spawn y=player.cy-24 → 脚底恰在 y（TownNPC ctor y-h,NewNPC Bottom 锚 NPC.cs:46596）
    expect(goblin.y + goblin.h).toBe(g.player.cy - 24);
    // 非城镇 id 走敌怪臂：不进 npcs 桶
    expect(g.debugSpawnNpc(1, 1, false)).toBeNull();
    expect(g.entities.npcs.length).toBe(1);
    expect(g.entities.enemies.length).toBe(1);
  });
});

describe('SW-BJ32 ② 住房分配端到端（召唤→面板行→分配→home 写入）', () => {
  it('F6 哥布林工匠：面板行在列,分配成功=home/leashHome/优先型锁/公告/成就 8', () => {
    const w = new World(4200, 1200, 322, 'open');
    buildHouse(w, 2000, 300);
    const g = bareGame(w);
    expect(g.debugSpawnNpc(107, 1, false)).toBeNull();
    const goblin = g.entities.npcs[0] as TownNPC;

    // 住房面板行集（Main.cs:42729 同源过滤：在世+持头索引+非 21/80）
    const rows = housingHeadRows(g as unknown as Game);
    const row = rows.find((r) => r.npcKey === 'goblin_tinkerer');
    expect(row).toBeDefined();
    expect(row!.headIndex).toBe(9);                // TOWN_NPC_HEAD_INDEX[107]
    expect(row!.vanillaId).toBe(107);

    // 分配（房中心点击）→ TryMovingNPC+moveRoom 成功面
    const progEvents: number[] = [];
    g.achievements.notifyProgressionEvent = (n) => progEvents.push(n);
    expect(g.housingAssign(2005, 303, 'goblin_tinkerer')).toBe(true);
    expect(goblin.home).toEqual({ x: 2005, y: 304 });   // 房内站格（room.standX/standY）
    expect(goblin.leashHome).toBe(true);                // moveRoom 手动安家面（:4791-4804）
    expect(goblin.homelessDespawn).toBe(false);         // RelocatedHomeless 同面清流浪标（:5380）
    expect(g.prioritizedTownNPCType).toBe(107);         // ★SW-BO1 锁型（moveRoom :4768-4770）
    expect(progEvents).toContain(8);                    // NO_HOBO 成就面（WorldGen.cs:5702/:5498）
    expect(g.texts.some((t) => t.includes('Announcement.HasArrived'))).toBe(true);
  });

  it('分配失败路径保留反馈：点非房格 → housingQuery 文案（不静默）', () => {
    const w = new World(4200, 1200, 323, 'open');
    buildHouse(w, 2000, 300);
    const g = bareGame(w);
    expect(g.debugSpawnNpc(107, 1, false)).toBeNull();
    expect(g.housingAssign(2200, 303, 'goblin_tinkerer')).toBe(false);   // 无房野地
    expect(g.texts.length).toBeGreaterThan(0);       // 失败必有文案（inter 40 族）
    const goblin = g.entities.npcs[0] as TownNPC;
    expect(goblin.home).toBeNull();
  });
});

describe('SW-BJ32 ③ 多 NPC 采样（城镇臂 1:1 无型特化）', () => {
  it('向导 22/商人 17 同链分配成功;松露 160 特化门 → 拒且非静默', () => {
    const w = new World(4200, 1200, 324, 'open');
    buildHouse(w, 2000, 300);
    buildHouse(w, 2030, 300);
    const g = bareGame(w);
    for (const id of [22, 17, 160]) expect(g.debugSpawnNpc(id, 1, false)).toBeNull();
    const byKey = (key: string): TownNPC =>
      g.entities.npcs.find((n) => (n as TownNPC).npcKey === key) as TownNPC;
    // 向导/商人：普通门全过（同几何房 → 同相对站格 +30）
    expect(g.housingAssign(2005, 303, 'guide')).toBe(true);
    expect(byKey('guide')!.home).toEqual({ x: 2005, y: 304 });
    expect(g.housingAssign(2035, 303, 'merchant')).toBe(true);
    expect(byKey('merchant')!.home).toEqual({ x: 2035, y: 304 });
    // 松露人特化门（CheckSpecialTownNPCSpawningConditions 160,WorldGen.cs:4884-4918;
    //  housingAssign E-12 手动分配同查）：
    //  ① 未解锁+房 1 已被向导占（同类别）→ occupied 拒（文案非静默）；
    //  ② 解锁旗置位后房 2 已被商人占 → 仍拒（占用门先于蘑菇计数门,门序 1:1）——
    //     两支共同锁「160 特化路径存在且拒绝面不静默、home 不落」,蘑菇计数门
    //     本身由对抗修复批② E-11/E-12 既有测试覆盖,此处不重复。
    (w.flags as Record<string, boolean>)['unlockedTruffleSpawn'] = false;
    const textsBefore = g.texts.length;
    expect(g.housingAssign(2005, 303, 'truffle')).toBe(false);
    expect(g.texts.length).toBeGreaterThan(textsBefore);
    (w.flags as Record<string, boolean>)['unlockedTruffleSpawn'] = true;
    expect(g.housingAssign(2035, 303, 'truffle')).toBe(false);
    expect(byKey('truffle')!.home).toBeNull();
  });
});

describe('SW-BJ32 ④ 交互层结构锁（DOM 登记 + 双面板互斥）', () => {
  it('F6 面板根节点挂 sw-summon-panel 且已登记 DOM_UI_TARGET_SELECTOR', async () => {
    const fs = await import('node:fs/promises');
    const panelSrc = await fs.readFile('src/core/DebugSummonPanel.ts', 'utf8');
    const domSrc = await fs.readFile('src/core/input/domTargets.ts', 'utf8');
    expect(panelSrc).toContain("el.className = 'sw-summon-panel'");
    expect(domSrc).toMatch(/DOM_UI_TARGET_SELECTOR =[\s\S]*?\.sw-summon-panel/);
    // isDomUiTarget 行为面（合成 closest 桩,node 无 DOM）：命中类 ⇒ true
    expect(isDomUiTarget({ closest: () => '.sw-summon-panel' } as unknown as EventTarget)).toBe(true);
    expect(isDomUiTarget({ closest: () => null } as unknown as EventTarget)).toBe(false);
  });

  it('双向互斥：开 F6 → cb.onHousingCursor(null)（住房条自毁通道）;开住房先关 F6', async () => {
    const fs = await import('node:fs/promises');
    const w = new World(4200, 1200, 325, 'open');
    const g = bareGame(w);
    const cursorCalls: unknown[] = [];
    g.cb.onHousingCursor = (m) => cursorCalls.push(m);
    // 预置已构造面板（跳过 DebugSummonPanel 构造——node 无 document,show() 幂等早退）
    g.summonPanel = { open: false, toggle() { this.open = !this.open; } };
    g.toggleSummonPanel();                          // 开
    expect(g.summonPanel.open).toBe(true);
    expect(g.input.uiBlocking).toBe(true);
    expect(cursorCalls).toEqual([null]);            // 开面板 → 关住房条（清 assign 游标）
    g.toggleSummonPanel();                          // 关
    expect(g.summonPanel.open).toBe(false);
    expect(g.input.uiBlocking).toBe(false);
    expect(cursorCalls).toEqual([null]);            // 关面板不再重复发
    // 反向：openHousing 先关 F6（mainFlow 侧结构锁）
    const flowSrc = await fs.readFile('src/mainFlow.ts', 'utf8');
    expect(flowSrc).toContain('g.summonPanel?.open) g.toggleSummonPanel()');
  });

  it('与 SW-BJ25 格交互优先级互作不回归：housingMode 拦截块先于右键仲裁且自吞点击', async () => {
    const fs = await import('node:fs/promises');
    const gameSrc = await fs.readFile('src/core/Game.ts', 'utf8');
    // housingMode 拦截块位于 updateUse 头部（先于 uiBlocking/inpOverDomUi/右键链）,
    // 期间吞 mouseDown 并 return——右键仲裁 rightClickTileNpcDispatch 只在
    // housingMode 为 null 的路径可达,BJ25 仲裁序（格交互→NPC 交谈）不受影响
    const useIdx = gameSrc.indexOf('private updateUse(');
    const housingIdx = gameSrc.indexOf('if (this.housingMode) {', useIdx);
    const swallowIdx = gameSrc.indexOf('this.input.mouseDown = false;   // 住房模式期间持续吞使用点击', housingIdx);
    const bj25Idx = gameSrc.indexOf('private rightClickTileNpcDispatch(');
    expect(useIdx).toBeGreaterThanOrEqual(0);
    expect(housingIdx).toBeGreaterThan(useIdx);
    expect(swallowIdx).toBeGreaterThan(housingIdx);
    expect(bj25Idx).toBeGreaterThan(0);
    // 结构锚：互斥通道在位（防静默回退）
    expect(gameSrc).toContain('if (this.summonPanel.open) this.cb.onHousingCursor?.(null);');
  });
});
