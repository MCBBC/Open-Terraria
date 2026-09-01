// 随从杖伴生 buff 泛化批（2026-08-22 补 C「系统性⚠️：24 件随从杖伴生 buff 全缺施加链」，
// docs/audit/item-audit-2026-08-22.md）。标杆 Terarria1456/：
//   ① 映射金标 = Item.cs SetDefaults 逐杖 buffType/shoot 字段提取（本文件 ORACLE 表
//      为脚本直读反编译产物,改动须先对 1456 复核）
//   ② 授予 = ItemCheck_ApplyPetBuffs（Player.cs:52226-52440）：1157/1309/1802/2364/2365
//      逐条 if + :52400-52420 switch → AddBuff(sItem.buffType, 3600)
//   ③ 维护 = UpdateBuffs :10149-10575 逐 buff 分支：ownedProjectileCounts>0 →
//      buffTime[j]=18000 直写,否则 DelBuff;216 雀宝宝带重生支（:10369-10385）
//   ④ 驱逐联动 = FreeUpPetsAndMinions（:52335-52440,freeUpMinionsForSummon 已移植）
//   ⑤ 双声订正 = Projectile.cs:50893-50898/:59128-59131——soundDelay 初值 0（:488）,
//      `--soundDelay == -1` 首拍 PalSummon（SoundID.cs:1047 vol0.15）、`== -20` 第 20 拍
//      家族叫声（:1049/:1061 vol0.35）——1093/1094 曾与 1112/1113 反序,本批翻转
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINION_BUFFS, PALWORLD_MINION_BUFFS, MINION_SACRIFICABLE,
  freeUpMinionsForSummon, maintainMinionBuffs } from '../src/core/Game';
import { BuffType, BUFF_DEFS, buffTypeByVanilla, BuffState } from '../src/stats/Buffs';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_TS = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const MINION_TS = readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8');

/** 金标：1456 Item.cs SetDefaults 逐杖（buffType, shoot）——node 直读反编译提取。
 *  projs 多型族对 UpdateBuffs 维护段：矮人 191-194（:10150-10157）/蜘蛛 390-392
 *  （:10233-10240）/双子 387+388（:10249-10256）/海盗 393-395（:10265-10272） */
const ORACLE: ReadonlyArray<{ staff: number; buff: number; projs: number[]; name: string }> = [
  { staff: 1157, buff: 49, projs: [191, 192, 193, 194], name: 'PygmyStaff/矮人' },
  { staff: 1309, buff: 64, projs: [266], name: 'SlimeStaff/史莱姆宝宝' },
  { staff: 1802, buff: 83, projs: [317], name: 'RavenStaff/乌鸦' },
  { staff: 2364, buff: 125, projs: [373], name: 'HornetStaff/黄蜂' },
  { staff: 2365, buff: 126, projs: [375], name: 'ImpStaff/小鬼' },
  { staff: 2551, buff: 133, projs: [390, 391, 392], name: 'SpiderStaff/蜘蛛' },
  { staff: 2535, buff: 134, projs: [387, 388], name: 'OpticStaff/双子魔眼' },
  { staff: 2584, buff: 135, projs: [393, 394, 395], name: 'PirateStaff/海盗' },
  { staff: 2621, buff: 139, projs: [407], name: 'TempestStaff/鲨鱼旋风' },
  { staff: 2749, buff: 140, projs: [423], name: 'XenoStaff/UFO' },
  { staff: 3249, buff: 161, projs: [533], name: 'DeadlySphereStaff/致命球' },
  { staff: 3474, buff: 182, projs: [613], name: 'StardustCellStaff/星尘细胞' },
  { staff: 3531, buff: 188, projs: [625], name: 'StardustDragonStaff/星尘之龙' },
  { staff: 4269, buff: 213, projs: [755], name: 'SanguineStaff/血红蝙蝠' },
  { staff: 4273, buff: 214, projs: [758], name: 'VampireFrogStaff/吸血鬼青蛙' },
  { staff: 4281, buff: 216, projs: [759], name: 'BabyBirdStaff/雀宝宝' },
  { staff: 4607, buff: 263, projs: [831], name: 'StormTigerStaff/沙漠虎' },
  { staff: 4758, buff: 271, projs: [864], name: 'Smolstar/附魔飞刀' },
  { staff: 5005, buff: 322, projs: [946], name: 'EmpressBlade/泰拉棱镜' },
  { staff: 5069, buff: 325, projs: [951], name: 'FlinxStaff/小雪怪' },
  { staff: 5114, buff: 335, projs: [970], name: 'AbigailsFlower/阿比盖尔' },
  { staff: 5456, buff: 355, projs: [1022], name: 'DeadCellsMushroom/蘑菇小伙伴' },
  { staff: 5663, buff: 385, projs: [1093], name: 'PalCattiva/捣蛋猫' },
  { staff: 5664, buff: 386, projs: [1094], name: 'PalFoxparks/火绒狐' },
];

// ---------------------------------------------------------------------------
// ① 24 件映射金标对拍（Item.cs SetDefaults buffType/shoot）
// ---------------------------------------------------------------------------
describe('① 24 件映射金标（Item.cs SetDefaults buffType/shoot 提取）', () => {
  it('MINION_BUFFS 覆盖 24 件金标 + 1457 四件（杖 vid/buff/弹集,无重码）', () => {
    expect(MINION_BUFFS).toHaveLength(28);   // 24 件 1456 杖 + 6148/6149/6161/6164
    const byStaff = new Map(MINION_BUFFS.map((e) => [e.staff, e]));
    for (const o of ORACLE) {
      const e = byStaff.get(o.staff);
      expect(e, `杖 ${o.staff}(${o.name}) 应在全表`).toBeDefined();
      expect(e!.buff, `${o.name} buffType`).toBe(o.buff);
      expect([...e!.projs].sort((a, b) => a - b), `${o.name} projs`)
        .toEqual([...o.projs].sort((a, b) => a - b));
    }
    // 1457 Palworld 四件并入（维护链单表全覆盖——缺了会丢 389/390/393/394 维护）
    for (const [staff, buff, proj] of [[6148, 389, 1112], [6149, 390, 1113],
      [6161, 393, 1118], [6164, 394, 1119]] as const) {
      expect(byStaff.get(staff)?.buff, `1457 杖 ${staff}`).toBe(buff);
      expect(byStaff.get(staff)?.projs).toEqual([proj]);
    }
    expect(new Set(MINION_BUFFS.map((e) => e.buff)).size).toBe(28);   // buff 无重码
    expect(new Set(MINION_BUFFS.map((e) => e.staff)).size).toBe(28);  // 杖无重码
  });

  it('授予查找可命中：itemCombat(staff).shoot ∈ projs（24 件逐杖,Game case summon 同式）', () => {
    for (const o of ORACLE) {
      const shoot = itemCombat(o.staff)!.shoot;
      expect(shoot, `杖 ${o.staff} combat 表缺 shoot`).toBeDefined();
      const hit = MINION_BUFFS.find((x) => x.projs.includes(shoot!));
      expect(hit?.buff, `杖 ${o.staff} shoot=${shoot} 应反查到伴生 buff`).toBe(o.buff);
    }
  });

  it('16 件复活 + 8 件新补：buffTypeByVanilla 反查全 24 非 undefined 且往返一致', () => {
    for (const o of ORACLE) {
      const t = buffTypeByVanilla(o.buff);
      expect(t, `vanilla buff ${o.buff}(${o.name}) 应已映射`).toBeDefined();
      expect(BUFF_DEFS[t!].vanillaBuff).toBe(o.buff);
    }
    // 8 件新条目（补 C 重项 125/126/139/140/322/325/385/386）枚举名 = 原版 BuffID 内部名
    expect(BUFF_DEFS[BuffType.HornetMinion].vanillaBuff).toBe(125);
    expect(BUFF_DEFS[BuffType.ImpMinion].vanillaBuff).toBe(126);
    expect(BUFF_DEFS[BuffType.SharknadoMinion].vanillaBuff).toBe(139);
    expect(BUFF_DEFS[BuffType.UFOMinion].vanillaBuff).toBe(140);
    expect(BUFF_DEFS[BuffType.EmpressBlade].vanillaBuff).toBe(322);
    expect(BUFF_DEFS[BuffType.FlinxMinion].vanillaBuff).toBe(325);
    expect(BUFF_DEFS[BuffType.PalworldMinionCattiva].vanillaBuff).toBe(385);
    expect(BUFF_DEFS[BuffType.PalworldMinionFoxsparks].vanillaBuff).toBe(386);
  });

  it('图标 Buff_N.png 24 件全在盘（UI.ts 直链 /sprites/vanilla/Buff_N.png）', () => {
    for (const o of ORACLE) {
      expect(existsSync(join(ROOT, 'public/sprites/vanilla', `Buff_${o.buff}.png`)),
        `缺 Buff_${o.buff}.png（${o.name}）`).toBe(true);
    }
  });

  it('descKey 原版 BuffDescription 键 zh-Hans/en-US 语料在键非空（24 件,含 385/386 帕鲁）', () => {
    const zh = JSON.parse(readFileSync(join(ROOT, 'public/l10n/zh-Hans.json'), 'utf8'));
    const en = JSON.parse(readFileSync(join(ROOT, 'public/l10n/en-US.json'), 'utf8'));
    for (const o of ORACLE) {
      const d = BUFF_DEFS[buffTypeByVanilla(o.buff)!];
      expect(d.descKey.startsWith('BuffDescription.'), `${o.name} 应走原版键`).toBe(true);
      const k = d.descKey.slice('BuffDescription.'.length);
      expect((zh.BuffDescription?.[k] ?? '').length, `zh ${k}`).toBeGreaterThan(0);
      expect((en.BuffDescription?.[k] ?? '').length, `en ${k}`).toBeGreaterThan(0);
    }
  });

  it('存档过滤：24 件中 BUFF_NO_SAVE 名单（Main.buffNoSave）语义不变——125/385 不落盘、49/83 落盘', () => {
    const b = new BuffState();
    b.apply(BuffType.HornetMinion, 60);
    b.apply(BuffType.PalworldMinionCattiva, 60);
    b.apply(BuffType.Pygmies, 60);
    b.apply(BuffType.Ravens, 60);
    const saved = b.toSave().map(([v]) => v);
    expect(saved).not.toContain(125);
    expect(saved).not.toContain(385);
    expect(saved).toContain(49);
    expect(saved).toContain(83);
  });
});

// ---------------------------------------------------------------------------
// ② 授予链（Game.ts case summon → ItemCheck_ApplyPetBuffs :52226-52440）
// ---------------------------------------------------------------------------
const player = new Player(60 * 16, 90 * 16, new Inventory());

/** 授予表达式（Game case summon 内联同式）：PALWORLD 四件优先,回退 24 件全表 */
function grantTypeFor(shoot: number): BuffType | undefined {
  const pb = PALWORLD_MINION_BUFFS.find((x) => x.proj === shoot)
    ?? MINION_BUFFS.find((x) => x.projs.includes(shoot));
  return pb ? buffTypeByVanilla(pb.buff) : undefined;
}

describe('② 授予链（:52226-52440 用即 AddBuff）', () => {
  it('落点在码：PALWORLD 原链保留 + 全表回退 + apply 终态 300s（palworld-minion-parity 锁同串）', () => {
    expect(GAME_TS).toContain('PALWORLD_MINION_BUFFS.find((x) => x.proj === cw.shoot)');
    expect(GAME_TS).toContain('MINION_BUFFS.find((x) => x.projs.includes(cw.shoot))');
    expect(GAME_TS).toContain('buffs.apply(bt, 300)');
  });

  it('24 杖逐个：授予表达式命中本族 buff（1457 四件走 PALWORLD 前链,余 20 件走全表）', () => {
    for (const o of ORACLE) {
      const shoot = itemCombat(o.staff)!.shoot!;
      const viaPal = PALWORLD_MINION_BUFFS.find((x) => x.proj === shoot);
      const t = grantTypeFor(shoot);
      expect(t, `${o.name} 授予应命中`).toBeDefined();
      expect(BUFF_DEFS[t!].vanillaBuff).toBe(o.buff);
      expect(!!viaPal).toBe([1112, 1113, 1118, 1119].includes(shoot));   // 前链仅 1457 四件
    }
  });

  it('行为级：BuffState.apply(bt,300) 后 has 且 300s（24 族逐个）', () => {
    for (const o of ORACLE) {
      const b = new BuffState();
      const t = buffTypeByVanilla(o.buff)!;
      b.apply(t, 300);
      expect(b.has(t), `${o.name} 授予后应在栏`).toBe(true);
      expect(b.active.get(t)).toBe(300);
    }
  });
});

// ---------------------------------------------------------------------------
// ③ 维护链（maintainMinionBuffs = UpdateBuffs :10149-10575 泛化）
// ---------------------------------------------------------------------------
const W = 200, H = 120;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
function makeHooks(enemies: unknown[] = []) {
  const store = makeStore();
  const pl = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const sfx: string[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: pl as never,
    enemies: () => enemies as never,
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
    playSfxFiles: (tracks: string | string[]) => { for (const t of Array.isArray(tracks) ? tracks : [tracks]) sfx.push(t); },
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown, b: string) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { added.push(e); },
    projectiles: [],
  };
  return { hooks, store, player: pl, added, sfx };
}

/** 维护一次：返回 (弹集, 生成收集器) 语境下的玩家 buff 态 */
function maintain(pl: Player, minions: MinionProj[]): { spawned: MinionProj[] } {
  const spawned: MinionProj[] = [];
  maintainMinionBuffs(pl, minions, (m) => spawned.push(m));
  return { spawned };
}

describe('③ 维护链（:10149-10575 ownedProjectileCounts 等价）', () => {
  it('落点在码：fixedUpdate 逐 tick 调维护核 + 直写 300/DelBuff 语义串保留', () => {
    expect(GAME_TS).toContain('maintainMinionBuffs(this.player, this.entities.projectiles');
    expect(GAME_TS).toContain('buffs.set(bt, 300)');
    expect(GAME_TS).toContain('buffs.remove(bt)');
  });

  it('在役维持：24 族逐个——弹在场 → buff 直写 300s（覆盖旧短时长,非 max 合并）', () => {
    for (const o of ORACLE) {
      const pl = new Player(60 * 16, 90 * 16, new Inventory());
      const t = buffTypeByVanilla(o.buff)!;
      pl.buffs.apply(t, 10);                       // 预置短时长 → 维护须直写覆盖为 300
      const m = new MinionProj(60 * 16, 90 * 16, o.projs[0], 10, 2, false, 0, false, () => pl);
      maintain(pl, [m]);
      expect(pl.buffs.has(t), `${o.name} 在役应在栏`).toBe(true);
      expect(pl.buffs.active.get(t), `${o.name} 应被直写 300s`).toBe(300);
    }
  });

  it('离役移除：24 族逐个——弹亡（dead）→ 次 tick DelBuff', () => {
    for (const o of ORACLE) {
      const pl = new Player(60 * 16, 90 * 16, new Inventory());
      const t = buffTypeByVanilla(o.buff)!;
      const m = new MinionProj(60 * 16, 90 * 16, o.projs[0], 10, 2, false, 0, false, () => pl);
      maintain(pl, [m]);
      expect(pl.buffs.has(t), `${o.name} 前置在役`).toBe(true);
      m.dead = true;                               // 驱逐/玩家死亡 → 弹亡
      maintain(pl, [m]);
      expect(pl.buffs.has(t), `${o.name} 弹亡后应撤`).toBe(false);
    }
  });

  it('多型族任一型在役即维持：蜘蛛 391/海盗 394/双子 388/矮人 192（projs 数组语义）', () => {
    for (const [staff, proj] of [[2551, 391], [2584, 394], [2535, 388], [1157, 192]] as const) {
      const o = ORACLE.find((x) => x.staff === staff)!;
      const pl = new Player(60 * 16, 90 * 16, new Inventory());
      const m = new MinionProj(60 * 16, 90 * 16, proj, 10, 2, false, 0, false, () => pl);
      maintain(pl, [m]);
      expect(pl.buffs.has(buffTypeByVanilla(o.buff)!), `staff ${staff} 变体弹 ${proj}`).toBe(true);
    }
  });

  it('异族弹不互认：在场 373（黄蜂）只维持 125,其余 23 族+1457 四件 buff 不被错误续起', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const m = new MinionProj(60 * 16, 90 * 16, 373, 10, 2, false, 0, false, () => pl);
    maintain(pl, [m]);
    expect(pl.buffs.has(BuffType.HornetMinion)).toBe(true);
    for (const o of ORACLE) {
      if (o.buff === 125) continue;
      expect(pl.buffs.has(buffTypeByVanilla(o.buff)!), `${o.name} 不应被 373 续起`).toBe(false);
    }
    for (const t of [BuffType.PalworldMinionTrustyCattiva, BuffType.PalworldMinionTrustyFoxsparks,
      BuffType.ClayPotMinion, BuffType.ForbiddenMinion]) {
      expect(pl.buffs.has(t), `1457 buff ${t} 不应被 373 续起`).toBe(false);
    }
  });

  it('216 雀宝宝重生支（:10369-10385）：弹缺 + 背包有 4281 + 空槽 → 直生 759（基伤 7）+ buff 续', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    pl.inv.add(4281, 1);
    const { spawned } = maintain(pl, []);
    expect(spawned).toHaveLength(1);
    expect(spawned[0].projId).toBe(759);
    expect(spawned[0].damage).toBe(itemCombat(4281)!.damage);   // NewProjectile(item.damage)
    expect(pl.buffs.has(BuffType.BabyBird)).toBe(true);         // 重生即视作在役
  });

  it('216 无杖不重生：背包无 4281 → 不生成且 DelBuff（:10383-10385）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const { spawned } = maintain(pl, []);
    expect(spawned).toHaveLength(0);
    expect(pl.buffs.has(BuffType.BabyBird)).toBe(false);
  });

  it('216 满槽不重生：4281 在包但随从槽满（黄蜂占 1/1）→ 不生成且 DelBuff（numMinions<maxMinions 门）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    pl.inv.add(4281, 1);
    const hornet = new MinionProj(60 * 16, 90 * 16, 373, 10, 2, false, 0, false, () => pl);
    const { spawned } = maintain(pl, [hornet]);
    expect(spawned).toHaveLength(0);
    expect(pl.buffs.has(BuffType.BabyBird)).toBe(false);
    expect(pl.buffs.has(BuffType.HornetMinion)).toBe(true);     // 占槽者自身照常维持
  });
});

// ---------------------------------------------------------------------------
// ④ 互斥驱逐（FreeUpPetsAndMinions :52335-52440 → 维护链撤 buff）
// ---------------------------------------------------------------------------
describe('④ 互斥驱逐 → 伴生 buff 撤除', () => {
  it('同型驱逐：召 373（黄蜂杖）清在场 373 → 次 tick 125 撤（MinionSacrificable 门内）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const old = new MinionProj(60 * 16, 90 * 16, 373, 10, 2, false, 0, false, () => pl);
    maintain(pl, [old]);
    expect(pl.buffs.has(BuffType.HornetMinion)).toBe(true);
    freeUpMinionsForSummon(373, [old], pl.maxMinions);          // 新召同弹 → 池驱逐
    expect(old.dead).toBe(true);
    maintain(pl, [old]);
    expect(pl.buffs.has(BuffType.HornetMinion)).toBe(false);
  });

  it('帕鲁跨代互清：召 1112 清在场 1093（:52340-52350 同族）→ 385 撤、389 不受牵连', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const cattiva1456 = new MinionProj(60 * 16, 90 * 16, 1093, 20, 2, false, 0, false, () => pl);
    const trusty = new MinionProj(60 * 16, 90 * 16, 1112, 20, 2, false, 0, false, () => pl);
    maintain(pl, [cattiva1456, trusty]);
    expect(pl.buffs.has(BuffType.PalworldMinionCattiva)).toBe(true);
    expect(pl.buffs.has(BuffType.PalworldMinionTrustyCattiva)).toBe(true);
    // 驱逐池=在场旧随从（Game 流程：freeUp 先于新弹生成,池里没有新召弹本身）
    freeUpMinionsForSummon(1112, [cattiva1456], pl.maxMinions);
    expect(cattiva1456.dead).toBe(true);
    expect(trusty.dead).toBe(false);
    maintain(pl, [cattiva1456, trusty]);
    expect(pl.buffs.has(BuffType.PalworldMinionCattiva)).toBe(false);
    expect(pl.buffs.has(BuffType.PalworldMinionTrustyCattiva)).toBe(true);
  });

  it('驱逐保护：625 龙头（:51017 豁免）超限不被杀 → 188 维持不误撤', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const head = new MinionProj(60 * 16, 90 * 16, 625, 40, 2, false, 0, false, () => pl);
    const other = new MinionProj(60 * 16, 90 * 16, 373, 10, 2, false, 0, false, () => pl);
    maintain(pl, [head, other]);
    freeUpMinionsForSummon(407, [head, other], 1);              // 槽满需腾 1：龙头豁免、黄蜂被杀
    expect(head.dead).toBe(false);
    expect(other.dead).toBe(true);
    maintain(pl, [head, other]);
    expect(pl.buffs.has(BuffType.StardustDragonMinion)).toBe(true);
    expect(pl.buffs.has(BuffType.HornetMinion)).toBe(false);
  });

  it('24 杖 shoot 全在 MinionSacrificable（ProjectileID.cs:307）——驱逐门按新召 shoot 查表不漏', () => {
    for (const o of ORACLE) {
      // ★表只按 sItem.shoot 查（变体弹 391/392/394/395 原版即不在表,勿误断）
      const shoot = itemCombat(o.staff)!.shoot!;
      expect(MINION_SACRIFICABLE.has(shoot), `杖 ${o.staff} shoot=${shoot}（${o.name}）应可牺牲`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ⑤ 帕鲁双声顺序订正（Projectile.cs:50893-50898/:59128-59131——tick1=PalSummon、
//    tick20=家族叫声;1093/1094 曾反序,与 1112/1113 对齐）
// ---------------------------------------------------------------------------
describe('⑤ 帕鲁召唤双声顺序（soundDelay 0→-1 首拍 / →-20 第 20 拍）', () => {
  it('1093 捣蛋猫：tick1 pal_summon(0.15)、tick20 pal_cattiva(0.35)', () => {
    const { hooks, sfx, player: pl } = makeHooks();
    const m = new MinionProj(60 * 16, 90 * 16, 1093, 20, 2, false, 0, false, () => pl);
    m.fixedUpdate(1, hooks);
    expect(sfx).toContain('pal_summon');
    expect(sfx).not.toContain('pal_cattiva');
    for (let k = 0; k < 19; k++) m.fixedUpdate(1, hooks);
    expect(sfx.filter((t) => t === 'pal_summon')).toHaveLength(1);   // 首拍一声不重播
    expect(sfx).toContain('pal_cattiva');
  });

  it('1094 火绒狐：tick1 pal_summon(0.15)、tick20 pal_foxparks(0.35)', () => {
    const { hooks, sfx, player: pl } = makeHooks();
    const m = new MinionProj(60 * 16, 90 * 16, 1094, 20, 2, false, 0, false, () => pl);
    m.fixedUpdate(1, hooks);
    expect(sfx).toContain('pal_summon');
    expect(sfx).not.toContain('pal_foxparks');
    for (let k = 0; k < 19; k++) m.fixedUpdate(1, hooks);
    expect(sfx.filter((t) => t === 'pal_summon')).toHaveLength(1);
    expect(sfx).toContain('pal_foxparks');
  });

  it('1112/1113 回归：同序不回归（1457 两件本按真值登记）', () => {
    for (const [projId, call] of [[1112, 'pal_cattiva'], [1113, 'pal_foxparks']] as const) {
      const { hooks, sfx, player: pl } = makeHooks();
      const m = new MinionProj(60 * 16, 90 * 16, projId, 20, 2, false, 0, false, () => pl);
      m.fixedUpdate(1, hooks);
      expect(sfx).toContain('pal_summon');
      for (let k = 0; k < 19; k++) m.fixedUpdate(1, hooks);
      expect(sfx).toContain(call);
    }
  });

  it('表序锁：MINION_SUMMON_SFX 四件同构——pal_summon 在前(at 1)、家族叫声在后(at 20)', () => {
    for (const [projId, call] of [[1093, 'pal_cattiva'], [1094, 'pal_foxparks'],
      [1112, 'pal_cattiva'], [1113, 'pal_foxparks']] as const) {
      const i = MINION_TS.indexOf(`${projId}: [{ track: 'pal_summon', vol: 0.15, at: 1 }`);
      expect(i, `${projId} 首拍应为 pal_summon@1`).toBeGreaterThan(0);
      const seg = MINION_TS.slice(i, i + 120);
      expect(seg).toContain(`{ track: '${call}', vol: 0.35, at: 20 }`);
    }
  });
});
