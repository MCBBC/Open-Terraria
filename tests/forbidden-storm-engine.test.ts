// Forbidden 禁戒符号整引擎判别力（组C 终盘 2026-09-18）。
// 标杆 Terarria1457：Player.cs KeyDoubleTap :57434-57457 / UpdateForbiddenSetLock
// :57459-57471 / CommandForbiddenStorm :57476-57566 / KeyHoldDown :57567-57583 /
// MinionRestTargetAim :57599-57670 / UpdateMinionTarget :57677-57681；
// Projectile.cs SetDefaults :7049-7061 / Damage_PVE_Inner 命中计数 :14245 /
// aiStyle 127 :36656-36750；ArmorSetBonuses.cs Benefits.Forbidden :61-65。
// ★双形态定谳：1457 全树弹 656 仅 4 处引用（SetDefaults/:14245/:36664-36702/:33023
// 绘制），无持械判定面——任务假设的「远程光束 vs 法术冲击波」双形态不存在，
// 单形态 = 垂直沙暴柱（本文件 656 唯一性/单路径断言为证伪判别锚）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ForbiddenSignProj, canSpawnSandstormFriendly, expandVertically,
  spawnStormPreviewDust } from '../src/entities/ForbiddenSignProj';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

/** 空旷世界：y=40 一行地板（x∈[10,50]），两侧留空做视线/空间门判别场 */
const mkWorld = (): World => {
  const w = new World(80, 80, 42, 'forbidden-storm');
  for (let x = 10; x <= 50; x++) w.store.setTileSilent(x, 40, 1);
  return w;
};

interface DustSpy { type: number; x: number; y: number; attractTo: unknown;
  fadeIn: number; scale: number; noLight: boolean; noGravity: boolean; vx: number; vy: number; alpha: number }

function makeHooks(w: World, p: Player): {
  hooks: GameHooks; added: ForbiddenSignProj[]; dusts: DustSpy[]; sfx: string[];
} {
  const added: ForbiddenSignProj[] = [];
  const dusts: DustSpy[] = [];
  const sfx: string[] = [];
  const hooks = {
    world: w,
    player: p,
    enemies: () => [],
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
    playSfxWav: (file: string) => { sfx.push(file); },
    addLightAt: () => {},
    vanillaDust: {
      spawn: (x: number, y: number, pw: number, ph: number, type: number) => {
        const d: DustSpy = { type, x, y, attractTo: null, fadeIn: 0, scale: 1,
          noLight: false, noGravity: false, vx: 0.3, vy: -0.2, alpha: 0 };
        dusts.push(d);
        return d;
      },
    },
    // Game.spawnDust 契约直通（BJ157⑧ rest 尘环消费面——vanillaDust.spawn 转发
    // + noGravity 后置覆写,同 Game.ts:43124 形）
    spawnDust: (x: number, y: number, pw: number, ph: number, type: number,
      speedX = 0, speedY = 0, alpha = 0, _color: unknown = null,
      scale = 1, noGravity = false): DustSpy => {
      const d: DustSpy = { type, x, y, attractTo: null, fadeIn: 0, scale,
        noLight: false, noGravity: false, vx: speedX, vy: speedY, alpha };
      dusts.push(d);
      if (noGravity) d.noGravity = true;
      return d;
    },
  };
  const anyHooks = hooks as unknown as Record<string, unknown>;
  const projectiles: ForbiddenSignProj[] = [];
  anyHooks.entities = {
    projectiles,
    add: (e: unknown) => {
      added.push(e as ForbiddenSignProj);
      projectiles.push(e as ForbiddenSignProj);
    },
  };
  return { hooks: hooks as unknown as GameHooks, added, dusts, sfx };
}

/** 空旷世界玩家（裸装,无套装） */
const mkPlayer = (w: World): Player => new Player(30 * 16, 36 * 16, new Inventory());
/** 穿 Forbidden 全套（3776/3777/3778 = 槽 200|198|142） */
function equipForbidden(p: Player): void {
  p.inv.armor[0] = { id: iid(3776), stack: 1 };
  p.inv.armor[1] = { id: iid(3777), stack: 1 };
  p.inv.armor[2] = { id: iid(3778), stack: 1 };
}

describe('Forbidden 套装旗标面（Benefits.Forbidden :61-65）', () => {
  it('200|198|142 三件在身 → equipStats.setBonus.forbidden=true（单表单键）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    equipForbidden(p);
    expect(p.equipStats.setBonus?.forbidden).toBe(true);
    expect(p.equipStats.setBonus?.name).toBe('Forbidden');
  });
  it('卸一件（头）→ 套装面熄灭（三元组完备门）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    equipForbidden(p);
    p.inv.armor[0] = null;
    expect(p.equipStats.setBonus?.forbidden ?? false).toBe(false);
  });
  it('★fixedUpdate 全链投影：穿套跑拍 → setForbidden=true;卸套同拍回 false（ResetEffects 面）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    equipForbidden(p);
    const { hooks } = makeHooks(w, p);
    for (let t = 0; t < 14; t++) p.fixedUpdate(1 / 60, hooks);   // 落地稳定
    expect(p.setForbidden).toBe(true);
    expect(p.setForbiddenCooldownLocked).toBe(false);            // 零根在场 → 未闩
    p.inv.armor[0] = null;
    p.inv.armor[1] = null;
    p.inv.armor[2] = null;
    p.fixedUpdate(1 / 60, hooks);
    expect(p.setForbidden).toBe(false);                          // 卸套同拍清（:18861 面）
  });
});

describe('CommandForbiddenStorm 门链（Player.cs:57476-57566）', () => {
  it('瞄准点未设（HasMinionRestTarget=false）→ 空间门在 (0,0) 拒绝 → 不出弹', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.setForbidden = true;
    const { hooks, added } = makeHooks(w, p);
    p.commandForbiddenStorm(hooks);
    expect(added.length).toBe(0);
  });
  it('光标下方开阔地 → MinionRestTargetAim 落地锚 (tx*16+8, ty*16) → 出弹 656', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.setForbidden = true;
    const { hooks, added } = makeHooks(w, p);
    // 光标点在地板（y=40 行）上方一格中央
    p.inputAimWorldX = 30 * 16 + 8;
    p.inputAimWorldY = 38 * 16;
    p.minionRestTargetAim(hooks);
    expect(p.hasMinionRestTarget).toBe(true);
    // 启发位：光标格非实心 → num3=0 → num9=光标行;5 格行进窗（38..42）内含地面行 40
    // → flag=true 即锚【num9 本行】（vanilla 窗查只置旗不推进 num9,:57630-57647）
    expect(p.minionRestTargetY).toBe(38 * 16);
    expect(p.minionRestTargetX).toBe(30 * 16 + 8);
    p.mana = 100;
    p.commandForbiddenStorm(hooks);
    expect(added.length).toBe(1);
    expect(added[0]).toBeInstanceOf(ForbiddenSignProj);
    expect(added[0].projId).toBe(656);
    expect(added[0].damage).toBe(20);        // 零加成基伤（:57546 换算面）
    expect(added[0].magic).toBe(true);       // SetDefaults :7053
    expect(added[0].friendly).toBe(true);    // :7052
    expect(p.mana).toBe(80);                 // CheckMana(20,pay)（ManaV2 扣蓝面）
    expect(p.manaRegenDelay).toBeGreaterThan(0);   // ApplyManaRegenerationDelay :19515
  });
  it('瞄准方向隔墙 → AimingLaserScan 采样容差门 flag2=false → 不出弹（视线门）', () => {
    const w = mkWorld();
    // 在玩家与光标间立墙（x=32 列, y=20..39 实心）
    for (let y = 20; y < 40; y++) w.store.setTileSilent(32, y, 1);
    const p = mkPlayer(w);
    p.setForbidden = true;
    const { hooks, added } = makeHooks(w, p);
    p.inputAimWorldX = 36 * 16;
    p.inputAimWorldY = 38 * 16;
    p.minionRestTargetAim(hooks);
    p.mana = 100;
    p.commandForbiddenStorm(hooks);
    expect(added.length).toBe(0);
    expect(p.mana).toBe(100);                // 门拒 → 不耗蓝
  });
  it('超距（锚点距玩家 >1000px）→ MinionRestTargetAim 不入账 → 指令落空', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.setForbidden = true;
    const { hooks, added } = makeHooks(w, p);
    p.inputAimWorldX = 30 * 16 + 8;
    p.inputAimWorldY = 38 * 16;
    // 玩家瞬移远离（距锚 >1000px）
    p.x = 30 * 16; p.y = 36 * 16 + 1200;
    p.minionRestTargetAim(hooks);
    expect(p.hasMinionRestTarget).toBe(false);
    p.commandForbiddenStorm(hooks);
    expect(added.length).toBe(0);
  });
  it('★伤害算式换算：+50% 魔法 +25% 召唤 → 20×(1+.5+.25)=35（C# 截断）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.setForbidden = true;
    const { hooks, added } = makeHooks(w, p);
    p.inputAimWorldX = 30 * 16 + 8;
    p.inputAimWorldY = 38 * 16;
    p.minionRestTargetAim(hooks);
    p.mana = 100;
    // 直注乘区（equipStats 缓存键走内部投影——用 stub 覆写 getter 面测试算式）
    const orig = Object.getOwnPropertyDescriptor(Player.prototype, 'equipStats');
    Object.defineProperty(p, 'equipStats', {
      get: () => ({ ...orig!.get!.call(p), dmgMagic: 0.5, minionDmg: 0.25 }),
      configurable: true,
    });
    p.commandForbiddenStorm(hooks);
    expect(added.length).toBe(1);
    expect(added[0].damage).toBe(35);
  });
});

describe('UpdateForbiddenSetLock 锁定面 + 至多两根（:57459-57471/:57524-57526）', () => {
  it('1 根在场 → 未闩;指令刷新旧根（ai0→780+ai0%60）并出第 2 根', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.setForbidden = true;
    const { hooks, added } = makeHooks(w, p);
    p.inputAimWorldX = 26 * 16 + 8;
    p.inputAimWorldY = 38 * 16;
    p.minionRestTargetAim(hooks);
    p.mana = 200;
    p.commandForbiddenStorm(hooks);
    expect(added.length).toBe(1);
    p.updateForbiddenSetLock(hooks);
    expect(p.setForbiddenCooldownLocked).toBe(false);      // 1 根 → 未闩
    added[0].ai0 = 100;                                    // 旧根年轻相位
    p.inputAimWorldX = 34 * 16 + 8;
    p.minionRestTargetAim(hooks);
    p.commandForbiddenStorm(hooks);
    expect(added.length).toBe(2);
    expect(added[0].ai0).toBe(780 + 100 % 60);             // :57539-57543 前跳死亡相位
    p.updateForbiddenSetLock(hooks);
    expect(p.setForbiddenCooldownLocked).toBe(true);       // 2 根 → 闩（>1）
  });
  it('2 根在场 → 再指令不落弹（flag &= list.Count<=1）;消亡一根 → 解闩', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.setForbidden = true;
    const { hooks, added } = makeHooks(w, p);
    p.inputAimWorldX = 26 * 16 + 8;
    p.inputAimWorldY = 38 * 16;
    p.minionRestTargetAim(hooks);
    p.mana = 300;
    p.commandForbiddenStorm(hooks);
    p.inputAimWorldX = 34 * 16 + 8;
    p.minionRestTargetAim(hooks);
    p.commandForbiddenStorm(hooks);
    expect(added.length).toBe(2);
    added[0].dead = true;                                  // 消亡一根
    p.updateForbiddenSetLock(hooks);
    expect(p.setForbiddenCooldownLocked).toBe(false);      // 解闩
    p.inputAimWorldX = 42 * 16 + 8;
    p.minionRestTargetAim(hooks);
    p.commandForbiddenStorm(hooks);
    expect(added.length).toBe(3);                          // 可再出（≤1 门重开）
  });
});

describe('弹 656 生命周期（SetDefaults :7049-7061 / aiStyle 127 :36656-36750）', () => {
  it('柱身几何：地板上方 ExpandVertically ±15t → 盒重算居中（:36680-36691）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const { hooks } = makeHooks(w, p);
    const s = new ForbiddenSignProj(30 * 16 + 8, 38 * 16, 20);
    s.fixedUpdate(1 / 60, hooks);
    // 柱心 y = (topY+1)*16+8 与 (bottomY-1)*16+8 的中点：top=0（出界上界? 上扩 15t
    //  到 y=23 处 40-15=25 行内无阻挡→顶到 InWorld 边界 10）,底=39（地板 40 上方）
    expect(s.colBottomY).toBe(39);
    expect(s.h).toBe(Math.trunc((s.colBottomY * 16 + 8) - (s.colTopY * 16 + 8)));
    expect(s.w).toBe(Math.trunc(s.h * 0.2 * 0.65));
    expect(Math.abs(s.cx - (30 * 16 + 8))).toBeLessThanOrEqual(0.5);
  });
  it('canSpawnSandstormFriendly：开阔 3 柱 ≥10t 真假判别（StrayMethods.cs:65-81）', () => {
    const w = mkWorld();
    expect(canSpawnSandstormFriendly(w.store, 30 * 16 + 8, 38 * 16, 30, 30)).toBe(true);
    // 夹缝：3 柱窗（x±1）两侧立墙夹死中心列（墙 y=30..39,净空 <10）→ 假
    for (let y = 30; y < 40; y++) {
      w.store.setTileSilent(29, y, 1);
      w.store.setTileSilent(31, y, 1);
    }
    expect(canSpawnSandstormFriendly(w.store, 30 * 16 + 8, 38 * 16, 30, 30)).toBe(false);
  });
  it('★30 命中帽（:14245 localAI[0]+aiStyle127 :36671-36678）：第 30 命中后 damage=0+ai0 前跳 780+ai0%60', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const enemy = { id: 1, x: 30 * 16, y: 30 * 16, w: 16, h: 16, dead: false, hits: [] as number[],
      hurt(d: number) { this.hits.push(d); return true; } };
    const hooks = makeHooks(w, p);
    (hooks.hooks as unknown as { enemies: () => unknown[] }).enemies = () => [enemy];
    const s = new ForbiddenSignProj(30 * 16 + 8, 34 * 16, 20);
    for (let t = 0; t < 241 && !s.dead; t++) s.fixedUpdate(1 / 60, hooks.hooks);
    // localNPCHitCooldown=8 → 每 8t 一跳：240t 恰好 30 跳
    expect(s.hitCount).toBe(30);
    expect(enemy.hits.length).toBe(30);
    expect(enemy.hits.every((d) => d === 20)).toBe(true);
    expect(s.damage).toBe(0);                        // :36673 停伤
    expect(s.ai0).toBeGreaterThanOrEqual(780);       // 前跳死亡相位
  });
  it('★视线打断（:36702-36716）：柱与玩家间立墙 → 当拍 ai0 前跳 780+（≈1s 内消亡）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const { hooks } = makeHooks(w, p);
    // 柱在 x=40 列,玩家在 x=30 列,中间 x=35 立全高墙 → 20 采样点全断视
    const s = new ForbiddenSignProj(40 * 16 + 8, 34 * 16, 20);
    s.ai0 = 100;
    for (let y = 0; y < 40; y++) w.store.setTileSilent(35, y, 1);
    s.fixedUpdate(1 / 60, hooks);
    expect(s.ai0).toBe(780 + 101 % 60);              // :36710-36715 前跳（101%60=41）
  });
  it('★死亡相位接触结算保留（:36723-36725 return 仅跳 AI 尘面;Damage :17184 主 Update 无条件照跑）——断视跳相位后柱内敌人继续受击,damage 不随相位清零（唯 :36678 localAI[0]≥30 命中帽清）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const hits: { d: number; ai: number }[] = [];
    let s!: ForbiddenSignProj;
    const enemy = { id: 1, x: 40 * 16, y: 34 * 16, w: 16, h: 16, dead: false,
      hurt(d: number) { hits.push({ d, ai: s.ai0 }); return true; } };
    const hooks = makeHooks(w, p);
    (hooks.hooks as unknown as { enemies: () => unknown[] }).enemies = () => [enemy];
    s = new ForbiddenSignProj(40 * 16 + 8, 34 * 16, 20);
    for (let y = 0; y < 40; y++) w.store.setTileSilent(35, y, 1);   // 断视墙（:288 同场）→ 首拍前跳死亡相位
    for (let t = 0; t < 200 && !s.dead; t++) s.fixedUpdate(1 / 60, hooks.hooks);
    expect(s.dead).toBe(true);                          // ai0=900 Kill 照常（:36667-36669）
    expect(hits.length).toBe(15);                       // 命中于 ai0=781+8k ≤899（localNPCHitCooldown=8）
    expect(hits.every((h) => h.ai >= 780)).toBe(true);  // 结算全部发生在死亡相位内
    expect(hits.every((h) => h.d === 20)).toBe(true);   // damage 未被相位清零（30 帽未达）
  });
  it('寿命 900t Kill（:36667-36669）；死亡相位无尘（:36723-36725 return 仅跳尘面）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const { hooks, dusts } = makeHooks(w, p);
    const s = new ForbiddenSignProj(30 * 16 + 8, 34 * 16, 20);
    for (let t = 0; t < 899; t++) s.fixedUpdate(1 / 60, hooks);
    expect(s.dead).toBe(false);
    const dustAt898 = dusts.length;
    s.fixedUpdate(1 / 60, hooks);
    expect(s.dead).toBe(true);                       // ai0=900 → Kill
    expect(dusts.length).toBe(dustAt898);            // 死拍无尘（≥780 早退）
  });
  it('尘面（:36723-36749）：活相位每拍 1 粒尘 269 + customData 吸向柱心锚', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const { hooks, dusts } = makeHooks(w, p);
    const s = new ForbiddenSignProj(30 * 16 + 8, 34 * 16, 20);
    s.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(1);
    expect(dusts[0].type).toBe(269);
    expect(dusts[0].attractTo).toEqual({ x: s.cx + 6, y: s.cy + 10 });   // vector153+vector156
    expect(dusts[0].scale).toBe(0.3);
    expect(dusts[0].fadeIn).toBe(1);
  });
  it('声面：首拍 SoundID.Item82 一次性（soundDelay 门 :36660-36664）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const { hooks, sfx } = makeHooks(w, p);
    const s = new ForbiddenSignProj(30 * 16 + 8, 34 * 16, 20);
    s.fixedUpdate(1 / 60, hooks);
    s.fixedUpdate(1 / 60, hooks);
    s.fixedUpdate(1 / 60, hooks);
    expect(sfx.filter((n) => n === 'Item_82').length).toBe(1);
  });
  it('预览尘（CommandForbiddenStorm :57513-57523）：射线每 15px 一粒 + 端点 30 粒环', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const { hooks, dusts } = makeHooks(w, p);
    const center = { x: 30 * 16, y: 36 * 16 };
    spawnStormPreviewDust(hooks, center, { x: 320, y: 0 }, 320);
    // 线尘 = 320/15 → 22 粒（0..315）;环 = 2π/(π/15) = 30 粒
    const lineDusts = dusts.filter((d) => d.scale === 0.7);
    const ringDusts = dusts.filter((d) => d.scale === 0.3);
    expect(lineDusts.length).toBe(22);
    expect(ringDusts.length).toBe(30);
    expect(lineDusts[0].noLight).toBe(true);
    expect(ringDusts.every((d) => d.x === (30 * 16 + 320))).toBe(true);
  });
});

describe('KeyHoldDown/UpdateMinionTarget 复位面（:57578-57582/:57677-57681）', () => {
  it('按住↓ ≥60t → MinionRestTargetPoint 复位 Zero（指令空转=空间门拒）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.setForbidden = true;
    p.minionRestTargetX = 30 * 16 + 8;
    p.minionRestTargetY = 40 * 16;
    p.downHoldT = 61;
    // KeyHoldDown 面（fixedUpdate 输入段 :3584-3610 内联）——直调等价语义
    if (p.setForbidden && p.downHoldT >= 60) {
      p.minionRestTargetX = 0;
      p.minionRestTargetY = 0;
    }
    expect(p.hasMinionRestTarget).toBe(false);
  });
  it('锚点距玩家 >1000px 每 tick 复位（UpdateMinionTarget :57677-57681）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.minionRestTargetX = p.cx + 1200;
    p.minionRestTargetY = p.cy;
    // fixedUpdate 套装段内联面——直调同式
    if (Math.hypot(p.minionRestTargetX - p.cx, p.minionRestTargetY - p.cy) > 1000) {
      p.minionRestTargetX = 0;
      p.minionRestTargetY = 0;
    }
    expect(p.hasMinionRestTarget).toBe(false);
  });
});

// ============ BJ157⑧ 星尘守护者消费面（Player 侧：KeyHoldDown 星尘支 + rest 尘环） ============
describe('BJ157⑧ 星尘守护者消费面（KeyHoldDown :57574-57576 / UpdateMinionTarget :57683-57701）', () => {
  const equipStardust = (p: Player): void => {
    p.inv.armor[0] = { id: iid(3381), stack: 1 };
    p.inv.armor[1] = { id: iid(3382), stack: 1 };
    p.inv.armor[2] = { id: iid(3383), stack: 1 };
  };

  it('★fixedUpdate 全链：星尘套在身按住 ↓ ≥60t → 复位 MinionRestTargetPoint（守护者 rest 取消半边）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    equipStardust(p);
    const { hooks } = makeHooks(w, p);
    for (let t = 0; t < 14; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.equipStats.summonSet?.guardian).toBe(true);
    p.minionRestTargetX = p.cx + 100;
    p.minionRestTargetY = p.cy;
    p.inputDown = true;
    for (let t = 0; t < 61; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.hasMinionRestTarget).toBe(false);
  });

  it('取消门反例：无套装按住 ↓ ≥61t 不复位（KeyHoldDown 需 setForbidden ∨ setStardust）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const { hooks } = makeHooks(w, p);
    p.minionRestTargetX = p.cx + 100;
    p.minionRestTargetY = p.cy;
    p.inputDown = true;
    for (let t = 0; t < 61; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.hasMinionRestTarget).toBe(true);
  });

  it('rest 点尘环：守护者旗 ∧ HasMinionRestTarget → 3 粒 135/拍（r=4 公转,v=0,noGravity,noLight,α100 scale1.5）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    equipStardust(p);
    const { hooks, dusts } = makeHooks(w, p);
    for (let t = 0; t < 14; t++) p.fixedUpdate(1 / 60, hooks);
    p.minionRestTargetX = p.cx + 100;
    p.minionRestTargetY = p.cy;
    const before = dusts.length;
    p.fixedUpdate(1 / 60, hooks);
    const ring = dusts.slice(before).filter((d) => d.type === 135);
    expect(ring.length).toBe(3);
    for (const d of ring) {
      expect(d.vx).toBe(0);
      expect(d.vy).toBe(0);
      expect(d.noLight).toBe(true);
      expect(d.alpha).toBe(100);
      expect(d.scale).toBeCloseTo(1.5);
      // 锚=MinionRestTargetPoint 本值（原版 :57688 同锚;玩家拍内微移不进锚）
      expect(Math.hypot(d.x - p.minionRestTargetX, d.y - p.minionRestTargetY)).toBeCloseTo(4);
    }
    // rest 点撤销 → 尘环停发
    p.minionRestTargetX = 0;
    p.minionRestTargetY = 0;
    const mid = dusts.length;
    p.fixedUpdate(1 / 60, hooks);
    expect(dusts.slice(mid).filter((d) => d.type === 135).length).toBe(0);
  });

  it('尘环门反例：裸装（无守护者旗）rest 点在设 → 无 135 尘', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    const { hooks, dusts } = makeHooks(w, p);
    p.minionRestTargetX = p.cx + 100;
    p.minionRestTargetY = p.cy;
    p.fixedUpdate(1 / 60, hooks);
    expect(dusts.filter((d) => d.type === 135).length).toBe(0);
  });
});
