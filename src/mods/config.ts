// ModConfig(2026-10-04 P2):声明式配置(mod.json config 表)→ 默认值 + kv 持久化
// (键 sw.mods.config.<modid>)。entry.js 经 sw.config.get/set 读写;面板内联编辑。
// 原版对齐面:ModConfig(tML)声明式 schema 语义的 P2 最小化——支持
// bool/number/string 三型+min/max;无 UI 自动布局/重载回调(tML OnChanged=P3)。
import { kvGet, kvSet } from '../save/KvStore';

export interface ModConfigEntry {
  type: 'bool' | 'number' | 'string';
  default: boolean | number | string;
  label?: string;
  min?: number;
  max?: number;
}

export type ModConfigSchema = Record<string, ModConfigEntry>;
export type ModConfigValues = Record<string, boolean | number | string>;

/** 单 mod 配置运行时(装载相位构建) */
export class ModConfigState {
  readonly schema: ModConfigSchema;
  values: ModConfigValues;
  private dirty = false;

  constructor(readonly modId: string, schema: ModConfigSchema, stored: ModConfigValues | null) {
    this.schema = schema;
    this.values = {};
    for (const [k, e] of Object.entries(schema)) {
      const v = stored?.[k];
      this.values[k] = v === undefined ? e.default : clampEntry(e, v);
    }
  }

  get(key: string): boolean | number | string {
    if (!(key in this.schema)) throw new Error(`[mod-config] mod ${this.modId} 未声明配置键: ${key}`);
    return this.values[key]!;
  }

  /** 写入+异步持久化(kvSet 即发即忘;≤2MB 双写 IDB+localStorage 通道) */
  set(key: string, value: boolean | number | string): void {
    const e = this.schema[key];
    if (!e) throw new Error(`[mod-config] mod ${this.modId} 未声明配置键: ${key}`);
    this.values[key] = clampEntry(e, value);
    this.dirty = true;
    void kvSet(`sw.mods.config.${this.modId}`, JSON.stringify(this.values));
  }

  /** 面板/装载器用:本轮是否有未落盘修改(kvSet 异步,一般无需等待) */
  get pendingPersist(): boolean { return this.dirty; }
}

function clampEntry(e: ModConfigEntry, v: unknown): boolean | number | string {
  if (e.type === 'bool') return typeof v === 'boolean' ? v : !!v;
  if (e.type === 'number') {
    let n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
    if (!Number.isFinite(n)) n = typeof e.default === 'number' ? e.default : 0;
    if (e.min !== undefined && n < e.min) n = e.min;
    if (e.max !== undefined && n > e.max) n = e.max;
    return n;
  }
  return typeof v === 'string' ? v : String(v ?? e.default ?? '');
}

/** 装载相位:异步读 kv 存储值构建运行时(在 loader 脚本相位前 await) */
export async function loadModConfigValues(modId: string, schema: ModConfigSchema): Promise<ModConfigState> {
  let stored: ModConfigValues | null = null;
  try {
    const raw = await kvGet(`sw.mods.config.${modId}`);
    if (raw) stored = JSON.parse(raw) as ModConfigValues;
  } catch { /* 坏档=回默认值 */ }
  return new ModConfigState(modId, schema, stored);
}
