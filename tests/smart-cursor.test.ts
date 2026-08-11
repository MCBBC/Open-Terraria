// 智能光标（Smart Cursor）回归：SmartCursorHelper.cs 1:1 移植的行为锁。
// 覆盖：Toggle/Hold 状态机、镐射线（洞穴选下一实心块/平台穿透）、斧定位树根、
// 火把最近合法位 + 17×17 去重、BlocksFilling ≥2 邻居与 |dx| 优先、平台方向锁续铺、
// 让位集（宝箱不劫持）、可达区外目标弃用、hitLine 单元、八方向量化。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { T, TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import {
  SmartCursor, hitLine, sheetOf, smartCursorArrowAllowed,
  DEFAULT_SMART_CURSOR_SETTINGS, DISABLE_SMART_CURSOR_SHEETS,
  type SmartCursorEnv, type SmartCursorSettings,
} from '../src/player/SmartCursor';

const W = 220, H = 160;
const PT = 100, PYT = 95;              // 玩家所在格（世界中央）
const px = PT * 16, py = PYT * 16;     // position（px）

function mkActor() {
  return { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, facing: 1 };
}

function mkEnv(
  st: TileStore, mouse: { x: number; y: number },
  held: { def: (typeof ITEM_DEFS)[number] | null; tool: { type: 'pick' | 'axe' | 'hammer' | 'sword'; power: number } | null },
  over: Partial<SmartCursorEnv> = {},
): SmartCursorEnv {
  return {
    st,
    mouse,
    actor: mkActor(),
    held,
    settings: { ...DEFAULT_SMART_CURSOR_SETTINGS },
    tileBoost: 0,
    wireToolMode: 0,
    occupants: [],
    controlUseItem: true,
    ...over,
  };
}

const pick = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['copper_pickaxe']], tool: { type: 'pick' as const, power: 35 } });
const axe = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['copper_axe']], tool: { type: 'axe' as const, power: 7 } });
const hammer = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['wood_hammer']], tool: { type: 'hammer' as const, power: 25 } });
const torchItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['torch']], tool: null });
const dirtItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['dirt_block']], tool: null });
const platformItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['platform']], tool: null });

/** 跑一次 lookup 并返回目标（无目标 null） */
function run(env: SmartCursorEnv, sc = new SmartCursor()): { x: number; y: number } | null {
  sc.wanted = true;
  sc.lookup(env);
  return sc.showing ? { x: sc.x, y: sc.y } : null;
}

const mouseAt = (tx: number, ty: number) => ({ x: tx * 16 + 8, y: ty * 16 + 8 });

describe('状态机（Player.cs:28344-28374 TryToToggleSmartCursor）', () => {
  it('Toggle：按下沿翻转、按住不重复、松开保持；再按关闭', () => {
    const sc = new SmartCursor();
    const s = DEFAULT_SMART_CURSOR_SETTINGS; // toggleMode=true
    expect(sc.updateWanted(true, false, s)).toBe(true);   // 按下沿
    expect(sc.wanted).toBe(true);
    expect(sc.updateWanted(true, false, s)).toBe(false);  // 持按无沿
    expect(sc.wanted).toBe(true);
    expect(sc.updateWanted(false, false, s)).toBe(false); // 松开保持
    expect(sc.wanted).toBe(true);
    expect(sc.updateWanted(true, false, s)).toBe(true);   // 再按 → 关
    expect(sc.wanted).toBe(false);
  });

  it('Hold（可中途松开）：wanted 直接跟随 Ctrl', () => {
    const sc = new SmartCursor();
    const s: SmartCursorSettings = { ...DEFAULT_SMART_CURSOR_SETTINGS, toggleMode: false };
    sc.updateWanted(true, false, s);
    expect(sc.wanted).toBe(true);
    sc.updateWanted(false, true, s);   // 使用中松开 → 关
    expect(sc.wanted).toBe(false);
  });

  it('Hold（不可中途松开）：使用中松开 Ctrl 保持激活，使用结束后才关', () => {
    const sc = new SmartCursor();
    const s: SmartCursorSettings = { ...DEFAULT_SMART_CURSOR_SETTINGS, toggleMode: false, holdCanReleaseMidUse: false };
    sc.updateWanted(true, false, s);
    expect(sc.wanted).toBe(true);
    sc.updateWanted(false, true, s);   // 还在用 → 保持
    expect(sc.wanted).toBe(true);
    sc.updateWanted(false, false, s);  // 使用也结束 → 关
    expect(sc.wanted).toBe(false);
  });
});

describe('镐射线（Step_Pickaxe_MineSolids :2350 + Collision.HitLine :782）', () => {
  it('洞穴场景：鼠标指在墙后空格 → 目标 = 射线沿途首个实心块（而非鼠标格）', () => {
    const st = new TileStore(W, H);
    for (let y = 93; y <= 99; y++) st.setTile(104, y, T.STONE); // x=104 实心墙（在可达区内）
    const target = run(mkEnv(st, mouseAt(130, 95), pick()));
    expect(target).not.toBeNull();
    expect(target!.x).toBe(104);                       // 射线命中的墙列
    expect(target!.y).toBeGreaterThanOrEqual(93);
    expect(target!.y).toBeLessThanOrEqual(97);         // 起点列覆盖的行
    expect(target!.x).not.toBe(130);                   // 不是鼠标格
  });

  it('平台（tileSolidTop）不挡射线：镐目标越过平台选到后面的实心块', () => {
    const st = new TileStore(W, H);
    for (let y = 93; y <= 99; y++) st.setTile(103, y, T.PLATFORM); // 平台列（应被穿透）
    for (let y = 93; y <= 99; y++) st.setTile(104, y, T.STONE);   // 石墙
    const target = run(mkEnv(st, mouseAt(130, 95), pick()));
    expect(target!.x).toBe(104);                       // 跳过 103 的平台
  });

  it('hitLine 单元：实心块挡线 / 平台穿透 / 空线直达端点', () => {
    const st = new TileStore(W, H);
    st.setTile(5, 0 + 40, T.STONE);
    expect(hitLine(st, 0, 40, 10, 40, 1, 0, []).col).toEqual({ x: 5, y: 40 });
    const st2 = new TileStore(W, H);
    st2.setTile(5, 40, T.PLATFORM);
    expect(hitLine(st2, 0, 40, 10, 40, 1, 0, []).col).toEqual({ x: 10, y: 40 }); // 平台不挡
    const st3 = new TileStore(W, H);
    expect(hitLine(st3, 0, 40, 10, 40, 1, 0, []).col).toEqual({ x: 10, y: 40 }); // 一路畅通到端点
  });
});

describe('斧（Step_Axe :2582）', () => {
  it('指向树冠任意格 → 目标归位到树根格（沿 Y 下到底）', () => {
    const st = new TileStore(W, H);
    const TREE = T.TREE;
    for (let y = 90; y <= 96; y++) st.setTile(100, y, TREE); // 树干列，根在 96
    const target = run(mkEnv(st, mouseAt(100, 91), axe()));  // 鼠标指树冠
    expect(target).toEqual({ x: 100, y: 96 });
  });

  it('仙人掌族（sheet 80）同样下到底', () => {
    const st = new TileStore(W, H);
    const CACTUS = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === 80);
    expect(CACTUS).toBeGreaterThan(0);
    for (let y = 92; y <= 97; y++) st.setTile(100, y, CACTUS);
    const target = run(mkEnv(st, mouseAt(100, 93), axe()));
    expect(target).toEqual({ x: 100, y: 97 });
  });
});

describe('火把（Step_Torch :2795 + IsValidSpotForTorch :2867）', () => {
  it('空房间：目标 = 离鼠标最近的合法锚位（地板上方）', () => {
    const st = new TileStore(W, H);
    for (let x = 95; x <= 105; x++) st.setTile(x, 98, T.STONE); // 地板
    const target = run(mkEnv(st, mouseAt(105, 97), torchItem()));
    expect(target).toEqual({ x: 105, y: 97 }); // 地板上方即底锚
  });

  it('17×17 去重：附近已有火把的候选全部排除，跳到最近的无火把位', () => {
    const st = new TileStore(W, H);
    for (let x = 95; x <= 105; x++) st.setTile(x, 98, T.STONE);
    st.setTile(104, 97, T.TORCH); // 已有火把（±8 内全排除 → x≥96 的候选全废）
    const target = run(mkEnv(st, mouseAt(105, 97), torchItem()));
    expect(target).toEqual({ x: 95, y: 97 }); // 最近的无火把底锚位
  });

  it('悬空无支撑不选：只有孤点墙时锚位必须贴墙/贴块', () => {
    const st = new TileStore(W, H); // 全空：无墙无支撑
    const target = run(mkEnv(st, mouseAt(100, 95), torchItem()));
    expect(target).toBeNull();
  });
});

describe('方块填充/铺线（Step_BlocksFilling :2692 / Step_BlocksLines :809）', () => {
  it('无邻居的空格：填充/铺线都不选', () => {
    const st = new TileStore(W, H); // 全空世界
    expect(run(mkEnv(st, mouseAt(104, 95), dirtItem()))).toBeNull();
  });

  it('单邻居的洞：Filling(≥2) 不命中 → 落到 Lines(≥1) 选该格（原版策略链穿透）', () => {
    const st = new TileStore(W, H);
    st.setTile(104, 99, T.STONE); // (104,98) 只有下方 1 个实心邻居
    expect(run(mkEnv(st, mouseAt(104, 95), dirtItem()))).toEqual({ x: 104, y: 98 });
  });

  it('Filling |dx| 优先：水平更近的洞胜过距离更近的洞', () => {
    const st = new TileStore(W, H);
    // 洞 A (104,98)：与鼠标同列（|dx|=0），距离 48px
    st.setTile(104, 99, T.STONE);
    st.setTile(103, 98, T.STONE);
    // 洞 B (102,95)：距鼠标 32px 更近，但 |dx|=32
    st.setTile(102, 96, T.STONE);
    st.setTile(103, 95, T.STONE);
    const target = run(mkEnv(st, mouseAt(104, 95), dirtItem()));
    expect(target).toEqual({ x: 104, y: 98 }); // |dx| 最小者胜（:2766-2784）
  });

  it('≥2 邻居的洞：Filling 直接命中（先于 Lines）', () => {
    const st = new TileStore(W, H);
    st.setTile(104, 99, T.STONE);
    st.setTile(103, 98, T.STONE); // (104,98) 下方 + 左侧 = 2 个实心邻居
    expect(run(mkEnv(st, mouseAt(104, 95), dirtItem()))).toEqual({ x: 104, y: 98 });
  });

  it('SmartBlocksEnabled 关闭 → 两策略都不生效', () => {
    const st = new TileStore(W, H);
    st.setTile(104, 99, T.STONE);
    st.setTile(103, 98, T.STONE);
    const settings = { ...DEFAULT_SMART_CURSOR_SETTINGS, smartBlocksEnabled: false };
    expect(run(mkEnv(st, mouseAt(104, 95), dirtItem(), { settings }))).toBeNull();
  });
});

describe('平台方向锁（Step_Platforms :1323 + AllowedForContinuity :1403）', () => {
  it('已有平台沿鼠标方向续一格，并写方向锁', () => {
    const st = new TileStore(W, H);
    st.setTile(100, 97, T.PLATFORM);
    const sc = new SmartCursor();
    const target = run(mkEnv(st, mouseAt(104, 97), platformItem()), sc);
    expect(target).toEqual({ x: 101, y: 97 });
    expect(sc.lockedDirection).toEqual({ x: 1, y: 0 });
    expect(sc.lockedContinuity).toEqual({ x: 101, y: 97 });
  });

  it('锁清理（SmartCursorLookup :64-68）：不按使用键时方向锁/连通锁清空', () => {
    const st = new TileStore(W, H);
    st.setTile(100, 97, T.PLATFORM);
    const sc = new SmartCursor();
    sc.lookup(mkEnv(st, mouseAt(104, 97), platformItem(), { controlUseItem: false }));
    expect(sc.lockedDirection).toBeNull();
    expect(sc.lockedContinuity).toBeNull();
  });

  it('八方向量化（GetDesiredDirectionFrom :1430）：右/上/右上', () => {
    const sc = new SmartCursor();
    expect(sc.getDesiredDirectionFrom({ x: 100, y: 0 })).toEqual({ x: 1, y: 0 });
    expect(sc.getDesiredDirectionFrom({ x: 0, y: -100 })).toEqual({ x: 0, y: -1 });
    expect(sc.getDesiredDirectionFrom({ x: 100, y: -100 })).toEqual({ x: 1, y: -1 });
  });
});

describe('让位集与可达区（SmartCursorLookup :104 / :183）', () => {
  it('宝箱格（DisableSmartCursor 21）鼠标悬停 → 本次不查找（右键交互让位）', () => {
    const st = new TileStore(W, H);
    for (let x = 95; x <= 105; x++) st.setTile(x, 98, T.STONE); // 地板
    st.setTile(100, 97, T.CHEST); // sheet 21，在可达区内
    expect(DISABLE_SMART_CURSOR_SHEETS.has(21)).toBe(true);
    // 悬停宝箱本身 → 让位（本次不查找）
    expect(run(mkEnv(st, mouseAt(100, 97), torchItem()))).toBeNull();
    // 悬停其它合法格（让位只看鼠标格）→ 恢复查找：火把策略选最近锚位
    expect(run(mkEnv(st, mouseAt(105, 97), torchItem()))).toEqual({ x: 105, y: 97 });
  });

  it('轨道格（314）同样让位', () => {
    const st = new TileStore(W, H);
    const TRACK = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === 314);
    expect(TRACK).toBeGreaterThan(0);
    st.setTile(100, 97, TRACK);
    expect(run(mkEnv(st, mouseAt(100, 97), pick()))).toBeNull();
  });

  it('可达区外的可挖格不选（ForceCursor :2246 InTileBounds 门）', () => {
    const st = new TileStore(W, H);
    st.setTile(120, 95, T.TALLGRASS); // 非实心可挖，但远超 5 格射程
    expect(run(mkEnv(st, mouseAt(120, 95), pick()))).toBeNull();
  });
});

describe('其余策略抽样', () => {
  it('锤（Step_Hammers :1536）：可锤墙取离鼠标最近', () => {
    const st = new TileStore(W, H);
    st.setWallSilent(100, 97, 1);
    st.setWallSilent(103, 97, 1);
    // (100,97) 的四邻全无墙无块 → 可锤；(103,97) 同样
    const target = run(mkEnv(st, mouseAt(103, 97), hammer()));
    expect(target).toEqual({ x: 103, y: 97 });
  });

  it('空桶（Step_EmptyBuckets :612）：液体连通量 >100 的格取最近', () => {
    const st = new TileStore(W, H);
    st.setLiquid(100, 97, 200, 1); // 一格 200 的水（3×3 内同类总量 >100）
    st.setLiquid(104, 97, 10, 1);  // 太少
    const target = run(mkEnv(st, mouseAt(104, 97), { def: ITEM_DEFS[ITEM_BY_KEY['empty_bucket']], tool: null }));
    expect(target).toEqual({ x: 100, y: 97 });
  });

  it('智能斧排后（SmartAxeAfterPickaxe=true）：镐策略先于斧（Drax 镐+斧双工具语义）', () => {
    const st = new TileStore(W, H);
    for (let y = 93; y <= 99; y++) st.setTile(103, y, T.STONE);   // 石墙（镐目标）
    for (let y = 90; y <= 96; y++) st.setTile(104, y, T.TREE);    // 树（斧目标 → 根 96）
    // 镐 + 副斧力（def.axePower 桥，Drax 579 语义）
    const dual = { ...ITEM_DEFS[ITEM_BY_KEY['copper_pickaxe']], key: 'test_drax', axePower: 100 };
    const held = { def: dual, tool: { type: 'pick' as const, power: 55 } };
    const t1 = run(mkEnv(st, mouseAt(120, 95), held, {
      settings: { ...DEFAULT_SMART_CURSOR_SETTINGS, smartAxeAfterPickaxe: false },
    }));
    expect(t1).toEqual({ x: 104, y: 96 }); // 斧优先（默认）：树根
    const t2 = run(mkEnv(st, mouseAt(120, 95), held, {
      settings: { ...DEFAULT_SMART_CURSOR_SETTINGS, smartAxeAfterPickaxe: true },
    }));
    expect(t2!.x).toBe(103); // 镐优先：石墙
  });
});

describe('sheet 桥', () => {
  it('sheetOf：我方 tile id ↔ 原版 sheet', () => {
    expect(sheetOf(T.STONE)).toBe(1);
    expect(sheetOf(T.TREE)).toBe(5);
    expect(sheetOf(T.TORCH)).toBe(4);
    expect(sheetOf(T.PLATFORM)).toBe(19);
  });
});

describe('方向箭头显示门（Main.cs:46058-46065）', () => {
  it('锁向下一格：空格/可割植物 → 画箭头；实心块/家具 → 不画', () => {
    const st = new TileStore(W, H);
    st.setTile(110, 97, T.STONE);            // 锁向下一格是实心块
    st.setTile(110, 100, TILE_BY_KEY['tallgrass']!); // 草丛：Main.tileCut 可割植物（decor）
    // 空格 → true（!active()）
    expect(smartCursorArrowAllowed(st, 105, 97, { x: 1, y: 0 })).toBe(true);
    // 实心块 → false（PlaceThing_IsReplaceableBlock 不认）
    expect(smartCursorArrowAllowed(st, 109, 97, { x: 1, y: 0 })).toBe(false);
    // 可割植物 → true（tileCut 可替换口径）
    expect(smartCursorArrowAllowed(st, 109, 100, { x: 1, y: 0 })).toBe(true);
    // 越界锁向 → 按未激活处理 → true
    expect(smartCursorArrowAllowed(st, 0, 80, { x: -1, y: 0 })).toBe(true);
  });
});
