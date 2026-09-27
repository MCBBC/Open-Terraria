// ★红蓝批 β Renderer 行为面（原型实例判例 bj316——构造器拖整条 DOM 链）：
//   R1b-2 ensureWorldCompose 旗面一致性（运行时翻旗 0→1/1→0 错位实例整弃重建——
//        旧自建 compose 与 acc 句柄产生面（swPipe）分家=跨上下文句柄禁入）。
//   R3b-6 uploadScratchBake 帧界键+瞬态家族退休（计数每帧重置=键不随实体 id
//        无界驻留;600 帧未触家族删账）。
import { afterEach, describe, expect, it } from 'vitest';
import { Renderer } from '../src/render/Renderer';

function makeR(): { r: Renderer; a: Record<string, unknown> } {
  const r = Object.create(Renderer.prototype) as Renderer;
  const a = r as unknown as Record<string, unknown>;
  a._diagFrame = 100;
  a._scratchBakeSweepFrame = -1;
  a.worldCompose = null;
  a.scratchBakeSeqs = new Map<string, { n: number; f: number }>();   // 原型实例判例:构造器字段手工补
  return { r, a };
}

const flagSave: Array<() => void> = [];
afterEach(() => {
  for (const f of flagSave.splice(0)) f();
});

describe('R1b-2 ensureWorldCompose 旗面一致性重建', () => {
  it('cloudPipe 开+自建残留（ownsPipe=true）→ 整弃重建;一致实例不动', () => {
    const save = (Renderer as unknown as { _cloudPipe: boolean })._cloudPipe;
    flagSave.push(() => { (Renderer as unknown as { _cloudPipe: boolean })._cloudPipe = save; });
    (Renderer as unknown as { _cloudPipe: boolean })._cloudPipe = true;
    const { r, a } = makeR();
    // 构造面 stub（node 无 DOM——本测只锁一致性判定/整弃语义）
    a.newWorldCompose = () => null;
    const stale = { ownsPipe: true, disposed: 0, dispose(this: { disposed: number }) { this.disposed++; } };
    a.worldCompose = stale;
    (r as unknown as { ensureWorldCompose(): void }).ensureWorldCompose();
    expect(stale.disposed).toBe(1);          // 错位实例整弃
    expect(a.worldCompose).toBeNull();       // 重建走 newWorldCompose（stub null=下帧重试）
    // 已一致实例（共管 ownsPipe=false）不重建
    const ok = { ownsPipe: false, disposed: 0, dispose(this: { disposed: number }) { this.disposed++; } };
    a.worldCompose = ok;
    (r as unknown as { ensureWorldCompose(): void }).ensureWorldCompose();
    expect(ok.disposed).toBe(0);
  });
  it('反向翻旗（cloudPipe 关+共管残留 ownsPipe=false）→ 同样整弃', () => {
    const save = (Renderer as unknown as { _cloudPipe: boolean })._cloudPipe;
    flagSave.push(() => { (Renderer as unknown as { _cloudPipe: boolean })._cloudPipe = save; });
    (Renderer as unknown as { _cloudPipe: boolean })._cloudPipe = false;
    const { r, a } = makeR();
    a.newWorldCompose = () => null;
    const stale = { ownsPipe: false, disposed: 0, dispose(this: { disposed: number }) { this.disposed++; } };
    a.worldCompose = stale;
    (r as unknown as { ensureWorldCompose(): void }).ensureWorldCompose();
    expect(stale.disposed).toBe(1);
    expect(a.worldCompose).toBeNull();
  });
});

describe('R3b-6 uploadScratchBake 帧界键+瞬态家族退休', () => {
  it('同帧递增/跨帧重置;600 帧未触瞬态家族删账', () => {
    const saveBgl = Renderer.bgl;
    const saveShim = Renderer.bglShim;
    flagSave.push(() => { Renderer.bglSetForTest(saveBgl); Renderer.bglShimSetForTest(saveShim); });
    Renderer.bglSetForTest(true);
    Renderer.bglShimSetForTest(true);
    const { r, a } = makeR();
    const keys: string[] = [];
    a.bglEntShim = {
      markDynamic() { /* 桩 */ },
      uploadScratchNow(_img: HTMLCanvasElement, k: string) { keys.push(k); },
    };
    const bake = r.uploadScratchBake.bind(r);
    const img = { width: 8, height: 8 } as unknown as HTMLCanvasElement;
    a._diagFrame = 100;
    bake(img, 'boltBake', 1024);
    bake(img, 'boltBake', 1024);
    expect(keys).toEqual(['boltBake:1', 'boltBake:2']);   // 帧内递增（I类同帧唯一性）
    a._diagFrame = 101;
    bake(img, 'boltBake', 1024);
    expect(keys[2]).toBe('boltBake:1');                    // ★帧界重置（键不随帧无界累积）
    // 瞬态实体家族:65 个 bv:<id> 家族 → 601 帧后触一笔新账触发清扫
    a._diagFrame = 102;
    for (let i = 0; i < 65; i++) bake(img, `bv:${i}`, 512);
    const seqs = a.scratchBakeSeqs as Map<string, { n: number; f: number }>;
    expect(seqs.size).toBeGreaterThanOrEqual(66);
    a._diagFrame = 102 + 601;
    bake(img, 'fresh', 16);
    expect(seqs.has('bv:0')).toBe(false);                  // 瞬态 id 账退休
    expect(seqs.has('fresh')).toBe(true);
  });
});
