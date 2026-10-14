// mod 信息栏行 API(★InfoDisplay 域,2026-10-14;tML InfoDisplay 同位——原版信息
// 配件栏(DrawInfoAccs)的 mod 追加行)。行语义:label=悬停标签/update 逐帧产文本
// (null=本帧省行);icon=-1(无图标)/hideIndex=-1(不可隐藏常显)——两哨兵在既有
// 护栏下天然安全(UITextures.get miss→跳绘;hidden[-1]=undefined→falsy)。
import type { GameHooks } from '../entities/types';

export interface ModInfoDisplaySpec {
  /** 悬停标签(信息栏 tooltip) */
  label: string;
  /** 逐帧文本(null=本帧省行) */
  update?(game: unknown): string | null;
  /** 金色行(罕见生物行同款) */
  gold?: boolean;
}

interface ModInfoLine { label: string; text: string; grayed?: boolean; gold?: boolean }

const registry = new Map<string, ModInfoDisplaySpec>();
/** 本帧解析行(resolveModInfoLines 产;buildInfoAccRows 消费) */
let currentLines: ModInfoLine[] = [];
/** 本帧解析 game 引用(update 消费) */
let currentGame: unknown = null;

/** 注册(重复 fail-fast) */
export function registerModInfoDisplay(key: string, spec: ModInfoDisplaySpec): void {
  if (registry.has(key)) throw new Error(`[mod-info] infoDisplay 重复注册: ${key}`);
  registry.set(key, spec);
}

/** Game 每帧解析(tickInfoAccs 尾;registry 空直通) */
export function resolveModInfoLines(game: unknown): void {
  currentGame = game;
  if (registry.size === 0) { currentLines = []; return; }
  const out: ModInfoLine[] = [];
  for (const spec of registry.values()) {
    try {
      const text = spec.update?.(game) ?? null;
      if (text !== null) out.push({ label: spec.label, text, gold: spec.gold });
    } catch (err) { console.warn('[mod-info] update', err); }
  }
  currentLines = out;
}

/** buildInfoAccRows 尾追加(icon=-1/hideIndex=-1 哨兵) */
export function appendModInfoRows<T extends { row: number }>(
  rows: T[],
  push: (row: { icon: number; hideIndex: number; text: string; label: string; grayed?: boolean; gold?: boolean }) => void,
): void {
  if (currentLines.length === 0) return;
  for (const ln of currentLines) {
    push({ icon: -1, hideIndex: -1, text: ln.text, label: ln.label, gold: ln.gold });
  }
}

/** mod update 钩取当前 game(同模块闭包;sw.infoDisplay 场景外不暴露) */
export function currentInfoDisplayGame(): unknown { return currentGame; }

export function hasModInfoDisplays(): boolean { return registry.size > 0; }

export function _resetModInfoDisplaysForTests(): void {
  registry.clear();
  currentLines = [];
  currentGame = null;
}
