// 动态层"设备空间 doctrine"结构硬闸门（2026-09-02 训练假人隐形定谳后增设）:
//  凡绘制代码使用设备空间数学（dev.ox/dev.zz——dev={zz,ox,oy,camRX,camRY} 参数），
//  必须处于 ctx.setTransform(1,0,0,1,0,0)（恒等）武装态内；ctx.restore() 解除。
//  缺包装=设备坐标撞 ambient 世界变换 → 双重变换画屏外 → 静默隐形（无报错）。
//  出生案例：drawDummyTileAnim 抄了 drawAnimatedTileLayer 的数学漏抄空间包装，
//  训练假人 378/488 整体不可见（用户实报）。
//  机制：顺序状态机——恒等 setTransform=武装、restore=解除，dev 数学行未武装即红。
//  逃生门 ?dynsnap0/__SW_DYNSNAP_OFF 属运行时分支，静态面恒要求包装。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCES = [
  `${ROOT}/game/src/render/Renderer.ts`,
  `${ROOT}/game/src/render/VanillaTiler.ts`,
  `${ROOT}/game/src/render/TileAnim.ts`,
  `${ROOT}/game/src/render/WindSway.ts`,
  `${ROOT}/game/src/render/ChunkCache.ts`,
];
// 设备数学行标记:dev.ox / dev?.ox / dev!.ox 直引式 + const { zz, ox, ... } = dev 解构式
const DEV_MATH = /dev\??!?\.(ox|zz)\b|const\s*\{[^}]*\box\b[^}]*\}\s*=\s*dev\b/;
const ARM = /ctx\.setTransform\(1, 0, 0, 1, 0, 0\)/;
const DISARM = /ctx\.restore\(\)/;

/** 方法切片：`  private drawX(` 起到下一个同缩进方法声明（本文件方法全为 2 空格
 *  缩进 private，嵌套成员更深，边界稳定） */
function methodSlice(src: string, name: string): string {
  const start = src.indexOf(`  private ${name}(`);
  expect(start, `方法 ${name} 未找到`).toBeGreaterThan(-1);
  const next = src.indexOf('\n  private ', start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

describe('动态层设备空间 doctrine 结构闸门', () => {
  it('dev 数学行必须处于恒等 setTransform 武装态内（顺序状态机全文件扫描）', () => {
    const bad: string[] = [];
    for (const path of SOURCES) {
      let src: string;
      try { src = readFileSync(path, 'utf8'); } catch { continue; }
      const file = path.slice(path.lastIndexOf('/') + 1);
      let armed = false;
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const code = lines[i].replace(/\/\/.*$/, '');   // 去行注释
        if (ARM.test(code)) armed = true;
        if (DISARM.test(code)) armed = false;
        if (DEV_MATH.test(code) && !armed) {
          bad.push(`${file}:${i + 1} — dev 数学在恒等 setTransform 包装外`);
        }
      }
    }
    expect(bad.join('\n'), '设备空间数学缺空间包装（隐形画屏外类 bug）——包装 save+setTransform(恒等)…restore,或改世界坐标逆映射').toBe('');
  });

  it('doctrine 源 drawAnimatedTileLayer 必须保持包装范式（防 doctrine 本身被拆）', () => {
    const src = readFileSync(`${ROOT}/game/src/render/Renderer.ts`, 'utf8');
    const body = methodSlice(src, 'drawAnimatedTileLayer');
    expect(ARM.test(body), '缺恒等 setTransform').toBe(true);
    expect(DISARM.test(body), '缺 restore').toBe(true);
    expect(/devOn/.test(body), 'devOn 逃生门缺失(?dynsnap0/__SW_DYNSNAP_OFF)').toBe(true);
  });

  it('drawDummyTileAnim 必须沿用同一包装（本闸门的出生案例）', () => {
    const src = readFileSync(`${ROOT}/game/src/render/Renderer.ts`, 'utf8');
    const body = methodSlice(src, 'drawDummyTileAnim');
    expect(ARM.test(body), '缺恒等 setTransform').toBe(true);
    expect(DISARM.test(body), '缺 restore').toBe(true);
  });

  it('烘焙跳过表 ↔ 动态消费表双向闭合（跳过无消费=隐形,消费无跳过=重影）', () => {
    // ★X2 重锚（2026-10-01）:C4 烘焙 Worker 化（77163898,2026-09-28）——烘焙内核
    //  （bakeChunkInto/bakeChunkBody+跳过表）整体迁出至 ChunkBake.ts（主线程/worker
    //  同一函数对象,wbake-* 把门）;ChunkCache 保留 isDynamicAnimSheet 消费（动画格
    //  census）。跳过表读取面随迁,消费侧锚不变。
    const chunk = readFileSync(`${ROOT}/game/src/render/ChunkCache.ts`, 'utf8');
    const bake = readFileSync(`${ROOT}/game/src/render/ChunkBake.ts`, 'utf8');
    const renderer = readFileSync(`${ROOT}/game/src/render/Renderer.ts`, 'utf8');
    const tileAnim = readFileSync(`${ROOT}/game/src/render/TileAnim.ts`, 'utf8');
    const windSway = readFileSync(`${ROOT}/game/src/render/WindSway.ts`, 'utf8');
    // 正向:显式字面量跳过族必须有活消费方
    //  378 → drawDummyTileAnim(vframeAt(378);272 → drawAnimatedTileLayer(TILE_ANIM_RATE[272])
    expect(bake.match(/if \(sheet === 378\) continue;/) ?? bake.match(/vanilla\?\.sheet === 378\) continue;/),
      '378 跳过点丢失').toBeTruthy();
    expect(/vframeAt\(378,/.test(renderer), '378 无动态消费方(drawDummyTileAnim)').toBe(true);
    expect(bake.includes('vanilla?.sheet === 272') || bake.includes('sheet === 272'),
      '272 跳过点丢失').toBeTruthy();
    expect(/TILE_ANIM_RATE\[272\]|\b272\b/.test(tileAnim), '272 无动态消费方').toBe(true);
    // 谓词族:swayBakeSkip/cageFamilyOf/isDynamicAnimSheet 的 skip 与消费必须同存
    //  （skip 消费面=ChunkBake 烘焙侧;isDynamicAnimSheet 在 ChunkCache census 支仍在）
    for (const [pred, skipFile, consumerFile, consumerMark] of [
      ['swayBakeSkip', bake, windSway, 'drawWindSwayTiles'],
      ['isDynamicAnimSheet', bake, tileAnim, 'TILE_ANIM_RATE'],
      ['isDynamicAnimSheet', chunk, tileAnim, 'TILE_ANIM_RATE'],
    ] as const) {
      expect(skipFile.includes(pred), `${pred} 跳过点丢失`).toBe(true);
      expect(consumerFile.includes(pred) || consumerMark && consumerFile.includes(consumerMark),
        `${pred} 无动态消费方`).toBe(true);
    }
    // 反向:378/272 若从跳过表移除会双画(烘焙静止行+动态层=同朝向重影,2026-08-23 实报)
    expect((bake.match(/sheet === 378/g) ?? []).length, '378 跳过应恰有两处(两遍扫描)').toBeGreaterThanOrEqual(2);
  });
});
