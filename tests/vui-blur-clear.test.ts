// VUI 失焦清全套回归（SW-BA1 2026-09-06，镜像 Input.clearForBlur「失焦=无按住态」约定，
// RB2 A-5 同族）：旧版 blur 只清 leftDown——rightDown/rightPresses/rightReleases 残留
// =幽灵右键：失焦期松键收不到 mouseup，rightDown=true 一路残到下一次右键 down-up 对
// 才自愈；未消费的按下计数跨失焦也会在回焦首帧被当新沿消费。修=电平+计数全套归零。
// 判别力：删 clearForBlur 内任一归零行 → 对应用例变红（门测试学）。
import { describe, it, expect } from 'vitest';
import { VUI } from '../src/vui/VUI';

describe('VUI.clearForBlur：失焦=无按住态（SW-BA1）', () => {
  it('左键按住+未消费计数 → blur 全套清零', () => {
    (VUI as any).leftDown = true;
    (VUI as any).presses = 2;
    (VUI as any).releases = 1;
    VUI.clearForBlur();
    expect((VUI as any).leftDown).toBe(false);
    expect((VUI as any).presses).toBe(0);
    expect((VUI as any).releases).toBe(0);
    expect((VUI as any).hasFocus).toBe(false);
  });

  it('右键按住+未消费计数 → blur 清零（旧版残留=幽灵右键根因）', () => {
    (VUI as any).rightDown = true;
    (VUI as any).rightPresses = 1;
    (VUI as any).rightReleases = 3;
    VUI.clearForBlur();
    expect((VUI as any).rightDown).toBe(false);
    expect((VUI as any).rightPresses).toBe(0);
    expect((VUI as any).rightReleases).toBe(0);
  });

  it('幂等：连清两次无副作用', () => {
    VUI.clearForBlur();
    VUI.clearForBlur();
    expect((VUI as any).leftDown).toBe(false);
    expect((VUI as any).rightDown).toBe(false);
    expect((VUI as any).presses).toBe(0);
    expect((VUI as any).rightPresses).toBe(0);
    expect((VUI as any).releases).toBe(0);
    expect((VUI as any).rightReleases).toBe(0);
  });
});
