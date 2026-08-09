// 原版文案查询层。数据 = public/l10n/zh-Hans.json（build-l10n.mjs 构建）。
// 分层：UI（zh-Hans.json 根）/ Game / Items / Legacy / NPCs。
// Lang.text('UI.Play')、Lang.text('Items.ItemName.HealingPotion')、Lang.text('Legacy.LegacyWorldGen.1')
import { worldgenProgressKey } from './worldgenKeys';

type Dict = Record<string, unknown>;

let data: Record<string, Dict> = {};
const warned = new Set<string>();

export const Lang = {
  loaded: false,

  async load(): Promise<boolean> {
    try {
      const r = await fetch('l10n/zh-Hans.json');
      if (!r.ok) return false;
      data = await r.json();
      Lang.loaded = true;
      return true;
    } catch {
      return false;
    }
  },

  /** 点路径取文案。支持 {0}/{1} 占位符。缺失回退 key 本身并 warn 一次 */
  text(path: string, ...args: (string | number)[]): string {
    let node: unknown = data;
    for (const seg of path.split('.')) {
      node = (node as Dict)?.[seg];
      if (node === undefined) {
        if (!warned.has(path)) { warned.add(path); console.warn(`[Lang] 缺失 key: ${path}`); }
        return args.length ? path : path;
      }
    }
    let s = String(node);
    for (let i = 0; i < args.length; i++) s = s.split(`{${i}}`).join(String(args[i]));
    return s;
  },

  has(path: string): boolean {
    let node: unknown = data;
    for (const seg of path.split('.')) {
      node = (node as Dict)?.[seg];
      if (node === undefined) return false;
    }
    return true;
  },

  /** 世界生成进度文案：pass 名 → LegacyWorldGen 条目（worldgenKeys 映射） */
  worldgenText(passKey: string): string {
    const legacyKey = worldgenProgressKey[passKey];
    return legacyKey != null ? Lang.text(`Legacy.LegacyWorldGen.${legacyKey}`) : passKey;
  },
};
