// ★BJ648 旗帜名条免光照迁层——架构断言 + 收集/flush 面锁。
// 定谳（debug-report 十周年纪念种子 18-11 + v18 探针昼夜 A/B）：住房旗帜 hover
// 名条（黑框 rgba(20,16,28,0.85)+白字 #E8E4F0）旧实现画在世界层内
// （drawHouseBanners,Renderer.ts:6585 调用域）,后续 compositeLight 光照乘把
// 框与字一起乘暗——清晨/夜晚旗区格光≈0 时整条名条隐入夜色（用户实报「文字
// 消失只剩背景黑矩形」;v18 实测 day 帧框字清晰/night 帧整条灭）。
// 原版本名条 = DrawInterface_7_TownNPCHouseBanners（Main.cs:46992）=接口层
// 【无光直绘】。落刀 = 名条收集面留在 drawHouseBanners（hover 命中门/FullName
// 语义不动）,绘制上收 flushBannerLabels（flushEntityHealthBars 之后屏空间直绘,
// 恒亮）;旗布本体仍世界层吃格光（:41467 原版同相）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('../src/render/Renderer.ts', import.meta.url)), 'utf8');

describe('BJ648 旗帜名条免光照迁层', () => {
  it('架构锁：drawHouseBanners 域内不再直接绘制名条黑框（rgba(20,16,28）', () => {
    // 截取 drawHouseBanners 函数体（到 flushBannerLabels 定义前）
    const start = SRC.indexOf('private drawHouseBanners');
    const end = SRC.indexOf('private flushBannerLabels');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = SRC.slice(start, end);
    expect(body).not.toMatch(/ctx\.fillStyle = 'rgba\(20,16,28/);  // 黑框绘制已迁出世界层
    expect(body).not.toMatch(/ctx\.fillText/);                     // fillText 亦迁出（旗布 drawImage/multiply 保留）
    expect(body).toContain('_bannerLabelPass.push');               // 收集面在位
  });

  it('flushBannerLabels：屏空间直绘在位（恒等变换/无光黑框白字/走 worldToScreen）', () => {
    const start = SRC.indexOf('private flushBannerLabels');
    expect(start).toBeGreaterThan(0);
    const body = SRC.slice(start, SRC.indexOf('\n  }', start));
    expect(body).toContain('setTransform(1, 0, 0, 1, 0, 0)');   // 恒等域（脱相机/光照）
    expect(body).toContain('worldToScreen');                    // 世界锚→屏
    expect(body).toContain('rgba(20,16,28,0.85)');              // 黑框（色值不变）
    expect(body).toContain('#E8E4F0');                          // 白字（色值不变）
    expect(body).toContain('measureText');                      // 屏空间量宽
  });

  it('调用序锁：flushBannerLabels 与 flushEntityHealthBars 同接口段相邻（滤镜链后）', () => {
    // ★位次债登记（BJ648）：原版 SetupDrawInterfaceLayers 表序 7 TownNPCHouseBanners
    // < 14 EntityHealthBars = 名条先画、血条盖之；盘上现实现 = 名条在血条后画
    // （名条反盖血条）——位次债由 BJ648 主刀会话定夺，本锁只钉「同段相邻」防漂移。
    const hb = SRC.indexOf('this.flushEntityHealthBars(hbPass, cam);');
    const bl = SRC.indexOf('this.flushBannerLabels(cam);');
    expect(hb).toBeGreaterThan(0);
    expect(bl).toBeGreaterThan(0);
    expect(Math.abs(hb - bl)).toBeLessThan(600); // 同接口段相邻（滤镜链后）
  });
});
