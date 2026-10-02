// ★BJ433（2026-10-02）捣蛋猫帮工链判别测试——用户实报"捣蛋猫不会帮玩家砍树、挖掘"。
//  定谳（Terarria1457 反编译唯一标杆）：
//   · 身份：zh-Hans lang「捣蛋猫」= PalworldMinionCattiva（Item 5663 → Buff 385 →
//     Projectile 1093）／「可靠的捣蛋猫」= PalworldMinionTrustyCattiva（6148 → 389 →
//     1112）。Item.json tooltip"还能帮你挖矿"= 帮工 AI 的官方文案面。
//   · 原版帮工 AI 全链（Projectile.cs AI_067 flag8 专属,逐行亲读）：
//     TryAssigningHelp :52208-52268（每拍窥探 PlayerIntentionGuesser——
//     PlayerIntentionGuesser.cs :30-123 全量；HarvestTrees→Step_Axe :2592 /
//     HarvestTreasure→Step_Pickaxe_MineSolids :2360）→ ai[0]=3 栖点态 :51207-51221
//     （num4=16 跳尾 :52151）→ <20px 入扑击 → HitIntention :52167-52206
//     （pickPower=41 经 player.PickTile 采掘 + CattivaHit 编排粒子）。
//     ★重置支 :50524（attackTarget>=0 && ai[0]==3）= 死码：flag16(=ai[0]==0||2,
//     :50507-50509) 在 TryAssigningHelp 置态【后】求值 → state 3 恒不检索 →
//     attackTarget 恒 -1（AI_067 局部量 :50458）。
//   · 触发侧：Player.cs:46102 斧支 Track(HarvestTrees) / :46162 镐支
//     Track(HarvestTreasure)；:46142/:54412 破块 AllowTracking 开 60t 窗。
//   · 同族普查：帮工 AI 仅 1093/1112（TryAssigningHelp 只在 flag8 支调用 :50492;
//     1118 黏土蓓蕾同 AI_067 flag9 无帮工;1094/1113 火绒狐 AI_026 无;1098/1123
//     钻地龟 AI_204 自主挖矿=另一体系已实装 petPickTile）。
//  本仓落刀面（本文件钉死）：
//   ① src/player/IntentionGuesser.ts（PlayerIntentionGuesser.cs 1:1）
//   ② src/player/SmartCursor.ts stepAxeCore/stepMineSolidsCore 导出核（类方法委托）
//   ③ Game.ts：intentionGuesser 持有 + fixedUpdate Update + tryMine Track/
//      allowTracking（:46102/:46142/:46162）+ petPickTile AllowTracking（:54412）
//   ④ MinionProj.ts：cattivaTryAssigningHelp / 栖点支 / cattivaHitIntention
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MinionProj } from '../src/entities/MinionProj';
import { TILE_DEFS } from '../src/data/tiles';
import { projectileData } from '../src/data/vanillaProjectiles';
import { IntentionGuesser, GuessedPlayerIntention } from '../src/player/IntentionGuesser';
import { stepAxeCore, stepMineSolidsCore, heldSemantics, type SmartCursorEnv, type Region } from '../src/player/SmartCursor';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_TS = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const MINION_TS = readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8');

const TILE_OF_SHEET = (sheet: number): number => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
const DIRT = TILE_OF_SHEET(1);
const TRUNK = TILE_OF_SHEET(5);   // 橡树干（TileID.Sets.IsATreeTrunk）

// ===================== 定谳锚 =====================
describe('定谳锚：物品/弹身份 + 落刀面接线', () => {
  it('1093 捣蛋猫 = aiStyle 67 minion（Projectile.SetDefaults :10206）', () => {
    expect(projectileData(1093)).toMatchObject({ aiStyle: 67, minion: true });
    expect(projectileData(1112)).toMatchObject({ aiStyle: 67, minion: true });
  });
  it('Game.ts 接线：tryMine Track（:46102/:46162）+ 破块 AllowTracking（:46142/:54412）', () => {
    expect(GAME_TS).toContain('intentionGuesser.track(');
    expect(GAME_TS).toContain('GuessedPlayerIntention.HarvestTrees');
    expect(GAME_TS).toContain('GuessedPlayerIntention.HarvestTreasure');
    // 破块 AllowTracking 站 = 通用支 + 祭坛 drill 直调支 + petPickTile（PickTile 内 :54412）
    expect(GAME_TS.match(/intentionGuesser\.allowTracking\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it('Game.ts 每拍 Update（Player.cs:24786 原位）+ IntentionGuesser 持有', () => {
    expect(GAME_TS).toContain('intentionGuesser = new IntentionGuesser()');
    expect(GAME_TS).toContain('this.intentionGuesser.update(');
  });
  it('MinionProj.ts 帮工链三站：TryAssigningHelp / 栖点支（num4=16）/ HitIntention 41', () => {
    expect(MINION_TS).toContain('cattivaTryAssigningHelp');
    expect(MINION_TS).toContain('cattivaHitIntention');
    expect(MINION_TS).toContain('ai67TryJumpingToTargetTail(ay, false, 16)');   // :52151-52153
    expect(MINION_TS).toContain('petPickTile?.(tx, ty, 41, 41)');               // :52181 pickPower=41
  });
  it('同族普查登记：帮工分派 flag8 专属（1094/1113/1118 不入 TryAssigningHelp 调用位）', () => {
    // :50490-50494 `if (flag8) { …; AI_067_FreakingPirates_TryAssigningHelp(); }`
    // ——仓内调用位带 `if (flag8)` 门；1118 走 palGroundStep 但 flag8=false 不分派
    expect(MINION_TS).toMatch(/if \(flag8\) this\.cattivaTryAssigningHelp\(game, p\);/);
  });
});

// ===================== IntentionGuesser 单元（PlayerIntentionGuesser.cs 1:1） =====================
const snapOf = (over?: Partial<Parameters<IntentionGuesser['update']>[0]>): Parameters<IntentionGuesser['update']>[0] => ({
  position: { x: 0, y: 0 }, center: { x: 0, y: 0 }, width: 20, direction: 1,
  mouse: { x: 0, y: 0 }, controlJump: false, usingOrReusing: false,
  heldPick: 0, heldAxe: 0, dead: false, ...over,
});

describe('IntentionGuesser：Track 窗门 + Update 失效门 + PrepareUsageProxy', () => {
  it('窗闭 Track 无操作；AllowTracking(60) 开窗后记录陈值（:32/:45-48）', () => {
    const ig = new IntentionGuesser();
    ig.track(snapOf(), 60, 69, GuessedPlayerIntention.HarvestTrees);   // 窗=0 → 丢弃
    expect(ig.intention).toBe(GuessedPlayerIntention.None);
    ig.allowTracking();
    ig.track(snapOf(), 60, 69, GuessedPlayerIntention.HarvestTrees);
    expect(ig.intention).toBe(GuessedPlayerIntention.HarvestTrees);
    expect(ig.lastX).toBe(60);
    expect(ig.playerActiveActionTimeLeft).toBe(60);
  });
  it('失效门：离陈值心 >80（:63-68）', () => {
    const ig = new IntentionGuesser();
    ig.allowTracking();
    ig.track(snapOf(), 60, 69, GuessedPlayerIntention.HarvestTrees);
    ig.update(snapOf({ center: { x: 81, y: 0 } }));                    // 恰 81px
    expect(ig.intention).toBe(GuessedPlayerIntention.None);
  });
  it('失效门：controlJump（:69-72）', () => {
    const ig = new IntentionGuesser();
    ig.allowTracking();
    ig.track(snapOf(), 60, 69, GuessedPlayerIntention.HarvestTreasure);
    ig.update(snapOf({ controlJump: true }));
    expect(ig.intention).toBe(GuessedPlayerIntention.None);
  });
  it('失效门：使用中但手持工具与意图族不符（:73-81）——镐意图持斧/斧意图持镐', () => {
    const ig = new IntentionGuesser();
    ig.allowTracking();
    ig.track(snapOf(), 60, 69, GuessedPlayerIntention.HarvestTreasure);
    ig.update(snapOf({ usingOrReusing: true, heldPick: 0, heldAxe: 40 }));
    expect(ig.intention).toBe(GuessedPlayerIntention.None);
    ig.allowTracking();
    ig.track(snapOf(), 60, 69, GuessedPlayerIntention.HarvestTrees);
    ig.update(snapOf({ usingOrReusing: true, heldPick: 40, heldAxe: 0 }));
    expect(ig.intention).toBe(GuessedPlayerIntention.None);
  });
  it('不合门：使用中且工具同族 → 意图保持（:73-81 反例）', () => {
    const ig = new IntentionGuesser();
    ig.allowTracking();
    ig.track(snapOf(), 60, 69, GuessedPlayerIntention.HarvestTrees);
    ig.update(snapOf({ usingOrReusing: true, heldPick: 0, heldAxe: 40 }));
    expect(ig.intention).toBe(GuessedPlayerIntention.HarvestTrees);
  });
  it('失效门：480t 超时（:82-85）与死亡（:86-89）', () => {
    const ig = new IntentionGuesser();
    ig.allowTracking();
    ig.track(snapOf(), 60, 69, GuessedPlayerIntention.HarvestTrees);
    for (let i = 0; i < 479; i++) ig.update(snapOf());
    expect(ig.intention).toBe(GuessedPlayerIntention.HarvestTrees);   // 479t 仍在
    ig.update(snapOf());                                              // 第 480t
    expect(ig.intention).toBe(GuessedPlayerIntention.None);
    const ig2 = new IntentionGuesser();
    ig2.allowTracking();
    ig2.track(snapOf(), 60, 69, GuessedPlayerIntention.HarvestTrees);
    ig2.update(snapOf({ dead: true }));
    expect(ig2.intention).toBe(GuessedPlayerIntention.None);
  });
  it('PrepareUsageProxy 区 = 1×1@(LastX,LastY) inflate ∩ 世界[10,max-10]（:98-123,'
    + 'C# Rectangle 右/下 +1 语义）', () => {
    const ig = new IntentionGuesser();
    ig.allowTracking();
    ig.track(snapOf(), 60, 69, GuessedPlayerIntention.HarvestTrees);
    const r = ig.prepareUsageProxy(15, 5, 120, 160);
    expect(r).toEqual({ x0: 45, y0: 64, x1: 76, y1: 75 });   // 60-15/69-5/60+16/69+6
    const r2 = ig.prepareUsageProxy(15, 15, 120, 160);
    expect(r2).toEqual({ x0: 45, y0: 54, x1: 76, y1: 85 });
    // 边界钳：陈值贴角 → 世界 [10, max-10] 截断（Rectangle.Intersect value2）
    const ig2 = new IntentionGuesser();
    ig2.allowTracking();
    ig2.track(snapOf(), 3, 3, GuessedPlayerIntention.HarvestTreasure);
    const r3 = ig2.prepareUsageProxy(15, 15, 120, 160);
    expect(r3.x0).toBe(10);
    expect(r3.y0).toBe(10);
  });
});

// ===================== 步核独立化（类方法委托等价 + 帮工合成用法） =====================
describe('stepAxeCore / stepMineSolidsCore（Step_Axe :2592 / MineSolids :2360）', () => {
  const mkWorld = (): World => {
    const w = new World(120, 160, 30, 'bj433');
    w.clock.timeOfDay = 0;
    for (let x = 50; x <= 70; x++) w.store.setTile(x, 70, DIRT);      // 地面
    for (let y = 65; y <= 69; y++) w.store.setTile(60, y, TRUNK);     // 树干列
    return w;
  };
  const mkEnv = (w: World, over?: Partial<SmartCursorEnv>): SmartCursorEnv => ({
    st: w.store,
    mouse: { x: 60 * 16 + 8, y: 69 * 16 + 8 },
    actor: { x: 58 * 16, y: 70 * 16 - 42, w: 20, h: 42, cx: 58 * 16 + 10, cy: 70 * 16 - 21, facing: 1 },
    held: { def: null, tool: { type: 'axe', power: 40 } },
    settings: { toggleMode: true, smartAxeAfterPickaxe: false, smartBlocksEnabled: false, holdCanReleaseMidUse: false },
    tileBoost: 0,
    wireToolMode: 0,
    occupants: [],
    controlUseItem: false,
    grappleAnchors: [],
    gravDir: 1,
    ...over,
  });
  it('斧核：树干列 → 沿 Y 下到根（:2653-2687）——命中 (60,69) 树根', () => {
    const w = mkWorld();
    const env = mkEnv(w);
    const sem = heldSemantics({ def: null, tool: { type: 'axe', power: 40 } });
    const reach: Region = { x0: 45, y0: 54, x1: 76, y1: 75 };
    let fx = -1, fy = -1;
    stepAxeCore(env, sem, reach, (x, y) => { fx = x; fy = y; }, () => fx !== -1);
    expect([fx, fy]).toEqual([60, 69]);
  });
  it('镐核：3:1 归约射线 → 首个可杀实心（:2360-2580）——命中地面行 70（射线首格）', () => {
    const w = mkWorld();
    const env = mkEnv(w, {
      mouse: { x: 60 * 16 + 8, y: 72 * 16 },                          // 竖向瞄准（|vy|>3|vx| → 纯竖）
      held: { def: null, tool: { type: 'pick', power: 40 } },
    });
    const sem = heldSemantics({ def: null, tool: { type: 'pick', power: 40 } });
    const reach: Region = { x0: 45, y0: 54, x1: 76, y1: 87 };
    let fx = -1, fy = -1;
    stepMineSolidsCore(env, sem, reach, (x, y) => { fx = x; fy = y; }, () => fx !== -1);
    expect(fy).toBe(70);                    // 射线入地首行（树干 60 列在 65-69——
    // MineSolids 只认实心非平台可杀格,树干非实心（tileAxe 族 solid=0）→ 落地面 70;
    // 列 = 前缘列→端点 Bresenham 首中（58→59/60 视射线栅格路径,核为既有未动移植件）
    expect(fx).toBeGreaterThanOrEqual(58);
    expect(fx).toBeLessThanOrEqual(60);
  });
});

// ===================== 帮工行为链（mock GameHooks + 真 MinionProj） =====================
/** 帮工链整链测试：意图喂入 → 猫寻格 → 步行 → 扑击 → petPickTile 采掘破块 */
describe('捣蛋猫帮工行为链（TryAssigningHelp → ai[0]=3 → 扑击 → HitIntention）', () => {
  const TILE_PX = TILE;
  const mkWorld = (): World => {
    const w = new World(120, 160, 30, 'bj433-chain');
    w.clock.timeOfDay = 0;
    for (let x = 50; x <= 70; x++) w.store.setTile(x, 70, DIRT);
    for (let y = 65; y <= 69; y++) w.store.setTile(60, y, TRUNK);
    return w;
  };

  function mkChain(pxTiles = 58): {
    w: World; g: GameHooks; player: Player; m: MinionProj; ig: IntentionGuesser;
    destroyed: Array<[number, number]>;
  } {
    const w = mkWorld();
    const player = new Player(pxTiles * TILE_PX, 70 * TILE_PX - 42, new Inventory());
    player.facing = 1;
    const ig = new IntentionGuesser();
    const destroyed: Array<[number, number]> = [];
    const dmgMap = new Map<string, number>();
    const g = {
      world: w,
      player,
      intentionGuesser: ig,
      enemies: () => [], critters: () => [], npcs: () => [],
      spawnDust: () => ({ vx: 0, vy: 0, scale: 1, alpha: 0, noGravity: false, color: null }),
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      playSfxFile: () => {}, playSfxWav: () => {},
      cutTile: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
      addDamageNumber: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      notifyInventoryChanged: () => {}, mapFullscreen: () => false,
      spawnFriendlyProj: () => {}, addLightAt: () => {},
      // 简化 petPickTile（Game.petPickTile :22236 语义子集——测试格树干/泥土全伤,
      // 无门槛表;破块即 allowTracking=原版 PickTile :54412 口径）
      petPickTile: (tx: number, ty: number, pickPower: number): boolean => {
        const st = w.store;
        if (!st.inBounds(tx, ty)) return false;
        if (!st.hasTile(tx, ty)) return false;
        const key = `${tx},${ty}`;
        const total = (dmgMap.get(key) ?? 0) + pickPower;
        if (total >= 100) {
          st.setTile(tx, ty, 0);
          dmgMap.delete(key);
          destroyed.push([tx, ty]);
          ig.allowTracking();
          return true;
        }
        dmgMap.set(key, total);
        return true;
      },
    } as unknown as GameHooks;
    (g as unknown as { entities: { projectiles: unknown[]; add: () => void } }).entities =
      { projectiles: [], add: () => {} };
    const m = new MinionProj(player.cx, player.cy - 4, 1093, 10, 2, false, 0, false, () =>
      (g as unknown as { player: Player }).player);
    (g as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
    return { w, g, player, m, ig, destroyed };
  }

  const palA0 = (m: MinionProj): number => (m as unknown as { palA0: number }).palA0;

  it('整链：斧意图 → 入帮工态（可观测步行段）→ 步行至树根 → 三扑采掘破块（100/41=3 击）', () => {
    // 玩家距树根 ~4 格：分派拍 ai[0]=3 与扑击拍分离（state 3 跨拍可观测）
    const { w, g, player, m, ig, destroyed } = mkChain(54);
    // 模拟玩家两击开窗+记录（tryMine 站等价：首击破块开窗 → 次击 Track 生效）
    ig.allowTracking();
    ig.track({
      position: { x: player.x, y: player.y },
      center: { x: player.cx, y: player.cy },
      width: player.w, direction: player.facing,
      mouse: { x: 60 * TILE_PX + 8, y: 69 * TILE_PX + 8 },
    }, 60, 69, GuessedPlayerIntention.HarvestTrees);
    let sawHelping = false;
    for (let i = 0; i < 900 && destroyed.length === 0; i++) {
      m.fixedUpdate(1 / 60, g);
      if (palA0(m) === 3) sawHelping = true;
    }
    expect(sawHelping).toBe(true);                       // ai[0]=3 帮工态入过（跨拍步行段）
    expect(destroyed.length).toBeGreaterThanOrEqual(1);  // HitIntention 采掘破块
    expect(destroyed[0][0]).toBe(60);                    // 树根列（Step_Axe 下到根）
    expect(w.store.hasTile(60, 69)).toBe(false);         // (60,69) 已破
  });

  it('意图失效（Intention=None）→ 帮工态当拍归零回跟随（:52211-52219）', () => {
    const { g, player, m, ig } = mkChain(54);
    ig.allowTracking();
    ig.track({
      position: { x: player.x, y: player.y },
      center: { x: player.cx, y: player.cy },
      width: player.w, direction: player.facing,
      mouse: { x: 60 * TILE_PX + 8, y: 69 * TILE_PX + 8 },
    }, 60, 69, GuessedPlayerIntention.HarvestTrees);
    m.fixedUpdate(1 / 60, g);
    expect(palA0(m)).toBe(3);                            // 首拍即分派（无距离门,原版同构）
    ig.intention = GuessedPlayerIntention.None;
    m.fixedUpdate(1 / 60, g);
    expect(palA0(m)).toBe(0);                            // 失效即归零
  });

  it('镐意图（HarvestTreasure）→ stepMineSolidsCore 寻格采掘地面（:52238-52250）', () => {
    const { w, g, player, m, ig, destroyed } = mkChain();
    // 清掉树干,纯镐意图挖地面
    for (let y = 65; y <= 69; y++) w.store.setTile(60, y, 0);
    ig.allowTracking();
    ig.track({
      position: { x: player.x, y: player.y },
      center: { x: player.cx, y: player.cy },
      width: player.w, direction: player.facing,
      mouse: { x: 60 * TILE_PX + 8, y: 72 * TILE_PX },   // 竖向瞄准地面下
    }, 60, 70, GuessedPlayerIntention.HarvestTreasure);
    for (let i = 0; i < 1200 && destroyed.length === 0; i++) {
      m.fixedUpdate(1 / 60, g);
    }
    expect(destroyed.length).toBeGreaterThanOrEqual(1);
    expect(destroyed[0][1]).toBeGreaterThanOrEqual(70);  // 地面行（镐核射线入地）
  });

  it('1118 黏土蓓蕾（flag9）不吃帮工分派——同 AI_067 无帮工（同族普查对照位）', () => {
    const { g, player, ig } = mkChain();
    const bud = new MinionProj(player.cx, player.cy - 4, 1118, 10, 2, false, 0, false, () =>
      (g as unknown as { player: Player }).player);
    ig.allowTracking();
    ig.track({
      position: { x: player.x, y: player.y },
      center: { x: player.cx, y: player.cy },
      width: player.w, direction: player.facing,
      mouse: { x: 60 * TILE_PX + 8, y: 69 * TILE_PX + 8 },
    }, 60, 69, GuessedPlayerIntention.HarvestTrees);
    bud.fixedUpdate(1 / 60, g);
    expect((bud as unknown as { palA0: number }).palA0).not.toBe(3);
  });
});
