// 祭坛/珠 hammer CanKillTile 极性防回滚锁（2026-09-03 用户实报"圣锤无法破坏祭坛"）：
//  SW-G1 重构曾把三处门的极性写反（canKill→0 = 可破坏反而零伤 → 神锤永不开祭坛/珠）。
//  原版：Player.cs:46058 `if (!WorldGen.CanKillTile(x, y)) num2 = 0;`（锤支）、
//  Player.cs:54474-54477 `if (!WorldGen.CanKillTile(x, y)) damage = 0;`（钻头直调支）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = () => readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8')
  .replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ');

describe('祭坛/珠 hammer CanKillTile 极性（三处）', () => {
  it('锤支(祭坛 26 与珠 31):!canKillTile 才归零(可破坏照常积累)', () => {
    const s = src();
    expect(s).toContain('if (!this.canKillTile(tx, ty)) num2 = 0;');
    expect(s).not.toContain('if (this.canKillTile(tx, ty)) num2 = 0;');
  });
  it('钻头直调支(祭坛):!canKillTile → 0(可破坏照常积累)', () => {
    const s = src();
    expect(s).toContain('!this.canKillTile(tx, ty) ? 0');
  });
});
