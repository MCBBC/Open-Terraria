// ★R3b-3 波场 f32 逃生粘滞解除（2026-09-27 红蓝批 β）。
// 定谳:量化不变式破坏一次（k/256 外值）→ _dF32Escape 恒真 → exportFieldDelta
// 永远走 f32 全量 8B/格（124MB/s 级带宽）;换档/resync/锚帧均不清 sticky,
// _dViolate 里 _dFrame=0 还使周期锚失效=无任何自愈路径。
// 修复:escape 激活期每 WW_ESCAPE_PROBE_EVERY 帧试一次 _dFullBytes（自带逐格
// 不变式复核）,成功=场回到可量化域 → 清 sticky+重置锚+影子对齐,恢复 delta;
// forceFull（换档/resync）帧立即试。
//
// 判别器（红绿）:注入破坏 → sticky → 【修复场源】→ 旧码此后恒 f32（红）/
// 新码探针帧返回 fmt:'full' 且后续回 delta 模式（绿）。
import { describe, expect, it } from 'vitest';
import { waterWaves, WW_ESCAPE_PROBE_EVERY, type WWFieldMsg } from '../src/render/WaterWaves';

const W = 8, H = 8, N = W * H;

/** 装配可量化场（0.5 → k=128 精确）+清影子（下帧必走全量锚） */
function setCleanField(): void {
  const w = waterWaves as unknown as Record<string, unknown>;
  w._R = new Float32Array(N).fill(0.5);
  w._G = new Float32Array(N).fill(0.5);
  w._gW = W; w._gH = H;
  w._dShR = new Float32Array(0);
  w._dShG = new Float32Array(0);
  w._dFrame = 0;
}

function field(): Record<string, unknown> {
  return waterWaves as unknown as Record<string, unknown>;
}

describe('R3b-3 ① sticky 注入→探针帧恢复 delta（红绿判别器）', () => {
  it('破坏一次恒 f32（旧码）;修复源后探针帧回 full→delta（新码）', () => {
    const w = field();
    setCleanField();
    // 注入破坏:0.501×256=128.256 非整 → _dFullBytes null → _dViolate → sticky
    (w._R as Float32Array)[3] = 0.501;
    w._dF32Escape = false;
    const m1 = waterWaves.exportFieldDelta(false) as WWFieldMsg;
    expect(m1.fmt).toBe('f32');
    expect(w._dF32Escape).toBe(true);
    // 旧码行为锚:sticky 后逐帧恒 f32（新码在探针帧前同样 f32——节流窗内）
    for (let i = 0; i < 3; i++) {
      expect((waterWaves.exportFieldDelta(false) as WWFieldMsg).fmt).toBe('f32');
    }
    // 【修复场源】回到可量化域
    (w._R as Float32Array)[3] = 0.5;
    // 探针节流窗内（未到期）仍 f32
    expect((waterWaves.exportFieldDelta(false) as WWFieldMsg).fmt).toBe('f32');
    // 推进到探针帧:第 WW_ESCAPE_PROBE_EVERY 次调用试恢复（本帧前已耗 4 拍）
    let recovered: WWFieldMsg | null = null;
    for (let i = 0; i < WW_ESCAPE_PROBE_EVERY; i++) {
      const m = waterWaves.exportFieldDelta(false) as WWFieldMsg;
      if (m.fmt !== 'f32') { recovered = m; break; }
    }
    expect(recovered).not.toBeNull();
    expect(recovered!.fmt).toBe('full');       // 探针成功=全量字节锚
    expect(w._dF32Escape).toBe(false);         // sticky 清除
    // 后续帧回 delta 模式（影子已对齐=零差帧出零跨度 delta）
    const after = waterWaves.exportFieldDelta(false) as WWFieldMsg;
    expect(after.fmt).toBe('delta');
  });
});

describe('R3b-3 ② forceFull（换档/resync）帧立即试恢复', () => {
  it('sticky 中 forceFull=true 且场可量化 → 当帧 full+清 sticky', () => {
    const w = field();
    setCleanField();
    w._dF32Escape = true;                       // 直接待恢复态
    const m = waterWaves.exportFieldDelta(true) as WWFieldMsg;
    expect(m.fmt).toBe('full');
    expect(w._dF32Escape).toBe(false);
    expect((waterWaves.exportFieldDelta(false) as WWFieldMsg).fmt).toBe('delta');
  });
});

describe('R3b-3 ③ 恢复后再破坏→再粘→再恢复（探针可重入）', () => {
  it('两轮破坏恢复循环均自愈', () => {
    const w = field();
    for (let round = 0; round < 2; round++) {
      setCleanField();
      (w._R as Float32Array)[round] = 0.5 + 0.001 * (round + 1);   // 破坏
      expect((waterWaves.exportFieldDelta(false) as WWFieldMsg).fmt).toBe('f32');
      expect(w._dF32Escape).toBe(true);
      (w._R as Float32Array)[round] = 0.5;                        // 修复
      let ok = false;
      for (let i = 0; i < WW_ESCAPE_PROBE_EVERY + 1; i++) {
        if ((waterWaves.exportFieldDelta(false) as WWFieldMsg).fmt === 'full') { ok = true; break; }
      }
      expect(ok).toBe(true);
      expect(w._dF32Escape).toBe(false);
    }
  });
});
