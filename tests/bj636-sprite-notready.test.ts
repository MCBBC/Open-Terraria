// BJ636「一进游戏所有怪物透明,刷新重进自愈」(2026-10-11 线上实报)定谳三闸。
//
// 机制链(物证:prune-dist.mjs 裁 dist/sprites/vanilla 全部散件;sw.js:18 HAR 实证
// 散件直连网络收 SPA fallback HTML;SpriteAtlas.vnpc→ensureVImage 首遇懒加载 +
// _vImageFailed 10s 冷却;Renderer.drawEnemy `if (r)` null=跳画):
//   发布形态散件字节只在 SW 缓存(zip 暖存直写) → SW 未接管(首访空窗)或缓存缺件
//   (warm 未完成/清空/legacy 回退未暖)时普通怪 NPC_{id}.png fetch 全 404 →
//   vnpc 恒 null(10s 冷却循环) → drawEnemy 跳画 = 全体怪物透明;刷新重进后 SW
//   已接管+缓存命中 = 全体自愈(用户实报形态 1:1)。
// 修复:preloadMiscAndNpcs(world 进场门槛 await 面)与 worldWarmUrls(legacy 逐文件
//   warm 清单)双源补 NPC 主表全集(vanilla-npcs.json 696 键,~4.6MB)。
//
// 三闸:
//   ①渲染面 not-ready 语义锁 —— vnpc not-ready=null(=drawEnemy 跳画窗,即透明窗
//     的渲染面语义)、就绪即自愈(页面内等价"刷新重进后好了")、404 冷却 10s TTL
//     语义(冷却内零重发/过期恢复重试)。
//   ②暖存清单锁 —— worldWarmUrls 与 preloadMiscAndNpcs 双清单含 NPC 主表全集
//     (变异判别:摘除任一清单的 NPC 全集追加行 → 本 describe 恰红)。
//   ③竞态窗重建锁 —— 未预载会话(vimages 空)=透明窗(vnpc null);进世界门槛预载
//     跑完(preloadMiscAndNpcs await 面落表)=全部 696 id 零透明。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SpriteAtlas } from '../src/assets/SpriteAtlas';
import { worldWarmUrls, priorityPlan } from '../src/net/AssetCache';
import vanillaNpcsJson from '../public/sprites/vanilla-npcs.json';

const NPC_IDS = Object.keys(vanillaNpcsJson as Record<string, unknown>);

/** 桩 Image:不自动 onload/onerror,由测试逐只控制;捕获每只实例与 src。
 *  (ensureVImage/preloadFiles 在 node 无 Image 会 ReferenceError——ui-batch
 *  key-resolution.test.ts 同款注入,此处只多"手动触发事件"能力) */
function stubImage(): { created: Array<{ _src: string; onload: (() => void) | null; onerror: (() => void) | null }>; restore: () => void } {
  const created: Array<{ _src: string; onload: (() => void) | null; onerror: (() => void) | null }> = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    _src = '';
    width = 32;
    height = 64;   // 惰性固定形状:帧条高 64
    set src(v: string) { this._src = v; created.push(this); }
    get src(): string { return this._src; }
  }
  const g = globalThis as unknown as { Image?: new () => unknown };
  const prev = g.Image;
  g.Image = FakeImage as unknown as new () => unknown;
  return { created, restore: () => { g.Image = prev; } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('①渲染面 not-ready 语义锁(vnpc/ensureVImage/vImageFailed)', () => {
  it('not-ready=发起懒加载+返回 null(drawEnemy 跳画=透明窗语义)', () => {
    const atlas = new SpriteAtlas();
    const { restore } = stubImage();
    try {
      // 1=蓝史莱姆:vanilla.json npcs 20 条登记表之外 → vnpc 懒加载路径
      expect(atlas.vnpc(1, 0)).toBeNull();
      expect(atlas.vnpc(3, 0)).toBeNull();   // 僵尸同族
    } finally { restore(); }
  });

  it('就绪即自愈:表落 vimages 后 vnpc 出帧(sx/sy/sw/sh 正确)——"刷新重进后好了"的页面内等价', () => {
    const atlas = new SpriteAtlas();
    const img = { width: 32, height: 64 } as unknown as HTMLImageElement;
    atlas.vimages.set('vanilla/NPC_1.png', img);   // 蓝史莱姆 frames=2
    const r0 = atlas.vnpc(1, 0);
    expect(r0).not.toBeNull();
    expect(r0!.sw).toBe(32);
    expect(r0!.sh).toBe(32);     // floor(64/2)=32
    expect(r0!.sy).toBe(0);
    const r1 = atlas.vnpc(1, 1);
    expect(r1!.sy).toBe(32);     // 纵向帧条 idx×frameH
  });

  it('404 冷却 10s TTL:冷却内零重发恒 null,过期恢复重试路径', () => {
    const atlas = new SpriteAtlas();
    const { created, restore } = stubImage();
    try {
      expect(atlas.vnpc(3, 0)).toBeNull();          // 首遇发起
      const img = created[created.length - 1]!;
      expect(img._src).toBe('sprites/vanilla/NPC_3.png');
      img.onerror?.();                              // 模拟线上散件 404(SW 空窗/缺件)
      expect(atlas.vImageFailed('vanilla/NPC_3.png')).toBe(true);
      const n = created.length;
      expect(atlas.vnpc(3, 0)).toBeNull();          // 冷却内早退
      expect(created.length).toBe(n);               // 零新请求(10s 冷却=重试节流面)
      // 过期:performance 基准回拨 10s+1ms → 恢复可重试
      (atlas as unknown as { _vImageFailed: Map<string, number> })._vImageFailed
        .set('vanilla/NPC_3.png', performance.now() - 10_001);
      expect(atlas.vImageFailed('vanilla/NPC_3.png')).toBe(false);
      expect(atlas.vnpc(3, 0)).toBeNull();          // 重试仍 null(测试桩不 onload)
      expect(created.length).toBe(n + 1);           // 但请求重发了
    } finally { restore(); }
  });
});

describe('②暖存清单锁(NPC 主表全集 696 双源)', () => {
  it('worldWarmUrls 含全部 NPC_{id}.png(legacy 逐文件 warm 回退会话覆盖面)', () => {
    const urls = new Set(worldWarmUrls());
    for (const id of NPC_IDS) {
      expect(urls.has(`sprites/vanilla/NPC_${id}.png`)).toBe(true);
    }
    // 抽样:普通怪此前不在任何 warm 清单
    expect(urls.has('sprites/vanilla/NPC_1.png')).toBe(true);
    expect(urls.has('sprites/vanilla/NPC_3.png')).toBe(true);
  });

  it('priorityPlan 新增项仍过五目录超集闸(不破坏 pack 对账)', () => {
    const dirs = ['fonts/', 'sprites/vanilla-ui/', 'sprites/vanilla/', 'sounds/', 'audios/music/'];
    for (const u of priorityPlan().urls) {
      if (u.startsWith('l10n/')) continue;
      expect(dirs.some((d) => u.startsWith(d)), `无目录可承载 ${u}`).toBe(true);
    }
  });

  it('preloadMiscAndNpcs 清单含全部 NPC_{id}.png(进世界门槛 await 面)', async () => {
    const atlas = new SpriteAtlas();
    const got: string[][] = [];
    vi.spyOn(atlas, 'preloadFiles').mockImplementation(async (files) => {
      got.push([...files]);
    });
    await atlas.preloadMiscAndNpcs();
    const list = new Set(got.flat());
    for (const id of NPC_IDS) {
      expect(list.has(`vanilla/NPC_${id}.png`)).toBe(true);
    }
    // misc 与登记 20 表仍在(旧面零回退)
    expect(list.size).toBeGreaterThan(NPC_IDS.length + 10);
  });
});

describe('③竞态窗重建锁', () => {
  it('未预载会话(修复前实况):vimages 空 → 全 id vnpc null=全体怪物透明窗', () => {
    const atlas = new SpriteAtlas();
    const { restore } = stubImage();   // 桩不发 onload——懒加载永不到位
    try {
      for (const id of ['1', '3', '32', '200', '577']) {
        expect(atlas.vnpc(Number(id), 0)).toBeNull();
      }
    } finally { restore(); }
  });

  it('进世界门槛预载跑完:696 id 全量 vnpc 非 null=零透明窗', async () => {
    const atlas = new SpriteAtlas();
    const { restore } = stubImage();
    try {
      // 模拟 preloadSceneAssets await 面完成:清单全量落表(就绪语义)
      vi.spyOn(atlas, 'preloadFiles').mockImplementation(async (files) => {
        for (const f of files) {
          atlas.vimages.set(f, { width: 32, height: 64 } as unknown as HTMLImageElement);
        }
      });
      await atlas.preloadMiscAndNpcs();
      for (const id of NPC_IDS) {
        expect(atlas.vnpc(Number(id), 0)).not.toBeNull();
      }
    } finally { restore(); }
  });
});
