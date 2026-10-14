// ★InfoDisplay 域守卫(2026-10-14):mod 信息栏行——注册/逐帧解析/行追加/哨兵。
//   锚:infoDisplay(resolveModInfoLines/appendModInfoRows)/stats/InfoAccs
//   buildInfoAccRows 尾追加(icon=-1/hideIndex=-1 双哨兵)。
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(async () => {
  const { _resetModInfoDisplaysForTests } = await import('../src/mods/infoDisplay');
  _resetModInfoDisplaysForTests();
});

describe('InfoDisplay 域:mod 信息栏行', () => {
  it('注册/解析/追加全链(update null=省行;gold 透传)', async () => {
    const { registerModInfoDisplay, resolveModInfoLines, appendModInfoRows, hasModInfoDisplays } =
      await import('../src/mods/infoDisplay');
    expect(hasModInfoDisplays()).toBe(false);
    registerModInfoDisplay('mod_x_rage', {
      label: '怒气', gold: true,
      update: (game) => ((game as { rage?: number }).rage ?? 0) > 0 ? `怒气 ${(game as { rage?: number }).rage}` : null,
    });
    registerModInfoDisplay('mod_x_static', { label: '常驻', update: () => '常驻文本' });
    expect(() => registerModInfoDisplay('mod_x_rage', { label: '重复', update: () => '' })).toThrow(/重复注册/);

    const rows: Array<Record<string, unknown>> = [];
    const push = (r: Record<string, unknown>) => rows.push(r);
    // 帧1:rage=0 → 省行;static 在
    resolveModInfoLines({ rage: 0 });
    appendModInfoRows([], push);
    expect(rows).toHaveLength(1);
    expect([rows[0]!.icon, rows[0]!.hideIndex, rows[0]!.text, rows[0]!.label]).toEqual([-1, -1, '常驻文本', '常驻']);
    // 帧2:rage>0 → 两行,gold 透传
    resolveModInfoLines({ rage: 42 });
    appendModInfoRows([], push);
    expect(rows).toHaveLength(3);
    expect([rows[1]!.text, rows[1]!.gold]).toEqual(['怒气 42', true]);
  });

  it('buildInfoAccRows 追加段:原版域零扰动+哨兵行入列', async () => {
    const { buildInfoAccRows } = await import('../src/stats/InfoAccs');
    const { registerModInfoDisplay, resolveModInfoLines } = await import('../src/mods/infoDisplay');
    registerModInfoDisplay('mod_y_line', { label: 'Mod行', update: () => 'X=1' });
    const ctx = {
      gates: { accThirdEye: true },   // 只开第三眼=1 原版行
      mainTime: 0, dayTime: true, moonPhase: 0, bloodMoon: false, eclipse: false,
      weather: 0, fishingText: null, oreText: null, rareText: null, rareVid: null,
      enemyCount: 0,
    } as never;
    const hidden = new Array(13).fill(false);
    resolveModInfoLines({});
    const rows = buildInfoAccRows(ctx, hidden, false);
    expect(rows.length).toBe(2);
    expect(rows[0]!.icon).toBe(5);          // 原版第三眼行
    expect(rows[1]).toMatchObject({ icon: -1, hideIndex: -1, text: 'X=1' });   // mod 追加
  });
});
