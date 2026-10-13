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

  /** 写入+异步持久化(kvSet 即发即忘;IDB 单写通道,★BJ615) */
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

/** 装载相位:异步读 kv 存储值构建运行时(在 loader 脚本相位前 await)。
 *  ★纯构建不注册活实例——modsPanel 等编辑面也走本口,注册权在 loader(防独立
 *  编辑实例冒充 sw.config 本体=双写漂移)。 */
export async function loadModConfigValues(modId: string, schema: ModConfigSchema): Promise<ModConfigState> {
  let stored: ModConfigValues | null = null;
  try {
    const raw = await kvGet(`sw.mods.config.${modId}`);
    if (raw) stored = JSON.parse(raw) as ModConfigValues;
  } catch { /* 坏档=回默认值 */ }
  return new ModConfigState(modId, schema, stored);
}

// ---- 活实例注册表(2026-10-13 游戏内模组设置面板):装载相位构建的 ModConfigState
// 即 mod entry 持有的 sw.config 本体——游戏内面板优先取活实例编辑=热生效
// (逐拍读 config 的 mod 立刻感知),否则(标题屏/装载失败)回落 loadModConfigValues
// 独立实例=重载后生效。两路 set 都持久化 kv,语义一致。 ----
const liveStates = new Map<string, ModConfigState>();

/** loader L2 相位注册(生产链每 mod 一次;同 id 重装载覆盖) */
export function registerLiveModConfig(state: ModConfigState): void {
  liveStates.set(state.modId, state);
}

/** 游戏内面板读活实例;未装载(标题屏/脚本失败)返 null */
export function getLiveModConfig(modId: string): ModConfigState | null {
  return liveStates.get(modId) ?? null;
}

/** loader 单测重置用 */
export function _resetLiveModConfigsForTests(): void {
  liveStates.clear();
}
