// ★BJ549（2026-10-07 用户实报「角色进入岩浆后着火 buff 时只会扣血,没看到身上有火焰粒子效果」）
//
// ── 定谳（Terarria1457 亲读锚）──
//
// 原版玩家 OnFire 视觉全链：
//   ① 岩浆→OnFire 链：LavaCollision（Player.cs:27879-27883 flag25/lavaWet）→
//      hurtCooldowns[Lava]<=0 时 Hurt(80,ImmunityCooldownID.Lava)（:27888-27918,
//      remix 200/ashWood 再÷2/玫瑰 −45;num84 420/remix 630/各 −210）→
//      `num84 > 0 && num85 > 0.0` → AddBuff(24,num84)（:27919-27922）。
//      本仓 1:1 在 Player.ts 岩浆段（num83/num84 双档+OnFire 门字面,久已有）。
//   ② burning 视觉【无独立 overlay 贴图】：全树亲读——Player.cs onFire 零绘制
//      引用（仅字段/映射/重置/lifeRegen/湿洗/吸血鬼变身 15 处）;PlayerDrawLayers.cs
//      零 fire;燃烧视觉真身=PlayerDrawSet.cs DrawPlayerInner（:330 Position=drawPosition）
//      的【尘族火焰】+【色面】两通道（:1045-1094/:1239-1290）：
//        · onFire(24)（:1045-1083）：vampireSeed 特档（:1047-1066,shadow==0 无掷门,
//          每拍 5 粒 dust 6,盒 (Pos−2,w+10,h+10),vel=player.vel×0.4,α100,scale3 →
//          noGravity=true+vel×2.3+vy−0.8;首粒 vx×0.5/vy−1.5/noGravity=false/scale×0.4）
//          ;常规档（:1067-1078）`Main.rand.Next(4)==0 && shadow==0f` → 1 粒 dust 6：
//          盒 (Pos−2,w+4,h+4)、vel=player.vel×0.4、α100、scale3 → noGravity=true+
//          vel×1.8+vy−0.5。
//        · onFire3(323)（:1084-1094）=onFire 常规档逐值同（dust 6,scale3,vy−0.5）。
//        · burned(67)（:1239-1250）【无】Next(4) 掷门（shadow==0 每拍恒 1 粒）,
//          dust 6 scale2/vy−0.75（:1241-1246）。
//        · onFrostBurn(44)/onFrostBurn2(324)（:1253-1274）dust 135 掷门同（本仓无
//          该 buff 不挂）;onFire2(39)（:1279-1290）dust 75 掷门同。
//        · DustCache.Add（:1078/:1092/:1247/:1286）唯一消费=PlayerDrawLayers.cs:
//          4225 相机偏移补偿,无前后层级语义。
//        · 色面（:1448-1467）：onFire/onFire3/onFire2/onFrostBurn/onFrostBurn2 族
//          走 GetImmuneAlpha 支【不吃】buffColor 染色=保持本色（仅 iframes 闪烁/
//          shimmer 透明度通道）；burned 不在支内（:1252 num15×0.6/num14×0.7 染红,
//          本仓无 buffColor 绘制面,登记债不扩）。
//        · AddLight 面：玩家本体零 onFire AddLight（Player.cs 全量 grep 无锚）;
//          发光=dust 6 逐尘 AddLight + 亮色族 {6,15,59-64}（DrawDust :38406 强制
//          White,光照合成后绘制）。
//   ③ 原版尘出生链 Dust.NewDust（Dust.cs:75-285）：盒内位抖/速度抖 ±2.0/scale±0.2
//      抖/帧序——本仓 VanillaDust.spawn 1:1 既有（bj444 尘域闸门）。
//
// ── 本仓差异（用户实报根因）──
//   buff 链在（探针：入浆 45t 挂上 OnFire）,但粒子面=自制 spawnParticles 橙黄方块
//   （0.8/t、2-4px、α 随寿命衰减、无光照）——原版是 scale3 的 30px 火焰精灵动画
//   （10 帧羽化+逐尘 AddLight 自发光）,岩浆亮橙底上方块不可辨 =「只见扣血不见火」。
//   落刀：退役自制方块,改 game.dust.spawn 尘引擎口 1:1 端口（Player.ts BJ549 块,
//   即 BJ465 注释所指 Player.ts:4879 块的替身）。
//
// ── 变异证红（本文件,回归锚 BJ457/465/BJ444 沿用）──
//   M1 摘 onFire 常规档（掷门恒假）→ 「onFire 尘面钉值」红；
//   M2 摘 burned 无掷门（并入 1/4 门）→ 「burned 每拍恒发」红；
//   M3 摘后置速度修型（×1.8/vy−0.5）→ 「onFire 尘后置写钉值」红。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

const W = 80, H = 80;
const SURF = 30, FLOOR = SURF + 4;
const POOL_X0 = 30, POOL_X1 = 60;   // 液池带（液体面用）
const DRY_X = 10 * TILE;            // 干地站位（池带左侧实心地）

function makeWorld(name: string, liquidType: number | null): World {
  const w = new World(W, H, 11, name);
  const st = w.store;
  for (let x = 2; x < W - 2; x++) {
    st.setTile(x, FLOOR, 1);        // 全域地板（row FLOOR 顶=站面）
    if (liquidType !== null && x >= POOL_X0 && x < POOL_X1) {
      for (let y = SURF; y < FLOOR; y++) st.setLiquid(x, y, 255, liquidType);
    }
  }
  return w;
}

interface DustRec {
  x: number; y: number; w: number; h: number;
  type: number; sx: number; sy: number; alpha: number; scale: number;
  post: { noGravity: boolean; vx: number; vy: number };
}

function makePlayer(w: World, damage = 80) {
  const p = new Player(DRY_X, (SURF - 9) * TILE, new Inventory());
  p.hp = 500;
  const partLog: Array<{ x: number; y: number; color: string; count: number }> = [];
  const dustLog: DustRec[] = [];
  const hooks = {
    world: w, player: p, enemies: () => [], critters: () => [], npcs: () => [],
    damagePlayer: (): number => damage,
    spawnDrop: () => null, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: (x: number, y: number, color: string, count: number) => {
      partLog.push({ x, y, color, count });
    },
    dust: {
      spawn: (x: number, y: number, bw: number, bh: number, type: number,
        sx = 0, sy = 0, alpha = 0, _color: unknown = null, scale = 1) => {
        const post = { noGravity: false, vx: 10, vy: 10 };   // 非零基值→后置修型可证
        dustLog.push({ x, y, w: bw, h: bh, type, sx, sy, alpha, scale, post });
        return post;
      },
    },
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
  } as unknown as GameHooks;
  return { p, hooks, partLog, dustLog };
}

/** 逐拍推进 n 拍 */
function ticks(p: Player, hooks: GameHooks, n: number): void {
  for (let t = 0; t < n; t++) p.fixedUpdate(1 / 60, hooks);
}

/** 干地落定（站面静止,y 收敛）——落定后抬满生命上限+回满（坠落摔伤+DoT 面烧死玩家=死亡清 buff 干扰钉值） */
function settleDry(p: Player, hooks: GameHooks): void {
  ticks(p, hooks, 120);
  (p as unknown as { baseMaxHp: number }).baseMaxHp = 500;
  p.hp = 500;
  expect(p.onGround, '夹具前置：干地必须落定').toBe(true);
  expect(p.inLava).toBe(false);
  expect(p.inWater).toBe(false);
}

describe('BJ549 岩浆→OnFire 视觉链（①buff 链 ②粒子面钉值 ③overlay 形态 ④非 OnFire 面）', () => {
  it('①岩浆接触→OnFire 链：入浆即挂 buff（Hurt>0 门字面 :27919-27922）', () => {
    const w = makeWorld('bj549-chain', 2);
    const { p, hooks } = makePlayer(w);
    p.x = 44 * TILE; p.y = (SURF - 9) * TILE;   // 掷入岩浆池带
    let sawLava = false, buffTick = -1;
    for (let t = 0; t < 600; t++) {
      p.fixedUpdate(1 / 60, hooks);
      sawLava = sawLava || p.inLava;
      if (buffTick < 0 && p.buffs.has(BuffType.OnFire)) buffTick = t;
    }
    expect(sawLava, '玩家必须实际接触岩浆（inLava 全盒探针）').toBe(true);
    expect(buffTick, '岩浆接触必须挂上 OnFire(24)').toBeGreaterThanOrEqual(0);
    expect(p.buffs.has(BuffType.OnFire), '浸浆期间 buff 恒续期').toBe(true);
  });

  it('①b Hurt=0 拒收面：damagePlayer 返 0 → 不挂火（num85>0.0 字面）', () => {
    const w = makeWorld('bj549-chain0', 2);
    const { p, hooks } = makePlayer(w, 0);
    p.x = 44 * TILE;
    for (let t = 0; t < 600; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.inLava).toBe(true);
    expect(p.buffs.has(BuffType.OnFire), 'Hurt 返 0 → AddBuff(24) 不发生').toBe(false);
  });

  it('②onFire 尘面钉值：dust 6/盒±2/α100/scale3/vel×0.4 传参+noGravity/×1.8/vy−0.5 后置写+1/4 掷门', () => {
    const w = makeWorld('bj549-dustpin', 1);
    const { p, hooks, dustLog, partLog } = makePlayer(w);
    settleDry(p, hooks);
    dustLog.length = 0; partLog.length = 0;
    p.buffs.apply(BuffType.OnFire, 10);        // 直接挂火（干地站定,排除液体干扰）
    ticks(p, hooks, 300);
    expect(p.buffs.has(BuffType.OnFire), '干地 300 拍 buff 恒在（10s 档）').toBe(true);
    expect(dustLog.length, '300 拍×1/4 掷门≈75 粒（松界 8%-45% 防 RNG 抖动）')
      .toBeGreaterThan(300 * 0.08);
    expect(dustLog.length).toBeLessThan(300 * 0.45);
    for (const r of dustLog) {
      expect(r.type, '尘型钉值=dust 6 火焰（:1070）').toBe(6);
      expect(r.x, '盒原点=Position−2（:1070）').toBe(p.x - 2);
      expect(r.y).toBe(p.y - 2);
      expect(r.w, '盒宽=width+4（:1070）').toBe(p.w + 4);
      expect(r.h).toBe(p.h + 4);
      expect(r.alpha, 'alpha=100（:1070）').toBe(100);
      expect(r.scale, 'scale=3f（:1070）').toBe(3);
      expect(r.sx, '初速=player.velocity.X×0.4（:1070）').toBe(p.vx * 0.4);
      expect(r.sy).toBe(p.vy * 0.4);
      expect(r.post.noGravity, '后置 noGravity=true（:1075）').toBe(true);
      expect(r.post.vx, '后置 vel×1.8（:1076）=10×1.8').toBe(18);
      expect(r.post.vy, '后置 vy×1.8−0.5（:1076-77）=10×1.8−0.5').toBe(17.5);
    }
    // ③overlay 形态面：燃烧不再产生任何自制 spawnParticles 方块（干地无溅花源）
    expect(partLog.length, '原版燃烧无 overlay 贴图/无自制方块=尘族火焰全责').toBe(0);
  });

  it('②b burned(67) 面钉值：无掷门每拍恒发、scale2/vy−0.75（:1239-1250）', () => {
    const w = makeWorld('bj549-burned', 1);
    const { p, hooks, dustLog } = makePlayer(w);
    settleDry(p, hooks);
    dustLog.length = 0;
    p.buffs.apply(BuffType.Burning, 10);
    ticks(p, hooks, 100);
    expect(p.buffs.has(BuffType.Burning)).toBe(true);
    expect(dustLog.length, 'burned 无 Next(4) 掷门=每拍恒 1 粒（:1240）').toBe(100);
    for (const r of dustLog) {
      expect(r.type).toBe(6);
      expect(r.scale, 'burned scale=2f（:1241）').toBe(2);
      expect(r.post.vy, 'vy×1.8−0.75（:1245-46）').toBe(17.25);
      expect(r.post.noGravity).toBe(true);
    }
  });

  it('②c onFire3(323)/onFire2(39)/onFrostBurn(44/324) 族钉值：dust 6 同档 / dust 75 / dust 135（:1084-1094/:1279-1290/:1253-1274）', () => {
    const w = makeWorld('bj549-family', 1);
    const { p, hooks, dustLog } = makePlayer(w);
    settleDry(p, hooks);
    dustLog.length = 0;
    p.buffs.apply(BuffType.OnFire3, 10);
    p.buffs.apply(BuffType.CursedInferno, 10);
    p.buffs.apply(BuffType.Frostburn, 10);
    p.buffs.apply(BuffType.Frostburn2, 10);
    ticks(p, hooks, 400);
    expect(p.buffs.has(BuffType.OnFire3)).toBe(true);
    expect(p.buffs.has(BuffType.CursedInferno)).toBe(true);
    const fire3 = dustLog.filter(r => r.type === 6 && r.scale === 3 && r.post.vy === 17.5);
    const cursed = dustLog.filter(r => r.type === 75 && r.scale === 3 && r.post.vy === 17.5);
    const frost = dustLog.filter(r => r.type === 135 && r.scale === 3 && r.post.vy === 17.5);
    expect(fire3.length, 'onFire3→dust 6 scale3 vy−0.5（与 onFire 常规档逐值同）').toBeGreaterThan(0);
    expect(cursed.length, 'onFire2→dust 75（:1281）').toBeGreaterThan(0);
    expect(frost.length, 'onFrostBurn 族→dust 135（:1257/:1270）').toBeGreaterThan(0);
    for (const r of cursed) expect(r.post.vx).toBe(18);
    for (const r of frost) expect(r.post.vx).toBe(18);
  });

  it('②d vampireSeed 特档：每拍 5 粒、盒+10、首粒 noGravity=false/scale1.2（:1047-1066）', () => {
    const w = makeWorld('bj549-vampire', 1);
    w.seedFlags = { ...w.seedFlags, vampireSeed: true };
    const { p, hooks, dustLog } = makePlayer(w);
    settleDry(p, hooks);
    dustLog.length = 0;
    p.buffs.apply(BuffType.OnFire, 10);
    ticks(p, hooks, 20);
    expect(p.buffs.has(BuffType.OnFire)).toBe(true);
    expect(dustLog.length, 'vampireSeed=每拍恒 5 粒（无 1/4 掷门,:1049-1051）').toBe(100);
    for (let i = 0; i < dustLog.length; i++) {
      const r = dustLog[i];
      expect(r.w, '特档盒=width+10（:1050）').toBe(p.w + 10);
      expect(r.h).toBe(p.h + 10);
      expect(r.alpha).toBe(100);
      if (i % 5 === 0) {
        expect(r.scale, '首粒 scale=3×0.4（:1061）').toBe(1.2);
        expect(r.post.noGravity, '首粒 noGravity=false（:1060）').toBe(false);
        expect(r.post.vy, '首粒 10×2.3−0.8−1.5（:1056-57/:1059）').toBe(20.7);
      } else {
        expect(r.scale).toBe(3);
        expect(r.post.noGravity).toBe(true);
        expect(r.post.vy, '余粒 10×2.3−0.8').toBe(22.2);
      }
    }
  });

  it('④非 OnFire 面不回归：干地无 buff 零火尘;入水熄火链（RB20a F6①）保持', () => {
    const w = makeWorld('bj549-nonfire', 1);
    const { p, hooks, dustLog } = makePlayer(w);
    settleDry(p, hooks);
    expect(dustLog.filter(r => r.type === 6 || r.type === 75).length, '干地无 buff 零火尘').toBe(0);
    expect(p.buffs.has(BuffType.OnFire)).toBe(false);
    // 入水熄火：挂火→掷入水池→湿洗双清（num86∧!lavaWet :27961-27970）
    p.buffs.apply(BuffType.OnFire, 10);
    expect(p.buffs.has(BuffType.OnFire)).toBe(true);
    p.x = 44 * TILE; p.y = (SURF - 6) * TILE; p.vy = 60;   // 掷入水池
    let exting = false;
    for (let t = 0; t < 240 && !exting; t++) {
      p.fixedUpdate(1 / 60, hooks);
      exting = !p.buffs.has(BuffType.OnFire);
    }
    expect(exting, '入水必须熄火（湿洗面在位）').toBe(true);
  });
});
