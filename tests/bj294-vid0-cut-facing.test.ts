// ★BJ294（2026-09-23）vid=0 敌射侧拒割位 noVanillaCut 判别面 + 型录弹运行时覆写口
//   + 结构锁 tripwire（普查登记全量锁死）。
// 病灶（红蓝-U3 定谳）：BJ293 中央割门对 vid=0（无型录行）缺省照报——SW 自造敌射弹
//   （MLDeathray 455 / InfernoHostileBlast 292 / LunarOrb 539·574 / MoonLeechProj 456 /
//   DukeSharknadoBolt 385 / DukeSharknadoTornado 384·386 / BetsyBreath 687 /
//   DD2GoblinBomb 681 / DD2OgreSmash 683 / TowerBolt 629 / Deerclops 族 961·962·965 /
//   TabletShardProj 526 / MeteorChunk 1078）越权割草/砸罐。修=独立正一位
//   `noVanillaCut`（不征用 projId——联机快照收集器 `projId !== undefined` 归 kind1
//   架构约束,InfernoHostileBlast.ts:40 注;不复用 repo hostile 位——TrapShot.hostile=
//   原版 !friendly 取反,Dart.ts:366 域警告）。
// 缺省策略定谳=保守（缺省照报 + 敌射侧显式拒割），真依据＝失败不对称（★F5 勘误）：
//   保守漏网=敌弹过割草/罐（外观级,U2/U3 探针族可查）;激进漏网=玩家弹静默失割
//   （玩法损失,更劣）→ 取其轻=缺省保守。旧注「桶成员不可静态穷举→激进缺省失割
//   风险不可被 tripwire 完全覆盖」系误证已撤——tripwire 锁类面定性本可结构性
//   穷举（间接继承链普查缺口见下 F4 登记注）。tripwire=「类面定性全量登记」：
//   凡 Entity 子类缺 vanillaId/projId 字段（vid=0 能力类,注释剥离后按
//   声明带初始化/this 赋值/类型注解成员三判据定字段）必须入 REGISTRY 定性。
//   ★F4 登记注（普查 gap,2026-09-23）：vid=0 普查判据只扫 `extends Entity` 直系
//   子类,【不覆盖间接继承链】（BallProjs.ts:77 BallBase extends Entity →
//   BeachBallProj 155/FootballProj 861 extends BallBase,均不入普查域）;两球类
//   现持 readonly projId 走型录面不受影响,未来新间接继承弹类须人工入册 REGISTRY。
// 件 2（多割相位差）定谳：aiStyle 77 回收期【真】——1457 P.cs:31213-31226
//   `ai[1]==1 → friendly=false → alpha>=255 Kill`（U3 旧锚 :29128/:29156 系行段
//   漂移,那两行在 aiStyle54 Raven 块）→ 443/1110 渐隐退场相拒割,经 noVanillaCut
//   getter 运行时覆写口接入门。aiStyle 210（1130/1135）【证伪】——AI_210_YoyoShots
//   （P.cs:37480-37560）只写 rotation/velocity/alpha/Kill,全块零 friendly 写;
//   U3 所引 :34978/:34993 实为彩虹水晶杖爆炸序列（DoRainbowCrystalStaffExplosion
//   :34975-34994,friendly=true 一拍 Damage 脉冲后复位 false）——1130/1135 全程
//   friendly=true 照割,SW 同相零偏差,不动刀（防回潮证伪锚=本注）。
// 件 4（307 防回潮锚）：vanilla 306 Kill 派生 307（P.cs:78055）→ AI_036 锁敌
//   `friendly = true`（P.cs:27789-27792）→ 锁敌后每 tick 割;SW 无 306 链=307 零
//   生成=零影响。锚落在 Entity.ts 中央门 BJ294 注（306 链移植时须同步补 307
//   运行时翻旗割草面——型录 307 无 friendly 行,vid=0 分支缺省照报会全寿越割）。
// 变异证红（开发期实测,逐字节还原）：
//   M1 摘 `m.noVanillaCut !== true` 项 → ①③敌射面红、②照报面绿（证红=位在判别）。
//   M2 `vid === 0 ? true :` 翻 `false`（激进缺省）→ ② 与全部照报面红（证红=缺省向）。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Game } from '../src/core/Game';
import { Entity, EntityManager } from '../src/entities/Entity';
import { TowerBolt } from '../src/entities/Dart';
import { MLDeathray, MoonLeechProj, DukeSharknadoBolt, DukeSharknadoTornado } from '../src/entities/bossAI_duke_moonlord';
import { LunarOrb, TabletShardProj } from '../src/entities/bossAI_lunar_misc';
import { DeerclopsSpikeProj, DeerclopsRubbleProj, InsanityShadowProj } from '../src/entities/bossAI_deerclops';
import { BetsyBreath, DD2GoblinBomb, DD2OgreSmash } from '../src/entities/bossAI_dd2';
import { MeteorChunk } from '../src/entities/MeteorChunk';
import { InfernoHostileBlast } from '../src/entities/InfernoHostileBlast';
import { FallingStar } from '../src/entities/FallingStar';
import { SkyDragonCircle } from '../src/entities/SkyDragonFury';
import { ElectroSphereProj } from '../src/entities/ElectroSphereProj';
import type { Enemy } from '../src/entities/Enemy';
import type { Player } from '../src/entities/Player';
import type { GameHooks } from '../src/entities/types';

/** vid 载体台（bj293 ProbeProj 同构 + noVanillaCut 位）：判别面单测本体。 */
class ProbeProj extends Entity {
  projId?: number;
  minion = false;
  npcProj?: boolean;
  reflected?: boolean;
  noVanillaCut?: boolean;
  constructor(projId?: number) {
    super();
    this.projId = projId;
    this.w = 16; this.h = 16;
    this.x = 5 * TILE; this.y = 5 * TILE;
  }
  fixedUpdate(): void {}
  draw(): void {}
}

/** 中央收口台（bj293 emGame 同构）：真 World + cutTile 观察口（记录 vid）。 */
function emGame() {
  const w = new World(60, 60, 11, 'bj293');   // 与 BJ293 探针面同种（种子名对齐=地形骰同掷）
  const game = Object.create(Game.prototype) as unknown as GameHooks & {
    cutTile: (x: number, y: number, vid?: number, extraCut?: boolean) => void;
  };
  const stub = game as unknown as Record<string, unknown>;
  stub.world = w;
  stub.entities = { enemies: [], critters: [], npcs: [], projectiles: [], drops: [], props: [] };
  stub.sfx = { play: () => true, playFiles: () => true, playLoop: () => null, playWav: () => true };
  stub.enemies = () => [];
  stub.critters = () => [];
  stub.npcs = () => [];
  stub.playSfx = () => {};
  stub.playSfxFiles = () => {};
  stub.playSfxWav = () => {};
  stub.spawnParticles = () => {};
  stub.spawnBurst = () => {};
  stub.spawnDust = () => null;
  stub.spawnDrop = () => null;
  stub.addDamageNumber = () => {};
  stub.hitTilesFx = () => {};
  stub.notifyInventoryChanged = () => {};
  stub.damagePlayer = () => 0;
  stub.onEnemyKilled = () => {};
  stub.spawnEnemy = () => {};
  stub.onProjectileDeath = () => {};
  stub._staffHarvestBonus = false;
  game.player = {
    x: -500, y: -500, w: 20, h: 42, cx: -490, cy: -479, dead: true, iframes: 0,
    inv: { armor: {}, accSlotMax: 8, isItemSlotUnlockedAndUsable: () => true, heldItem: () => null },   // 清偿刀 P：基座 5 开=谓词 true 同义
    buffs: new Set(), equipStats: {}, critChance: () => 0,
  } as unknown as GameHooks['player'];
  const cutCalls: Array<[number, number, number | undefined]> = [];
  game.cutTile = (x: number, y: number, vid?: number) => { cutCalls.push([x, y, vid]); };
  return { game, cutCalls };
}

const vidsReported = (cutCalls: Array<[number, number, number | undefined]>) =>
  new Set(cutCalls.map((c) => c[2]));

// ---- 真类活拍台：子类只空转 fixedUpdate（不跑 AI/不动场），入桶走中央收口。----
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function frozen<T extends new (...args: any[]) => Entity>(ctor: T): T {
  return class extends ctor {
    fixedUpdate(): void {}
    draw(): void {}
  } as unknown as T;
}
const F_MLDeathray = frozen(MLDeathray);
const F_MoonLeechProj = frozen(MoonLeechProj);
const F_DukeSharknadoBolt = frozen(DukeSharknadoBolt);
const F_DukeSharknadoTornado = frozen(DukeSharknadoTornado);
const F_LunarOrb = frozen(LunarOrb);
const F_TabletShardProj = frozen(TabletShardProj);
const F_BetsyBreath = frozen(BetsyBreath);
const F_DD2GoblinBomb = frozen(DD2GoblinBomb);
const F_DD2OgreSmash = frozen(DD2OgreSmash);
const F_TowerBolt = frozen(TowerBolt);
const F_DeerclopsSpikeProj = frozen(DeerclopsSpikeProj);
const F_DeerclopsRubbleProj = frozen(DeerclopsRubbleProj);
const F_InsanityShadowProj = frozen(InsanityShadowProj);
const F_MeteorChunk = frozen(MeteorChunk);
const F_InfernoHostileBlast = frozen(InfernoHostileBlast);
const F_FallingStar = frozen(FallingStar);

const liveTower = { dead: false, cx: 900, cy: 900, x: 892, y: 892, w: 16, h: 16 };
const srcLike = { id: 7, cx: 300, cy: 300, dead: false };
const playerLike = { cx: 100, cy: 100 };

/** 15 标记类的最小构造（位置与割面无关——cutTile 为记录桩;FallingStar 双相另测） */
function makeMarked(): Entity[] {
  const x = 5 * TILE, y = 5 * TILE;
  return [
    new F_MLDeathray(null, 'core', 0, 0, 50, x, y),
    new F_MoonLeechProj(srcLike as unknown as Enemy, playerLike as unknown as Player),
    new F_DukeSharknadoBolt(x, y, 0, 0, false, false, null as unknown as Enemy),
    new F_DukeSharknadoTornado(x, y, false, null as unknown as Enemy),
    new F_LunarOrb(null, 539, 0, 0, 10, x, y),
    new F_TabletShardProj(x, y, 1, 1, x, y),
    new F_BetsyBreath(srcLike as unknown as Enemy, 10),
    new F_DD2GoblinBomb(x, y, 1, 1, 10),
    new F_DD2OgreSmash(x, y, 10),
    new F_TowerBolt(x, y, () => liveTower as unknown as Enemy, () => {}),
    new F_DeerclopsSpikeProj(x, y, 0, 10, 0),
    new F_DeerclopsRubbleProj(x, y, 1, 1, 10, 0),
    new F_InsanityShadowProj(null, 10),
    new F_MeteorChunk(x, y, 1, 1),
    new F_InfernoHostileBlast(x + 8, y + 8, 10),
  ];
}

describe('BJ294：vid=0 拒割位判别面（中央门保守缺省 + 敌射侧显式拒割）', () => {
  it('① vid=0 + noVanillaCut=true → 敌射侧零上报（U3 病灶收口面）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    const p = new ProbeProj(undefined);
    p.noVanillaCut = true;
    em.add(p, 'projectiles');
    em.update(1 / 60, game);
    expect(cutCalls).toEqual([]);
  });

  it('② vid=0 无位 → 缺省照报（保守定谳控制面;FirstFractalSlash(857) 族零回退）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    em.add(new ProbeProj(undefined), 'projectiles');
    em.update(1 / 60, game);
    expect(cutCalls.length).toBeGreaterThan(0);
    expect(vidsReported(cutCalls).has(0)).toBe(true);
  });

  it('③ 型录面回归：84 hostile 拒割 / 451 friendly 照割（BJ293 门不被 BJ294 破）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    em.add(new ProbeProj(84), 'projectiles');
    em.add(new ProbeProj(451), 'projectiles');
    em.update(1 / 60, game);
    const vids = vidsReported(cutCalls);
    expect(vids.has(84)).toBe(false);
    expect(vids.has(451)).toBe(true);
  });
});

describe('BJ294：标记类活拍面（敌射/环境侧 noVanillaCut 全员拒割）', () => {
  it('15 真类构造入桶 → 一拍零上报（minion 借位退役后 292 同面）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    for (const p of makeMarked()) em.add(p, 'projectiles');
    em.update(1 / 60, game);
    expect(cutCalls).toEqual([]);
  });

  it('标记位均为类级在场（对抗构造漏标）', () => {
    for (const p of makeMarked()) {
      expect((p as { noVanillaCut?: boolean }).noVanillaCut).toBe(true);
    }
  });
});

describe('BJ294：件 2 回收期运行时覆写口（443/1110 渐隐相拒割）', () => {
  it('1110 星圈：新生相照割（自砍+中央门）→ consume 后拍零割（:31215 friendly=false）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    const c = new SkyDragonCircle(5 * TILE + 8, 5 * TILE + 8, 10, 100);
    em.add(c, 'projectiles');
    em.update(1 / 60, game);   // 新生拍
    em.update(1 / 60, game);   // 渐入拍
    const before = cutCalls.length;
    expect(before).toBeGreaterThan(0);
    expect(vidsReported(cutCalls).has(1110)).toBe(true);
    c.consume();               // ai[1]=1（:74756 旧圈被新圈消费面）
    em.update(1 / 60, game);   // 渐隐首拍（alphaI 155+51=206<255 存活=非死弹门承担）
    expect(cutCalls.length).toBe(before);            // 渐隐相零割
    expect((c as unknown as { dead: boolean; friendlyT: boolean }).dead).toBe(false);
    expect((c as unknown as { friendlyT: boolean }).friendlyT).toBe(false);
  });

  it('443 电球：新生相照割（vid=0 缺省面,无 projId 字段=快照收集器约束同族）→ replaced 后拍零割', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    const s = new ElectroSphereProj(5 * TILE + 8, 5 * TILE + 8, 10);
    em.add(s, 'projectiles');
    em.update(1 / 60, game);
    em.update(1 / 60, game);
    const before = cutCalls.length;
    expect(before).toBeGreaterThan(0);
    expect(vidsReported(cutCalls).has(0)).toBe(true);   // 型录 friendly=:5144+owner 玩家 :74942 → 照割同相
    (s as { replaced: boolean }).replaced = true;       // :74935 邻近新球置位面
    em.update(1 / 60, game);
    expect(cutCalls.length).toBe(before);               // 渐隐相零割（getter 运行时覆写口）
    expect((s as unknown as { dead: boolean }).dead).toBe(false);
  });

  it('FallingStar 双相：暖机相（720 面,SetDefaults 无 friendly 行=缺省 false;F2 勘误:出生 owner=Main.myPlayer W.cs:72425,非 255）拒割 / 转正相（12 面 friendly）照割', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    em.add(new F_FallingStar(5 * TILE, 5 * TILE, 1, 1, 180, false, true), 'projectiles');
    em.update(1 / 60, game);
    expect(cutCalls).toEqual([]);

    const { game: game2, cutCalls: cutCalls2 } = emGame();
    const em2 = new EntityManager();
    em2.add(new F_FallingStar(5 * TILE, 5 * TILE, 1, 1, 0, false, true), 'projectiles');
    em2.update(1 / 60, game2);
    expect(vidsReported(cutCalls2).has(0)).toBe(true);
  });
});

// ---- 结构锁 tripwire：普查（注释剥离后缺 vanillaId/projId 字段的 Entity 子类=
// vid=0 能力类）必须全员入 REGISTRY 定性——新增 vid=0 弹类不登记 = 本测试红。 ----

const REGISTRY: Record<string, 'marked' | 'playerSide' | 'nonProjBucket'> = {
  // 敌射/环境侧（vanilla 无割面）——类级 noVanillaCut = true 或相位 getter
  MLDeathray: 'marked',              // 455 hostile :5277（★F3 勘误:旧 :5281 系误记,1457 亲读重钉）
  MoonLeechProj: 'marked',           // 456 hostile :5288（★F3:旧 :5292 系误记）
  DukeSharknadoBolt: 'marked',       // 385 hostile :4682（★F3:旧 :4684 系误记）
  DukeSharknadoTornado: 'marked',    // 384/386 hostile :4670/:4692（★F3:旧 :4672/:4694 系误记）
  LunarOrb: 'marked',                // 539/574 hostile :6144/:6241
  TabletShardProj: 'marked',         // 526 无 friendly 行 :5964-72
  BetsyBreath: 'marked',             // 687 friendly=false+hostile :7324
  DD2GoblinBomb: 'marked',           // 681 hostile :7265-73
  DD2OgreSmash: 'marked',            // 683 hostile :7284-95
  TowerBolt: 'marked',               // 629 hostile :6756
  DeerclopsSpikeProj: 'marked',      // 961 hostile
  DeerclopsRubbleProj: 'marked',     // 962 hostile
  InsanityShadowProj: 'marked',      // 965 hostile
  MeteorChunk: 'marked',             // 1078 双旗但 vanilla 出生 owner=255（W.cs:72337,★F3:旧 :72335 系误记）
  InfernoHostileBlast: 'marked',     // 292 hostile :3822（minion 借位退役）
  FallingStar: 'marked',             // 720/12 双相 getter（:7619 无 friendly / :54059 owner=myPlayer）
  // 玩家侧/同相照报（照报零回退豁免;多割登记债见 Entity.ts BJ294 注）
  // ★BJ486③（2026-10-03）八键摘除：FirstFractalSlash/TrueNightsEdgeSlash/
  //   NightsEdgeFly/ZenithSword/LightsBaneSlash/GrassSlash/HorsemansPumpkin/
  //   SolarEruptionWhip 补挂 readonly projId（857/973/972/933/974/976/321/611,
  //   弧子代弹掷率 rollVanillaHitCrit 锚）→ 出 vid=0 普查域走型录面,按 RainbowSegment
  //   同款纪律（键摘+注记）不入册。
  XenoBubbleProj: 'playerSide',      // 444 friendly（:12461 豁免表另案登记）
  ElectroSphereProj: 'playerSide',   // 443 无 projId 字段（快照约束同族）;回收相由 getter 覆写
  RainbowBolt: 'playerSide',         // 250 无 friendly 行（照报偏差登记）
  // RainbowSegment 键已摘（★清偿刀 V 2026-09-29）：12:48 并行 vid 穿线刀挂
  //   readonly projId=251（RainbowProj.ts:39,湿段/ghostHealProc 消费面）→
  //   出 vid=0 普查域走型录面,按件 2 同款纪律（YoyoShotProj 先例）不入册。
  HealProj: 'playerSide',            // 298/305 无 friendly 行（照报偏差登记）
  ChargedBlaster: 'playerSide',      // 460 friendly（:12461 豁免表另案登记）
  PrismProj: 'playerSide',           // 633 friendly（:12461 豁免表另案登记）
  GrappleProj: 'playerSide',         // 钩爪族 friendly
  InsanityShadowFriendly: 'playerSide',  // 964 friendly（敌对镜像 965 才拒割）
  MoonLordWhipProc: 'playerSide',    // 1045 friendly,owner=parent.owner
  JavelinStickerProj: 'playerSide',  // 971/975 钉扎态 ai0==1=:12461 豁免支（登记）
  SquidCloud: 'playerSide',          // 813 双旗但 vanilla 出生 owner=Main.myPlayer（NPC.cs:48026）=照割同相
  TigerPounce: 'playerSide',         // 818 minion 弹,:12461 豁免+CUT_EXCLUDE_VIDS 成员（vid=0 下两门皆盲,登记）
  PortalGunBolt: 'playerSide',       // 601 friendly :6504-12
  VolcanoBlastProj: 'playerSide',    // 978 friendly :9262（BJ285 死亡段自砍面另立）
  MuramasaSlashProj: 'playerSide',   // 村正斩击弹 friendly
  BladetongueGlobProj: 'playerSide', // 血舌投射弹 friendly
  TerraArc: 'playerSide',            // 984 friendly
  SolarFlare: 'playerSide',          // 614/636 族 friendly
  // ★清偿刀 V（2026-09-29）BJ345 磁球独立实体化（vanillaProjAlpha.ts 注）后补登记：
  //   254 磁球悬停球 SetDefaults 无 friendly 行（P.cs:3369-3377 aiStyle47/magic/
  //   timeLeft900/light0.5）→ vanilla 割门 P.cs:18021 `owner==myPlayer &&
  //   CanCutTiles() && (friendly||hostile) && damage>0` 不落 = 零割;本仓 vid=0
  //   缺省照报 = 照割（多割相位差家族,与 250/298/305 同族登记债,玩家侧不修）。
  //   非 marked：玩家侧弹（Game.ts:18851 玩家施放 owner=myPlayer,伤害面在 255 弹）
  MagnetSphereProj: 'playerSide',
  // 非投射物桶——不进中央割收口
  Portal: 'nonProjBucket',           // props 桶（placePortal）
  Minecart: 'nonProjBucket',         // props 桶（坐骑）
  GorePiece: 'nonProjBucket',        // props 桶（gore）
};

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** 普查：src/ 递归,缺 vanillaId/projId 字段的 Entity 子类（注释剥离后,按
 *  ①声明带初始化/this 赋值 ②类型注解成员 两判据定字段——对象字面量 `{ projId: X }`
 *  不算字段）。类体切片=类声明行起至下一列 0 顶层声明（避免尾随模块函数的
 *  vid 读数污染判据）。 */
function censusVid0Capable(): Array<{ file: string; cls: string; raw: string; body: string }> {
  const root = path.dirname(fileURLToPath(import.meta.url)); // tests/
  const srcRoot = path.join(path.dirname(root), 'src');
  const out: Array<{ file: string; cls: string; raw: string; body: string }> = [];
  const re = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)\s+extends\s+Entity\b/g;
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.ts')) continue;
      const src = fs.readFileSync(p, 'utf8');
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(src))) {
        const tail = src.slice(re.lastIndex);
        const tm = /\n(?:export\s+)?(?:abstract\s+)?(?:class|function|const|let|var)\s/.exec(tail);
        const raw = tm ? tail.slice(0, tm.index) : tail;
        const body = stripComments(raw);
        const hasField = /\b(?:vanillaId|projId)\s*[?]?=/.test(body)
          || /\bthis\.(?:vanillaId|projId)\b/.test(body)
          || /^\s{2,8}(?:readonly\s+|private\s+|public\s+|protected\s+)*(?:vanillaId|projId)\??\s*:/m.test(body);
        if (!hasField) out.push({ file: path.relative(path.dirname(root), p), cls: m[1], raw, body });
      }
    }
  };
  walk(srcRoot);
  return out;
}

describe('BJ294：结构锁 tripwire（vid=0 能力类定性全量登记）', () => {
  it('普查面（46 类）全员已定性——新 vid=0 弹类未登记即红', () => {
    const census = censusVid0Capable();
    // 类名唯一性守卫（重复名会破坏 REGISTRY 键位语义）
    const names = census.map((c) => c.cls);
    expect(new Set(names).size).toBe(names.length);
    const unregistered = census.filter((c) => REGISTRY[c.cls] === undefined);
    expect(unregistered.map((c) => `${c.file} ${c.cls}`)).toEqual([]);
    // ★清偿刀 V（2026-09-29）净零换位对账：RainbowSegment 挂 projId=251 出域
    //   （12:48 并行 vid 穿线刀,RainbowProj.ts:39）+ MagnetSphereProj 入域,计数仍 46。
    // ★BJ486③（2026-10-03）八类补挂 readonly projId（857/973/972/933/974/976/321/611,
    //   弧子代弹掷率 rollVanillaHitCrit 类旗锚）→ 46−8=38。
    expect(census.length).toBe(38);   // 定性面冻结（增删类须同步改本表与 Entity.ts 注）
  });

  it('marked 类类面必带 noVanillaCut（字段=true 或相位 getter）;292 minion 借位已退役', () => {
    for (const c of censusVid0Capable().filter((c) => REGISTRY[c.cls] === 'marked')) {
      const ok = /noVanillaCut\s*=\s*true/.test(c.body) || /get\s+noVanillaCut/.test(c.body);
      expect({ cls: c.cls, ok }).toEqual({ cls: c.cls, ok: true });
    }
    const inferno = censusVid0Capable().find((c) => c.cls === 'InfernoHostileBlast')!;
    expect(inferno.body).not.toContain('minion = true');   // 借位退役锁（注释剥离后代码面）
  });

  it('件 2 证伪锚：1130/1135 走型录 vid=projId 面（不属 vid=0 普查域,永不该进 REGISTRY）', () => {
    // 防回潮：U3「1130/1135 回收期翻 friendly=false」已证伪（AI_210_YoyoShots
    // P.cs:37480-37560 零 friendly 写;U3 所引 :34978/:34993=彩虹水晶杖爆炸序列）。
    // SW 两弹由 YoyoShotProj 以 projId 1130/1135 携带 → 型录 friendly=true 全程照割
    // =vanilla 同相。若未来把它们当 vid=0 类登记进 REGISTRY=自造偏差,本面红。
    expect(REGISTRY['YoyoShotProj']).toBeUndefined();
    expect(REGISTRY['MLDeathray']).toBe('marked');        // 抽样守卫：REGISTRY 活体非空壳
    expect(REGISTRY['FirstFractalSlash']).toBeUndefined(); // ★BJ486③ 补 projId=857 出域（YoyoShotProj 同款）
    for (const departed of ['TrueNightsEdgeSlash', 'NightsEdgeFly', 'ZenithSword', 'LightsBaneSlash', 'GrassSlash', 'HorsemansPumpkin', 'SolarEruptionWhip']) {
      expect(REGISTRY[departed]).toBeUndefined();         // 八键摘除防回潮（出普查域不入册）
    }
  });
});
