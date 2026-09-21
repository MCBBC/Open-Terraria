// ★对抗修复批⑤（2026-09-01）打包回归 —— 实体域挂账清偿（批5A）
// 蓝队复核（红队 R1-R3 → 蓝队 RA/RB/RC）+ 反编译锚行（Terarria1457）逐项：
//   【A1】兔表演尾冻 cs:69647-50 `num64>20 && ai[1]>40 → num64=19`（门值 20）
//   【A2】663 魔法光环基色 = Main.hslToRgb(0.92,1,0.78)=255,143,197（NPCID.cs:4859,
//         Main.cs:48689 hue2rgb 折算；旧 (178,121,229) 系错误手推值）
//   【A3】209 逐弹冷却：SelectRandom(134,133,135) 每拍求值(cs:55138-60 参数块常驻)
//         + switch 覆写 num55/maxValue2 + 退出块直读本拍终值(cs:55362-66)
//   【A4】出膛锚点半宽按弹真实 SetDefaults 尺寸(950=104×104 半宽 52;10×10 族不变)
//   【A5】life 管线：SetDefaults 预置 3600(Projectile.cs:789)→json timeLeft 逐款
//         (24→4800/590→900/950→180/1·2→1200/14·242·357→600)→发射级 480 后于默认
//   【A6】弓族入态种子=vector8.Y(cs:56052-59)+flag28 连发推进档带内回写
//         (cs:55382-91,±0.5 带外保留旧值)
//   【A7】social kind9 入态 localAI[3]=0f(cs:55982)
//   【A8】溺水跳出测深环 GetTileSafely 出界空格语义(Framing.cs:426-31)
//   【A9】史莱姆蹦跳两臂(cs:54721-25 小跳/cs:54760-87 支撑面否支)+啮齿折返
//        (cs:54657-64 flag7={300,447,610})
//   【A10】critter 死域预防三件：起身腿程 Next(200,400) 单采(UnifiedRandom.cs:
//         121-132)/走→停双分支(cs:54377-90)/第二乘子 ×1.2(cs:54751-55)。
//         ★骰流位变化记录：该区域现行零实体(VANILLA_TOWN_CRITTER_SHEETS 无既有
//         城镇 NPC 载体)、无既有回放依赖——本文件即存证公证
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TownShot } from '../src/entities/TownShot';
import { projectileData } from '../src/data/vanillaProjectiles';
import { TOWN_MAGIC_AURA_COLOR, TOWN_BOW } from '../src/data/vanillaTownAttack';
import { VANILLA_TOWN_CRITTER_SHEETS } from '../src/entities/TownNPC';
import { TILE_DEFS } from '../src/data/tiles';

const DIRT = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 1);
const FLOOR_ROW = 100;

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function rngQ(vals: number[], fallback = 0.999) {
  let i = 0;
  return () => {
    const v = i < vals.length ? vals[i] : fallback;
    i++;
    return v;
  };
}
function priv(n: object, k: string): any {
  return (n as Record<string, unknown>)[k];
}
function privSet(n: object, kv: Record<string, unknown>): void {
  Object.assign(n, kv);
}
type AnyNpc = TownNPC & Record<string, unknown>;

function flatWorld(name: string): World {
  const world = new World(240, 200, 100, name);
  for (let x = 20; x <= 230; x++) world.store.setTileSilent(x, FLOOR_ROW, DIRT);
  return world;
}
/** 底部精确落地面 */
function placeOnFloor(world: World, npc: TownNPC, tileX: number): void {
  npc.x = tileX * 16;
  npc.y = FLOOR_ROW * 16 - npc.h;
}

interface TestEnemy {
  x: number; y: number; w: number; h: number; dead: boolean; damage: number;
  hurt: () => boolean;
}
function makeGame(world: World, enemies: TestEnemy[] = []) {
  const shots: TownShot[] = [];
  const game = {
    world,
    player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
    enemies: () => enemies,
    npcs: () => [] as unknown[],
    critters: () => [],
    projectiles: () => shots.filter((s) => !s.dead),
    spawnTownShot: (s: TownShot) => { shots.push(s); },
    spawnParticles: () => {},
    spawnBurst: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    addDamageNumber: () => {},
  } as Record<string, unknown>;
  return { shots, game: game as never };
}

/** 危险侧候选池直灌（C2 池快照形态）+ 发射模式四件套 */
function armPool(npc: AnyNpc, cx: number, cy: number): void {
  privSet(npc, {
    facing: 1, dangerSide: 1,
    threatPool: { left: null, right: { x: cx - 10, y: cy - 20, w: 20, h: 40, cx, cy } },
  });
}
const feetRowOf = (n: TownNPC): number => Math.floor((n.y + n.h - 16) / 16);
const shootAtFn = (TownNPC.prototype as unknown as Record<string, (...a: unknown[]) => void>).shootAt;
const obstacleJumpFn =
  (TownNPC.prototype as unknown as Record<string, (...a: unknown[]) => boolean>).obstacleJump;
const wanderUpdateFn =
  (TownNPC.prototype as unknown as Record<string, (...a: unknown[]) => number>).wanderUpdate;
const mechProbeAliveFn =
  (TownNPC.prototype as unknown as Record<string, (g: never) => boolean>).mechProbeAlive;

// =====================================================================
// 【A1】兔(656) 表演 kind22 尾带摆动（cs:69647-50 门值 20）
// =====================================================================
describe('【A1】兔表演尾冻门值 row>20（cs:69647-50）', () => {
  it('kind22 帧行 17..20 往复：19 与 20 都出现、永不越 21 或回卷 0', () => {
    const world = flatWorld('fix5-a1');
    const npc = new TownNPC('town_bunny', 0, 0) as AnyNpc;
    placeOnFloor(world, npc, 104);
    npc.vx = 0;
    npc.social = { kind: 22, t: 400, other: null, frameT: 0, prevFrame: 0, rpsA: 0, rpsB: 0 };
    npc.frame = 17;
    privSet(npc, { walkMode: 0 });
    const { game } = makeGame(world);
    npc.rng = rngQ([], 0.999);
    const seen = new Set<number>();
    for (let t = 0; t < 140 && npc.social; t++) {
      npc.fixedUpdate(1 / 60, game);
      seen.add(npc.frame);
    }
    // 门值修正的直接证据：旧行为 `row>19→19` 使 20 永不可达（尾带提前一拍折返）
    expect(seen.has(20)).toBe(true);
    expect(seen.has(19)).toBe(true);
    for (const f of seen) {
      expect(f).toBeGreaterThanOrEqual(17);
      expect(f).toBeLessThanOrEqual(20);
    }
  });
});

// =====================================================================
// 【A2】663 施法光环乘色拨正（NPCID.cs:4859）
// =====================================================================
describe('【A2】魔法光环 663 基色 (255,143,197)', () => {
  it('表值 = hslToRgb(0.92,1,0.78) hue2rgb 折算;alpha 127 不动;其余四人不变', () => {
    expect(TOWN_MAGIC_AURA_COLOR[663]).toEqual([255, 143, 197, 127]);
    // 手推复核（Main.cs:48689）：Lum .78≥.5 → t1=.56/t2=1；
    // r@h+⅓=.25333 → 2c<1 → t2=1 → 255；g@.92 → 3c≥2 → t1 → ⌊142.8⌉=143；
    // b@h−⅓=.58667 → 3c<2 → t1+(t2−t1)(⅔−c)·6 ≈ .7712 → ⌊196.66⌉=197
    expect(TOWN_MAGIC_AURA_COLOR[54]).toEqual([100, 4, 227, 127]);
    expect(TOWN_MAGIC_AURA_COLOR[108]).toEqual([255, 80, 60, 127]);
    expect(TOWN_MAGIC_AURA_COLOR[160]).toEqual([40, 80, 255, 127]);
    expect(TOWN_MAGIC_AURA_COLOR[20]).toEqual([40, 255, 80, 127]);
  });
});

// =====================================================================
// 【A3】209 逐弹冷却三态
// =====================================================================
describe('【A3】电子人(209)逐弹冷却链（cs:55138-60/:55362-66）', () => {
  /** LCG 灌进态（敌右侧同层斜率带内），返回已发射环境 */
  function enterCyborg(): { world: World; cyborg: AnyNpc; game: never; shots: TownShot[] } {
    const world = flatWorld('fix5-a3');
    const cyborg = new TownNPC('cyborg', 0, 0) as AnyNpc;
    placeOnFloor(world, cyborg, 100);
    const enemy: TestEnemy = {
      x: 105 * 16, y: FLOOR_ROW * 16 - 60, w: 20, h: 40, dead: false,
      damage: 40, hurt: () => true,
    };
    const { game, shots } = makeGame(world, [enemy]);
    cyborg.rng = lcg(20260901);
    let ticks = 0;
    while (cyborg.attackState !== 12 && ticks++ < 4000) {   // 进态即停（首拍未及发射）
      enemy.x = cyborg.cx + 64;
      enemy.y = cyborg.cy - 8;
      cyborg.fixedUpdate(1 / 60, game);
      if (ticks > 3990) break;
    }
    return { world, cyborg, game, shots };
  }

  it('态内每拍恰耗一张 SelectRandom 骰（含无发射拍与退出拍）', () => {
    const { cyborg, game } = enterCyborg();
    let diceThisTick = 0;
    cyborg.rng = (() => {
      let seed = 77777777;
      return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        diceThisTick++;
        return seed / 0x100000000;
      };
    })();
    const counts: number[] = [];
    for (let t = 0; t < 70 && cyborg.attackState === 12; t++) {
      diceThisTick = 0;
      cyborg.fixedUpdate(1 / 60, game);
      counts.push(diceThisTick);
    }
    expect(cyborg.attackState).toBe(0);              // AttackTime=60 已退
    expect(counts.length).toBeGreaterThanOrEqual(30);
    for (const c of counts) expect([1, 3]).toContain(c);   // 选弹拍 / 发射拍或退出拍(+2)
    expect(counts.filter((c) => c === 1).length).toBeGreaterThan(5);
  });

  it('选弹切恒 0.5 → 恒中 133；退出腿程/冷却取三态终值 10/5 且与静态默认不相交', () => {
    const { world, cyborg, game, shots } = enterCyborg();
    void world;
    cyborg.rng = rngQ([], 0.5);                      // floor(.5*3)=1 → 第 2 位 = 133
    let ticks = 0;
    while (cyborg.attackState === 12 && ticks++ < 300) cyborg.fixedUpdate(1 / 60, game);
    expect(cyborg.attackState).toBe(0);
    const roll = priv(cyborg, 'cyborgRoll') as { kind: number; cdBase: number; cdRand: number };
    expect(roll).toBeDefined();
    expect(roll.kind).toBe(133);                     // cs:55147 case 133(num55=10/maxValue2=1)
    const shot = shots.find((s) => s.projId === 133);
    expect(shot).toBeDefined();
    expect(shot!.damage).toBe(25);                   // num52=25 ×num2(1)
    expect(priv(cyborg, 'walkT')).toBe(10);          // ai[1]=num55+⌊.5·1⌋（本拍选中值）
    expect(priv(cyborg, 'atkCd')).toBe(5);           // num55/2+⌊.5·1⌋
    expect(priv(cyborg, 'turnLock')).toBe(5);        // localAI[1]≡localAI[3]
    // 静态默认(14/4 族 → atkCd∈[7,10]/legT∈[14,17]) 与实取证值不相交——覆写失效即红
    expect(priv(cyborg, 'atkCd')).not.toBeGreaterThanOrEqual(7);
    expect(priv(cyborg, 'walkT')).not.toBeGreaterThanOrEqual(14);
  });
});

// =====================================================================
// 【A4】出膛锚点半宽尺寸源
// =====================================================================
describe('【A4】出膛锚点半宽尺寸源（vanilla-projectiles.json 载体）', () => {
  it('1/583/587/589 恰 10×10（锚点换算不变）、950=104、590=14；586 在册但无出膛点', () => {
    for (const id of [1, 583, 587, 589]) {
      expect(projectileData(id)?.width, `proj ${id} w`).toBe(10);
      expect(projectileData(id)?.height, `proj ${id} h`).toBe(10);
    }
    expect(projectileData(950)?.width).toBe(104);
    expect(projectileData(950)?.height).toBe(104);
    expect(projectileData(590)?.width).toBe(14);
    expect(projectileData(586)).toBeDefined();       // 登记面：走 updateDryadWardAura 无出膛点
  });

  it('公主(663)落点弹集成：中心口径落窗内、旧 10px 口径恒越窗（±47px）', () => {
    const world = flatWorld('fix5-a4');
    const princess = new TownNPC('princess', 0, 0) as AnyNpc;
    placeOnFloor(world, princess, 100);
    princess.stationary = true;
    const ex = 104 * 16, ey = FLOOR_ROW * 16 - 60, ew = 20, eh = 40;
    const enemy: TestEnemy = { x: ex, y: ey, w: ew, h: eh, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(world, [enemy]);
    princess.rng = lcg(987654321);
    let ticks = 0;
    let lastEx = enemy.x, lastEy = enemy.y;          // 发射刻敌位快照（敌逐拍跟随）
    while (!shots.some((s) => s.projId === 950) && ticks++ < 4000) {
      lastEx = enemy.x;
      lastEy = enemy.y;
      enemy.x = princess.cx + 64;
      enemy.y = princess.cy - 20;
      princess.fixedUpdate(1 / 60, game);
      if (shots.some((s) => s.projId === 950)) { lastEx = enemy.x; lastEy = enemy.y; }
      if (ticks > 3990) break;
    }
    const shot = shots.find((s) => s.projId === 950);
    expect(shot).toBeDefined();
    expect(shot!.w).toBe(104);
    // 采样窗以【发射刻】敌盒为准（cs:55367 position+Size×rand(0..1) 直读池快照）
    const px = shot!.x + shot!.w / 2;                // 新口径（半宽 52 反推中心）
    const py = shot!.y + shot!.h / 2;
    expect(px).toBeGreaterThanOrEqual(lastEx);       // [x, x+w]
    expect(px).toBeLessThanOrEqual(lastEx + ew);
    expect(py).toBeGreaterThanOrEqual(lastEy);
    expect(py).toBeLessThanOrEqual(lastEy + eh);
    // 旧口径 x+5 读数与真中心差恒 47px 且必越窗（假阳性暴露面钉死）
    expect((shot!.x + shot!.w / 2) - (shot!.x + 5)).toBe(47);
    expect((shot!.y + shot!.h / 2) - (shot!.y + 5)).toBe(47);
    const oldX = shot!.x + 5, oldY = shot!.y + 5;
    expect(oldX >= lastEx && oldX <= lastEx + ew && oldY >= lastEy && oldY <= lastEy + eh)
      .toBe(false);
  });
});

// =====================================================================
// 【A5】life 管线矩阵 + 582 无重力探针窗计数
// =====================================================================
describe('【A5】life 管线（Projectile.cs:789 预置档 → json timeLeft → 发射级覆写）', () => {
  it('构造器默认 = json timeLeft；缺失支走 3600；发射级 480 后于默认（24:4800→480）', () => {
    const mk = (id: number, opts?: { life?: number }) =>
      new TownShot(0, 0, 0, 0, 0, 0, id, opts);
    // decompiled 双向核对过：24→4800(:1072)/590→900(:6388)/950→180(:8959)/
    // 1·2→1200(:810/:820)/14→600(:953)/242→600(:3241)/357→600(:4477)
    expect(mk(24).life).toBe(4800);
    expect(mk(590).life).toBe(900);
    expect(mk(950).life).toBe(180);
    expect(mk(1).life).toBe(1200);
    expect(mk(2).life).toBe(1200);
    expect(mk(242).life).toBe(600);
    expect(mk(357).life).toBe(600);
    expect(mk(14).life).toBe(600);
    // 未设 timeLeft 支（21/582 等）→ Projectile.cs:789 SetDefaults 预置 3600
    expect(mk(21).life).toBe(3600);
    expect(mk(582).life).toBe(3600);
    // 发射级覆写后于默认（cs:55070-77 两连支 timeLeft=480 同形）：
    // NPC 107 弹体 24（默认 4800）/ NPC 588 弹体 721（缺省 3600）都被压到 480
    expect(mk(24, { life: 480 }).life).toBe(480);
    expect(mk(721, { life: 480 }).life).toBe(480);
    // 出世 life 快照（MountShot 弹龄推导源）
    expect(priv(mk(24, { life: 480 }), 'age0')).toBe(480);
    expect(priv(mk(590), 'age0')).toBe(900);
  });

  it('机械师(124)侦察弹 582：无重力直飞 + 探针窗 3600 计数存活 + 在途抑制门命中', () => {
    const world = flatWorld('fix5-a5');
    const mechanic = new TownNPC('mechanic', 0, 0) as AnyNpc;
    placeOnFloor(world, mechanic, 40);
    privSet(mechanic, { atkState: 10, atkTick: 1, atkNextShot: 1, hardModeFlag: false });
    // 远距高位目标 → 直飞轨迹永不出场、不入地
    armPool(mechanic, 180 * 16, FLOOR_ROW * 16 - 320);
    const { shots, game } = makeGame(world);
    shootAtFn.call(mechanic, world, game,
      { proj: 582, dmg: 11, speed: 10, shootTick: 1, cdBase: 30, cdRand: 30, spread: 0, kb: 3.5 }, 800);
    expect(shots.length).toBe(1);
    const probe = shots[0];
    expect(probe.projId).toBe(582);
    expect(priv(probe, 'noGrav')).toBe(true);        // ★A5 无重力探针前提
    expect(probe.ai1).toBeGreaterThan(0);            // 本体归属 tag(:55067 ai1=whoAmI)
    expect(probe.life).toBe(3600);                   // 探针窗计数上限
    const vy0 = probe.vy;
    for (let t = 0; t < 60 && !probe.dead; t++) probe.fixedUpdate(1 / 60, game);
    expect(probe.dead).toBe(false);                  // 60t << 3600 在途
    expect(probe.vy).toBe(vy0);                      // 无重力 → vy 恒定不积 grav
    // 机械师「侦察弹在途」抑制门（mechProbeAlive 键 = ai1 tag）命中
    expect(mechProbeAliveFn.call(mechanic, game)).toBe(true);
  });
});

// =====================================================================
// 【A6】holdAim 链：flag28 带检回写（入态种子另见 town-npc-behavior 批⑤更新例）
// =====================================================================
describe('【A6】弓族 ai[2] 写入门（cs:55382-91 回写面）', () => {
  function bowNpc(key = 'witch_doctor'): AnyNpc {
    const npc = new TownNPC(key, 0, 0) as AnyNpc;
    placeOnFloor(world0(), npc, 100);
    privSet(npc, {
      atkState: 12, atkTick: 8, atkNextShot: 8, atkBurstIdx: 0,
      hardModeFlag: false, holdAim: 0.3,
    });
    return npc;
  }
  function world0(): World { return flatWorld('fix5-a6'); }

  function fire(npc: AnyNpc, refCyPx: number): TownShot[] {
    const world = world0();
    const centerY = Math.floor(npc.cy / 16) * 16 + 8;   // 参考中线附近
    armPool(npc, 106 * 16, refCyPx || centerY);
    const { shots, game } = makeGame(world);
    shootAtFn.call(npc, world, game, { ...TOWN_BOW[178] }, 900);
    return shots;
  }

  it('flag28=false（非连发推进拍）：整拍不写——保留旧种子 0.3', () => {
    const npc = bowNpc();
    fire(npc, Math.floor(npc.cy / 16) * 16 + 8);
    expect(priv(npc, 'holdAim')).toBe(0.3);          // 旧实现无条件钳写系病根
  });

  it('flag28=true（档进拍）：带内写入本拍向量 Y；带外保留旧值不再 clamp', () => {
    const npc = bowNpc('pirate');                     // 229 有真实连发链
    privSet(npc, { atkBurstIdx: 1 });                 // flag28 承接载体
    // 带内：候选中心与本体近同高（差 8px << 43px 半带界）→ 写入近似 0
    const nearCy = Math.floor(npc.cy / 16) * 16 + 8;
    fire(npc, nearCy);
    const inBand = priv(npc, 'holdAim') as number;
    expect(Math.abs(inBand - (nearCy - npc.cy) / Math.hypot(6 * 16, nearCy - npc.cy))).toBeLessThan(0.02);
    // 带外：+120px → |Y|>0.5 → 不写保留（原版字面,非 clamp 到 ±0.5）
    privSet(npc, { holdAim: 0.3 });
    fire(npc, nearCy + 120);
    expect(priv(npc, 'holdAim')).toBe(0.3);
    // 再证另一符号
    privSet(npc, { holdAim: -0.44 });
    fire(npc, nearCy - 160);
    expect(priv(npc, 'holdAim')).toBe(-0.44);
  });
});

// =====================================================================
// 【A7】social kind9 入态 turnLock=0（cs:55982 localAI[3]=0f）
// =====================================================================
describe('【A7】驻足看家具入态清锁（RB-L3）', () => {
  function interactableTile(): number {
    const sheets = new Set([
      17, 77, 133, 12, 665, 639, 26, 695, 35, 36, 55, 395, 471, 698, 21, 467,
      29, 97, 88, 99, 463, 491, 33, 372, 174, 49, 646, 100, 173, 78, 79, 94,
      96, 101,
    ]);
    for (let id = 1; id < TILE_DEFS.length; id++) {
      const sh = TILE_DEFS[id]?.vanilla?.sheet;
      if (sh !== undefined && sheets.has(sh)) return id;
    }
    return -1;
  }

  it('前方 10px 格为 Interactable 家具 → kind9 受理并 turnLock 清零、vx 归零', () => {
    const tid = interactableTile();
    if (tid < 0) throw new Error('no interactable tile found');
    const world = flatWorld('fix5-a7');
    const npc = new TownNPC('guide', 0, 0) as AnyNpc;
    placeOnFloor(world, npc, 104);
    privSet(npc, { walkMode: 1, walkT: 500, turnLock: 123, onGround: true });
    npc.facing = 1;
    npc.vx = 1;
    // 探测公式同 socialUpdate ⑥：fx=floor(cx+dir*10)/16、fy=floor(cy/16)
    const fx = Math.floor((npc.cx + npc.facing * 10) / 16);
    const fy = Math.floor(npc.cy / 16);
    if (!world.store.isSolid(fx, fy + 1)) world.store.setTileSilent(fx, fy, tid);
    const { game } = makeGame(world);
    // 骰序：行走 tick ⑥驻足 rand600 先耗一张（首张 0.000001 直接命中入态）
    npc.rng = rngQ([0.000001], 0.999);
    npc.fixedUpdate(1 / 60, game);
    expect(npc.socialKind).toBe(9);
    expect(npc.vx).toBe(0);                          // :55831 velocity=0
    expect(priv(npc, 'turnLock')).toBe(0);           // ★A7 本体断言（cs:55982）
  });
});

// =====================================================================
// 【A9】史莱姆蹦跳两臂 + 啮齿折返
// =====================================================================
describe('【A9】史莱姆蹦跳/啮齿折返', () => {
  it('臂A：贴地全净空梯序末档小跳 vy=-5（白盒直调,无物理干扰）;非史莱姆不受理', () => {
    const world = flatWorld('fix5-a9a');
    const slime = new TownNPC('town_slime_blue', 0, 0) as AnyNpc;
    placeOnFloor(world, slime, 104);
    privSet(slime, { vy: 0, vx: 1 });
    slime.facing = 1;
    const turned = obstacleJumpFn.call(slime, world, 1, false);
    expect(turned).toBe(false);                      // 跳跃不转身
    expect(priv(slime, 'vy')).toBe(-5);              // cs:54724 字面

    const guide = new TownNPC('guide', 0, 0) as AnyNpc;
    placeOnFloor(world, guide, 112);
    privSet(guide, { vy: 0, vx: 1 });
    guide.facing = 1;
    obstacleJumpFn.call(guide, world, 1, false);
    expect(priv(guide, 'vy')).toBe(0);               // 非 IsTownSlime 整档不受理
  });

  it('活体史莱姆落地场：蹦跳节律（反复腾空）且平地支撑充足不触发臂B停走', () => {
    const world = flatWorld('fix5-a9-live');
    const slime = new TownNPC('town_slime_blue', 0, 0) as AnyNpc;
    placeOnFloor(world, slime, 104);
    privSet(slime, { walkMode: 1, walkT: 50000, turnLock: 0 });  // 巨腿程防自然停走干扰
    slime.facing = 1;
    slime.vx = 1;
    const { game } = makeGame(world);
    slime.rng = rngQ([], 0.999);
    let hops = 0, wasAir = false, stoppedWalking = false;
    for (let t = 0; t < 600; t++) {
      const preVx = slime.vx;
      slime.fixedUpdate(1 / 60, game);
      if (!wasAir && !slime.onGround && priv(slime, 'vy') < 0) hops++;
      wasAir = !slime.onGround;
      if (preVx !== 0 && slime.vx === 0 && priv(slime, 'turnLock') === 40) stoppedWalking = true;
    }
    expect(hops).toBeGreaterThanOrEqual(3);          // 节律：反复起跳(vy<0 触发)
    expect(slime.walking).toBe(true);                // 平地支撑 3>2 → 臂B不受理
    expect(stoppedWalking).toBe(false);
  });

  it('臂B：腾空下方支撑格 ≤2 → 五常数停走（mode0/walkT=50+Next50/lock40/vx×0.2/wantDir0）', () => {
    const world = flatWorld('fix5-a9b');
    const st = world.store;
    const bx = 105;
    // 掏空脚下 ±1 列含本行 × 下探 8 行，只留 2 个孤立支撑格（≤2 触发,cs:54767-81 式）
    for (const col of [bx - 1, bx, bx + 1]) {
      for (let d = 0; d <= 8; d++) st.setTileSilent(col, FLOOR_ROW + d, 0);
    }
    st.setTileSilent(bx + 1, FLOOR_ROW + 1, DIRT);   // 支撑①
    st.setTileSilent(bx - 1, FLOOR_ROW + 2, DIRT);   // 支撑②
    const slime = new TownNPC('town_slime_blue', bx * 16 + 2, 0) as AnyNpc;
    placeOnFloorSky(slime, FLOOR_ROW * 16 - 40);     // 半空腾空位（onGate 已显式置）
    privSet(slime, { walkMode: 1, walkT: 5000, onGround: false, vy: -3, vx: 1, turnLock: 0 });
    slime.facing = 1;
    const { game } = makeGame(world);
    slime.rng = rngQ([0.5], 0.999);                  // 该拍仅 Next(50) 一骰（实测骰流）
    slime.fixedUpdate(1 / 60, game);
    expect(slime.walking).toBe(false);               // walkMode=0（ai[0]=0）
    expect(priv(slime, 'walkT')).toBe(75);           // 50+⌊.5·50⌋
    expect(priv(slime, 'turnLock')).toBe(40);        // localAI[3]=40
    expect(Math.abs(slime.vx - 0.2)).toBeLessThan(1e-9);  // velocity.X *= 0.2f
  });
  function placeOnFloorSky(npc: TownNPC, y: number): void { npc.y = y; }

  it('啮齿折返臂：flag7 两格高墙被卡 + 身侧实心 → 折返且 vx=0（不走 flag26 −vx 反冲）', () => {
    const world = flatWorld('fix5-a9r');
    const st = world.store;
    const rat = new TownNPC('guide', 0, 0) as AnyNpc;
    placeOnFloor(world, rat, 102);
    privSet(rat, { vanillaId: 300 });                 // cs:54001 flag7 集 {300,447,610}
    const feetRow = feetRowOf(rat);                   // 底贴地 → 本行恒 FLOOR_ROW−1
    const headRow = feetRow - 2;
    const cyRow = Math.floor(rat.cy / 16);
    st.setTileSilent(103, headRow, DIRT);             // t5 实心（一档门槛,需 t4 双实心）
    st.setTileSilent(103, feetRow - 1, DIRT);         // t4 实心
    st.setTileSilent(Math.floor(rat.cx / 16), feetRow - 1, DIRT);  // 净空失败区（SV 面）
    const turned = obstacleJumpFn.call(rat, world, 1, false);
    expect(turned).toBe(true);
    expect(rat.facing).toBe(-1);                      // direction *= -1
    expect(rat.vx).toBe(0);                           // velocity.X *= 0f（cs:54662）
    expect(cyRow).toBe(feetRow - 1);                  // 身侧实心行恰=centerY 行 → 折返壁实证
  });
});

// =====================================================================
// 【A10】critter 死域预防三件套
// =====================================================================
describe('【A10】critter 三 bonus（★现行零实体区域——骰流位变化无既有回放依赖）', () => {
  /** (a)/(b) 用 wanderUpdate 白盒直调——骰序从零起算不受社交链前耗干扰 */
  function standCritter(world: World, vanillaId: number): AnyNpc {
    const npc = new TownNPC('guide', 0, 0) as AnyNpc;
    placeOnFloor(world, npc, 130);
    privSet(npc, { vanillaId, walkMode: 0, walkT: 1, onGround: true, turnLock: 5, talking: false });
    return npc;
  }

  it('(a)站桩耗尽起身：critter 第三掷 Next(200,400) 单采 → 650；非critter 只吃一骰 → 350', () => {
    const world = flatWorld('fix5-a10a');
    const critter = standCritter(world, 300);
    privSet(critter, { turnLock: 5 });               // 锁未尽免拴绳掷尾扰动? 拴绳仍耗一张——序列后置无害
    critter.rng = rngQ([0.5, 0.5], 0.999);           // base ⌊.5·300⌋=150 / bonus ⌊.5·200⌋=100
    wanderUpdateFn.call(critter, world, makeGame(world).game, false);
    expect(critter.walking).toBe(true);
    expect(priv(critter, 'walkT')).toBe(650);        // (200+150)+(200+100)
    expect(VANILLA_TOWN_CRITTER_SHEETS.has(300)).toBe(true);

    const plain = standCritter(world, 22);
    plain.rng = rngQ([0.5], 0.999);                  // 仅 base 一骰
    wanderUpdateFn.call(plain, world, makeGame(world).game, false);
    expect(priv(plain, 'walkT')).toBe(350);          // 非 critter 路径不吃 bonus（流位保持）
  });

  it('(a′-1)卡墙折返·critter：折返腿程 = base(499)+bonus(399)=898（cs:54795-97）', () => {
    const world = flatWorld('fix5-a10p-c');
    const st = world.store;
    // 脚部行【单层】唇墙：阻挡位移但不落入任何越障梯档（t5/t4 空、t3 半格口径
    // bottomSink=16px≤20 不受理）→ 零跳零转纯卡位，stuckT 稳定累计到 30 触发
    const n = new TownNPC('guide', 0, 0) as AnyNpc;
    placeOnFloor(world, n, 104);
    const fr = feetRowOf(n);
    expect(fr).toBe(FLOOR_ROW - 1);
    // stepUp 关断防"跨唇通过"；物理面把 X 钉死 → 卡位成立
    privSet(n, { vanillaId: 46, walkMode: 1, walkT: 30000, onGround: true, vx: 0.9, stepUp: false });
    n.facing = 1;
    for (let x = 106; x <= 110; x++) st.setTileSilent(x, fr, DIRT);
    const { game } = makeGame(world);
    n.rng = rngQ([], 0.999);                        // 恒定 fallback → base/bonus 值可复现
    let flipped = false;
    for (let t = 0; t < 400 && !flipped; t++) {
      n.fixedUpdate(1 / 60, game);
      flipped = n.facing === -1;
    }
    expect(flipped).toBe(true);
    expect(priv(n, 'walkT')).toBe(898);             // (200+299)+(200+199)
  });

  it('(a′-2)卡墙折返·非 critter 对照：仅 base 单写 → 499（流位保持）', () => {
    const world = flatWorld('fix5-a10p-p');
    const st = world.store;
    const n = new TownNPC('guide', 0, 0) as AnyNpc;   // guide=22 ∉ TownCritter
    placeOnFloor(world, n, 104);
    privSet(n, { walkMode: 1, walkT: 30000, onGround: true, vx: 0.9, stepUp: false });
    n.facing = 1;
    for (let x = 106; x <= 110; x++) st.setTileSilent(x, feetRowOf(n), DIRT);
    const { game } = makeGame(world);
    n.rng = rngQ([], 0.999);
    let flipped = false;
    for (let t = 0; t < 400 && !flipped; t++) {
      n.fixedUpdate(1 / 60, game);
      flipped = n.facing === -1;
    }
    expect(flipped).toBe(true);
    expect(priv(n, 'walkT')).toBe(499);             // base 单写（200+299）
  });

  it('(b)走→停双分支：critter −Next(100) → 400 / 非 critter +Next(900) → 900（流位保持）', () => {
    const world = flatWorld('fix5-a10b');
    const walker = (id: number, vals: number[]): AnyNpc => {
      const n = new TownNPC('guide', 0, 0) as AnyNpc;
      placeOnFloor(world, n, 130);
      privSet(n, { vanillaId: id, walkMode: 1, walkT: 1, onGround: true });
      n.facing = 1;
      n.rng = rngQ(vals, 0.999);
      return n;
    };
    const critter = walker(46, [0.5, 0.5]);
    wanderUpdateFn.call(critter, world, makeGame(world).game, false);
    expect(critter.walking).toBe(false);
    expect(priv(critter, 'walkT')).toBe(400);        // 300+150−50（减骰路径）
    expect(priv(critter, 'turnLock')).toBe(60);

    const plain = walker(22, [0.5, 0.5]);
    wanderUpdateFn.call(plain, world, makeGame(world).game, false);
    expect(priv(plain, 'walkT')).toBe(900);          // 300+150+450（加骰路径,逐骰逐值等价原文）
  });

  it('(c)第二乘子：干身 critter 起跳 −5×1.2（独立 if）；flag7 与普通城镇 NPC 不乘（grav 位换算）', () => {
    const world = flatWorld('fix5-a10c');
    const st = world.store;
    const caseRunner = (vanillaId: number | null): number => {
      const wx = flatWorld(`fix5-a10c-${vanillaId}`);
      const stx = wx.store;
      const n = new TownNPC('guide', 0, 0) as AnyNpc;
      placeOnFloor(wx, n, 102);
      const fr = feetRowOf(n);                        // 底贴地 → 本行 FLOOR_ROW−1
      stx.setTileSilent(103, fr - 1, DIRT);           // 二档门槛:t4 单独实心(t5 空,t3 空)
      void st;
      privSet(n, { walkMode: 1, walkT: 4000, onGround: true, vy: 0, vx: 1 });
      if (vanillaId !== null) n.vanillaId = vanillaId;
      n.facing = 1;
      const { game } = makeGame(wx);
      n.rng = rngQ([], 0.999);
      n.fixedUpdate(1 / 60, game);
      return priv(n, 'vy') as number;
    };
    // critter 46（非 flag7）：AI 内 -5→乘子→-6；物理 grav +0.3 → 终值 -5.7
    expect(Math.abs(caseRunner(46) + 5.7)).toBeLessThan(1e-6);
    // flag7 啮齿 300：乘子豁免 → -5+0.3=-4.7
    expect(Math.abs(caseRunner(300) + 4.7)).toBeLessThan(1e-6);
    // 普通 guide：无乘子 → -4.7
    expect(Math.abs(caseRunner(null) + 4.7)).toBeLessThan(1e-6);
  });
});
