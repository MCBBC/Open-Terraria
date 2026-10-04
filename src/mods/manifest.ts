// mod 清单解析与校验(2026-10-04)。schema-lite 手写门(零新依赖;坏清单 fail-fast
// 拒载不静默——对齐 recon 闸门"重复注册=注册面 bug,炸 loud"纪律)。
import type { ModManifest } from './types';

export const MOD_API_VERSION = 1;
export class ModManifestError extends Error {}

const ID_RE = /^[a-z][a-z0-9_]{1,31}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/** mod id → l10n 命名空间(Mods.<id>.*;build-l10n 同款点路径约定) */
export function modL10nPrefix(modId: string): string {
  return `Mods.${modId}`;
}

/** mod id → 内容全键前缀(mod_<id>_<key>;与 vi_/place_v_ 稳定 id 派生正则不相交) */
export function modItemFullKey(modId: string, key: string): string {
  return `mod_${modId}_${key}`;
}

function str(v: unknown, err: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new ModManifestError(err);
  return v;
}

/** mod.json 文本 → ModManifest。结构性坏清单抛 ModManifestError(拒载)。 */
export function parseModManifest(jsonText: string): ModManifest {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (e) {
    throw new ModManifestError(`mod.json 不是合法 JSON: ${(e as Error).message}`);
  }
  const id = str(o.id, 'mod.json 缺 id');
  if (!ID_RE.test(id)) throw new ModManifestError(`mod id 非法(须小写蛇形): ${id}`);
  const name = str(o.name, `mod ${id} 缺 name`);
  const version = str(o.version, `mod ${id} 缺 version`);
  if (!SEMVER_RE.test(version)) throw new ModManifestError(`mod ${id} version 须 x.y.z: ${version}`);
  const api = typeof o.api === 'number' ? Math.trunc(o.api) : 1;
  if (api !== MOD_API_VERSION) {
    throw new ModManifestError(`mod ${id} api=${api} 不受支持(引擎支持 ${MOD_API_VERSION})`);
  }
  const sideRaw = typeof o.side === 'string' ? o.side : 'both';
  if (sideRaw !== 'both' && sideRaw !== 'client' && sideRaw !== 'server') {
    throw new ModManifestError(`mod ${id} side 非法: ${sideRaw}`);
  }
  // 依赖表:键须合法 mod id,值须 ^x.y.z 或 x.y.z
  const deps: Record<string, string> = {};
  if (o.dependencies !== undefined) {
    if (typeof o.dependencies !== 'object' || o.dependencies === null || Array.isArray(o.dependencies)) {
      throw new ModManifestError(`mod ${id} dependencies 须对象表`);
    }
    for (const [depId, depVer] of Object.entries(o.dependencies as Record<string, unknown>)) {
      if (!ID_RE.test(depId)) throw new ModManifestError(`mod ${id} 依赖 id 非法: ${depId}`);
      const v = typeof depVer === 'string' ? depVer : '';
      if (!SEMVER_RE.test(v) && !(v.startsWith('^') && SEMVER_RE.test(v.slice(1)))) {
        throw new ModManifestError(`mod ${id} 依赖版本非法: ${depId} → ${v}`);
      }
      deps[depId] = v;
    }
  }
  if (deps[id] !== undefined) throw new ModManifestError(`mod ${id} 自依赖`);
  // 配置表校验(P2):type ∈ {bool,number,string};default 与 type 同型;number 可带 min/max
  let config: ModManifest['config'];
  if (o.config !== undefined) {
    if (typeof o.config !== 'object' || o.config === null || Array.isArray(o.config)) {
      throw new ModManifestError(`mod ${id} config 须对象表`);
    }
    config = {};
    for (const [ck, cv] of Object.entries(o.config as Record<string, unknown>)) {
      if (typeof cv !== 'object' || cv === null) throw new ModManifestError(`mod ${id} config.${ck} 须对象`);
      const c = cv as Record<string, unknown>;
      const ctype = c.type;
      if (ctype !== 'bool' && ctype !== 'number' && ctype !== 'string') {
        throw new ModManifestError(`mod ${id} config.${ck}.type 非法: ${String(ctype)}`);
      }
      const def = c.default;
      if (ctype === 'bool' && typeof def !== 'boolean') throw new ModManifestError(`mod ${id} config.${ck}.default 须 bool`);
      if (ctype === 'number' && (typeof def !== 'number' || !Number.isFinite(def))) throw new ModManifestError(`mod ${id} config.${ck}.default 须 number`);
      if (ctype === 'string' && typeof def !== 'string') throw new ModManifestError(`mod ${id} config.${ck}.default 须 string`);
      if ((c.min !== undefined && typeof c.min !== 'number') || (c.max !== undefined && typeof c.max !== 'number')) {
        throw new ModManifestError(`mod ${id} config.${ck}.min/max 须 number`);
      }
      config[ck] = {
        type: ctype,
        default: def as boolean | number | string,
        label: typeof c.label === 'string' ? c.label : undefined,
        min: typeof c.min === 'number' ? c.min : undefined,
        max: typeof c.max === 'number' ? c.max : undefined,
      };
    }
  }
  return {
    id,
    name,
    version,
    author: typeof o.author === 'string' ? o.author : undefined,
    description: typeof o.description === 'string' ? o.description : undefined,
    api,
    side: sideRaw as ModManifest['side'],
    dependencies: Object.keys(deps).length > 0 ? deps : undefined,
    config: config && Object.keys(config).length > 0 ? config : undefined,
  };
}

/** 语义版本比较:-1/0/1(逐段数值) */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! < pb[i]! ? -1 : 1;
  }
  return 0;
}

/** 版本约束满足判定(^1.2.3 = >=1.2.3 且主版本相同;精确 x.y.z 全等) */
export function versionSatisfies(version: string, constraint: string): boolean {
  if (constraint.startsWith('^')) {
    const min = constraint.slice(1);
    return compareSemver(version, min) >= 0 && version.split('.')[0] === min.split('.')[0];
  }
  return compareSemver(version, constraint) === 0;
}
