// BJ405（2026-09-29 用户实报）：右键不能取消召唤的仆从,其他 buff 都可以右键取消。
//
// 定谳锚（Terarria1457 亲读,行号 = 1457 基线）：
// · 右键域 = Main.DrawBuffIcon（Main.cs:44043-44091）：悬停命中 → `mouseRight &&
//   mouseRightRelease` → TryRemovingBuff(buffSlotOnPlayer, num)（:44066-44074）。
// · 门 = Main.TryRemovingBuff（Main.cs:44093-44117）首行
//   `if (!debuff[b] && b != 60 && b != 151)`——过门才 CheckBuffHideMisc×2 +
//   PlaySound(12)（:44107）+ DelBuff（:44110）;坐骑支 :44100-44103 CheckBuff→
//   TryDismount 顶替 DelBuff。debuff 表 = Main.debuff（Main.cs:9004-9079 写位
//   76 项,本文件 VANILLA_DEBUFF_IDS 为 node 直读反编译产物）;60=LeafCrystal、
//   151=SoulDrain 是仅有的两个非 debuff 不可取消成员。BuffID.Sets.CanBeCleared
//   在 1457 全库不存在（右键域不消费任何 BuffID.Sets 清除位）。
// · 随从无特支：MINION_BUFFS 全族（49/64/83/125/126/133/134/135/139/140/161/182/
//   188/213/214/216/263/271/322/325/335/355/385/386/389/390/393/394）全不在 debuff
//   表 → 右键照走 DelBuff。消散链 = buff 槽消失 → 伴生旗（slime/hornetMinion/
//   impMinion…）无人置真（ResetEffects Player.cs:18738-18739 每帧清旗;UpdateBuffs
//   的槽位分支 :10184-10295 因槽不在整体不进）→ 随从 AI 停刷 `timeLeft=2`
//   （Projectile.cs:66101-66104 黄蜂 373/小鬼 375、:59436 史莱姆 266 同构面）→
//   ≤2t 自灭。**buff 槽 = 召唤的活体凭证,删除即取消召唤**。
// · 本仓病灶（已修）= Game.maintainMinionBuffs 旧把「槽位续写 buffTime[j]=18000」
//   建模成 buffs.set 无条件 upsert（复活键）——右键 buffs.remove 次 tick 即复活,
//   图标永在、随从不散。修 = 槽位门：buff 不在 → 维护支不进（无续期/无 216 重生/
//   无授予）+ 在役随从同拍 m.dead（timeLeft 桥的直杀建模,原版 2t≈33ms 不可感延迟）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINION_BUFFS, maintainMinionBuffs } from '../src/core/Game';
import { BuffType, BUFF_DEFS, BuffState, buffRightClickRemovable, buffTypeByVanilla } from '../src/stats/Buffs';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_TS = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const UI_TS = readFileSync(join(ROOT, 'src/ui/UI.ts'), 'utf8');
const BUFFS_TS = readFileSync(join(ROOT, 'src/stats/Buffs.ts'), 'utf8');

/** 金标 = 1457 Main.cs:9004-9079 Main.debuff 写位全表（76 项;改动须先对 1457 复核）。
 *  1456 行号域为 8995-9070 附近（基线切换,勿互抄行号）。 */
const VANILLA_DEBUFF_IDS: readonly number[] = [
  158, 160, 20, 21, 22, 23, 24, 25, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  44, 46, 47, 67, 68, 69, 70, 395, 80, 86, 87, 88, 89, 94, 103, 119, 120, 137,
  145, 146, 147, 148, 149, 156, 157, 350, 163, 164, 144, 194, 195, 196, 197,
  199, 215, 320, 321, 332, 333, 334, 353, 323, 324, 43, 153, 203, 204, 169,
  189, 183, 186, 344, 72, 397, 398, 399, 400,
];

/** vanilla TryRemovingBuff 显式排除的两个非 debuff 成员（Main.cs:44109）。 */
const VANILLA_NEVER_REMOVABLE = [60, 151];

function makeMinion(pl: Player, projId: number): MinionProj {
  return new MinionProj(60 * 16, 90 * 16, projId, 10, 2, false, 0, false, () => pl);
}

function maintain(pl: Player, minions: MinionProj[]): MinionProj[] {
  const spawned: MinionProj[] = [];
  maintainMinionBuffs(pl, minions, (m) => spawned.push(m));
  return spawned;
}

// ---------------------------------------------------------------------------
// ① 源锚（落点在码）
// ---------------------------------------------------------------------------
describe('① BJ405 源锚：槽位门 + 右键门挂线', () => {
  it('Game.maintainMinionBuffs 槽位门在码：buff 不在 → 在役随从同拍直杀', () => {
    expect(GAME_TS).toContain('if (!player.buffs.has(bt)) {');
    // ★BJ670 重锚：杀支带 extra 伴生弹面（killSet ∪= extra;旧 projs.includes 形已被替换）
    expect(GAME_TS).toContain('killSet.includes(m.projId)) m.dead = true');
    expect(GAME_TS).toContain('const killSet = extra ? [...projs, ...extra] : projs;');
  });

  it('UI.makeBuffBlock 右键挂线：else if (buffRightClickRemovable(t)) 门', () => {
    expect(UI_TS).toContain('else if (buffRightClickRemovable(t)) {');
  });

  it('Buffs.ts 导出右键门（≡ TryRemovingBuff 首行）', () => {
    expect(BUFFS_TS).toContain('export function buffRightClickRemovable');
  });
});

// ---------------------------------------------------------------------------
// ② 门判别（buffRightClickRemovable = TryRemovingBuff `!debuff[b] && b != 60 && b != 151`）
// ---------------------------------------------------------------------------
describe('② 右键门判别', () => {
  it('随从伴生 buff 全族可右键（=用户实报期望面：MINION_BUFFS 28 族逐个）', () => {
    for (const { buff } of MINION_BUFFS) {
      const t = buffTypeByVanilla(buff);
      expect(t, `vanilla ${buff} 应有 BuffType 映射`).toBeDefined();
      expect(buffRightClickRemovable(t!), `vanilla ${buff} 右键应可取消`).toBe(true);
    }
  });

  it('60 水晶叶/151 吸魂：非 debuff 但原版显式排除 → 不可右键', () => {
    for (const vb of VANILLA_NEVER_REMOVABLE) {
      const t = buffTypeByVanilla(vb)!;
      expect(BUFF_DEFS[t].vanillaBuff).toBe(vb);
      expect(buffRightClickRemovable(t), `vanilla ${vb} 右键静默拒绝`).toBe(false);
    }
  });

  it('DEBUFFS 全体成员不可右键（debuff 表位 → TryRemovingBuff 拒绝）', () => {
    expect(BuffState.DEBUFFS.size).toBeGreaterThan(0);
    for (const t of BuffState.DEBUFFS) {
      expect(buffRightClickRemovable(t), `${BuffType[t]} 在 DEBUFFS 应拒右键`).toBe(false);
    }
  });

  it('普通增益可右键（非 debuff 非 60/151）', () => {
    for (const t of [BuffType.Regen, BuffType.WellFed, BuffType.Ironskin, BuffType.Mining,
      BuffType.Battle, BuffType.Calming, BuffType.Archery, BuffType.Agility]) {
      expect(BuffState.DEBUFFS.has(t), `${BuffType[t]} 前置=非 debuff`).toBe(false);
      expect(buffRightClickRemovable(t), `${BuffType[t]} 右键应可取消`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ③ 表审计：Main.debuff 全表（76 写位）× 本仓分类 1:1 对拍
// ---------------------------------------------------------------------------
describe('③ Main.debuff 全表 1:1 对拍（1457 Main.cs:9004-9079）', () => {
  it('金标自洁：76 项无重复', () => {
    expect(new Set(VANILLA_DEBUFF_IDS).size).toBe(VANILLA_DEBUFF_IDS.length);
  });

  it('已实装 ∧ vanilla debuff 表 ⇒ ∈ BuffState.DEBUFFS（右键门/护士/驱逐共用分类位）', () => {
    const missing: string[] = [];
    for (const [bt, d] of Object.entries(BUFF_DEFS)) {
      if (VANILLA_DEBUFF_IDS.includes(d.vanillaBuff) && !BuffState.DEBUFFS.has(Number(bt) as BuffType)) {
        missing.push(`${BuffType[Number(bt)]}(${d.vanillaBuff})`);
      }
    }
    expect(missing, `在册未归位 debuff（须入 DEBUFFS）: ${missing.join(', ')}`).toEqual([]);
  });

  it('反向漂移锁：DEBUFFS 成员 ⇒ vanillaBuff ∈ Main.debuff 表（防正面 buff 被误禁右键）', () => {
    const drift: string[] = [];
    for (const t of BuffState.DEBUFFS) {
      const vb = BUFF_DEFS[t]?.vanillaBuff;
      if (vb === undefined || !VANILLA_DEBUFF_IDS.includes(vb)) {
        drift.push(`${BuffType[t]}(${vb ?? '无映射'})`);
      }
    }
    expect(drift, `DEBUFFS 越表成员: ${drift.join(', ')}`).toEqual([]);
  });

  it('随从伴生 buff 与 debuff 表零交集（右键取消面不被表污染的前提）', () => {
    for (const { buff } of MINION_BUFFS) {
      expect(VANILLA_DEBUFF_IDS.includes(buff), `随从 buff ${buff} 不应在 debuff 表`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// ④ maintainMinionBuffs 槽位门（右键取消 → 仆从消散）判别
// ---------------------------------------------------------------------------
describe('④ 右键取消召唤：槽位门消散链（黄蜂 373/125 全程 representative）', () => {
  it('召唤→维持：授予(apply)后弹在场 → buff 直写 300s（授予链不被槽位门误伤）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const t = BuffType.HornetMinion;
    pl.buffs.apply(t, 300);                        // 召唤武器出手授予（ItemCheck AddBuff 语义）
    const m = makeMinion(pl, 373);
    maintain(pl, [m]);
    expect(pl.buffs.active.get(t)).toBe(300);
    expect(m.dead).toBe(false);
  });

  it('★右键取消 → 仆从同拍消散 + buff 永撤（本实报主判据）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const t = BuffType.HornetMinion;
    pl.buffs.apply(t, 300);
    const m = makeMinion(pl, 373);
    maintain(pl, [m]);
    expect(m.dead).toBe(false);                    // 前置：正常在役
    // —— 右键（UI buffRightClickRemovable 门过 → buffs.remove ≡ DelBuff）——
    expect(buffRightClickRemovable(t)).toBe(true);
    pl.buffs.remove(t);
    maintain(pl, [m]);                             // 次 tick 维护
    expect(pl.buffs.has(t), '右键后 buff 永撤（旧 upsert 模型在此复活=病灶）').toBe(false);
    expect(m.dead, '在役随从失去活体凭证 → 同拍消散（原版 timeLeft ≤2t 桥）').toBe(true);
  });

  it('反 resurrection 锁：消散后再维护, buff 不复被授予、亡弹不入账', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const t = BuffType.HornetMinion;
    pl.buffs.apply(t, 300);
    const m = makeMinion(pl, 373);
    pl.buffs.remove(t);                            // 右键在前
    maintain(pl, [m]);
    maintain(pl, [m]);                             // 再 tick 仍无
    expect(pl.buffs.has(t)).toBe(false);
  });

  it('无凭证 + 在役（任意来源缺 buff）→ 直杀：史莱姆 266/64', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const m = makeMinion(pl, 266);                 // 无 apply（右键已发生/读档缺授予）
    maintain(pl, [m]);
    expect(m.dead).toBe(true);
    expect(pl.buffs.has(BuffType.BabySlime)).toBe(false);
  });

  it('多型族整族消散：蜘蛛 390+391 同缺 133 → 双双直杀;双子 387/388 同理', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const s1 = makeMinion(pl, 390);
    const s2 = makeMinion(pl, 391);
    maintain(pl, [s1, s2]);
    expect(s1.dead).toBe(true);
    expect(s2.dead).toBe(true);
    const g1 = makeMinion(pl, 387);
    const g2 = makeMinion(pl, 388);
    maintain(pl, [g1, g2]);
    expect(g1.dead).toBe(true);
    expect(g2.dead).toBe(true);
  });

  it('异族不牵连：125 凭证在、126 弹在场但 126 凭证缺 → 只杀 375,373 安然', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    pl.buffs.apply(BuffType.HornetMinion, 300);    // 仅黄蜂有凭证
    const hornet = makeMinion(pl, 373);
    const imp = makeMinion(pl, 375);               // 小鬼弹在场但凭证缺（被右键过）
    maintain(pl, [hornet, imp]);
    expect(hornet.dead).toBe(false);
    expect(imp.dead).toBe(true);
    expect(pl.buffs.has(BuffType.HornetMinion)).toBe(true);
  });

  it('龙族：188 凭证缺 → 625 头直杀（链段经 parentRef 断链自灭,MinionProj.ts:1265）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const head = makeMinion(pl, 625);
    maintain(pl, [head]);
    expect(head.dead).toBe(true);
  });

  it('216 重生支被槽位门锁：凭证缺 + 杖在包 + 空槽 → 不重生不授予（旧模型在此复活=变异判别面）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    pl.inv.add(4281, 1);
    const spawned = maintain(pl, []);
    expect(spawned).toHaveLength(0);
    expect(pl.buffs.has(BuffType.BabyBird)).toBe(false);
  });

  it('216 凭证缺 + 759 在场 → 直杀且不重生（槽位门先于重生支,原版分支在槽循环体内）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    pl.inv.add(4281, 1);
    const bird = makeMinion(pl, 759);
    const spawned = maintain(pl, [bird]);
    expect(bird.dead).toBe(true);
    expect(spawned).toHaveLength(0);
    expect(pl.buffs.has(BuffType.BabyBird)).toBe(false);
  });

  it('空转零副作用：无凭证无随从 → 不授予不生成（24 族逐个）', () => {
    for (const { buff } of MINION_BUFFS) {
      const pl = new Player(60 * 16, 90 * 16, new Inventory());
      const t = buffTypeByVanilla(buff)!;
      const spawned = maintain(pl, []);
      expect(spawned).toHaveLength(0);
      expect(pl.buffs.has(t), `vanilla ${buff} 无凭证不应在栏`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// ⑤ BJ670（2026-10-13 用户实报「阿比盖尔右击 buff 消失但召唤物本体不消失」）：
//   原版双弹结构（970 凭证 + 963 可视本体）右击须双灭。
//   锚（1457 亲读）：5114 shoot=970（Item.cs:40965）;970=AbigailCounter 隐藏凭证
//   弹（hide=true,aiStyle 164,Projectile.cs:9184-9197）,963=可视本体（aiStyle 62,
//   :9102-9116）由 UpdateAbigailStatus 依 970 计数补生/全杀（Player.cs:12363-12377）；
//   buff 335 支置位/续期弹判据只认 970（Player.cs:10946-10960）;963/970 保活皆走
//   abigailMinion 旗 → timeLeft=2 贴地（AI_062 :66077-66084/AI_164 :47479-47486）,
//   旗由 buff 循环置位、ResetEffects 每拍清零（:18756）——右击摘 buff → 双弹
//   ≤2t 同灭。本仓同拍直杀建模：杀支须带 extra 伴生本体 963。
// ---------------------------------------------------------------------------
describe('⑤ BJ670 阿比盖尔双弹：右击 buff → 凭证 970 + 本体 963 双灭', () => {
  it('源锚：335 条目带 extra: [963]（伴生面在表）', () => {
    const abigail = MINION_BUFFS.find((e) => e.buff === 335);
    expect(abigail, '335 条目在表').toBeTruthy();
    expect(abigail!.projs, '凭证弹=970（buff 置位/续期判据只认它,单向凭证语义）').toEqual([970]);
    expect(abigail!.extra, '伴生可视本体=963（★BJ670 杀支面）').toEqual([963]);
  });

  it('召唤态前置：buff 244 在 + 970/963 双弹在 → 双活 + buff 续 300（续期判据不被 963 污染）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const t = buffTypeByVanilla(335)!;
    pl.buffs.apply(t, 300);
    const counter = makeMinion(pl, 970);
    const body = makeMinion(pl, 963);
    maintain(pl, [counter, body]);
    expect(pl.buffs.active.get(t)).toBe(300);      // buffTime[j]=18000 桥
    expect(counter.dead).toBe(false);
    expect(body.dead).toBe(false);
  });

  it('★右击 → 次拍双灭 + buff 永撤（本实报主判据;旧杀支 963 残留在此红）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const t = buffTypeByVanilla(335)!;
    pl.buffs.apply(t, 300);
    const counter = makeMinion(pl, 970);
    const body = makeMinion(pl, 963);
    maintain(pl, [counter, body]);
    expect(buffRightClickRemovable(t)).toBe(true);
    pl.buffs.remove(t);                            // 右键 ≡ DelBuff
    maintain(pl, [counter, body]);                 // 次 tick 维护
    expect(pl.buffs.has(t), '右键后 buff 永撤').toBe(false);
    expect(counter.dead, '凭证弹 970 同拍灭（BJ405 槽位门既有面）').toBe(true);
    expect(body.dead, '伴生本体 963 同拍灭（★BJ670 病灶面——原版 timeLeft=2 断续命 ≤2t 亡的直杀桥）').toBe(true);
  });

  it('970 先亡变体（原版 2t 桥次拍）：970 缺 → buff 摘;次拍 963 断续命灭（旧 inService 门在此残留=变异面）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    const t = buffTypeByVanilla(335)!;
    pl.buffs.apply(t, 300);
    const body = makeMinion(pl, 963);              // 仅本体在场（凭证 970 已被任意途径灭）
    maintain(pl, [body]);                          // 拍 1：970 缺 → inService=false → DelBuff
    expect(pl.buffs.has(t), '凭证弹缺 → buff 摘（Player.cs:10946 置位门 + :10953 DelBuff）').toBe(false);
    // ★R6-F3 清偿（2026-10-14）：拍 1 存活契约——本拍只摘 buff 不杀 963（摘除走的是
    //  维护支 else 臂 DelBuff,杀支只在「buff 已不在」的槽位门臂）=两拍时序契约锁;
    //  同拍内联实现（摘 buff 即连杀 killSet）在此红。
    expect(body.dead, '拍 1 只摘 buff 不杀 963（963 灭须等拍 2 槽位门;同拍内联杀在此红）').toBe(false);
    maintain(pl, [body]);                          // 拍 2：槽位门 → 963 杀
    expect(body.dead, '次拍 963 灭（杀支不设 inService 门——旧门下本体永留）').toBe(true);
  });

  it('异族零牵连回归：黄蜂 373 单弹族行为零变化（extra 面只属 335）', () => {
    const pl = new Player(60 * 16, 90 * 16, new Inventory());
    pl.buffs.apply(BuffType.HornetMinion, 300);
    const hornet = makeMinion(pl, 373);
    maintain(pl, [hornet]);
    expect(hornet.dead).toBe(false);
    expect(pl.buffs.active.get(BuffType.HornetMinion)).toBe(300);
  });
});
