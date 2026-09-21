// 雷达（第三只眼）敌怪计数守卫（SW-BJ73 2026-09-14 孢子蝙蝠定谳批）：
//   实报 = 孢子蝙蝠 634（NPCID.cs:12339）不出现在「附近有 X 个敌人」行（雷达 3084）。
//   定谳（双根因，均已修）：
//   ① Game.tickInfoAccs 旧谓词读 `def.lifeMax`——EnemyDef 无此字段（fromVanilla 写
//      hp，Enemy.ts:1347）→ 恒 undefined → `?? 0 > 5` 恒假 → 雷达对【一切】敌怪恒
//      0（总漏检面，孢子蝙蝠只是实报面）。
//   ② NPC_DONT_COUNT_ME 按 1456 钉 10 id——1457 SetDefaults 共 30 处赋 true=32 id
//      （新增 90-92/96/97/99/100/135/136/328/413/414/455-459/511/512/514/515/622/623
//      蠕虫段/Boss 部件族，各自 damage>0 且 lifeMax>5；漏排会在①修后反向过计）。
//   锁面：反编译直读双版本（1457+1458）锁表 + vanilla-npcs.json 全量成员 diff +
//   实例级 1:1 + Game.ts 接线结构锁。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NPC_DONT_COUNT_ME_1457, radarCountsEnemy } from '../src/stats/InfoAccs';
import { Enemy } from '../src/entities/Enemy';
import vanillaNpcsJson from '../public/sprites/vanilla-npcs.json';

/** 反编译直读：扫 NPC.cs 全部 `dontCountMe = true`，回溯最近 `type ==` 行取 id
 *  （`type == 455 || type == 456 …` 多 id 块整块收取）。与 recon 提取同构。 */
function extractDontCountMe(csPath: string): Set<number> {
  const lines = readFileSync(csPath, 'utf-8').split(/\r?\n/);
  const ids = new Set<number>();
  let last: number[] = [];
  for (const line of lines) {
    const m = line.match(/type == (\d+)/g);
    if (m) last = m.map((s) => parseInt(s.slice(8), 10));
    if (line.includes('dontCountMe = true')) for (const id of last) ids.add(id);
  }
  return ids;
}

// ★RB17b-followup:cwd 锚定改为 import.meta 锚定——process.cwd() 依赖 vitest 启动目录,
//   从仓库根跑批（含其它项目工作区扫描）时 GAME_ROOT 会漂到 SandboxWorld/ 一级之上(ENOENT)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const GAME_ROOT = dirname(fileURLToPath(import.meta.url));

describe('NPC_DONT_COUNT_ME_1457 表 = 反编译直读（1457 与 1458 双版本）', () => {
  it('1457 NPC.cs SetDefaults 30 处赋 true → 32 id 全等', () => {
    const cs = resolve(GAME_ROOT, '../../Terarria1457/Terraria/NPC.cs');
    expect(extractDontCountMe(cs)).toEqual(new Set(NPC_DONT_COUNT_ME_1457));
  });
  it('1458 NPC.cs 同表（增量面零变更）', () => {
    const cs = resolve(GAME_ROOT, '../../Terarria1458/Terraria/NPC.cs');
    expect(extractDontCountMe(cs)).toEqual(new Set(NPC_DONT_COUNT_ME_1457));
  });
  it('表内 id 均在 vanilla-npcs.json 有条目（防手滑写错 id）', () => {
    for (const id of NPC_DONT_COUNT_ME_1457) {
      expect((vanillaNpcsJson as Record<string, unknown>)[String(id)], `dontCountMe id ${id} 缺 json 条目`).toBeTruthy();
    }
  });
});

describe('radarCountsEnemy ≡ 原版雷达条件（Main.cs:47813）over vanilla-npcs.json 全量', () => {
  // def 形 = fromVanilla 映射的成员语义：friendly 直传、damage 对 critter/friendly 归零
  // （Enemy.ts:1287 rawDamage）、hp=lifeMax（ScaleStats 后；:18192 弹体 NPC 外下限 6，
  // >5 门对真怪恒真）。
  const asDef = (v: { friendly?: boolean; critter?: boolean; damage?: number; lifeMax?: number }) => ({
    friendly: v.friendly === true,
    damage: (v.critter === true || v.friendly === true) ? 0 : (v.damage ?? 0),
    hp: v.lifeMax ?? 0,
  });

  it('原版应计集合（!friendly && damage>0 && lifeMax>5 && !dontCountMe）谓词全量一致', () => {
    let shouldCount = 0;
    for (const [k, raw] of Object.entries(vanillaNpcsJson)) {
      const v = raw as { id: number; name?: string; friendly?: boolean; critter?: boolean; damage?: number; lifeMax?: number };
      const vanilla =
        v.friendly !== true && (v.damage ?? 0) > 0 && (v.lifeMax ?? 0) > 5
        && !NPC_DONT_COUNT_ME_1457.has(v.id);
      const repo = radarCountsEnemy({ vanillaId: Number(k), def: asDef(v) });
      expect(repo, `id ${v.id}(${v.name}) 谓词 ${repo} ≠ 原版 ${vanilla}`).toBe(vanilla);
      if (vanilla) shouldCount++;
    }
    // 面宽锚：四百上下为正常量级（当前数据 478）——防谓词整体塌 0/爆表回归
    expect(shouldCount).toBeGreaterThan(300);
  });

  it('孢子蝙蝠 634 ∈ 应计集合（用户实报主诉面）', () => {
    const v = vanillaNpcsJson['634'] as { name: string; damage: number; lifeMax: number; friendly?: boolean };
    expect(v.name).toBe('Spore Bat');
    expect(v.damage).toBeGreaterThan(0);
    expect(v.lifeMax).toBeGreaterThan(5);
    expect(NPC_DONT_COUNT_ME_1457.has(634)).toBe(false);
    expect(radarCountsEnemy({ vanillaId: 634, def: asDef(v) })).toBe(true);
  });
});

describe('实例级 1:1（Enemy.fromVanilla 真 def 形）', () => {
  it('孢子蝙蝠 634 计入（修复前 def.lifeMax 恒 undefined → 恒 false）', () => {
    const e = Enemy.fromVanilla(634, 0, 0)!;
    expect(e).toBeTruthy();
    expect(e.def.damage).toBe(13);          // ScaleStats 经典档 = SetDefaults 基线
    expect(e.def.hp).toBe(16);
    expect(radarCountsEnemy(e)).toBe(true);
  });
  it('黄蜂 176（MossHornet，实报提示 id）计入；僵尸 3 计入', () => {
    expect(radarCountsEnemy(Enemy.fromVanilla(176, 0, 0)!)).toBe(true);
    expect(radarCountsEnemy(Enemy.fromVanilla(3, 0, 0)!)).toBe(true);
  });
  it('毁灭者体段 135 / 血鳗尾段 623 不计（1457 新增 dontCountMe 家族，1456 旧表漏排会过计）', () => {
    for (const id of [135, 623]) {
      const e = Enemy.fromVanilla(id, 0, 0)!;
      expect(e.def.damage).toBeGreaterThan(0);
      expect(radarCountsEnemy(e)).toBe(false);
    }
  });
  it('兔 46（critter damage=0）与 friendly 不计', () => {
    expect(radarCountsEnemy(Enemy.fromVanilla(46, 0, 0)!)).toBe(false);
    // 被缚友军族：def.friendly=true 直拒（不依赖 damage 归零间接面）
    expect(radarCountsEnemy({ vanillaId: null, def: { friendly: true, damage: 30, hp: 250 } })).toBe(false);
  });
  it('无 def（异域实体兜底）不计', () => {
    expect(radarCountsEnemy({ vanillaId: null })).toBe(false);
  });
});

describe('Game.ts 接线结构锁（tickInfoAccs 谓词必须走统一出口）', () => {
  const gameSrc = readFileSync(resolve(GAME_ROOT, '../src/core/Game.ts'), 'utf-8');
  it('tickInfoAccs 接 radarCountsEnemy', () => {
    expect(gameSrc).toMatch(/infoAccs\.tick\([^]*?radarCountsEnemy/s);
  });
  it('旧 1456 十 id 私有表与 def.lifeMax 死字段不得回流', () => {
    expect(gameSrc).not.toMatch(/NPC_DONT_COUNT_ME\s*=\s*new Set/);
    expect(gameSrc).not.toMatch(/def\?\.\s*lifeMax/);
  });
});
