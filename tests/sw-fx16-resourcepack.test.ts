// SW-FX16 2026-09-10 资源包 M13 补债测试：叠加优先级定谳修正（首写胜=列表顶胜）
// + 音乐替换面（原版 LegacyAudioSystem 音乐轨替换语义补缺）+ 清单校验回归。
// 金标锚（Terarria1457）：
//   - 冲突胜者 = 启用列表顶 = 最小 SortingOrder：纹理 AssetRepository.FindSourceForAsset
//     = _sources.FirstOrDefault(HasAsset)（源序 = AssetSourceController.UseResourcePacks
//     :45-48 [packs 升序,静态源尾随]）;音频 FindReplacementTrack(:84-124) 对反转表
//     （:53-57）逐源覆盖 → 最小 order 胜。原版 UI 命名层（SetResourcePackAsTopPriority
//     :211-226 = 最大+1/"向前移动"=+1）与引擎相反,系误称,登记于 ResourcePackList.ts。
//   - 音乐替换 = LegacyAudioSystem.LoadFromSources(:34-54) "Music/<曲名>" 资产路径,
//     .ogg/.wav/.mp3（FindReplacementTrack :100-108）;覆盖全 AudioTracks 含环境
//     cue 28/45。仓库消费 = Audio.buffer + Sfx.loadCueBuffer。
//   - 清单 = pack.json（ResourcePack.cs:40/:118-134,缺文件致命 :121-123）。
// 运行:npx vitest run tests/sw-fx16-resourcepack.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapPackAsset } from '../src/resources/packPaths';
import { readResourcePack } from '../src/resources/ResourcePackZip';
import { ResourcePackStore, type PackStorage } from '../src/resources/ResourcePackStore';
import { ResourcePackManager } from '../src/resources/ResourcePackManager';
import type { RemasterRuntime } from '../src/remaster/RemasterRuntime';
import {
  applySfxPackOverrides, applyMusicPackOverrides, musicPackOverride,
  musicPackOverrideKeys, sfxPackOverrideKeys,
} from '../src/core/Sfx';

const AUDIO_SRC = readFileSync(
  join(dirname(fileURLToPath(new URL(import.meta.url))), '..', 'src', 'core', 'Audio.ts'), 'utf8');

const manifestJson = (name = '包', author = '作者'): Uint8Array =>
  strToU8(JSON.stringify({ Name: name, Author: author, Description: 'd', Version: { major: 1, minor: 2 } }));

const makeZip = (files: Record<string, Uint8Array>): Uint8Array => zipSync(files);

// ---- packPaths：Music 族映射（SW-FX16 补缺）----
describe('SW-FX16 packPaths Music 映射', () => {
  it('Content/Music/Music_<id>.<ogg|mp3|wav> → { kind: music, file: Music_<id> }', () => {
    expect(mapPackAsset('Music/Music_77.ogg')).toEqual([{ kind: 'music', file: 'Music_77' }]);
    expect(mapPackAsset('Music/Music_6.mp3')).toEqual([{ kind: 'music', file: 'Music_6' }]);
    expect(mapPackAsset('Music/Music_28.wav')).toEqual([{ kind: 'music', file: 'Music_28' }]);
  });
  it('非音频扩展/嵌套子目录跳过（原版 Music/ 平铺,无子目录族）', () => {
    expect(mapPackAsset('Music/Music_77.xnb')).toEqual([]);
    expect(mapPackAsset('Music/sub/Music_77.ogg')).toEqual([]);
  });
});

// ---- ResourcePackZip：音乐入解析产物 ----
describe('SW-FX16 zip 解析音乐面', () => {
  it('Content/Music 条目入 music 表 + counts.music；缺 pack.json 仍致命', () => {
    const pack = readResourcePack(makeZip({
      'pack.json': manifestJson(),
      'Content/Music/Music_77.ogg': new Uint8Array([1, 2, 3]),
      'Content/Sounds/Item_29.wav': new Uint8Array([4]),
    }));
    expect(pack.music.get('Music_77')).toEqual(new Uint8Array([1, 2, 3]));
    expect(pack.counts.music).toBe(1);
    expect(pack.sounds.has('Item_29')).toBe(true);
    expect(() => readResourcePack(makeZip({ 'Content/Music/Music_1.ogg': new Uint8Array([1]) })))
      .toThrow(/pack\.json/);
  });
});

// ---- 管理器：叠加优先级（首写胜 = 列表顶胜）+ 音乐覆盖下发 ----
function makeStorage(): PackStorage & { reg: string; zips: Map<string, Blob> } {
  const s = {
    reg: '[]',
    zips: new Map<string, Blob>(),
    async getRegistry() { return s.reg; },
    async setRegistry(json: string) { s.reg = json; },
    async putZip(id: string, blob: Blob) { s.zips.set(id, blob); return true; },
    async getZip(id: string) { return s.zips.get(id) ?? null; },
    async deleteZip(id: string) { s.zips.delete(id); },
  };
  return s;
}

function makeRuntime() {
  const state = new Map<string, Blob>();
  const rt = {
    state,
    async apply(pack: { sheets: Map<string, Blob> }) {
      for (const [f, b] of pack.sheets) state.set(f, b);
      return { applied: [...pack.sheets.keys()], failed: [] };
    },
    clearSheetEntry(file: string) { state.delete(file); },
    async restoreVanilla() { /* stub */ },
  };
  return rt as unknown as RemasterRuntime & typeof rt;
}

function packZip(cursorByte: number, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return makeZip({
    'pack.json': manifestJson(`包${cursorByte}`, `作者${cursorByte}`),
    'Content/Images/UI/Cursor_0.png': new Uint8Array([cursorByte]),
    ...extra,
  });
}

function packFile(cursorByte: number, extra?: Record<string, Uint8Array>): File {
  return new File([packZip(cursorByte, extra) as unknown as BlobPart], `Pack${cursorByte}.zip`, { type: 'application/zip' });
}

const firstByte = async (b: Blob | undefined): Promise<number> =>
  b ? new Uint8Array(await (b as Blob).arrayBuffer())[0] : -1;

afterEach(() => {
  applySfxPackOverrides(new Map());
  applyMusicPackOverrides(new Map());
});

describe('SW-FX16 叠加优先级（首写胜 = 启用列表顶胜,SW-FX16 决断面）', () => {
  it('双包同键：先启用（低 order=列表顶）压住后启用;顶包禁用后次包顶上', async () => {
    const rt = makeRuntime();
    const mgr = new ResourcePackManager(rt, new ResourcePackStore(makeStorage()));
    const a = await mgr.importPack(packFile(0x11));
    const b = await mgr.importPack(packFile(0x22));
    await mgr.setEnabled(a.id, true);           // a → order 0（列表顶）
    await mgr.setEnabled(b.id, true);           // b → order 1（列底）
    expect(await firstByte(rt.state.get('vanilla-ui/UI_Cursor_0.png'))).toBe(0x11);  // 顶胜
    await mgr.setEnabled(a.id, false);          // 顶包撤出 → b 同键顶上
    expect(await firstByte(rt.state.get('vanilla-ui/UI_Cursor_0.png'))).toBe(0x22);
  });

  it('调序换胜者：两包同键,↑(offset-1) 使列底包上移夺胜（move 后重放）', async () => {
    const rt = makeRuntime();
    const mgr = new ResourcePackManager(rt, new ResourcePackStore(makeStorage()));
    const a = await mgr.importPack(packFile(0x11));
    const b = await mgr.importPack(packFile(0x22));
    await mgr.setEnabled(a.id, true);
    await mgr.setEnabled(b.id, true);
    expect(await firstByte(rt.state.get('vanilla-ui/UI_Cursor_0.png'))).toBe(0x11);
    await mgr.move(b.id, -1);                   // b 上移一档 → 同键夺胜
    expect(await firstByte(rt.state.get('vanilla-ui/UI_Cursor_0.png'))).toBe(0x22);
    await mgr.move(b.id, 1);                    // 移回 → a 复胜
    expect(await firstByte(rt.state.get('vanilla-ui/UI_Cursor_0.png'))).toBe(0x11);
  });

  it('三包链式回落：顶包卸载 → 次顶接棒（同键）', async () => {
    const rt = makeRuntime();
    const mgr = new ResourcePackManager(rt, new ResourcePackStore(makeStorage()));
    const a = await mgr.importPack(packFile(0x11));
    const b = await mgr.importPack(packFile(0x22));
    const c = await mgr.importPack(packFile(0x33));
    await mgr.setEnabled(a.id, true);
    await mgr.setEnabled(b.id, true);
    await mgr.setEnabled(c.id, true);
    expect(await firstByte(rt.state.get('vanilla-ui/UI_Cursor_0.png'))).toBe(0x11);
    await mgr.remove(a.id);
    expect(await firstByte(rt.state.get('vanilla-ui/UI_Cursor_0.png'))).toBe(0x22);
  });
});

describe('SW-FX16 音乐覆盖下发（Sfx 表 + Audio 消费面）', () => {
  it('启用含 Music 的包 → musicPackOverride 可取、键集正确；禁用/清空回归', async () => {
    const zip = makeZip({
      'pack.json': manifestJson(),
      'Content/Music/Music_6.ogg': new Uint8Array([7, 7, 7]),
      'Content/Music/Music_77.mp3': new Uint8Array([8, 8]),
    });
    const mgr = new ResourcePackManager(makeRuntime(), new ResourcePackStore(makeStorage()));
    const r = await mgr.importPack(zip);
    expect(musicPackOverrideKeys()).toEqual([]);
    await mgr.setEnabled(r.id, true);
    expect(musicPackOverrideKeys().sort()).toEqual(['Music_6', 'Music_77']);
    expect(musicPackOverride('Music_6')).toEqual(new Uint8Array([7, 7, 7]));
    await mgr.setEnabled(r.id, false);
    expect(musicPackOverrideKeys()).toEqual([]);
    expect(musicPackOverride('Music_6')).toBeUndefined();
  });

  it('双包同曲：列表顶胜（首写胜,与贴图同向）;顶包禁用后次包曲目接棒', async () => {
    const rt = makeRuntime();
    const mgr = new ResourcePackManager(rt, new ResourcePackStore(makeStorage()));
    const a = await mgr.importPack(new File(
      [packZip(0x11, { 'Content/Music/Music_6.ogg': new Uint8Array([0xaa]) }) as unknown as BlobPart],
      'PackA.zip', { type: 'application/zip' }));
    const b = await mgr.importPack(new File(
      [packZip(0x22, { 'Content/Music/Music_6.ogg': new Uint8Array([0xbb]) }) as unknown as BlobPart],
      'PackB.zip', { type: 'application/zip' }));
    await mgr.setEnabled(a.id, true);
    await mgr.setEnabled(b.id, true);
    expect(musicPackOverride('Music_6')?.[0]).toBe(0xaa);   // 列表顶 a 胜
    await mgr.setEnabled(a.id, false);
    expect(musicPackOverride('Music_6')?.[0]).toBe(0xbb);   // 接棒
  });

  it('applyMusicPackOverrides 返回受影响键（新旧并集,供 Audio 驱逐面）', () => {
    applyMusicPackOverrides(new Map([['Music_1', new Uint8Array([1])]]));
    const affected = applyMusicPackOverrides(new Map([['Music_2', new Uint8Array([2])]]));
    expect(affected.sort()).toEqual(['Music_1', 'Music_2']);
  });

  it('音效覆盖回归不破： Sounds 族整表下发通道照旧', async () => {
    const mgr = new ResourcePackManager(makeRuntime(), new ResourcePackStore(makeStorage()));
    const r = await mgr.importPack(new File(
      [packZip(0x44, { 'Content/Sounds/Item_29.wav': new Uint8Array([9]) }) as unknown as BlobPart],
      'PackS.zip', { type: 'application/zip' }));
    await mgr.setEnabled(r.id, true);
    expect(sfxPackOverrideKeys()).toEqual(['Item_29']);
  });
});

// ---- Audio.ts 消费面结构锁（AudioSystem 构造含 rAF 循环,node 不可实例化,源锚代验）----
describe('SW-FX16 Audio 消费面结构锁', () => {
  it('buffer() 覆盖优先于网络 fetch,fetch 回落支保留', () => {
    expect(AUDIO_SRC).toContain('musicPackOverride(`Music_${id}`)');
    expect(AUDIO_SRC).toContain("fetch(`audios/music/Music_${id}.mp3`)");
  });
  it('模块装配面：audioInstances 注册 + setMusicOverrideListener 驱逐接线', () => {
    expect(AUDIO_SRC).toContain('setMusicOverrideListener(');
    expect(AUDIO_SRC).toContain('audioInstances.add(this)');
    expect(AUDIO_SRC).toContain('evictMusicBuffers');
  });
});
