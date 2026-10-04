// BJ502 四柱击败 9999990 大数字（用户实报：打败星云柱时最后伤害显示 9999990，
// "几个 9 记不清"；BJ476 蠕虫 10059 同族嫌疑）。
//
// 定谳（原版 1457 亲读锚）：
//   ① 原版四塔（517 日耀/422 星旋/507 星云/493 星尘,aiStyle 94）死亡链【全程零合成飘字】：
//      · 致死一击：StrikeNPC(owner=myPlayer) 照飘真实伤害（CombatText :82081-82096,
//        数值=防后 num=CalculateDamageNPCsTake(Damage,defense)）。
//      · checkDead（NPC.cs:78884-78889）：四塔血尽转 ai[2]=1 + ai[1]=0 +
//        PrepareForDeathAnimation（:78838-78844 life=lifeMax/dontTakeDamage=true）。
//      · AI_094 死亡演出 180t 上升渐隐（:41031-41128 区,本仓 :39368-39448 行号域）,
//        收刀 = ai[1]>=180 → `life = 0; HitEffect(0, 1337.0); checkDead();`
//        （:39456-39460）——【无 StrikeNPC】零飘字零受击音,直接进掉落/公告面。
//   ② 原版唯一"9999 静默"门：StrikeNPC_Inner（:82065）
//      `flag = Damage >= 9999 && owner == 255` → :82081 `if (!flag && lifeMax > 1)`
//      才发 CombatText（1456 :82127 同形;HitSound :82327+ 在函数体层【不】受门——
//      本仓 BJ476 已裁定受击音同块双静音=checkDead 面同构,保持）。全库
//      9999/9999999/99999999/1e8 大值普查：原版【无任何】合成伤害 >9999——
//      NPC.cs:62964（书籍距离哨兵）/Projectile.cs:10813·10940·39067（弹龄/帧时/
//      高尔夫球哨兵）/NPC.cs:79007（EoW 掉落距离哨兵）全部非伤害;
//      owner==255 通道（GetHurtByDebuff 致死拍 :93007 StrikeNPCNoInteraction(9999)、
//      派对末日清算 :18116 等）传值恒 9999。
//   ③ 999999990 来源（本仓）：towerAI 死亡演出收刀 hurt(1e9)（Enemy.ts:14177;
//      1e9=合成致死值——演出期 hp 已满血重置 20000,须 overwhelming 才达死亡管线）
//      → 防后 CalculateDamageNPCsTake(1e9, 20)=1e9−20×0.5=999999990（四塔
//      SetDefaults lifeMax=20000/defense=20, NPC.cs:15016-15290）→ 旧门
//      `(takenDamageMultiplier>1 || rawDmg!==9999)` 精确匹配击穿 → 飘字 999999990。
//      用户报"9999990"=位数记混（同"一堆 9 结尾 0"族）。BJ476 10059 同根：
//      原版门是 >=阈值+owner槽,本仓窄化成精确匹配且无 owner 维度。
//   ④ 修刀：门形态统一原版——`!(rawDmg >= 9999 && !fromPlayer && remoteOwner===null)`
//      （owner==255 本仓承载=合成击杀位：!fromPlayer 且非远端访客;远端访客原版
//      fromNet 路径 owner=-1→myPlayer 门开照飘 Others 灰,Game.netApplyStrike 置
//      pendingStrikeOwner）。takenDamageMultiplier>1 恒飘支=自造（原版门无此支,
//      乘区只作用 num 值本身）一并摘除。towerAI 收刀 1e9 保持不动（hp 满血重置下
//      9999+0−10 不足致死;门下恒静音,勿回改精确匹配门）。
// 判别面：9998（合成,<9999）照飘 / 9999·99990·9999990·999999990（合成）静默 /
//   9999 fromPlayer（玩家大伤害,原版 owner=myPlayer 门开）照飘 / 远端访客
//   pendingStrikeOwner 照飘 / takenDamageMultiplier×3 不再恒飘（乘区显示仍生效）/
//   四塔击败链零飘字（演出收刀面）/ BJ476 蠕虫 die() 面不回归 / 月总·石巨人转换面抽回归。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { setPendingStrikeOwner } from '../src/chat/BossDamageTracker';

interface Spy {
  numbers: Array<{ x: number; y: number; value: number; crit: boolean; color?: string; dot?: boolean }>;
  sounds: string[];
  wavs: string[];
}

function makeGame(list: Enemy[]): { game: GameHooks; spy: Spy } {
  const spy: Spy = { numbers: [], sounds: [], wavs: [] };
  const game = {
    world: new World(200, 200, 30, 'bj502'),
    // 标准死亡管线读最近玩家（心星/运气结算）——最小玩家桩;fromPlayer=true 支
    // 只读 dead/equipStats（全 undefined=proc 族全短路）/addDPS
    player: {
      dead: false, cx: 0, cy: 0, luck: 0, hp: 400, maxHp: 400, mana: 100, maxMana: 100,
      buffs: { has: () => false, apply: () => {} }, equipStats: {}, addDPS: () => {},
    } as unknown,
    enemies: () => list,
    critters: () => [],
    entities: { nextId: 1, add: () => {} },
    recLog: () => {},
    noSpawnCycleThisFrame: false,
    addDamageNumber: (x: number, y: number, value: number, crit: boolean, color?: string, dot?: boolean) => {
      spy.numbers.push({ x, y, value, crit, color, dot });
    },
    playSfx: () => {}, playSfxFiles: (files: string[]) => { spy.sounds.push(...files); },
    playSfxWav: (f: string) => { spy.wavs.push(f); },
    playSfxFile: () => {},
    spawnParticles: () => {}, spawnDrop: () => null, spawnEnemy: () => {},
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, cutTile: () => {},
    spawnDust: () => null, applyLifeSteal: () => 0,
    spawnTitaniumShard: () => {}, spawnOnHitPetals: () => {}, chloroOnHitLeafStrike: () => {},
    dust: { spawn: () => ({}) },
  } as unknown as GameHooks;
  return { game, spy };
}

const hitSounds = (spy: Spy) => spy.sounds.filter((f) => f.startsWith('NPC_Hit_'));
const deathSounds = (spy: Spy) => spy.sounds.filter((f) => f.startsWith('NPC_Killed_'));

describe('BJ502 ①四柱击败链零合成飘字（原版 :39456-39460 life=0 直落,无 StrikeNPC）', () => {
  it('星云柱 507（用户实报柱）：玩家致死一击照飘真实伤害（原版相）→ 演出收刀零飘字零受击音', () => {
    const list: Enemy[] = [];
    const { game, spy } = makeGame(list);
    const tw = Enemy.fromVanilla(507, 80 * TILE, 100 * TILE)!;
    expect(tw).toBeTruthy();
    list.push(tw);
    // 原版 SetDefaults 钉值（NPC.cs:15129-15142）：lifeMax=20000 / defense=20
    expect(tw.maxHp).toBe(20000);
    expect(tw.def.defense ?? 0).toBe(20);

    // 致死一击（玩家,fromPlayer=true）：20010−20×0.5=20000 → 血尽转演出
    expect(tw.hurt(20010, 0, 0, game, 0, false, 0, true)).toBe(false);
    expect(spy.numbers.length).toBe(1);            // 玩家致死一击照飘（原版相,禁静音）
    expect(spy.numbers[0].value).toBe(20000);      // 防后终值
    expect(tw.ai2).toBe(1);                        // checkDead :78884-78889 转演出
    expect(tw.ai1).toBe(0);
    expect(tw.hp).toBe(tw.maxHp);                  // PrepareForDeathAnimation 满血续命
    expect(tw.dontTakeDamage).toBe(true);          // :78838 真旗

    // 演出收刀（towerAI ai1>=180 → hurt(1e9)）：旧码在此冒 999999990 大字+受击音
    tw.ai1 = 179;
    (tw as unknown as Record<string, (g: GameHooks, p: null) => void>)['towerAI'](game, null);
    expect(spy.numbers.length).toBe(1);            // ★判别点：收刀零飘字（旧码 999999990 红）
    expect(hitSounds(spy).length).toBe(1);         // ★收刀零受击音（仅致死一击那声）
    expect(deathSounds(spy).length).toBeGreaterThan(0);   // 死亡面（checkDead 面）照播
    expect(tw.dead).toBe(true);                    // 死亡管线照走（碎片/公告面）
  });

  it('四塔 517/422/493 全族：合成 9999 致死一击静默+演出收刀静默（DoT/环境杀同构面）', () => {
    for (const id of [517, 422, 493]) {
      const list: Enemy[] = [];
      const { game, spy } = makeGame(list);
      const tw = Enemy.fromVanilla(id, 80 * TILE, 100 * TILE)!;
      list.push(tw);
      expect(tw.maxHp).toBe(20000);
      expect(tw.def.defense ?? 0).toBe(20);
      tw.hp = 1;
      tw.hurt(9999, 0, 0, game);                   // 合成致死一击（GetHurtByDebuff 同通道）
      expect(spy.numbers).toEqual([]);             // 9999 静默门（原版 :82065 flag 命中）
      expect(tw.ai2).toBe(1);
      tw.ai1 = 179;
      (tw as unknown as Record<string, (g: GameHooks, p: null) => void>)['towerAI'](game, null);
      expect(spy.numbers).toEqual([]);             // 收刀零飘字
      expect(tw.dead).toBe(true);
    }
  });
});

describe('BJ502 ②门形态判别（原版 :82065 Damage>=9999 && owner==255;本仓 owner255 位=!fromPlayer 且非远端）', () => {
  // 墓穴爬虫头 513：lifeMax=60/defense=0（BJ476 锚型,def=0 使防后值=rawDmg 逐位可判）
  it('9998（合成,<9999）照飘——门的下边界（旧精确匹配门同飘,无判别损失）', () => {
    const list: Enemy[] = [];
    const { game, spy } = makeGame(list);
    const e = Enemy.fromVanilla(513, 100, 100)!;
    list.push(e);
    e.hurt(9998, 0, 0, game);
    expect(spy.numbers.length).toBe(1);
    expect(spy.numbers[0].value).toBe(9998);
    expect(hitSounds(spy).length).toBe(1);
  });

  it('9999 / 99990 / 9999990 / 999999990（合成,>=9999）全档静默——99990/9999990 旧精确匹配门照飘=判别红', () => {
    for (const dmg of [9999, 99990, 9999990, 999999990]) {
      const list: Enemy[] = [];
      const { game, spy } = makeGame(list);
      const e = Enemy.fromVanilla(513, 100, 100)!;
      list.push(e);
      e.hurt(dmg, 0, 0, game);
      expect(spy.numbers, `rawDmg=${dmg} 应静默`).toEqual([]);
      expect(hitSounds(spy), `rawDmg=${dmg} 受击音应静默`).toEqual([]);
      expect(e.dead).toBe(true);                 // 静默≠不结算,死亡管线照走
    }
  });

  it('9999 fromPlayer=true（玩家大伤害）照飘——原版 owner=myPlayer 门开,禁被合成静默误伤', () => {
    const list: Enemy[] = [];
    const { game, spy } = makeGame(list);
    const e = Enemy.fromVanilla(513, 100, 100)!;
    list.push(e);
    e.hurt(9999, 0, 0, game, 0, false, 0, true);
    expect(spy.numbers.length).toBe(1);
    expect(spy.numbers[0].value).toBe(9999);
    expect(hitSounds(spy).length).toBe(1);
  });

  it('远端访客（pendingStrikeOwner 置位）12000 照飘——原版 fromNet owner=-1→myPlayer 门开（旧码同飘,无判别损失）', () => {
    const list: Enemy[] = [];
    const { game, spy } = makeGame(list);
    const e = Enemy.fromVanilla(513, 100, 100)!;
    list.push(e);
    setPendingStrikeOwner(2);
    try {
      e.hurt(12000, 0, 0, game);                 // netApplyStrike 形态：fromPlayer=false+访客槽
      expect(spy.numbers.length).toBe(1);        // 远端照飘（Others 灰,色面不在此判）
    } finally {
      setPendingStrikeOwner(null);               // 防串账（netApplyStrike 尾同款清位）
    }
  });

  it('takenDamageMultiplier×3 不再恒飘：合成 9999 静默（旧门 multiplier>1 恒飘支=自造,判别红）', () => {
    const list: Enemy[] = [];
    const { game, spy } = makeGame(list);
    const e = Enemy.fromVanilla(513, 100, 100)!;
    list.push(e);
    e.takenDamageMultiplier = 3;
    e.hurt(9999, 0, 0, game);
    expect(spy.numbers).toEqual([]);             // 原版门无 multiplier 支（:82065 纯两谓词）
    // 乘区对显示值本身仍生效（普通伤照算 ×3）——门摘除不伤乘区
    const e2 = Enemy.fromVanilla(513, 100, 100)!;
    list.push(e2);
    e2.takenDamageMultiplier = 3;
    e2.hurt(100, 0, 0, game);
    expect(spy.numbers.length).toBe(1);
    expect(spy.numbers[0].value).toBe(300);      // trunc(max(1,100−0))×3
  });
});

describe('BJ502 ③BJ476 蠕虫面不回归 + ④大 Boss 死亡转换面抽回归', () => {
  it('BJ476 蠕虫 die()（级联自灭）：零飘字零受击音+死亡管线照走（9999 通道被门承接）', () => {
    const list: Enemy[] = [];
    const { game, spy } = makeGame(list);
    const e = Enemy.fromVanilla(513, 100, 100)!;
    list.push(e);
    e.die(game);
    expect(spy.numbers).toEqual([]);
    expect(hitSounds(spy)).toEqual([]);
    expect(deathSounds(spy).length).toBeGreaterThan(0);
    expect(e.dead).toBe(true);
  });

  it('石巨人挂载头 246（本体 245 活）：致死拍真实伤害照飘+转换写旗,无合成大字（X4-债14 面抽回归）', () => {
    const list: Enemy[] = [];
    const { game, spy } = makeGame(list);
    const body = Enemy.fromVanilla(245, 60 * TILE, 100 * TILE)!;
    const head = Enemy.fromVanilla(246, 80 * TILE, 100 * TILE)!;
    list.push(body, head);
    head.hp = 1;
    expect(head.hurt(999, 0, 0, game, 0, false, 0, true)).toBe(false);   // 玩家致死拍
    expect(spy.numbers.length).toBe(1);          // 致死一击照飘（原版相）
    expect(spy.numbers[0].value).toBeLessThan(2000);   // 真实伤害量级,非 999999990 族
    expect(head.dontTakeDamage).toBe(true);      // 清偿刀 Y 真旗（:78838）
    expect(head.dead).toBe(false);               // 转换放行（golemHeadAI 首行接管）
  });

  it('月总头 396：致死拍真实伤害照飘+转换写旗（:78864-78883 面,闭眼残肢在 AI 首行）', () => {
    const list: Enemy[] = [];
    const { game, spy } = makeGame(list);
    const head = Enemy.fromVanilla(396, 80 * TILE, 100 * TILE)!;
    list.push(head);
    head.hp = 1;
    expect(head.hurt(999999, 0, 0, game, 0, false, 0, true)).toBe(false);
    expect(spy.numbers.length).toBe(1);          // 致死一击照飘（玩家大伤害原版本相）
    expect(spy.numbers[0].value).toBeLessThan(1000000);
    expect(head.dontTakeDamage).toBe(true);
    expect(head.dead).toBe(false);
  });
});
