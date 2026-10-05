/**
 * BJ518 minion 视觉尾批六件（BJ517 批③登记尾;索敌战役视觉尾巴收官批）
 *
 * ① 返程相 rotation 写梯（266 :62225 vx×0.1 + 191-194 通用 atan2 尾支 :62462-62468）
 * ② 191-194 地面态帧机（:64660-64726 攻击 1-3/静立 0/步行 5-10 按|vx|/空中 4）
 * ③ flag8 rest 块 alpha=255 重淡入（:61649-61652 fullRotation≠0∨mount-hidden）
 * ④ DoPalAppearEffect Hermite 出场尘 306（:39509-39543——alpha 减法随调用位走）
 * ⑤ 966 ai[1] 写梯销案锁（:38032-38035 写-only 无读点=纯 netcode;不建模）
 * ⑥ 1025 缩体支（:70198-70205——BJ357 变身坐骑使 h<42 可达,旧「不可达」废止）
 * N1 1118 无淡入（SetDefaults :10452-10464 无 alpha=255;旧注系 1120 块误读）
 * N2 AI_067 肩扛 alpha=255 重淡入（:50798-50806）
 * N3 AI_067 归位拍 flag8 alpha=255（:51191-51199 flag18 支）
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';

const priv = (o: object): Record<string, any> => o as unknown as Record<string, any>;

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; maxHp?: number;
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks) => boolean;
  hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number): MockEnemy => {
  const w = 16, h = 24;
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false,
    get cx() { return this.x + this.w / 2; },
    set cx(v: number) { this.x = v - this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    set cy(v: number) { this.y = v - this.h / 2; },
    hp: 100000,
    maxHp: 100000,
    hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

interface DustCall {
  x: number; y: number; type: number; sx: number; sy: number;
  alpha: number; scale: number | undefined; color: unknown; noGravity: boolean;
}

function makeHooks(enemies: MockEnemy[] = [], extraTiles: Array<[number, number]> = []) {
  const w = new World(200, 120, 7, 'bj518');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  for (const [tx, ty] of extraTiles) w.store.setTile(tx, ty, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 79 * 16, new Inventory());
  const added: unknown[] = [];
  const dusts: DustCall[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
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
    spawnDust: ((x: number, y: number, _dw: number, _dh: number, type: number,
      sx: number, sy: number, alpha: number, color: unknown, scale: number,
      noGravity: boolean) => {
      dusts.push({ x, y, type, sx, sy, alpha, scale, color, noGravity: !!noGravity });
      return { x, y, vx: sx, vy: sy, scale: scale ?? 1, alpha, fadeIn: 0, noGravity: !!noGravity } as never;
    }) as never,
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: added,
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, store: w.store, player, added, dusts, enemyList: enemies };
}

const minion = (player: Player, projId: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, projId, 10, 2, false, 0, false, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  return m;
};

/** 测试侧 XNA Vector2.Hermite 参照实现（Vector2.cs Hermite 同式） */
const herm = (v1: number, t1: number, v2: number, t2: number, s: number): number => {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v1 + (s3 - 2 * s2 + s) * t1
    + (-2 * s3 + 3 * s2) * v2 + (s3 - s2) * t2;
};

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// ① 返程相 rotation 写梯（:62225 / :62462-62468）
// ============================================================
describe('① 返程相 rotation（266 rot=vx×0.1 :62225 + 191-194 通用 atan2 尾支 :62462-62468）', () => {
  /** 返程相夹具：随从贴飞行锚（num110<60 → 漂移支保速）,玩家 vy≠0 压落地门 */
  const returnFixture = (h: ReturnType<typeof makeHooks>, projId: number,
    vx: number, vy: number): MinionProj => {
    const m = minion(h.player, projId, h.player.cx - 40, h.player.cy);
    priv(h.player).vy = 2;                 // 玩家腾空 → 落地门（p.vy===0）恒假
    priv(m).a026A0 = 1;                    // 归位相
    m.vx = vx; m.vy = vy;
    return m;
  };

  it('266：vx=2 → rot=0.2（:62225 velocity.X×0.1,变异不写 → 红）', () => {
    const h = makeHooks([]);
    const m = returnFixture(h, 266, 2, 1);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026A0).toBe(1);                       // 仍在返程相
    expect(m.rot, 'rot=vx×0.1=0.2').toBeCloseTo(0.2, 9);
  });

  it('191 右行 vx=2 → sd=−1 → rot=atan2(vy,vx)（:62462-62464,变异走 +3.14 支 → 红）', () => {
    const h = makeHooks([]);
    const m = returnFixture(h, 191, 2, 1);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026SpriteDir).toBe(-1);               // 速度翻转先行（:61628-61638）
    expect(m.rot, 'sd=−1 → 裸 atan2').toBeCloseTo(Math.atan2(1, 2), 9);
  });

  it('191 左行 vx=−2 → sd=+1 → rot=atan2+3.14f（:62466-62468,f32 字面 3.14≠π,变异写 π → 红）', () => {
    const h = makeHooks([]);
    const m = returnFixture(h, 191, -2, 1);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026SpriteDir).toBe(1);
    expect(m.rot, 'atan2(1,−2)+f32(3.14)').toBeCloseTo(
      Math.atan2(1, -2) + Math.fround(3.14), 9);
    expect(m.rot).not.toBeCloseTo(Math.atan2(1, -2) + Math.PI, 6);   // 3.14f 与 π 差 ≈1.6e-3
  });

  it('1094 flag8 头卧支 rot=0（:61645——本仓 fox rot 恒 0 同相,变异乱写 → 红）', () => {
    const h = makeHooks([]);
    const m = returnFixture(h, 1094, 2, 1);
    m.fixedUpdate(1, h.hooks);
    expect(m.rot).toBe(0);
  });
});

// ============================================================
// ② 191-194 地面态帧机（:64660-64726）
// ============================================================
describe('② 191-194 地面态帧机（攻击 1-3/静立 0/步行 5-10 按|vx|/空中 4 :64660-64726）', () => {
  /** 高台夹具（|dyp|≤300 内 → 地面态,同 BJ517③）：台面 y=92,俾格米盒底贴台面。
   *  ★BJ519①：盒实 16×16（旧注 h=18 系误记,−9 锚使盒底悬 1px@1471——旧无重力形
   *  不可见;重力落域后 1px 悬空=1 拍落定瞬态,原版同相）→ 锚改 −8 盒底恰 1472。
   *  ★BJ521①：16×16 系旧缺省缺注册——原版 SetDefaults :2794-2795 亲读 h=18（终值,
   *  scale 截断后）→ 锚回归 −9,盒底复恰 1472（−8 锚在 h=18 下盒底 1473=嵌台 1px,
   *  帧机读 airborne=帧 4 假红）。 */
  const PLATFORM: Array<[number, number]> = [];
  for (let x = 50; x <= 80; x++) PLATFORM.push([x, 92]);
  const GROUND = 92 * 16 - 9;                                  // 盒底 y=1472（h=18 真盒 ★BJ521①）

  it('步行：敌 600px 右（>450 转火阈,<800 窗）→ flag3 步行,fc 累进 t3=5、t5=6（变异不写 → 红）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 191, 66 * 16, GROUND);
    h.enemyList.push(mkEnemy(1, m.cx + 600, m.cy));           // |Δx|=600∈(450,800) → 步行不转火
    for (let t = 0; t < 2; t++) m.fixedUpdate(1, h.hooks);    // vx 0.4/0.8 ≤0.8 → 慢速档
    expect(priv(m).a026F6Frame, '|vx|≤0.8 → 归 0').toBe(0);
    m.fixedUpdate(1, h.hooks);                                // t3: vx=1.2 → fc=2 → 钳 5
    expect(priv(m).a026F6Frame, '首步行拍钳 frame=5（:64700-64702）').toBe(5);
    m.fixedUpdate(1, h.hooks);                                // t4: fc=4
    m.fixedUpdate(1, h.hooks);                                // t5: fc+=2+1=7>6 → 6
    expect(priv(m).a026F6Frame, 'fc>6 翻页 → 6').toBe(6);
  });

  it('静立：无目标 vx=0 → flag27 静立帧 0（:64685-64689,变异不归 0 → 红）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 191, 66 * 16, GROUND);
    priv(m).a026F6Frame = 6;                                  // 预置非 0（步行残留）
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026F6Frame, 'flag27 → frame=0').toBe(0);
    expect(priv(m).a026F6Fc).toBe(0);
  });

  it('攻击：ai[1]>0 → Lai1 0→1 钉 1,fc>4 翻页 1→2→3→0 冻结（:64662-64682,变异不冻结 → 红）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 191, 66 * 16, GROUND);
    priv(m).shootCd = 30;                                     // ai[1] 槽（BJ516④ 同账）
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026F6Frame, '入攻拍钉 frame=1（Lai1 门）').toBe(1);
    expect(priv(m).a026Lai1).toBe(1);
    for (let t = 0; t < 4; t++) m.fixedUpdate(1, h.hooks);    // t5: fc=5>4 → 2
    expect(priv(m).a026F6Frame).toBe(2);
    for (let t = 0; t < 5; t++) m.fixedUpdate(1, h.hooks);    // t10: fc=5>4 → 3
    expect(priv(m).a026F6Frame).toBe(3);
    for (let t = 0; t < 5; t++) m.fixedUpdate(1, h.hooks);    // t15: fc=5>4 → 4≥4 → 0
    expect(priv(m).a026F6Frame, '≥4 归 0').toBe(0);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026F6Frame, 'frame=0 冻结（frame!=0 门不再推进）').toBe(0);
  });

  it('空中：vy≠0 → 帧 4（上下两支同写 :64711-64720,变异漏 → 红）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 191, 66 * 16, GROUND);
    priv(m).vy = -3;
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026F6Frame, '空中帧 4').toBe(4);
    expect(priv(m).a026F6Fc, 'fc 清零').toBe(0);
  });
});

// ============================================================
// ③ flag8 rest 块 alpha=255 重淡入（:61649-61652）
// ============================================================
describe('③ flag8 rest 块 alpha=255 重淡入（:61649-61652 fullRotation≠0∨mount-hidden）', () => {
  it('玩家 fullRotation≠0（UFO 7 Hover 0.2）+ 返程相 → alphaFade=255（变异不写 → 红）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1094, h.player.cx - 40, h.player.cy);
    priv(h.player).vy = 2;
    priv(m).a026A0 = 1;
    priv(m).alphaFade = 0;
    priv(h.player).mount = { active: true, type: 7, fullRotation: 0.2, heightBoost: 0, isCart: false, playerOffset: 0 };
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).alphaFade, 'rest 块重置 255 → 下拍 DoPal 重淡入').toBe(255);
  });

  it('mount-hidden（52 变身狼 PlayerIsHidden）→ alphaFade=255（同门 ∨ 支）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1113, h.player.cx - 40, h.player.cy);
    priv(h.player).vy = 2;
    priv(m).a026A0 = 1;
    priv(m).alphaFade = 0;
    priv(h.player).mount = { active: true, type: 52, fullRotation: 0, heightBoost: 0, isCart: false, playerOffset: 0 };
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).alphaFade).toBe(255);
  });

  it('玩家直立（fullRotation=0 ∧ 非 hidden）→ 不重置（变异恒写 → 红）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1094, h.player.cx - 40, h.player.cy);
    priv(h.player).vy = 2;
    priv(m).a026A0 = 1;
    priv(m).alphaFade = 0;
    priv(h.player).mount = { active: true, type: 7, fullRotation: 0, heightBoost: 0, isCart: false, playerOffset: 0 };
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).alphaFade).toBe(0);
  });
});

// ============================================================
// ④ DoPalAppearEffect Hermite 出场尘 306（:39509-39543）
// ============================================================
describe('④ DoPalAppearEffect（:39509-39543——Hermite 尘 306,10 粒/拍,减法随调用位）', () => {
  it('首拍：255→240,num2=0<1 → 恰 10 粒 306（f32 0.1f×10>1 → 非 11,变异 f64 循环 → 红）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1094, h.player.cx + 30, h.player.cy - 40);
    m.fixedUpdate(1, h.hooks);
    const d306 = h.dusts.filter((d) => d.type === 306);
    expect(d306, '10 粒（f32 累计相,变异 0.1×11 → 红）').toHaveLength(10);
    expect(priv(m).alphaFade, '255−15').toBe(240);
    for (const d of d306) {
      expect(d.color, 'Color(100,227,255,127)').toEqual({ r: 100, g: 227, b: 255, a: 127 });
      expect(d.noGravity, 'noGravity=true').toBe(true);
      const num3 = (1 - 240 / 255) * 2;
      expect(d.scale, 'scale=1+num3').toBeCloseTo(1 + num3, 9);
    }
  });

  it('端点/速：尘 0 位=num2 端 Hermite=value（MountedCenter+dir×10）,速=(v2−v1)×0.1 全体同速', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1094, h.player.cx + 30, h.player.cy - 40);
    m.fixedUpdate(1, h.hooks);
    const d306 = h.dusts.filter((d) => d.type === 306);
    const num2 = 0, num3 = (1 - 240 / 255) * 2;
    const vX = h.player.cx + 10, vY = h.player.cy;             // value 端（facing=1）
    const ax = herm(vX, 0, m.cx, 0, num2), ay = herm(vY, -100, m.cy, -100, num2);
    const bx = herm(vX, 0, m.cx, 0, num3), by = herm(vY, -100, m.cy, -100, num3);
    expect(d306[0].x, 'f=0 → value 端 x').toBeCloseTo(ax, 6);
    expect(d306[0].y, 'f=0 → value 端 y').toBeCloseTo(ay, 6);
    for (const d of d306) {
      expect(d.sx, '速=(vector2−vector)×0.1').toBeCloseTo((bx - ax) * 0.1, 6);
      expect(d.sy).toBeCloseTo((by - ay) * 0.1, 6);
    }
  });

  it('withParticles 门：返程相（ai[0]=1）静默淡入 255→240 零尘（变异返程出尘 → 红）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1094, h.player.cx + 30, h.player.cy - 40);
    priv(m).a026A0 = 1;
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).alphaFade, '减法照走（DoPal 每拍同调 :59197）').toBe(240);
    expect(h.dusts.filter((d) => d.type === 306), 'ai[0]==1 → withParticles=false').toHaveLength(0);
  });

  it('num2≥1 门：alphaFade=120（进度 1.06）→ 淡入照减零尘（变异摘门 → 红）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1094, h.player.cx + 30, h.player.cy - 40);
    priv(m).alphaFade = 120;
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).alphaFade).toBe(105);
    expect(h.dusts.filter((d) => d.type === 306)).toHaveLength(0);
  });

  it('尾拍 num3≥0.9：alphaFade=150 → 速=NextVector2Circular(3,3)（mock 0.25 → vy=0.75,变异保 Hermite 速 → 红）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1094, h.player.cx + 30, h.player.cy - 40);
    priv(m).alphaFade = 150;                                   // after=135 → num3=0.941≥0.9
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    m.fixedUpdate(1, h.hooks);
    const d306 = h.dusts.filter((d) => d.type === 306);
    expect(d306).toHaveLength(10);
    const a = 0.25 * Math.PI * 2, r = 0.25;
    expect(d306[0].sx, 'cos(a)×r×3').toBeCloseTo(Math.cos(a) * r * 3, 9);
    expect(d306[0].sy, 'sin(a)×r×3').toBeCloseTo(Math.sin(a) * r * 3, 9);
  });

  it('钻地龟门：ai0=1 挖掘态无调用 → alpha 冻结 255（变异全局斜坡 → 红）;ai0=4 离场拍照减', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1123, h.player.cx + 30, 100 * 16 - 17);
    priv(m).digA0 = 1;                                         // 挖掘态（无 DoPal 调用位）
    priv(m).alphaFade = 255;
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).alphaFade, '挖掘态冻结（原版减法只发生在被调拍）').toBe(255);
    const m2 = minion(h.player, 1123, h.player.cx + 30, 100 * 16 - 17);
    priv(m2).digA0 = 4;                                        // 离场 flag5 → withParticles 恒 true
    m2.fixedUpdate(1, h.hooks);
    expect(priv(m2).alphaFade, '离场拍 −15（持物品灭门在 DoPal 后=原版序）').toBe(240);
  });
});

// ============================================================
// ⑤ 966 ai[1] 写梯销案锁（:38032-38035 写-only）
// ============================================================
describe('⑤ 966 ai[1] 目标槽销案锁（写梯=纯 netcode,单机零观测差 → 不建模）', () => {
  it('仓内无 ai[1] 镜像字段（自造无人消费字段=反模式;变异加镜像 → 红）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 966, 40 * 16, 100 * 16 - 30);
    expect(priv(m).s53Ai1, 's53Ai1 不存在=销案态').toBeUndefined();
    expect(Object.keys(priv(m)).filter((k) => k.startsWith('s53') && k !== 's53Frame'
        && k !== 's53Fc' && k !== 's53L1' && k !== 's53PrevSd'),
      's53 域无 ai[1] 记忆槽').toHaveLength(0);
  });

  it('源级锁：BJ518 销案定谳注在位（读点普查 :37942-38110 段仅写三处）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toContain('★BJ518⑤（2026-10-05）966 ai[1] 写梯销案定谳');
    expect(src).toContain('AI_053_HandleSentryNPCTargeting（:40920-40966）逐拍新搜【不读】ai[1]');
  });
});

// ============================================================
// ⑥ 1025 缩体支（:70198-70205——BJ357 变身坐骑使 h<42 可达）
// ============================================================
describe('⑥ 1025 携带缩体支（rot=π/scale=0.5/vec2Y+5/num2 相位项 :70198-70205）', () => {
  const carried = (h: ReturnType<typeof makeHooks>, mountH: number,
    mount: Record<string, unknown>) => {
    const m = minion(h.player, 1025, 40 * 16, 90 * 16);
    priv(h.player)._equipStatsCache = { ...h.player.equipStats, accSentryBackpack: true } as never;   // equipStats=frozen 计算缓存,补丁挂 memo 槽
    priv(h.player).h = mountH;
    priv(h.player).mount = mount;
    return m;
  };

  it('变身坐骑（55 Rat h=14）→ rot=π、scale=0.5、vec2Y+5（变异不缩 → 红）★BJ519②：flag 开旗后本例路由 case 55 Rat 几何（:70266-70286）——位置钉随开旗改锚（rot/scale 钉不变仍锁缩体支）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1025, 40 * 16, 90 * 16);
    priv(h.player)._equipStatsCache = { ...h.player.equipStats, accSentryBackpack: true } as never;
    priv(h.player).h = 14;
    priv(h.player).mount.active = true;                     // 真 MountInstance（playerOffset 走帧表 getter）
    priv(h.player).mount.type = 55;
    priv(h.player).mount.frame = 0;
    priv(m).heavySlingReposition(h.player);
    expect(priv(m).rot, 'rotation=MathF.PI').toBe(Math.PI);
    expect(priv(m).drawScale, 'scale=0.5（:70200）').toBe(0.5);
    // case 55：Bottom=Top → +num7(10)+num9(2,frame0) → Bottom+=vec2(−25+17,4+5)
    expect(m.x, 'x=cx−8(vec2X)−w/2（BJ519② 开旗形）').toBe(Math.floor(h.player.cx - 8 - m.w / 2));
    expect(m.y, 'y=Top−h+12+9（BJ519② 开旗形）').toBe(Math.floor(79 * 16 - m.h + 12 + 9));
  });

  it('直立携带（h=42）→ scale=1、rot=±π/2 + fullRotation（:70205 变异漏 += → 红）', () => {
    const h = makeHooks([]);
    const m = carried(h, 42, { active: true, type: 7, fullRotation: 0.4, heightBoost: 0, isCart: false, playerOffset: 0 });
    priv(m).heavySlingReposition(h.player);
    expect(priv(m).drawScale, 'else scale=1').toBe(1);
    expect(priv(m).rot, 'π/2 + fullRotation 0.4').toBeCloseTo(Math.PI / 2 + 0.4, 9);
  });

  it('num2 相位项：fullRotation=0.4 → vec2 偏移 (dir×−4,grav×8)×|fr|/(π/2)（:70202-70203,变异漏 → 红）', () => {
    const h = makeHooks([]);
    const m = carried(h, 14, { active: true, type: 7, fullRotation: 0.4, heightBoost: 0, isCart: false, playerOffset: 0 });
    priv(m).heavySlingReposition(h.player);
    const num2 = 0.4 / (Math.PI / 2);
    const mc = h.player.mountedCenter;
    // 几何参照：期望位 = RRP(MountedCenter+vec2) − vector（:70264 共享尾;RRP 消费
    // fullRotation=repo 既有锚链,本测独立计算 vec2 合成=BJ518 落刀面）
    const vec2X = -25 - 4 * num2;
    const vec2Y = 4 + 5 + 8 * num2;
    const rp = h.player.rotatedRelativePoint(mc.x + vec2X, mc.y + vec2Y);
    expect(m.x, 'x 含 −4×num2 项').toBe(Math.floor(rp.x - m.w / 2));
    expect(m.y, 'y 含 4+5+8×num2 项').toBe(Math.floor(rp.y - m.h / 2));
    expect(priv(m).drawScale).toBe(0.5);
    expect(priv(m).rot, 'π + fullRotation（:70205）').toBeCloseTo(Math.PI + 0.4, 9);
  });
});

// ============================================================
// N1-N3 同域定谳补刀（1118 无淡入 / 肩扛 alpha / 归位拍 alpha）
// ============================================================
describe('N 同域补刀（1118 无淡入 N1 / AI_067 肩扛 N2 / 归位拍 N3）', () => {
  it('N1：1118 构造器 alphaFade=0（SetDefaults :10452-10464 无 alpha=255;旧注系 1120 误读）', () => {
    const h = makeHooks([]);
    expect(new MinionProj(0, 0, 1118, 10, 2, false, 0, false, () => h.player).alphaFade).toBe(0);
    expect(new MinionProj(0, 0, 1093, 10, 2, false, 0, false, () => h.player).alphaFade).toBe(255);
    expect(new MinionProj(0, 0, 1123, 10, 2, false, 0, false, () => h.player).alphaFade).toBe(255);
  });

  it('N2：1093 肩扛（palA0=1）+ 玩家旋转 → alphaFade=255（:50798-50806,变异不写 → 红）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1093, h.player.cx - 8, h.player.cy - 24);
    priv(m).palA0 = 1;
    priv(m).alphaFade = 0;
    priv(h.player).vy = 1;                                    // 主腾空 → 肩扛退出门（p.vy===0）恒假
    priv(h.player).mount = { active: true, type: 7, fullRotation: 0.2, heightBoost: 0, isCart: false, playerOffset: 0 };
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).alphaFade, '肩扛重淡入').toBe(255);
    expect(priv(m).palA0).toBe(1);
  });

  it('N3：1093 归位门（距主>500）→ palA0=1 + alphaFade=255（:51191-51199,变异漏 → 红）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1093, h.player.cx + 600, h.player.cy);
    priv(m).alphaFade = 0;
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).palA0, 'flag18 → ai[0]=1').toBe(1);
    expect(priv(m).alphaFade, 'flag8 → alpha=255').toBe(255);
  });
});

// ============================================================
// ⑦ 源级锁 + sha256 对拍锚（BJ518 落刀态）
// ============================================================
describe('⑦ 源级锁 + sha256 对拍锚（BJ518 落刀态）', () => {
  it('源级锁：六件落刀标记在位', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toContain('this.rot = this.vx * 0.1');                              // ① 266
    expect(src).toContain('Math.atan2(this.vy, this.vx) + Math.fround(3.14)');      // ① 通用尾
    expect(src).toContain('this.a026F6Frame = 5');                                  // ② 步行钳
    expect(src).toContain('this.a026F6Frame = 4');                                  // ② 空中
    expect(src).toContain('this.alphaFade = 255');                                  // ③⑤ 重淡入写位
    expect(src).toContain('private doPalAppearEffect');                             // ④
    expect(src).toContain('nextVector2Circular(Math.random, 3, 3)');                // ④ 尾拍随机
    expect(src).toContain('this.drawScale = 0.5');                                  // ⑥
    expect(src).toContain('★BJ518');                                                // 落刀标记
  });

  it('sha256 稳定（防误改,变异还原后回同值）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    const sha = createHash('sha256').update(src).digest('hex');
    expect(sha).toHaveLength(64);
  });
});
