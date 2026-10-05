/**
 * BJ519 两件（BJ518 登记债清偿）：
 *
 * ① AI_026 flag6/flag8 重力/下落行为面（BJ518② 判谳「块尾自带 velocity.Y+=0.4 封 10,
 *    本仓未落=登记债」本批落域）——逐型行为钉值：
 *      · flag6 191-194（俾格米）: 空中下落 vy 0.4/t 累积封 10（:64721-64726）、
 *        空中帧 4（:64711-64720）、落地归地面帧（:64683-64710）、离台即坠（非悬停）
 *      · flag8 1094/1113（火绒狐）: 同式重力（:64826-64831）、空中帧 27、落地 18;
 *        flag26 攻击制动读相=碰撞后（:63016——a026VyCollide 快照承载,BJ519① 落域）
 *      · 返程相（ai[0]=1）无重力（原版 flight 支无 0.4 写,tileCollide=false 直通）
 * ② AI_Sentries_HeavySlingReposition per-mount 几何 switch + IsTransformationMount
 *    开旗（BJ518⑥ 登记债清偿）——Projectile.cs :70255-70464 1:1：
 *      · 55 Rat :70266-70286（Bottom=Top;帧 0/11-12/15-16 → +2;trap 9/2 缩半;
 *        ballista +8）
 *      · 61 Pixie :70288-70307（Bottom=Top;trap 20/4 rot+=dir·π/2;1025 16/10
 *        rot−=dir·π/2）
 *      · 56 Bat :70308-70341（冲刺 Top+(4dir,1)/常态 Left+9·dir/Right−10·dir;
 *        trap 缩半 vec2(+dir·4,+8) rot+=π;帧 3-5 → num3=0）
 *      · 54 Velociraptor :70342-70354（MountedTop+(−12dir,16);trap vec2Y++ 缩半）
 *      · 52 Wolf :70355-70365（MountedTop+(−4dir,10);ballista Y+4;PlayerOffset
 *        帧表非零）
 *      · flag 开旗加成支：ballista +24（:70211）/1025 rot=π+vec2X+17（:70194）/
 *        trap rot=0+vec2Y+5（:70241）/308 免 −20（:70168）/尾 gfxOffY（:70466）
 * 真值锚：1457 Projectile.cs AI_026 flag6/flag8 块 + AI_Sentries_HeavySlingReposition;
 * 实现落点：src/entities/MinionProj.ts（ai026TailGround 重力 else-if 支 + a026VyCollide
 * 快照 + heavySlingReposition 坐骑 switch）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
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
  cx: number; cy: number; hp: number;
  hurt: (d: number) => boolean;
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
    hurt: () => true,
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = [], extraTiles: Array<[number, number]> = []) {
  const w = new World(200, 120, 7, 'bj519');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  for (const [tx, ty] of extraTiles) w.store.setTile(tx, ty, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 79 * 16, new Inventory());
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
    spawnDust: () => null,
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: () => void } }).entities =
    { projectiles: [], add: () => {} };
  return { hooks, store: w.store, player, enemyList: enemies };
}

const minion = (player: Player, projId: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, projId, 10, 2, false, 0, false, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  return m;
};

/** equipStats 覆写（实例自有属性遮蔽,哨兵携带旗 accSentryBackpack） */
function withEq(player: Player, patch: Record<string, unknown>): void {
  const merged = { ...(player.equipStats as unknown as Record<string, unknown>), ...patch };
  Object.defineProperty(player, 'equipStats', { get: () => merged, configurable: true });
}

/** 挂真 MountInstance（playerOffset/heightBoost 走帧表 getter——Wolf 非零表判别面） */
const withMount = (h: ReturnType<typeof makeHooks>, type: number, frame: number): void => {
  const mnt = h.player.mount;
  mnt.active = type >= 0;
  mnt.type = type;
  mnt.frame = frame;
};

/** 携带哨兵夹具：挂背包 + 挂坐骑 → 直调 heavySlingReposition 一拍（BJ518⑥ 先例） */
const carried = (h: ReturnType<typeof makeHooks>, projId: number,
  mountType: number, mountFrame: number, playerH?: number): MinionProj => {
  withEq(h.player, { accSentryBackpack: true });
  if (playerH !== undefined) priv(h.player).h = playerH;
  withMount(h, mountType, mountFrame);
  const s = minion(h.player, projId, h.player.cx - 8, h.player.cy - 8);
  priv(s).heavySlingReposition(h.player);
  return s;
};

afterEach(() => {
  vi.restoreAllMocks();
});

// player 夹具基准：pos=(960,1264) 42 盒 → cx=970 cy=1285;facing=1（direction=1）
const PX = 60 * 16, PY = 79 * 16;

// ============================================================
// ① flag6 俾格米 191-194 重力/落地/封顶（:64660-64726）
// ============================================================
describe('① flag6 俾格米重力面（191-194）', () => {
  /** 高台夹具：台面 y=92（x 50-80）,右下低台 y=96（x 81-92）接坠 */
  const PLATFORM: Array<[number, number]> = [];
  for (let x = 50; x <= 80; x++) PLATFORM.push([x, 92]);
  for (let x = 81; x <= 92; x++) PLATFORM.push([x, 96]);

  it('空中下落：t1 尾重力 vy=0.4、t2 帧 4 且 vy=0.8（:64721-64726+=0.4 封 10,变异不写 → 红）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 191, 66 * 16, 92 * 16 - 40);   // 台面上方 40px
    priv(m).a026L0 = 1000;                                    // 归位门 dyp 闸死（自由落体判别面）
    m.fixedUpdate(1, h.hooks);
    expect(m.vy, 't1 拍尾重力写 0.4（首拍 move 零位移）').toBeCloseTo(0.4, 9);
    m.fixedUpdate(1, h.hooks);
    expect(m.vy, 't2 累积 0.8').toBeCloseTo(0.8, 9);
    expect(priv(m).a026F6Frame, '空中帧 4（vy≠0,两支同写）').toBe(4);
  });

  it('落地：~15t 后盒底钉台面 1472、当拍归地面静立帧 0（:64683-64710 flag27 支,变异不归 → 红）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 191, 66 * 16, 92 * 16 - 40);
    priv(m).a026L0 = 1000;
    for (let t = 0; t < 20; t++) m.fixedUpdate(1, h.hooks);
    expect(m.y + m.h, '盒底钉台面（碰撞解算,非穿落）').toBe(92 * 16);
    expect(priv(m).a026F6Frame, '落地拍帧机读 vy==0 → flag27 静立 0').toBe(0);
    expect(m.vy, '落地拍拍尾重力仍写 0.4（下拍碰撞归零=稳态）').toBeCloseTo(0.4, 9);
    const yLanded = m.y;
    m.fixedUpdate(1, h.hooks);
    m.fixedUpdate(1, h.hooks);
    expect(m.y, '稳态 y 不漂（重力 0.4 → 碰撞归零闭环）').toBe(yLanded);
  });

  it('离台即坠（非悬停判别面）：步行越缘后 y 递增 + 空中帧 4（旧零重力形 y 恒冻 → 红）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 191, 80 * 16 + 4, 92 * 16 - 8);   // 台右缘站立（盒底恰台面）
    h.enemyList.push(mkEnemy(1, m.cx + 600, m.cy));              // 600∈(450,840) → 步行不转火
    for (let t = 0; t < 10; t++) m.fixedUpdate(1, h.hooks);      // 越缘下坠
    expect(priv(m).a026F6Frame, '离台空中帧 4').toBe(4);
    const y1 = m.y;
    m.fixedUpdate(1, h.hooks);
    expect(m.y, 'y 递增=重力面在（悬停形恒等 → 红）').toBeGreaterThan(y1);
  });

  it('封顶：无底洞自由落体 30t → vy 恰 10（Math.min 钳,变异 ≤11/漏钳 → 红）', () => {
    const h = makeHooks([]);
    for (let x = 60; x <= 72; x++) for (let y = 95; y < 120; y++) h.store.setTile(x, y, 0);
    const m = minion(h.player, 191, 66 * 16, 88 * 16);
    priv(m).a026L0 = 1000;
    for (let t = 0; t < 30; t++) m.fixedUpdate(1, h.hooks);
    expect(m.vy, '0.4×25=10 触顶,Math.min 恒等钳 10').toBe(10);
  });

  it('192 同族成员：t2 vy=0.8（flag6 四型同支,变异漏 192 → 红）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 192, 66 * 16, 92 * 16 - 40);
    priv(m).a026L0 = 1000;
    m.fixedUpdate(1, h.hooks);
    m.fixedUpdate(1, h.hooks);
    expect(m.vy).toBeCloseTo(0.8, 9);
  });
});

// ============================================================
// ① flag8 火绒狐 1094/1113 重力面 + flag26 攻击制动读相
// ============================================================
describe('① flag8 火绒狐重力面（1094/1113）', () => {
  const PLATFORM: Array<[number, number]> = [];
  for (let x = 50; x <= 80; x++) PLATFORM.push([x, 92]);
  for (let x = 81; x <= 92; x++) PLATFORM.push([x, 96]);

  it('空中下落：t1 vy=0.4、t2 帧 27（foxAnimTick onGround 门,:64791-64801+重力 :64826-64831）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 1094, 66 * 16, 92 * 16 - 40);
    priv(m).a026L0 = 1000;
    m.fixedUpdate(1, h.hooks);
    expect(m.vy, 'flag8 块尾重力 0.4（:64826-64831,变异不写 → 红）').toBeCloseTo(0.4, 9);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).foxFrame, '空中帧 27（onGround=false 支）').toBe(27);
  });

  it('落地：待机帧域 18-25 回归（:64767-64790 待机段,落地后 onGround 置真可达;4t 翻页循环）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 1094, 66 * 16, 92 * 16 - 40);
    priv(m).a026L0 = 1000;
    priv(m).foxFrame = 27;                                    // 预置空中帧（坠落残留）
    for (let t = 0; t < 20; t++) m.fixedUpdate(1, h.hooks);
    expect(m.y + m.h).toBe(92 * 16);
    const ff = priv(m).foxFrame as number;
    expect(ff, '待机帧域 [18,26)（27 空中/28-35 行走/36-41 攻击全排除）')
      .toBeGreaterThanOrEqual(18);
    expect(ff).toBeLessThan(26);
  });

  it('flag26 攻击制动：shootCd>0 落地拍 vx×0.7×0.9 两拍连动（:63016 读相=碰撞后,快照死 → 红）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 1094, 66 * 16, 92 * 16 - 9);   // 台面站立（狐 18×18 → 盒底恰 1472）
    priv(m).shootCd = 40;                                     // ai[1] 槽（BJ516④ 同账）
    m.vx = 2;
    m.fixedUpdate(1, h.hooks);
    expect(m.vx, 't1 制动 ×0.7 后 ×0.9 衰减=1.26（pre-move 直读形 t1 恰同为 0,二拍分辨）')
      .toBeCloseTo(1.26, 9);
    m.fixedUpdate(1, h.hooks);
    expect(m.vx, 't2 制动续（1.26×0.7×0.9=0.7938;pre-move 直读 0.4 → 门死=1.134 变异面）')
      .toBeCloseTo(0.7938, 9);
  });

  it('返程相无重力：漂移支 vy=5 保速（ai[0]=1 早退支,原版 flight 无 0.4 写 → 变异漏 return → 红）', () => {
    const h = makeHooks([]);
    const m = minion(h.player, 1094, h.player.cx - 40, h.player.cy);
    priv(h.player).vy = 2;                                    // 玩家腾空 → 落地门恒假
    priv(m).a026A0 = 1;
    m.vx = 2; m.vy = 5;
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026A0, '仍在返程相').toBe(1);
    expect(m.vy, '漂移支保速,无 +0.4（5.4=变异面）').toBe(5);
  });

  it('1113 同族成员：t2 vy=0.8（flag8 两型同支,变异漏 1113 → 红）', () => {
    const h = makeHooks([], PLATFORM);
    const m = minion(h.player, 1113, 66 * 16, 92 * 16 - 40);
    priv(m).a026L0 = 1000;
    m.fixedUpdate(1, h.hooks);
    m.fixedUpdate(1, h.hooks);
    expect(m.vy).toBeCloseTo(0.8, 9);
  });
});

// ============================================================
// ② per-mount 几何 switch（:70255-70464）+ IsTransformationMount 开旗
// ============================================================
describe('② case 55 Rat（:70266-70286）', () => {
  it('trap 携带（frame 0）：Bottom=Top、num7=9/num8=2/num9=2、vec2Y=5、rot=0、scale=0.5', () => {
    const h = makeHooks();
    const s = carried(h, 692, 55, 0, 14);          // RatPlayerSize 14×14
    expect(s.x).toBe(Math.floor(h.player.cx - 2 - s.w / 2));  // X −= num8·dir
    expect(s.y).toBe(Math.floor(PY - s.h + 9 + 2 + 5));       // +num7+num9 +vec2Y(5)
    expect(priv(s).rot, 'trap rot=0（:70241 flag 支覆写）').toBe(0);
    expect(priv(s).drawScale, 'trap 缩半（:70277-70278）').toBe(0.5);
  });

  it('帧窗 num9：frame 12/15 → +2,frame 5 → 0（(uint) 窗 0/11-12/15-16,变异 ≤1 → 红）', () => {
    const h = makeHooks();
    const f12 = carried(h, 692, 55, 12, 14);
    const f5 = carried(h, 692, 55, 5, 14);
    const f15 = carried(h, 692, 55, 15, 14);
    expect(f12.y - f5.y, '帧 12 → num9=2').toBe(2);
    expect(f15.y - f5.y, '帧 15 → num9=2').toBe(2);
  });

  it('ballista 携带：num8=0+8、vec2=(0,−14+24)=10（:70282-70284 + :70211 flag 支）', () => {
    const h = makeHooks();
    const s = carried(h, 677, 55, 0, 14);
    expect(s.x).toBe(Math.floor(h.player.cx - 8 - s.w / 2));  // X −= (0+8)·dir
    expect(s.y).toBe(Math.floor(PY - s.h + 10 + 2 + 10));     // +num7(10)+num9(2)+vec2Y(10)
    expect(priv(s).drawScale, '非 trap 不缩（scale=1 复位）').toBe(1);
  });

  it('308 携带：flag 开旗免 −20（vec2=(−4,0),旧 !flag 形 vec2Y=−20 → 红）', () => {
    const h = makeHooks();
    const s = carried(h, 308, 55, 0, 14);
    expect(s.x).toBe(Math.floor(h.player.cx - 4 - s.w / 2));  // vec2X=−14+10
    expect(s.y).toBe(Math.floor(PY - s.h + 10 + 2));          // 无 −20 项
  });
});

describe('② case 61 Pixie（:70288-70307）', () => {
  it('1025 携带（h=14 缩体）：num5=16/num6=10、rot=π−π/2、vec2=(−25+17,4+5)', () => {
    const h = makeHooks();
    const s = carried(h, 1025, 61, 0, 14);
    expect(s.x).toBe(Math.floor(h.player.cx - 10 - 8 - s.w / 2)); // −num6·dir +vec2X(−8)
    expect(s.y).toBe(Math.floor(PY - s.h + 16 + 9));              // +num5(16)+vec2Y(9)
    expect(priv(s).rot, '1025 rot=π → flag3 −=dir·π/2').toBeCloseTo(Math.PI / 2, 9);
    expect(priv(s).drawScale, '1025 缩体支 0.5（:70200）').toBe(0.5);
  });

  it('trap 携带：num5=20/num6=4、rot=0+dir·π/2（:70292-70297）', () => {
    const h = makeHooks();
    const s = carried(h, 692, 61, 0, 14);
    expect(s.x).toBe(Math.floor(h.player.cx - 4 - s.w / 2));
    expect(s.y).toBe(Math.floor(PY - s.h + 20 + 5));
    expect(priv(s).rot).toBeCloseTo(Math.PI / 2, 9);
    expect(priv(s).drawScale).toBe(0.5);
  });
});

describe('② case 56 Bat（:70308-70341）', () => {
  it('常态（dir=1）：Bottom=Left+(9,0)、trap vec2(+4,+8+5)+num3(2)、rot=0+π、缩半', () => {
    const h = makeHooks();
    const s = carried(h, 692, 56, 0, 18);          // BatPlayerSize 20×18
    expect(s.x).toBe(Math.floor(PX + 9 + 4 - s.w / 2));
    expect(s.y).toBe(Math.floor(PY + 9 + 13 + 2 - s.h));      // cy=PY+9;+vec2Y(13)+num3(2)
    expect(priv(s).rot, 'trap rot=0 → flag5 rot+=π（:70325）').toBeCloseTo(Math.PI, 9);
    expect(priv(s).drawScale).toBe(0.5);
  });

  it('常态（dir=−1）：Bottom=Right+(−10,0)（Directions.X<0 支,变异走左支 → 红）', () => {
    const h = makeHooks();
    priv(h.player).facing = -1;
    const s = carried(h, 692, 56, 0, 18);
    expect(s.x).toBe(Math.floor(PX + 20 - 10 - 4 - s.w / 2)); // Right.X−10 +vec2X(−4·|dir|)
    expect(priv(s).rot).toBeCloseTo(Math.PI, 9);
  });

  it('冲刺滑行（dashDelay<0）：Bottom=Top+(4dir,3)+(0,−2)（:70310-70315,变异走常态支 → 红）', () => {
    const h = makeHooks();
    priv(h.player).dashDelay = -1;                            // 滑行态（dash>0 半支仓内隐含）
    const s = carried(h, 692, 56, 0, 18);
    expect(s.x).toBe(Math.floor(h.player.cx + 4 + 4 - s.w / 2));
    expect(s.y).toBe(Math.floor(PY + 1 + 13 + 2 - s.h));      // Top.Y+3−2=+1
  });

  it('帧窗 num3：frame 4 → 0（帧 3-5 免 +2）,frame 0 → 2（:70331-70337）', () => {
    const h = makeHooks();
    const f4 = carried(h, 692, 56, 4, 18);
    const f0 = carried(h, 692, 56, 0, 18);
    expect(f0.y - f4.y, 'num3 差=2').toBe(2);
  });
});

describe('② case 54 Velociraptor + case 52 Wolf（:70342-70365）', () => {
  it('54 trap 携带：vec2Y++（5+1=6）、Bottom=MountedTop+(−12dir,16)、缩半', () => {
    const h = makeHooks();
    const s = carried(h, 692, 54, 0, 42);          // 无 PlayerSize 委派 42 盒
    expect(s.x).toBe(Math.floor(h.player.cx - 12 - s.w / 2));
    expect(s.y).toBe(Math.floor(PY + 16 + 6 - s.h));          // MountedTop.Y=PY（pOff 全零）
    expect(priv(s).drawScale).toBe(0.5);
  });

  it('52 ballista 携带 PlayerOffset 帧敏感：frame1 pOff=−14 → MountedTop.Y+14（playerYOffsets 表）', () => {
    const h = makeHooks();
    const f1 = carried(h, 677, 52, 1, 42);
    const f0 = carried(h, 677, 52, 0, 42);
    expect(f1.x).toBe(Math.floor(h.player.cx - 4 - f1.w / 2));
    expect(f1.y).toBe(Math.floor(PY + 14 + 10 + 4 + 10 - f1.h)); // hoc=−pOff=+14
    expect(f1.y - f0.y, '帧 1 vs 帧 0 MountTop 差 14').toBe(14);
  });
});

describe('② flag 门负例 + 尾 gfxOffY', () => {
  it('非变身骑（7 UFO）走 default 支且 flag=false：trap vec2=(−9dir,0)、rot=4.712389（开旗误真 → 红）', () => {
    const h = makeHooks();
    const s = carried(h, 692, 7, 0);
    expect(s.x).toBe(Math.floor(h.player.cx - 9 - s.w / 2));  // MountedCenter+vec2,RRP 恒等
    expect(s.y).toBe(Math.floor(PY + 42 - 21 - 16 - s.h / 2)); // mc.y=PY+42−21−pOff(16)
    expect(priv(s).rot, '!flag 保留射姿').toBeCloseTo(Math.fround(4.712389), 9);
    expect(priv(s).drawScale, '无缩体').toBe(1);
  });

  it('尾 if(flag) Y+=gfxOffY（:70466-70468）：变身骑 gfx=6 → y+6（变异漏尾 → 红）', () => {
    const h = makeHooks();
    priv(h.player).gfxOffY = 6;
    const s = carried(h, 692, 55, 0, 14);
    expect(s.y).toBe(Math.floor(PY - s.h + 9 + 2 + 5 + 6));
  });

  it('无坐骑（mount.active=false）→ default 支=旧形不变（BJ514-518 既有面对照）', () => {
    const h = makeHooks();
    const s = carried(h, 692, -1, 0);                         // withMount: type<0 → active=false
    expect(s.x).toBe(Math.floor(h.player.cx - 9 - s.w / 2));
    expect(s.y).toBe(Math.floor(PY + 21 - s.h / 2));
  });
});

// ============================================================
// ③ 源级锁 + sha256 对拍锚（BJ519 落刀态）
// ============================================================
describe('③ 源级锁', () => {
  it('BJ519 落刀标记在位（重力 else-if 支/快照/坐骑 switch/开旗）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toContain('else if (isF6 || isF8)');                       // ① 重力支
    expect(src).toContain('this.vy = Math.min(this.vy + 0.4, 10);');       // ① 重力式
    expect(src).toContain('this.a026VyCollide = this.vy');                 // ① 快照捕获×2
    expect(src).toContain('this.a026VyCollide === 0');                     // ① flag26 制动读相
    expect(src).toContain('MOUNT_SETS.IsTransformationMount');             // ② 开旗
    expect(src).toContain('mntType === 55');                               // ② Rat
    expect(src).toContain('mntType === 61');                               // ② Pixie
    expect(src).toContain('mntType === 56');                               // ② Bat
    expect(src).toContain('mntType === 54');                               // ② Raptor
    expect(src).toContain('mntType === 52');                               // ② Wolf
    expect(src).toContain('if (flag) this.y += gfx;');                     // ② 尾 gfxOffY
    expect(src).toContain('★BJ519');                                       // 落刀标记
  });

  it('sha256 稳定（变异还原后回同值）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(createHash('sha256').update(src).digest('hex')).toHaveLength(64);
  });
});
