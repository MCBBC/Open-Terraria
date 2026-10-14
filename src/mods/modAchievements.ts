// mod 成就 API 运行时(★成就域,2026-10-14;原版成就条件状态机直接复用——
// mod 侧=声明+直接完成两钩,无自管状态机)。
// sw.achievement(key, spec):conditions 五 kind——npcKilled/itemPickup/itemCraft/
// tileDestroyed(引擎通知自动驱动,ids 经分配表解析 mod/vanilla 键)/custom(mod 自管
// 逻辑,sw.completeAchievement(key) 直完)。持久化=原版 completed 表(name=mod 全键)。
// 图标=pack 相对路径 → blob URL(portraits 通道同构,assets 相位产)。
import type { ModIdAllocation } from './types';
import {
  registerModAchievementDefs, addPendingModCompletion,
} from '../core/Achievements';
import type { AchDef, AchCondDef } from '../data/vanillaAchievements';

export interface ModAchievementSpec {
  /** 名称(UI 行/弹窗;直挂文本) */
  title: string;
  /** 描述 */
  desc?: string;
  /** 类别 0=Slayer 1=Collector 2=Explorer 3=Challenger(缺省 -1=未分类) */
  category?: number;
  /** 图标(pack 相对路径;缺省=空 glyph) */
  icon?: string;
  conditions: Array<{
    kind: 'npcKilled' | 'itemPickup' | 'itemCraft' | 'tileDestroyed' | 'custom';
    /** 实体键集(mod/vanilla 键或裸 vid 数字串;custom 恒空) */
    keys?: Array<string | number>;
    /** npcKilled 多实体逐 id 独立条件 */
    many?: boolean;
  }>;
}

const fullKeyOf = (modId: string, key: string) => (key.startsWith('mod_') ? key : `mod_${modId}_${key}`);
/** 全键 → spec(completeAchievement 校验面) */
const specByKey = new Map<string, ModAchievementSpec>();

/** api 期收集(entry 相位;loader 出口 buildModAchievementDefs 一次翻译) */
const pending: Array<{ modId: string; key: string; spec: ModAchievementSpec }> = [];
/** 已注册 def 引用(图标资产相位回填 modIconUrl 用) */
const defsByKey = new Map<string, AchDef>();
/** 图标 URL 表(UI 兜底读) */
const iconUrls = new Map<string, string>();

/** 键/数字 → 域 id(分配表;裸数字=原版 id 直传) */
const resolveId = (
  modId: string, alloc: ModIdAllocation, domain: 'npcs' | 'items' | 'tiles',
  raw: string | number,
): number => {
  if (typeof raw === 'number') return raw;
  if (/^\d+$/.test(raw)) return Number(raw);
  const full = raw.startsWith('mod_') ? raw : `mod_${modId}_${raw}`;
  const v = alloc[domain].get(full);
  if (v === undefined) throw new Error(`[mod-ach] mod ${modId} 成就条件引用未注册 ${domain} 键: ${raw}`);
  return v;
};

/** 图标 job(资产相位两支消费;collect 期收,purge 随 reset) */
const iconJobs: Array<{ fullKey: string; modId: string; texPath: string }> = [];
export function modAchIconJobs(): ReadonlyArray<{ fullKey: string; modId: string; texPath: string }> {
  return iconJobs;
}

/** api 期:收集 spec(entry 相位;重复 fail-fast) */
export function collectModAchievement(modId: string, key: string, spec: ModAchievementSpec): void {
  const full = fullKeyOf(modId, key);
  if (pending.some((p) => fullKeyOf(p.modId, p.key) === full)) throw new Error(`[mod-ach] 成就重复注册: ${full}`);
  pending.push({ modId, key, spec });
  specByKey.set(full, spec);
  if (spec.icon) iconJobs.push({ fullKey: full, modId, texPath: spec.icon });
}

/** loader 出口:pending → AchDef(id 解析须分配表在册=全 mod 收集后一次翻译) */
export function buildModAchievementDefs(alloc: ModIdAllocation): void {
  for (const { modId, key, spec } of pending) {
    const full = fullKeyOf(modId, key);
    const conditions: AchCondDef[] = spec.conditions.map((c) => {
      if (c.kind === 'custom') return { kind: 'flag', name: full };
      const domain = c.kind === 'npcKilled' ? 'npcs' : c.kind === 'tileDestroyed' ? 'tiles' : 'items';
      return {
        kind: c.kind,
        name: null,
        ids: (c.keys ?? []).map((k) => resolveId(modId, alloc, domain as 'npcs' | 'items' | 'tiles', k)),
        many: c.many,
      };
    });
    const def: AchDef = {
      name: full, conditions, category: spec.category ?? -1,
      title: spec.title, desc: spec.desc,
    };
    registerModAchievementDefs([def]);
    defsByKey.set(full, def);
  }
  pending.length = 0;
}

/** sw.completeAchievement:直接完成。实例路由=__swGame.achievements(游戏内);
 *  菜单/无实例沿=待办暂存(ctor 回放/重进补记)。 */
export function completeModAchievement(modId: string, key: string): void {
  const full = fullKeyOf(modId, key);
  // 未注册校验前置(specByKey=api 期登记;两路径同抛=R-B-F6 教训反用)
  if (!specByKey.has(full)) throw new Error(`[mod-ach] mod ${modId} completeAchievement 引用未注册成就: ${key}`);
  const g = (globalThis as { __swGame?: { achievements?: { completeMod(n: string): void } } }).__swGame;
  if (g?.achievements) {
    g.achievements.completeMod(full);
  } else {
    addPendingModCompletion(full);
  }
}

/** 图标 blob URL 登记(assets 相位;def.modIconUrl 活回填+URL 表兜底) */
export function registerModAchIcon(fullKey: string, url: string): void {
  iconUrls.set(fullKey, url);
  defsByKey.get(fullKey)!.modIconUrl = url;
}

/** UI 读:成就图标 URL(null=原版 sprite 域) */
export function modAchIconUrl(fullKey: string): string | null {
  return iconUrls.get(fullKey) ?? null;
}

/** 测试清账 */
export function _resetModAchievementsForTests(): void {
  pending.length = 0;
  iconJobs.length = 0;
  specByKey.clear();
  defsByKey.clear();
  iconUrls.clear();
}
