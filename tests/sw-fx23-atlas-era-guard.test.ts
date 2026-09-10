import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// ★SW-FX23（2026-09-10）：vanilla-atlas.mjs 追加时代守卫——同族全量重跑事故已四发
// （8/21、8/23 0042c846、09-10 15:41 与 17:44,FX22 定谳=键序洗牌→golden/SW 缓存链
// /追加语义全破+:449 静默丢散件键）。守卫=检测到 vanilla.json 含 Item_Atlas_2/3 页
// 引用即拒绝(exit 1)+指引走 atlas-append-1457 通道。

const SCRIPT = join(process.cwd(), 'scripts', 'vanilla-atlas.mjs');

describe('vanilla-atlas 追加时代守卫（SW-FX23）', () => {
  it('行为面:追加时代下默认运行被拒（exit 1+指引走追加通道）,零写盘', () => {
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('拒绝全量重写');
    expect(r.stderr).toContain('Item_Atlas_2/3');
    expect(r.stderr).toContain('atlas-append-1457.mjs');
    expect(r.stderr).toContain('--force-full');
  });

  it('结构锁:守卫块内零写盘(拒绝路径的结构前提)+force-full 逃生门在位', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const guardStart = src.indexOf('追加时代守卫');
    const guardEnd = src.indexOf('process.exit(1)', guardStart);
    expect(guardStart).toBeGreaterThan(-1);
    expect(guardEnd).toBeGreaterThan(guardStart);
    const guardBlock = src.slice(guardStart, guardEnd);
    expect(guardBlock).not.toContain('writeFileSync(');   // 拒绝路径零写盘
    expect(src).toContain('--force-full');
    // 守卫探测式=引用 Atlas_2/3 页（追加时代判据,与 49+3 件在册锚同源）
    expect(src).toMatch(/Item_Atlas_\[23\]\\\.png/);
  });

  // ★SW-RB12c（2026-09-10）:--force-full 单旗误触防线——追加时代下原地强推须双旗
  // --force-full --overwrite-append-era;单旗仍拒（清空产物后的全量重建不经守卫,不受影响）。
  it('行为面:--force-full 单旗在追加时代仍被拒（双旗第二键 --overwrite-append-era 在位）,零写盘', () => {
    const r = spawnSync('node', [SCRIPT, '--force-full'], { cwd: process.cwd(), encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--overwrite-append-era');
    expect(r.stderr).toContain('拒绝全量重写');
  });

  // ★SW-RB12c:--index-only = FX23 退役自动通道后的索引再生唯一入口——守卫豁免 +
  // 零图集写盘（vanilla.json/vanilla-ui.json/Atlas 页字节不动;assets-index.json 例外
  // 本身就是它的产物,测后按字节还原防 git 噪声）。
  it('行为面:--index-only 守卫豁免+零图集写盘,索引重产', () => {
    const digest = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
    const atlasSnap = ['vanilla.json', 'vanilla-ui.json', 'vanilla/Item_Atlas_0.png', 'vanilla/Item_Atlas_1.png',
      'vanilla/Item_Atlas_2.png', 'vanilla/Item_Atlas_3.png'].map((p) => [p, digest(join(process.cwd(), 'public/sprites', p))]);
    const idxPath = join(process.cwd(), 'public', 'assets-index.json');
    const idxBefore = readFileSync(idxPath);
    const r = spawnSync('node', [SCRIPT, '--index-only'], { cwd: process.cwd(), encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('assets-index:');
    for (const [p, md5] of atlasSnap) expect(digest(join(process.cwd(), 'public/sprites', p)), p).toBe(md5);
    const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
    expect(Array.isArray(idx.sounds)).toBe(true);
    expect(idx.sounds.length).toBeGreaterThan(0);
    expect(idx.sounds.some((s: string) => s.endsWith('.opus'))).toBe(true);   // opus 时代枚举不被 .wav-only 清空
    writeFileSync(idxPath, idxBefore);   // 按字节还原,测试零残留
  });
});

// ★SW-RB12c（2026-09-10,FX22 UI_Camera 定谳延伸）:vanilla-ui.json 的 vui 消费面
// 关键键在册锁。vui() 无直连路径回退（SpriteAtlas.vui:json miss=恒 null）,这批键
// 不在生成器白名单里、靠 bulk 拷贝或手修落册——8/25 手修 8 件 Camera 后,9/10 两发
// 全量重跑各丢一次。任何再生成丢键立即在此爆红。
describe('vanilla-ui vui 消费面关键键在册（SW-RB12c）', () => {
  const ui = JSON.parse(readFileSync(join(process.cwd(), 'public', 'sprites', 'vanilla-ui.json'), 'utf8')) as { files: Record<string, string> };
  const REQUIRED = [
    ...Array.from({ length: 8 }, (_, i) => `UI_Camera_${i}.png`),   // CaptureMode.ts:1129 相机图标
    ...Array.from({ length: 42 }, (_, i) => `MapBG${i + 1}.png`),   // 全屏地图背景族
    'Map.png', 'UI_MapPing.png', 'UI_Radial.png', 'UI_UI_BossBar.png',
    'UI_Cursor_4.png', 'UI_Cursor_5.png',
    'Inventory_Back.png', 'Inventory_Back2.png', 'Inventory_Back13.png', 'Inventory_Back14.png',
    'Extra_182.png',
  ];
  it('vui() 无回退,键缺失=功能整哑——逐键在册', () => {
    const missing = REQUIRED.filter((k) => !ui.files[k]);
    expect(missing).toEqual([]);
  });
});
