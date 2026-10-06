// ★幕布期预算批锁（2026-10-06;用户案 a/b,「进世界后长时间无法稳定帧率」保守子集）。
//  面:
//   ① resolveShineBudgetMs 纯函数（显式 URL 档逐字优先;无显式时提升生效;
//      explicit 0=计数路径提升不生效——滚屏降级同纪律）;
//   ② setShineEntryBoost/shineEntryBoostActive 开关行为（终态复原=null 防跨测污染）;
//   ③ Game 源锚:beginEntryFreeze 捕获现值→提预算（案 a bakeBudgetMs 8→40+案 b
//      shine 15）;endEntryFreeze 原值归还+清 shine 提升;boost 未开时幂等零变化;
//      wbake 降级（begin=false 早退）不提预算;
//   ④ 红线锚:提升只动毫秒值——烘焙链路（flushDirty/get/renderChunk）、光照、worker
//      派发源码零触碰（三域禁改面纪律）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setShineEntryBoost, shineEntryBoostActive, resolveShineBudgetMs,
} from '../src/render/TileShine';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const TSHINE = readFileSync(join(ROOT, 'src/render/TileShine.ts'), 'utf8');

describe('幕布期预算批 ① resolveShineBudgetMs — 帧盒基值解析（纯函数）', () => {
  it('无显式 URL 档:boost 生效（4→15）;boost=null 常态 base', () => {
    expect(resolveShineBudgetMs(null, 4, 15)).toBe(15);
    expect(resolveShineBudgetMs(null, 4, null)).toBe(4);
  });
  it('显式 URL 档逐字:boost 不生效（含高档位显式;0=计数路径语义由 base=0 承载）', () => {
    expect(resolveShineBudgetMs(4, 4, 15)).toBe(4);
    expect(resolveShineBudgetMs(16, 16, 15)).toBe(16);
    expect(resolveShineBudgetMs(0, 0, 15)).toBe(0);
  });
});

describe('幕布期预算批 ② setShineEntryBoost — 开关行为', () => {
  it('置 15 → active;置 null → 非 active（终态复原）', () => {
    expect(shineEntryBoostActive()).toBe(false);   // 模块初态=常态
    setShineEntryBoost(15);
    expect(shineEntryBoostActive()).toBe(true);
    setShineEntryBoost(null);
    expect(shineEntryBoostActive()).toBe(false);
  });
  it('Game 源锚:begin/end 沿成对调用 setShineEntryBoost', () => {
    expect(GAME).toContain("import { setShineEntryBoost } from '../render/TileShine';");
    expect(GAME).toContain('this.chunks.bakeBudgetMs = Game.ENTRY_BAKE_BUDGET_BOOST_MS;');
    expect(GAME).toContain('setShineEntryBoost(Game.ENTRY_SHINE_BUDGET_BOOST_MS);');
    expect(GAME).toContain('setShineEntryBoost(null);');
  });
});

describe('幕布期预算批 ③ Game 源锚 — 提升窗生命周期', () => {
  it('beginEntryFreeze:捕获现值在前→提预算（防缺省值漂移钉死;重复 begin 恰一次捕获）', () => {
    const at = GAME.indexOf('beginEntryFreeze(timeoutMs = 3000): boolean {');
    const body = GAME.slice(at, at + 900);
    expect(body).toContain('this._entryBakeBudgetPrev = this.chunks.bakeBudgetMs;');
    expect(body.indexOf('this._entryBakeBudgetPrev = this.chunks.bakeBudgetMs;'))
      .toBeGreaterThan(body.indexOf('if (this._entryFreeze) return true;'));   // 重复 begin 早退在后=捕获恰一次
    expect(body).toContain('Game.ENTRY_BAKE_BUDGET_BOOST_MS');
    expect(body).toContain('Game.ENTRY_SHINE_BUDGET_BOOST_MS');
  });
  it('endEntryFreeze:原值归还+清 shine 提升+prev 复位;幂等（未开窗早退不误归还）', () => {
    const at = GAME.indexOf('endEntryFreeze(): void {');
    const body = GAME.slice(at, at + 800);
    expect(body).toContain('if (!this._entryFreeze) return;');
    expect(body).toContain('this.chunks.bakeBudgetMs = this._entryBakeBudgetPrev;');
    expect(body).toContain('this._entryBakeBudgetPrev = null;');
    // 归还判空防 dispose 后迟到 end
    expect(body).toContain('if (this.chunks && this._entryBakeBudgetPrev != null)');
  });
  it('wbake 降级不开窗=不提预算（begin=false 早退先于 boost 行）', () => {
    const at = GAME.indexOf('beginEntryFreeze(timeoutMs = 3000): boolean {');
    const body = GAME.slice(at, at + 900);
    expect(body.indexOf('if (!WBAKE_ENABLED) return false;'))
      .toBeLessThan(body.indexOf('Game.ENTRY_BAKE_BUDGET_BOOST_MS'));
    expect(body.indexOf('if (!this.world || !this.chunks || !this.chunks.bakeClient) return false;'))
      .toBeLessThan(body.indexOf('Game.ENTRY_BAKE_BUDGET_BOOST_MS'));
  });
});

describe('幕布期预算批 ④ 红线锚 — 提升只动毫秒值,链路面零触碰', () => {
  it('TileShine:提升=直通臂（A 门锚/C 消费锚 byte 逐字未动;B 锚随臂形 ? → :,见 firstexpose-clamp 演进注）', () => {
    expect(TSHINE).toContain('const boostMs = shineBudgetExplicit === null ? entryBoostMs : null;');
    expect(TSHINE).toContain('const tbNow = shineBudgetMs > 0');                                  // A 门锚 byte 未动（shine-transit-degrade 同锚）
    expect(TSHINE).toContain('? (boostMs != null ? boostMs');                                     // 提升直通臂=唯一新增面
    expect(TSHINE).toContain(': shineBurstClamp(adaptiveShineBudgetMs(shineBudgetExplicit,');     // B 锚演进形（shine-firstexpose-clamp 同步更新）
    expect(TSHINE).toContain('const timeBudget = tbNow > 0 ? { deadline: performance.now() + tbNow } : null;');   // C 消费锚 byte 未动（shine-debt-carry-pool 同锚）
  });
  it('Game:提升行不触碰光照/worker/烘焙链路调用序（entryFreezeTick 原文零改动）', () => {
    // entryFreezeTick 内烘焙派发+光照调用原文保留（只读锚;预算批不进 tick 面）
    const at = GAME.indexOf('private entryFreezeTick(): void {');
    const body = GAME.slice(at, at + 1200);
    expect(body).toContain('cc.flushDirty();');
    expect(body).toContain('this.tickLighting(viewTW, viewTH);');
    expect(body).not.toContain('ENTRY_BAKE_BUDGET_BOOST_MS');   // tick 面无预算批行
  });
});
