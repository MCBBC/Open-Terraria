// Boss 特化血条族（Terarria1456/Terraria.GameContent.UI.BigProgressBar/ 全目录）
// 聚合逻辑纯函数 + 分派表覆盖测试。标杆行号注释对应各 .cs 文件。
import { describe, it, expect, afterEach } from 'vitest';
import {
  BOSS_BARS_BY_NPC_NET_ID, bossBarFor, BOSS_HEAD_TEXTURES, bossHeadIndexOf,
  TWINS_BAR, EOW_BAR, BOC_BAR, GOLEM_BAR, MOONLORD_BAR, MARTIAN_SAUCER_BAR,
  PIRATE_SHIP_BAR, DEERCLOPS_BAR, NEVER_VALID_BAR, SOLAR_PILLAR_BAR,
  VORTEX_PILLAR_BAR, NEBULA_PILLAR_BAR, STARDUST_PILLAR_BAR, COMMON_BAR,
  BigProgressBarSystem, refLifeMaxOf,
  type BarNpc, type BarContext,
} from '../src/render/BossBars';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { bindScaleStatsWorld, CLASSIC_SCALE_WORLD, type ScaleStatsWorld } from '../src/stats/ScaleStats';

let nextId = 1;
function npc(p: Partial<BarNpc> & { type: number }): BarNpc {
  const x = p.x ?? 0, y = p.y ?? 0, w = p.w ?? 100, h = p.h ?? 100;
  return {
    id: nextId++, active: true, life: 100, lifeMax: 100,
    ai0: 0, ai1: 0, ai2: 0, ai3: 0, localAI3: 1,
    x, y, w, h, cx: x + w / 2, cy: y + h / 2, difficulty: 0,
    ...p,
  };
}

/** 参照假人默认桩：经典档基值（vanilla-npcs.json SetDefaults 提取值） */
const REF: Record<number, number> = {
  14: 150, 267: 100, 245: 15000, 246: 25000, 398: 50000, 396: 45000, 397: 25000,
  395: 10000, 394: 3500, 393: 5000, 492: 2000,
};
function makeCtx(p: Partial<BarContext> & { npcs?: BarNpc[] } = {}): BarContext {
  return {
    npcs: p.npcs ?? [],
    playerCx: 0, playerCy: 0,
    screen: { x: -400, y: -300, w: 800, h: 600 },
    expertMode: false, getGoodWorld: false, shieldMax: 100,
    shieldOf: () => 0,
    refLifeMax: (t) => REF[t] ?? 0,
    ...p,
  };
}

// ---------------------------------------------------------------------------
// 分派表（BigProgressBarSystem._bossBarsByNpcNetId :44-72，26 项原序全量）
// ---------------------------------------------------------------------------
describe('分派表 BOSS_BARS_BY_NPC_NET_ID（:44-72）', () => {
  const EXPECT: Record<number, string> = {
    125: 'twins', 126: 'twins',
    13: 'eow', 14: 'eow', 15: 'eow',
    266: 'boc',
    245: 'golem', 246: 'golem',
    249: 'never',
    517: 'pillar-solar', 422: 'pillar-vortex', 507: 'pillar-nebula', 493: 'pillar-stardust',
    398: 'moonlord', 396: 'moonlord', 397: 'moonlord',
    548: 'never', 549: 'never',
    491: 'pirate-ship', 492: 'pirate-ship',
    440: 'never',
    395: 'saucer', 393: 'saucer', 394: 'saucer',
    68: 'never',
    668: 'deerclops',
  };
  it('26 项逐键命中（vanilla 字典键集相等）', () => {
    expect(Object.keys(BOSS_BARS_BY_NPC_NET_ID).length).toBe(26);
    for (const [k, v] of Object.entries(EXPECT)) {
      expect(BOSS_BARS_BY_NPC_NET_ID[Number(k)]?.key, `id ${k}`).toBe(v);
    }
  });
  it('字典缺项回落 Common（:136-140 _bossBar 兜底）', () => {
    expect(bossBarFor(4).key).toBe('common');       // 克眼 → Common
    expect(bossBarFor(50).key).toBe('common');      // 史莱姆王 → Common
    expect(bossBarFor(-1).key).toBe('common');      // 未知 id
  });
  it('NeverValid 压制不回落：地牢守卫 68 恒不显（:249/548/549/440 同）', () => {
    const ctx = makeCtx();
    for (const id of [249, 548, 549, 440, 68]) {
      expect(BOSS_BARS_BY_NPC_NET_ID[id].validateAndCollect(npc({ type: id }), ctx)).toBeNull();
    }
    expect(NEVER_VALID_BAR.validateAndCollect(npc({ type: 68 }), makeCtx())).toBeNull();
  });
  it('BossHeadTextures 表（NPCID.cs:4861）40 对 + 各特化条头像锚', () => {
    expect(Object.keys(BOSS_HEAD_TEXTURES).length).toBe(40);
    expect(BOSS_HEAD_TEXTURES[13]).toBe(2);
    expect(BOSS_HEAD_TEXTURES[266]).toBe(23);
    expect(BOSS_HEAD_TEXTURES[246]).toBe(5);
    expect(BOSS_HEAD_TEXTURES[396]).toBe(8);
    expect(BOSS_HEAD_TEXTURES[395]).toBe(9);
    expect(BOSS_HEAD_TEXTURES[491]).toBe(26);
  });
  it('bossHeadIndexOf 动态覆写（NPC.cs:7536-7584 GetBossHeadTextureIndex）', () => {
    const h = (p: Partial<BarNpc> & { type: number }) => bossHeadIndexOf(npc(p));
    // 4 克眼：ai0≥2 二阶段 → 1
    expect(h({ type: 4, ai0: 0 })).toBe(0);
    expect(h({ type: 4, ai0: 1 })).toBe(0);
    expect(h({ type: 4, ai0: 2 })).toBe(1);
    // 125/126 双子：ai0≥3 二阶段 → 16/21
    expect(h({ type: 125, ai0: 2 })).toBe(15);
    expect(h({ type: 125, ai0: 3 })).toBe(16);
    expect(h({ type: 126, ai0: 2 })).toBe(20);
    expect(h({ type: 126, ai0: 3 })).toBe(21);
    // 262 世纪之花：life≤lifeMax/2 → 12（血量门非 ai 门）
    expect(h({ type: 262, life: 15001, lifeMax: 30000 })).toBe(11);
    expect(h({ type: 262, life: 15000, lifeMax: 30000 })).toBe(12);
    // 266 克脑：ai0<0（二阶段）→ -1（localAI2 投影未含恒 0；BoC 条走静态基表不受影响）
    expect(h({ type: 266, ai0: 0 })).toBe(23);
    expect(h({ type: 266, ai0: -1 })).toBe(-1);
    // 439 教徒：仪式态(ai0==5)全隐身窗（alpha==255 ⟺ ai1∈[30,90]，AI_084 :65586-65716
    // alpha 是 ai1 确定函数）→ -1 = Common 条消失；渐隐/渐显/施法段条仍在
    expect(h({ type: 439, ai0: 4, ai1: 0 })).toBe(24);
    expect(h({ type: 439, ai0: 5, ai1: 29 })).toBe(24);
    expect(h({ type: 439, ai0: 5, ai1: 30 })).toBe(-1);
    expect(h({ type: 439, ai0: 5, ai1: 90 })).toBe(-1);
    expect(h({ type: 439, ai0: 5, ai1: 91 })).toBe(24);
    expect(h({ type: 439, ai0: 5, ai1: 300 })).toBe(24);
    // 440 克隆体：仅仪式可显态（ai0==5 且未全隐）有头像；条链走 NeverValid 不受影响
    expect(h({ type: 440, ai0: 5, ai1: 200 })).toBe(24);
    expect(h({ type: 440, ai0: 5, ai1: 50 })).toBe(-1);
    expect(h({ type: 440, ai0: 0, ai1: 0 })).toBe(-1);
    // 基表缺项 → -1
    expect(h({ type: 17 })).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 动态头像 → 条显隐链（CommonBossBigProgressBar.cs:23-27 的 -1 即 validate 失败）
// ---------------------------------------------------------------------------
describe('动态头像驱动条显隐（bossHeadIndexOf 消费端）', () => {
  it('教徒仪式隐身窗：Common 条消失；可见段条在', () => {
    const c = npc({ type: 439, life: 4000, lifeMax: 8000, ai0: 5, ai1: 50 });
    expect(COMMON_BAR.validateAndCollect(c, makeCtx({ npcs: [c] }))).toBeNull();
    c.ai1 = 200;                                            // 施法段（可见）
    const r = COMMON_BAR.validateAndCollect(c, makeCtx({ npcs: [c] }))!;
    expect(r.headIndex).toBe(24);
  });
  it('双子二阶段：合血条头像随 ai0 切 16/21', () => {
    const ret = npc({ type: 125, ai0: 3, life: 100, lifeMax: 200 });
    const r = TWINS_BAR.validateAndCollect(ret, makeCtx({ npcs: [ret] }))!;
    expect(r.headIndex).toBe(16);
    const spaz = npc({ type: 126, ai0: 3, life: 100, lifeMax: 200 });
    expect(TWINS_BAR.validateAndCollect(spaz, makeCtx({ npcs: [spaz] }))!.headIndex).toBe(21);
  });
});

// ---------------------------------------------------------------------------
// Twins（TwinsBigProgressBar.cs:23-35：两体 live 和，首中 break）
// ---------------------------------------------------------------------------
describe('TwinsBigProgressBar（双子合血）', () => {
  it('跟踪 125：+首个 126 的 life/lifeMax；多头只计第一个', () => {
    const ret = npc({ type: 125, life: 12000, lifeMax: 20000 });
    const ctx = makeCtx({
      npcs: [
        ret,
        npc({ type: 126, life: 10000, lifeMax: 23000 }),
        npc({ type: 126, life: 500, lifeMax: 23000 }),   // 第二只不计（break）
      ],
    });
    const r = TWINS_BAR.validateAndCollect(ret, ctx)!;
    expect(r.life).toBe(22000);
    expect(r.lifeMax).toBe(43000);
    expect(r.headIndex).toBe(15);                        // 跟踪体自己的头像
  });
  it('另一只不在场：只显本体', () => {
    const ret = npc({ type: 126, life: 2300, lifeMax: 23000 });
    const r = TWINS_BAR.validateAndCollect(ret, makeCtx({ npcs: [ret] }))!;
    expect(r.life).toBe(2300);
    expect(r.lifeMax).toBe(23000);
    expect(r.headIndex).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// EoW（EaterOfWorldsProgressBar.cs:29-45：分子=全场段和；分母=ref14×(段数+2) 恒定）
// ---------------------------------------------------------------------------
describe('EaterOfWorldsProgressBar（恒定分母 + 换锚续显）', () => {
  it('普通档分母 = ref14×(65+2)；杀段只缩分子', () => {
    const head = npc({ type: 13, life: 150, lifeMax: 150 });
    const body = [...Array(65)].map((_, i) => npc({ type: 14, id: 1000 + i, life: 150, lifeMax: 150 }));
    const tail = npc({ type: 15, life: 150, lifeMax: 150 });
    const ctx = makeCtx({ npcs: [head, ...body, tail] });
    let r = EOW_BAR.validateAndCollect(head, ctx)!;
    expect(r.life).toBe(67 * 150);
    expect(r.lifeMax).toBe(67 * 150);                    // 满血满条
    body[0].active = false;                              // 杀一段
    r = EOW_BAR.validateAndCollect(head, ctx)!;
    expect(r.life).toBe(66 * 150);
    expect(r.lifeMax).toBe(67 * 150);                    // 分母不缩
  });
  it('专家档分母 = ref14(专家)×(70+2)', () => {
    const head = npc({ type: 13, difficulty: 2 });
    const ctx = makeCtx({
      npcs: [head, npc({ type: 14 }), npc({ type: 15 })],
      expertMode: true,
      refLifeMax: (t) => (t === 14 ? 300 : 0),
    });
    const r = EOW_BAR.validateAndCollect(head, ctx)!;
    expect(r.lifeMax).toBe(300 * 72);
  });
  it('锚死 → retrack 到任一活段；全灭 → null', () => {
    const head = npc({ type: 13 });
    const body = npc({ type: 14, life: 40 });
    const ctx = makeCtx({ npcs: [head, body] });
    head.active = false;
    const r = EOW_BAR.validateAndCollect(head, ctx)!;
    expect(r.retrack).toBe(body);
    expect(r.life).toBe(40);
    body.active = false;
    expect(EOW_BAR.validateAndCollect(head, ctx)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BoC（BrainOfCthuluBigProgressBar.cs :29-44：本体+爬行者；分母含 20/40 参照）
// ---------------------------------------------------------------------------
describe('BrainOfCthuluBigProgressBar', () => {
  it('普通档：本体 + Σ爬行者；分母 = 本体 lifeMax + ref267×20', () => {
    const brain = npc({ type: 266, life: 1000, lifeMax: 1250 });
    const ctx = makeCtx({
      npcs: [brain, ...[...Array(8)].map(() => npc({ type: 267, life: 100, lifeMax: 100 }))],
    });
    const r = BOC_BAR.validateAndCollect(brain, ctx)!;
    expect(r.life).toBe(1000 + 800);
    expect(r.lifeMax).toBe(1250 + 100 * 20);
    expect(r.headIndex).toBe(23);
  });
  it('FTW 档爬行者 40（GetBrainOfCthuluCreepersCount）', () => {
    const brain = npc({ type: 266, lifeMax: 1250 });
    const r = BOC_BAR.validateAndCollect(brain, makeCtx({ npcs: [brain], getGoodWorld: true }))!;
    expect(r.lifeMax).toBe(1250 + 100 * 40);
  });
});

// ---------------------------------------------------------------------------
// Golem（GolemHeadProgressBar.cs :32-46：{245,246} 在场和 ÷ 两参照和）
// ---------------------------------------------------------------------------
describe('GolemHeadProgressBar', () => {
  it('拳+头在场和；分母 = ref245+ref246；247/249 不计', () => {
    const fist = npc({ type: 245, life: 5000, lifeMax: 15000 });
    const head = npc({ type: 246, life: 10000, lifeMax: 25000 });
    const ctx = makeCtx({ npcs: [fist, head, npc({ type: 247 }), npc({ type: 249 })] });
    const r = GOLEM_BAR.validateAndCollect(fist, ctx)!;
    expect(r.life).toBe(15000);
    expect(r.lifeMax).toBe(15000 + 25000);
    expect(r.headIndex).toBe(5);
  });
  it('跟踪拳死 → retrack 头', () => {
    const fist = npc({ type: 245 });
    const head = npc({ type: 246, life: 100 });
    fist.active = false;
    const r = GOLEM_BAR.validateAndCollect(fist, makeCtx({ npcs: [fist, head] }))!;
    expect(r.retrack).toBe(head);
    expect(r.life).toBe(100);
  });
  it('自由态头(ai3=1,vanillaId 仍 246)不进条；仅存自由头 → 条消失(2026-08-21 用户报)', () => {
    // 原版:246 血尽 NewNPC(249) → 249=neverValid 条消失;本仓头原体变身 vanillaId
    // 恒 246,须按 ai3=1 排除——曾把自由头当 246 继续算 = 满血÷参照和恒半条不死
    const freeHead = npc({ type: 246, life: 25000, lifeMax: 25000, ai3: 1 });
    const r = GOLEM_BAR.validateAndCollect(freeHead, makeCtx({ npcs: [freeHead] }));
    expect(r).toBeNull();
    // 挂载态(ai3=0)正常进条
    const mounted = npc({ type: 246, life: 100, ai3: 0 });
    const r2 = GOLEM_BAR.validateAndCollect(mounted, makeCtx({ npcs: [mounted] }));
    expect(r2).not.toBeNull();
    expect(r2!.life).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// MoonLord（MoonLordProgressBar.cs :32-50 + IsInBadAI :54-69）
// ---------------------------------------------------------------------------
describe('MoonLordProgressBar（四件和 + BadAI 剔除）', () => {
  function mlCtx(pcs: Partial<BarNpc>[]): BarContext {
    const core = npc({ type: 398, life: 50000, lifeMax: 50000, ai0: 0, localAI3: 1, ...pcs[0] });
    const head = npc({ type: 396, life: 45000, lifeMax: 45000, ai0: 0, ...pcs[1] });
    const h1 = npc({ type: 397, life: 25000, lifeMax: 25000, ...pcs[2] });
    const h2 = npc({ type: 397, life: 25000, lifeMax: 25000, ...pcs[3] });
    return makeCtx({ npcs: [core, head, h1, h2] });
  }
  it('满编：四件和 = 145000；分母 = ref398+ref396+2×ref397（:34-40 连加两次）', () => {
    const ctx = mlCtx([{}, {}, {}, {}]);
    const r = MOONLORD_BAR.validateAndCollect(ctx.npcs[0], ctx)!;
    expect(r.life).toBe(145000);
    expect(r.lifeMax).toBe(50000 + 45000 + 25000 * 2);
    expect(r.headIndex).toBe(8);
  });
  it('BadAI 剔除：398 死亡/出生演出(ai0=2/-1)、398 首帧哨兵未立(lai3=0)、任一件 ai0=-2/-3', () => {
    // 头闭眼残肢(ai0=-2)→分子剔头；核心正常
    let ctx = mlCtx([{}, { ai0: -2 }, {}, {}]);
    let r = MOONLORD_BAR.validateAndCollect(ctx.npcs[0], ctx)!;
    expect(r.life).toBe(100000);
    // 手 -3 同剔
    ctx = mlCtx([{}, {}, { ai0: -3 }, {}]);
    r = MOONLORD_BAR.validateAndCollect(ctx.npcs[0], ctx)!;
    expect(r.life).toBe(120000);
    // 核心首帧（localAI3=0）→ 作为跟踪体不合格 → retrack 头
    ctx = mlCtx([{ localAI3: 0 }, {}, {}, {}]);
    r = MOONLORD_BAR.validateAndCollect(ctx.npcs[0], ctx)!;
    expect(r.retrack).toBe(ctx.npcs[1]);
    // 核心死亡演出 ai0=2 → 同 retrack；全灭(全 -2/-3) → null
    ctx = mlCtx([{ ai0: 2 }, { ai0: -2 }, { ai0: -2 }, { ai0: -3 }]);
    expect(MOONLORD_BAR.validateAndCollect(ctx.npcs[0], ctx)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MartianSaucer（MartianSaucerBigProgressBar.cs :38-57：专家才计核心）
// ---------------------------------------------------------------------------
describe('MartianSaucerBigProgressBar', () => {
  function saucerCtx(): BarContext {
    return makeCtx({
      npcs: [
        npc({ type: 395, life: 10000, lifeMax: 10000 }),
        npc({ type: 394, life: 3500, lifeMax: 3500 }),
        npc({ type: 394, life: 3500, lifeMax: 3500 }),
        npc({ type: 393, life: 5000, lifeMax: 5000 }),
        npc({ type: 393, life: 5000, lifeMax: 5000 }),
      ],
    });
  }
  it('普通档：核心不计入分子/分母（:52 (expertMode||type!=395) 门）', () => {
    const ctx = saucerCtx();
    const r = MARTIAN_SAUCER_BAR.validateAndCollect(ctx.npcs[0], ctx)!;
    expect(r.life).toBe(2 * 3500 + 2 * 5000);
    expect(r.lifeMax).toBe(2 * 3500 + 2 * 5000);
    expect(r.headIndex).toBe(9);
  });
  it('专家档：核心计入 → 分子+10000 / 分母+ref395', () => {
    const ctx = saucerCtx();
    ctx.expertMode = true;
    const r = MARTIAN_SAUCER_BAR.validateAndCollect(ctx.npcs[0], ctx)!;
    expect(r.life).toBe(10000 + 17000);
    expect(r.lifeMax).toBe(10000 + 17000);
  });
  it('从炮/炮塔锚进入 → retrack 核心 395', () => {
    const turret = npc({ type: 394 });
    const core = npc({ type: 395, life: 777 });
    const r = MARTIAN_SAUCER_BAR.validateAndCollect(turret, makeCtx({ npcs: [turret, core] }))!;
    expect(r.retrack).toBe(core);
  });
});

// ---------------------------------------------------------------------------
// PirateShip（PirateShipBigProgressBar.cs :37-51：船 ai[0..3] 引用 4 炮）
// ---------------------------------------------------------------------------
describe('PirateShipBigProgressBar（荷兰飞盗船聚合）', () => {
  it('4 炮（ai0..ai3）HP 和 ÷ 4×ref492；非 492 引用/死炮不计', () => {
    const c1 = npc({ type: 492, life: 2000, lifeMax: 2000 });
    const c2 = npc({ type: 492, life: 1500, lifeMax: 2000 });
    const c3 = npc({ type: 492, life: 1000, lifeMax: 2000 });
    const c4 = npc({ type: 492, life: 500, lifeMax: 2000 });
    const dead = npc({ type: 492, life: 0 });
    dead.active = false;
    const ship = npc({
      type: 491, life: 50, lifeMax: 50,
      ai0: c1.id, ai1: c2.id, ai2: c3.id, ai3: c4.id,
    });
    const ctx = makeCtx({ npcs: [ship, c1, c2, c3, c4, dead, npc({ type: 17, id: 999 })] });
    const r = PIRATE_SHIP_BAR.validateAndCollect(ship, ctx)!;
    expect(r.life).toBe(2000 + 1500 + 1000 + 500);
    expect(r.lifeMax).toBe(2000 * 4);                    // 经典 8000
    expect(r.headIndex).toBe(26);
    c1.active = false;                                   // 死炮剔除
    expect(PIRATE_SHIP_BAR.validateAndCollect(ship, ctx)!.life).toBe(3000);
  });
  it('锚 492 进入 → retrack 船 491；船不在场 → null', () => {
    const cannon = npc({ type: 492 });
    const ship = npc({ type: 491 });
    const r = PIRATE_SHIP_BAR.validateAndCollect(cannon, makeCtx({ npcs: [cannon, ship] }))!;
    expect(r.retrack).toBe(ship);
    expect(PIRATE_SHIP_BAR.validateAndCollect(cannon, makeCtx({ npcs: [cannon] }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 四塔（LunarPillarBigProgessBar.cs :22-41：战区门 + ai2 门 + 盾量）
// ---------------------------------------------------------------------------
describe('LunarPillar 四子（盾量条）', () => {
  it('战区内：life 条 + shield 叠层（ShieldStrengthTower*÷Max）', () => {
    const tower = npc({ type: 517, life: 20000, lifeMax: 20000, x: 3900, w: 0, h: 0, cx: 3900, cy: 0 });
    const ctx = makeCtx({ npcs: [tower], shieldOf: () => 37, shieldMax: 100 });
    const r = SOLAR_PILLAR_BAR.validateAndCollect(tower, ctx)!;
    expect(r.life).toBe(20000);
    expect(r.shield).toEqual({ cur: 37, max: 100 });
    expect(r.headIndex).toBe(27);
  });
  it('玩家 4000px 外（SceneMetrics.WithinRangeOfNPC）→ 不显', () => {
    const tower = npc({ type: 422, cx: 4001, cy: 0, x: 4001, w: 0, h: 0 });
    expect(VORTEX_PILLAR_BAR.validateAndCollect(tower, makeCtx({ npcs: [tower] }))).toBeNull();
  });
  it('ai2==1（死亡演出）→ 不显', () => {
    const tower = npc({ type: 507, ai2: 1 });
    expect(NEBULA_PILLAR_BAR.validateAndCollect(tower, makeCtx({ npcs: [tower] }))).toBeNull();
  });
  it('四塔分派键各自独立（517/422/507/493）', () => {
    expect(bossBarFor(517)).toBe(SOLAR_PILLAR_BAR);
    expect(bossBarFor(422)).toBe(VORTEX_PILLAR_BAR);
    expect(bossBarFor(507)).toBe(NEBULA_PILLAR_BAR);
    expect(bossBarFor(493)).toBe(STARDUST_PILLAR_BAR);
  });
});

// ---------------------------------------------------------------------------
// Deerclops（DeerclopsBigProgressBar.cs :28-31 + NPC.IsDeerclopsHostile :44314-44337）
// ---------------------------------------------------------------------------
describe('DeerclopsBigProgressBar（敌意门）', () => {
  it('常态（ai0∉{6,7,8}）恒有效——远屏也显（validate 无距离门，跟踪扫描侧控制）', () => {
    const d = npc({ type: 668, life: 3000, lifeMax: 7000, x: 99999, cx: 100000 });
    const r = DEERCLOPS_BAR.validateAndCollect(d, makeCtx({ npcs: [d] }))!;
    expect(r.life).toBe(3000);
    expect(r.lifeMax).toBe(7000);
    expect(r.headIndex).toBe(39);
  });
  it('撤退态（ai0∈{6,7,8}）须命中盒交屏幕+960；出窗即断', () => {
    // 屏幕矩形 (-400..400,-300..300) 外扩 960 → (-1360..1360)：x=1000 在内、8000 在外
    const near = npc({ type: 668, ai0: 6, x: 1000, w: 100, cx: 1050, cy: 50 });
    expect(DEERCLOPS_BAR.validateAndCollect(near, makeCtx({ npcs: [near] }))).not.toBeNull();
    const far = npc({ type: 668, ai0: 7, x: 8000, cx: 8050, cy: 50 });
    expect(DEERCLOPS_BAR.validateAndCollect(far, makeCtx({ npcs: [far] }))).toBeNull();
    const farFight = npc({ type: 668, ai0: 0, x: 8000, cx: 8050, cy: 50 });
    expect(DEERCLOPS_BAR.validateAndCollect(farFight, makeCtx({ npcs: [farFight] }))).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Common（CommonBossBigProgressBar.cs :12-30：本体条 + 头像门）
// ---------------------------------------------------------------------------
describe('CommonBossBigProgressBar（兜底）', () => {
  it('有头像的 boss 显本体条；无头像 NPC（僵尸 17）不显', () => {
    const eoc = npc({ type: 4, life: 1400, lifeMax: 2800 });
    const r = COMMON_BAR.validateAndCollect(eoc, makeCtx({ npcs: [eoc] }))!;
    expect(r.life).toBe(1400);
    expect(r.lifeMax).toBe(2800);
    expect(r.headIndex).toBe(0);
    expect(COMMON_BAR.validateAndCollect(npc({ type: 17 }), makeCtx())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// System（BigProgressBarSystem.Update :82-92 / TryFindingNPCToTrack :102-119）
// ---------------------------------------------------------------------------
describe('BigProgressBarSystem（跟踪状态机）', () => {
  it('扫描取离玩家最近的有效 NPC；无效者不挡后来人（:107-118）', () => {
    const sys = new BigProgressBarSystem();
    const eoc = npc({ type: 4, life: 1, lifeMax: 2800, x: 600, cx: 650, cy: 0 });   // 远但有效
    const dg = npc({ type: 68, x: 10, cx: 60, cy: 0 });                             // 近但 NeverValid
    const r = sys.tick(makeCtx({ npcs: [eoc, dg] }))!;
    expect(r.headIndex).toBe(0);                                                      // 克眼条
    // 双有效时最近者胜
    const sys2 = new BigProgressBarSystem();
    const ks = npc({ type: 50, x: -100, cx: -50, cy: 0 });
    sys2.tick(makeCtx({ npcs: [eoc, ks] }));
    // 下帧校验失效即断条（本帧 null、下帧重扫）
    eoc.active = false;
    expect(sys.tick(makeCtx({ npcs: [eoc, dg] }))).toBeNull();
    expect(sys.tick(makeCtx({ npcs: [eoc, dg] }))).toBeNull();
  });
  it('屏幕矩形外扩 5000px 之外不入选（:104-110）', () => {
    const sys = new BigProgressBarSystem();
    const far = npc({ type: 4, x: 20000, w: 10, cx: 20005, cy: 0 });   // 屏外 ~19.6k px
    expect(sys.tick(makeCtx({ npcs: [far] }))).toBeNull();
    const near = npc({ type: 4, x: 4000, w: 10, cx: 4005, cy: 0 });    // 屏+5000 内沿
    expect(sys.tick(makeCtx({ npcs: [near] }))).not.toBeNull();
  });
  it('EoW 锚死后系统换段续显（retrack 持久化）', () => {
    const sys = new BigProgressBarSystem();
    const head = npc({ type: 13, life: 150, lifeMax: 150, cx: 0, cy: 0 });
    const body = npc({ type: 14, life: 60, lifeMax: 150, x: 200, cx: 250, cy: 0 });
    const ctx = () => makeCtx({ npcs: [head, body] });
    expect(sys.tick(ctx())!.life).toBe(210);
    head.active = false;
    expect(sys.tick(ctx())!.life).toBe(60);           // 换锚 body 继续
    body.active = false;
    expect(sys.tick(ctx())).toBeNull();               // 全灭断条
  });
  it('跟踪保持粘性：已跟踪不重扫（远端后入场者不夺位）', () => {
    const sys = new BigProgressBarSystem();
    const eoc = npc({ type: 4, cx: 0, cy: 0 });
    expect(sys.tick(makeCtx({ npcs: [eoc] }))!.headIndex).toBe(0);
    const ks = npc({ type: 50, cx: 5, cy: 0 });       // 更近的史莱姆王后入场
    expect(sys.tick(makeCtx({ npcs: [eoc, ks] }))!.headIndex).toBe(0);  // 仍克眼
  });
  it('跟踪体被移出实体表（死亡清理）：EoW 幽灵快照续走换锚链；Common 断条后下帧重扫', () => {
    const sys = new BigProgressBarSystem();
    const head = npc({ type: 13, life: 150, lifeMax: 150 });
    const body = npc({ type: 14, life: 60, lifeMax: 150, x: 200, cx: 250, cy: 0 });
    sys.tick(makeCtx({ npcs: [head, body] }));
    const r = sys.tick(makeCtx({ npcs: [body] }))!;      // head 整段移出表
    expect(r.life).toBe(60);
    const sys2 = new BigProgressBarSystem();
    const eoc = npc({ type: 4, cx: 0, cy: 0 });
    sys2.tick(makeCtx({ npcs: [eoc] }));
    expect(sys2.tick(makeCtx({ npcs: [] }))).toBeNull(); // 移出即断（不冻结旧血）
    const ks = npc({ type: 50, cx: 0, cy: 0 });
    expect(sys2.tick(makeCtx({ npcs: [ks] }))!.headIndex).toBe(7);   // 重扫接管
  });
});

// ---------------------------------------------------------------------------
// 参照假人（SetDefaults(type, GetMatchingSpawnParams) 同管线对账）
// ---------------------------------------------------------------------------
describe('refLifeMaxOf（参照假人 = 活体生成管线）', () => {
  afterEach(() => bindScaleStatsWorld(null));
  it('经典档与 Enemy.fromVanilla 同型 lifeMax 全等（13/14/15/267/396/397/398/492）', () => {
    for (const id of [13, 14, 15, 267, 396, 397, 398, 492, 245, 246, 393, 394, 395]) {
      const e = Enemy.fromVanilla(id, 100 * TILE, 50 * TILE)!;
      expect(refLifeMaxOf(id, null), `type ${id}`).toBe(e.maxHp);
    }
  });
  it('专家档 override 与绑定世界同值（difficultyOverride 链）', () => {
    const expert: ScaleStatsWorld = { ...CLASSIC_SCALE_WORLD, difficulty: 2 };
    bindScaleStatsWorld(expert);
    const live = Enemy.fromVanilla(14, 100 * TILE, 50 * TILE)!;
    expect(refLifeMaxOf(14, null)).toBe(live.maxHp);
    bindScaleStatsWorld(null);
    expect(refLifeMaxOf(14, 2)).toBe(live.maxHp);    // 未绑定但 override=2 同值
    expect(refLifeMaxOf(14, 2)).not.toBe(150);       // 确已缩放
  });
  it('EoW 经典档真管线分母 = (65+2)×150 = 10050', () => {
    expect(refLifeMaxOf(14, null) * 67).toBe(10050);
  });
});
