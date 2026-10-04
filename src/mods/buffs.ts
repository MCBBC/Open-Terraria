// mod buff 注册(2026-10-04 P2):BuffType 域运行时追加 + BUFF_DEFS 条目 + 图标
// objectURL 覆盖。设计锚:design.md §2.3「buff 效果消费」P2 刀序。
// 域纪律:
//   ① BuffType 数值域=运行时在枚举最大值之上追加(原版 287 条枚举,mod 从 300+;
//     不写回枚举对象——消费面一律经 BUFF_DEFS[number] 反查,枚举名仅为工具面);
//   ② 伪 vanillaBuff=9000+n(MOD_BUFF_VANILLA_BASE)——buff 栏图标链
//     remasterBuffIcon(9000+n) → 本表 objectURL 命中(mods 优先),原版域永不入本表;
//   ③ 效果面=onTick 钩(hooks.registerModBuffTick,并入 preUpdate 派发);
//     原版 buff 数值效果(防御/攻速等)不开放=登记 P3。
import { BUFF_DEFS } from '../stats/Buffs';
import { MOD_BUFF_VANILLA_BASE } from './types';
import { registerModBuffTick, registerModBuffNpcTick } from './hooks';
import type { Player } from '../entities/Player';
import type { Game } from '../core/Game';

/** mod buff 行为 spec(entry.js sw.buff 的 spec) */
export interface ModBuffSpec {
  name: string;
  /** 图标 textures/ 相对路径(32×32 语义,原版 Buff_N 同构) */
  texture: string;
  /** 每 tick 效果钩(本地玩家激活期间逐 tick 调;自管属性/粒子/计时) */
  onTick?: (player: Player, game: Game) => void;
  /** P4:NPC 侧每 tick 钩(弹幕 npcDebuff 施加到敌怪后逐 tick 调) */
  onNpcTick?: (enemy: unknown, game: unknown) => void;
  /** 提示文案键(缺省=Mods.<modId>.Buff.<key>.Desc,未译回退 name) */
  desc?: string;
}

/** BuffType 枚举运行时追加域基址(BUFF_DEFS 键最大数值+1;惰性求值一次) */
let nextBuffType = -1;
function buffTypeBase(): number {
  if (nextBuffType < 0) {
    let max = 0;
    for (const k of Object.keys(BUFF_DEFS)) {
      const n = Number(k);
      if (Number.isFinite(n) && n > max) max = n;
    }
    nextBuffType = max + 1;
  }
  return nextBuffType;
}

/** mod buff 名 → BuffType 数值(分配表;entry 相位注册后只读) */
const modBuffTypes = new Map<string, number>();
/** 伪 vanillaBuff → 图标 objectURL(装载时建;mods 图标覆盖链消费) */
const modBuffIconUrls = new Map<number, string>();
let nextPseudoVanilla = MOD_BUFF_VANILLA_BASE;

/** sw.buff 注册:分配 BuffType+BUFF_DEFS 条目+onTick 钩(图标 URL 在资产相位经
 *  registerModBuffIcon 补)。重复 fail-fast。 */
export function registerModBuff(modId: string, key: string, spec: ModBuffSpec): number {
  const fullKey = `mod_${modId}_${key}`;
  if (modBuffTypes.has(fullKey)) throw new Error(`[mod-buff] 重复注册: ${fullKey}`);
  if (!spec.texture) throw new Error(`[mod-buff] 缺 texture: ${fullKey}`);
  const bt = buffTypeBase() + modBuffTypes.size;
  modBuffTypes.set(fullKey, bt);
  modBuffRequests.push({ modId, key, texture: spec.texture });
  const pseudoVanilla = nextPseudoVanilla + modBuffTypes.size - 1;
  // descKey:mod l10n 命名空间(Mods.<id>.*;P2 文案=字面回退,运行时合并=P3)
  const descKey = spec.desc ?? `Mods.${modId}.Buff.${key}.Desc`;
  // BUFF_DEFS 直写(可变 Record;原版条目零扰动)——buff 栏/右键取消/时长门全按
  // 既有消费面自动生效(mod buff 非 debuff=可右键取消,原版 TryRemovingBuff 同相)
  (BUFF_DEFS as Record<number, { vanillaBuff: number; descKey: string; fallbackName: string }>)[bt] = {
    vanillaBuff: pseudoVanilla,
    descKey,
    fallbackName: spec.name,
  };
  // onTick 钩(玩家侧)+onNpcTick(P4:NPC 侧 debuff tick)
  if (spec.onTick) registerModBuffTick(bt, spec.onTick);
  if (spec.onNpcTick) registerModBuffNpcTick(bt, spec.onNpcTick);
  return bt;
}

/** 资产相位遍历簿(entry 注册序;applyModAssets 解码图标用) */
const modBuffRequests: Array<{ modId: string; key: string; texture: string }> = [];
export function modBuffRegs(): readonly Readonly<{ modId: string; key: string; texture: string }>[] {
  return modBuffRequests;
}

/** 图标 URL 登记(资产相位:mod PNG 解码后 objectURL;buffer 拷贝防 detach) */
export function registerModBuffIcon(modId: string, key: string, png: Uint8Array, buildIconUrl: (png: Uint8Array<ArrayBuffer>) => string): void {
  const bt = modBuffTypes.get(`mod_${modId}_${key}`);
  if (bt === undefined) return;
  const pseudoVanilla = (BUFF_DEFS as Record<number, { vanillaBuff: number }>)[bt]?.vanillaBuff;
  if (pseudoVanilla === undefined) return;
  const copy = new Uint8Array(png.length);
  copy.set(png);
  modBuffIconUrls.set(pseudoVanilla, buildIconUrl(copy));
}

/** buff 图标覆盖链入口(main.ts 组合:mod 优先,miss 落 remaster/vanilla) */
export function modBuffIconUrl(vanillaBuffId: number): string | null {
  return modBuffIconUrls.get(vanillaBuffId) ?? null;
}

/** ModContext.applyBuff 用:键 → BuffType(未注册 fail-fast) */
export function modBuffTypeOf(modId: string, key: string): number {
  const bt = modBuffTypes.get(key.startsWith('mod_') ? key : `mod_${modId}_${key}`);
  if (bt === undefined) throw new Error(`[mod-buff] mod ${modId} 引用未注册 buff: ${key}`);
  return bt;
}

/** 测试重置 */
export function _resetModBuffsForTests(): void {
  modBuffTypes.clear(); modBuffIconUrls.clear(); modBuffRequests.length = 0;
  nextPseudoVanilla = MOD_BUFF_VANILLA_BASE;
}
