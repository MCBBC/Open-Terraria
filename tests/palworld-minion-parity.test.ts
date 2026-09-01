// 1457 Palworld 联动召唤物六件授予侧回归（docs/audit/item-audit-2026-08-22.md
// 「Palworld 六件 389-394」，标杆 Terarria1457/——1456 无此内容）：
//   ① 四杖 SetDefaults 映射（Item.cs:47345-47530）：6148→1112/6149→1113/
//      6161→1118/6164→1119 + 伤/击退/useTime
//   ② 驱逐链（Player.cs:52335-52440 FreeUpPetsAndMinions + ProjectileID.cs:401）：
//      MinionSacrificable 四件入表；1093/1112 同族互清、1094↔1113 跨型互清
//   ③ buff 授予+维护链（Player.cs:43205-43211 授予 + :10830-10933 UpdateBuffs
//      维护 + :50087-50105 弹侧 timeLeft=2 续命）
//   ④ SpawnMinionOnCursor（Player.cs:50093-50125）出生点钳制 + 6161 普通 shoot
//      路径例外（:49962-49964）+ 召唤入口后置冷却（:48945 localAI[0]=30 /
//      :50115 ai[0]=45）
//   ⑤ 弹本体 AI 关键态（Projectile.cs:50014-52160 AI_067 flag8/flag9 +
//      :59100+ AI_026 flag8 + :62566-62753 AI_026 flag10 射击段）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { projectileData } from '../src/data/vanillaProjectiles';
import projFramesJson from '../src/data/vanilla-projframes.json';
import { freeUpMinionsForSummon, MINION_SACRIFICABLE, PALWORLD_MINION_BUFFS } from '../src/core/Game';
import { BuffType, BUFF_DEFS, buffTypeByVanilla } from '../src/stats/Buffs';
import { MinionProj } from '../src/entities/MinionProj';
import { Arrow } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_TS = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const MINION_TS = readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8');

// ---------------------------------------------------------------------------
// ① 四杖 SetDefaults 映射（Item.cs:47345-47530）
// ---------------------------------------------------------------------------
describe('① 四杖 itemCombat 映射（Item.cs:47345-47530）', () => {
  it('shoot 映射：6148→1112 / 6149→1113 / 6161→1118 / 6164→1119', () => {
    expect(itemCombat(6148)!.shoot).toBe(1112);
    expect(itemCombat(6149)!.shoot).toBe(1113);
    expect(itemCombat(6161)!.shoot).toBe(1118);
    expect(itemCombat(6164)!.shoot).toBe(1119);
  });
  it('伤害/击退/useTime：22/2/15、40/3/15、5/2/36、40/4/36', () => {
    // Item.cs:47346-47349（dmg22 kb2）/ :47366-47369（40/3）/ :47488-47491（5/2，
    // useAnimation=36 :47499-47500）/ :47507-47512（40/4,36）
    expect([itemCombat(6148)!.damage, itemCombat(6148)!.knockBack, itemCombat(6148)!.useTime]).toEqual([22, 2, 15]);
    expect([itemCombat(6149)!.damage, itemCombat(6149)!.knockBack, itemCombat(6149)!.useTime]).toEqual([40, 3, 15]);
    expect([itemCombat(6161)!.damage, itemCombat(6161)!.knockBack, itemCombat(6161)!.useTime]).toEqual([5, 2, 36]);
    expect([itemCombat(6164)!.damage, itemCombat(6164)!.knockBack, itemCombat(6164)!.useTime]).toEqual([40, 4, 36]);
  });
  it('combatWeapon 分流：四件全 kind=summon 非哨兵（vanillaItemCombat c.summon 门）', () => {
    for (const vid of [6148, 6149, 6161, 6164]) {
      const cw = combatWeapon({ key: `vi_${vid}_x` });
      expect(cw?.kind, `vid ${vid}`).toBe('summon');
      expect((cw as { sentry?: boolean }).sentry, `vid ${vid}`).toBe(false);
    }
  });
  it('弹型 SetDefaults 数据（Projectile.cs:10368-10487）+ 帧表（Main.cs:8696-8700）', () => {
    expect(projectileData(1112)).toMatchObject({ aiStyle: 67, minion: true });
    expect(projectileData(1113)).toMatchObject({ aiStyle: 26, minion: true });
    expect(projectileData(1118)).toMatchObject({ aiStyle: 67, minion: true });
    expect(projectileData(1119)).toMatchObject({ aiStyle: 206, minion: true });
    const pf = projFramesJson as Record<string, number>;
    expect(pf['1112']).toBe(28);
    expect(pf['1118']).toBe(20);
    expect(pf['1119']).toBe(9);
    expect(pf['1113']).toBeUndefined();   // 单帧（Main.projFrames 缺省 1）
  });
});

// ---------------------------------------------------------------------------
// ② 驱逐链（FreeUpPetsAndMinions :52335-52440 + ProjectileID.cs:401）
// ---------------------------------------------------------------------------
const player = new Player(60 * 16, 90 * 16, new Inventory());
const mk = (projId: number): MinionProj =>
  new MinionProj(player.cx, player.cy - 40, projId, 10, 2, false, 0, false, () => player);

describe('② 驱逐链（:52335-52440）', () => {
  it('MinionSacrificable（ProjectileID.cs:401）含 1112/1113/1118/1119', () => {
    for (const s of [1112, 1113, 1118, 1119]) expect(MINION_SACRIFICABLE.has(s)).toBe(true);
  });
  it('召 1112 清 1093+1112 同族（:52340-52350），异型 375 不动', () => {
    const a = mk(1093), b = mk(1112), other = mk(375);
    freeUpMinionsForSummon(1112, [a, b, other], 10);
    expect(a.dead).toBe(true);
    expect(b.dead).toBe(true);
    expect(other.dead).toBe(false);
  });
  it('召 1113 跨型清 1094 不清同型 1113（:52351-52360 flag 门）', () => {
    const old = mk(1094), same = mk(1113);
    freeUpMinionsForSummon(1113, [old, same], 10);
    expect(old.dead).toBe(true);
    expect(same.dead).toBe(false);
  });
  it('召 1094 跨型清 1113 不清 1093（既有行为保持 + 1457 扩展半边）', () => {
    const old = mk(1113), keep = mk(1093);
    freeUpMinionsForSummon(1094, [old, keep], 10);
    expect(old.dead).toBe(true);
    expect(keep.dead).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ③ buff 授予+维护链（:43205-43211 / :10830-10933 / :50087-50105）
// ---------------------------------------------------------------------------
describe('③ buff 授予+维护链', () => {
  it('PALWORLD_MINION_BUFFS 映射 1112→389 / 1113→390 / 1118→393 / 1119→394', () => {
    expect(Object.fromEntries(PALWORLD_MINION_BUFFS.map((x) => [x.proj, x.buff])))
      .toEqual({ 1112: 389, 1113: 390, 1118: 393, 1119: 394 });
  });
  it('buff id → 本仓 BuffType 反查（BUFF_DEFS.vanillaBuff 389-394 全登记）', () => {
    expect(buffTypeByVanilla(389)).toBe(BuffType.PalworldMinionTrustyCattiva);
    expect(buffTypeByVanilla(390)).toBe(BuffType.PalworldMinionTrustyFoxsparks);
    expect(buffTypeByVanilla(393)).toBe(BuffType.ClayPotMinion);
    expect(buffTypeByVanilla(394)).toBe(BuffType.ForbiddenMinion);
    expect(BUFF_DEFS[BuffType.PalworldMountTrustyChillet]?.vanillaBuff).toBe(391);
    expect(BUFF_DEFS[BuffType.PalworldMountTrustyChilletIgnis]?.vanillaBuff).toBe(392);
  });
  it('维护链落点：fixedUpdate 直写 300s（buffTime=18000）/无弹 DelBuff；summon 分支授予 300s', () => {
    // Game.ts fixedUpdate（UpdateBuffs :10830-10933 等价）+ case 'summon' 授予段
    expect(GAME_TS).toContain('buffs.set(bt, 300)');
    expect(GAME_TS).toContain('buffs.remove(bt)');
    expect(GAME_TS).toContain('buffs.apply(bt, 300)');
    expect(GAME_TS).toContain('PALWORLD_MINION_BUFFS.find((x) => x.proj === cw.shoot)');
  });
  it('弹侧续命等价：1112/1118 走 palGroundStep（AI_067 timeLeft=2 由维护链承接）', () => {
    expect(MINION_TS).toContain('this.projId === 1112 || this.projId === 1118');
    expect(MINION_TS).toContain('palGroundStep');
  });
});

// ---------------------------------------------------------------------------
// ④ SpawnMinionOnCursor 出生点/入口分支（:48924-48960 / :49962-49964 / :50093-50125）
// ---------------------------------------------------------------------------
describe('④ 召唤入口分支（Game.ts case summon）', () => {
  it('通用出生点 = 鼠标世界点经 clampPointToPlayerReachableArea（:50095-50096）', () => {
    expect(GAME_TS).toContain('clampPointToPlayerReachableArea(mwx, mwy)');
  });
  it('6161 走普通 shoot 路径：玩家中心出生 + 初速朝鼠标（:49962-49964/:47606-47617）', () => {
    expect(GAME_TS).toContain('critVid === 6161');
    const i = GAME_TS.indexOf('critVid === 6161');
    const seg = GAME_TS.slice(i, i + 700);
    expect(seg).toContain('owner.cx');                       // RotatedRelativePoint 等价
    expect(seg).toContain('spawned.vx');                     // 初速 = 朝鼠标 × shootSpeed
    expect(seg).toContain('cw.shootSpeed');
  });
  it('召唤入口后置冷却：6149→30（:48945）/ 6164→45（:50115 case 6164）', () => {
    expect(GAME_TS).toContain('if (cw.shoot === 1113) spawned?.armSpawnCooldown(30)');
    expect(GAME_TS).toContain('if (cw.shoot === 1119) spawned?.armSpawnCooldown(45)');
    const m = mk(1119);
    m.armSpawnCooldown(45);
    expect((m as unknown as { shootCd: number }).shootCd).toBe(45);
  });
  it('6149/1113 喷火通道同型配对（:43105/:43679 normalFoxparks 门）', () => {
    expect(GAME_TS).toContain('fVid === 5664 && m.projId === 1094');
    expect(GAME_TS).toContain('fVid === 6149 && m.projId === 1113');
  });
});

// ---------------------------------------------------------------------------
// ⑤ 弹本体 AI 关键态（AI_067 flag8/flag9 + AI_026 flag8）
// ---------------------------------------------------------------------------
const W = 200, H = 120;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number) => boolean;
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000,
    hurt: (d: number) => { e.hp -= d; return true; },
  };
  return e;
}
function makeHooks(enemies: MockEnemy[] = []) {
  const store = makeStore();
  const pl = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const projectiles: unknown[] = [];
  const sfx: string[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: pl as never,
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
    playSfxFiles: (tracks: string | string[]) => { for (const t of Array.isArray(tracks) ? tracks : [tracks]) sfx.push(t); },
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown, b: string) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { added.push(e); projectiles.push(e); },
    projectiles,
  };
  return { hooks, store, player: pl, added, projectiles, sfx };
}

describe('⑤ 帕鲁地面随从 1112/1118（AI_067 flag8/flag9）', () => {
  it('出场淡入：alphaFade 255 起每 tick -15（DoPalAppearEffect :39509-39515）', () => {
    const { hooks } = makeHooks();
    const m = mk(1112);
    expect((m as { alphaFade: number }).alphaFade).toBe(255);
    m.fixedUpdate(1, hooks);
    expect((m as { alphaFade: number }).alphaFade).toBe(240);
    for (let k = 0; k < 20; k++) m.fixedUpdate(1, hooks);
    expect((m as { alphaFade: number }).alphaFade).toBe(0);
    const m3 = mk(1113);
    expect((m3 as { alphaFade: number }).alphaFade).toBe(255);
    const m0 = mk(375);
    expect((m0 as { alphaFade: number }).alphaFade).toBe(0);
  });
  it('索敌射程分档：敌 600px——1112（num2=800 :50098）朝敌移动，1118（500 :50064）不索', () => {
    const ex = 60 * 16 + 600, ey = 90 * 16;
    {
      const { hooks } = makeHooks([mkEnemy(1, ex, ey)]);
      const m = mk(1112);
      const d0 = Math.hypot(ex - m.cx, ey - m.cy);
      for (let k = 0; k < 90; k++) m.fixedUpdate(1, hooks);
      expect(Math.hypot(ex - m.cx, ey - m.cy)).toBeLessThan(d0 - 100); // 有目标即逼近
    }
    {
      const { hooks } = makeHooks([mkEnemy(1, ex, ey)]);
      const m = mk(1118);
      for (let k = 0; k < 90; k++) m.fixedUpdate(1, hooks);
      // 500 射程外无目标 → 跟随锚（主中心旁 ≤(24+w/2)+组距），不向敌位移
      expect(Math.hypot(ex - m.cx, ey - m.cy)).toBeGreaterThan(500);
    }
  });
  it('扑击态机：贴近敌入 ai[0]=2（num10 16/30 :50492/:50498），仅该段有接触伤（:50867/:50904）', () => {
    for (const [projId, num10] of [[1112, 16], [1118, 30]] as const) {
      const groundCy = 100 * 16 - 12;   // 地表行 y=100 → 敌踏地
      const e = mkEnemy(1, 60 * 16 + 30, groundCy);
      const { hooks } = makeHooks([e]);
      // 出生盒底 2px 凌空（真值盒 14×22 后 e.cy-8 会让盒底嵌入地表 2px——原版
      // TileCollision crossing-only 落地不救嵌入盒,Collision.cs:2388 `bottom<=格顶`
      // 才接,嵌入即沉底穿行,扑击后停在地表下 16px → 侧翼点距离 >20 永不重入）
      const m = new MinionProj(e.cx - 14, e.cy - 12, projId, 10, 2, false, 0, false, () => player);
      m.fixedUpdate(1, hooks);   // 距侧翼点 <20 → 入扑击（ai[1]=num10 未减，次 tick 才进 2 段）
      expect((m as unknown as { palA0: number }).palA0).toBe(2);
      expect((m as unknown as { palA1: number }).palA1).toBe(num10);
      const hp0 = e.hp;
      m.fixedUpdate(1, hooks);   // 扑击段 contact
      expect(e.hp).toBeLessThan(hp0);
      // 扑击时长耗尽 → 回 0（num9=0 :50957-50960）→ 仍贴敌即重入扑击（原版循环：
      // ai[0]==0 索敌 → 距侧翼点 <20 再入 2），扑击链持续
      let reentered = false;
      for (let k = 0; k < num10 + 6; k++) {
        m.fixedUpdate(1, hooks);
        if ((m as unknown as { palA0: number }).palA0 === 2
          && (m as unknown as { palA1: number }).palA1 === num10) { reentered = true; break; }
      }
      expect(reentered, `projId ${projId}`).toBe(true);
    }
  });
  it('召唤双声：1112 tick1 pal_summon(0.15)、tick20 pal_cattiva(0.35)（:50893-50898）', () => {
    const { hooks, sfx } = makeHooks();
    const m = mk(1112);
    m.fixedUpdate(1, hooks);
    expect(sfx).toContain('pal_summon');
    expect(sfx).not.toContain('pal_cattiva');
    for (let k = 0; k < 19; k++) m.fixedUpdate(1, hooks);
    expect(sfx).toContain('pal_cattiva');
  });
  it('归位门：距主 >500（num3 :50050）入 ai[0]=1；1118 常规飞回、1112 主肩硬锚（:50841-50853）', () => {
    {
      const { hooks } = makeHooks();
      const m = new MinionProj(player.cx + 600, player.cy, 1118, 10, 2, false, 0, false, () => player);
      m.fixedUpdate(1, hooks);
      expect((m as unknown as { palA0: number }).palA0).toBe(1);
      const d0 = Math.hypot(player.cx - m.cx, player.cy - m.cy);
      for (let k = 0; k < 60; k++) m.fixedUpdate(1, hooks);
      expect(Math.hypot(player.cx - m.cx, player.cy - m.cy)).toBeLessThan(d0); // 飞回
    }
    {
      const { hooks } = makeHooks();
      const m = new MinionProj(player.cx + 600, player.cy, 1112, 10, 2, false, 0, false, () => player);
      m.fixedUpdate(1, hooks);   // 归位门 → ai[0]=1（次 tick 才落肩锚）
      expect((m as unknown as { palA0: number }).palA0).toBe(1);
      m.fixedUpdate(1, hooks);
      // flag8 归位 = 瞬移主肩（Center=MountedCenter+(-8dir,-24) :50844），非逐帧飞行
      expect(Math.hypot(player.cx - m.cx, (player.cy - 24) - m.cy)).toBeLessThan(10);
    }
  });
});

// ---------------------------------------------------------------------------
// ⑤A 1093 基础捣蛋猫并入 flag8（2026-08-25 白帧根因修复）。Projectile.cs:50024
//     `flag8 = type == 1093 || type == 1112` 共用同一地面态机（SetDefaults 亦全同
//     :10197-10211 vs :10365-10380）；此前 1093 走通用飞行近似 → draw 兜底
//     age/8%28 全帧循环扫到 28 帧表 14-27 白姿 hurt 带（原版 AI 永不写）
//     = 用户实报"寻敌攻击变白"根因
// ---------------------------------------------------------------------------
describe('⑤A 1093 并入 flag8 地面态机（白帧根因）', () => {
  it('分发/flag8/draw 三处覆盖 1093（:50024 共用态机）', () => {
    expect(MINION_TS).toContain('if (this.projId === 1093 || this.projId === 1112 || this.projId === 1118) { this.palGroundStep');
    expect(MINION_TS).toContain('const flag8 = this.projId === 1093 || this.projId === 1112');
    expect(MINION_TS).toContain('} else if (this.projId === 1093 || this.projId === 1112 || this.projId === 1118) {');
  });
  it('1112 专属门不外溢：扑击双轴刹/追踪保持 type==1112（:50875/:50921）', () => {
    expect(MINION_TS).toContain('if (this.projId === 1112) { this.vx *= 0.1; this.vy *= 0.1; }');
    expect(MINION_TS).toContain('if (this.projId === 1112 && tgt) {');
  });
  it('SetDefaults 真值：alphaFade 255（:10211）/判定盒 14×22（:10199-10200）', () => {
    const { hooks } = makeHooks();
    const m = mk(1093);
    expect((m as { alphaFade: number }).alphaFade).toBe(255);
    expect(m.w).toBe(14);
    expect(m.h).toBe(22);
    m.fixedUpdate(1, hooks);
    expect((m as { alphaFade: number }).alphaFade).toBe(240);
  });
  it('帧域安全：跑动 240t palFrame 恒 <14（白帧带 14-27 不可达）且走行帧 7+ 出现过', () => {
    const e = mkEnemy(1, 60 * 16 + 300, 100 * 16 - 12);
    const { hooks } = makeHooks([e]);
    const m = mk(1093);
    const seen = new Set<number>();
    for (let k = 0; k < 240; k++) {
      m.fixedUpdate(1, hooks);
      seen.add((m as unknown as { palFrame: number }).palFrame);
    }
    expect(Math.max(...seen), `帧集 ${[...seen].join(',')}`).toBeLessThan(14);
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(7);
  });
  it('索敌 num2=800（flag8 共有 :50098）：敌 600px 逼近', () => {
    const ex = 60 * 16 + 600, ey = 90 * 16;
    const { hooks } = makeHooks([mkEnemy(1, ex, ey)]);
    const m = mk(1093);
    const d0 = Math.hypot(ex - m.cx, ey - m.cy);
    for (let k = 0; k < 90; k++) m.fixedUpdate(1, hooks);
    expect(Math.hypot(ex - m.cx, ey - m.cy)).toBeLessThan(d0 - 100);
  });
  it('扑击 num10=16 + 肩扛硬锚（:50844 flag8 共有）', () => {
    {
      const groundCy = 100 * 16 - 12;
      const e = mkEnemy(1, 60 * 16 + 30, groundCy);
      const { hooks } = makeHooks([e]);
      const m = new MinionProj(e.cx - 14, e.cy - 12, 1093, 10, 2, false, 0, false, () => player);
      m.fixedUpdate(1, hooks);
      expect((m as unknown as { palA0: number }).palA0).toBe(2);
      expect((m as unknown as { palA1: number }).palA1).toBe(16);
      const hp0 = e.hp;
      m.fixedUpdate(1, hooks);
      expect(e.hp).toBeLessThan(hp0);
    }
    {
      const { hooks } = makeHooks();
      const m = new MinionProj(player.cx + 600, player.cy, 1093, 10, 2, false, 0, false, () => player);
      m.fixedUpdate(1, hooks);
      expect((m as unknown as { palA0: number }).palA0).toBe(1);
      m.fixedUpdate(1, hooks);
      expect(Math.hypot(player.cx - m.cx, (player.cy - 24) - m.cy)).toBeLessThan(10);
    }
  });
});

describe('⑥ 火绒狐 1113（AI_026 flag8 + AI_026 flag10 射击段）', () => {
  it('MINION_SHOOT 档：cd 30（:62569）/射程 1160（:62677/:62691）/弹 1097/地狱火（:11315-11318）', () => {
    // 表驱动断言经行为测试间接覆盖（表为模块私有）——此处验证射击出口
    const e = mkEnemy(1, 60 * 16 + 200, 90 * 16);
    const { hooks, added } = makeHooks([e]);
    const m = new MinionProj(e.cx - 150, e.cy - 40, 1113, 40, 3, false, 0, false, () => player);
    m.fixedUpdate(1, hooks);
    const shot = added.find((x) => x instanceof Arrow) as Arrow | undefined;
    expect(shot).toBeDefined();
    expect(shot!.projId).toBe(1097);
    expect((shot as unknown as { igniteHellfire: boolean }).igniteHellfire).toBe(true);
    expect((shot as unknown as { whipTagShot: boolean }).whipTagShot).toBe(true);
    // cd=30：30t 内不再射（:62569 num135=30；递减/开火互斥分支——归零次 tick 才射）
    added.length = 0;
    let secondShotAt = -1;
    for (let k = 1; k <= 40; k++) {
      m.fixedUpdate(1, hooks);
      if (added.some((x) => x instanceof Arrow && (x as Arrow).projId === 1097)) { secondShotAt = k; break; }
    }
    expect(secondShotAt).toBeGreaterThanOrEqual(30);   // 冷却档 30t
    expect(secondShotAt).toBeLessThanOrEqual(32);
  });
  it('1094 对照组：同弹 1097 但 OnFire 档（ai[1]=0 :11315-11318）、cd 42（:62573）', () => {
    const e = mkEnemy(1, 60 * 16 + 200, 90 * 16);
    const { hooks, added } = makeHooks([e]);
    const m = new MinionProj(e.cx - 150, e.cy - 40, 1094, 20, 3, false, 0, false, () => player);
    m.fixedUpdate(1, hooks);
    const shot = added.find((x) => x instanceof Arrow) as Arrow | undefined;
    expect(shot?.projId).toBe(1097);
    expect((shot as unknown as { ignite: boolean }).ignite).toBe(true);
    expect((shot as unknown as { igniteHellfire: boolean }).igniteHellfire).toBe(false);
  });
  it('喷火通道：1113 弹速 31.5（num17=10.5 ×3 补偿 :60074）/1094 15（num17=5 :60072）', () => {
    for (const [projId, spd] of [[1113, 31.5], [1094, 15]] as const) {
      const { hooks, added } = makeHooks();
      const m = new MinionProj(player.cx, player.cy, projId, 40, 3, false, 0, false, () => player);
      (m as { foxChannel: boolean }).foxChannel = true;
      (m as { foxAimX: number }).foxAimX = 1;
      (m as { foxAimY: number }).foxAimY = 0;
      (m as unknown as { foxT: number }).foxT = 0;
      m.fixedUpdate(1, hooks);
      const flame = added.find((x) => x instanceof Arrow) as Arrow | undefined;
      expect(flame, `projId ${projId}`).toBeDefined();
      expect(flame!.projId).toBe(1106);
      expect(Math.abs(flame!.vx - spd)).toBeLessThan(0.01);
    }
  });
  it('地狱火落敌：igniteHellfire 命中写 onFire3T 5-10s（AddBuff(323,Next(300,600)) :11315-11318）', () => {
    const e = mkEnemy(1, 60 * 16 + 200, 90 * 16);
    const { hooks, added } = makeHooks([e]);
    const m = new MinionProj(e.cx - 150, e.cy - 40, 1113, 40, 3, false, 0, false, () => player);
    m.fixedUpdate(1, hooks);
    const shot = added.find((x) => x instanceof Arrow) as Arrow;
    // 弹飞行至敌盒内（150px / 11 速 ≈ 14t）
    for (let k = 0; k < 30 && e.hp >= 100000; k++) shot.fixedUpdate(1, hooks);
    expect(e.hp).toBeLessThan(100000);
    const rec = e as unknown as { onFire3T?: number };
    expect(rec.onFire3T ?? 0).toBeGreaterThanOrEqual(5);
    expect(rec.onFire3T ?? 0).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// ⑦ 新弹命中盒真值（SetDefaults width/height——MinionProj 缺省 16×16 曾误用）
//    标杆 Terarria1457/Terraria/Projectile.cs：1112 :10365-10366 / 1113 :10381-10382 /
//    1118 :10453-10454 / 1119 :10467-10468（各 14×22 / 18×18）+ 1098 :10245-10246 /
//    1123 :10507-10508（34×34 既有先例）；数据表 vanilla-projectiles.json 同值
// ---------------------------------------------------------------------------
describe('⑦ 新弹命中盒真值（Projectile.cs SetDefaults width/height）', () => {
  it('1112/1118/1119 = 14×22、1113 = 18×18、1098/1123 = 34×34', () => {
    expect([mk(1112).w, mk(1112).h]).toEqual([14, 22]);
    expect([mk(1118).w, mk(1118).h]).toEqual([14, 22]);
    expect([mk(1119).w, mk(1119).h]).toEqual([14, 22]);
    expect([mk(1113).w, mk(1113).h]).toEqual([18, 18]);
    expect([mk(1098).w, mk(1098).h]).toEqual([34, 34]);
    expect([mk(1123).w, mk(1123).h]).toEqual([34, 34]);
  });
  it('实体盒 = 数据表真值（vanilla-projectiles.json 与 SetDefaults 对齐）', () => {
    for (const id of [1112, 1113, 1118, 1119, 1098, 1123]) {
      const m = mk(id);
      const d = projectileData(id)!;
      expect([m.w, m.h], `proj ${id}`).toEqual([d.width, d.height]);
    }
  });
  it('链外型不吃新分支：375 小鬼仍实体缺省 16×16（375 原版真值 34×26 :4591-4592,旧弹另账）', () => {
    expect([mk(375).w, mk(375).h]).toEqual([16, 16]);
  });
});

// ---------------------------------------------------------------------------
// ⑧ 火绒狐攻击叫声称（TryUsingFoxsparksAbility Player.cs:43694-43712：channeling
//    期 projectile.soundDelay<=-320 → 重置 -21 + PalFoxparksAttack（SoundID.cs:1092
//    WithVolume 0.18）——MinionProj.foxSoundCd 镜像,AI_026 首段 --soundDelay :59119）
// ---------------------------------------------------------------------------
describe('⑧ 火绒狐攻击叫声称门（foxSoundCd 镜像 ≤-320 触发/重置 -21）', () => {
  it('按住 channeling：出场第 320 拍首响,重置后第 619 拍第二响,窗口内不重复', () => {
    const { hooks } = makeHooks();
    const m = mk(1094);
    (m as { foxChannel: boolean }).foxChannel = true;
    const wav: string[] = [];
    (hooks as unknown as { playSfxWav: (f: string) => void }).playSfxWav =
      (f: string) => { wav.push(f); };
    const firedAt: number[] = [];          // 绝对拍号（镜像自 0 每 tick --）
    for (let k = 1; k <= 700; k++) {
      m.fixedUpdate(1, hooks);
      if (wav.length !== firedAt.length) firedAt.push(k);
    }
    expect(wav.every((f) => f === 'pal_foxparks_attack')).toBe(true);
    expect(firedAt).toEqual([320, 619]);   // -21 起再走 299 拍回 -320
  });
  it('非 channeling 期只递减不发声；1113 同门（Player.cs:43679 normalFoxparks 双型）', () => {
    const { hooks } = makeHooks();
    const m = mk(1113);
    const wav: string[] = [];
    (hooks as unknown as { playSfxWav: (f: string) => void }).playSfxWav =
      (f: string) => { wav.push(f); };
    for (let k = 0; k < 400; k++) m.fixedUpdate(1, hooks);
    expect(wav).toEqual([]);       // 未按住 → 门永不消费（原版门在用物品 tick 内）
    // 已过 -320 后再开通道 → 立即一响
    (m as { foxChannel: boolean }).foxChannel = true;
    m.fixedUpdate(1, hooks);
    expect(wav.filter((f) => f === 'pal_foxparks_attack').length).toBe(1);
  });
});
