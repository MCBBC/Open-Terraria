// ★30fps 刀1 texFromRegion 区域键归一锁（2026-10-05）。
// 定谳:er: 键坐标尾段含调用方原始小数（水面波相位条带 sh∈(0,1)——闪屏案
//  2026-09-30 ledger 实锤 `er:1974:0:0,0,34,<0..1>` 形态;遮蔽比例切分等同族）
//  → 同一逻辑区域每帧一个新键=每帧 miss+scratch 重绘+texImage2D 上传+
//  evictLRU 插入（LRU 满容=逐帧换页级联）。修=texRegionNormalize:窗整数化
//  (floor 锚/ceil 端最小覆盖超集)+er: 族键尾段按窗重写（id/epoch 段逐字
//  保留;非 er: 命名空间键原样）。语义判据=闪屏案判例「2D drawImage 亚像素
//  源=采样首行,1px 纹理同语义,视觉零差」:sh∈(0,1) 带恰映射单行 floor(sy);
//  活机 A/B(scripts/_erkey-semab.mjs)真水贴图表面带逐字节 0 差。
import { describe, expect, it } from 'vitest';
import { texRegionNormalize } from '../src/render/GLSpriteLayer';

const norm = (key: string, sx: number, sy: number, sw: number, sh: number) =>
  texRegionNormalize(key, sx, sy, sw, sh);

describe('texRegionNormalize（30fps 刀1 区域键归一）', () => {
  it('整数调用逐位恒等（sprite 帧面零改动快路径）', () => {
    const key = 'er:1974:0:0,116,40,58';
    expect(norm(key, 0, 116, 40, 58)).toEqual({ key, sx: 0, sy: 116, sw: 40, sh: 58 });
    // 非零锚整数同样恒等
    const k2 = 'er:10:2:0,58,40,58';
    expect(norm(k2, 0, 58, 40, 58)).toEqual({ key: k2, sx: 0, sy: 58, sw: 40, sh: 58 });
  });

  it('闪屏案形态 (0,0,34,0.52)：键尾归一 0,0,34,1（采样首行=单行窗,判例同窗）', () => {
    const n = norm('er:1974:0:0,0,34,0.52', 0, 0, 34, 0.52);
    expect(n.key).toBe('er:1974:0:0,0,34,1');
    expect(n).toMatchObject({ sx: 0, sy: 0, sw: 34, sh: 1 });
  });

  it('波相位带扫掠：sh∈(0,2) 连续相位 → 键收敛有界（≤3 个）且键无小数', () => {
    const keys = new Set<string>();
    for (let k = 0; k < 200; k++) {
      const sh = 0.01 + (k / 200) * 1.98;   // 0.01..1.99 连续相位
      // 键构造=真实调用方形态（模板串数字,无固定位小数）
      const n = norm(`er:1974:0:0,0,34,${sh}`, 0, 0, 34, sh);
      keys.add(n.key);
      expect(n.key).not.toContain('.');     // 键面零小数
      expect(n.sh).toBeGreaterThanOrEqual(1);
      expect(n.sh).toBe(Math.max(1, Math.ceil(sh)));
    }
    expect(keys.size).toBeLessThanOrEqual(3);   // 1px/2px 两窗(+整数直通)有界
  });

  it('覆盖性：分数矩形 ⊆ 整数窗;邻接子窗拼回父矩形零漏（瀑布遮蔽切分同构）', () => {
    // 单矩形覆盖
    const n = norm('er:5:0:0,10.3,16,5.4', 0, 10.3, 16, 5.4);
    expect([n.sx, n.sy, n.sw, n.sh]).toEqual([0, 10, 16, 6]);   // [10,15.7]⊆[10,16)
    // 邻接切分 [10,10.5)+[10.5,11) → 两子窗并=父窗 [10,11),无漏无越
    const a = norm('er:6:0:0,10,4,0.5', 0, 10, 4, 0.5);
    const b = norm('er:6:0:0,10.5,4,0.5', 0, 10.5, 4, 0.5);
    expect([a.sy, a.sh]).toEqual([10, 1]);
    expect([b.sy, b.sh]).toEqual([10, 1]);
    expect(a.sy + a.sh).toBeLessThanOrEqual(11);
    expect(b.sy + b.sh).toBeLessThanOrEqual(11);
    // 父矩形自身归一 ⊇ 两子窗并
    const p = norm('er:6:0:0,10,4,1', 0, 10, 4, 1);
    expect([p.sy, p.sh]).toEqual([10, 1]);
  });

  it('er: 键 id/epoch 段逐字保留（bumpTexEpoch 换键重传语义不变）', () => {
    // 四段式（shim resolveTex/gore 批:er:id:epoch:coords）
    expect(norm('er:1974:7:0,0,34,0.52', 0, 0, 34, 0.52).key).toBe('er:1974:7:0,0,34,1');
    // 三段式（VanillaLiquidRenderer 足迹:er:id:coords,无 epoch 段）
    expect(norm('er:5:10,20,30,0.5', 10, 20, 30, 0.5).key).toBe('er:5:10,20,30,1');
    // epoch bump → 键随 epoch 换（重传触发面保持）
    expect(norm('er:1974:8:0,0,34,0.52', 0, 0, 34, 0.52).key).toBe('er:1974:8:0,0,34,1');
  });

  it('非 er: 命名空间键原样保留（shineCell 内容指纹键不得重写）', () => {
    const fp = 'shineCell:3-5-7|frame2';
    const n = norm(fp, 0.4, 0, 40, 40);
    expect(n.key).toBe(fp);                                  // 键原样
    expect([n.sx, n.sy, n.sw, n.sh]).toEqual([0, 0, 41, 40]); // 窗仍整数化(覆盖端点 40.4→41)
    // 整数调用（shineCell 实况）键与窗全恒等
    const m = norm(fp, 0, 0, 40, 40);
    expect(m.key).toBe(fp);
    expect([m.sx, m.sy, m.sw, m.sh]).toEqual([0, 0, 40, 40]);
  });

  it('窗端点语义：ceil 端遇整数不外扩;max(1,·) 钳零长窗', () => {
    // 终点恰整数:ceil(11)=11 → 窗 [10,11) 不含 11 行
    expect(norm('er:1:0:0,10.48,4,0.52', 0, 10.48, 4, 0.52)).toMatchObject({ sy: 10, sh: 1 });
    // 极窄窗钳 ≥1
    expect(norm('er:1:0:0,5,4,0.01', 0, 5, 4, 0.01)).toMatchObject({ sy: 5, sh: 1 });
    expect(norm('er:1:0:0,5,0.01,4', 0, 5, 0.01, 4)).toMatchObject({ sx: 0, sw: 1 });
  });

  it('实现面锚：texFromRegion 消费归一口（键/窗/上传同源）', async () => {
    const src = await import('node:fs').then((m) =>
      m.readFileSync('src/render/GLSpriteLayer.ts', 'utf8'));
    // texFromRegion 体调用 texRegionNormalize 并以 n.* 绘 scratch/建键
    const body = src.split('texFromRegion(key: string')[1]?.split('private regScratch')[0] ?? '';
    expect(body).toContain('texRegionNormalize(key, sx, sy, sw, sh)');
    expect(body).toContain('this.texs.get(n.key)');
    expect(body).toContain('scx.drawImage(img as CanvasImageSource, n.sx, n.sy, n.sw, n.sh, 0, 0, n.sw, n.sh)');
    expect(body).toContain('this.texFromImage(n.key, sc, false, true)');
    // 命中判定走归一键（否则小数调用恒 miss）
    expect(body).not.toMatch(/this\.texs\.get\(key\)/);
  });
});
