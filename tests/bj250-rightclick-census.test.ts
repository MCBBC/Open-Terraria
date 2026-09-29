// ★BJ250（2026-09-21）右键交互长尾普查+落刀——普查表结构锁 + 逐型行为锁。
// 债源 = R4 普查：原版 TileInteractionsUse（Player.cs:32358-33553）~33 支 vs 本仓
// interactAt 缺 12+ 支（212 雪球发射器/209 大炮/440 宝石锁/215 篝火/蜡烛族/
// 活板门/216·335·338 烟花族/441·468 陷阱箱/510·511 箭头牌/落地钟/火把拾取/
// 699 药水站）。本测：
//   ① 结构锁——33 支普查表钉死（原版锚行号 + 本仓 Game.ts 源码臂标记子串），
//      静默截断/回退即爆红；
//   ② 行为锁——shell 直驱 interactAt，逐型断言原版语义（发射/翻帧/消耗/掉落/
//      buff/报时/吞按键面）。
// 1458 交叉核对：TileInteractionsUse 1457↔1458 逐字节等价（仅整体 -2 行漂移），
// 普查表不受 1458 影响。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { Wiring } from '../src/world/Wiring';
import { TrapShot } from '../src/entities/Dart';
import { BuffState, BuffType } from '../src/stats/Buffs';
import { languageManager } from '../src/i18n/LanguageManager';

// ============================================================
// ① 普查表结构锁（33 支钉死）
// ============================================================
// [原版 tile id 集, 原版分支锚(Player.cs), 本仓臂标记(Game.ts 源码子串)]
const CENSUS: Array<[string, string, string]> = [
  ['212 雪球发射器', 'Player.cs:32370-32413(首臂,flag 门)', "sh === 212"],
  ['132/136/144 拉杆/开关/计时器', ':32417-32422 HitSwitch', "TILE_BY_KEY['v_132_lever']"],
  ['597 传送晶塔', ':32423-32458', 'usePylon'],
  ['441/468 陷阱箱/梳妆台', ':32459-32472 HitSwitch+动画', 'sh === 441 || sh === 468'],
  ['139 八音盒(★BJ297 收窄:35 右键系 1.3 世代语义摘除,仅导线 case 35 可翻)', ':32473-32478 SwitchMB(仅 139)', 'sh === 139'],
  ['215 篝火族', ':32479-32509 frameY±36', 'sh === 215'],
  ['207 水 fountain', ':32510-32515 SwitchFountain', 'sh === 207'],
  ['410/480/509/657/658/720/721/725/733 天塔柱族', ':32516-32522', 'sh === 410 || sh === 480'],
  ['455 派对纪念碑', ':32523-32529', 'sh === 455'],
  ['216 烟花火箭', ':32530-32534 LaunchRocket', 'sh === 216'],
  ['386/387 活板门', ':32535-32548 ShiftTrapdoor', 'sh === 386 || sh === 387'],
  ['388/389 高门', ':32549-32557 ShiftTallGate', "TILE_BY_KEY['v_388_tall_gate_closed']"],
  ['15/497/89/102/487 坐椅族', ':32558-32575 SitDown', 'SITTABLE_SHEETS'],
  ['335 烟花盒', ':32576-32580 LaunchRocketSmall', 'sh === 335'],
  ['411 起爆器(★BJ297 补 frameX<36 按下态门)', ':32581-32586 HitSwitch', "st.frameX[st.idx(tx, ty)] < 36"],
  ['494 高尔夫球座', ':32587-32599', "TILE_BY_KEY['v_494_golf_tee']"],
  ['338 烟花喷泉', ':32600-32622', 'sh === 338'],
  ['33/49/372/174/646 蜡烛族', ':32623-32635 frameX±18', 'sh === 33 || sh === 49 || sh === 372 || sh === 174 || sh === 646'],
  ['4(+50@90) 火把/水球魔法书拾取', ':32636-32645 KillTile', 'sh === 4 ||'],
  ['466 永恒水晶座', ':32646-32692', 'useEterniaStand'],
  ['334 旧武器架(legacy,仅登记)', ':32693-32746 PlaceWeapon', '334 = 1.4 前的 legacy'],
  ['440 宝石锁', ':32747-32808 ToggleGemLock', 'sh === 440'],
  ['395 物品框', ':32809-32813', "['v_395_item_frame', 'item_frame']"],
  ['698 展示罐', ':32814-32818', "['v_698_item_flask', 'display_jar']"],
  ['520 食物盘', ':32819-32823', "['v_520_plate', 'food_platter']"],
  ['471 武器架(TE)', ':32824-32828', "['v_471_weapon_rack', 'weapon_rack']"],
  ['470 模特', ':32829-32833', "['v_470_mannequins', 'display_doll']"],
  ['475 帽架', ':32834-32838', "['v_475_hat_rack', 'hat_rack']"],
  ['125 水晶球(预见)', ':32839-32844', "TILE_BY_KEY['v_125_crystal_ball']"],
  ['621 蛋糕(糖分冲刺)', ':32845-32850', "TILE_BY_KEY['v_621_slice_of_cake']"],
  ['464 战争桌', ':32851-32856', "TILE_BY_KEY['v_464_war_table']"],
  ['699 药水站', ':32857-32862 buff 366', "TILE_BY_KEY['v_699_alchemy_flask']"],
  ['377 磨刀石', ':32863-32868', "TILE_BY_KEY['v_377_sharpening_station']"],
  ['354 附魔台', ':32869-32874', "TILE_BY_KEY['v_354_bewitching_table']"],
  ['287 弹药箱', ':32875-32880', "TILE_BY_KEY['v_287_ammo_box']"],
  ['356 魔幻日晷', ':32881-32889', "TILE_BY_KEY['v_356_enchanted_sundial']"],
  ['663 魔幻月晷', ':32890-32898', "TILE_BY_KEY['v_663_enchanted_moondial']"],
  ['79 床', ':32899-32946', "TILE_BY_KEY['bed']"],
  ['55/85/425/573 告示牌族(tileSign)', ':32947-32978', 'sh === 55 || sh === 85'],
  ['104 落地大钟', ':32979-33015 报时', "TILE_BY_KEY['grandfather_clock']"],
  ['237 蜥蜴祭坛', ':33016-33048', 'useLihzahrdAltar'],
  ['10 关闭门', ':33049-33111', 'T.DOOR_CLOSED'],
  ['11 开启门', ':33112-33119', 'T.DOOR_OPEN'],
  ['88 梳妆台', ':33120-33196', "TILE_BY_KEY['dresser']"],
  ['209 大炮', ':33197-33269 瞄准+传送门炮开火', 'sh === 209'],
  ['510/511 箭头告示牌', ':33270-33313 frameY±36 8档', 'sh === 510 || sh === 511'],
  ['21/467/29/97/463/491 容器族', ':33314-33523', 'tryOpenChest'],
  ['314 矿车轨道(★BJ297 补 gravDir 门+下坐支+±2 邻域扫描 :32213-32250)', ':33524-33539 + :32213-32250', 'minecartTrackInteraction'],
  ['合成站尾臂(任意 tile)', ':33541-33547 GetCraftingFilterForTile', 'craftingFilterForTile'],
];

const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const furnitureSrc = readFileSync(new URL('../src/world/FurnitureItems.ts', import.meta.url), 'utf8');

describe('BJ250 普查表结构锁（TileInteractionsUse 33 支钉死）', () => {
  it('普查表覆盖完整（49 行=33 支归组）', () => {
    expect(CENSUS.length).toBe(49);
  });

  it('每支在本仓有臂标记（缺失=静默截断,爆红）', () => {
    for (const [tile, anchor, marker] of CENSUS) {
      const src = tile.startsWith('395') || tile.startsWith('470') || tile.startsWith('471')
        || tile.startsWith('475') || tile.startsWith('520') || tile.startsWith('698')
        || tile.startsWith('334')
        ? furnitureSrc : gameSrc;
      expect(src, `tile ${tile}（${anchor}）缺本仓臂标记: ${marker}`).toContain(marker);
    }
  });
});

// ============================================================
// ② 行为锁（shell 直驱 interactAt）
// ============================================================
const C21 = TILE_BY_KEY['v_212_snowballlauncher'];
const C209 = TILE_BY_KEY['v_209_cannon'];
const C215 = TILE_BY_KEY['v_215_campfires'];
const C33 = TILE_BY_KEY['candle'];
const C440 = TILE_BY_KEY['v_440_gemlocks'];
const C441 = TILE_BY_KEY['v_441_fakecontainers'];
const C510 = TILE_BY_KEY['v_510_arrow_sign'];
const C387 = TILE_BY_KEY['v_387_trap_door_closed'];
const C386 = TILE_BY_KEY['v_386_trapdooropen'];
const C699 = TILE_BY_KEY['v_699_alchemy_flask'];
const C104 = TILE_BY_KEY['grandfather_clock'];
const CTORCH = TILE_BY_KEY['torch'];

function mkWorld(): World {
  return new World(80, 60, 7, 'bj250');
}

function bjShell(w: World, px = 30 * TILE, py = 30 * TILE) {
  const g = Object.create(Game.prototype) as unknown as
    Record<string, unknown> & { interactAt(tx: number, ty: number): void };
  const projectiles: unknown[] = [];
  const sfx: string[] = [];
  const drops: Array<[string, number]> = [];
  const texts: Array<[string, number, number, number]> = [];
  const broken: Array<[number, number]> = [];
  const buffs: Array<[BuffType, number]> = [];
  const hitSwitchCalls: Array<[number, number]> = [];
  const wiring = new Wiring(w.store);
  (wiring as unknown as { hitSwitch: unknown }).hitSwitch = (x: number, y: number) => { hitSwitchCalls.push([x, y]); };
  g.world = w;
  g.wiring = wiring;
  const input = { rightDown: true };
  g.input = input;
  g.netCanEditTile = () => true;      // 单人权威面
  g.inTileRange = () => true;         // 距离门非本测面
  g.entities = {
    projectiles, enemies: [], npcs: [], critters: [],
    add: (e: unknown, _bucket: string) => { projectiles.push(e); },
  };
  g.player = {
    cx: px, cy: py, x: px - 6, y: py - 14, w: 12, h: 28,
    isGhostPhase: () => false,   // ★刀I补桩(BJ343 EmptyTile 玩家臂判据)
    snowballLauncherInteractionCooldown: 0,
    buffs: { apply: (t: BuffType, d: number) => buffs.push([t, d]) },
    inv: { slots: [] as Array<{ id: number; stack: number } | null> },
  };
  g.playSfxFile = (name: string) => { sfx.push(name); };
  g.sfxAt = (name: string) => { sfx.push(name); };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push([key, n]); };
  g.newText = (text: string, r: number, gr: number, b: number) => { texts.push([text, r, gr, b]); };
  g.breakTile = (x: number, y: number) => { broken.push([x, y]); };
  return { g, input, projectiles, sfx, drops, texts, broken, buffs, hitSwitchCalls };
}

describe('BJ250 行为锁：212 雪球发射器右键（Player.cs:32370-32413）', () => {
  it('右键发射弹 166（左带反向）+ 冷却置 7 + 不吞 rightDown + 置让位旗', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, C21, 0, 0);   // band0(左) col0 row0
    const { g, input, projectiles, sfx } = bjShell(w);
    g.interactAt(10, 20);
    const p = projectiles.find((e): e is TrapShot => e instanceof TrapShot);
    expect(p, '未发射雪球').toBeTruthy();
    expect(p!.projId).toBe(166);
    expect(p!.damage).toBe(35);
    expect(p!.vx).toBeLessThan(0);          // band0 → dx 反向
    // 出膛位（:32394）：(ax+2)*16-8, (ay+2)*16-12；band0 X-16
    expect(p!.x).toBe((10 + 2) * 16 - 8 - 16);
    expect(p!.y).toBe((20 + 2) * 16 - 12);
    const pl = g.player as unknown as { snowballLauncherInteractionCooldown: number };
    expect(pl.snowballLauncherInteractionCooldown).toBe(7);
    expect(input.rightDown).toBe(true);   // ★不吞=按住连喷
    expect(g.tileInteractHappened).toBe(true);            // flag2 让位面
    expect(sfx).toContain('Item_11');
  });

  it('冷却中不发射（7t 门 :32370）；冷却走完恢复', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 20, C21, 54, 0);   // band1(右)
    const { g, input, projectiles } = bjShell(w);
    (g.player as unknown as { snowballLauncherInteractionCooldown: number }).snowballLauncherInteractionCooldown = 3;
    g.interactAt(10, 20);
    expect(projectiles).toEqual([]);
    (g.player as unknown as { snowballLauncherInteractionCooldown: number }).snowballLauncherInteractionCooldown = 0;
    g.interactAt(10, 20);
    expect(projectiles.length).toBe(1);
    expect((projectiles[0] as TrapShot).vx).toBeGreaterThan(0);   // band1 → 不反向
  });
});

describe('BJ250 行为锁：209 大炮右键（Player.cs:33197-33269）', () => {
  it('普通炮（band0）点顶列 → 仰角 +54（4×3 整块 frameY 平移）', () => {
    const w = mkWorld();
    const st = w.store;
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 3; r++) {
        st.setTileSilent(20 + c, 20 + r, C209, c * 18, 0 * 54 + r * 18);   // band0 elev0
      }
    }
    const { g, input } = bjShell(w);
    g.interactAt(20, 20);   // col0 → +54
    expect(st.frameY[st.idx(20, 20)]).toBe(54);
    expect(st.frameY[st.idx(23, 22)]).toBe(54 + 36);
    expect(st.frameX[st.idx(20, 20)]).toBe(0);   // frameX 不动
  });

  it('仰角 0 档点降档列被钳位（:33226-33228）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(23, 20, C209, 3 * 18, 0);   // band0 col3 → -54,elev0 钳
    const { g, input } = bjShell(w);
    g.interactAt(23, 20);
    expect(st.frameY[st.idx(23, 20)]).toBe(0);
  });

  it('传送门炮（band4）底行点击开火：弹 601 form=1、垂直档 +5px 出膛偏移', () => {
    const w = mkWorld();
    const st = w.store;
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 3; r++) {
        st.setTileSilent(20 + c, 20 + r, C209, 4 * 72 + c * 18, 4 * 54 + r * 18);   // band4 elev4
      }
    }
    const { g, input, projectiles } = bjShell(w);
    g.interactAt(21, 22);   // col1 row2（底行）→ 开火
    const p = projectiles.find((e): e is TrapShot => e instanceof TrapShot);
    expect(p, '传送门炮未开火').toBeTruthy();
    expect(p!.kind).toBe('portalbolt');
    expect(p!.form).toBe(1);                 // band4 → ai0=1（蓝门）
    expect(p!.damage).toBe(0);
    // elev4 = 垂直档 [0,-10] 归一×3 → (0,-3)；出膛 ((ax+2)*16+5, (ay+2)*16+5)
    expect(p!.vx).toBeCloseTo(0, 5);
    expect(p!.vy).toBeCloseTo(-3, 5);
    expect(p!.x).toBe(22 * 16 + 5);
    expect(p!.y).toBe(22 * 16 + 5);
    expect(input.rightDown).toBe(false);   // 消费
  });

  it('传送门炮顶/中行点击 = 换向（frameX ±72）不开火', () => {
    const w = mkWorld();
    const st = w.store;
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 3; r++) {
        st.setTileSilent(20 + c, 20 + r, C209, 3 * 72 + c * 18, 0 + r * 18);   // band3 elev0
      }
    }
    const { g, input, projectiles } = bjShell(w);
    g.interactAt(21, 20);   // col1 row0 → 换向 +72
    expect(projectiles).toEqual([]);
    expect(st.frameX[st.idx(20, 20)]).toBe(3 * 72 + 72);   // band3→band4
    expect(st.frameX[st.idx(23, 22)]).toBe(3 * 72 + 54 + 72);
  });
});

describe('BJ250 行为锁：215 篝火 / 蜡烛族翻面', () => {
  it('篝火：Sound 28 + 整块 3×2 frameY ±36 点燃→熄灭（:32479-32509）', () => {
    const w = mkWorld();
    const st = w.store;
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 2; r++) st.setTileSilent(10 + c, 20 + r, C215, c * 18, r * 18);
    }
    const { g, input, sfx } = bjShell(w);
    g.interactAt(11, 21);   // 点中间格
    expect(sfx).toContain('mech');   // Sound 28（校验前即播）
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 2; r++) {
        expect(st.frameY[st.idx(10 + c, 20 + r)]).toBe(36 + r * 18);
      }
    }
    expect(input.rightDown).toBe(false);
  });

  it('篝火：熄灭态再点 → 点燃（±36 双向）', () => {
    const w = mkWorld();
    const st = w.store;
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 2; r++) st.setTileSilent(10 + c, 20 + r, C215, c * 18, 36 + r * 18);
    }
    const { g, input } = bjShell(w);
    g.interactAt(10, 20);
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 2; r++) {
        expect(st.frameY[st.idx(10 + c, 20 + r)]).toBe(r * 18);
      }
    }
  });

  it('蜡烛：frameX 0↔18 翻面 + 原版【无声】+ 吞按键', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, C33, 0, 0);
    const { g, input, sfx } = bjShell(w);
    g.interactAt(10, 20);
    expect(st.frameX[st.idx(10, 20)]).toBe(18);
    expect(sfx).toEqual([]);   // 原版蜡烛臂无声
    expect(input.rightDown).toBe(false);
    input.rightDown = true;
    g.interactAt(10, 20);
    expect(st.frameX[st.idx(10, 20)]).toBe(0);
  });
});

describe('BJ250 行为锁：440 宝石锁（Player.cs:32747-32808 + ToggleGemLock）', () => {
  it('上排 + 持对应宝石 → 消耗 1 + 开锁（3×3 frameY → 54 带）+ HitSwitch(锚)', () => {
    const w = mkWorld();
    const st = w.store;
    // band4（1522）关态 3×3：frameX=216+col*18, frameY=row*18
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3; r++) st.setTileSilent(10 + c, 20 + r, C440, 4 * 54 + c * 18, r * 18);
    }
    const { g, input, hitSwitchCalls } = bjShell(w);
    const gemId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1522]];
    (g.player as unknown as { inv: { slots: unknown[] } }).inv.slots = [{ id: gemId, stack: 3 }];
    g.interactAt(11, 20);   // 上排
    expect(g.player).toHaveProperty('inv');
    const slots = (g.player as unknown as { inv: { slots: Array<{ id: number; stack: number } | null> } }).inv.slots;
    expect(slots[0]).not.toBeNull();
    expect(slots[0]!.stack).toBe(2);   // 消耗 1
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3; r++) {
        expect(st.frameY[st.idx(10 + c, 20 + r)]).toBe(54 + r * 18);   // 开态带
      }
    }
    expect(hitSwitchCalls).toEqual([[10, 20]]);   // 尾流 HitSwitch(锚点) :46924
    expect(input.rightDown).toBe(false);
  });

  it('上排但未持宝石 → 静默不动（HasItem 门 :32781）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, C440, 0, 0);
    const { g, input } = bjShell(w);
    g.interactAt(10, 20);
    expect(st.frameY[st.idx(10, 20)]).toBe(0);   // 未开
  });

  it('下排 → 关锁 + 掉出对应宝石 + HitSwitch(锚)', () => {
    const w = mkWorld();
    const st = w.store;
    // band0（1526）开态：frameY = 54 + row*18
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3; r++) st.setTileSilent(10 + c, 20 + r, C440, 0 * 54 + c * 18, 54 + r * 18);
    }
    const { g, input, drops, hitSwitchCalls } = bjShell(w);
    g.interactAt(11, 22);   // 下排
    expect(drops.length).toBe(1);
    expect(drops[0][0]).toBe(VANILLA_ITEM_KEY_BY_ID[1526]);
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3; r++) {
        expect(st.frameY[st.idx(10 + c, 20 + r)]).toBe(r * 18);   // 关态带
      }
    }
    expect(hitSwitchCalls).toEqual([[10, 20]]);
  });
});

describe('BJ250 行为锁：216/335/338 烟花族右键', () => {
  it('烟花火箭 216：弹 167+色变体 (0,-8) 伤 150 + 移除 1×2（LaunchRocket）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, TILE_BY_KEY['v_216_firework'], 0, 2 * 40);   // style2(蓝) 上格
    const { g, input, projectiles } = bjShell(w);
    g.interactAt(10, 20);
    const p = projectiles.find((e): e is TrapShot => e instanceof TrapShot);
    expect(p).toBeTruthy();
    expect(p!.kind).toBe('fireworkRocket');
    expect(p!.form).toBe(2);
    expect(p!.vy).toBe(-8);
    expect(p!.damage).toBe(150);
    expect(st.get(10, 20)).toBe(0);      // 发射即移除（:62203-62204）
    expect(st.get(10, 21)).toBe(0);
  });

  it('烟花盒 335：弹 415+rand(4) (0,-8) 伤 0（LaunchRocketSmall）', () => {
    const w = mkWorld();
    const st = w.store;
    for (let c = 0; c < 2; c++) {
      for (let r = 0; r < 2; r++) {
        st.setTileSilent(10 + c, 20 + r, TILE_BY_KEY['v_335_fireworksbox'], c * 18, r * 18);
      }
    }
    const { g, input, projectiles } = bjShell(w);
    g.interactAt(11, 21);   // 点右下格
    const p = projectiles.find((e): e is TrapShot => e instanceof TrapShot);
    expect(p).toBeTruthy();
    expect(p!.kind).toBe('fireworksBoxRocket');
    // frameX/frameY==18 回锚（:62677-62682）→ 出膛 (10*16+16, 20*16+2)
    expect(p!.x).toBe(10 * 16 + 16);
    expect(p!.y).toBe(20 * 16 + 2);
    expect(st.get(11, 21)).not.toBe(0);  // 盒体不移除
  });

  it('烟花喷泉 338：同锚去重 + 弹 419+rand(4) 静态锚定', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, TILE_BY_KEY['v_338_fireworkfountain'], 0, 0);    // 上格
    st.setTileSilent(10, 21, TILE_BY_KEY['v_338_fireworkfountain'], 0, 18);   // 下格
    const { g, input, projectiles } = bjShell(w);
    g.interactAt(10, 21);   // 点下格（frameY==18 → 锚 y-1）
    expect(projectiles.length).toBe(1);
    input.rightDown = true;
    g.interactAt(10, 21);
    expect(projectiles.length).toBe(1);   // 同锚去重（:32609-32616）
    const p = projectiles[0] as TrapShot;
    expect(p.kind).toBe('fireworkFountain');
    expect(p.ax).toBe(10);
    expect(p.ay).toBe(20);                // frameY==18 → 锚 y-1
    expect(p.x).toBe(10 * 16 + 8);
    expect(p.y).toBe(20 * 16 + 2);
  });
});

describe('BJ250 行为锁：活板门/陷阱箱/箭头牌', () => {
  it('387 关态活板门右键 → 开（386）；386 右键 → 关（占位门拒关实体上格）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, C387, 0, 0);
    st.setTileSilent(11, 20, C387, 18, 0);
    const { g, input } = bjShell(w);
    g.interactAt(10, 20);
    expect(st.get(10, 20)).toBe(C386);
    expect(st.get(11, 20)).toBe(C386);
    input.rightDown = true;
    g.interactAt(10, 20);
    expect(st.get(10, 20)).toBe(C387);   // 开态再点 → 关（areaEmpty 空面通过）
    expect(st.get(11, 20)).toBe(C387);
  });

  it('441 陷阱箱右键 → HitSwitch（本仓 hitSwitch 441 支面）', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 20, C441, 0, 0);
    const { g, input, hitSwitchCalls } = bjShell(w);
    g.interactAt(10, 20);
    expect(hitSwitchCalls).toEqual([[10, 20]]);
    expect(input.rightDown).toBe(false);
  });

  it('510 箭头牌：右列 +36 步进、7 档回绕 -252（8 档循环）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 20, C510, 0, 0);
    st.setTileSilent(11, 20, C510, 18, 0);
    st.setTileSilent(10, 21, C510, 0, 18);
    st.setTileSilent(11, 21, C510, 18, 18);
    const { g, input } = bjShell(w);
    g.interactAt(11, 20);   // 右列 +36
    expect(st.frameY[st.idx(10, 20)]).toBe(36);
    expect(st.frameY[st.idx(11, 21)]).toBe(18 + 36);
    // 推到 7 档再点右列 → 回绕 -252 → 0
    for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) {
      st.frameY[st.idx(10 + c, 20 + r)] = 7 * 36 + r * 18;
    }
    input.rightDown = true;
    g.interactAt(11, 20);
    expect(st.frameY[st.idx(10, 20)]).toBe(0);
    expect(st.frameY[st.idx(11, 21)]).toBe(18);
    // 左列 0 档 → 回绕 +252
    input.rightDown = true;
    g.interactAt(10, 21);
    expect(st.frameY[st.idx(10, 20)]).toBe(7 * 36);
    expect(st.frameY[st.idx(11, 21)]).toBe(7 * 36 + 18);
  });
});

describe('BJ250 行为锁：699 药水站 / 104 落地钟 / 火把拾取', () => {
  it('699 右键 → buff 366（108000t=1800s）+ Item179 音', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 20, C699, 0, 0);
    const { g, input, buffs, sfx } = bjShell(w);
    g.interactAt(10, 20);
    expect(buffs).toEqual([[BuffType.DeadCellsPotionStation, 1800]]);
    expect(sfx).toContain('Item_179');
  });

  it('buff 366 在栏 → deadCells 置位（×1.2 时长门,UpdateBuffs :10273-10276 面收口）', () => {
    const b = new BuffState();
    expect(b.deadCells).toBe(false);
    b.apply(BuffType.DeadCellsPotionStation, 1800);
    expect(b.deadCells).toBe(true);
  });

  it('104 落地钟右键 → 聊天框报时（ServerMessage 色 255,240,20）', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 20, C104, 0, 0);
    const { g, input, texts } = bjShell(w);
    w.clock.timeOfDay = 8.25 / 24;   // 8:15 AM
    g.interactAt(10, 20);
    expect(texts.length).toBe(1);
    expect(texts[0]![0]).toContain('8:15');
    expect(texts[0]!.slice(1)).toEqual([255, 240, 20]);
  });

  it('火把右键 → KillTile 拾取（breakTile 面）', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 20, CTORCH, 0, 0);
    const { g, input, broken } = bjShell(w);
    g.interactAt(10, 20);
    expect(broken).toEqual([[10, 20]]);
    expect(input.rightDown).toBe(false);
  });
});

beforeAll(() => {
  languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));
});
