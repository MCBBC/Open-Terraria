// ★BJ661（2026-10-12）伤害组合族两步式 + 锚族清扫（BJ651/BJ652 登记债）。
// 权威锚（Terarria1457 亲读）：
//  ·【件1a】随从/哨兵 live 伤两步式：Projectile.cs:16809-16813
//    `if (numUpdates == -1 && (minion || sentry)) damage = (int)((float)originalDamage
//    × player2.minionDamage + 5E-06f)`——originalDamage = SpawnMinionOnCursor 形参
//    （Player.cs:50093，ItemCheck_Shoot 小写 damage 局部 :47467 = sItem.damage 烘定基,
//    【未】乘 minionDamage）。两步 = 烘定（BJ651-R2 站⑤ Game 召唤出口 roundCSf32Mul,
//    Item.cs:577）→ live truncCSf32MulBias（含 5E-06f 偏置）。1456 伪锚 :15368 勘正。
//    站点 = MinionProj dmg0（通用 AI 每拍基伤）/ dmgOf（AI_130 哨兵族闭包）。
//  ·【件1b】主枪路径：GetWeaponDamage（Player.cs:54066
//    `(int)((float)damage × GetWeaponDamageMultiplier + 5E-06f)`,偏置在）
//    ← 烘定（Item.cs:577）；弹药加项 = PickAmmo :54192-54194
//    `if (num > 0) Damage += (int)((float)num × GetWeaponDamageMultiplier(item))`
//    = truncCSf32Mul（无偏置;弹药 item.ranged=true → 同吃 rKind 乘区,Item.cs case 40
//    ranged=true 亲读）。1456 伪锚 :54200-54202 勘正 :54192-54194。
//  ·【件1c】投掷 consumable 两站（Game 通用投掷面 + 蜂雷锋 1130）：同件1b 两步式
//    （注入位 :43060 ItemCheck_Shoot(sItem, GetWeaponDamage(sItem))）。
//  ·【件2】锚族勘正（行号纯文档面）：逐站亲读 1457 真位——
//    WeaponProj SpearDustCtx extBox（AI_019_Spears_GetExtensionHitbox :47034-47073/
//    Colliding :15420 步进支 :15902-15927）/CounterweightProj 命中链（aiStyle 99 段
//    :13290-13335/-2 支 :13292-13303/:68701-68707 penetrate<0→1/幽灵 :68696-68700）/
//    Flails（AI_015_Flails :44529-45018/参数 :44551-44565+:44566-44628/缩放链
//    :44629-44637）/悠悠球（AI_099_2_Yoyos :68785 flag :68787-68794/寿命 :68795-68827/
//    ChangeDir :68883-68902/yoyoString :68937-68940/554 顶速 :68918-68922/num7 :68943-
//    68947/死区 :68948-68952）；Game SetItemAnimation :4438-4446/ApplyItemAnimation
//    :4470-4477/老星怒（出生链 :47661-47676/type65 块 :49607-49620/aiStyle5 门 :24116-
//    24119/JustStarted 名单 :43793）/ItemCheck_Shoot 弹速 :47466+:47468-47470 + num4/5
//    :47687-47718/观战 section :17385/SporeSac 墙探针 :42781；Player FindPulley
//    :19771-19876（碰撞预检 :19829/:19846/:19863）+ GetRopeEnds :70556-70603 +
//    维持退出 :26465-26468 + ropeCount 门 :26316-26323/置位 :26644；MissileProj
//    aiStyle5 :24081-24364。
// 判别面：f32 中点档（旧 f64 half-up 与 f32 银行家+偏置异号）——
//  55×1.1→60/61（星炮 197 主枪路径）、10×1.05→10/11（手里剑 42 投掷面）、
//  55×1.05→57/58（随从 live 基伤语义）;变异自证（withMutation 恰红+sha256 还原对拍）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { prefixStat } from '../src/data/vanillaPrefixes';
import { roundCSf32Mul, truncCSf32Mul, truncCSf32MulBias } from '../src/stats/ScaleStats';
import { Arrow } from '../src/entities/Arrow';
import { MinionProj } from '../src/entities/MinionProj';
import { newWiresRadialState } from '../src/stats/wiresRadial';
import { withMutation } from './mutation-guard';

const GAME_ROOT = join(__dirname, '..');
const src = (f: string) => readFileSync(join(GAME_ROOT, f), 'utf8');
const srcGame = () => src('src/core/Game.ts');
const srcMinion = () => src('src/entities/MinionProj.ts');

const iid = (vid: number): number => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** updateUse 可驱动的最小 Game 桩（BJ651 stubGame 同构,见 tests/bj651-attackspeed-tail.ts） */
function stubGame(heldVid: number, opts: { prefix?: number; ammoVid?: number } = {}) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * 16, 90 * 16, new Inventory());
  player.inv.add(iid(heldVid), 1);
  if (opts.ammoVid) player.inv.add(iid(opts.ammoVid), 30);
  const sel = player.inv.slots.findIndex((s) => s && s.id === iid(heldVid));
  player.inv.selected = Math.max(0, sel);
  if (opts.prefix) {
    const slot = player.inv.slots[Math.max(0, sel)];
    if (slot) slot.prefix = opts.prefix;
  }
  g.player = player;
  g.world = new World(120, 120, 30, 'bj661');
  const added: Array<{ kind: string; e: unknown }> = [];
  g.entities = {
    critters: [], npcs: [], enemies: [], projectiles: [],
    add: (e: unknown, kind: string) => { added.push({ kind, e }); },
  };
  g.input = {
    mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300,
    rightDown: false, uiBlocking: false, downAction: () => false,
  };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0], x: 800, y: 0 };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.wiresRadial = newWiresRadialState();
  g.uiHeldItemRef = () => null;
  g.inpOverDomUi = () => false;
  g.achievements = { handleSpecialEvent: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g.sfx = {
    play: () => true, playWav: () => true, playWavFile: () => true, playFiles: () => true,
  };
  g.playSfxFile = () => {};
  g.playUseSound = () => {};
  return { g: g as unknown as Game & Record<string, unknown>, player, added };
}

// ============================ 件1a：随从/哨兵 live 伤两步式 ============================

describe('BJ661件1a 随从 live 伤两步式（Projectile.cs:16812 (int)((float)od×md+5E-06f)）', () => {
  it('语义锁：truncCSf32MulBias(1.05,55)=57（旧 f64 Math.round(55×1.05)=58）——f32 中点档判别', () => {
    expect(prefixStat(55).dmg).toBeCloseTo(1.05, 6);
    expect(truncCSf32MulBias(1.05, 55)).toBe(57);
    expect(Math.round(55 * 1.05)).toBe(58);   // 旧式对照（差异本源）
    // 偏置在：恰亏域回到期望整值（GetWeaponDamage 语义）
    expect(truncCSf32MulBias(1, 55)).toBe(55);
    // 无偏置异式对照（棱镜族 BJ651 件2 先例,truncCSf32Mul 恒 ≤ 偏置式）
    expect(truncCSf32Mul(1, 55)).toBe(55);
  });
  it('结构锁：MinionProj dmg0/dmgOf 两行 + ScaleStats import（spawn 烘定基=BJ651-R2 站⑤）', () => {
    const ms = srcMinion();
    expect(ms).toContain("import { truncCSf32MulBias } from '../stats/ScaleStats';");
    expect(ms).toContain('const dmg0 = Math.max(1, truncCSf32MulBias(p.summonDamageMult, this.damage)); // ⑥ pen 移 hit 时');
    expect(ms).toContain('const dmgOf = () => Math.max(1, truncCSf32MulBias(owner ? owner.summonDamageMult : 1, this.damage)); // ⑥ pen 移 hit 时');
    // 旧式全灭（Math.round(this.damage×…summonDamageMult) 不得残留）
    expect(ms).not.toContain('Math.round(this.damage * p.summonDamageMult)');
    expect(ms).not.toContain('Math.round(this.damage * (owner ? owner.summonDamageMult : 1))');
  });
  it('烘定基锁：召唤出口 spawn dmg=roundCSf32Mul(cwIn.damage, ps?.dmg)（BJ651-R2 站⑤ 维持）', () => {
    expect(srcGame()).toContain('const summonDmg = Math.max(1, roundCSf32Mul(cwIn.damage, ps?.dmg ?? 1));');
  });
});

// ============================ 件1b：主枪路径两步式 ============================

describe('BJ661件1b 主枪路径两步式（Item.cs:577 烘定 → Player.cs:54066 GetWeaponDamage）', () => {
  // 星炮 197（dmg55,autoReuse）× 前缀 53（dmg 1.1）：武器段 roundCSf32Mul(55,1.1)=60
  // （f32 银行家,f64 half-up=61）→ truncBias(1,60)=60;弹药加项陨星 75（SetDefaults
  //  I.cs:2302-2314 无 damage 行→num=-1≤0 不加,repo ammoC.damage undefined→0 同相）
  // → 总 60。旧单次 f64 组合 round = 61。
  it('星炮 197 + 前缀 53 + 陨星弹：Arrow.damage=60（旧单 round=61）', () => {
    expect(itemCombat(197)?.damage).toBe(55);
    const { g, added } = stubGame(197, { prefix: 53, ammoVid: 75 });
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const arrows = added.map((a) => a.e).filter((e) => e instanceof Arrow) as Arrow[];
    expect(arrows.length, '星炮未出弹').toBeGreaterThan(0);
    for (const a of arrows) expect(a.damage).toBe(60);
    // 无词缀对照零漂移：roundCSf32Mul(55,1)=55 → 55
    const { g: g2, added: added2 } = stubGame(197, { ammoVid: 75 });
    (g2 as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    for (const a of added2.map((a) => a.e).filter((e) => e instanceof Arrow) as Arrow[]) {
      expect(a.damage).toBe(55);
    }
  });
  it('结构锁：主枪行=truncCSf32MulBias(rangedMult, roundCSf32Mul(base, ps.dmg))+truncCSf32Mul(弹药)', () => {
    const gs = srcGame();
    expect(gs).toContain(`let damage = truncCSf32MulBias(this.player.rangedDamageMult(rKind),
          roundCSf32Mul(bowC?.damage ?? rg?.damage ?? 1, ps?.dmg ?? 1))
        + truncCSf32Mul(this.player.rangedDamageMult(rKind), (ammoC?.damage ?? 0) + ammoBonus); // ⑥ pen 移 hit 时`);
    // 旧单次 f64 组合 round 全灭
    expect(gs).not.toContain('Math.round((bowC?.damage ?? rg?.damage ?? 1) * (ps?.dmg ?? 1) * this.player.rangedDamageMult(rKind))');
  });
});

// ============================ 件1c：投掷 consumable 两站两步式 ============================

describe('BJ661件1c 投掷 consumable 两步式（GetWeaponDamage :54066 偏置在）', () => {
  // 手里剑 42（dmg10）× 前缀 55（dmg 1.05）：roundCSf32Mul(10,1.05)=10（f32 银行家,
  // f64 half-up=11）→ truncBias(1,10)=10。旧单次 f64 组合 round = 11。
  it('手里剑 42 + 前缀 55：Arrow dmg=10（旧 11）', () => {
    expect(itemCombat(42)?.damage).toBe(10);
    const { g, added } = stubGame(42, { prefix: 55 });
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const thrown = added.map((a) => a.e).filter((e) => e instanceof Arrow) as Arrow[];
    expect(thrown.length, '手里剑未掷出').toBeGreaterThan(0);
    for (const a of thrown) expect(a.damage).toBe(10);
    // 无词缀对照零漂移
    const { g: g2, added: added2 } = stubGame(42);
    (g2 as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    for (const a of added2.map((a) => a.e).filter((e) => e instanceof Arrow) as Arrow[]) {
      expect(a.damage).toBe(10);
    }
  });
  it('结构锁：通用投掷面 ≤0 门保持 + 两步式;蜂雷锋 1130 站同式', () => {
    const gs = srcGame();
    expect(gs).toContain(`const dmgT = tc.damage <= 0 ? tc.damage`);
    expect(gs).toContain(`: Math.max(1, truncCSf32MulBias(this.player.damageMult('ranged'),
              roundCSf32Mul(tc.damage, psT?.dmg ?? 1)));`);
    expect(gs).toContain(`const dmgT = Math.max(1, truncCSf32MulBias(this.player.damageMult('ranged'),
      roundCSf32Mul(tc.damage, psT?.dmg ?? 1)));`);
    // 旧式全灭
    expect(gs).not.toContain("Math.max(1, Math.round(tc.damage * (psT?.dmg ?? 1) * this.player.damageMult('ranged')))");
  });
});

// ============================ 件2：锚族勘正抽检（行号纯文档面） ============================

describe('BJ661件2 锚族勘正抽检（1457 亲读真位;1456 伪锚退役）', () => {
  it('WeaponProj：AI_019 伸出盒/Colliding 步进支/aiStyle99 命中链/连枷/悠悠球族', () => {
    const s = src('src/entities/WeaponProj.ts');
    // SpearDustCtx extBox（:316 站）
    expect(s).toContain('Projectile.cs:47034-47073;1456 伪锚 :43530-43571 勘正');
    expect(s).toContain('Colliding（:15420,aiStyle 19 步进支 :15902-15927;1456 伪锚 :14554-14576 勘正）');
    // CounterweightProj 命中链（:3178 站,twin :3776 BJ651 勘正复核归一）
    expect(s.match(/Projectile\.cs:13290-13335 aiStyle 99 段/g)?.length).toBe(2);
    expect(s).not.toContain('Projectile.cs:12467-12508');
    expect(s).toContain(':68701-68707 ai0=-2 支头 penetrate<0→1;1456 伪锚 :64741-64744 勘正');
    expect(s).not.toContain(':64741-64744）一次');
    expect(s).toContain(':68696-68700;1456 伪锚 :64734-64736 勘正');
    expect(s).not.toContain(':64734-64736）');
    // AnchoredProj 连枷族（:4333 站）
    expect(s).toContain('AI_015_Flails，Projectile.cs:44529-45018;1456 伪锚 :41051-41506 勘正');
    expect(s).toContain(':44551-44565 默认值 + :44566-44628 switch');
    expect(s).toContain('缩放链（:44629-44637;1456 伪锚 :41151-41159 勘正）');
    expect(s).toContain('缩放链（:44629-44637 meleeSpeed→num16 七连乘（BJ661 复核补 :44636-44637 num6/num7 两乘）');
    // 悠悠球寿命族（:3493+:3512 站）
    expect(s).toContain('同型前球在场（:68787-68794;1456 伪锚 :64827-64835 勘正');
    expect(s).toContain('ChangeDir 段（:68883-68902;1456 伪锚 :64907-64934 勘正）');
    expect(s).toContain('寿命（:68795-68827;1456 伪锚 :64827-64854 勘正）');
    expect(s).toContain('脱离/幽灵态寿命无限（:68809-68812;1456 伪锚 :64850-64852 勘正）');
    expect(s).toContain('yoyoString(:68937-68940;1456 伪锚 :64971 勘正)');
    expect(s).toContain('×0.75（:68918-68922 `(type == 554) & flag`');
    expect(s).toContain('num7(:68943-68947;1456 伪锚 :64968-64971 勘正)');
    expect(s).toContain('num9 光标死区半径(:68948 + flag:68949-68952;1456 伪锚 :64972/:64976-64978 勘正)');
    // 出生初速（ItemCheck_Shoot :47466/:47468-47470 + num4/5 :47687-47718）
    expect(s).toContain('ItemCheck_Shoot :47466 弹速声明 + :47468-47470 melee 弹速');
    expect(s).toContain(':47687-47718 num4/5（1456 伪锚 :46642-46680 勘正）');
  });
  it('Game.ts：SetItemAnimation/ApplyItemAnimation/老星怒族/弹速/观战 section/墙探针', () => {
    const gs = srcGame();
    expect(gs).toContain('SetItemAnimation(base, mult)（Player.cs:4438-4446;1456 伪锚 :4240-4247 勘正）');
    expect(gs).toContain('（:4470-4477 createTile/createWall 档;1456 伪锚 :4270-4275 勘正');
    expect(gs).toContain('createTile 档（:4470-4473;1456 伪锚 :4270-4272 勘正 useAnimation×tileSpeed）');
    expect(gs).toContain('ApplyItemAnimation :4448/createTile 档 :4470-4473');
    expect(gs).toContain('Player.cs:47661-47676 出生链 + :49607-49620');
    expect(gs).toContain('aiStyle 5 :24116-24119 越线前穿墙用');
    expect(gs).toContain('（Player.cs:43793;1456 伪锚 :42783 勘正）= 每挥一星');
    expect(gs).toContain('目标线回退（:49613-49617;1456 伪锚 :48483-48488 勘正）');
    expect(gs).toContain('ItemCheck_Shoot :47466 speed = sItem.shootSpeed;1456 伪锚 :46430-46434 勘正');
    expect(gs).toContain('ItemCheck_Shoot :47468-47470 弹速缩放;1456 伪锚 :46430-46434 勘正');
    expect(gs).toContain(':47687-47718 num4/5=光标−手心归一×speed;1456 伪锚 :46642-46680 勘正');
    expect(gs).toContain(':47687-47688 num4/num5 同点起算;1456 伪锚 :46642-46643 勘正');
    expect(gs).toContain('RemoteClient.CheckSection 的观战段等价 :17385;1456 伪锚 :17118 勘正');
    expect(gs).toContain('SporeSac :42781;1456 伪锚 :42783 勘正');
  });
  it('Player.ts（isRopeAt 登记外站）：FindPulley/GetRopeEnds/维持退出/ropeCount 门', () => {
    const s = src('src/entities/Player.ts');
    expect(s).toContain('FindPulley :19771-19876;1456 伪锚 :19355-19460 勘正');
    expect(s).toContain('（FindPulley :19771;1456 伪锚 :19363 勘正）与维持退出门（:26465-26468;1456 伪锚 :25950 勘正）');
    expect(s).toContain('GetRopeEnds（WorldGen.cs:70556-70603;1456 伪锚 :70069-70105 勘正');
    expect(s).toContain('漏判（:70560-70580/:70582-70602 亲读;BJ661 复核行界）');
    expect(s).toContain('FindPulley 吸附位碰撞预检（:19829/:19846/:19863;1456 伪锚 :19413/:19430/:19447 勘正）');
    expect(s).toContain(':26316-26323 门 / :26644 置位;1456 伪锚 :25801-25805/:26129 勘正');
    expect(s).toContain('HorizontalMovement 整段不跑（Player.cs:26889 在 pulley else;1456 伪锚 :26366 勘正');
    expect(s).toContain('穿落（:26642-26647;1456 伪锚 :26127-26132 勘正）');
  });
  it('MissileProj.ts：老星怒天降落星族（出生链/type65 块/aiStyle5 门）', () => {
    const s = src('src/entities/MissileProj.ts');
    expect(s).toContain('Projectile.cs:24081-24364;1456 伪锚 :22130-22247 勘正');
    expect(s).toContain('Player.cs:47661-47676;1456 伪锚 :46613-46625 勘正');
    expect(s).toContain(':49607-49620;1456 伪锚 :48479-48491 勘正');
    expect(s).toContain('（:24116-24119;1456 伪锚 :22159-22162 勘正');
    expect(s).not.toContain('Bottom.Y ≥ ai[1]（:22159');
    expect(s).not.toContain('// :22159-22162 tileCollide');
  });
});

// ============================ 变异自证（恰红 + 逐字节还原 + sha256 对拍） ============================

describe.skipIf(process.env.SW_BJ661_MUT)('BJ661 变异自证（每族≥1 发,恰红）', () => {
  const GAME = join(GAME_ROOT, 'src/core/Game.ts');
  const MINION = join(GAME_ROOT, 'src/entities/MinionProj.ts');
  const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

  const mutate = (file: string, trigger: string, replacement: string, filter: string, target: string) => {
    const pristineSha = sha(file);
    withMutation(file, trigger, replacement, () => {
      const r = spawnSync('npx',
        ['vitest', 'run', 'tests/bj661-dmg-anchor-sweep.test.ts', '--no-file-parallelism', '-t', filter],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 600_000, env: { ...process.env, SW_BJ661_MUT: '1' } });
      expect(r.status, `变异须证红（${target}）: ${replacement}\n${r.stdout.slice(-3000)}`).not.toBe(0);
      expect(r.stdout).toContain(filter);
    }, { label: `BJ661 ${filter}` });
    expect(sha(file), `还原后 sha256 对拍不一致: ${file}`).toBe(pristineSha);
  };

  it('M1 件1a：MinionProj dmgOf 两步回退 f64 round → 结构锁红', () => {
    mutate(MINION,
      'truncCSf32MulBias(owner ? owner.summonDamageMult : 1, this.damage)',
      'Math.round(this.damage * (owner ? owner.summonDamageMult : 1)) /* ★BJ661 M1 变异:两步回退 */',
      '结构锁：MinionProj',
      'dmgOf 两步式');
  });

  it('M2 件1a：MinionProj dmg0 两步回退 f64 round → 结构锁红', () => {
    mutate(MINION,
      'truncCSf32MulBias(p.summonDamageMult, this.damage)',
      'Math.round(this.damage * p.summonDamageMult) /* ★BJ661 M2 变异:两步回退 */',
      '结构锁：MinionProj',
      'dmg0 两步式');
  });

  it('M3 件1b：主枪路径两步回退单次 f64 组合 round → 星炮行为锁红（60→61）', () => {
    mutate(GAME,
      `truncCSf32MulBias(this.player.rangedDamageMult(rKind),
          roundCSf32Mul(bowC?.damage ?? rg?.damage ?? 1, ps?.dmg ?? 1))`,
      `Math.round((bowC?.damage ?? rg?.damage ?? 1) * (ps?.dmg ?? 1) * this.player.rangedDamageMult(rKind)) /* ★BJ661 M3 变异:两步回退 */`,
      '星炮 197',
      '主枪路径两步式');
  });

  it('M4 件1c：投掷 dmgT 两步回退单次 f64 组合 round → 手里剑行为锁红（10→11）', () => {
    mutate(GAME,
      `truncCSf32MulBias(this.player.damageMult('ranged'),
              roundCSf32Mul(tc.damage, psT?.dmg ?? 1))`,
      `Math.round(tc.damage * (psT?.dmg ?? 1) * this.player.damageMult('ranged')) /* ★BJ661 M4 变异:两步回退 */`,
      '手里剑 42',
      '投掷面两步式');
  });

  it('M5 件2：锚勘正回退（观战 section :17385→:17118）→ 锚族抽检红', () => {
    mutate(GAME,
      'RemoteClient.CheckSection 的观战段等价 :17385;1456 伪锚 :17118 勘正',
      'RemoteClient.CheckSection 的观战段等价 :17118 /* ★BJ661 M5 变异:锚勘正回退 */',
      '锚族勘正抽检',
      '锚族勘正（Game.ts 观战 section）');
  });
});
