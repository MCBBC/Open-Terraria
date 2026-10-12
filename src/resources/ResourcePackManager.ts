// 资源包管理器（M13）——导入/启停/调序/卸载/启动恢复 + 运行时应用。
//
// 注入引擎 = RemasterRuntime（复用其注入矩阵：vanilla-ui/→uiimages、vanilla/→vimages、
// Projectile_N→Arrow 覆盖、Buff_N→objectURL 钩子、tile/wall→onSheetReplaced 精确重烘、
// ImageBitmap 桥解码、全透明坏 sheet 防线、sw:remaster-applied 事件）。资源包与素材
// 重制包共享同一 runtime 实例（main.ts 装配）——buff 图标钩子/弹幕覆盖/重烘链天然合流。
//
// 应用序（★SW-FX16 2026-09-10 优先级定谳修正,锚见 ResourcePackList.ts 文件头）：
// EnabledPacks 按 SortingOrder 升序合并、【首写胜】——列表顶 = 最小 order = 冲突
// 胜者。真值锚：纹理 AssetRepository.FindSourceForAsset = _sources.FirstOrDefault
// （源序 = [packs 升序,静态源尾随],AssetSourceController.cs:45-58）;音频
// FindReplacementTrack（:84-124）对反转表逐源覆盖 → 最小 order 胜。原版 UI 命名层
// （SetResourcePackAsTopPriority=最大+1/"向前移动"=+1）与引擎相反,系误称,不照抄。
// 旧实现「高序后写覆盖低序」按命名层落刀 = 与原版引擎行为相反,本批反正。
// 音效覆盖经 Sfx.applySfxPackOverrides 整表下发（跨 Sfx 实例驱逐缓存）；音乐覆盖
// 经 Sfx.applyMusicPackOverrides（Audio.buffer/Sfx.loadCueBuffer 消费,跨实例驱逐
// 经 setMusicOverrideListener 回调）。
// 字体 = FontFace 注册（web 适配：族名 SWRP:<基名>；XNB 字体不可译已在上游跳过）。
import { RemasterRuntime } from '../remaster/RemasterRuntime';
import { buildManifest, zipStore, type ZipEntry } from '../remaster/PackFormat';
import type { LoadedPack } from '../remaster/types';
import { applySfxPackOverrides, applyMusicPackOverrides, musicPackOverrideKeys, sfxPackOverrideKeys } from '../core/Sfx';
import { TOWN_NPC_PROFILE } from '../data/townNpcProfiles';
import { packKeyCategory, setTownProfileIds, PACK_CATEGORIES, type PackCategoryId } from './packPaths';
import { registerPackPortraitUrl, clearPackPortraitUrls } from '../data/npcPortraits';
import {
  readResourcePack, normalizePackFilePaths, parseFromEntries, ResourcePackError, formatPackVersion,
  type ParsedResourcePack,
} from './ResourcePackZip';
import {
  enableAsTopPriority, offsetPriority, cleanUpPriority, enabledSorted, disablePack,
  type PackRow,
} from './ResourcePackList';
import { ResourcePackStore } from './ResourcePackStore';

function pngToDataUrl(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;   // btoa 参数长度护栏
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return `data:image/png;base64,${btoa(bin)}`;
}

const registeredFonts = new Map<string, FontFace>();

async function registerPackFont(family: string, bytes: Uint8Array): Promise<void> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;  // node 测试环境
  if (registeredFonts.has(family)) return;
  try {
    const ff = new FontFace(family, bytes.slice().buffer);
    await ff.load();
    document.fonts.add(ff);
    registeredFonts.set(family, ff);
  } catch (e) {
    console.warn(`[resourcepacks] 字体 ${family} 注册失败(已跳过):`, (e as Error).message);
  }
}

export class ResourcePackManager {
  rows: PackRow[] = [];
  /** 会话内已解析包（id → 解析产物；启动/开关时从 zip blob 解出） */
  private parsed = new Map<string, ParsedResourcePack>();
  private runtime: RemasterRuntime | null;
  private store: ResourcePackStore;

  constructor(runtime: RemasterRuntime | null, store = new ResourcePackStore()) {
    this.runtime = runtime;
    this.store = store;
    setTownProfileIds(new Set(Object.keys(TOWN_NPC_PROFILE).map(Number)));   // 类别分流表注入
  }

  attachRuntime(rt: RemasterRuntime): void { this.runtime = rt; }

  /** 类别开关求值(缺省=开;cats 只存显式覆写) */
  private catOn(row: PackRow, c: PackCategoryId): boolean {
    return row.categories?.[c] ?? true;
  }

  /** 该包实际覆盖的类别集(信息面/开关面展示用;未启用/未解析=空) */
  packCategoriesOf(id: string): PackCategoryId[] {
    const pack = this.parsed.get(id);
    if (!pack) return [];
    const set = new Set<PackCategoryId>();
    for (const k of pack.images.keys()) set.add(packKeyCategory(k));
    if (pack.sounds.size) set.add('sfx');
    if (pack.music.size) set.add('music');
    for (const _f of pack.fonts.keys()) { set.add('ui'); break; }
    return PACK_CATEGORIES.map((c) => c.id).filter((c) => set.has(c));
  }

  /** 设置类别开关(持久化 + 全量重放;cats 缺项=开) */
  async setPackCategories(id: string, cats: Partial<Record<PackCategoryId, boolean>>): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    row.categories = cats;
    await this.store.saveRows(this.rows);
    await this.applyAll();
  }

  /** 启动恢复：列注册表 + 启用包解 zip + 全量应用（main.ts 装配，菜单显示前）。 */
  async applyInstalled(): Promise<{ packs: number; applied: number }> {
    this.rows = await this.store.listRows();
    cleanUpPriority(this.rows);
    let applied = 0;
    for (const row of enabledSorted(this.rows)) {
      const pack = await this.loadParsed(row);
      if (!pack) continue;
      applied += pack.images.size;
    }
    await this.applyAll();
    if (this.rows.length) {
      const enabled = this.rows.filter((r) => r.enabled).length;
      console.log(`[resourcepacks] 启动应用:${enabled}/${this.rows.length} 个启用包,注入 ${applied} 张贴图`
        + (sfxPackOverrideKeys().length ? `,${sfxPackOverrideKeys().length} 个音效覆盖` : '')
        + (musicPackOverrideKeys().length ? `,${musicPackOverrideKeys().length} 首音乐覆盖` : ''));
    }
    return { packs: this.rows.length, applied };
  }

  /** 导入 zip（新包默认禁用——ResourcePackList.FromJson 对未存档包 IsEnabled=false）。
   *  同名 fileName 覆盖旧包（FromJson 按 FileName 去重语义）。 */
  async importPack(source: File | Uint8Array, displayName?: string): Promise<PackRow> {
    const bytes = source instanceof File ? new Uint8Array(await source.arrayBuffer()) : source;
    const pack = readResourcePack(bytes);
    const fileName = displayName ?? (source instanceof File ? source.name : 'pack.zip');
    await this.ready();
    const prev = this.rows.find((r) => r.fileName === fileName);
    if (prev) await this.store.remove(prev.id);
    const row: PackRow = {
      id: `rp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      fileName,
      name: pack.manifest.name || fileName.replace(/\.zip$/i, ''),
      description: pack.manifest.description,
      author: pack.manifest.author,
      version: pack.manifest.version,
      enabled: false,
      sortingOrder: 0,
      addedAt: Date.now(),
      fileCount: pack.images.size,
      iconDataUrl: pack.iconPng ? pngToDataUrl(pack.iconPng) : null,
    };
    this.parsed.set(row.id, pack);
    this.rows = [...this.rows.filter((r) => r.id !== prev?.id), row];
    const stored = await this.store.putZip(row.id, bytes);
    if (!stored) console.warn('[resourcepacks] zip 持久化失败(IndexedDB 不可用)——本包仅会话内可用');
    await this.store.saveRows(this.rows);
    return row;
  }

  /** ★散目录导入(2026-10-12 原版材质包直读):工坊订阅/用户文件夹形态。
   *  会话解析与持久化回封【共用归一化路径】(readResourcePackFromFiles 内同一
   *  normalizePackFilePaths)——★v2 修复:旧实现回封带 webkitRelativePath 外层
   *  目录前缀的原始路径,刷新后 stripContentRoot 不认="缺 pack.json"(用户实报)。 */
  async importPackFromFiles(
    files: Array<{ path: string; data: Uint8Array }>, displayName: string,
  ): Promise<PackRow> {
    const norm = normalizePackFilePaths(files);
    const pack = parseFromEntries(norm.map((f) => [f.path, f.data] as [string, Uint8Array]));
    await this.ready();
    const entries: ZipEntry[] = norm.map((f) => ({ name: f.path, data: f.data }));
    const bytes = zipStore(entries);
    const prev = this.rows.find((r) => r.fileName === displayName);
    if (prev) await this.store.remove(prev.id);
    const row: PackRow = {
      id: `rp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      fileName: displayName,
      name: pack.manifest.name || displayName,
      description: pack.manifest.description,
      author: pack.manifest.author,
      version: pack.manifest.version,
      enabled: false,
      sortingOrder: 0,
      addedAt: Date.now(),
      fileCount: pack.images.size,
      iconDataUrl: pack.iconPng ? pngToDataUrl(pack.iconPng) : null,
    };
    this.parsed.set(row.id, pack);
    this.rows = [...this.rows.filter((r) => r.id !== prev?.id), row];
    const stored = await this.store.putZip(row.id, bytes);
    if (!stored) console.warn('[resourcepacks] zip 持久化失败(IndexedDB 不可用)——本包仅会话内可用');
    await this.store.saveRows(this.rows);
    return row;
  }

  /** 启用/禁用（CreatePackToggleButton.OnLeftClick :200-207 语义：立即重置内容态）。
   *  启用 = SetResourcePackAsTopPriority（落显示列底,原版 1:1,见 ResourcePackList
   *  注）+ 全量重放（★SW-FX16 首写胜语义：新包在列底不压制已启用同键包,故不能只
   *  注入本包——旧实现直接 applyImages(pack) 在首写胜下会越权覆盖列表顶包）；
   *  禁用 = 撤文件 + 余包重放。 */
  async setEnabled(id: string, on: boolean): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.enabled === on) return;
    await this.ready();
    if (on) {
      enableAsTopPriority(row, this.rows);
      await this.loadParsed(row);
      await this.applyAll();
    } else {
      disablePack(row);
      const pack = await this.loadParsed(row);
      if (pack) await this.restoreFiles([...pack.images.keys()]);
      // 撤销把余包同键覆盖一并清了——余下启用包按优先级序重放
      await this.applyAll();
    }
    await this.afterMutation();
  }

  /** 调序（OffsetResourcePackPriority swap 语义；相邻包内容键相交才需重放贴图） */
  async move(id: string, offset: -1 | 1): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return false;
    await this.ready();
    if (!offsetPriority(row, this.rows, offset)) return false;
    const after = enabledSorted(this.rows);
    const i = after.findIndex((r) => r.id === id);
    const neighbor = after[i - offset];
    // 交换双方贴图键相交才有可观测差异（纯序变不改覆盖终态）；音效终态恒重算。
    // 惰性解析补齐后再判（未解析跳过判会漏重放）
    const a = await this.loadParsed(row);
    const b = neighbor ? await this.loadParsed(neighbor) : null;
    if (a && b && [...a.images.keys()].some((k) => b.images.has(k))) await this.applyAll();
    await this.afterMutation();
    return true;
  }

  /** 卸载（禁用 + 删 zip/注册行）。先行出册再撤销重放，防 applyAll 回放本包。 */
  async remove(id: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    await this.ready();
    const pack = row.enabled ? await this.loadParsed(row) : null;
    this.parsed.delete(id);
    this.rows = this.rows.filter((r) => r.id !== id);
    await this.store.remove(id);
    if (pack) {
      await this.restoreFiles([...pack.images.keys()]);
      await this.applyAll();   // 余包同键重放
    }
    await this.afterMutation();
  }

  private async afterMutation(): Promise<void> {
    cleanUpPriority(this.rows);
    await this.store.saveRows(this.rows);
    this.pushAudioOverrides();   // 禁用/卸载/重放后重算音效+音乐终态
  }

  /** 全量应用（启动/启停重放/同键调序）：EnabledPacks 按 SortingOrder 升序合并、
   *  【首写胜】（列表顶 = 最小 order = 冲突胜者——真值锚见文件头 SW-FX16 定谳） */
  private async applyAll(): Promise<void> {
    const merged = new Map<string, Uint8Array>();
    const fonts = new Map<string, Uint8Array>();
    for (const row of enabledSorted(this.rows)) {   // 升序遍历,先到先得
      const pack = await this.loadParsed(row);
      if (!pack) continue;
      // ★类别开关(2026-10-12):每包可关停部分材质类别(缺省全开)——合并期过滤,
      //   关停键不进 merged(别名派生/头像注册都在下游,天然不吃关停键)
      const on = (c: PackCategoryId) => this.catOn(row, c);
      for (const [k, v] of pack.images) {
        if (merged.has(k) || !on(packKeyCategory(k))) continue;
        merged.set(k, v);
      }
      for (const [k, v] of pack.fonts) if (!fonts.has(k) && on('ui')) fonts.set(k, v);
    }
    if (merged.size) await this.applyImagesMap(merged);
    else clearPackPortraitUrls();   // 零包=清包头像(回原版)
    for (const [fam, bytes] of fonts) void registerPackFont(fam, bytes);
    this.pushAudioOverrides();
  }


  private async applyImagesMap(images: Map<string, Uint8Array>): Promise<void> {
    if (!this.runtime || images.size === 0) return;
    const sheets = new Map<string, Blob>();
    for (const [file, bytes] of images) sheets.set(file, new Blob([bytes as unknown as BlobPart], { type: 'image/png' }));
    // ★城镇NPC本体别名(2026-10-12 用户实报"只有住房旗帜换了"):城镇 NPC 本体贴图
    //   走档案名 {Name}_Default.png(TownNPCProfiles.GetTextureNPCShouldUse),而包替换
    //   的是原版名 NPC_<id>.png——按 TOWN_NPC_PROFILE 派生别名(包未显式带档案名才
    //   派生;_Party/_Transformed/Shimmered 变体不派生=派对/微光期回原版,登记)。
    const aliasedTownIds: number[] = [];
    clearPackPortraitUrls();   // 重放先清(重注册在下方 Portraits 扫描)
    for (const [file, bytes] of images) {
      const m = /^vanilla\/NPC_(\d+)\.png$/.exec(file);
      if (!m) continue;
      const id = Number(m[1]);
      const profile = TOWN_NPC_PROFILE[id];
      if (!profile) continue;
      aliasedTownIds.push(id);
      const alias = `vanilla/${profile.name}_Default.png`;
      if (!sheets.has(alias)) sheets.set(alias, new Blob([bytes as unknown as BlobPart], { type: 'image/png' }));
    }
    // ★对话头像(2026-10-12 用户指正:包自带 TownNPCs/Portraits 真头像,不需派生):
    //   包头像按名注册 objectURL(portraitUrl 经 PACK_PORTRAIT_URL_BY_NAME 优先命中,
    //   含 _shimmer 微光变体);重放先清后立,包禁用=回原版头像。
    for (const [file, bytes] of images) {
      const pm = /^vanilla\/TownNPCs_Portraits_Portrait_(.+)\.png$/.exec(file);
      if (!pm) continue;
      const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }));
      registerPackPortraitUrl(pm[1], url);
    }
    const synthetic: LoadedPack = {
      id: 'resourcepacks',
      manifest: buildManifest('resourcepacks', 'vanilla', {}),
      sheets,
    };
    const r = await this.runtime.apply(synthetic);
    if (r.failed.length) {
      console.warn(`[resourcepacks] ${r.failed.length} 张贴图注入失败(坏 sheet 保持原版):`,
        r.failed.slice(0, 5).map((f) => `${f.file}(${f.reason})`).join(', '));
    }
  }

  /** 撤销一组文件为原版：先清 atlas 映射（懒消费方经 ensureVImage/ensureUiImage 重拉
   *  sprites/ 原路径;包专有键无盘文件→404 负缓存即正确终态），再走 runtime 的
   *  restoreVanilla（Arrow 覆盖复位/tile·wall 重烘/buff objectURL 回收/派生缓存事件）。
   *  完成后由调用方 applyAll 重放余下启用包。 */
  private async restoreFiles(files: string[]): Promise<void> {
    if (!this.runtime) return;
    for (const f of files) this.runtime.clearSheetEntry(f);
    await this.runtime.restoreVanilla(files);
  }

  /** 音效+音乐覆盖终态：enabled 包按优先级升序合并（首写胜,SW-FX16 定谳）→
   *  Sfx 整表下发（音乐表同源;Audio/Sfx 缓存驱逐各自通道承担） */
  private pushAudioOverrides(): void {
    const merged = new Map<string, Uint8Array>();
    const music = new Map<string, Uint8Array>();
    for (const row of enabledSorted(this.rows)) {
      const pack = this.parsed.get(row.id);
      if (!pack) continue;
      // ★类别开关:音效/音乐各自独立闸(关停键不进覆盖表)
      if (this.catOn(row, 'sfx')) for (const [k, v] of pack.sounds) if (!merged.has(k)) merged.set(k, v);
      if (this.catOn(row, 'music')) for (const [k, v] of pack.music) if (!music.has(k)) music.set(k, v);
    }
    applySfxPackOverrides(merged);
    applyMusicPackOverrides(music);
  }

  /** 惰性取解析产物（启动后 toggle 首次触发时解 zip） */
  private async loadParsed(row: PackRow): Promise<ParsedResourcePack | null> {
    const hit = this.parsed.get(row.id);
    if (hit) return hit;
    const blob = await this.store.getZip(row.id);
    if (!blob) {
      console.warn(`[resourcepacks] 包 ${row.fileName} 的 zip 不可读(存储不可用/已被清)——跳过应用`);
      return null;
    }
    try {
      const pack = readResourcePack(new Uint8Array(await blob.arrayBuffer()));
      this.parsed.set(row.id, pack);
      return pack;
    } catch (e) {
      console.warn(`[resourcepacks] 包 ${row.fileName} 解析失败(跳过):`, (e as Error).message);
      return null;
    }
  }

  private readyPromise: Promise<void> | null = null;
  /** 首次操作前拉注册表（UI 侧先行触发的场景；applyInstalled 已拉则幂等） */
  private async ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        if (this.rows.length === 0) this.rows = await this.store.listRows();
      })();
    }
    await this.readyPromise;
  }

  /** 信息页数据（UIResourcePackInfoMenu 展示字段） */
  info(id: string): { row: PackRow; version: string } | null {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    return { row, version: formatPackVersion(row.version) };
  }

  /** UI 首帧取行（applyInstalled 未跑过的会话/面板先开场景） */
  async refreshRows(): Promise<PackRow[]> {
    await this.ready();
    return this.rows;
  }

  /** 解析产物只读视图（测试/调试探针） */
  parsedOf(id: string): ParsedResourcePack | undefined { return this.parsed.get(id); }
}

export { ResourcePackError };

// ---- 单例（Settings 页消费；main.ts 装配时 attachRuntime） ----
let singleton: ResourcePackManager | null = null;
export function getResourcePacks(): ResourcePackManager {
  if (!singleton) singleton = new ResourcePackManager(null);
  return singleton;
}
export function initResourcePacks(rt: RemasterRuntime): ResourcePackManager {
  const m = getResourcePacks();
  m.attachRuntime(rt);
  return m;
}
