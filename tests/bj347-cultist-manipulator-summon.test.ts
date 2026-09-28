// BJ347 拜月教族两实报定谳锁（2026-09-25）：
// ① 教主 439 死亡掉落链：原版 NPCLoot(NPC.cs:79643) ← checkDead(:78844) ← Kill ←
//    StrikeNPC(:82394/82398)——掉落/记账均无玩家存活门；ItemDropDatabase.cs:587-592
//    RegisterBoss_AncientCultist = Common(3549 远古操作机,必掉)+Common(3372,7)+master 件。
//    「同归于尽」原版语义 = AI_084 玩家死自毁（NPC.cs:65272-65276 life=0+HitEffect+
//    active=false，不走 checkDead）→ 不掉落不记账；本仓曾漏 bossFled 被 Game bossBlock
//    误记为击败（downed_439+四柱+公告）——BJ347 修刀 = 自毁支置 bossFled。
// ② 召唤链：437 石碑 AI（NPC.cs:37166-37204）flag96 = 2×438 信徒 + 2×379 弓手全灭才
//    召 439。用户口述 451/452 = BoneThrowingSkeleton（NPCID.cs:11969-11971 误记）；
//    只杀两信徒留两弓手不出教主 = 原版本相，本仓 gone 检查 1:1（bossAI_lunar_misc.ts）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { RNG } from '../src/core/rng';
import { resolveDrops, type NpcDropCtx } from '../src/drops/NpcDrops';
import dropData from '../src/data/vanilla-npcdrops.json';
import { lunaticCultistAI } from '../src/entities/bossAI_lategame';
import type { GameHooks } from '../src/entities/types';

// ============================================================
// ① 掉落规则面：3549 必掉且无条件门（同归于尽场景走不到本链=原版自毁相）
// ============================================================
describe('BJ347 ① 教主 439 掉落链（ItemDropDatabase.cs:587-592）', () => {
  const entries = (dropData as { entries: Array<{ npcs?: number[]; rule: any }> }).entries;

  it('3549 规则 = common denom 1 且无 cond（掉落链无玩家存活/交互门的静态证据）', () => {
    const rules = entries.filter((e) => e.npcs?.includes(439)).map((e) => e.rule);
    const manip = rules.find((r) => r.item === 3549);
    expect(manip).toBeDefined();
    expect(manip!.k).toBe('common');
    expect(manip!.denom).toBe(1);                     // 1/1 = 必掉
    expect(manip!.cond).toBeUndefined();              // 无条件门
  });

  it('resolveDrops 经典档 20 掷：3549 每杀必掉；master 件(4937/4809)与面具门不混入', () => {
    const mkCtx = (seed: number): NpcDropCtx => ({
      rng: new RNG(seed),
      netId: 439, type: 439,
      isExpert: false, isMaster: false, hardMode: true, crimson: false,
      flags: { hardMode: true },
      x: 3000, y: 1500,
      worldSurfaceTile: 200, rockLayerTile: 400, underworldTileY: 900,
      maxTilesX: 4200, maxTilesY: 1200,
      lifeMax: 32000, friendly: false, boss: true, damage: 80, value: 100000,
      hp: 80, hpMax: 100, mana: 15, manaMax: 20,
      luck: 0,
    });
    for (let i = 0; i < 20; i++) {
      const res = resolveDrops(mkCtx(i * 1013 + 7));
      const ids = res.drops.map((d) => d.id);
      expect(ids).toContain(3549);                    // 每杀必掉
      expect(ids).not.toContain(4937);                // masterCommon 仅大师档
      expect(ids).not.toContain(4809);                // masterAll 仅大师档
      for (const d of res.drops) if (d.id === 3549) expect(d.n).toBe(1);
    }
  });
});

// ============================================================
// ② 自毁 face：玩家死 → 教主消散带 bossFled（无掉落无记账 = 原版 NPC.cs:65272）
//    + 克隆体连带清场（:65078-65087）
// ============================================================
const W = 200, H = 140, FLOOR = 100;

function makeWorld(): World {
  const w = new World(W, H, 7, 'bj347');
  const st = w.store;
  w.groundLevel = 50;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: unknown[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: string) => {
      (e as { id: number }).id = em.nextId++;
      (bucket === 'enemies' ? enemies : projectiles).push(e);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    addDPS: () => {},                                // hurt 实扣路径 DPS 表桩
  } as unknown as GameHooks['player'];
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, player, em };
}

function spawn(h: ReturnType<typeof makeHooks>, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

describe('BJ347 ② 教主自毁 = 非击杀消散（bossFled，NPC.cs:65272-65294）', () => {
  it('玩家死亡 → 教主当拍自毁：dead+bossFled 同置（不再被 Game 误记击败）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const cult = spawn(h, 439, 100, 70);
    cult.bInit = true; cult.ai0 = 0; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
    (h.player as unknown as { dead: boolean }).dead = true;
    lunaticCultistAI(cult, h.hooks, h.player);
    expect(cult.dead).toBe(true);
    // ★BJ347 修刀位：非击杀消散，Game 走 BossFled 分支。★BJ388 件5：分支内
    //  灰字 toast 已摘（原版消散零 UI 反馈），旗保留=不写 downed/不记击败
    expect(cult.bossFled).toBe(true);
  });

  it('仪式态克隆体随真身自毁连带清场且不置 bossFled（:65078-65087）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const cult = spawn(h, 439, 100, 70);
    cult.bInit = true; cult.ai0 = 5; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
    for (let t = 0; t < 31; t++) lunaticCultistAI(cult, h.hooks, h.player);   // t=30 生 2 克隆体
    const clones = h.enemies.filter((n) => n.vanillaId === 440 && !n.dead);
    expect(clones.length).toBe(2);
    (h.player as unknown as { dead: boolean }).dead = true;
    lunaticCultistAI(cult, h.hooks, h.player);
    expect(cult.dead).toBe(true);
    expect(cult.bossFled).toBe(true);
    for (const c of clones) {
      expect(c.dead).toBe(true);        // 连带清场
      expect(c.bossFled).toBeFalsy();   // 克隆体非 boss，无击败语义
    }
  });

  it('对偶面：玩家存活时同函数不触发自毁', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const cult = spawn(h, 439, 100, 70);
    cult.bInit = true; cult.ai0 = 0; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
    lunaticCultistAI(cult, h.hooks, h.player);
    expect(cult.dead).toBe(false);
    expect(cult.bossFled).toBe(false);
  });
});

// ============================================================
// ②b 仪式锚/克隆体/显形窗 不可击面（BJ347-② 用户补充线索实报：
//   「跪拜魔法阵有时可被攻击、打掉后不出 boss」=437 石碑 iframes=2 近似被
//   pierce===1 单发弹绕过；修=真 dontTakeDamage 持续态）
// ============================================================
describe('BJ347-②b 仪式锚不可击（437 石碑,SetDefaults :14219）', () => {
  it('石碑免疫全通道伤害（pierce=1 绕 iframes 向含）——碑活→守卫活→召唤门不受影响', () => {
    const h = makeHooks(makeWorld(), { x: 40, y: 96 });
    const { tablet, archers, devotees } = spawnTabletGroup(h);
    const hp0 = tablet.hp;
    expect(tablet.dontTakeDamage).toBe(true);      // fromVanilla 手补表 + AI 行双写
    for (const pierce of [1, 0, -1, 2]) {
      const r = tablet.hurt(1e9, 0, 0, h.hooks, 0, false, pierce, true);
      expect(r).toBe(false);                        // 全通道拒绝
      expect(tablet.hp).toBe(hp0);
      expect(tablet.dead).toBe(false);
    }
    // 召唤门照常：四件套全灭 → 教主落地
    for (const d of [...devotees, ...archers]) d.dead = true;
    tickTablet(h, 3);
    expect(h.enemies.some((e) => e.vanillaId === 439)).toBe(true);
  });
});

describe('BJ347-②b 克隆体 440 双相（仪式窗可击/窗外无敌 :65211-65212+合流 :66108）', () => {
  it('仪式窗(ai0=5)可击：hurt→justHit→下拍自灭+真身进 6 态', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const cult = spawn(h, 439, 100, 70);
    cult.bInit = true; cult.ai0 = 5; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
    for (let t = 0; t < 31; t++) lunaticCultistAI(cult, h.hooks, h.player);
    const clones = h.enemies.filter((n) => n.vanillaId === 440 && !n.dead);
    expect(clones.length).toBe(2);
    expect(clones[0].dontTakeDamage).toBe(false);   // 仪式窗=可击相
    const c = clones[0];
    const hp0 = c.hp;
    c.hurt(50, 0, 0, h.hooks, 0, false, 1, true);
    expect(c.hp).toBeLessThan(hp0);                 // hurt 返回值=是否致死,非是否命中——读 hp 差
    cult.ai0 = 5; cult.ai1 = 130;                   // 仪式窗内（120-420 消费窗）
    lunaticCultistAI(c, h.hooks, h.player);         // ★驱动克隆体自身 AI（justHit 消费在克隆体分支）
    expect(c.dead).toBe(true);                      // justHit → 自灭
    expect(cult.ai0).toBe(6);                       // 真身进硬直态（:65014-65016）
  });

  it('仪式窗外(ai0≠5)免疫：pierce=1 单发弹也被拒（旧 iframes=2 绕过向）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const cult = spawn(h, 439, 100, 70);
    cult.bInit = true; cult.ai0 = 5; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
    for (let t = 0; t < 31; t++) lunaticCultistAI(cult, h.hooks, h.player);
    const clones = h.enemies.filter((n) => n.vanillaId === 440 && !n.dead);
    cult.ai0 = 0; cult.ai1 = 0;                     // 拉出仪式态（镜像同步）
    lunaticCultistAI(cult, h.hooks, h.player);
    for (const c of clones) {
      lunaticCultistAI(c, h.hooks, h.player);       // ★克隆体自身 AI tick 写 dontTakeDamage
      expect(c.dontTakeDamage).toBe(true);          // 窗外=无敌相
      const hp0 = c.hp;
      c.hurt(1e9, 0, 0, h.hooks, 0, false, 1, true);
      expect(c.hp).toBe(hp0);                       // 零伤害（返回值恒 false,以 hp 判别）
      expect(c.dead).toBe(false);
    }
  });
});

describe('BJ347-②b 本体 439 显形窗（:65345-65346 flag3/4）', () => {
  it('显形期(ai0=-1)免疫 pierce=1；显形毕(ai0=0)可击', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const cult = spawn(h, 439, 100, 70);
    cult.bInit = true; cult.ai0 = -1; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
    lunaticCultistAI(cult, h.hooks, h.player);
    expect(cult.dontTakeDamage).toBe(true);
    expect(cult.hurt(1e9, 0, 0, h.hooks, 0, false, 1, true)).toBe(false);
    expect(cult.dead).toBe(false);
    cult.ai0 = 0; cult.ai1 = 0;                     // 显形毕
    lunaticCultistAI(cult, h.hooks, h.player);
    expect(cult.dontTakeDamage).toBe(false);        // 非显形 tick 显式清
    const hp0 = cult.hp;
    cult.hurt(50, 0, 0, h.hooks, 0, false, 1, true);
    expect(cult.hp).toBeLessThan(hp0);              // 非致死返回 false,以 hp 差判命中
  });
});

// ============================================================
// ③ 召唤门判别面（issue #2 锁定）：2×438 全灭 ≠ 出教主；四件套全灭才出
// ============================================================
function spawnTabletGroup(h: ReturnType<typeof makeHooks>) {
  const tablet = spawn(h, 437, 40, 90);
  for (let i = 0; i < 3; i++) {
    for (const e of h.enemies) if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
  }
  const archers = h.enemies.filter((e) => e.vanillaId === 379 && !e.dead);
  const devotees = h.enemies.filter((e) => e.vanillaId === 438 && !e.dead);
  expect(archers.length).toBe(2);
  expect(devotees.length).toBe(2);
  return { tablet, archers, devotees };
}

function tickTablet(h: ReturnType<typeof makeHooks>, n: number): void {
  for (let i = 0; i < n; i++) {
    for (const e of h.enemies) {
      if (!e.dead && e.vanillaId === 437) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

describe('BJ347 ③ 石碑召唤门（NPC.cs:37166-37204 flag96 = 四件套全灭）', () => {
  it('首杀两信徒 438 → 教主不出（两弓手 379 尚在 = 原版同相，用户实报①场景）', () => {
    const h = makeHooks(makeWorld(), { x: 40, y: 96 });
    const { tablet, devotees } = spawnTabletGroup(h);
    for (const d of devotees) d.dead = true;
    tickTablet(h, 5);
    expect(h.enemies.some((e) => e.vanillaId === 439)).toBe(false);   // 不出教主
    expect(tablet.ai0).not.toBe(-1);                                  // 石碑未进已召态
  });

  it('对偶面：只杀两弓手留信徒 → 同样不出', () => {
    const h = makeHooks(makeWorld(), { x: 40, y: 96 });
    const { archers } = spawnTabletGroup(h);
    for (const a of archers) a.dead = true;
    tickTablet(h, 5);
    expect(h.enemies.some((e) => e.vanillaId === 439)).toBe(false);
  });

  it('四件套全灭（首杀两信徒 + 补杀两弓手）→ 教主当拍落地（首把即出）', () => {
    const h = makeHooks(makeWorld(), { x: 40, y: 96 });
    const { tablet, archers, devotees } = spawnTabletGroup(h);
    for (const d of devotees) d.dead = true;
    tickTablet(h, 3);
    expect(h.enemies.some((e) => e.vanillaId === 439)).toBe(false);
    for (const a of archers) a.dead = true;
    tickTablet(h, 3);
    const cultist = h.enemies.find((e) => e.vanillaId === 439);
    expect(cultist).toBeTruthy();                     // 补杀弓手即出（无需重刷）
    expect(tablet.ai0).toBe(-1);                      // 已召标记
    expect(tablet.ai2).toBe(cultist!.id);             // ai[2] = 邪教徒 id
  });
});
