// Item 数值三方对账金标闸门:vanilla-item*.json × Item.cs(1456) × Item.cs(1457) 常驻化。
// 解析逻辑 = tools/recon-item-1456-1457.mjs(库模式导入,与 CLI --fix 同源——防"闸门与
// 修复器两套逻辑漂移")。1.4.5.7 是数值补丁(Item SetDefaults 54 条,报告"Item.cs 行为
// 差异清单"),本闸门锁三件事:
//   ① DRIFT=0:json 与 1457 终值零漂移(①内 1456 回滚白名单除外——本仓标杆 1456,
//     已决回滚字段见 ROLLBACK_1456 注释;其余手改 json 或重跑 1456 提取器会爆红)
//   ② LEGACY=0:两版同值字段上 json 不得偏离 1456(基线保护,存量 1405 旧值回潮检测)
//   ③ 解析器结构护栏:提取基数不低于基线(防反编译树/解析器结构漂移后静默半坏)
// 已知暂缓项(deferredDrift):1226/1227 叶绿双剑 shoot 指向 1457 新弹 1126/1127,
//   新弹 AI/贴图未实装前数据侧保留 1456 弹 id(见 recon FIX_SHOOT_KEEP)。
// 注意:依赖仓库内 Terarria1456/、Terarria1457/ 反编译树(与 npc-stats-golden 同惯例)。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error 纯 JS 提取库(无类型声明)
import { recon, FIX_SHOOT_KEEP } from '../tools/recon-item-1456-1457.mjs';

const r = await recon();

describe('Item 数值三方对账金标(json × 1456 × 1457)', () => {
  // ★2026-08-23 基准切换 1457：ROLLBACK_1456 白名单已删除——json 全量取 1457 终值
  // （recon DRIFT=0 实证;曾按旧 1456 标杆钉 2209/5477/5688/4607/478 五条,现 1457 值
  // 400/50/15/2.5/3 即权威,白名单机制保留空集防未来"新内容未实装先切数据"场景）
  const ROLLBACK_1456 = new Set<string>([]);
  it('① json 与 1457 SetDefaults 终值零漂移(DRIFT;白名单已空=基准 1457)', () => {
    expect(r.drift.filter((l: string) => !ROLLBACK_1456.has(l.slice(0, l.indexOf(':'))))).toEqual([]);
  });

  it('①b 已知暂缓项仅叶绿双剑 shoot 两条(新弹 1126/1127 未实装)', () => {
    expect(r.deferredDrift.length).toBe(FIX_SHOOT_KEEP.size);
    for (const line of r.deferredDrift) expect(line).toMatch(/combat\[122[67]\]\.shoot/);
  });

  it('② 两版同值字段上 json 与 1456 零漂移(LEGACY 基线保护)', () => {
    expect(r.legacy).toEqual([]);
  });

  it('③a 解析器结构护栏:提取基数不低于基线', () => {
    // 基线(2026-08-21):combat 4333(1456)/4348(1457, +49 新物品 6147-6195)/
    // rare 3225→3275 / value 4889 / stats def 270 life 5 / whips 18
    expect(r.coverage.combat1456).toBeGreaterThanOrEqual(4333);
    expect(r.coverage.combat1457).toBeGreaterThanOrEqual(4348);
    expect(r.coverage.rare1457).toBeGreaterThanOrEqual(3275);
    expect(r.coverage.value1457).toBeGreaterThanOrEqual(4889);
    expect(r.coverage.statsDef57).toBeGreaterThanOrEqual(270);
    expect(r.coverage.statsLife57).toBeGreaterThanOrEqual(5);
    expect(r.coverage.whips57).toBe(18);
  });

  it('③b CLASS B 迁移面锚点:既有物品(id<6147)的变化恰为已知 54 条清单,无意外新增', () => {
    // 已知清单 = 报告"Item.cs 行为差异清单/SetDefaults 数值变化"节 + 4765(与 4766
    // 同 case 贯穿组,报告漏列)。新物品 6147-6195 的整条新增不计入。
    const known = new Set([
      'combat[112].mana', 'combat[437].shootSpeed', 'combat[494].knockBack', 'combat[546].damage',
      'combat[578].damage', 'combat[578].useTime', 'combat[578].useAnimation', 'combat[682].damage',
      'combat[683].damage', 'combat[683].knockBack', 'combat[683].useTime', 'combat[683].useAnimation',
      'combat[739].mana', 'combat[740].mana', 'combat[741].mana', 'combat[742].mana',
      'combat[743].damage', 'combat[743].mana', 'combat[744].mana', 'combat[988].damage',
      'combat[1178].useTime', 'combat[1178].useAnimation', 'combat[1178].shootSpeed',
      'combat[1226].useAnimation', 'combat[1226].useTime', 'combat[1226].shoot', 'combat[1226].noMelee',
      'combat[1227].damage', 'combat[1227].knockBack', 'combat[1227].useTime', 'combat[1227].useAnimation',
      'combat[1227].shoot', 'combat[1227].shootSpeed', 'combat[1227].noMelee', 'combat[1227].noUseGraphic',
      'combat[1227].useTurn',
      'combat[1313].useTime', 'combat[1313].useAnimation', 'combat[1313].shootSpeed',
      'combat[1350].damage', 'combat[1444].knockBack', 'combat[3011].damage',
      'combat[3283].damage', 'combat[3289].damage', 'combat[3290].damage', 'combat[3291].damage',
      'combat[3315].damage', 'combat[3315].crit', 'combat[3316].damage', 'combat[3377].mana',
      'combat[3352].shootSpeed', 'combat[3772].shootSpeed', 'combat[3821].ranged', 'combat[3821].melee',
      'combat[4270].damage', 'combat[4607].knockBack', 'combat[4765].noMelee', 'combat[4765].noUseGraphic',
      'combat[4766].noMelee', 'combat[4766].noUseGraphic', 'combat[5285].noMelee', 'combat[5285].noUseGraphic',
      'combat[5663].damage', 'combat[5687].damage',
      'rare[1293].rare', 'rare[3315].rare', 'rare[3316].rare',
      'value[255].value', 'value[4672].value', 'value[5920].value', 'value[5926].value',
      'stats[982].life', 'stats[1595].def', 'stats[1613].def', 'stats[2221].def',
      'func[2209].healMana', 'whips[5477].dmg', 'whips[5688].dmg',
    ]);
    // 新内容阈值:物品面 1457 新增 49 件(6147-6195)/弹幕面 25 弹(1111-1135)整条不计
    const NEW_ID_FLOOR: Record<string, number> = { proj: 1111 };
    const knownProj = new Set([
      'proj[76].penetrate', 'proj[76].ignoreWater', 'proj[77].penetrate', 'proj[77].ignoreWater',
      'proj[78].penetrate', 'proj[78].ignoreWater', 'proj[102].ranged',
      'proj[114].penetrate', 'proj[114].timeLeft', 'proj[114].extraUpdates', 'proj[114].armorPenetration',
      'proj[121].penetrate', 'proj[121].friendly', 'proj[121].timeLeft', 'proj[121].localNPCHitCooldown',
      'proj[122].penetrate', 'proj[122].friendly', 'proj[122].timeLeft', 'proj[122].localNPCHitCooldown',
      'proj[123].penetrate', 'proj[123].friendly', 'proj[123].timeLeft', 'proj[123].localNPCHitCooldown',
      'proj[124].penetrate', 'proj[124].friendly', 'proj[124].timeLeft', 'proj[124].localNPCHitCooldown',
      'proj[125].penetrate', 'proj[125].friendly', 'proj[125].timeLeft', 'proj[125].localNPCHitCooldown',
      'proj[126].penetrate', 'proj[126].friendly', 'proj[126].timeLeft', 'proj[126].localNPCHitCooldown',
      'proj[597].penetrate', 'proj[597].friendly', 'proj[597].timeLeft', 'proj[597].localNPCHitCooldown',
      'proj[180].timeLeft', 'proj[206].timeLeft', 'proj[301].penetrate', 'proj[350].timeLeft',
      'proj[352].timeLeft', 'proj[471].ranged', 'proj[478].penetrate', 'proj[480].timeLeft',
      'proj[698].width', 'proj[698].timeLeft', 'proj[837].timeLeft', 'proj[837].tileCollide',
      'proj[949].hostile', 'proj[1049].timeLeft', 'proj[1088].ranged', 'proj[1106].armorPenetration',
      // 局部免疫帧列（usesLocalNPCImmunity+localNPCHitCooldown,提取器不展开的直写/恒走臂）
      'proj[76].localNPCHitCooldown', 'proj[77].localNPCHitCooldown', 'proj[78].localNPCHitCooldown',
      'proj[301].localNPCHitCooldown', 'proj[309].localNPCHitCooldown',
      // ★R25-⑤ 免疫帧闸门扩面（债 9）：<1111 的两发旧弹入 NON_LITERAL_57 断言面
      // （提取器 NUM_FIELDS 无该列→classB 以"1456=null→1457=N"形态出现,须在此锚定;
      //   ≥1111 新弹族由 NEW_ID_FLOOR.proj 豁免,无需逐条列出）
      'proj[639].localNPCHitCooldown', 'proj[932].localNPCHitCooldown',
    ]);
    const unexpected: string[] = [];
    for (const line of r.classB) {
      const m = line.match(/^(\w+)\[(\d+)\]\.(\w+):/);
      if (!m) { unexpected.push(line); continue; }
      const [, file, idStr, field] = m;
      const id = +idStr;
      if (id >= (NEW_ID_FLOOR[file] ?? 6147)) continue; // 新内容整条不计
      const key = `${file}[${id}].${field}`;
      if (!known.has(key) && !knownProj.has(key)) unexpected.push(line);
    }
    expect(unexpected).toEqual([]);
  });

  it('④ 1457 段(≥6100)在表 50 条锚点(防 1456 档整表重跑抹段;提取器已带合并保留)', () => {
    // 2026-08-22 隐患备案清偿:vanilla-itemcombat.json 的 1457 专属段(Palworld 召唤杖
    // 6148/6149/6161/6164 等)曾仅存于 JSON——裸跑提取器 1456 默认档会整段抹掉。
    // 现双保险=①提取器 1456 档写盘合并保留(extract-itemcombat.mjs 写盘前钩)
    // ②本锚点:四杖 combat 数据 + 1457 段基数。
    const combat = JSON.parse(readFileSync(new URL('../src/data/vanilla-itemcombat.json', import.meta.url), 'utf8'));
    expect(combat['6148']).toMatchObject({ shoot: 1112, damage: 22, summon: true });
    expect(combat['6149']).toMatchObject({ shoot: 1113, damage: 40, summon: true });
    expect(combat['6161']).toMatchObject({ shoot: 1118, damage: 5, summon: true });
    expect(combat['6164']).toMatchObject({ shoot: 1119, damage: 40, summon: true });
    expect(Object.keys(combat).filter((k) => +k >= 6100).length).toBeGreaterThanOrEqual(50);
  });
});
