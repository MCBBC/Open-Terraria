// ★清偿刀 Y（2026-09-29,X4-债14）：死亡转换写支 kill-tick 护窗判别测试。
//   病灶（T/W 两刀定谳汇总）：原版死亡转换=checkDead 内联直调 PrepareForDeathAnimation
//   （NPC.cs:78836-78842：life=lifeMax + dontTakeDamage=true + SetStrikePhaseChange），
//   且 checkDead 由 StrikeNPC_Inner 尾同步调用（:82393-82398,无 AI tick 延迟）→
//   致死拍起全通道闭合：弹幕 Damage_PVE 两门（Projectile.cs:12598/:12686）、近战
//   （Player.cs:20542 等）、NPC 互伤（NPC.cs:93557）同帧拒收。
//   本仓死亡路径内嵌于 Enemy.hurt（checkDead 等价位）,四支转换写支旧档缺真旗：
//     ① 四塔 517/422/507/493（:14421 写 iframes=2 不写真旗）→ flag3 单发弹
//       （pierce===1 豁免免疫门 :13990）转换同帧至下个 AI tick 间绕门再结算
//       （2t 窄缝,T 刀读侧快照已使 proc/入账面等价,残余仅此窗）;
//     ② 放行支 396/397/398/371/246（纯 return false 零写面）→ 清零档写入方
//       （567/568/251 idStatic、656/856 usesLocal,命中写 iframes=0,Enemy.ts:14297）
//       下同拍补刀可对转换态再结算。
//   落刀=六分支补写真旗（原版 checkDead 位,状态转换仍在各 AI 首行=台账①②架构）。
//   判别力（全用真 Enemy.fromVanilla,写支在真 hurt 内部,debt-r/t/w 同式）：
//   旧码（无旗）下各「同拍补刀」命中落地（hp 变动）红;新码全绿。
//   全通道等价性：hurt=本仓合并结算漏斗（弹幕/近战/DoT/互伤全经此）,头门
//   `if (this.dontTakeDamage) return false`（:13991）拒收=四通道同帧闭合。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { dukeBubbleAI } from '../src/entities/bossAI_duke_moonlord';

function makeGame(list: Enemy[]): GameHooks {
  return {
    world: new World(200, 200, 30, 'debt-y'),
    // 标准死亡管线读最近玩家（心星/运气结算 :14749）——最小玩家桩（fromPlayer=false
    // 时 hurt 的攻端玩家支全部短路,死亡面只读 luck/hp/mana 标量）
    player: {
      dead: false, cx: 0, cy: 0, luck: 0, hp: 400, maxHp: 400, mana: 100, maxMana: 100,
    } as unknown,
    enemies: () => list,
    critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
    applyLifeSteal: () => 0,
  } as unknown as GameHooks;
}

describe('清偿刀 Y：死亡转换写支 kill-tick 护窗（X4-债14）', () => {
  it('①四塔窄缝：517 血尽转演出拍,flag3 单发弹（pierce=1）同拍补刀照拒（旧码绕 iframes 门直伤）', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const tw = Enemy.fromVanilla(517, 80 * TILE, 100 * TILE)!;
    expect(tw).toBeTruthy();
    list.push(tw);
    tw.hp = 1;
    // 致死拍：flag3 单发弹（pierce=1）——转换写支原样（T 刀物证钉面,禁改）
    expect(tw.hurt(100, 0, 0, game, 0, false, 1)).toBe(false);
    expect(tw.ai2).toBe(1);                       // 血尽转演出
    expect(tw.hp).toBe(tw.maxHp);                 // 满血续命
    expect(tw.iframes).toBe(2);                   // :14421 写支原样
    expect(tw.dontTakeDamage).toBe(true);         // ★本刀：checkDead 真旗（:78888→:78838）
    // 同拍补刀（转换同帧至下个 AI tick 间）：旧码 pierce===1 豁免免疫门直伤塔体
    const hp0 = tw.hp;
    expect(tw.hurt(500, 0, 0, game, 0, false, 1)).toBe(false);
    expect(tw.hp).toBe(hp0);                      // 零结算（旧码=maxHp-500 红）
    expect(tw.ai2).toBe(1);                       // 不坠入标准死亡管线
  });

  it('②四塔窄缝 AI 交接：致死拍写旗后 towerAI 演出支每拍重写旗（R23b-P1 形态相容）', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const tw = Enemy.fromVanilla(422, 80 * TILE, 100 * TILE)!;
    list.push(tw);
    tw.hp = 1;
    expect(tw.hurt(100, 0, 0, game, 0, false, -3)).toBe(false);   // 清零档致死（iframes=0）
    expect(tw.dontTakeDamage).toBe(true);
    // 下个 AI tick：towerAI ai2==1 演出支接管（旗每拍重写=true）
    (tw as unknown as Record<string, (g: GameHooks, p: null) => void>)['towerAI'](game, null);
    expect(tw.ai2).toBe(1);
    expect(tw.ai1).toBe(1);                       // 演出时钟已走
    expect(tw.dontTakeDamage).toBe(true);         // towerAI :13605-13606 重写
    // 演出期补刀（pierce=1 flag3）仍拒
    const hp0 = tw.hp;
    expect(tw.hurt(500, 0, 0, game, 0, false, 1)).toBe(false);
    expect(tw.hp).toBe(hp0);
  });

  it('③月总头 396：清零档（pierce=-3）致死拍放行支写真旗,同拍清零档补刀照拒（旧码 iframes=0 门洞开）', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const head = Enemy.fromVanilla(396, 80 * TILE, 100 * TILE)!;
    list.push(head);
    head.hp = 1;
    // 致死拍：清零档写入方弹（567/568/656/251/856 同档 pierce=-3,命中写 iframes=0）
    expect(head.hurt(100, 0, 0, game, 0, false, -3)).toBe(false);
    expect(head.hp).toBeLessThanOrEqual(0);       // 致死结算照走（原版 StrikeNPC 结算面）
    expect(head.iframes).toBe(0);                 // 清零档尾写原样（:14297）
    expect(head.dontTakeDamage).toBe(true);       // ★本刀：checkDead 真旗（:78870→:78838）
    expect(head.ai0).not.toBe(-2);                // 状态转换仍在 AI 首行（台账①,本刀不动）
    // 同拍补刀（清零档,iframes=0 门洞开）：旧码整弹再结算（hp 再减）
    const hp0 = head.hp;
    expect(head.hurt(200, 0, 0, game, 0, false, -3)).toBe(false);
    expect(head.hp).toBe(hp0);                    // 零结算
    expect(head.ai0).not.toBe(-2);
  });

  it('④月总核心 398：普通档致死拍写旗,flag3 同拍补刀（pierce===1 豁免 iframes=10）照拒', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const core = Enemy.fromVanilla(398, 80 * TILE, 100 * TILE)!;
    list.push(core);
    core.hp = 1;
    expect(core.hurt(100, 0, 0, game, 0, false, 0)).toBe(false);  // 普通档致死（写 iframes=10）
    expect(core.iframes).toBe(10);
    expect(core.dontTakeDamage).toBe(true);       // ★本刀（:78881→:78838）
    const hp0 = core.hp;
    expect(core.hurt(200, 0, 0, game, 0, false, 1)).toBe(false);  // flag3 绕 iframes
    expect(core.hp).toBe(hp0);
    expect(core.ai0).not.toBe(2);                 // 演出态转换仍在 AI 首行
  });

  it('⑤猪鲨爆裂泡泡 371：致死拍写旗→同拍清零档补刀照拒→AI 首 tick 引信态（满血+旗）补刀仍拒', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const bub = Enemy.fromVanilla(371, 80 * TILE, 100 * TILE)!;
    list.push(bub);
    expect(bub.maxHp).toBe(1);                    // SetDefaults :13754 lifeMax=1
    expect(bub.hurt(100, 0, 0, game, 0, false, -3)).toBe(false);  // 清零档致死拍
    expect(bub.dontTakeDamage).toBe(true);        // ★本刀（:78854→:78838）
    const hpKill = bub.hp;
    expect(bub.hurt(100, 0, 0, game, 0, false, -3)).toBe(false);  // 同拍补刀
    expect(bub.hp).toBe(hpKill);                  // 零结算
    // AI 首 tick：dukeBubbleAI 首行转换（ai0=1/ai1=4+满血+旗,台账②架构不动）
    dukeBubbleAI(bub, game, null);
    expect(bub.ai0).toBe(1);
    expect(bub.ai1).toBe(3);                      // ai1=4 置位后同 tick 引信支即 -1（:35187-35268 同构）
    expect(bub.hp).toBe(bub.maxHp);
    expect(bub.dontTakeDamage).toBe(true);
    // 引信态补刀照拒（原版 AI :35270 每 tick 置旗面）
    expect(bub.hurt(100, 0, 0, game, 0, false, -3)).toBe(false);
    expect(bub.hp).toBe(bub.maxHp);
  });

  it('⑥石巨人挂载头 246：致死拍放行支写真旗,同拍补刀照拒（原版无 246 checkDead 支=active 门等价闭合）', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const body = Enemy.fromVanilla(245, 80 * TILE, 100 * TILE)!;
    const head = Enemy.fromVanilla(246, 80 * TILE, 100 * TILE)!;
    list.push(body, head);
    head.hp = 1;
    expect(head.hurt(100, 0, 0, game, 0, false, -3)).toBe(false); // 本体活 → 放行
    expect(head.dontTakeDamage).toBe(true);       // ★本刀：窗内真旗
    expect(head.dead).toBe(false);                // 转换仍在 golemHeadAI 首行（boss#19 定案）
    const hp0 = head.hp;
    expect(head.hurt(200, 0, 0, game, 0, false, 1)).toBe(false);  // 同拍补刀（flag3）
    expect(head.hp).toBe(hp0);
    expect(head.dead).toBe(false);
  });

  it('⑦非转换死亡零回归：普通敌怪致死走标准管线（dead=true）,无旗残留副作用', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const z = Enemy.fromVanilla(15, 80 * TILE, 100 * TILE)!;
    list.push(z);
    z.hp = 1;
    expect(z.hurt(100, 0, 0, game, 0, false, 0)).toBe(true);      // 标准死亡结算
    expect(z.dead).toBe(true);
    expect(z.hurt(100, 0, 0, game, 0, false, 1)).toBe(false);     // 死亡单次门拒补刀
    expect(z.dontTakeDamage).toBe(false);                         // 标准死亡不写转换旗
  });
});
