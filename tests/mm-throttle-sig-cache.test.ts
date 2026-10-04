// 小地图双面节流刀锁定（2026-10-04；WASM 双旗 trace 定谳：mmHudBlit 1080ms +
// drawHead 828ms 恒定 ~25ms/s = 与场景无关的每帧恒定成本）：
//  · mmHudBlit（HUD 缩略图合成：52k 像素循环+putImageData）→ 签名缓存门：键分量
//    全等 ⟺ 输出画布位级恒等 → 复用上帧画布。地图分量=【窗域】内容串号
//    （recentRepaintChunks ∩ 窗口才 +1）——全局 mapVersion 会被窗外 ambient
//    重画击穿（活机 90 帧归因：25% 帧窗外重画=白铺）。
//  · drawHead 静态头照（剪影烘焙/染发头带合成）→ 身份键持久缓存；位置 blit
//    【不】节流（NPC/玩家移动每帧反映——语义不变式）。
//  · 迷雾缓冲写入序号 fogBufSerial（实写才 +1）= 迷雾键分量。
// 语义不变式（每条锁都对应一面的失效模式）：
//  ① 静止场景 minimap 逐位不变（命中复用=零重铺）；
//  ② 玩家移动/NPC 移动/窗内地图变化/探索开雾 → 缓存立即击穿重铺（信息不陈旧）；
//  ③ 头像层恒逐帧位画（drawMapHeads 无门）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mmHudSigKey } from '../src/render/Renderer';
import { World } from '../src/world/World';
import { Minimap } from '../src/render/Renderer';

const ROOT = join(__dirname, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');

// ============ ①签名键判别面：任一分量变 → 键变（漏分量=陈旧 blit） ============
describe('mmHudSigKey 判别面（7 分量全差分）', () => {
  const base = [7, 100, 200, 229, 229, 42, 15] as const;
  const k = (a: number, b: number, c: number, d: number, e: number, f: number, g: number) =>
    mmHudSigKey(a, b, c, d, e, f, g);
  it('基线键稳定（同参同键——命中复用的前提）', () => {
    expect(k(...base)).toBe(k(...base));
    expect(typeof k(...base)).toBe('string');
  });
  it('uid 换（换世界新 Minimap 实例）→ 键变', () => {
    expect(k(8, base[1], base[2], base[3], base[4], base[5], base[6])).not.toBe(k(...base));
  });
  it('sx/sy 变（玩家跨格移动/边缘钳移窗）→ 键变', () => {
    expect(k(base[0], 101, base[2], base[3], base[4], base[5], base[6])).not.toBe(k(...base));
    expect(k(base[0], base[1], 201, base[3], base[4], base[5], base[6])).not.toBe(k(...base));
  });
  it('viewTiles/sizeI 变（缩放/抽样步长）→ 键变', () => {
    expect(mmHudSigKey(base[0], base[1], base[2], 230, base[4], base[5], base[6]))
      .not.toBe(mmHudSigKey(...base));
    expect(mmHudSigKey(base[0], base[1], base[2], base[3], 512, base[5], base[6]))
      .not.toBe(mmHudSigKey(...base));
  });
  it('winSerial 变（窗域地图内容实画）→ 键变', () => {
    expect(mmHudSigKey(base[0], base[1], base[2], base[3], base[4], 43, base[6]))
      .not.toBe(mmHudSigKey(...base));
  });
  it('fogKey 变（迷雾实写；-1=无迷雾缓冲）→ 键变', () => {
    expect(mmHudSigKey(base[0], base[1], base[2], base[3], base[4], base[5], 16))
      .not.toBe(mmHudSigKey(...base));
    expect(mmHudSigKey(base[0], base[1], base[2], base[3], base[4], base[5], -1))
      .not.toBe(mmHudSigKey(...base));
  });
});

// ============ ②窗域脏侧账语义（签名键地图分量契约） ============
// 判别面=【窗域】相交才击穿：远处 ambient 重画（液体沉降族）跳全局 mapVersion
// 但不进窗 → 静止窗零重铺。消费即清（与 flushedPixelRects 同惯例）。
describe('Minimap.recentRepaintChunks（窗域脏侧账契约）', () => {
  it('flushDirty 实画 chunk 入侧账；消化后不入（消费即清惯例）', () => {
    const w = new World(48, 130, 7, 'mm-sig');
    w.groundLevel = 40; w.rockLevel = 80;
    const mm = new Minimap(w, true);
    mm.redrawAll();
    expect(mm.recentRepaintOverflow).toBe(true);   // 全量重绘 → 强制击穿旗
    mm.recentRepaintOverflow = false;              // 模拟 mmHudBlit 消费
    mm.flushDirty();                               // 空集：零开销
    expect(mm.recentRepaintChunks.size).toBe(0);
    expect(mm.recentRepaintOverflow).toBe(false);
    w.store.setTile(3, 3, 2, 0);                   // 一格改动 → 一 chunk 脏
    mm.flushDirty();
    expect(mm.recentRepaintChunks.size).toBe(1);   // 实画 chunk 入侧账
    mm.recentRepaintChunks.clear();                // 消费
    mm.flushDirty();                               // 已消化：不再入账
    expect(mm.recentRepaintChunks.size).toBe(0);
  });
  it('redrawAll 全量重绘置 overflow 旗（否则全量重建期 HUD 冻结在旧像素）', () => {
    const w = new World(48, 130, 7, 'mm-sig3');
    w.groundLevel = 40; w.rockLevel = 80;
    const mm = new Minimap(w, true);
    mm.recentRepaintOverflow = false;
    mm.redrawAll();
    expect(mm.recentRepaintOverflow).toBe(true);
  });
  it('buildStriped 拆带逐带置 overflow 旗（拆带期 HUD 逐帧重铺=修前行为不回归）', async () => {
    const w = new World(48, 130, 7, 'mm-sig4');
    w.groundLevel = 40; w.rockLevel = 80;
    const mm = new Minimap(w, true);
    mm.recentRepaintOverflow = false;
    await mm.buildStriped();
    expect(mm.recentRepaintOverflow).toBe(true);   // 末带仍标记
  });
  it('dispose 清侧账（换世界零残留）', () => {
    const w = new World(48, 130, 7, 'mm-sig5');
    w.groundLevel = 40; w.rockLevel = 80;
    const mm = new Minimap(w, true);
    mm.recentRepaintChunks.add(42);
    mm.recentRepaintOverflow = true;
    mm.dispose();
    expect(mm.recentRepaintChunks.size).toBe(0);
    expect(mm.recentRepaintOverflow).toBe(false);
  });
});

// ============ ③结构锁：Renderer.ts 双面节流刀在位（回潮即红） ============
describe('mmHudBlit 签名门（结构锁）', () => {
  it('键=uid+窗口几何+窗域串号+fogBufSerial 全分量消费（漏分量回潮即红）', () => {
    expect(rendererSrc).toMatch(
      /const sig = mmHudSigKey\(mm\.uid, sx, sy, viewTiles, sizeI, this\._mmWinSerial,\s*\n\s*this\.fogP32 \? this\.fogBufSerial : -1\);/,
    );
  });
  it('窗域脏判定：∩窗口才升串号,消费即清;overflow 旗无条件击穿', () => {
    expect(rendererSrc).toMatch(
      /if \(mm\.recentRepaintOverflow\) \{ this\._mmWinSerial\+\+; mm\.recentRepaintOverflow = false; \}/,
    );
    expect(rendererSrc).toMatch(
      /if \(x0 < sx \+ viewTiles && x0 \+ CHUNK > sx && y0 < sy \+ viewTiles && y0 \+ CHUNK > sy\) \{\s*\n\s*this\._mmWinSerial\+\+;\s*\n\s*break;\s*\n\s*\}\s*\n\s*\}\s*\n\s*mm\.recentRepaintChunks\.clear\(\);/,
    );
  });
  it('全局 mapVersion 不再当 HUD 键分量（窗外 ambient 重画击穿回潮即红）', () => {
    expect(rendererSrc).not.toMatch(/mmHudSigKey\([^)]*mm\.mapVersion/);
  });
  it('命中复用上帧画布（hudRuns/hudHits 计数在位）', () => {
    expect(rendererSrc).toMatch(/if \(sig === this\._mmHudSig\) \{ this\.mmThrottle\.hudHits\+\+; return this\._mmHudCanvas; \}/);
    expect(rendererSrc).toMatch(/this\._mmHudSig = sig;\s*\n\s*this\.mmThrottle\.hudRuns\+\+;/);
  });
  it('调用点逐帧 drawImage 仍无条件（画布复用≠画布不画——主画布每帧全重绘）', () => {
    expect(rendererSrc).toMatch(
      /const hud = this\.mmHudBlit\(world, sx, sy, viewTiles\);\s*\n\s*if \(hud\) ctx\.drawImage\(hud, ox, oy, size, size\);/,
    );
  });
  it('头像层恒逐帧位画（drawMinimap 无门直调 drawMapHeads——NPC 移动每帧反映）', () => {
    expect(rendererSrc).toMatch(
      /this\.drawMapHeads\(ctx, player, Math\.min\(1, \(this\.minimapZoom \* 0\.25 \* 2 \+ 1\) \/ 3\) \* 1\.1,/,
    );
  });
  it('迷雾键分量：fogBufSerial 在 ensureFogData 两个实写点都升（增量脏盒+分带重建）', () => {
    expect(rendererSrc).toMatch(
      /this\.fogVersion = world\.exploredVersion;\s*\n\s*this\.fogBufSerial\+\+;\s*\/\/ 实写像素 → HUD blit 缓存键失效/,
    );
    expect(rendererSrc).toMatch(
      /if \(yEnd > rowStart\) this\.fogBufSerial\+\+;/,
    );
  });
  it('flushDirty 实画 chunk 入窗域侧账（上限 256 溢出置旗）', () => {
    expect(rendererSrc).toMatch(
      /this\.flushedPixelRects\.push\(\[x0, y0, CHUNK, CHUNK\]\);\s*\/\/ GL 地图纹理增量上传\s*\n\s*this\.recentRepaintChunks\.add\(k\);/,
    );
    expect(rendererSrc).toMatch(
      /if \(this\.recentRepaintChunks\.size > 256\) \{\s*\n\s*this\.recentRepaintChunks\.clear\(\);\s*\n\s*this\.recentRepaintOverflow = true;\s*\n\s*\}/,
    );
  });
  it('redrawAll/buildStriped 置 overflow 旗（全量重绘/拆带期零冻结）', () => {
    expect(rendererSrc).toMatch(
      /this\.fillBand\(0, this\.world\.h\);\s*\n\s*this\.dirtyChunks\.clear\(\);\s*\n\s*this\.recentRepaintOverflow = true;/,
    );
    expect(rendererSrc).toMatch(
      /this\.fillBand\(y0, Math\.min\(y0 \+ BAND, this\.world\.h\)\);\s*\n\s*this\.recentRepaintOverflow = true;/,
    );
  });
});

describe('drawHead 静态头照缓存（结构锁；位置 blit 不节流）', () => {
  it('剪影持久缓存在位（WeakMap(img 身份)+键命中早退+bake 计数）', () => {
    expect(rendererSrc).toMatch(
      /private mapHeadSilCache = new WeakMap<object, Map<string, HTMLCanvasElement>>\(\);[\s\S]*?const hit = bucket\.get\(key\);\s*\n\s*if \(hit\) \{ this\.mmThrottle\.silHits\+\+; return hit; \}/,
    );
    expect(rendererSrc).toMatch(/bucket\.set\(key, sc\);\s*\n\s*this\.mmThrottle\.silBakes\+\+;/);
  });
  it('旧双槽 scratch 退役（每帧 clearRect 重制+逐帧纹理重上传机制面清除）', () => {
    expect(rendererSrc).not.toMatch(/mapHeadSilScratch/);
  });
  it('染发头带持久缓存在位（配对刀——strip 仍 scratch=染发换色吃陈旧剪影）', () => {
    expect(rendererSrc).toMatch(
      /private headStripCache = new WeakMap<object, Map<string, HTMLCanvasElement>>\(\);[\s\S]*?const hit = bucket\.get\(key\);\s*\n\s*if \(hit\) \{ this\.mmThrottle\.stripHits\+\+; return hit; \}/,
    );
    expect(rendererSrc).not.toMatch(/headStripScratch/);
    expect(rendererSrc).toMatch(/bucket\.set\(key, strip\);\s*\n\s*this\.mmThrottle\.stripBakes\+\+;/);
  });
  it('旧带槽调用位退役（#000000,0 / opts.border,1）', () => {
    expect(rendererSrc).not.toMatch(/mapHeadSilhouette\([^)]*'#000000', 0\)/);
    expect(rendererSrc).not.toMatch(/mapHeadSilhouette\([^)]*opts\.border, 1\)/);
  });
});
