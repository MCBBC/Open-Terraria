// ★BJ671（2026-10-13 用户实报「魔眼法杖召唤的激光眼不会自己下平台（比如木平台）」）：
//  原版弹面 flag6 缺省 true——Projectile.cs:17587 `bool flag6 = true`（非宠物弹）→
//  TileCollision 调用 (flag6,flag6)（:17705-17721）= passPlatformDown=true = 平台
//  永不承接（下落穿过）。387/388 双子魔眼（aiStyle 66 :4714/:4730）不在覆写 switch
//  :17670-17696（677-693/759/1020/500）且非 projPet → 交战态 AI 翻转 tileCollide=true
//  （AI_066 :30301-30304）也照样穿平台下落。533 致命球（aiStyle 66 :6005）同理。
//  本仓病根：MinionProj twinsStep/integrate533 走 moveAndCollide 时 Body.dropThrough
//  缺省 false = 平台承接 = 卡平台。修 = 两支 AI 逐拍置 dropThrough=true
//  （≡原版 flag6 缺省;WeaponProj 各支 dropThrough:true 同先例）。864 刃杖不受影响
//  （SetDefaults tileCollide=false :9196 且 smolstarAI 位移直写不走碰撞）。
//  ★变异证红：摘除 `this.dropThrough = true` → 行为断言红（弹被平台接住停在顶面）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { withMutation } from './mutation-guard';   // ★R6-F1:变异自证三层守卫（文件互斥/panic 还原/残留自检）
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';

const GAME = join(__dirname, '..');
const MINION_TS = readFileSync(join(GAME, 'src/entities/MinionProj.ts'), 'utf8');

/** 夹具：平台行 row（tile type=11 木平台,T.PLATFORM=11）+ 地面 row+4;
 *  玩家 py 由用例指定（97*16=平台下方/88*16=站平台上）——巡航/归位锚随玩家位走。
 *  仿 BJ635 夹具纪律：真 World/真 Player/直接驱动 fixedUpdate。 */
function makeHooks(playerPy: number) {
  const w = new World(120, 120, 7, 'bj671');
  const PLAT_ROW = 90, GROUND_ROW = 94;
  for (let x = 20; x < 100; x++) w.store.setTile(x, PLAT_ROW, 11);   // 木平台带（T.PLATFORM=11）
  for (let x = 0; x < 120; x++) for (let y = GROUND_ROW; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = GROUND_ROW;
  const player = new Player(60 * 16, playerPy, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
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
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: added,
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, store: w.store, player, platRow: PLAT_ROW };
}

let seq = 0;
const spawn = (player: Player, hooks: GameHooks, pid: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, pid, 6, 0, false, 0, false, () => player);
  m.id = ++seq;
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
  return m;
};
const run = (m: MinionProj, hooks: GameHooks, n: number): void => {
  for (let i = 0; i < n && !m.dead; i++) m.fixedUpdate(1 / 60, hooks);
};

describe('BJ671 ① 源锚', () => {
  it('twinsStep/integrate533 各置 dropThrough=true（弹面 flag6 缺省在码）', () => {
    expect(MINION_TS).toContain('★BJ671（2026-10-13 用户实报「激光眼不会自己下木平台」）');
    expect(MINION_TS).toContain('★BJ671：弹面 flag6 缺省 true（Projectile.cs:17587 非宠物弹 → TileCollision');
  });
});

describe('BJ671 ② 行为判别：387/388/533 下落穿平台（aiStyle 66 后置覆写=恒穿相）', () => {
  // 玩家 py=97*16（平台 90 行下方,巡航锚=玩家心−60 在平台下）→ 弹须下落穿平台。
  // 旧实现（dropThrough 缺省 false）被平台承接 = y 停在平台顶不再下行 = 变异退化值。
  // ★注：387/388/533 在 Main.projPet 表内,但 aiStyle 66 覆写（Projectile.cs:17621）
  //  后置覆盖 projPet 门 → 恒穿=R3-F#6 勘正后的正确模型（BJ672 旧注「非 pet」错）。
  for (const pid of [387, 388, 533] as const) {
    it(`vid ${pid}：平台上方出生 90 拍 → y 越过平台顶至少 8px（穿过）`, () => {
      const { hooks, player, platRow } = makeHooks(97 * 16);
      const m = spawn(player, hooks, pid, 60 * 16, 88 * 16);
      run(m, hooks, 90);
      const platTop = platRow * 16;
      expect(m.dead, '弹存活（未撞实体墙消亡）').toBe(false);
      expect(m.y + m.h, `vid ${pid} 盒底应越过平台顶（穿平台下行;旧实现=被承接停在 ${platTop}）`)
        .toBeGreaterThan(platTop + 8);
    });
  }

  it('对照面：387 在平台上方但玩家也在上方 → 巡航锚在上方,弹不被平台吸住（sanity）', () => {
    const { hooks, player } = makeHooks(84 * 16);   // 玩家在平台上 6 行
    const m = spawn(player, hooks, 387, 60 * 16, 86 * 16);
    run(m, hooks, 60);
    expect(m.y, '锚在上方 → 弹上行远离平台（顶不越平台顶）').toBeLessThan(90 * 16);
  });
});

// ---------------------------------------------------------------------------
// ③ BJ672 逐族普查（2026-10-13 用户令「登记的进行逐族普查」）：MinionProj 全走
//  moveAndCollide 的 AI 支 × 原版弹面 flag6 类别全对拍。flag6 覆写面 = projPet
//  条件（:17590）∪ switch（500/677-693/1105=承接,759=穿,1020=角度判 :17670-17696）
//  ∪ decidesManualFallThrough（AI 写 shouldFallThrough 才被消费 :17698）。其余
//  全族 TRUE 缺省=穿平台。普查产物：
//  · 补恒穿桥：759（case=TRUE）/390-392/653/1025/1098/1123（TRUE 缺省）/ai62 地面态;
//  · ai026TailGround :6799 条件式改恒穿（AI_026_TAIL 7 vid 全 TRUE 缺省——dMFT=
//    false 时 shouldFallThrough 写值不被弹面消费,旧条件式回落承接=非原版相）;
//  · 不动（已核正确）：dMFT 9 支（758/833-835/951/1022/1036/1093/1112/1118 桥在
//    :50454/:52112 双锚）/688-693/1105 哨兵段（flag6=承接,缺省相恰）/864/963/970/
//    831/625-628/946 直写位移无弹面/917 tileCollide=false 无弹面。
// ---------------------------------------------------------------------------
describe('BJ671 ③ BJ673 勘误后普查判别（R3-F#1/2/3 翻案：projPet 门 vid=承接,覆写面 vid=穿）', () => {
  it('源锚：补桥在码（759/1098+1123/1025/ai62 恒穿 + AI_026/390 −12 门 + 653 +4 门）', () => {
    for (const anchor of [
      '★BJ672：弹面 flag6=TRUE（case 759 显式 :17693）',
      '★BJ672：弹面 flag6=TRUE 缺省（1098/1123 aiStyle 204',
      '★BJ672：弹面 flag6=TRUE 缺省（1025 aiStyle 197 非覆写面）',
      '★BJ673 勘误（2026-10-14 红蓝 R3-F#1 翻案 BJ672）',
      '★BJ673 勘误（红蓝 R3-F#2 翻案 BJ672）：390-392 在 Main.projPet',
      '★BJ673 勘误（红蓝 R3-F#3 翻案 BJ672）：653 有显式承接面',
    ]) {
      expect(MINION_TS).toContain(anchor);
    }
  });

  // 判别夹具设计（R3-F#5）：玩家站平台上（底 1430 ≤ 平台顶 1440+12 门）→ projPet
  // vid（266/390）flag6=false=被承接；玩家在平台下方（底 1594−12=1582 > 弹底）→ 穿。
  // 三实现分辨：恒穿=第一支红、无条件承接=第二支红。
  it('vid 266 玩家站平台上 → 已站台位不沉（projPet −12 门关=承接;BJ672 恒穿在此红）', () => {
    const { hooks, player, platRow } = makeHooks(1440 - 42); // 玩家底=1440=平台顶（站位）
    const m = spawn(player, hooks, 266, 60 * 16, platRow * 16 - 20); // 盒底=平台顶（已站台）
    run(m, hooks, 90);
    expect(m.dead, '弹存活').toBe(false);
    // 门：玩家底−12=1428 ≯ 弹底 1440 → dropThrough=false → 逐拍重承接维持站立
    //（恒穿实现会立即沉穿到下方地面 94 行=1504）
    expect(m.y + m.h, '盒底被平台托住（≤平台顶+8）').toBeLessThanOrEqual(platRow * 16 + 8);
  });

  it('vid 266 玩家在平台下方 → 穿台（projPet 门开）', () => {
    const { hooks, player, platRow } = makeHooks(97 * 16);   // 玩家底−12=1582 > 承接位 1440
    const m = spawn(player, hooks, 266, 60 * 16, 88 * 16);
    run(m, hooks, 90);
    expect(m.dead, '弹存活').toBe(false);
    expect(m.y + m.h, '盒底越过平台顶（穿台下行）').toBeGreaterThan(platRow * 16 + 8);
  });

  it('vid 390 蜘蛛玩家站平台上 → 已站台位不沉（双机制①站平台行走）', () => {
    const { hooks, player, platRow } = makeHooks(1440 - 42);
    const m = spawn(player, hooks, 390, 60 * 16, platRow * 16 - 30);
    run(m, hooks, 90);
    expect(m.dead, '弹存活').toBe(false);
    expect(m.y + m.h, '盒底被平台托住').toBeLessThanOrEqual(platRow * 16 + 8);
  });

  it('vid 653 伴侣立方玩家站平台上 → 平台承接（:17605 显式 +4 门原版相）', () => {
    const { hooks, player, platRow } = makeHooks(1440 - 42);
    player.buffs.apply(BuffType.CompanionCube, 300);   // AI 生命期门（buff 191）
    const m = spawn(player, hooks, 653, 60 * 16, platRow * 16 - 30);
    run(m, hooks, 90);
    expect(m.dead, '弹存活').toBe(false);
    expect(m.y + m.h, '盒底被平台托住（恒穿在此红）').toBeLessThanOrEqual(platRow * 16 + 8);
  });
});

// ---------------------------------------------------------------------------
// ④ R6-F1 清偿（2026-10-14 红蓝 R6 交付）：③区补桥（759/1098+1123/1025/AI_062 地面态）
//  此前只有注释源锚（关键词 grep=注释在即过,摘桥不红=空转面）无行为锁。本块补行为
//  判别,复用 makeHooks 平台夹具;每锁注「变异退化值」;变异自证见 ⑤（withMutation
//  短持锁——MinionProj.ts=并行会话热文件,禁裸 sed 长持锁）。
// ---------------------------------------------------------------------------

/** 哨兵形 spawn（1025 须 sentry=true 才入哨兵分派段;既有 spawn 恒 false,不动） */
const spawnSentry = (player: Player, hooks: GameHooks, pid: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, pid, 30, 0, true, 0, false, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
  return m;
};

describe('BJ671 ④ R6-F1 补行为锁：759 索敌态 / 1098+1123 出场态 / 1025 吸附面', () => {
  it('vid 759 索敌态下落穿平台（目标在平台下方深井）45 拍 → 盒底越过平台顶+8（变异退化值=盒底停平台顶 1440）', () => {
    const { hooks, store, player, platRow } = makeHooks(84 * 16);   // 玩家悬空于平台上索敌域
    // 深井（列 58-62,行 94-118 挖空）：目标距弹 ~384>150 → 全程 Lerp 远档（tileCollide
    // 保持 true）——排除近身支 tileCollide=false 兜底把变异残留「自救穿台」（判别窗保真）。
    // 注：夹具世界 120 高,CanHit y 钳 maxTilesY−40=80 → 视线钳域退化真（夹具尺度伪影,
    // 非 fabricated 态——「索敌态+下行越平台」是真实玩法相,靶态非造）。
    for (let x = 58; x <= 62; x++) for (let y = 94; y <= 118; y++) store.setTile(x, y, 0);
    const enemy = {
      id: 9001, x: 956, y: 1668, w: 24, h: 24, dead: false,
      cx: 968, cy: 1680, hp: 100000, maxHp: 100000, vanillaId: 48,
      hurt: (): boolean => true,
    };
    (hooks as unknown as { enemies: () => unknown[] }).enemies = () => [enemy];
    const m = spawn(player, hooks, 759, 60 * 16, 81 * 16);   // 盒底 1301,平台顶 1440
    run(m, hooks, 45);
    expect(m.dead, '弹存活').toBe(false);
    expect(m.y + m.h, '盒底越过平台顶+8（恒穿桥;旧缺省承接=停 1440）').toBeGreaterThan(platRow * 16 + 8);
  });

  for (const [pid, itemVid] of [[1098, 5667], [1123, 6174]] as const) {
    it(`vid ${pid} 出场态下落穿平台（主手 ${itemVid} 过持物品门）60 拍 → 盒底越过平台顶+8（变异退化值=停 1440）`, () => {
      const { hooks, player, platRow } = makeHooks(97 * 16);
      player.inv.add(itemVid, 1);   // 出场段持物品门（digtoiseStep 失配即灭=此前置红,ITEM_DEFS vid 单源已核）
      const m = spawn(player, hooks, pid, 60 * 16, 88 * 16);   // 盒底 1425,平台顶 1440
      run(m, hooks, 60);            // 出场态 180t 内,重力 2/15/t → ~t15 触平台
      expect(m.dead, `vid ${pid} 弹存活（持物品门过=主手 ${itemVid} 在包）`).toBe(false);
      expect(m.y + m.h, '盒底越过平台顶+8（恒穿桥;旧缺省承接=停 1440）').toBeGreaterThan(platRow * 16 + 8);
    });
  }

  it('vid 1025 平台下方出生 → 升空穿平台不吸附（sAttach 恒 0=吸附面只对实体块）', () => {
    const { hooks, player, platRow } = makeHooks(97 * 16);
    // 出生于平台(90 行)与地面(94 行)之间：flag2A（Top 下探 15 格见地面实心）→ 升空
    //（vy −0.1/t 钳 −12）,90 拍升程 ≈ 0.05·90·91 = 409px → 盒整体越过平台顶（恒穿）。
    const m = spawnSentry(player, hooks, 1025, 60 * 16, 1484);
    run(m, hooks, 90);
    expect(m.dead, '弹存活').toBe(false);
    expect(m.y + m.h, '盒全过平台顶（升空穿台;承接相=停在平台底 1456）').toBeLessThan(platRow * 16);
    expect(m.sAttach, '不吸平台（吸附面只对实体块;旧缺省承接=sAttach=1 吸平台底）').toBe(0);
    // ★非桥判别锁备案（R6-F1 定谳）：摘恒穿桥对 1025 行为静默——dropThrough 唯一消费面
    //  （平台承接）只作用于 dir>0 下行（TileCollision 平台门主行+越行补扫双站）,而 AI_197
    //  无下行速度源（放置 speedY=0（Player.cs:48739 5463 特例）;垂直面仅升空/衰减/吸附
    //  归零）→ 桥=防御性恒等。本锁=行为钉+源锚组合;静默反预言实证见 ⑤ M3。
  });
});

describe('BJ671 ④ R6-F1 补锁：AI_062 地面态恒穿桥 = 源锚 + 死代码定谳（行为锁不可达,不硬造）', () => {
  it('源锚：地面态恒穿桥在码（★BJ672 注 + dropThrough 置位 + dfGnd 唯一段）', () => {
    expect(MINION_TS).toContain('// ★BJ672：弹面 flag6=TRUE 缺省（AI_062 族 373-963 非 pet/非覆写面;375/963');
    expect(MINION_TS).toContain('弹面跑时恒穿平台）→ 地面态下落穿平台。');
    expect(MINION_TS).toContain('const dfGnd = projWaterDragFactor(this);');   // 地面态块唯一位
  });

  it('死代码定谳复核（R3-F#4,2026-10-14 重验成立）：ground 唯一写点=ctor 形参、ground=true 全 src 唯 653 且被先行拦截 → 地面态块无 vid 可达', () => {
    // ① ground 只有构造器一个写点（无运行时改写面）
    expect((MINION_TS.match(/this\.ground\s*=/g) ?? []).length, 'ground 唯一写点').toBe(1);
    // ② 653 构造点 ground=true（全 src 唯一）;通用 spawnMinion 统一 false（Game 形注在码）
    const gameTs = readFileSync(join(GAME, 'src', 'core', 'Game.ts'), 'utf8');
    expect(gameTs).toContain('new MinionProj(owner.cx, owner.cy, 653, 0, 0, false, 0, true,');
    expect(gameTs).toContain('ground 旗仅通用兜底分支消费');
    // ③ 653 在 fixedUpdate 分派头被 companionCubeStep 先行拦截（先于通用块 if (!this.ground)）
    const intercept = MINION_TS.indexOf('if (this.projId === 653) { this.companionCubeStep(game); return; }');
    const generic = MINION_TS.indexOf('if (!this.ground) {');
    expect(intercept, '653 拦截行在码').toBeGreaterThan(-1);
    expect(generic, '通用飞行/地面分块在码').toBeGreaterThan(-1);
    expect(intercept, '653 拦截先于通用块（地面态块对 653 不可达）').toBeLessThan(generic);
    // 定谳结语：地面态块无 vid 可达 → 行为锁不可达;按「夹具喂幻影禁令」不造 ground=true
    // 通路,本块只钉源码+结构。（全 src 构造点普查 @锁时:10 点,除 653 外 ground 形参全 false。）
  });
});

// ---------------------------------------------------------------------------
// ⑤ R6-F1 变异自证（withMutation 三层守卫短持锁——跨套件按文件互斥/panic 还原/残留自检）
// ---------------------------------------------------------------------------
describe.skipIf(process.env.SW_BJ671_MUT)('BJ671 ⑤ R6-F1 变异自证（摘桥→恰红→逐字节还原）', () => {
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  const MINION_FILE = join(GAME, 'src', 'entities', 'MinionProj.ts');
  const spawnVitest = (filter: string) => spawnSync(
    'npx', ['vitest', 'run', 'tests/bj671-minion-platform-fallthrough.test.ts', '--no-file-parallelism', '--reporter=verbose', '-t', filter], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_BJ671_MUT: '1' },
    });

  it('M1 759 恒穿桥翻转 → ④759 红（变异退化值=盒底停平台顶 1440）', () => {
    withMutation(MINION_FILE,
      '穿平台归主;tileCollide 初值 true :4741 域无 false 行）。\n    this.dropThrough = true;',
      '穿平台归主;tileCollide 初值 true :4741 域无 false 行）。\n    this.dropThrough = false; // ★BJ671-R6 M1 变异:恒穿桥翻转',
      () => {
        const r = spawnVitest('vid 759 索敌态下落穿平台');
        expect(r.status, '变异须证红').not.toBe(0);
        expect(r.stdout).toContain('vid 759 索敌态下落穿平台');
      }, { label: 'BJ671-R6 M1 759桥' });
  }, 1_200_000);

  it('M2 钻地龟入口桥翻转 → ④1098/1123 红（变异退化值=盒底停平台顶 1440）', () => {
    withMutation(MINION_FILE,
      '共享本入口逐拍置位）。\n    this.dropThrough = true;',
      '共享本入口逐拍置位）。\n    this.dropThrough = false; // ★BJ671-R6 M2 变异:入口桥翻转',
      () => {
        const r = spawnVitest('出场态下落穿平台');
        expect(r.status, '变异须证红').not.toBe(0);
        expect(r.stdout).toContain('出场态下落穿平台');
      }, { label: 'BJ671-R6 M2 dig桥' });
  }, 1_200_000);

  it('M3 1025 恒穿桥翻转 → 静默反预言（定谳=桥对 1025 无消费面;若红=存在未知下行源,回炉重谳）', () => {
    withMutation(MINION_FILE,
      '旧缺省承接=水晶可吸在平台上）。\n          this.dropThrough = true;',
      '旧缺省承接=水晶可吸在平台上）。\n          this.dropThrough = false; // ★BJ671-R6 M3 变异:恒穿桥翻转',
      () => {
        const r = spawnVitest('vid 1025 平台下方出生');
        expect(r.stdout).toContain('vid 1025 平台下方出生');
        expect(r.status, '1025 摘桥应静默（④1025 仍绿）——红=定谳被推翻,须回炉').toBe(0);
      }, { label: 'BJ671-R6 M3 1025桥' });
  }, 1_200_000);
});
