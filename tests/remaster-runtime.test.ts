// 素材重制管线 M4:热补丁运行时(注入矩阵/派生失效回调/重放顺序)。
// SpriteAtlas/Arrow 均为真实模块,贴图解码注入 stub(node 无 Image/createImageBitmap)。
// 运行:npx vitest run tests/remaster-runtime.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RemasterRuntime } from '../src/remaster/RemasterRuntime';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import { projSprite } from '../src/entities/Arrow';
import { buildManifest } from '../src/remaster/PackFormat';
import type { LoadedPack } from '../src/remaster/types';

/** stub 解码源(每个文件一个假 img 对象,Map 存回便于断言) */
function makeStub(atlas: SpriteAtlas) {
  const decoded = new Map<string, unknown>();
  const decode = async (blob: Blob & { __file?: string }) => {
    const img = { __decoded: blob.__file ?? 'anon' } as unknown as ImageBitmap;
    decoded.set(String(blob.__file), img);
    return img;
  };
  const loadVanilla = async (file: string) => ({ __vanilla: file } as unknown as ImageBitmap);
  const rt = new RemasterRuntime(atlas, decode, loadVanilla);
  return { rt, decoded };
}

function makeAtlas(): SpriteAtlas {
  return { vimages: new Map(), uiimages: new Map() } as unknown as SpriteAtlas;
}

function makePack(files: string[]): LoadedPack {
  const manifest = buildManifest('测试', 'v1', {});
  const sheets = new Map<string, Blob>();
  for (const f of files) {
    const b = new Blob([new Uint8Array([1])]) as Blob & { __file?: string };
    b.__file = f;
    sheets.set(f, b);
  }
  return { id: 'p1', manifest, sheets };
}

describe('RemasterRuntime 注入矩阵', () => {
  it('vanilla→vimages / vanilla-ui→uiimages', async () => {
    const atlas = makeAtlas();
    const { rt } = makeStub(atlas);
    await rt.apply(makePack(['vanilla/NPC_1.png', 'vanilla-ui/logo_1.png']));
    expect(atlas.vimages.has('vanilla/NPC_1.png')).toBe(true);
    expect(atlas.uiimages.has('vanilla-ui/logo_1.png')).toBe(true);
  });
  it('tile/wall 触发 onSheetReplaced;NPC 不触发', async () => {
    const atlas = makeAtlas();
    const { rt } = makeStub(atlas);
    const replaced: string[] = [];
    rt.onSheetReplaced = (f) => replaced.push(f);
    await rt.apply(makePack(['vanilla/Tiles_0.png', 'vanilla/Wall_1.png', 'vanilla/NPC_1.png']));
    expect(replaced).toEqual(['vanilla/Tiles_0.png', 'vanilla/Wall_1.png']);
  });
  it('Projectile 双写:vimages + setProjSpriteOverride(Arrow 真实缓存)', async () => {
    const atlas = makeAtlas();
    const { rt } = makeStub(atlas);
    await rt.apply(makePack(['vanilla/Projectile_98.png']));
    expect(atlas.vimages.has('vanilla/Projectile_98.png')).toBe(true);
    expect(projSprite(98)).toBeTruthy();  // override 已写进 Arrow.spriteCache
  });
  it('坏包防线:全透明 sheet 拒绝注入(2026-08-19 武器/弹幕全隐形事件)', async () => {
    const atlas = makeAtlas();
    const decode = async (blob: Blob & { __file?: string }) =>
      ({ __decoded: blob.__file ?? 'anon' } as unknown as ImageBitmap);
    const loadVanilla = async () => null;
    // 探测 stub:Projectile_777 判为全透明,其余有内容
    const rt = new RemasterRuntime(atlas, decode, loadVanilla,
      (img) => String((img as { __decoded?: string }).__decoded) !== 'vanilla/Projectile_777.png');
    const r = await rt.apply(makePack(['vanilla/Projectile_777.png', 'vanilla/NPC_2.png']));
    expect(r.applied).toEqual(['vanilla/NPC_2.png']);
    expect(r.failed).toEqual([{ file: 'vanilla/Projectile_777.png', reason: expect.stringContaining('全透明') }]);
    expect(atlas.vimages.has('vanilla/Projectile_777.png')).toBe(false);
    expect(projSprite(777)).toBeFalsy();          // spriteCache 未被坏包污染
    expect(rt.rejectedBlank).toEqual(['vanilla/Projectile_777.png']);
    expect(rt.appliedFiles).toEqual(['vanilla/NPC_2.png']);
  });
  it('Buff 图标:buffIconUrl 可查;restoreVanilla 后清空', async () => {
    const atlas = makeAtlas();
    const { rt } = makeStub(atlas);
    await rt.apply(makePack(['vanilla/Buff_3.png']));
    expect(rt.buffIconUrl(3)).toBeTruthy();
    expect(rt.buffIconUrl(4)).toBeNull();
    await rt.restoreVanilla(['vanilla/Buff_3.png']);
    expect(rt.buffIconUrl(3)).toBeNull();
  });
  it('onApplied 事件:hasItemAtlas/tileWallSheets 元数据正确', async () => {
    const atlas = makeAtlas();
    const { rt } = makeStub(atlas);
    const infos: unknown[] = [];
    rt.onApplied = (i) => infos.push(i);
    await rt.apply(makePack(['vanilla/Item_Atlas_0.png', 'vanilla/Tiles_5.png']));
    expect(infos).toHaveLength(1);
    const info = infos[0] as { hasItemAtlas: boolean; tileWallSheets: string[]; files: string[] };
    expect(info.hasItemAtlas).toBe(true);
    expect(info.tileWallSheets).toEqual(['vanilla/Tiles_5.png']);
  });
  it('sw:remaster-applied DOM 事件(node 无 document 时跳过不炸)', async () => {
    const atlas = makeAtlas();
    const { rt } = makeStub(atlas);
    await expect(rt.apply(makePack(['vanilla/NPC_1.png']))).resolves.toBeTruthy();
  });
});

describe('restoreVanilla / 重放语义', () => {
  it('restore 回写原版源 + 弹幕 override 换回', async () => {
    const atlas = makeAtlas();
    const { rt } = makeStub(atlas);
    await rt.apply(makePack(['vanilla/Projectile_98.png', 'vanilla/NPC_1.png']));
    const overridden = atlas.vimages.get('vanilla/Projectile_98.png');
    await rt.restoreVanilla(['vanilla/Projectile_98.png', 'vanilla/NPC_1.png']);
    expect(atlas.vimages.get('vanilla/Projectile_98.png')).not.toBe(overridden);
    expect((projSprite(98) as unknown as { __vanilla: string }).__vanilla).toBe('vanilla/Projectile_98.png');
  });
  it('tile sheet restore 触发重烘回调', async () => {
    const atlas = makeAtlas();
    const { rt } = makeStub(atlas);
    const replaced: string[] = [];
    rt.onSheetReplaced = (f) => replaced.push(f);
    await rt.restoreVanilla(['vanilla/Tiles_7.png']);
    expect(replaced).toEqual(['vanilla/Tiles_7.png']);
  });
  it('decode 失败进 failed 不中断整包', async () => {
    const atlas = makeAtlas();
    const rt = new RemasterRuntime(
      atlas,
      async (blob: Blob & { __file?: string }) => {
        if (blob.__file === 'vanilla/NPC_2.png') throw new Error('boom');
        return { ok: blob.__file } as unknown as ImageBitmap;
      },
      async () => null,
    );
    const r = await rt.apply(makePack(['vanilla/NPC_1.png', 'vanilla/NPC_2.png']));
    expect(r.applied).toEqual(['vanilla/NPC_1.png']);
    expect(r.failed).toEqual([{ file: 'vanilla/NPC_2.png', reason: 'boom' }]);
  });
});
