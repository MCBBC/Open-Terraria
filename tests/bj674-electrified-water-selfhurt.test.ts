// ★BJ674（2026-10-14 用户实报「角色被闪电之击在水里不会被电击到？而且角色被电击的话
// 我记得会有电击效果」）——两面定谳+落刀判别锁。
//
// ── 定谳（Terarria1457 亲读锚）──
//
// 面①「水里不被电」：原版 1.4.5.7【有】浸液导通+自伤全链（非玩家误期）：
//   · Projectile.Kill type 1091||1117 支（:71922-71975）：bolt 生成后
//     `localAI[0] = flag8 ? 1 : 2`（:71944,1117 武器 generator solidTileCollision=
//     false ⇒ 恒 1;1091 世界雷=2 可能）;落点格 `tileSafely.liquid != 0` →
//     **localAI[0]=3 + SpawnLightningLiquidElectrificationParticles()**（:71950-71952,
//     40 条放射 PlotLine 半径 500 只走液体格逐格 1/4 白光,:80276-80296）→
//     Damage()（:71959）→ `if (localAI[0]==3f && type==1117 && owner==Main.myPlayer)
//     SelfHurtPlayers();`（:71960-71961）。
//   · SelfHurtPlayers（:15104-15151）：active/dead/immune 门 → Colliding(Hitbox,
//     player.Hitbox)（:15109）→ aiStyle203 分流（:15954-15965）→
//     StormLightningCollisionCheck（:16205-16243）＝爆域(localAI0==1)/液体导通
//     (localAI0==3,Distance<500+PlotLine 全液体,:16237-16242)/MultiPointHitbox
//     bolt 折线 三门 OR → FixedSelfDamageForPlayers[1117] 无条目（ProjectileID.cs:
//     193 表=墓石族）→ DamageVar(value,−luck)（:15118）→ flag=!hostile&&type!=949
//     =true（1117 friendly,:15124）→ Hurt(pvp=true) → `Hurt>0 && !dead` →
//     StatusPlayer（:15133-15134）→ 1117→ApplyBuffTo(399, 60×Next(4,8))（:12144-
//     12146,BlueLightning=BuffID 399,BuffID.cs:969）。
//   · 1091 世界雷（风暴天气）对玩家：Damage_EVP（:14846-14949）+同款液体导通
//     命中,但 StatusPlayer 无 1091 表项 → 零 buff（本仓 proj1457.ts 1091 EVP 面
//     既有实装,不在本锁面）。
//   ──本仓病根：proj1457.ts doKill 浸液支只到「导通对 NPC/玩家(1091)」,1117 的
//     SelfHurtPlayers 整面缺位（登记债「本仓玩家弹不伤主」）=用户实报根因。
//     落刀=liquidSelfHurt 标记 + selfHurtPlayers()（Damage() 后,原版 :71959→
//     :71961 序）。
//
// 面②「被电击应有电击视觉」：原版玩家感电视觉三通道（全部缺位,落刀）：
//   · 尘 226（PlayerDrawSet.cs:1214-1219）:electrified∧shadow==0∧Next(3)==0 →
//     dust 226 盒(Position−2,w+4,h+4)/α100/scale0.5 → vel×1.6+vy−1+
//     position=Lerp(pos,Center,0.5);
//   · 点光（Player.cs:10402-10405）:buff 144 每拍 Lighting.AddLight(center,
//     0.3,0.8,1.1);
//   · 电弧层（PlayerDrawLayers.cs:260-281 04_ElectrifiedDebuffBack/:4020-4040
//     34_ElectrifiedDebuffFront）:GlowMask[25]（Glow_25.png 34×308=34×44×7 竖帧,
//     GlowMaskID.cs:59 Electrified=25）,num=miscCounter/5 两迭代 {%7,+3},Back 帧门
//     {0,1,5,6}/Front 帧门 {2,3,4},色 colorElectricity=(255,255,255,100)
//     （PlayerDrawSet.cs:456）,锚=bodyFrame(40×56,Player.cs:56698-56699)中心;
//   · 蓝雷粒子（PlayerDrawSet.cs:1222-1229,BlueLightning buff=399——1117 自伤
//     施加）:1/10 → BlueLightningSmall 编排（MovementVector=Circular(1,1)、
//     Position=盒内随机点）;红雷（:1230-1239,RedLightning=400）同构 +
//     UniqueInfo=GetLightningColor(1122)=(255,60,60)。
//
// ── 变异证红（本文件）──
//   M1 摘 1117 自伤（liquidSelfHurt 不置/方法空转）→ A1 红;
//   M2 摘液体导通门（stormBoltCollides localAI0==3 支）→ A1/A3 红;
//   M3 摘 StatusPlayer 尾（dealt>0 不挂 buff）→ A1b 蓝 buff 断言红;
//   M4 摘尘 226 支/后置修型 → B1 红;M5 摘点光 → B2 红;M6 摘电弧层 → C2/C3 红;
//   M7 摘蓝雷粒子支 → B3 红。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';
import { StormLightning } from '../src/entities/proj1457';
import { Renderer, electrifiedArcPhases } from '../src/render/Renderer';

const W = 140, H = 120;
const POOL_X0 = 60, POOL_X1 = 92;      // 水池带
const POOL_TOP = 38, POOL_BOT = 46;    // 液体行带（下有地板）
const FLOOR = POOL_BOT;                // 地板行=池底

function makeWorld(name: string, wet: boolean): World {
  const w = new World(W, H, 11, name);
  const st = w.store;
  for (let x = 2; x < W - 2; x++) {
    st.setTile(x, FLOOR, 1);           // 全域地板（池底+干地同高）
    if (wet && x >= POOL_X0 && x < POOL_X1) {
      for (let y = POOL_TOP; y < POOL_BOT; y++) st.setLiquid(x, y, 255, 1);
    }
  }
  return w;
}

interface DustRec {
  x: number; y: number; w: number; h: number;
  type: number; sx: number; sy: number; alpha: number; scale: number;
  post: { noGravity: boolean; vx: number; vy: number; x: number; y: number };
}
interface LightRec { x: number; y: number; r: number; g: number; b: number }
interface PartRec { x: number; y: number; color: string }
interface DmgRec { dmg: number; x: number; y: number; pvp: boolean; ret: number }

function makePlayer(w: World, px: number, py: number) {
  const p = new Player(px, py, new Inventory());
  p.hp = 500;
  const dustLog: DustRec[] = [];
  const lightLog: LightRec[] = [];
  const partLog: PartRec[] = [];
  const ldustLog: Array<{ x: number; y: number; type: number }> = [];
  const dmgLog: DmgRec[] = [];
  const hooks = {
    world: w, player: p, enemies: () => [], critters: () => [], npcs: () => [],
    projectiles: () => [],
    damagePlayer: (dmg: number, x: number, y: number, _a: unknown, _c: boolean, pvp: boolean): number => {
      dmgLog.push({ dmg, x, y, pvp, ret: 25 });
      return 25;
    },
    spawnDrop: () => null, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: (x: number, y: number, color: string) => { partLog.push({ x, y, color }); },
    addLightAt: (x: number, y: number, r: number, g: number, b: number) => {
      lightLog.push({ x, y, r, g, b });
    },
    dust: {
      spawn: (x: number, y: number, bw: number, bh: number, type: number,
        sx = 0, sy = 0, alpha = 0, _color: unknown = null, scale = 1) => {
        const post = { noGravity: false, vx: 10, vy: 10, x, y };   // 非零基值→后置修型可证
        dustLog.push({ x, y, w: bw, h: bh, type, sx, sy, alpha, scale, post });
        return post;
      },
    },
    spawnDust: (x: number, y: number, _bw: number, _bh: number, type: number) => {
      ldustLog.push({ x, y, type });
      return null;
    },
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {}, playSfxAt: () => {},
  } as unknown as GameHooks;
  return { p, hooks, dustLog, lightLog, partLog, ldustLog, dmgLog };
}

/** 1117 出生并跑满寿命触发 Kill 帧（life=30,视觉余命后 dead） */
function fireBolt1117(hooks: GameHooks, cx: number, cy: number, damage = 50): StormLightning {
  const bolt = new StormLightning(1117, cx, cy, damage, 2);
  bolt.critChance = 0;
  for (let i = 0; i < 30 + 60 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, hooks);
  return bolt;
}

// ================= 面①：1117 浸液自伤（SelfHurtPlayers :15104-15151） =================

describe('BJ674 面①:1117 浸液落雷自伤（Kill :71960-71961 → SelfHurtPlayers）', () => {
  it('A1 落点入水+玩家同池浸没 → 自伤(DamageVar 伤,pvp=true)+BlueLightning(399) 挂 buff', () => {
    const w = makeWorld('bj674-selfhurt', true);
    // 玩家浸没池内（池带 x∈[60,92) 行∈[38,46)）;1117 落点同池
    const px = 70 * TILE, py = (POOL_TOP + 1) * TILE;
    const { p, hooks, dmgLog } = makePlayer(w, px, py);
    p.vy = 0; p.vx = 0;
    // 落点=玩家同列池底上一格（液体格）,同池 <500px + PlotLine 全液体
    fireBolt1117(hooks, 70 * TILE + 8, (POOL_BOT - 1) * TILE + 8);
    expect(dmgLog.length, '浸液落雷必须自伤玩家（SelfHurtPlayers :71961）').toBe(1);
    expect(dmgLog[0].pvp, 'flag=!hostile&&type!=949=true（:15124）→ Hurt pvp 参').toBe(true);
    expect(dmgLog[0].dmg, '伤=DamageVar(damage,−luck) ±15% 档（:15118）').toBeGreaterThanOrEqual(43);
    expect(dmgLog[0].dmg).toBeLessThanOrEqual(57);
    // StatusPlayer → 1117→buff 399 BlueLightning 60×Next(4,8)t=4-7s（:12144-12146）
    expect(p.buffs.has(BuffType.BlueLightning), 'Hurt>0&&!dead → StatusPlayer → 蓝雷 buff').toBe(true);
  });

  it('A1b dealt=0（无敌帧吞）→ 不挂 BlueLightning（Hurt>0 门字面 :15133-15134）', () => {
    const w = makeWorld('bj674-selfhurt0', true);
    const px = 70 * TILE, py = (POOL_TOP + 1) * TILE;
    const { p, hooks } = makePlayer(w, px, py);
    // damagePlayer 恒返 0（Hurt 返回 0 语义）
    (hooks as unknown as { damagePlayer: () => number }).damagePlayer = () => 0;
    fireBolt1117(hooks, 70 * TILE + 8, (POOL_BOT - 1) * TILE + 8);
    expect(p.buffs.has(BuffType.BlueLightning), 'Hurt=0 → StatusPlayer 不发生').toBe(false);
  });

  it('A2 干地落点（贴身玩家）→ 零自伤（SelfHurtPlayers 仅 localAI[0]==3 浸液面）', () => {
    const w = makeWorld('bj674-dry', false);
    const px = 30 * TILE, py = (FLOOR - 3) * TILE;
    const { hooks, dmgLog } = makePlayer(w, px, py);
    // 落点=玩家身位（bolt 折线可穿身）但干地无液 → localAI0=1（爆域面,非自伤门）
    fireBolt1117(hooks, px + 10, py + 21);
    expect(dmgLog.length, '干地 1117 永不伤玩家（自伤仅浸液落点,:71960 门）').toBe(0);
  });

  it('A3 落点入水但玩家隔池/超 500px → 零自伤（导通门 :16237-16242 距离+全液体 PlotLine）', () => {
    const w = makeWorld('bj674-far', true);
    // 玩家在池右远处干地站（池带只到 x<92;玩家 x=120 干地）
    const px = 120 * TILE, py = (FLOOR - 3) * TILE;
    const { hooks, dmgLog } = makePlayer(w, px, py);
    fireBolt1117(hooks, 70 * TILE + 8, (POOL_BOT - 1) * TILE + 8);
    expect(dmgLog.length, '非连通/超距 → Colliding 液体导通门拒（:16240-16241）').toBe(0);
  });
});

// ================= 面②：感电视觉三通道（PlayerDrawSet:1214-1239 + Player.cs:10402） =================

describe('BJ674 面②:感电/蓝雷玩家视觉（PlayerDrawSet.cs:1214-1239 亲读）', () => {
  /** 干地落定（站面静止）——落定后抬满生命上限+回满 */
  function settleDry(p: Player, hooks: GameHooks): void {
    for (let t = 0; t < 120; t++) p.fixedUpdate(1 / 60, hooks);
    (p as unknown as { baseMaxHp: number }).baseMaxHp = 500;
    p.hp = 500;
    expect(p.onGround, '夹具前置：干地必须落定').toBe(true);
    expect(p.inWater).toBe(false);
  }

  it('B1 electrified 尘 226：1/3 掷门+盒±2/α100/scale0.5+vel×1.6/vy−1+Lerp 心 0.5', () => {
    const w = makeWorld('bj674-dust', false);
    const { p, hooks, dustLog } = makePlayer(w, 30 * TILE, (FLOOR - 3) * TILE);
    settleDry(p, hooks);
    dustLog.length = 0;
    p.buffs.apply(BuffType.Electrified, 10);        // 10s=600 拍
    for (let t = 0; t < 300; t++) p.fixedUpdate(1 / 60, hooks);
    const elec = dustLog.filter(r => r.type === 226);
    expect(elec.length, '300 拍×1/3 掷门≈100 粒（松界 15%-60% 防 RNG 抖动）')
      .toBeGreaterThan(300 * 0.15);
    expect(elec.length).toBeLessThan(300 * 0.6);
    for (const r of elec) {
      expect(r.x, '盒原点=Position−2（:1215）').toBe(p.x - 2);
      expect(r.y).toBe(p.y - 2);
      expect(r.w, '盒宽=width+4（:1215）').toBe(p.w + 4);
      expect(r.h).toBe(p.h + 4);
      expect(r.alpha, 'alpha=100（:1215）').toBe(100);
      expect(r.scale, 'scale=0.5f（:1215）').toBe(0.5);
      expect(r.post.vx, '后置 vel×1.6（:1216）=10×1.6').toBe(16);
      expect(r.post.vy, '后置 vy×1.6−1（:1216-1217）=10×1.6−1').toBe(15);
      // position=Lerp(pos, Center, 0.5)（:1218）——pos=尘出生位（stub=盒原点）
      expect(r.post.x, 'Lerp(pos,Center,0.5) X 面').toBeCloseTo(r.x + (p.cx - r.x) * 0.5, 6);
      expect(r.post.y, 'Lerp(pos,Center,0.5) Y 面').toBeCloseTo(r.y + (p.cy - r.y) * 0.5, 6);
    }
    // 判别：buff 期满后尘面停（10s=600 拍,300+400=700 拍后必过期）
    for (let t = 0; t < 400; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.buffs.has(BuffType.Electrified), '夹具前置：buff 已到期').toBe(false);
    const before = dustLog.length;
    for (let t = 0; t < 60; t++) p.fixedUpdate(1 / 60, hooks);
    expect(dustLog.length - before, 'buff 期满后尘面停').toBe(0);
  });

  it('B2 electrified 逐拍点光：AddLight(cx,cy,0.3,0.8,1.1)（Player.cs:10404）', () => {
    const w = makeWorld('bj674-light', false);
    const { p, hooks, lightLog } = makePlayer(w, 30 * TILE, (FLOOR - 3) * TILE);
    settleDry(p, hooks);
    lightLog.length = 0;
    p.buffs.apply(BuffType.Electrified, 2);
    const ticks = 60;
    for (let t = 0; t < ticks; t++) p.fixedUpdate(1 / 60, hooks);
    const elecLight = lightLog.filter(l => l.r === 0.3 && l.g === 0.8 && l.b === 1.1);
    expect(elecLight.length, 'buff 期内每拍一盏感电光（UpdateBuffs 循环内）').toBe(ticks);
    for (const l of elecLight) {
      expect(l.x).toBeCloseTo(p.cx, 5);
      expect(l.y).toBeCloseTo(p.cy, 5);
    }
  });

  it('B3 BlueLightning/RedLightning 编排粒子：1/10 掷门+蓝 (133,255,255)/(15,100,155) 红 (255,60,60)+伴生尘 226/331', () => {
    const w = makeWorld('bj674-blue', false);
    const { p, hooks, partLog, ldustLog } = makePlayer(w, 30 * TILE, (FLOOR - 3) * TILE);
    settleDry(p, hooks);
    partLog.length = 0; ldustLog.length = 0;
    p.buffs.apply(BuffType.BlueLightning, 10);
    p.buffs.apply(BuffType.RedLightning, 10);
    for (let t = 0; t < 600; t++) p.fixedUpdate(1 / 60, hooks);
    // BlueLightningSmall（:1223-1228）：colA=(133,255,255)/colB=(15,100,155)（P57:3625-3641）
    const blue = partLog.filter(q =>
      q.color === 'rgba(133,255,255,255)' || q.color === 'rgba(15,100,155,255)');
    // RedLightningSmall（:1231-1238）：UniqueInfo=GetLightningColor(1122)→(255,60,60)
    //   （packedCss α 面 toFixed(3) 格式='rgba(255,60,60,1.000)'）
    const red = partLog.filter(q => q.color === 'rgba(255,60,60,1.000)');
    expect(blue.length, '600 拍×1/10≈60 组（松界 2%-25%）').toBeGreaterThan(600 * 0.02);
    expect(blue.length).toBeLessThan(600 * 0.25);
    expect(red.length, '红雷同构 1/10').toBeGreaterThan(600 * 0.02);
    for (const q of [...blue, ...red]) {
      expect(q.x, 'PositionInWorld=NextVector2FromRectangle(Hitbox)（:1225/:1233）')
        .toBeGreaterThanOrEqual(p.x - 0.01);
      expect(q.x).toBeLessThanOrEqual(p.x + p.w + 0.01);
      expect(q.y).toBeGreaterThanOrEqual(p.y - 0.01);
      expect(q.y).toBeLessThanOrEqual(p.y + p.h + 0.01);
    }
  });
});

// ================= 面②：电弧层相位表+绘制（PlayerDrawLayers.cs:260-281/:4020-4040） =================

describe('BJ674 电弧层相位表（electrifiedArcPhases——num=misc/5 两迭代 {%7,+3}）', () => {
  it('C1 七相位全循环钉值：Back 帧门{0,1,5,6}/Front 帧门{2,3,4}（:269/:4029 门字面）', () => {
    // misc=0: p0=0(Back) p1=3(Front)
    expect(electrifiedArcPhases(0, 'back')).toEqual([0]);
    expect(electrifiedArcPhases(0, 'front')).toEqual([3]);
    // misc=10: p0=2(Front) p1=5(Back)
    expect(electrifiedArcPhases(10, 'front')).toEqual([2]);
    expect(electrifiedArcPhases(10, 'back')).toEqual([5]);
    // misc=15: p0=3(Front) p1=6(Back)
    expect(electrifiedArcPhases(15, 'front')).toEqual([3]);
    expect(electrifiedArcPhases(15, 'back')).toEqual([6]);
    // misc=20: p0=4(Front) p1=0(Back)（(4+3)%7=0）
    expect(electrifiedArcPhases(20, 'front')).toEqual([4]);
    expect(electrifiedArcPhases(20, 'back')).toEqual([0]);
    // misc=25: p0=5(Back) p1=1(Back)——Front 空相
    expect(electrifiedArcPhases(25, 'back')).toEqual([5, 1]);
    expect(electrifiedArcPhases(25, 'front')).toEqual([]);
    // 35 拍全循环（7 相位×5）
    expect(electrifiedArcPhases(35, 'back')).toEqual(electrifiedArcPhases(0, 'back'));
    // 全域无重叠：Back∪Front 两迭代相位恒 ≤2 帧且互不重复
    for (let m = 0; m < 35; m++) {
      const b = electrifiedArcPhases(m, 'back'), f = electrifiedArcPhases(m, 'front');
      expect(b.length + f.length, '每拍总出弧数恒 ≤2（两迭代）').toBeLessThanOrEqual(2);
      for (const n of b) expect(n <= 1 || n >= 5, `Back 帧 ${n} 必在门 {0,1,5,6}`).toBe(true);
      for (const n of f) expect(n > 1 && n < 5, `Front 帧 ${n} 必在门 {2,3,4}`).toBe(true);
    }
  });

  it('C2 绘制钉值：Glow_25 帧条 34×308/7 源矩形、帧中心锚 (0,4−28)、α=100/255 常色（:271-280）', () => {
    // 记录型伪 ctx（node 无真 DOM——bj112c 同款最小桩;绘制参数=判别面）
    const calls: Array<{ src: number[]; dst: number[]; alpha: number }> = [];
    let alphaNow = 1;
    const fakeCtx = {
      save(): void { /* noop */ },
      restore(): void { alphaNow = 1; },
      get globalAlpha(): number { return alphaNow; },
      set globalAlpha(v: number) { alphaNow = v; },
      drawImage(_tex: unknown, sx: number, sy: number, sw: number, sh: number,
        dx: number, dy: number, dw: number, dh: number): void {
        calls.push({ src: [sx, sy, sw, sh], dst: [dx, dy, dw, dh], alpha: alphaNow });
      },
    } as unknown as CanvasRenderingContext2D;
    const tex = { width: 34, height: 308 };        // Glow_25.png 实测尺寸（34×44×7）
    // misc=0 Back → 帧 0：src=(0,0,34,44) dst=(−17,−46,34,44)（帧中心 cy=4−28=−24）
    drawElectrifiedArcFrames(fakeCtx, tex, 0, 'back');
    expect(calls.length).toBe(1);
    expect(calls[0].src, '帧 0 源矩形（num×高/7=0）').toEqual([0, 0, 34, 44]);
    expect(calls[0].dst, '锚=帧中心 (0,pad−FRAME_H/2),origin=(fw/2,fh/2)').toEqual([-17, -46, 34, 44]);
    expect(calls[0].alpha, 'colorElectricity A=100（PlayerDrawSet.cs:456）').toBeCloseTo(100 / 255, 6);
    // misc=0 Front → 帧 3：src=(0,132,34,44) 同锚
    calls.length = 0;
    drawElectrifiedArcFrames(fakeCtx, tex, 0, 'front');
    expect(calls.length).toBe(1);
    expect(calls[0].src, '帧 3 源矩形（3×44=132）').toEqual([0, 132, 34, 44]);
    expect(calls[0].dst).toEqual([-17, -46, 34, 44]);
    // misc=25：Back 两帧（5,1）/Front 空相零绘制（帧门判别）
    calls.length = 0;
    drawElectrifiedArcFrames(fakeCtx, tex, 25, 'back');
    expect(calls.map(c => c.src[1] / 44), 'Back 帧门 {0,1,5,6}').toEqual([5, 1]);
    calls.length = 0;
    drawElectrifiedArcFrames(fakeCtx, tex, 25, 'front');
    expect(calls.length, 'Front 空相零绘制').toBe(0);
    // 贴图缺位（ensureVImage null）→ 零绘制安全跳过
    calls.length = 0;
    drawElectrifiedArcFrames(fakeCtx, null, 0, 'back');
    expect(calls.length).toBe(0);
  });

  it('C3 接线锚：drawPlayer 两层调用位（04 在背包/翼前=身后族之下;34 在身前配饰后 body save 内）', () => {
    const src = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
    const backCall = src.indexOf("this.drawElectrifiedArcLayer(ctx, p, 'back')");
    const frontCall = src.indexOf("this.drawElectrifiedArcLayer(ctx, p, 'front')");
    expect(backCall, 'Back 层调用存在').toBeGreaterThan(-1);
    expect(frontCall, 'Front 层调用存在').toBeGreaterThan(-1);
    const backpack = src.indexOf('this.drawAccBackpackTailLayers(ctx, p, accRows');
    const frontAcc = src.indexOf('this.drawAccFrontLayers(ctx, p, accRows');
    expect(backpack, '夹具锚：背包层调用位').toBeGreaterThan(-1);
    expect(frontAcc, '夹具锚：身前配饰层调用位').toBeGreaterThan(-1);
    // Back 在背包层（08）之前 = 原版 04<08 层序（背包/翼/身后配饰之下）
    expect(backCall, 'Back 弧在背包层前（04<08）').toBeLessThan(backpack);
    // Front 在身前配饰层（32）之后 = 原版 34>32 层序
    expect(frontCall, 'Front 弧在身前配饰后（34>32）').toBeGreaterThan(frontAcc);
    // 贴图键钉值：GlowMask[25]=vanilla/Glow_25.png
    expect(src).toContain("ensureVImage('vanilla/Glow_25.png')");
  });
});
