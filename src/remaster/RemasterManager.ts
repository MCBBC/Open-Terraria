// 素材包管理器:已安装列表/zip 导入分发/启停/卸载/启动应用。
// 应用语义 = 局部覆盖叠加(类 mod):多包按安装序叠加,后装覆盖先装同文件;
// 禁用/卸载 = 先 restoreVanilla(涉及文件并集)再按序重放其余启用包。
import { readPack } from './PackFormat';
import {
  listInstalled, savePack, loadInstalledPacks, setPackEnabled, deletePack,
  type InstalledMeta,
} from './PackStore';
import { RemasterRuntime, type ApplyResult } from './RemasterRuntime';
import type { LoadedPack } from './types';

export interface ImportReport {
  meta: InstalledMeta;
  /** manifest.baseVersion 与当前素材版本不符(已应用;rect 自带不依赖当前 vanilla.json) */
  versionMismatch: boolean;
  apply: ApplyResult;
}

export class RemasterManager {
  constructor(private runtime: RemasterRuntime) {}

  /** 导入 zip(File 或字节数组)→ 持久化 → 立即应用。 */
  async importZip(source: File | Uint8Array): Promise<ImportReport> {
    const bytes = source instanceof File ? new Uint8Array(await source.arrayBuffer()) : source;
    const pack = await readPack(bytes);
    const meta = await savePack(pack);
    const apply = await this.runtime.apply(pack);
    return { meta, versionMismatch: false, apply };
  }

  /** 启动应用(main.ts:loadAssets 后、菜单前——此刻无 chunk 烘焙零竞争,
   *  之后懒加载 vimages.has 命中早退,天然正确)。 */
  async applyInstalled(): Promise<{ packs: number; files: number }> {
    let files = 0;
    const installed = await loadInstalledPacks();
    for (const { meta, pack } of installed) {
      if (!meta.enabled) continue;
      const r = await this.runtime.apply(pack);
      files += r.applied.length;
    }
    return { packs: installed.length, files };
  }

  /** 启停/卸载后的重放:restore 涉及文件并集 → 按安装序重放启用包。
   *  extraFiles = 被移除 pack 的文件(已不在 installed 列表,不并入则其注入
   *  无人还原——卸载后 vimages 仍停留 pack 图的根因)。 */
  private async replay(extraFiles: string[] = []): Promise<void> {
    const installed = await loadInstalledPacks();
    const allFiles = new Set<string>(extraFiles);
    for (const { pack } of installed) {
      for (const f of pack.sheets.keys()) allFiles.add(f);
    }
    // 涉及的文件先回原版(含已卸载包的残留注入)
    await this.runtime.restoreVanilla(allFiles);
    for (const { meta, pack } of installed) {
      if (!meta.enabled) continue;
      await this.runtime.apply(pack);
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await setPackEnabled(id, enabled);
    await this.replay();
  }

  async remove(id: string): Promise<void> {
    const target = (await loadInstalledPacks()).find(({ meta }) => meta.id === id);
    const removedFiles = target ? [...target.pack.sheets.keys()] : [];
    await deletePack(id);
    await this.replay(removedFiles);
  }

  async list(): Promise<InstalledMeta[]> {
    return await listInstalled();
  }

  /** 当前已启用包的 sheet 文件集(工作台预览/调试)。 */
  async activeFiles(): Promise<Set<string>> {
    const out = new Set<string>();
    for (const { meta, pack } of await loadInstalledPacks()) {
      if (!meta.enabled) continue;
      for (const f of pack.sheets.keys()) out.add(f);
    }
    return out;
  }
}

/** 从 zip 字节数组解析为 LoadedPack(面板预览用,不安装)。 */
export async function peekPack(source: File | Uint8Array): Promise<LoadedPack> {
  const bytes = source instanceof File ? new Uint8Array(await source.arrayBuffer()) : source;
  return await readPack(bytes);
}
