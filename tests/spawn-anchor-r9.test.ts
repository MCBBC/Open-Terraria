// R9 批一——存量「中心直传=盒左上」半盒偏移（≥15px 档）回归锁（2026-09-03）
// 语义基准：原版 NewProjectile(X,Y) = 【盒心】语义（Projectile.cs:10878-10879
//   position.X = X − width×0.5 / position.Y = Y − height×0.5）；各弹类 ctor 收
//   【盒左上】（Entity.x/y），未回正 = 弹盒相对原版正确位右下偏 (w/2, h/2)。
// 批一七处（偏移 ≥15px，逐处先对原版施法支复核出生语义再修）：
//   ① 3053 暗影焰妖娃 → 496(40×40)  Player.cs:47985 直传 pointPosition（中心）
//   ② 3870 双足翼龙之怒 → 711(30×30) Player.cs:49280 直传 pointPosition[可+40px 探针]（中心）
//   ③ 1296 大地法杖 → 261(32×34)     无专支 → 通用尾支 :49957 pointPosition（中心）
//   ④ 113/218/495 魔法导弹族 → 16/34/79(32×32) :49957 通用尾支（中心；channel 连发同点）
//   ⑤ 伴生 928(34×34)               Projectile.cs:44723/:44736 直传 base.Center（中心）
//   ⑥ MonkSlam 698(75×200)          Projectile.cs:70578 直传 vector3+(dir×−15,−60)（中心；
//                                    ——ctor 旧注「左上角直传」系对 NewProjectile 语义误读，已勘）
//   ⑦ MonkGhast 700(40×40)          Projectile.cs:15254-15257 直传 targetCenter+(−num×120,0)（中心）
// 锚点纪律：resolveShotAnchor（HOUSE v8 终案=玩家盒中心）/ 杖头+18（2026-08-26 拍板备案）
//   等【锚点】一律不动，本批只把「锚点→弹盒」这一步回正（placeAtShootSpawn）。
// 桩法：tests/rain-cloud.test.ts（实体直构）+ tests/chlorophyte-respawn-gates.test.ts
//   （Object.create(Game.prototype) 桩驱动 updateUse 真接线）。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { projectileData } from '../src/data/vanillaProjectiles';
import { Arrow } from '../src/entities/Arrow';
import { MagicMissileProj, FlyingKnifeProj } from '../src/entities/MissileProj';
import { MonkSlam, MonkGhast, MonkStaffSpin, GhastlyGlaiveProj } from '../src/entities/MonkStaffFury';
import { FlailProj, FlaironSpike, DaybreakFlare, MolotovProj, placeAtShootSpawn } from '../src/entities/WeaponProj';
import { WaterSplashProj } from '../src/entities/SolutionProj';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { combatWeapon, thrownCombat } from '../src/data/vanillaItemCombat';
import { canHitLine } from '../src/physics/LineOfSight';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ===================== ① 数据面钉：批一弹盒尺寸（半盒偏移的算术基数） =====================

describe('R9 批一数据面：弹盒尺寸（vanilla-projectiles.json）', () => {
  const CASES: Array<[number, number, number, string]> = [
    [496, 40, 40, '3053 暗影焰妖娃'],
    [711, 30, 30, '3870 双足翼龙之怒'],
    [261, 32, 34, '1296 大地法杖'],
    [16, 32, 32, '113 魔法飞弹'],
    [34, 32, 32, '218 Flamelash'],
    [79, 32, 32, '495 彩虹魔杖'],
    [928, 34, 34, '757 Drippler 伴生气泡'],
    [698, 75, 200, '3835 睡章鱼砸地爆箱'],
    [700, 40, 40, '3836 骸骨长戟幽灵'],
  ];
  for (const [id, w, h, label] of CASES) {
    it(`${label}：弹 ${id} SetDefaults 盒 ${w}×${h}（半盒偏移基数千真值）`, () => {
      const pd = projectileData(id);
      expect(pd, `vanilla-projectiles.json 缺 ${id}`).toBeDefined();
      expect(pd!.width).toBe(w);
      expect(pd!.height).toBe(h);
    });
  }
});

// ============ ② 实体×helper 合成语义：各施法支的「锚点(中心)→弹盒」回正式 ============
//  锁两件事：a) ctor 不自回正（收左上直存——本批所修的病灶面）；
//           b) placeAtShootSpawn(同支调用序) 后盒心 == 传入锚点。

describe('R9 批一合成语义：ctor 收左上 + placeAtShootSpawn 盒心回正', () => {
  it('⑥ MonkSlam 698：ctor 直存左上；回正后盒心=砸地点（75×200 → 曾偏 (37.5,100)）', () => {
    const slam = new MonkSlam(500, 500, 1, 0, 150);
    expect(slam.w).toBe(75);
    expect(slam.h).toBe(200);
    expect(slam.x).toBe(500);                    // ctor 不回正（病灶本体）
    expect(slam.y).toBe(500);
    placeAtShootSpawn(slam, 500, 500);           // Game.ts spin.spawnSlam 同式
    expect(slam.cx).toBe(500);
    expect(slam.cy).toBe(500);
  });
  it('⑦ MonkGhast 700：ctor 直存左上；回正后盒心=召唤点（40×40 → 曾偏 (20,20)）', () => {
    const ghast = new MonkGhast(1000, 1000, 4, 0, 45);
    expect(ghast.w).toBe(40);
    expect(ghast.h).toBe(40);
    expect(ghast.x).toBe(1000);
    placeAtShootSpawn(ghast, 1000, 1000);
    expect(ghast.cx).toBe(1000);
    expect(ghast.cy).toBe(1000);
  });
  it('④ MagicMissileProj 16：ctor 直存左上（盒自数据面 32×32）；回正后盒心=pointPosition', () => {
    const m = new MagicMissileProj(700, 700, 6, 0, {
      projId: 16, damage: 35, knockback: 8, useTime: 10,
      channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }), payMana: () => true,
    });
    expect(m.w).toBe(32);
    expect(m.h).toBe(32);
    expect(m.x).toBe(700);
    placeAtShootSpawn(m, 700, 700);
    expect(m.cx).toBe(700);
    expect(m.cy).toBe(700);
  });
  it('③ Arrow 261：盒 32×34（非方形,曾偏 (16,17)）；回正后盒心=pointPosition', () => {
    const b = new Arrow(900, 900, 6, 0, 35, 8, 261, null, { grav: 0.3, bounce: true, life: 3600, pierce: 6 });
    expect(b.w).toBe(32);
    expect(b.h).toBe(34);
    expect(b.x).toBe(900);
    placeAtShootSpawn(b, 900, 900);
    expect(b.cx).toBe(900);
    expect(b.cy).toBe(900);
  });
  it('① Arrow 496：盒 40×40；回正后盒心=pointPosition（首拍 AI 缩径 20×scale 围绕该盒心）', () => {
    const a = new Arrow(800, 800, 9, 0, 32, 2, 496, null, { grav: 0, pierce: 3, extraUpdates: 2 });
    expect(a.w).toBe(40);
    expect(a.h).toBe(40);
    expect(a.x).toBe(800);
    placeAtShootSpawn(a, 800, 800);
    expect(a.cx).toBe(800);
    expect(a.cy).toBe(800);
  });
  it('② Arrow 711：盒 30×30；回正后盒心=muzzle（pointPosition+40px 探针位）', () => {
    const b = new Arrow(1200, 1000, 8, 0, 45, 4, 711, null, { grav: 0.1, gravDelay: 10, life: 600, pierce: 3 });
    expect(b.w).toBe(30);
    expect(b.h).toBe(30);
    expect(b.x).toBe(1200);
    placeAtShootSpawn(b, 1200, 1000);
    expect(b.cx).toBe(1200);
    expect(b.cy).toBe(1000);
  });
  it('⑤ Arrow 928：Game 支先覆写 w/h=34 再回正（序敏感——先回正会按 10×10 默认盒算错）', () => {
    const bub = new Arrow(300, 300, 1.3, 0, 30, 2, 928, null, { grav: 0.3, life: 250, pierce: 2, bounce: true });
    bub.w = 34; bub.h = 34;                      // Game.ts 14260 调用序复刻
    placeAtShootSpawn(bub, 300, 300);
    expect(bub.cx).toBe(300);
    expect(bub.cy).toBe(300);
  });
});

// ============ ③ 接线源锁：Game.ts 七处「ctor→placeAtShootSpawn」配对（防回滚闸） ============

describe('R9 批一接线源锁（src/core/Game.ts 七处配对）', () => {
  const src = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
  const WIRING: Array<[string, RegExp]> = [
    ['① 3053→496（sfArrow）',
      /new Arrow\(sfAnchor\.x, sfAnchor\.y, sfVx, sfVy,[\s\S]{0,1400}?placeAtShootSpawn\(sfArrow, sfAnchor\.x, sfAnchor\.y\);/],
    ['② 3870→711（bolt）',
      /new Arrow\(muzzleX, muzzleY, bvx, bvy,[\s\S]{0,400}?placeAtShootSpawn\(bolt, muzzleX, muzzleY\);/],
    ['③ 1296→261（b261）',
      /new Arrow\(mzX, mzY,[\s\S]{0,300}?cw\.knockback, 261, null,[\s\S]{0,400}?placeAtShootSpawn\(b261, mzX, mzY\);/],
    ['④ 魔法导弹族（m）',
      /new MagicMissileProj\(mx, my, mvx, mvy, \{[\s\S]{0,2200}?placeAtShootSpawn\(m, mx, my\);/],
    ['⑤ 伴生 928（bub，w/h=34 之后）',
      /bub\.w = 34; bub\.h = 34;[\s\S]{0,300}?placeAtShootSpawn\(bub, sx, sy\);/],
    ['⑥ MonkSlam（slam）',
      /new MonkSlam\(sx, sy, svx, svy, slamDmg\);[\s\S]{0,400}?placeAtShootSpawn\(slam, sx, sy\);/],
    ['⑦ MonkGhast（ghast）',
      /new MonkGhast\(gx, gy, gvx, gvy, gdmg\);[\s\S]{0,400}?placeAtShootSpawn\(ghast, gx, gy\);/],
  ];
  for (const [label, re] of WIRING) {
    it(`${label}：ctor 后接 placeAtShootSpawn（NewProjectile 盒心语义）`, () => {
      expect(re.test(src), `Game.ts 缺失配对：${label}`).toBe(true);
    });
  }
  it('批一边界（批四后修订）：zap 20/88 仍未列支,不得被顺手回正', () => {
    // ★R9 批二/三把 5526 链 405、248、'shot' 尾支、烟雾弹、通用投掷、410、1024、
    //  190/491/636、mkBolt 收编;批四把燃烧瓶 MolotovProj / 圣·邪·血水 WaterSplashProj /
    //  火云伴生 400-402 收编（见下方批四 describe）。以下【仍未列支】面必须保持直传
    //  （直传体=各支构造→add 之间不得出现 placeAtShootSpawn）：
    //  · zap 20/88（+2/+3,未派单点,锚=zapA 中心）
    const seg = (from: RegExp, to: RegExp): string => {
      const a = src.search(from);
      expect(a, `起点缺失:${from}`).toBeGreaterThanOrEqual(0);
      const rest = src.slice(a);
      const m = rest.match(to);
      expect(m, `终点缺失:${to}`).not.toBeNull();
      return rest.slice(0, (m?.index ?? 0) + (m?.[0].length ?? 0));
    };
    expect(seg(/new Arrow\(zapA\.x, zapA\.y,/, /this\.entities\.add\(zap, 'projectiles'\);/))
      .not.toContain('placeAtShootSpawn');
  });
});

// ============ ④ 端到端真接线：Game 桩驱动 updateUse + 直调实体回调闭包 ============

const MWX = 200, MWY = 100;   // 桩 screenToWorld 固定鼠标世界点（瞄准向 = 该点−玩家中心）

function r9Game(vid: number): {
  g: GameHooks & Record<string, unknown>;
  player: Player;
  added: unknown[];
  updateUse: () => void;
} {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const world = new World(160, 160, 7, 'r9');
  // 高空开阔带（行 12-60 全清）——玩家 (60,24) 格，canHit/muzzle 探针不受地形干扰
  for (let x = 0; x < 160; x++) {
    for (let y = 12; y <= 60; y++) world.store.setTileSilent(x, y, 0, 0, 0);
  }
  const player = new Player(60 * TILE, 24 * TILE, new Inventory());
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `VANILLA_ITEM_KEY_BY_ID 缺 ${vid}`).toBeDefined();
  player.inv.add(ITEM_BY_KEY[key!], 1);
  const added: unknown[] = [];
  g.player = player;
  g.world = world;
  g.entities = {
    critters: [], npcs: [], enemies: [], projectiles: [],
    add: (e: unknown, b: string) => { if (b === 'projectiles') added.push(e); },
  };
  g.input = {
    mouseDown: true, mouseHeld: true, mouseX: 640, mouseY: 200,
    rightDown: false, uiBlocking: false, downAction: () => false,
  };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [MWX, MWY] };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {}, playSfxFiles: () => true };
  g.cb = { onInventoryChanged: () => {} };
  return {
    g: g as unknown as GameHooks & Record<string, unknown>,
    player, added,
    updateUse: () => (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60),
  };
}

describe('R9 批一端到端：updateUse 真接线出生盒心 = 原版 NewProjectile 锚点', () => {
  it('前置：七件物品分类器路由符合预期（kind 漂移会让分支不可达=假绿）', () => {
    // ★4272 Drippler Crippler = 弹 757 的发射物（757 是【投射物】id,非物品 id）
    const cwOf = (vid: number) => combatWeapon({ vid, key: '' });
    expect(cwOf(3053)?.kind).toBe('magic');
    expect(cwOf(3870)?.kind).toBe('magic');
    expect(cwOf(1296)?.kind).toBe('magic');
    expect(cwOf(113)?.kind).toBe('magic');
    expect(cwOf(4272)?.kind).toBe('flail');
    expect(cwOf(4272)?.shoot).toBe(757);
    expect(cwOf(3835)?.kind).toBe('shot');
    expect(cwOf(3836)?.kind).toBe('shot');
  });

  it('① 3053 暗影焰妖娃 → 496 出生盒心 = pointPosition（玩家中心,Player.cs:47985）', () => {
    const { g, player, added, updateUse } = r9Game(3053);
    void g;
    updateUse();
    const shots = added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 496) as Arrow[];
    expect(shots.length).toBeGreaterThanOrEqual(1);
    for (const s of shots) {
      expect(s.cx).toBe(player.cx);
      expect(s.cy).toBe(player.cy);
    }
  });

  it('③ 1296 大地法杖 → 261 出生盒心 = pointPosition（玩家中心,通用尾支 :49957）', () => {
    const { player, added, updateUse } = r9Game(1296);
    updateUse();
    const boulders = added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 261) as Arrow[];
    expect(boulders.length).toBe(1);
    expect(boulders[0].cx).toBe(player.cx);
    expect(boulders[0].cy).toBe(player.cy);
    expect(boulders[0].w).toBe(32);
    expect(boulders[0].h).toBe(34);
  });

  it('② 3870 双足翼龙之怒 → 711×3 各出生盒心 = muzzle（pointPosition+40px 探针,:49280）', () => {
    const { g, player, added, updateUse } = r9Game(3870);
    updateUse();
    const bolts = added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 711) as Arrow[];
    expect(bolts.length).toBe(3);
    // 期望 muzzle = 玩家中心 + 瞄准单位×40（canHitLine 过 → 前移；不过 → 原地,Game 同式）
    const ang = Math.atan2(MWY - player.cy, MWX - player.cx);
    const outX = Math.cos(ang) * 40, outY = Math.sin(ang) * 40;
    const store = (g as unknown as { world: World }).world.store;
    const advanced = canHitLine(store, player.cx, player.cy, 0, 0,
      player.cx + outX, player.cy + outY, 0, 0);
    const mx = advanced ? player.cx + outX : player.cx;
    const my = advanced ? player.cy + outY : player.cy;
    for (const b of bolts) {
      expect(b.cx).toBeCloseTo(mx, 6);
      expect(b.cy).toBeCloseTo(my, 6);
    }
  });

  it('④ 113 魔法飞弹 → 16 出生盒心 = pointPosition;channel 续发(fireExtra 杖头锚)盒心同步回正', () => {
    const { player, added, updateUse } = r9Game(113);
    updateUse();
    const missiles = added.filter((e) => e instanceof MagicMissileProj) as MagicMissileProj[];
    expect(missiles.length).toBe(1);
    expect(missiles[0].projId).toBe(16);
    expect(missiles[0].cx).toBe(player.cx);
    expect(missiles[0].cy).toBe(player.cy);
    // 续发闭包（Game.ts fireExtra——锚点=杖头+18 拍板备案不动,盒心回正随 spawnMissile 单点）
    const fireExtra = (missiles[0] as unknown as { fireExtra?: () => void }).fireExtra;
    expect(fireExtra).toBeDefined();
    fireExtra!();
    expect(added.length).toBe(2);
    const extra = added[1] as MagicMissileProj;
    const aRaw = Math.atan2(MWY - player.cy, MWX - player.cx);
    expect(extra.cx).toBeCloseTo(player.cx + Math.cos(aRaw) * 18, 6);
    expect(extra.cy).toBeCloseTo(player.cy + Math.sin(aRaw) * 18, 6);
  });

  it('⑤ 4272 Drippler Crippler（弹 757）→ spawnProj(928) 出生盒心 = 链球 Center（base.Center,:44723）', () => {
    const { added, updateUse } = r9Game(4272);
    updateUse();
    const flail = added.find((e) => e instanceof FlailProj) as FlailProj | undefined;
    expect(flail, 'updateUse 未产出 FlailProj（4272 路由/施法门回归）').toBeDefined();
    expect(flail!.projId).toBe(757);
    flail!.spawnProj!(flail!.cx, flail!.cy, 1.3, 0, 928, 30, 2);   // bubble757 原样调用形
    const bub = added.find((e) => e instanceof Arrow && (e as Arrow).projId === 928) as Arrow;
    expect(bub).toBeDefined();
    expect(bub.w).toBe(34);
    expect(bub.h).toBe(34);
    expect(bub.cx).toBe(flail!.cx);
    expect(bub.cy).toBe(flail!.cy);
  });

  it('⑥ 3835 睡章鱼 → spin.spawnSlam(698) 出生盒心 = 砸地点（vector3+(dir×−15,−60),:70578）', () => {
    const { added, updateUse } = r9Game(3835);
    updateUse();
    const spin = added.find((e) => e instanceof MonkStaffSpin) as MonkStaffSpin | undefined;
    expect(spin, 'updateUse 未产出 MonkStaffSpin（3835 路由/施法门回归）').toBeDefined();
    const px = spin!.cx + 137, py = spin!.cy + 311;   // 任意非整点（半盒偏移立即现形）
    spin!.spawnSlam(px, py, 1, 0, 150);
    const slam = added.find((e) => e instanceof MonkSlam) as MonkSlam;
    expect(slam).toBeDefined();
    expect(slam.cx).toBe(px);
    expect(slam.cy).toBe(py);
    expect(slam.w).toBe(75);
    expect(slam.h).toBe(200);
  });

  it('⑦ 3836 骸骨长戟 → glaive.spawnGhast(700) 出生盒心 = 召唤点（targetCenter+(−num×120),:15254）', () => {
    const { added, updateUse } = r9Game(3836);
    updateUse();
    const glaive = added.find((e) => e instanceof GhastlyGlaiveProj) as GhastlyGlaiveProj | undefined;
    expect(glaive, 'updateUse 未产出 GhastlyGlaiveProj（3836 路由/施法门回归）').toBeDefined();
    const px = glaive!.cx - 250, py = glaive!.cy + 90;
    glaive!.spawnGhast(px, py, 4, 0, 45);
    const ghast = added.find((e) => e instanceof MonkGhast) as MonkGhast;
    expect(ghast).toBeDefined();
    expect(ghast.cx).toBe(px);
    expect(ghast.cy).toBe(py);
    expect(ghast.w).toBe(40);
    expect(ghast.h).toBe(40);
  });
});

// #############################################################################
// # R9 批二（8-14px 档,2026-09-03）——逐处先读原版施法支确认出生语义再对齐      #
// #   #4 2623 泡泡枪→410  Player.cs:48879-48887 三泡同点 NewProjectile(pointPosition)
// #   #6 5461 杀意牌→1024 Player.cs:49704-49760 四相位全 NewProjectile(pointPosition)
// #   #14 1156 食人鱼→190 Player.cs:48847-48866 3−alive 补满 NewProjectile(pointPosition)
// #   #15 3030 飞刀→491   无专支 → 通用尾支 :49957（任务书"(477)"系笔误:477=3009
// #                        飞镖弹药,14×14=+7px,走 ranged 弹药链 ax/ay=批四域未动）
// #   #16 3543 破晓→636   通用尾支 :49957（:47635 Y=height/3 锚偏移=登记面不动）
// #   #18 'shot' 通用尾支 :49957（404/405 走 'flairon'/'flail' 专支不经此路）
// #   #20 1168 烟雾弹→196 投掷族穿透 :49957（px/py=HOUSE +14/y−4 锚,批四登记不动）
// #   #22 通用投掷        同上（大件 18×18=+9px 为目标档,小件随单点收口）
// #   #25 伴生 248        Projectile.cs:44952/:45208 直传 base.Center
// # 批三（≤7px 单点收口）：mkBolt（宝石支 :49779-49904/通用尾支 :49957,百件级）
// #   + 5526 flail 链伴生 405（Projectile.cs:44908 直传 base.Center;2611 支已清偿）
// #############################################################################

describe('R9 批二数据面：弹盒尺寸（8-14px 半盒偏移算术基数）', () => {
  const CASES: Array<[number, number, number, string]> = [
    [1024, 16, 16, '#6 5461 杀意牌'],
    [190, 22, 22, '#14 1156 食人鱼枪'],
    [491, 26, 26, '#15 3030 飞刀'],
    [636, 16, 16, '#16 3543 破晓'],
    [196, 16, 16, '#20 1168 烟雾弹'],
    [410, 14, 14, '#4 2623 泡泡枪'],
    [248, 18, 18, '#25 247 FlowerPow 伴生'],
    // 对照钉（未列支,批四域）：任务书"(477)"勘误定位——477=3009 飞镖弹药（14×14=+7px）,
    // 经吹箭筒/飞镖手枪走 ranged 弹药链 ax/ay（HOUSE v5 锚,本批未动）
    [477, 14, 14, '对照 3009 飞镖弹药（ranged 弹药链,未列支）'],
  ];
  for (const [id, w, h, label] of CASES) {
    it(`${label}：弹 ${id} SetDefaults 盒 ${w}×${h}`, () => {
      const pd = projectileData(id);
      expect(pd, `vanilla-projectiles.json 缺 ${id}`).toBeDefined();
      expect(pd!.width).toBe(w);
      expect(pd!.height).toBe(h);
    });
  }
});

describe('R9 批二/三合成语义：ctor 收左上 + placeAtShootSpawn 盒心回正', () => {
  const CENTER = (e: { x: number; y: number; w: number; h: number }, cx: number, cy: number): void => {
    placeAtShootSpawn(e, cx, cy);
    expect(e.x + e.w / 2).toBe(cx);
    expect(e.y + e.h / 2).toBe(cy);
  };
  it('#6 杀意牌 1024：Arrow 16×16（曾偏 (8,8)）', () => {
    const c = new Arrow(500, 500, 6, -2, 40, 2, 1024, null, { grav: 0, pierce: 1 });
    expect(c.w).toBe(16); expect(c.h).toBe(16); expect(c.x).toBe(500);
    CENTER(c, 500, 500);
  });
  it('#14 食人鱼枪 190：Arrow 22×22（曾偏 (11,11)）', () => {
    const p = new Arrow(800, 800, 9, 0, 25, 0, 190, null, { grav: 0, life: 3600 });
    expect(p.w).toBe(22); expect(p.h).toBe(22); expect(p.x).toBe(800);
    CENTER(p, 800, 800);
  });
  it('#15 飞刀 491：FlyingKnifeProj 26×26（曾偏 (13,13)）', () => {
    const k = new FlyingKnifeProj(700, 700, 8, 0, 46, 1.5,
      { channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }) });
    expect(k.w).toBe(26); expect(k.h).toBe(26); expect(k.x).toBe(700);
    CENTER(k, 700, 700);
  });
  it('#16 破晓 636：DaybreakFlare 16×16（曾偏 (8,8)）', () => {
    const f = new DaybreakFlare(900, 900, 10, -3, 32, 5);
    expect(f.w).toBe(16); expect(f.h).toBe(16); expect(f.x).toBe(900);
    CENTER(f, 900, 900);
  });
  it('#20 烟雾弹 196：Arrow 16×16（曾偏 (8,8)）', () => {
    const s = new Arrow(300, 300, 3, -1, 0, 0, 196, null,
      { grav: 0.2, life: 600, pierce: -1, bounce: true });
    expect(s.w).toBe(16); expect(s.h).toBe(16); expect(s.x).toBe(300);
    CENTER(s, 300, 300);
  });
  it('#4 泡泡枪 410：Arrow 14×14（曾偏 (7,7)）', () => {
    const b = new Arrow(600, 600, 5, 1, 8, 0, 410, null, { grav: 0, life: 100, pierce: 1 });
    expect(b.w).toBe(14); expect(b.h).toBe(14); expect(b.x).toBe(600);
    CENTER(b, 600, 600);
  });
  it('#25 伴生 248：Arrow 18×18（曾偏 (9,9)）', () => {
    const d = new Arrow(400, 400, 10, 0, 30, 2, 248, null, { grav: 0, life: 1200 });
    expect(d.w).toBe(18); expect(d.h).toBe(18); expect(d.x).toBe(400);
    CENTER(d, 400, 400);
  });
  it('批三 mkBolt：宝石珠 121/水矢 27/恶魔镰 42 各型盒随型回正（helper 读 e.w/h）', () => {
    for (const [pid, w] of [[121, 10], [27, 16], [42, 10], [94, 8]] as const) {
      const b = new Arrow(111, 222, 4, 4, 15, 2, pid, null, { grav: 0, life: 3600 });
      expect(b.w).toBe(w);
      placeAtShootSpawn(b, 111, 222);
      expect(b.cx).toBe(111);
      expect(b.cy).toBe(222);
    }
  });
});

describe('R9 批二接线源锁（src/core/Game.ts 九处配对）', () => {
  const src = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
  const WIRING: Array<[string, RegExp]> = [
    ['#4 2623→410（bub）',
      /new Arrow\(mzX, mzY,[\s\S]{0,300}?410, null, \{ grav: 0, life: 100, pierce: 1 \}\);[\s\S]{0,400}?placeAtShootSpawn\(bub, mzX, mzY\);/],
    ['#6 5461→1024（card,fireCard 闭包）',
      /new Arrow\(mzX, mzY, cvx, cvy,[\s\S]{0,450}?placeAtShootSpawn\(card, mzX, mzY\);/],
    ['#14 1156→190（pg）',
      /new Arrow\(this\.player\.cx, this\.player\.cy,[\s\S]{0,700}?PIRANHA_PROJ, null,[\s\S]{0,400}?placeAtShootSpawn\(pg, this\.player\.cx, this\.player\.cy\);/],
    ['#15 3030→491（knife）',
      /new FlyingKnifeProj\(this\.player\.cx, this\.player\.cy,[\s\S]{0,700}?placeAtShootSpawn\(knife, this\.player\.cx, this\.player\.cy\);/],
    ['#16 3543→636（flare）',
      /new DaybreakFlare\(this\.player\.cx, this\.player\.cy,[\s\S]{0,900}?placeAtShootSpawn\(flare, this\.player\.cx, this\.player\.cy\);/],
    ['#18 shot 尾支（shotArrow）',
      /pierce: HOMING_FAMILY_PIERCE\.has\(cw\.shoot\)[\s\S]{0,600}?placeAtShootSpawn\(shotArrow, shotTip\.x, shotTip\.y\);/],
    ['#20 1168→196（smk）',
      /196,\s*\n\s*null, \{ grav: 0\.2, life: 600, pierce: -1, bounce: true \}\);[\s\S]{0,800}?placeAtShootSpawn\(smk, px, py\);/],
    ['#22 通用投掷（thrownArrow）',
      /tumblePoseLock: THROWN_POSE_LOCK\.has\(tc\.shoot\)[\s\S]{0,900}?placeAtShootSpawn\(thrownArrow, px, py\);/],
    ['#25 伴生 248（bud）',
      /const bud = new Arrow\(sx, sy, svx, svy, dmg, sKb, sProj, null,[\s\S]{0,500}?placeAtShootSpawn\(bud, sx, sy\);/],
    ['批三 mkBolt（b,百件级单点）',
      /gem: gemFlags, gemPhase: phase \}\);[\s\S]{0,400}?placeAtShootSpawn\(b, bx, by\);/],
    ['批三 5526 链伴生 405（−7,−7 盒心回正）',
      /new FlaironSpike\(sx - 7, sy - 7, svx, svy, dmg, sKb\)/],
  ];
  for (const [label, re] of WIRING) {
    it(`${label}：ctor 后接盒心回正（NewProjectile 中心语义）`, () => {
      expect(re.test(src), `Game.ts 缺失配对：${label}`).toBe(true);
    });
  }
});

describe('R9 批二端到端：updateUse 真接线出生盒心 = 原版 NewProjectile 锚点', () => {
  it('前置：批二物品分类器路由符合预期（kind 漂移会让分支不可达=假绿）', () => {
    const cwOf = (vid: number) => combatWeapon({ vid, key: '' });
    expect(cwOf(5461)?.kind).toBe('magic');
    expect(cwOf(5461)?.shoot).toBe(1024);
    expect(cwOf(2623)?.kind).toBe('magic');
    expect(cwOf(2623)?.shoot).toBe(410);
    expect(cwOf(1156)?.kind).toBe('shot');
    expect(cwOf(1156)?.shoot).toBe(190);
    expect(cwOf(3030)?.kind).toBe('shot');
    expect(cwOf(3030)?.shoot).toBe(491);
    expect(cwOf(3543)?.kind).toBe('shot');
    expect(cwOf(3543)?.shoot).toBe(636);
    expect(thrownCombat({ vid: 1168, key: 'vi_1168' })?.shoot).toBe(196);
    expect(thrownCombat({ vid: 4765, key: 'vi_4765' })?.shoot).toBe(868);
  });

  it('#6 5461 杀意牌 → 1024 出生盒心 = pointPosition（Player.cs:49704 四相位同点）', () => {
    const { g, player, added, updateUse } = r9Game(5461);
    (g as unknown as { killingCardPhase: number }).killingCardPhase = 0;
    updateUse();
    const cards = added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 1024) as Arrow[];
    expect(cards.length).toBeGreaterThanOrEqual(1);
    for (const c of cards) {
      expect(c.cx).toBe(player.cx);
      expect(c.cy).toBe(player.cy);
    }
  });

  it('#4 2623 泡泡枪 → 410×3 出生盒心 = pointPosition（:48879 三泡同点,散布在速度）', () => {
    const { player, added, updateUse } = r9Game(2623);
    updateUse();
    const bubbles = added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 410) as Arrow[];
    expect(bubbles.length).toBe(3);
    for (const b of bubbles) {
      expect(b.cx).toBe(player.cx);
      expect(b.cy).toBe(player.cy);
    }
  });

  it('#14 1156 食人鱼枪 → 190×3 出生盒心 = pointPosition（:48847 3−alive 补满）', () => {
    const { player, added, updateUse } = r9Game(1156);
    updateUse();
    const fish = added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 190) as Arrow[];
    expect(fish.length).toBe(3);
    for (const p of fish) {
      expect(p.cx).toBe(player.cx);
      expect(p.cy).toBe(player.cy);
    }
  });

  it('#15 3030 飞刀 → 491 出生盒心 = pointPosition（通用尾支 :49957）', () => {
    const { player, added, updateUse } = r9Game(3030);
    updateUse();
    const knife = added.find((e) => e instanceof FlyingKnifeProj) as FlyingKnifeProj | undefined;
    expect(knife, 'updateUse 未产出 FlyingKnifeProj（3030 路由/施法门回归）').toBeDefined();
    expect(knife!.cx).toBe(player.cx);
    expect(knife!.cy).toBe(player.cy);
  });

  it('#16 3543 破晓 → 636 出生盒心 = pointPosition（通用尾支 :49957）', () => {
    const { player, added, updateUse } = r9Game(3543);
    updateUse();
    const flare = added.find((e) => e instanceof DaybreakFlare) as DaybreakFlare | undefined;
    expect(flare, 'updateUse 未产出 DaybreakFlare（3543 路由/施法门回归）').toBeDefined();
    expect(flare!.cx).toBe(player.cx);
    expect(flare!.cy).toBe(player.cy);
  });

  it('批三 741 蓝晶杖 → 宝石珠 123×2 出生盒心 = pointPosition（mkBolt 单点收口）', () => {
    const { player, added, updateUse } = r9Game(741);
    updateUse();
    const bolts = added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 123) as Arrow[];
    expect(bolts.length).toBeGreaterThanOrEqual(1);
    for (const b of bolts) {
      expect(b.cx).toBe(player.cx);
      expect(b.cy).toBe(player.cy);
    }
  });
});

describe('R9 批二/三 thrown 链与伴生端到端', () => {
  /** thrown 链（updateUse 内 else-if 分支）专用桩：orphan-b1 updUseGame 同式精简,
   *  角度口径 = 画布中心→鼠标屏点（该分支 ang 非玩家中心制,本仓现状 1:1）。 */
  function thrownGame(vid: number): {
    g: GameHooks & Record<string, unknown>;
    player: Player;
    added: unknown[];
    updateUse: () => void;
  } {
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    const world = new World(160, 160, 7, 'r9-thrown');
    for (let x = 0; x < 160; x++) {
      for (let y = 12; y <= 60; y++) world.store.setTileSilent(x, y, 0, 0, 0);
    }
    const player = new Player(60 * TILE, 24 * TILE, new Inventory());
    const key = VANILLA_ITEM_KEY_BY_ID[vid];
    expect(key, `VANILLA_ITEM_KEY_BY_ID 缺 ${vid}`).toBeDefined();
    player.inv.add(ITEM_BY_KEY[key!], 3);
    const added: unknown[] = [];
    g.player = player;
    g.world = world;
    g.entities = {
      critters: [], npcs: [], enemies: [], projectiles: [],
      add: (e: unknown, b: string) => { if (b === 'projectiles') added.push(e); },
    };
    g.input = {
      mouseDown: true, mouseHeld: true, mouseX: 640, mouseY: 200,
      rightDown: false, uiBlocking: false, downAction: () => false,
    };
    g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [200, 100] };
    g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
    g.smartCursor = { showing: false };
    g.annotateMode = false;
    g.prevSwingMouse = false;
    g.mining = null;
    g.housingMode = null;
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {}, playSfxFiles: () => true };
    g.cb = { onInventoryChanged: () => {} };
    return {
      g: g as unknown as GameHooks & Record<string, unknown>,
      player, added,
      updateUse: () => (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60),
    };
  }

  it('#20 1168 烟雾弹 → 196 出生盒心 = 出手锚（px,py；+14 前移=批四登记偏离不动）', () => {
    const { g, player, added, updateUse } = thrownGame(1168);
    void g;
    updateUse();
    const smokes = added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 196) as Arrow[];
    expect(smokes.length).toBe(1);
    // 分支角度口径：atan2(mouseY−画布高/2, mouseX−画布宽/2)（该分支字面,与 useCombatWeapon 不同）
    // ★2026-09-03 锚拆除:原版出生=玩家中心(无前移),断言同步
    expect(smokes[0].cx).toBe(player.cx);
    expect(smokes[0].cy).toBe(player.cy);
  });

  it('#22 通用投掷 4765 三地球仪 → 868 出生盒心 = 出手锚（18×18 曾偏 (9,9)）', () => {
    const { player, added, updateUse } = thrownGame(4765);
    updateUse();
    const globes = added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 868) as Arrow[];
    expect(globes.length).toBe(1);
    // ★2026-09-03 锚拆除:出生=玩家中心
    expect(globes[0].cx).toBe(player.cx);
    expect(globes[0].cy).toBe(player.cy);
  });

  it('批三 5526 FlaironFlail 链 → spawnProj(405) 出生盒心 = 链球 Center（Projectile.cs:44908）', () => {
    const { added, updateUse } = r9Game(5526);
    updateUse();
    const flail = added.find((e) => e instanceof FlailProj) as FlailProj | undefined;
    expect(flail, 'updateUse 未产出 FlailProj（5526 路由/施法门回归）').toBeDefined();
    expect(flail!.projId).toBe(1058);
    flail!.spawnProj!(flail!.cx, flail!.cy, 1.5, -0.6, 405, 66, 2);
    const bub = added.find((e) => e instanceof FlaironSpike) as FlaironSpike | undefined;
    expect(bub, '405 分支未产出 FlaironSpike').toBeDefined();
    expect(bub!.w).toBe(14);
    expect(bub!.cx).toBe(flail!.cx);   // −7,−7 回正后盒心=当拍链球中心
    expect(bub!.cy).toBe(flail!.cy);
  });

  // ---- R9 批四（2026-09-03）：燃烧瓶/三瓶水半盒回正 + 火云伴生修正量勘误 + 通用投掷抽查 ----

  it('批四 #19 燃烧瓶 2590 → 399(MolotovProj) 出生盒心 = 玩家中心（:49957 通用尾支）', () => {
    const { player, added, updateUse } = thrownGame(2590);
    updateUse();
    const mol = added.find((e) => e instanceof MolotovProj) as MolotovProj | undefined;
    expect(mol, 'updateUse 未产出 MolotovProj（2590 路由/施法门回归）').toBeDefined();
    expect(mol!.w).toBe(14); expect(mol!.h).toBe(14);
    expect(mol!.cx).toBe(player.cx);   // ctor 收盒左上,回正后盒心=出手锚
    expect(mol!.cy).toBe(player.cy);
    // 火云伴生（Kill :75373-75377）：breakOpen 六次 spawnFires(盒心+散布) → 各 Arrow
    //  盒心 = 传入中心（回调每次产一朵,六朵循环在 MolotovProj.breakOpen）
    for (let i = 0; i < 6; i++) mol!.spawnFires(5000, 4000, 11, 2, -1);
    const fires = added.filter((e) => e instanceof Arrow
      && (e as Arrow).projId >= 400 && (e as Arrow).projId <= 402) as Arrow[];
    expect(fires.length).toBe(6);
    for (const f of fires) {
      expect(f.cx).toBe(5000);         // 曾手动 −7,−7 按 399 盒 14×14 误算
      expect(f.cy).toBe(4000);         // 现按各自盒径回正（盒心=NewProjectile 中心）
    }
  });

  it('批四 #20 圣水 422/邪水 423/血水 3477 → 69/70/621(WaterSplashProj) 出生盒心 = 玩家中心', () => {
    for (const vid of [422, 423, 3477]) {
      const { player, added, updateUse } = thrownGame(vid);
      updateUse();
      const water = added.find((e) => e instanceof WaterSplashProj) as WaterSplashProj | undefined;
      expect(water, `${vid} 未产出 WaterSplashProj（路由/施法门回归）`).toBeDefined();
      expect(water!.w).toBe(14); expect(water!.h).toBe(14);
      expect(water!.cx).toBe(player.cx);   // 曾直传 = 弹盒右下偏 (7,7)px
      expect(water!.cy).toBe(player.cy);
    }
  });

  it('批四 #22 抽查（新锚=玩家中心）:手里剑 42→弹3 / 雪球 949→弹166 / 绳圈 985→弹171 盒心一致', () => {
    // 通用投掷支批二已接 placeAtShootSpawn——本批只按真 id 复验（scope 表"手里剑 47"
    // 系与 Unholy Arrow 47→弹4 混记;ProjectileID.Shuriken=3,ThrowingKnife=279→弹48）
    for (const [vid, pid, w] of [[42, 3, 22], [949, 166, 14], [985, 171, 14]] as const) {
      const { player, added, updateUse } = thrownGame(vid);
      // ★949 带 ammo=949（雪球炮弹药双职）→ Inventory.add 归入弹药槽 54-57,选中格
      //  落空——直写选中格规避（harness 伪影;原版雪球本可驻热栏手掷）
      (player.inv as unknown as { slots: Array<{ id: number; stack: number } | null> })
        .slots[player.inv.selected] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]!]!, stack: 3 };
      updateUse();
      const arrows = added.filter((e) => e instanceof Arrow && (e as Arrow).projId === pid) as Arrow[];
      expect(arrows.length, `${vid} 未产出弹 ${pid}`).toBeGreaterThanOrEqual(1);
      expect(arrows[0].w).toBe(w);
      expect(arrows[0].cx).toBe(player.cx);
      expect(arrows[0].cy).toBe(player.cy);
    }
  });
});

// #############################################################################
// # R9 批四（2026-09-03）——投掷链 14px 前移拆除后的余量（半盒回正 + 修正量勘误）  #
// #   #19 2590 燃烧瓶→399(MolotovProj)   无专支 → 通用尾支 :49957 盒心（14×14）   #
// #   #20 422/423/3477→69/70/621        同上（14×14,P.cs:1490-1512）             #
// #   #✓ 火云伴生 400-402               P.cs:75373-75377 NewProjectile(Center+散布)#
// #       ——红蓝 F 批注勘误:原 −7,−7 按 399 盒 14×14 误算;三型原版盒各不同            #
// #       （:4814-4833 400=14×16/401=12×14/402=6×12）→按各自盒径回正（现数据面       #
// #       三型同记 6×12 ⇒ 等价批注修正量 −3,−6）                                  #
// #   #22 抽查:手里剑 42/雪球 949/绳圈 985（通用投掷支批二已接,新锚复验）              #
// # 数据面登记（本批未修）:vanilla-projectiles.json 400/401/402 三型同记 6×12,原版  #
// #   实为嵌套 if 三档——提取器 lastMatch 吞并（同 DD2 哨兵 663/665 旧案,见          #
// #   src/data/vanillaProjectiles.ts 头注）;接线读实体 e.w/h 取径,数据面勘正后自动   #
// #   跟随,不阻断本批。                                                            #
// #############################################################################

describe('R9 批四数据面：弹盒尺寸（半盒偏移算术基数）', () => {
  const CASES: Array<[number, number, number, string]> = [
    [399, 14, 14, '#19 2590 燃烧瓶（P.cs:4803-4812）'],
    [69, 14, 14, '#20 422 圣水（P.cs:1490-1496）'],
    [70, 14, 14, '#20 423 邪水（P.cs:1498-1504）'],
    [621, 14, 14, '#20 3477 血水（P.cs:1506-1512）'],
    [3, 22, 22, '抽查 手里剑 42→弹3（ProjectileID.Shuriken,P.cs:830-836）'],
    [166, 14, 14, '抽查 雪球 949→弹166'],
    [171, 14, 14, '抽查 绳圈 985→弹171'],
  ];
  for (const [id, w, h, label] of CASES) {
    it(`${label}：弹 ${id} SetDefaults 盒 ${w}×${h}`, () => {
      const pd = projectileData(id);
      expect(pd, `vanilla-projectiles.json 缺 ${id}`).toBeDefined();
      expect(pd!.width).toBe(w);
      expect(pd!.height).toBe(h);
    });
  }
  it('火云伴生 400-402：原版三型盒各不同（P.cs:4814-4833）——接线按实体盒径取径,不钉死单值', () => {
    // json 现状三型同记 6×12（提取器嵌套 if lastMatch 吞并,数据面债另账登记）。
    // 故只钉存在性+批注勘误链路（批四 e2e 已断言盒心=中心,对任何盒径成立）——
    // 若日后按 1457 终值勘正为 14×16/12×14/6×12,本测不红,接线自动跟随。
    for (const id of [400, 401, 402]) {
      expect(projectileData(id), `vanilla-projectiles.json 缺 ${id}`).toBeDefined();
    }
  });
});

describe('R9 批四接线源锁（src/core/Game.ts 三处配对）', () => {
  const src = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
  const WIRING: Array<[string, RegExp]> = [
    ['#19 2590→399（mol）',
      /new MolotovProj\(px, py,[\s\S]{0,1600}?placeAtShootSpawn\(mol, px, py\);/],
    ['#20 422/423/3477→69/70/621（water）',
      /new WaterSplashProj\(px, py,[\s\S]{0,800}?placeAtShootSpawn\(water, px, py\);/],
    ['#✓ 火云伴生（fire,fx,fy 中心锚,勿再手动半盒）',
      /new MolotovProj\(px, py,[\s\S]{0,300}?new Arrow\(fx, fy, fvx, fvy, fdmg, 0,[\s\S]{0,800}?placeAtShootSpawn\(fire, fx, fy\);/],
  ];
  for (const [label, re] of WIRING) {
    it(`${label}：ctor 后接盒心回正（NewProjectile 中心语义）`, () => {
      expect(re.test(src), `Game.ts 缺失配对：${label}`).toBe(true);
    });
  }
});
