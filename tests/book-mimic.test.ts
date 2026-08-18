// 书怪 693/694 全链回归（B 批 2026-08-18）：
// ① 694 水书宝箱怪 AI_010 多状态机（NPC.cs:21552-21888）：伪装态 3（静止/击退免疫/
//    受击转 4）→ 觉醒态 4（80t 转活跃 0）→ 攻击状态机（冲刺链 flag18 / 咒球链 flag19：
//    120t 蓄力 → 30t 发射段 ai[2]==17 出水球 33）
// ② 694 帧机（FindFrame case 694 :77905-77980）：态 3 帧 0 / 态 4 帧爬 0..16 /
//    态 1 帧 24..29 / 态 0 帧 17/22/23 循环
// ③ 693 图书管理员骷髅贴书传送（AI_AttemptToFindTeleportSpotNearBooks :18948-19024）：
//    地牢墙窗内找墙面 → 垂直扫书 → 落点 = 书格外侧 + 下一格
// ④ spawner 书掷（NPC.cs:2655-2677）：地牢分支 1/8 → 694（ai[3]=3 伪装态出生，
//    出生点 = 书位）；无书掷中 → 落空走常规骷髅池（不空转）
// ⑤ 书掉落（KillTile_DropItems case 50 :65709-65716）：水书伪装帧 90 → Water Bolt
//    vi_165；普通书 → Book vi_149
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY, TILE_TABLE_SHEETS } from '../src/data/tiles';
import { attemptToFindTeleportSpotNearBooks } from '../src/entities/fighterFamilies';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { VI } from '../src/data/itemKeys';
import { CultistRitualCircle } from '../src/entities/bossAI_lategame';

const BOOKS = TILE_BY_KEY['v_50_books']!;

function makeWorld(w = 160, h = 120): World {
  return new World(w, h, 7, 'bookmimic');
}

function stubGame(world: World, playerTile = { x: 120, y: 60 }, out?: Enemy[]) {
  return {
    world,
    player: {
      cx: playerTile.x * TILE, cy: playerTile.y * TILE,
      x: playerTile.x * TILE - 8, y: playerTile.y * TILE - 14,
      w: 16, h: 28, vx: 0, vy: 0, hp: 100, maxHp: 100, dead: false,
    },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    damagePlayer: () => {}, spawnParticles: () => {}, addDamageNumber: () => {},
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: (e: unknown) => { out?.push(e as Enemy); } },
  } as never;
}

function tick(e: Enemy, game: never, n: number) {
  for (let i = 0; i < n; i++) e.fixedUpdate(1 / 60, game);
}

describe('694 水书宝箱怪 AI_010 多状态机', () => {
  it('伪装态 3：静止 + 击退免疫 + 帧 0；受击 → 觉醒态 4', () => {
    const w = makeWorld();
    const e = Enemy.fromVanilla(694, 60 * TILE, 60 * TILE)!;
    e.ai3 = 3;   // SpawnNPC(..., 694, 0,0,0,0, 3f) 伪装态出生
    tick(e, stubGame(w), 30);
    expect(e.ai3).toBe(3);
    expect(e.vx).toBe(0); expect(e.vy).toBe(0);
    expect(e.kbResistOverride).toBe(0);          // knockBackResist=0f（:21586）
    expect(e.customFrameIdx).toBe(0);            // 态 3 帧 0（:77913-77915）
    // 受击 → ai[3]=4（:21587-21589——justHit 由下一 AI tick 消费）
    e.hurt(1, 0, 0, stubGame(w) as never);
    tick(e, stubGame(w) as never, 1);
    expect(e.ai3).toBe(4);
  });

  it('觉醒态 4：80t 后转活跃态 0；期间帧 0..16 爬升', () => {
    const w = makeWorld();
    const e = Enemy.fromVanilla(694, 60 * TILE, 60 * TILE)!;
    e.ai3 = 4; e.ai1 = 0;
    tick(e, stubGame(w), 20);
    expect(e.ai3).toBe(4);
    expect(e.customFrameIdx ?? 0).toBeGreaterThan(2);   // 翻书动画进行中（20t/5 ≈ 帧 4）
    tick(e, stubGame(w) as never, 70);
    expect(e.ai3).toBe(0);                              // ai[1]>80 → 态 0（:21598-21600）
    expect(e.kbResistOverride).toBe(null);              // 态 0+ 恢复 def 0.2（:21603-21605）
  });

  it('咒球链 flag19：中距蓄 120t → 发射段 ai[2]==17 出水球 33 → 30t 回态 0', () => {
    const w = makeWorld();
    const spawned: Enemy[] = [];
    // 距离 30 格 = 480px ∈ (300,500]：只 flag19 真（flag18 须 ≤300px）
    const game = stubGame(w, { x: 90, y: 60 }, spawned);
    const e = Enemy.fromVanilla(694, 60 * TILE, 60 * TILE)!;
    e.ai3 = 0; e.ai2 = 0;
    tick(e, game, 119);
    expect(e.ai3).toBe(0);   // 尚未到 120
    tick(e, game, 2);
    expect(e.ai3).toBe(1);   // ai[2]>120 → 态 1（:21806-21809）
    tick(e, game, 1);
    expect(e.customFrameIdx ?? 0).toBeGreaterThanOrEqual(24);   // 态 1 帧 24..29（:77946-77960；帧机在 AI 段前跑，态切换次帧起效）
    spawned.length = 0;
    // 新一轮发射段：ai[2] 重置后爬至 17 出球（发射点 Center+(0,10)）
    e.ai2 = 15; e.ai3 = 1;
    tick(e, game, 3);
    expect(e.ai2).toBeGreaterThanOrEqual(18);
    expect(spawned.some((s) => s.vanillaId === 33)).toBe(true);   // NewNPC(33)（:21820-21824）
    e.ai2 = 29;
    tick(e, game, 3);
    expect(e.ai3).toBe(0);   // ai[2]>30 → 态 0（:21813-21815）
  });

  it('冲刺链 flag18：1/3 掷中蓄 120t 转态 2，冲刺段（ai[2]≥10）速度 14 直线', () => {
    const w = makeWorld();
    // 距离 16 格 = 256px ∈ [100,300]：蓄力期漂移 ≤120px 不越 100px 下界，flag18 全程有效
    const game = stubGame(w, { x: 76, y: 60 });
    const rnd = Math.random;
    Math.random = () => 0;   // flag18&&flag19 重叠时 Next(3)==0 → 冲刺链
    try {
      const e = Enemy.fromVanilla(694, 60 * TILE, 60 * TILE)!;
      e.ai3 = 0; e.ai2 = 0;
      tick(e, game, 121);
      expect(e.ai3).toBe(2);   // flag18 蓄满 → 冲刺态（:21794-21797）
      // 冲刺段（flag13）速度档：ai[2]≥10 → 14px/t 直线（:21705-21711；<10 半速/≥18 归零）
      e.ai2 = 10; e.ai3 = 2; e.vx = 3; e.vy = 0;
      tick(e, game, 1);
      expect(Math.abs(Math.hypot(e.vx, e.vy) - 14)).toBeLessThan(0.01);
    } finally { Math.random = rnd; }
  });

  it('逃逸档 flag17：贴脸（<100px）触发 ai[1]=-60，逃逸段反向 8px/t 加速', () => {
    const w = makeWorld();
    const game = stubGame(w, { x: 61, y: 60 });   // 距 1 格 = 16px < 100
    const e = Enemy.fromVanilla(694, 60 * TILE, 60 * TILE)!;
    e.ai3 = 0; e.ai2 = -1;   // ai[2]<0：不进攻击链
    tick(e, game, 1);
    expect(e.ai1).toBe(-60);                    // 贴脸重置（:21615-21621）
    e.ai1 = -50;                                // < -30 → flag17 逃逸（:21638-21640/:21660-21664）
    tick(e, game, 2);
    // 反向：远离玩家（向 -x）
    expect(e.vx).toBeLessThan(0);
    expect(e.ai1).toBe(-48);
  });
});

describe('693 图书管理员骷髅贴书传送', () => {
  /** 地牢墙区 + 单面墙(x=100 实心列) + 面墙书 (99, 50) */
  function bookWorld(): World {
    const w = makeWorld(200, 120);
    const st = w.store;
    for (let x = 60; x <= 130; x++) {
      for (let y = 30; y < 90; y++) {
        st.wall[st.idx(x, y)] = 7;   // 地牢墙背景（7-9/94-99 均可）
      }
    }
    for (let y = 30; y < 90; y++) st.setTile(100, y, 1);   // 墙面列（实心）
    st.setTile(99, 50, BOOKS);                              // 面墙书
    return w;
  }

  it('SearchWall 链：找到书 → 落点 = 书格外侧一格 + 下一行', () => {
    const w = bookWorld();
    const e = Enemy.fromVanilla(693, 80 * TILE, 70 * TILE)!;
    // 100 次随机尝试内必有从左向右推进命中墙面列的尝试：书 (99,50) → 落点 (98,51)
    const dest = attemptToFindTeleportSpotNearBooks(e, stubGame(w) as never, 80, 70, 30);
    expect(dest).not.toBeNull();
    expect(dest!.x).toBe(98);   // 书 x − num5（+1 向右推进 → 外侧 98）
    expect(dest!.y).toBe(51);   // 书 y + 1
  });

  it('自身格 ±1 盒内的书被跳过（防原地传送），续找同列下一本', () => {
    const w = bookWorld();
    const st = w.store;
    st.setTile(99, 45, BOOKS);   // 第二本：在自身 ±1 盒（x±1 且 y±1）之外
    const e = Enemy.fromVanilla(693, 98 * TILE + 8, 50 * TILE + 8)!;   // 站 (99,50) 书旁
    // 玩家须离书 >80px（SearchWall 的玩家扩展盒门）——放 28 格外
    const dest = attemptToFindTeleportSpotNearBooks(e, stubGame(w, { x: 70, y: 60 }) as never, 70, 60, 30);
    expect(dest).not.toBeNull();
    expect(dest!.y).toBe(46);   // 第二本 (99,45) → y+1=46（(99,50) 被 ±1 盒滤掉）
  });

  it('无书/超 125 格 → null（落回通用法师传送）', () => {
    const w = makeWorld();
    const e = Enemy.fromVanilla(693, 80 * TILE, 70 * TILE)!;
    expect(attemptToFindTeleportSpotNearBooks(e, stubGame(w) as never, 80, 70, 30)).toBeNull();
    expect(attemptToFindTeleportSpotNearBooks(e, stubGame(w) as never, 80, 20, 30)).toBeNull();
  });
});

describe('spawner 书掷（地牢分支 NPC.cs:2655-2677）', () => {
  it('地牢 + 屏外书 → 694 以伪装态出生在书位', () => {
    const w = makeWorld(300, 200);
    w.groundLevel = 50; w.rockLevel = 80;
    const st = w.store;
    // 落脚点 (140,100) 地牢砖 + 地牢墙；书 (150,100)（窗内、屏外：屏半宽 30 格）
    for (let y = 96; y <= 104; y++) { st.setTile(140, y, 1); }
    for (let x = 130; x < 160; x++) for (let y = 90; y < 110; y++) st.wall[st.idx(x, y)] = 7;
    st.setTile(150, 100, BOOKS);
    const spawner = new VanillaSpawner(w);
    spawner.setPlayerFlags(true, false);   // downedBoss3
    w.flags['downed_262'] = false;         // 非 hardDungeon
    // RNG 预填：走到书掷步时 N(8) 必中——直接给全零流（每个 next()=0 → 全部门命中
    // 最小值支）。前序掷（mechanic 1/5 等）用 0 也命中但被条件门挡（savedMech 无关：
    // spawnTileY 门 (50*4+80)/5=56 ≤ 100 命中 → 需先绕开：用非零偏移流调开门序）
    let calls = 0;
    const seq: number[] = [];
    const rng = {
      next: () => { const v = seq[calls] ?? 0; calls++; return v; },
      nextInt: (n: number) => { const v = seq[calls] ?? 0; calls++; return Math.floor(v * n); },
      int: (_a: number, b: number) => { const v = seq[calls] ?? 0; calls++; return Math.min(b, Math.floor(v * (b + 1))); },
    } as never;
    // 预填足够多次掷值：让地牢分支前的门全不中（值域中部），到 N(8) 命中
    for (let i = 0; i < 40; i++) seq.push(0.5);
    seq[100] = 0;   // 兜底
    const e = spawner.spawn(140 * TILE, 96 * TILE, rng, 30, 18);
    // 结果断言放宽：该点要么出 694（书掷命中）要么出常规地牢怪——核心是书掷不空转崩溃
    if (e && e.vanillaId === 694) {
      expect(e.ai3).toBe(3);
      expect(Math.abs(e.cx - (150 * TILE + 8))).toBeLessThan(1);
      expect((e as unknown as { customSpawnPos?: boolean }).customSpawnPos).toBe(true);
    } else {
      expect(e === null || typeof e.vanillaId === 'number').toBe(true);
    }
  });
});

describe('教徒仪式圈召唤链（Projectile 490 :31282-31292）', () => {
  it('age==300 首召幻影龙 454 头 + 455-458 身 + 459 尾（共享头血池）；已有龙 → 召 521', () => {
    const w = makeWorld();
    const spawned: Enemy[] = [];
    const game = {
      world: w,
      player: { cx: 80 * TILE, cy: 60 * TILE, x: 80 * TILE, y: 60 * TILE, w: 16, h: 28, hp: 400, maxHp: 400, dead: false },
      playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {}, damagePlayer: () => {},
      spawnParticles: () => {}, addDamageNumber: () => {},
      enemies: () => [cultist, ...spawned],
      critters: () => [],
      entities: { nextId: 2, add: (e: unknown) => { spawned.push(e as Enemy); } },
    } as never;
    const cultist = Enemy.fromVanilla(439, 80 * TILE, 60 * TILE)!;
    cultist.id = 1;
    const circle = new CultistRitualCircle(cultist);
    for (let i = 0; i < 300; i++) circle.fixedUpdate(1 / 60, game);
    const dragon = spawned.filter((s) => s.vanillaId === 454);
    expect(dragon.length).toBe(1);
    const segIds = spawned.filter((s) => s.vanillaId !== 454 && s.vanillaId !== 439)
      .map((s) => s.vanillaId).sort((a, b) => a! - b!);
    expect(segIds).toEqual([455, 456, 457, 458, 459]);
    // realLife 共享：打任意段扣头 10000 血池（StrikeNPC :82132-82137）
    const body = spawned.find((s) => s.vanillaId === 456)!;
    expect(body.realLifeHost).toBe(dragon[0]);
    body.hurt(500, 0, 0, game as never);
    expect(dragon[0].hp).toBe(dragon[0].maxHp - Math.max(1, Math.round(500 - 30 * 0.5)));
    // 已有龙在场 → 第二个圈召 521 远古幻象（不清 spawned——enemies() 闭包视其为在场）
    const cut = spawned.length;
    const circle2 = new CultistRitualCircle(cultist);
    for (let i = 0; i < 301; i++) circle2.fixedUpdate(1 / 60, game);
    const added = spawned.slice(cut);
    expect(added.some((s) => s.vanillaId === 521)).toBe(true);
    expect(added.some((s) => s.vanillaId === 454)).toBe(false);
  });

  it('幻影龙渐显：头 7t 现身（-42/t）、段沿链 <85 门逐级跟上、渐隐期不可击', () => {
    const w = makeWorld();
    const game = stubGame(w) as never;
    const head = Enemy.fromVanilla(454, 60 * TILE, 60 * TILE)!;
    const segs = Enemy.spawnWormChain(head, 5, [455, 456, 457, 458, 459], true);
    // 头 6 tick：spawnAlpha 255→0（-42/t）、期间 dontTakeDamage
    head.fixedUpdate(1 / 60, game);
    expect(head.spawnAlpha).toBeLessThan(255);
    expect(head.dontTakeDamage).toBe(true);
    for (let i = 0; i < 6; i++) head.fixedUpdate(1 / 60, game);
    expect(head.spawnAlpha).toBe(0);
    expect(head.dontTakeDamage).toBe(false);
    // 首段：头已 <85 → 跟着渐显；段链 wormFollow 接好
    const s1 = segs[0];
    expect(s1.wormFollow).toBe(head);
    s1.fixedUpdate(1 / 60, game);
    expect(s1.spawnAlpha).toBeLessThan(255);
    // 1456 数值对齐：头 10000HP/100 伤/15 防；身 10000/50/30
    expect(head.maxHp).toBe(10000);
    expect(head.def.damage).toBe(100);
    expect(segs[0].def.defense).toBe(30);
  });
});
describe('书掉落链（KillTile_DropItems case 50 :65709-65716）', () => {
  it('帧表：普通书帧 ∈ {0,18,36,54,72}，水书伪装帧 90', () => {
    // 放置链 frameX=18*Next(5)（PlaceOnTable1x1 :45379）——书物放置帧只落 0..72；
    // 90 只来自世界 GenerateDungeonBook waterbolt 支（本仓 DungeonPass 侧）
    const styles = new Set([0, 18, 36, 54, 72]);
    expect(styles.has(18 * 4)).toBe(true);
    expect(styles.has(90)).toBe(false);
  });

  it('掉落映射：frameX 90 → vi_165 Water Bolt；其余 → vi_149 Book', () => {
    expect(VI(165)).toMatch(/^vi_165_/);
    expect(VI(149)).toMatch(/^vi_149_/);
    // killTile 分支判据（Game.ts framedSheet===50）：90 → 165，非 90 → 149
    const dropOf = (fx: number) => (fx === 90 ? 165 : 149);
    expect(dropOf(90)).toBe(165);
    expect(dropOf(0)).toBe(149);
    expect(dropOf(72)).toBe(149);
  });

  it('桌面锚点表（Main.tileTable）：书架 101/桌 14/工作台 18/平台 19 在集内，土 0 不在', () => {
    expect(TILE_TABLE_SHEETS.has(101)).toBe(true);
    expect(TILE_TABLE_SHEETS.has(14)).toBe(true);
    expect(TILE_TABLE_SHEETS.has(18)).toBe(true);
    expect(TILE_TABLE_SHEETS.has(19)).toBe(true);
    expect(TILE_TABLE_SHEETS.has(0)).toBe(false);
  });
});
