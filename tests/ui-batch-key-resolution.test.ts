// ensureUiBatch 清单键→磁盘路径解析回归(2026-08-26 用户实报"发型列表等 904 个
// 404 才渲染"):入参是 vanilla-ui.json 清单键('Player_Hair_5.png'),必须先经
// uiFiles 解析成磁盘路径('vanilla-ui/Player_Hair_5.png')再加载——曾把键当路径
// 直发(sprites/Player_Hair_5.png 缺 vanilla-ui/ 前缀)→ 452 键全 404 且 SW 对
// 404 不缓存,开面板两波 904 个往返跑完才开始烘焙。
import { describe, it, expect } from 'vitest';
import { SpriteAtlas } from '../src/assets/SpriteAtlas';

/** 桩 Image:记录 src,赋 src 即同步 onerror——ensureUiImage 的失败路径立即
 *  落 _uiFailed TTL,waitUi 马上 settle false 不悬挂;本测试只认请求路径 */
function stubImage(): { srcs: string[]; restore: () => void } {
  const srcs: string[] = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(v: string) { srcs.push(v); this.onerror?.(); }
    get src(): string { return ''; }
  }
  const g = globalThis as unknown as { Image?: new () => HTMLImageElement };
  const prev = g.Image;
  g.Image = FakeImage as unknown as new () => HTMLImageElement;
  return {
    srcs,
    restore: () => { g.Image = prev; },
  };
}

describe('ensureUiBatch 清单键解析', () => {
  it('清单键解析成 vanilla-ui/ 磁盘路径(缺前缀=904×404 案)', async () => {
    const atlas = new SpriteAtlas();
    const { srcs, restore } = stubImage();
    try {
      await atlas.ensureUiBatch(['Player_Hair_5.png', 'Player_HairAlt_5.png', 'Player_0_0.png']);
      expect(srcs).toEqual([
        'sprites/vanilla-ui/Player_Hair_5.png',
        'sprites/vanilla-ui/Player_HairAlt_5.png',
        'sprites/vanilla-ui/Player_0_0.png',
      ]);
    } finally { restore(); }
  });

  it('无 .png 后缀自动补齐再解析;清单外入参按路径直用(逃生门)', async () => {
    const atlas = new SpriteAtlas();
    const { srcs, restore } = stubImage();
    try {
      await atlas.ensureUiBatch(['Player_Hair_5', 'vanilla-ui/Player_0_0.png']);
      expect(srcs).toEqual([
        'sprites/vanilla-ui/Player_Hair_5.png',
        'sprites/vanilla-ui/Player_0_0.png',
      ]);
    } finally { restore(); }
  });
});
