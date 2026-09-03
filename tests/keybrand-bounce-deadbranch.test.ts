// Keybrand"滑行面"（Player.TryBouncingBlocks :35102-35180 内 if(flag2) Keybrand 编排支）
// 基线钉死（2026-09-03 清偿批③）：vanilla 1457/1458 两基线该支均构造性不可达——
// `bool flag2 = false` 声明后全函数无任何置位句，故"击杀敌怪后的玩家滑行位移"在
// vanilla 不存在（NPC.KeyBrandStrike NPC.cs:81998-82012 全文无玩家速度/位移写面）。
// 不接 = 1:1；本测钉死"flag2 恒死支"这一判定：未来基线若复活置位句即爆红，届时
// 须按 Player.cs:35135-35158 逐值补接（velocity 重定向 + Keybrand 编排 clientOnly:true）。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** 抽取 TryBouncingBlocks 函数体（起点唯一；终点=下一 \n\tprivate/\n\tpublic 声明） */
function tryBouncingBlocksBody(src: string): string {
  const start = src.indexOf('private void TryBouncingBlocks(bool Falling)');
  expect(start).toBeGreaterThan(0);                       // 函数须存在（基线漂移即红）
  const nextPriv = src.indexOf('\n\tprivate ', start + 10);
  const nextPub = src.indexOf('\n\tpublic ', start + 10);
  const end = Math.min(nextPriv === -1 ? Infinity : nextPriv, nextPub === -1 ? Infinity : nextPub);
  return src.slice(start, end);
}

describe.each([
  ['../Terarria1457/Terraria/Player.cs', 35102],
  ['../Terarria1458/Terraria/Player.cs', 35100],
])('TryBouncingBlocks flag2 死支（%s）', (rel, _line) => {
  const p = resolve(process.cwd(), rel);

  it('flag2 全函数仅一次 `= false` 声明、无任何置位句 → Keybrand 编排支不可达（不接=1:1）', () => {
    if (!existsSync(p)) throw new Error(`标杆缺失: ${p}`);
    const body = tryBouncingBlocksBody(readFileSync(p, 'utf8'));
    // 监视对象对位：该函数体内确实存在 Keybrand 编排支（防抽错函数）
    expect(body).toContain('ParticleOrchestraType.Keybrand');
    expect(body).toContain('bool flag2 = false');
    // flag2 出现的赋值（= 后非 ==）恰一次 = 声明；任何 `flag2 = true` 置位即爆红
    const assigns = body.match(/flag2\s*=(?!=)/g) ?? [];
    expect(assigns.length).toBe(1);
    // 支本体确在 `if (flag2)` 门内
    expect(body).toContain('if (flag2)');
  });

  it('KeyBrandStrike（NPC.cs）全文无玩家位移/速度写面——"滑行"非 Keybrand 命中机制', () => {
    const npcPath = resolve(process.cwd(), rel.replace('Player.cs', 'NPC.cs'));
    if (!existsSync(npcPath)) throw new Error(`标杆缺失: ${npcPath}`);
    const src = readFileSync(npcPath, 'utf8');
    const start = src.indexOf('public int KeyBrandStrike(int plr, int dmg, Vector2 bestSwordSpot)');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf('\n\tpublic ', start + 10));
    expect(body).toContain('GetLerpValue(1f, 0.1f, t, clamped: true)');   // 低血增伤判定
    expect(body).toContain('ParticleOrchestraType.Keybrand');
    expect(/velocity|position\s*=|Slide|slide/i.test(body)).toBe(false);  // 无位移写面
  });
});
