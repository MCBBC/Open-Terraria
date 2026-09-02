// NPC 旗真值表金标闸门（2026-09-02 复发预防批）——背景："叶绿弹不锁游荡眼球"根因
// = canBeChasedBy 排除集凭批注名硬编码 vid,批注与 1457 反编译不符（133=游荡眼球怪
// 被当"巡游之眼"误列 immortal）。本测试把"批注可信"升级为"机械对账"：
// 直接解析 Terarria1457 反编译源,逐行提取 SetDefaults 三旗 + ID 文件 CreateBoolSet
// 集合,与游戏侧导出常量严格相等——再出现凭记忆/旧表写 id 集,当场爆红。
// ★id 空间锚定：1456/1457（1.4.5 已移位：WanderingEye=133、JungleBat=51、
//   DemonEye=2、ChlorophyteBullet 弹 207）——勿按 1.4.4 及更早的表对号。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CHASE_EXCLUDED_VIDS, SKIP_DAMAGE_EVP, IS_A_WHIP_PROJS, DONT_APPLY_PARRY_DAMAGE_BUFF_PROJS,
  MINION_SHOT_PROJS, SENTRY_SHOT_PROJS, COLD_DAMAGE_NPCS, COLD_DAMAGE_PROJS,
  CRITTER_TURN_ON_PLAYERS_TYPES, ON_HIT_EXCLUDED_PROJS,
} from '../src/entities/projTargets';

const HERE = dirname(fileURLToPath(import.meta.url));
const DECOMP = join(HERE, '..', '..', 'Terarria1457');
const read = (p: string) => readFileSync(join(DECOMP, p), 'utf8');

/** SetDefaults 方法体行（NPC/Projectile 的 SetDefaults 均带参或带 override,
 *  统一锚 "void SetDefaults("；成员边界 = 缩进 1 的可见性修饰行） */
function setDefaultsBody(csFile: string): string[] {
  const lines = read(csFile).split('\n');
  const start = lines.findIndex((l) => /void SetDefaults\(/.test(l));
  expect(start, `SetDefaults not found in ${csFile}`).toBeGreaterThan(0);
  let end = -1;
  for (let i = start + 2; i < lines.length; i++) {
    if (/^\t(?:public|private|protected|internal|static)/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end > 0 ? end : lines.length);
}

/** 条件句里的 type 判定集：`type == N`（可多个）/ `>=A && <=B` 闭区间 / `>A && <B` 开区间 */
function typesOf(cond: string): number[] {
  const ids = new Set<number>();
  const closed = cond.match(/type\s*>=\s*(\d+)[\s\S]*?type\s*<=\s*(\d+)/);
  if (closed) for (let n = +closed[1]; n <= +closed[2]; n++) ids.add(n);
  const open = cond.match(/type\s*>\s*(\d+)[\s\S]*?type\s*<\s*(\d+)/);
  if (open) for (let n = +open[1] + 1; n <= +open[2] - 1; n++) ids.add(n);
  for (const m of cond.matchAll(/type\s*==\s*(\d+)/g)) ids.add(+m[1]);
  return [...ids];
}

/** 逐行归属扫描：SetDefaults 平铺 else-if 链,最近一条 type 条件 = 当前型。
 *  flags：{ 字段名: 赋值右值 }（如 { immortal: 'true', chaseable: 'false' }） */
function extractSetDefaultsFlags(csFile: string, flags: Record<string, string>): Record<string, Set<number>> {
  const out: Record<string, Set<number>> = {};
  for (const k of Object.keys(flags)) out[k] = new Set();
  let cur: number[] = [];
  for (const line of setDefaultsBody(csFile)) {
    const cond = line.match(/^\s*(?:else\s+)?if\s*\((type\s[^)]+)\)/);
    if (cond) cur = typesOf(cond[1]);
    for (const [field, rhs] of Object.entries(flags)) {
      if (new RegExp(`^\\s*(?:this\\.)?${field}\\s*=\\s*${rhs};`).test(line)) {
        for (const n of cur) out[field].add(n);
      }
    }
  }
  return out;
}

/** ID 文件 `public static bool[] Name = Factory.CreateBoolSet(false?, ids...)` 提取 */
function idFileSet(idFile: string, name: string): Set<number> {
  const m = read(idFile).match(new RegExp(`bool\\[\\]\\s*${name}\\s*=\\s*Factory\\.CreateBoolSet\\(([^)]*)\\)`));
  expect(m, `${name} not found in ${idFile}`).toBeTruthy();
  return new Set([...m![1].matchAll(/\d+/g)].map((x) => +x[0]));
}

const eq = (a: ReadonlySet<number>, b: ReadonlySet<number>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

describe('NPC 三旗金标（SetDefaults 逐行对账）', () => {
  const npc = () => extractSetDefaultsFlags('Terraria/NPC.cs', {
    immortal: 'true', chaseable: 'false', coldDamage: 'true',
  });

  it('CanBeChasedBy 排除集 = immortal ∪ chaseable=false（曾误列 133/416 的防复发钉）', () => {
    const f = npc();
    const truth = new Set([...f.immortal, ...f.chaseable]);
    expect(eq(CHASE_EXCLUDED_VIDS, truth), `game=${[...CHASE_EXCLUDED_VIDS]} truth=${[...truth]}`).toBe(true);
    // 名场面锚：immortal 全表恰为训练假人+伪装雕像；游荡眼球 133 不得入列
    expect(f.immortal).toEqual(new Set([488, 690]));
    expect(CHASE_EXCLUDED_VIDS.has(133)).toBe(false);
    expect(CHASE_EXCLUDED_VIDS.has(416)).toBe(false);
  });

  it('NPC.coldDamage 寒冷系 16 型（温暖 124 减伤面）', () => {
    expect(eq(COLD_DAMAGE_NPCS, npc().coldDamage),
      `game=${[...COLD_DAMAGE_NPCS]} truth=${[...npc().coldDamage]}`).toBe(true);
  });

  it('Projectile.coldDamage 寒冷系弹（同上受击面）', () => {
    const p = extractSetDefaultsFlags('Terraria/Projectile.cs', { coldDamage: 'true' });
    expect(eq(COLD_DAMAGE_PROJS, p.coldDamage),
      `game=${[...COLD_DAMAGE_PROJS]} truth=${[...p.coldDamage]}`).toBe(true);
  });
});

describe('ProjectileID/NPCID Sets 金标（CreateBoolSet 提取）', () => {
  it('SkipDamage_EVP（敌弹 EVP 免工件族）', () => {
    expect(eq(SKIP_DAMAGE_EVP, idFileSet('Terraria.ID/ProjectileID.cs', 'SkipDamage_EVP'))).toBe(true);
  });
  it('IsAWhip 全 18 型', () => {
    expect(eq(IS_A_WHIP_PROJS, idFileSet('Terraria.ID/ProjectileID.cs', 'IsAWhip'))).toBe(true);
  });
  it('DontApplyParryDamageBuff 盾反排除族', () => {
    expect(eq(DONT_APPLY_PARRY_DAMAGE_BUFF_PROJS, idFileSet('Terraria.ID/ProjectileID.cs', 'DontApplyParryDamageBuff'))).toBe(true);
  });
  it('MinionShot / SentryShot 随从哨兵弹族', () => {
    expect(eq(MINION_SHOT_PROJS, idFileSet('Terraria.ID/ProjectileID.cs', 'MinionShot'))).toBe(true);
    expect(eq(SENTRY_SHOT_PROJS, idFileSet('Terraria.ID/ProjectileID.cs', 'SentryShot'))).toBe(true);
  });
  it('CritterThatCanTurnOnPlayers 黑化小动物族', () => {
    expect(eq(CRITTER_TURN_ON_PLAYERS_TYPES, idFileSet('Terraria.ID/NPCID.cs', 'CritterThatCanTurnOnPlayers'))).toBe(true);
  });
  it('TryDoingOnHitEffects 六型排除（switch 字面量提取）', () => {
    const cs = read('Terraria/Projectile.cs');
    const m = cs.match(/private void TryDoingOnHitEffects[\s\S]{0,200}?switch \(type\)\s*\{([^}]*)\}/);
    expect(m, 'TryDoingOnHitEffects switch not found').toBeTruthy();
    const ids = new Set([...m![1].matchAll(/case (\d+):/g)].map((x) => +x[1]));
    expect(eq(ON_HIT_EXCLUDED_PROJS, ids)).toBe(true);
  });
});
