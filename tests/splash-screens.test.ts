// SplashScreens 素材加载确认（任务 2 的"3 行加载测试"落点）。
// 原版用法（AssetInitializer.cs:81-92 / Main.cs:51908+ DrawSplash）——这些是【启动加载
// 画面】素材，不是主菜单背景轮播：
//   - Splash_1            → SplashTexture16x9（BlackFadeIn 淡入贴图，Main.cs:61869）
//   - Splash_{1..10}_{0,1,2} → LegoBack/LegoTree/LegoFront 三件套，每次启动
//                             UnifiedRandom.Next(1,11) 随机选一组（:86-89）
//   - ResonanceArray      → SplashTextureLegoResonanace（:85）
//   - Splash_0            → 原版代码零引用（全仓 grep 仅 tsv 列表），仅素材在包
// 主菜单背景 = 森林视差（DrawSurfaceBG_Forest，仓库 MenuBackground.ts 1:1），不用这些图。
// 启动画面本体（DrawSplash 渐隐时序 + LoadingSunflower）未实装 → 登记项，本测试只锁素材可用。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

/** PNG IHDR 宽高（字节 16/20，big-endian）——无解码器的"可加载"校验 */
function pngSize(f: string): [number, number] {
  const d = readFileSync(f);
  expect(d.subarray(1, 4).toString('ascii'), f).toBe('PNG');
  return [d.readUInt32BE(16), d.readUInt32BE(20)];
}

describe('SplashScreens 素材可加载', () => {
  it('原版引用的 32 张全部存在且为有效 PNG（Splash_1 + ResonanceArray + 10 组三件套）', () => {
    const names = ['Splash_1', 'ResonanceArray'];
    for (let n = 1; n <= 10; n++) for (let p = 0; p < 3; p++) names.push(`Splash_${n}_${p}`);
    expect(names).toHaveLength(32);
    for (const n of names) {
      const f = `public/sprites/vanilla/${n}.png`;
      expect(existsSync(f), f).toBe(true);
      const [w, h] = pngSize(f);
      expect(w, f).toBeGreaterThan(0);
      expect(h, f).toBeGreaterThan(0);
    }
  });

  it('三件套分层尺寸符合 DrawSplash 铺法（Back/Front 全幅 1920×1080，Tree 512×512 精灵）', () => {
    for (let n = 1; n <= 10; n++) {
      expect(pngSize(`public/sprites/vanilla/Splash_${n}_0.png`), `Splash_${n}_0`).toEqual([1920, 1080]);
      expect(pngSize(`public/sprites/vanilla/Splash_${n}_1.png`), `Splash_${n}_1`).toEqual([512, 512]);
      expect(pngSize(`public/sprites/vanilla/Splash_${n}_2.png`), `Splash_${n}_2`).toEqual([1920, 1080]);
    }
  });
});
