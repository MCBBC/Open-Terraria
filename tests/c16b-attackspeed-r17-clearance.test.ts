// C16b 攻速链域清偿（红蓝 R17 F1-F5,2026-10-12）。标杆 Terarria1457 逐行亲读：
//   F1(MED) 悠悠球命中烧寿命除数：Projectile.cs:13323-13333 命中烧 = localAI[0] += 20f
//       （:13327）/无视线 +40f（:13330）【无除式】,除式只在寿命换算 :68803
//       `num /= (1f + Main.player[owner].meleeSpeed) / 2f`——meleeSpeed 字段 =
//       CapAttackSpeeds 倒数档 M（:26176 每拍先翻转）= 本仓 attackSpeedMult（Player.ts
//       attackSpeedMult getter :29260-29266 镜像）。本仓预除模型两站（每拍 :3514 /
//       命中 :3807）必须同 M——旧命中站 vms=1/(attackSpeedMult||1)=攻速和,正加成下
//       (1+1/M)/2>1 烧得慢=方向反。行段锚 :12501→:13323-13333 勘正。
//   F2(MED) 叶绿 1126 孢子掷率双重还原：Projectile.cs:42928
//       `Main.rand.Next((int)Utils.Remap(player.meleeSpeed, 1f, 1f/3f, 4f, 2f)) == 0`
//       直读 meleeSpeed 字段（=M）+ (int) 截断——旧式 ms=1/M（攻速和,正加成下恒饱和
//       remap=4=掷率不随攻速升）+ Math.round（2.5→3 非 2）。1127 先例 = Game.ts
//       `Remap(meleeSpeed,1,1/3,1,0.25)` 直取 attackSpeedMult（:47752）。
//   F3(LOW) 矛/锚定支出膛 ×ps.size 摘除：Player.cs:47466 `speed = sItem.shootSpeed`
//       → :47469 /=meleeSpeed,全程无 size 面且通用 NewProjectile :47948 无 scale 参；
//       vanilla 池 size 恒 1 = 潜伏发散,摘除 + 伪锚 :46431（1456 ItemCheck_Shoot）
//       勘正（1457 = :47463+）。
//   F4(LOW) 行段误锚族 5 处勘正（1456 伪锚→1457 真位,全部逐行亲读核对）：
//       WeaponProj :1720 →:47034-47073 / :1744 →:47066 / :4689 →:44629-44635 /
//       :3776 →:13288-13333（反弹+烧 :13323-13333）；Game :19663 →:47463+;
//       Game :15466 →:29253-29262；Game :13363 →:4401-4414（ApplyItemTime 孪生补锚）。
//   F5(LOW) f64 vs f32 登记维持（Player.ts attackSpeedMult getter 注释,184 态零差异
//       非穷尽证明）。
// 运行：cd game && npx vitest run tests/c16b-attackspeed-r17-clearance.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { YoyoProj } from '../src/entities/WeaponProj';
import { ChloroClaymoreBlade } from '../src/entities/proj1457';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 160;
const PX = 50 * 16, PY = 90 * 16;
const src = (p: string): string =>
  readFileSync(new URL(p, import.meta.url), 'utf8');

// ---- F1 夹具（同 bj388 形态：真实 Player + 地面 y≥100 探针敌）----
function makeHooks() {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) {
    for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  }
  const player = new Player(PX, PY, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return { hooks, player, enemies, store };
}

function foe(id: number, x: number, y: number, w = 24, h = 40) {
  const rec: number[] = [];
  const f = {
    id, x, y, w, h, dead: false, vx: 0, vy: 0, iframes: 0,
    cx: x + w / 2, cy: y + h / 2,
    hurt: (d: number) => { rec.push(d); return true; },
  };
  return { foe: f, rec };
}

// ---- F2 夹具（同 batch-c 形态：纯桩 player,attackSpeedMult 可注）----
function makeHooksC(playerPatch: Record<string, unknown> = {}): GameHooks {
  const hooks = {
    world: { store: new TileStore(200, 120) } as never,
    player: {
      equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42,
      dead: false, facing: 1, vx: 0, vy: 0, attackSpeedMult: 1, whipBuffs: {},
      ...playerPatch,
    } as never,
    enemies: () => [],
    critters: () => [],
    npcs: () => [],
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
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
    whipTagShot: true,
    entities: { add: () => {} },
  };
  return hooks as unknown as GameHooks;
}

// ================= F1：悠悠球命中烧两站统一 M =================
describe('R17-F1 命中烧寿命除数直取 M（:13327-13333 无除式 / :68803 预除模型同 M）', () => {
  const burn = (m: number): { lifeT: number; hits: number } => {
    const { hooks, player, enemies } = makeHooks();
    Object.defineProperty(player, 'attackSpeedMult', { value: m });
    const y = new YoyoProj(838, PY, 13, 0, 545, 300, () => true,
      () => ({ x: 846, y: PY }), 0);
    (y as unknown as { critChance: number }).critChance = 0;
    const f = foe(7, 834, PY - 10);
    enemies.push(f.foe as never);
    y.fixedUpdate(1 / 60, hooks);            // 单拍：每拍烧 1 + 命中烧 20（LOS 通）
    return { lifeT: (y as unknown as { lifeT: number }).lifeT, hits: f.rec.length };
  };

  it('M=0.8（+25% 攻速）：单拍 lifeT = 21/60/((1+0.8)/2)——命中站与每拍站同 M', () => {
    const { lifeT, hits } = burn(0.8);
    expect(hits).toBeGreaterThanOrEqual(1);                    // 命中已发生
    expect(lifeT).toBeCloseTo(21 / 60 / ((1 + 0.8) / 2), 12);  // 21 档 = 1(每拍)+20(命中)
  });

  it('方向锁：攻速越快烧越快（M=1/3 → 21/40 > M=0.8 → 21/54）,旧式 1/M 恰反', () => {
    const fast = burn(1 / 3).lifeT;      // 满加成 M=1/3
    const mid = burn(0.8).lifeT;
    const none = burn(1).lifeT;          // 无加成 M=1
    expect(fast).toBeCloseTo(21 / 40, 12);
    expect(none).toBeCloseTo(21 / 60, 12);
    expect(fast).toBeGreaterThan(mid);   // M 越小（攻速越快）→ 除式 (1+M)/2 越小 → 烧越多
    expect(mid).toBeGreaterThan(none);
  });

  it('结构锚：两站同式直取 M;vms=1/(attackSpeedMult) 旧式绝迹（inv/asm 1/M 站不受累）', () => {
    const wp = src('../src/entities/WeaponProj.ts');
    expect(wp).toMatch(/const vms = p\.attackSpeedMult \|\| 1;/);
    expect(wp).not.toMatch(/const vms = 1 \/ \(p\.attackSpeedMult/);
    // 每拍站（:3514 语义,先于命中站同拍累计）保持原样
    expect(wp).toMatch(/this\.lifeT \+= \(1 \+ \(flag \? \(10 \+ Math\.floor\(Math\.random\(\) \* 21\)\) \* 0\.1 : 0\)\) \/ 60 \/ \(\(1 \+ vms\) \/ 2\);/);
  });
});

// ================= F2：1126 孢子掷率直取 M + (int) 截断 =================
describe('R17-F2 叶绿 1126 孢子掷率（:42928 Remap(meleeSpeed,1,1/3,4,2) 直读字段+截断）', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  // 掷率判别取 random=0.4（区分 trunc(2.5)=2 与 round(2.5)=3 与饱和 4 三态）：
  //   floor(0.4×2)=0 → 出;floor(0.4×3)=1、floor(0.4×4)=1 → 不出
  const roll = (m: number): number => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const spores: number[] = [];
    const b = new ChloroClaymoreBlade(800, 1440, 1, 1, 95, 6, 32, 1);
    b.spawnSpore = () => { spores.push(1); };
    b.fixedUpdate(1 / 60, makeHooksC({ attackSpeedMult: m }));   // age=1, num=1/32 ≤0.8
    return spores.length;
  };

  it('M=0.5（+100% 攻速）：remap=2.5 → (int)截断 2 → random=0.4 出孢子', () => {
    expect(roll(0.5)).toBe(1);   // 旧式 1/M→饱和 4=不出;round(2.5)=3=不出（双变异恰红）
  });

  it('M=1（无加成）：remap=4 → 不出——同随机数下 M=0.5 出/M=1 不出=掷率随攻速升', () => {
    expect(roll(1)).toBe(0);
  });

  it('对拍 1127 先例：proj1457 与 Game.ts 两站同式直取 attackSpeedMult;1/M 旧式绝迹', () => {
    const proj = src('../src/entities/proj1457.ts');
    expect(proj).toMatch(/const ms = p\.attackSpeedMult > 0 \? p\.attackSpeedMult : 1;/);
    expect(proj).not.toMatch(/1 \/ p\.attackSpeedMult/);
    expect(proj).toMatch(/Math\.trunc\(remap\)/);
    expect(proj).not.toMatch(/Math\.round\(remap\)/);
    const game = src('../src/core/Game.ts');
    expect(game).toMatch(/const ms = this\.player\.attackSpeedMult > 0 \? this\.player\.attackSpeedMult : 1;/);
  });
});

// ================= F3：矛/锚定支出膛 ×ps.size 摘除 =================
describe('R17-F3 膛速不吃词缀 size（:47466 speed=sItem.shootSpeed;NewProjectile :47948 无 scale 参）', () => {
  it('结构锚：spear/anchored 两支膛速均无 ×ps.size;锚定支 /M 由 meleeThrowSpeed 承载', () => {
    const game = src('../src/core/Game.ts');
    expect(game).toMatch(/const spear = new SpearProj\(Math\.cos\(ang\), Math\.sin\(ang\), cw\.shootSpeed, cw\.useTime,/);
    expect(game).not.toMatch(/cw\.shootSpeed \* \(ps\?\.size \?\? 1\)/);
    expect(game).toMatch(/const throwSpd = meleeThrowSpeed\(cw\.shootSpeed, this\.player\.attackSpeedMult\);/);
  });

  it('词缀 size 档语义锁：meleeThrowSpeed 只吃 M（size≠1 不进膛速）——bj640 批2 同式回归', () => {
    // F3 摘除后,ps.size 唯一残留消费面 = 挥剑类 itemScale（绘制/挥击域）,膛速面无 size
    const game = src('../src/core/Game.ts');
    const spearBlock = game.slice(game.indexOf("case 'spear': {"), game.indexOf("case 'anchored': {"));
    expect(spearBlock).not.toContain('ps?.size');
    const anchoredBlock = game.slice(game.indexOf("case 'anchored': {"), game.indexOf("case 'anchored': {") + 4000);
    expect(anchoredBlock).not.toContain('ps?.size');
  });
});

// ================= F4：行段误锚族 5 处勘正 =================
describe('R17-F4 行段误锚族勘正（1456 伪锚 → 1457 真位）', () => {
  it('WeaponProj：延伸盒 :47034-47073/:47066、烧段 :13323-13333、缩放链 :44629-44635', () => {
    const wp = src('../src/entities/WeaponProj.ts');
    expect(wp).toMatch(/AI_019_Spears_GetExtensionHitbox（Projectile\.cs:47034-47073——1456 伪锚 :43530-43571\n \*  勘正 R17-F4）纯函数/);
    expect(wp).toMatch(/num4 \*= attackSpeedMult;\s*\/\/ :47066（R17-F4 勘正）/);
    expect(wp).not.toMatch(/GetExtensionHitbox（Projectile\.cs:43530-43571）/);
    expect(wp).not.toMatch(/\/\/ :43559\b/);
    expect(wp).not.toMatch(/\/\/ :43533-43535|\/\/ :43536 int|\/\/ :43539 Remap/);
    expect(wp).toMatch(/命中链（Projectile\.cs:13288-13333 aiStyle 99 段——1456 伪锚 :12467-12508 勘正/);
    expect(wp).not.toMatch(/12467-12508 aiStyle 99 段）:-2/);
    expect(wp).toMatch(/寿命快捷烧（:13323-13333——1456 伪锚 :12501-12505 勘正/);
    expect(wp).not.toMatch(/寿命快捷烧（:12501-12505）/);
    expect(wp).toMatch(/meleeSpeed 缩放链（:44629-44635 meleeSpeed→num16 七连乘——1456 伪锚 :41151-41159 勘正/);
    expect(wp).not.toMatch(/:41151-41159,1\/meleeSpeed/);
  });

  it('Game：boomerang 初速 :47463+、CapAttackSpeeds :29253-29262、工具动画 :4401-4414', () => {
    const game = src('../src/core/Game.ts');
    const lines = game.split('\n');
    const boomIdx = lines.findIndex((l) => l.includes('初速 = shootSpeed/meleeSpeed（ItemCheck_Shoot'));
    expect(boomIdx).toBeGreaterThanOrEqual(0);
    expect(lines[boomIdx]).toContain(':47463+:47466-47469');
    const meleeIdx = lines.findIndex((l) => l.includes('近战挥剑（vi_ 数据驱动近战武器同走挥击'));
    expect(meleeIdx).toBeGreaterThanOrEqual(0);
    expect(lines[meleeIdx]).not.toContain('28555-28574');       // 1456 伪锚离场
    expect(lines[meleeIdx + 1]).toContain('29253-29262');       // 勘正锚（F4）
    const toolIdx = lines.findIndex((l) => l.includes('def.tool?.speed) return def.tool.speed'));
    expect(toolIdx).toBeGreaterThanOrEqual(0);
    expect(lines[toolIdx]).toContain(':4401-4414');
  });
});

// ================= F5：f64 vs f32 登记维持 =================
describe('R17-F5 f64 vs f32 接受债登记（184 态零差异,非穷尽证明）', () => {
  it('attackSpeedMult getter 头注登记在场（防静默漂移）', () => {
    const player = src('../src/entities/Player.ts');
    expect(player).toMatch(/R17-F5（2026-10-12）f64 vs f32 登记维持/);
    expect(player).toMatch(/184 态堆叠档普查零差异/);
    expect(player).toMatch(/不逐一 f32 化/);
  });
});
