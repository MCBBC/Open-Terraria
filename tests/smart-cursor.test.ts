// 智能光标（Smart Cursor）回归：SmartCursorHelper.cs 1:1 移植的行为锁。
// 覆盖：Toggle/Hold 状态机、镐射线（洞穴选下一实心块/平台穿透）、斧定位树根、
// 火把最近合法位 + 17×17 去重、BlocksFilling ≥2 邻居与 |dx| 优先、平台方向锁续铺、
// 让位集（宝箱不劫持）、可达区外目标弃用、hitLine 单元、八方向量化。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { T, TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import {
  SmartCursor, hitLine, hitLineWall, hitWallSubstep, canHitWithCheck, isOpenDoorAnchorFrame,
  sheetOf, smartCursorArrowAllowed,
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

const pick = () => ({ def: ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3509]]], tool: { type: 'pick' as const, power: 35 } });
const axe = () => ({ def: ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3506]]], tool: { type: 'axe' as const, power: 7 } });
const hammer = () => ({ def: ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[196]]], tool: { type: 'hammer' as const, power: 25 } });
const torchItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[8]]], tool: null });
const dirtItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2]]], tool: null });
const platformItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[94]]], tool: null });
const wallItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['vi_93_wood_wall']], tool: null }); // wallId 4（房墙）

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
    // R24：默认值勘误后 holdCanReleaseMidUse 缺省 false——本用例显式开
    const s: SmartCursorSettings = { ...DEFAULT_SMART_CURSOR_SETTINGS, toggleMode: false, holdCanReleaseMidUse: true };
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
    // R24：DEFAULT 勘误后 smartBlocksEnabled 缺省 false（Player.cs:326）——
    // 本组用例专测 Filling/Lines 策略链，显式开
    const st = new TileStore(W, H);
    st.setTile(104, 99, T.STONE); // (104,98) 只有下方 1 个实心邻居
    const on = { settings: { ...DEFAULT_SMART_CURSOR_SETTINGS, smartBlocksEnabled: true } };
    expect(run(mkEnv(st, mouseAt(104, 95), dirtItem(), on))).toEqual({ x: 104, y: 98 });
  });

  it('原版死门：SmartBlocksEnabled 打开时 Filling 恒不产生目标（:2694-2697 + :2714）', () => {
    // 原版 Step_BlocksFilling 第一道门 `if (!SmartBlocksEnabled) return;` 之后，
    // 第二道门条件首项竟是 `SmartBlocksEnabled ||`（1.4.0.5 / 1.4.5.6 反编译一致）——
    // 开关打开即整段返回。若 Filling 存活，(104,98)（2 邻居、|dx|=0）会以 |dx| 规则胜出；
    // 实际由 Lines 以纯距离接手 → 选 16px 外的 (103,97)
    const st = new TileStore(W, H);
    st.setTile(104, 99, T.STONE);
    st.setTile(103, 98, T.STONE); // (104,98) 下方 + 左侧 = 2 个实心邻居
    expect(run(mkEnv(st, mouseAt(104, 95), dirtItem(),
      { settings: { ...DEFAULT_SMART_CURSOR_SETTINGS, smartBlocksEnabled: true } }))).toEqual({ x: 103, y: 97 });
  });

  it('洞照补：Lines（≥1 邻居）在 Filling 死门后仍铺方块', () => {
    const st = new TileStore(W, H);
    st.setTile(103, 98, T.STONE);
    st.setTile(104, 98, T.STONE);
    st.setTile(104, 99, T.STONE); // (104,97) 下方实心 → Lines 候选且离鼠标最近
    expect(run(mkEnv(st, mouseAt(104, 95), dirtItem(),
      { settings: { ...DEFAULT_SMART_CURSOR_SETTINGS, smartBlocksEnabled: true } }))).toEqual({ x: 104, y: 97 });
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
    const target = run(mkEnv(st, mouseAt(104, 97), { def: ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[205]]], tool: null }));
    expect(target).toEqual({ x: 100, y: 97 });
  });

  it('智能斧排后（SmartAxeAfterPickaxe=true）：镐策略先于斧（Drax 镐+斧双工具语义）', () => {
    const st = new TileStore(W, H);
    for (let y = 93; y <= 99; y++) st.setTile(103, y, T.STONE);   // 石墙（镐目标）
    for (let y = 90; y <= 96; y++) st.setTile(104, y, T.TREE);    // 树（斧目标 → 根 96）
    // 镐 + 副斧力（def.axePower 桥，Drax 579 语义）
    const dual = { ...ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3509]]], key: 'test_drax', axePower: 100 };
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

describe('锤射线（Step_Hammers :1536 + Collision.HitLineWall :1148 / HitWallSubstep :1312）', () => {
  it('HitWallSubstep：无墙→false；八邻全有墙→false；房墙→true；被实心块包死→false', () => {
    const st = new TileStore(W, H);
    expect(hitWallSubstep(st, 100, 97)).toBe(false);          // wall==0（:1314-1317）
    st.setWallSilent(100, 97, 7);                              // 自然墙（非 wallHouse）
    expect(hitWallSubstep(st, 100, 97)).toBe(true);           // 八邻无墙 → flag（:1325-1334）
    for (let x = 99; x <= 101; x++) {
      for (let y = 96; y <= 98; y++) {
        if (x !== 100 || y !== 97) st.setWallSilent(x, y, 7);
      }
    }
    expect(hitWallSubstep(st, 100, 97)).toBe(false);          // 3×3 全有墙 → 无暴露（:1325-1334）
    st.setWallSilent(100, 97, 4);                              // 木墙（wallHouse，Main.cs 全表）
    expect(hitWallSubstep(st, 100, 97)).toBe(true);           // 房墙恒可锤（:1319-1322）
  });

  it('HitWallSubstep：本格 active 且八邻全实心 → 墙被包死不可锤（:1336-1357）', () => {
    const st = new TileStore(W, H);
    st.setWallSilent(100, 97, 7);
    for (let x = 99; x <= 101; x++) {
      for (let y = 96; y <= 98; y++) st.setTile(x, y, T.STONE); // 含本格：全实心包死
    }
    expect(hitWallSubstep(st, 100, 97)).toBe(false);
  });

  it('HitLineWall：沿线首个可锤墙格；墙被实心块包死则落到终点（DDA :1228-1304）', () => {
    const st = new TileStore(W, H);
    st.setWallSilent(103, 96, 7);                              // 孤立自然墙 → 可锤
    expect(hitLineWall(st, 100, 96, 106, 96)).toEqual({ x: 103, y: 96 });
    const st2 = new TileStore(W, H);
    for (let x = 102; x <= 104; x++) {
      for (let y = 95; y <= 97; y++) st2.setTile(x, y, T.STONE); // 3×3 实心块
    }
    st2.setWallSilent(103, 96, 7);                             // 墙被包死 → HitWallSubstep=false（:1336-1357）
    expect(hitLineWall(st2, 100, 96, 106, 96)).toEqual({ x: 106, y: 96 }); // 回落终点（:1304）
    const st3 = new TileStore(W, H);
    st3.setWallSilent(101, 96, 4);                             // 房墙（wallHouse）恒可锤（:1319-1322）
    expect(hitLineWall(st3, 100, 96, 106, 96)).toEqual({ x: 101, y: 96 });
  });

  it('HitLineWall：斜线 DDA 阶梯步进（先纵后横交替，:1216-1219/:1232-1291）', () => {
    const st = new TileStore(W, H);
    st.setWallSilent(102, 97, 7);
    // (100,96)→(104,100) 的原版足迹是阶梯：(101,96)(101,97)(102,97)…
    // （case2 步 X、case1 步 Y 交替）→ 首个足迹上的可锤墙 = (102,97)
    expect(hitLineWall(st, 100, 96, 104, 100)).toEqual({ x: 102, y: 97 });
  });
});

describe('铺墙视线（Step_Walls :1099 + Collision.CanHitWithCheck :492）', () => {
  const visionOK = (st: TileStore, tx: number, ty: number) =>
    canHitWithCheck(st, { x: px, y: py }, 20, 42, { x: tx * 16, y: ty * 16 }, 16, 16,
      (x, y) => !(st.isActive(x, y) && sheetOf(st.get(x, y)) === 11
        && (st.frameX[st.idx(x, y)] < 18 || st.frameX[st.idx(x, y)] >= 54)));

  it('夹缝不可视：两侧同时完整实心（无坡无半砖）→ CanHit=false（:551-554）', () => {
    const st = new TileStore(W, H);
    expect(visionOK(st, 104, 96)).toBe(true);                 // 空旷直达（:536-539）
    for (let y = 95; y <= 97; y++) {                          // (102,95..97) 实心柱
      st.setTile(102, y, T.STONE);
    }
    expect(visionOK(st, 104, 96)).toBe(false);                // 途中实心 → false（:575-578）
  });

  it('坡面/半砖不构成完整阻挡：两侧夹缝放宽（blocksSightFully :551）', () => {
    // 纵向走查（(100,96)→(100,99)）：两侧 (99,97)/(101,97) 同时完整实心才截断
    const solid = new TileStore(W, H);
    solid.setTile(99, 97, T.STONE);
    solid.setTile(101, 97, T.STONE);
    expect(visionOK(solid, 100, 99)).toBe(false);            // 两侧完整实心 → 夹缝截断
    const sloped = new TileStore(W, H);
    sloped.setTile(99, 97, T.STONE);
    sloped.setTile(101, 97, T.STONE);
    sloped.setSlope(99, 97, 1);                              // 坡面 → 非完整（slope!=0）
    expect(visionOK(sloped, 100, 99)).toBe(true);            // 一侧带坡 → 不算夹死
    const half = new TileStore(W, H);
    half.setTile(99, 97, T.STONE);
    half.setTile(101, 97, T.STONE);
    half.setHalfBrick(99, 97, true);                         // 半砖 → 非完整（halfBrick）
    expect(visionOK(half, 100, 99)).toBe(true);
  });

  it('门类阻挡：开门锚帧截断 CanHit（NotDoorStand :858-869 / IsOpenDoorAnchorFrame :69228）', () => {
    const st = new TileStore(W, H);
    st.setTile(102, 96, T.DOOR_OPEN, 0, 0);                   // 锚帧 frameX=0
    expect(isOpenDoorAnchorFrame(st, 102, 96)).toBe(true);
    expect(visionOK(st, 104, 96)).toBe(false);                // 锚帧 → 循环终止 → false
    const st2 = new TileStore(W, H);
    st2.setTile(102, 96, T.DOOR_OPEN, 36, 0);                 // 门体帧 frameX=36
    expect(isOpenDoorAnchorFrame(st2, 102, 96)).toBe(false);
    expect(visionOK(st2, 104, 96)).toBe(true);                // 门体帧放行
  });

  it('Step_Walls 端到端：实心柱截断视线 → 铺墙目标退到柱前（:1113）', () => {
    const st = new TileStore(W, H);
    for (let x = 100; x <= 105; x++) st.setTile(x, 98, T.STONE); // 地板 → (x,97) 均可依附
    expect(run(mkEnv(st, mouseAt(105, 97), wallItem()))).toEqual({ x: 105, y: 97 });
    for (let y = 95; y <= 97; y++) st.setTile(103, y, T.STONE);  // 视线内立实心柱
    expect(run(mkEnv(st, mouseAt(105, 97), wallItem()))).toEqual({ x: 102, y: 97 });
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

// ===================== 2026-09-03 谓词口径对账回归 =====================
// vanilla `tile.active()`（Tile.cs:591 HasTile 位）含已致动格；nactive() 不含。
// 此前全步以 nactive（isActive）代读 active() → 已致动格被当空气。
// 已致动格构造：flags=1（setTile 落位）+ wire 通道 WIRE_ACTUATED 位；
// 幽灵格（生成期 active(false) 残型）：type 在场但 flags=0 —— 两口径同判"不在场"。
describe('谓词口径：active()=HasTile 位 vs nactive()（对账批）', () => {
  const actuate = (st: TileStore, x: number, y: number) => {
    st.wire[st.idx(x, y)] |= TileStore.WIRE_ACTUATED;
  };

  it('ForceCursor：已致动平台仍被镐钉中（:2259 active()，solidTop 可挖支）', () => {
    const st = new TileStore(W, H);
    const tx = PT + 3, ty = PYT + 1;
    st.setTile(tx, ty, T.PLATFORM);
    actuate(st, tx, ty);
    expect(run(mkEnv(st, mouseAt(tx, ty), pick()))).toEqual({ x: tx, y: ty });
  });

  it('ForceCursor：未致动平台同样钉中（Main.tileAxe 表翻案——平台非斧族，镐支不再被 def.axe 挡）', () => {
    const st = new TileStore(W, H);
    const tx = PT + 3, ty = PYT + 1;
    st.setTile(tx, ty, T.PLATFORM);
    expect(run(mkEnv(st, mouseAt(tx, ty), pick()))).toEqual({ x: tx, y: ty });
  });

  it('MineShinies：已致动魔力水晶（sheet 639）仍被选（:2310 active()）', () => {
    const st = new TileStore(W, H);
    const tx = PT + 2, ty = PYT + 1;
    st.setTile(tx, ty, TILE_BY_KEY['v_639_mana_crystal']!);
    actuate(st, tx, ty);
    const env = mkEnv(st, mouseAt(PT + 5, PYT - 1), pick());
    expect(run(env)).toEqual({ x: tx, y: ty });
  });

  it('ActuationRod：已致动+已装致动器格仍可选（:1518 active()，打回活体）', () => {
    const st = new TileStore(W, H);
    const tx = PT + 2, ty = PYT + 1;
    st.setTile(tx, ty, T.DIRT);
    st.wire[st.idx(tx, ty)] |= TileStore.WIRE_ACTUATOR | TileStore.WIRE_ACTUATED;
    const rod = {
      def: { key: 'vi_3620_probe', tile: null } as unknown as (typeof ITEM_DEFS)[number],
      tool: null,
    };
    expect(run(mkEnv(st, mouseAt(tx, ty), rod))).toEqual({ x: tx, y: ty });
  });

  it('Torch：下方锚格已致动仍成立（:2897-2898 active()）', () => {
    const st = new TileStore(W, H);
    const tx = PT + 2, ty = PYT - 1;
    st.setTile(tx, ty + 1, T.DIRT);
    actuate(st, tx, ty + 1);
    expect(run(mkEnv(st, mouseAt(tx, ty), torchItem()))).toEqual({ x: tx, y: ty });
  });

  it('Walls：邻格已致动仍可作依附锚（:1126-1138 active()）', () => {
    const st = new TileStore(W, H);
    const tx = PT + 3, ty = PYT + 1;
    st.setTile(tx - 1, ty, T.DIRT);
    actuate(st, tx - 1, ty);
    expect(run(mkEnv(st, mouseAt(tx, ty), wallItem()))).toEqual({ x: tx, y: ty });
  });

  it('幽灵格（flags=0,type≠0）两口径同判不在场：残型平台不触发 ForceCursor', () => {
    const st = new TileStore(W, H);
    const tx = PT + 3, ty = PYT + 1;
    st.setTile(tx, ty, T.PLATFORM);
    st.flags[st.idx(tx, ty)] = 0;              // 原版 active(false) 残型
    expect(run(mkEnv(st, mouseAt(tx, ty), pick()))).toBeNull();
  });

  it('nactive KEEP 口径：MineSolids 射线穿透已致动实心块（:2492 active()&&!inActive()）', () => {
    const st = new TileStore(W, H);
    // 玩家与鼠标之间立一格已致动石墙——射线不被挡、其后无实心 → 无目标
    st.setTile(PT + 2, PYT + 1, T.STONE);
    st.wire[st.idx(PT + 2, PYT + 1)] |= TileStore.WIRE_ACTUATED;
    const env = mkEnv(st, mouseAt(PT + 4, PYT + 1), pick());
    expect(run(env)).toBeNull();
  });
});

// ===================== 红蓝对抗批(B 路 findings 修复)回归 =====================
describe('EmptyTileCheck 1:1（WorldGen.cs:31735-31822，红蓝对抗 F1）', () => {
  const acorn = () => ({ def: ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[27]]], tool: null });
  /** 橡实候选布景：坑位 (103,94)，下方 (102..104,95) 草地（:2106-2135 keep 过滤要求
   *  下方邻列同类地面），净空箱 = (101..105, 81..94) */
  function acornStage(st: TileStore, boxTile: number | null) {
    st.setTile(102, 95, T.GRASS);
    st.setTile(103, 95, T.GRASS);
    st.setTile(104, 95, T.GRASS);
    if (boxTile != null) st.setTile(102, 90, boxTile);
  }
  const runAcorn = (st: TileStore) => {
    const sc = new SmartCursor();
    sc.wanted = true;
    sc.lookup(mkEnv(st, mouseAt(103, 94), acorn()));
    return sc;
  };

  it('净空箱内幽灵残型格 = 空（:31759 !active()→continue），候选不再被吞', () => {
    const st = new TileStore(W, H);
    acornStage(st, T.STONE);
    st.flags[st.idx(102, 90)] = 0;               // 原版 active(false) 残型
    const sc = runAcorn(st);
    expect(sc.showing).toBe(true);               // 曾被幽灵格当占位吞掉
    expect(sc.x).toBe(103); expect(sc.y).toBe(94);
  });

  it('净空箱内普通植物（草丛 sheet3）放行（:31783 植物豁免表，ignoreID=20 树苗族）', () => {
    const st = new TileStore(W, H);
    acornStage(st, TILE_BY_KEY['tallgrass']!);   // sheet 3 ∈ 豁免表
    expect(runAcorn(st).showing).toBe(true);
  });

  it('净空箱内实心块仍拒绝（门不虚开）', () => {
    const st = new TileStore(W, H);
    acornStage(st, T.STONE);                     // 实心在场
    expect(runAcorn(st).showing).toBe(false);
  });
});

describe('方向箭头显示门 = 全式 IsReplaceableBlock（Player.cs:40066-40074，红蓝对抗 F2）', () => {
  it('tileCut 件照画；树苗（sheet20，tileCut ∩ 原版 Replaceable 落穿支）照画；实心不画', () => {
    const st = new TileStore(W, H);
    st.setTile(110, 100, TILE_BY_KEY['tallgrass']!);   // tileCut → 落穿 return true
    expect(smartCursorArrowAllowed(st, 109, 100, { x: 1, y: 0 })).toBe(true);
    st.setTile(110, 103, TILE_BY_KEY['acorn_sapling']!); // sheet 20 树苗
    expect(smartCursorArrowAllowed(st, 109, 103, { x: 1, y: 0 })).toBe(true);
    st.setTile(110, 106, T.STONE);                     // 实心非可替换 → BWP(石)=false
    expect(smartCursorArrowAllowed(st, 109, 106, { x: 1, y: 0 })).toBe(false);
  });
});

// ===================== X1 终扫四项对齐（2026-09-04 蓝队修复批） =====================
// 注：本测 actor 在 (100,95)，tileBoost=0 → 可达区 = x∈[95,106] / y∈[92,100]
// （TileReachCheckSettings GetRanges：tileRangeX=5 / tileRangeY=3，Player.cs:2475/2477），
// 全部候选/轨道格均布在该区内。

const pigronataItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['place_v_454_pigronata']], tool: null });
const pumpkinItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['place_v_254_pumpkin_plant']], tool: null });
const boulderItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['place_v_138_boulder']], tool: null });
const plainTrackItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['place_v_314_minecart_track']], tool: null });
const boosterTrackItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['vi_2739_BoosterTrack']], tool: null });
const pressureTrackItem = () => ({ def: ITEM_DEFS[ITEM_BY_KEY['vi_2492_PressureTrack']], tool: null });

describe('X1 终扫四项对齐（Pigronata/PumpkinSeeds/Boulders/2492 压力轨道）', () => {
  it('① Pigronata 地表截断：j > worldSurface-2 不出候选（SmartCursorHelper.cs:987）', () => {
    const st = new TileStore(W, H);
    // 顶棚 A（y=93，x=92..99）→ 候选行 j=94（i 95..98）；顶棚 B（y=98，x=100..103）→ 候选行 j=99（i 102..103）
    for (let x = 92; x <= 99; x++) st.setTile(x, 93, T.DIRT);
    for (let x = 100; x <= 103; x++) st.setTile(x, 98, T.DIRT);
    // 未传 worldSurface（缺省 Infinity）= 不截断：最近候选 (102,99)
    expect(run(mkEnv(st, mouseAt(102, 99), pigronataItem()))).toEqual({ x: 102, y: 99 });
    expect(run(mkEnv(st, mouseAt(102, 99), pigronataItem(), { worldSurface: 104 }))).toEqual({ x: 102, y: 99 });
    // surface=96：允许 j ≤ 94 → j=99 行整列截断，最近合法候选落到棚 A 下 (98,94)
    expect(run(mkEnv(st, mouseAt(102, 99), pigronataItem(), { worldSurface: 96 }))).toEqual({ x: 98, y: 94 });
    // surface=92：允许 j ≤ 90 —— 可达区内两行候选全在地表下 → 不出候选
    expect(run(mkEnv(st, mouseAt(102, 99), pigronataItem(), { worldSurface: 92 }))).toBeNull();
  });

  it('② PumpkinSeeds：地面格 slope/halfBrick 拒（:1058）+ worldSurface 截断（:1049）', () => {
    const st = new TileStore(W, H);
    st.setTile(105, 101, T.GRASS);
    st.setTile(106, 101, T.GRASS);
    // 对照：平草面 → 唯一候选 (105,100)
    expect(run(mkEnv(st, mouseAt(105, 100), pumpkinItem()))).toEqual({ x: 105, y: 100 });
    // 右地面格带坡 → 拒（:1058 tile2.slope() > 0）
    st.setSlope(106, 101, 1);
    expect(run(mkEnv(st, mouseAt(105, 100), pumpkinItem()))).toBeNull();
    st.setSlope(106, 101, 0);
    // 左地面格半砖 → 拒（:1058 tile.halfBrick()）
    st.setHalfBrick(105, 101, true);
    expect(run(mkEnv(st, mouseAt(105, 100), pumpkinItem()))).toBeNull();
    st.setHalfBrick(105, 101, false);
    // 地表截断：surface=100 → 允许 j ≤ 98，(105,100) 不可选；surface=102 放行
    expect(run(mkEnv(st, mouseAt(105, 100), pumpkinItem(), { worldSurface: 100 }))).toBeNull();
    expect(run(mkEnv(st, mouseAt(105, 100), pumpkinItem(), { worldSurface: 102 }))).toEqual({ x: 105, y: 100 });
  });

  it('②b PumpkinSeeds 净空 = WorldGen.CanCutTile（:1075→WorldGen.cs:88111-24）三类实差（M24-F6）', () => {
    // (a) 下格 78 陶盆（:88113 下格 type∈{78,380,579} 拒切）：上格草丛（decor 可割）
    //     旧 decor 近似放行,CanCutTile 因下邻 78 拒 → 无候选
    const stA = new TileStore(W, H);
    stA.setTile(105, 101, T.GRASS);
    stA.setTile(106, 101, T.GRASS);
    stA.setTile(105, 100, TILE_BY_KEY['clay_pot']!);   // 上格草丛的下邻 = 78
    stA.setTile(105, 99, TILE_BY_KEY['tallgrass']!);   // 净空上格可割件（非实心）
    expect(run(mkEnv(stA, mouseAt(105, 100), pumpkinItem()))).toBeNull();

    // (b) 回声墙 350（:88113 wall!=350 拒切）：可割件带墙 350 → 拒;无墙对照放行
    const stB = new TileStore(W, H);
    stB.setTile(105, 101, T.GRASS);
    stB.setTile(106, 101, T.GRASS);
    stB.setTile(105, 100, TILE_BY_KEY['tallgrass']!);
    expect(run(mkEnv(stB, mouseAt(105, 100), pumpkinItem()))).toEqual({ x: 105, y: 100 });
    stB.wall[stB.idx(105, 100)] = 350;
    expect(run(mkEnv(stB, mouseAt(105, 100), pumpkinItem()))).toBeNull();

    // (c) 未熟南瓜 254 frameX<144（:88117-20）拒;成熟（≥144）放行——254 不在 decor 表,
    //     旧近似连成熟南瓜一并拒（实差在成熟侧）
    const stC = new TileStore(W, H);
    stC.setTile(105, 101, T.GRASS);
    stC.setTile(106, 101, T.GRASS);
    stC.setTile(105, 100, TILE_BY_KEY['v_254_pumpkin_plant']!);
    expect(run(mkEnv(stC, mouseAt(105, 100), pumpkinItem()))).toBeNull();        // 未熟 frameX=0
    stC.setTile(105, 100, TILE_BY_KEY['v_254_pumpkin_plant']!, 144);
    expect(run(mkEnv(stC, mouseAt(105, 100), pumpkinItem()))).toEqual({ x: 105, y: 100 }); // 成熟放行
  });

  it('③ Boulders：玩家命中盒内不出候选；敌怪/NPC 占位不拒（:936-949 只查玩家）', () => {
    // 场景 A：候选 (100,97) 的 32×32 净空区 (1600,1536,32,32) 与 actor 玩家盒 (1600,1520,20,42) 相交
    const st = new TileStore(W, H);
    st.setTile(100, 98, T.STONE);
    st.setTile(101, 98, T.STONE);
    // 缺省 players 回退 [actor] → 相交 → 拒
    expect(run(mkEnv(st, mouseAt(100, 97), boulderItem()))).toBeNull();
    // 显式空玩家列表 → 不拒（净空来源 = players 列表本身）
    expect(run(mkEnv(st, mouseAt(100, 97), boulderItem(), { players: [] }))).toEqual({ x: 100, y: 97 });
    // 场景 B：候选 (105,98) 净空区 x 向与玩家盒错开；敌怪盒占住净空区也不拒（原版只遍历 Main.player[0..254]）
    const st2 = new TileStore(W, H);
    st2.setTile(105, 99, T.STONE);
    st2.setTile(106, 99, T.STONE);
    expect(run(mkEnv(st2, mouseAt(105, 98), boulderItem()))).toEqual({ x: 105, y: 98 });
    const npc = { x: 105 * 16, y: 98 * 16 - 16, w: 16, h: 16 };   // 覆盖候选净空区左上格 (105,97)
    expect(run(mkEnv(st2, mouseAt(105, 98), boulderItem(), { occupants: [npc] }))).toEqual({ x: 105, y: 98 });
    // 同一盒按玩家口径传入（players）→ 拒（碰撞式 = XNA Rectangle.Intersects）
    expect(run(mkEnv(st2, mouseAt(105, 98), boulderItem(), { players: [npc] }))).toBeNull();
  });

  it('③b 联机 env.players（Game 侧传全玩家表）：第二玩家盒入净空区 → 拒;盒外存活玩家不拒（M24-F5）', () => {
    const st = new TileStore(W, H);
    st.setTile(105, 99, T.STONE);
    st.setTile(106, 99, T.STONE);
    // 候选 (105,98) 净空区 (1680,1552,32,32) = 格 (105..106, 97..98);本地玩家盒在 (1600,1520) 不相交
    const blocker = { x: 105 * 16, y: 98 * 16 - 16, w: 20, h: 42 };   // 第二玩家盒盖住净空左上格
    const far = { x: 150 * 16, y: 90 * 16, w: 20, h: 42 };
    // Game 侧形态 = [本地, …active&&!dead 远端]：blocker 在列 → 拒
    expect(run(mkEnv(st, mouseAt(105, 98), boulderItem(), { players: [mkActor(), far, blocker] }))).toBeNull();
    // blocker 不在列（未连入/死亡被过滤）→ 候选照出
    expect(run(mkEnv(st, mouseAt(105, 98), boulderItem(), { players: [mkActor(), far] }))).toEqual({ x: 105, y: 98 });
  });

  it('④ 2492 压力轨道独立段：无方向量化左右续格；主段不吃 2492（:1277-1331）', () => {
    const track = TILE_BY_KEY['v_314_minecart_track']!;
    const mk = () => {
      const st = new TileStore(W, H);
      st.setTile(100, 95, track);
      st.setTile(101, 95, track);
      st.setTile(102, 95, track);
      return st;
    };
    // 鼠标在轨道行上方 → 方向量化 = 纯向上，主段六臂全不发；压力轨道段无视方向
    // → 已有轨道左右端点 (99,95)/(103,95) 入选，取离鼠标最近 (99,95)
    expect(run(mkEnv(mk(), mouseAt(99, 93), pressureTrackItem()))).toEqual({ x: 99, y: 95 });
    // 主段物品（2739 / 无 vid 的 place_v_314_*）同场景仍被方向量化挡住 → 无候选
    expect(run(mkEnv(mk(), mouseAt(99, 93), boosterTrackItem()))).toBeNull();
    expect(run(mkEnv(mk(), mouseAt(99, 93), plainTrackItem()))).toBeNull();
    // 主段物品横向鼠标仍走主段续格（拆分不误伤 2340/2739 主段）
    expect(run(mkEnv(mk(), mouseAt(90, 97), boosterTrackItem()))).toEqual({ x: 99, y: 95 });
    // 端点门（:1310）：候选上下有轨道即剔——(99,94) 挡掉其正下方候选 (99,95)，
    //  最近落点跳到 (98,94)（其上下皆无轨道）
    const st2 = mk();
    st2.setTile(99, 94, track);
    expect(run(mkEnv(st2, mouseAt(99, 93), pressureTrackItem()))).toEqual({ x: 98, y: 94 });
  });
});
