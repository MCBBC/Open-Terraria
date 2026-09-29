// ★liqpolish texCheck 批检守卫（2026-09-29 微抛光刀判别器面）:
//  「逐出注入下守卫仍拦得住」——LRU 逐出/dropTexture/清表族任一删表路径 bump
//  texGen,批检命中窗（chk===texGen 直通）随即失效重验=LRU 逐出窗语义与逐 rec
//  texAlive 逐位同。texAlive/texCheck 只触 texs(Map)/texGen(number)——用
//  GLSpriteLayer.prototype 派生桩注入私有域,无 GL 上下文依赖。
import { describe, expect, it } from 'vitest';
import { GLSpriteLayer } from '../src/render/GLSpriteLayer';
import type { TexEntry } from '../src/render/GLSpriteLayer';

/** 无 GL 桩:原型链派生（方法真身）+私有域直注（texs/texGen/bytes） */
function mkLayer(): GLSpriteLayer {
  const L = Object.create(GLSpriteLayer.prototype) as GLSpriteLayer;
  Object.assign(L, {
    texs: new Map<string, TexEntry>(),
    texGen: 0,
    bytes: 0,
    statName: 'test',
  });
  return L;
}
let seq = 0;
function mkEntry(key: string): TexEntry {
  return { tex: {} as WebGLTexture, w: 1, h: 1, stamp: ++seq, bytes: 4, mipped: false, key };
}

describe('★liqpolish texCheck 代际批检', () => {
  it('命中窗:首验真查+盖戳,同代际复检直通（等值语义=texAlive）', () => {
    const L = mkLayer();
    const e = mkEntry('k1');
    L['texs'].set('k1', e);
    expect(L.texAlive(e)).toBe(true);
    expect(L.texCheck(e)).toBe(true);
    expect(e.chk).toBe(0);                 // 首验盖戳=当前代际
    // 同代际复检直通（即便表被旁路清掉——语义由「窗内无删表」前提保证）
    expect(L.texCheck(e)).toBe(true);
  });

  it('判别器①:dropTexture 注入逐出 → 批检拦得住（旧 entry false）', () => {
    const L = mkLayer();
    const e = mkEntry('k1');
    L['texs'].set('k1', e);
    expect(L.texCheck(e)).toBe(true);
    // 注入逐出（dropTexture 真身调 gl.deleteTexture——桩无 gl,直接模拟其删表+bump 面
    // 的语义等价:此处走 evictLRU 同款人工路径,dropTexture 全链由 GL 上下文测试覆盖）
    L['texs'].delete('k1');
    L['texGen']++;
    expect(L.texCheck(e)).toBe(false);     // ★守卫拦得住
    // 同键重建=新 entry 对象:旧对象仍 false、新对象 true
    const e2 = mkEntry('k1');
    L['texs'].set('k1', e2);
    expect(L.texCheck(e)).toBe(false);
    expect(L.texCheck(e2)).toBe(true);
    expect(L.texAlive(e)).toBe(false);
  });

  it('判别器②:evictLRU 真身注入逐出（建面触发字节超限）→ 批检拦得住', () => {
    const L = mkLayer();
    const e = mkEntry('k1');
    L['texs'].set('k1', e);
    expect(L.texCheck(e)).toBe(true);
    // evictLRU 真身:gl=null 时早退——用最小 gl 桩（deleteTexture no-op）
    const glStub = { deleteTexture() { /* 桩 */ }, getParameter() { return 0; } };
    (L as unknown as { gl: unknown }).gl = glStub;
    (L as unknown as { bytes: number }).bytes = GLSpriteLayer.MAX_BYTES + 1_000_000;
    const big = mkEntry('big');
    big.bytes = 2_000_000;
    L['texs'].set('big', big);
    // evictLRU(keepKey='big') → k1 被逐出 + texGen bump
    L['evictLRU']('big');
    expect(L['texs'].has('k1')).toBe(false);
    expect(L.texCheck(e)).toBe(false);     // ★守卫拦得住（真身 evictLRU 路径）
  });

  it('判别器③:清表族（dispose 语义面=texs.clear+bump）→ 批检拦得住', () => {
    const L = mkLayer();
    const e = mkEntry('k1');
    L['texs'].set('k1', e);
    expect(L.texCheck(e)).toBe(true);
    L['texs'].clear();
    L['texGen']++;
    expect(L.texCheck(e)).toBe(false);
  });

  it('批检窗跨删表重开:删后无再删 → 新验活条目复检直通（窗语义=两次删表之间）', () => {
    const L = mkLayer();
    const e = mkEntry('k1');
    L['texs'].set('k1', e);
    L['texs'].delete('k1');
    L['texGen']++;
    expect(L.texCheck(e)).toBe(false);
    const e2 = mkEntry('k2');
    L['texs'].set('k2', e2);
    expect(L.texCheck(e2)).toBe(true);
    expect(L.texCheck(e2)).toBe(true);     // 窗内复检直通
  });

  it('null-key entry（外部直持）恒活（texAlive 同语义）', () => {
    const L = mkLayer();
    const e = mkEntry('');
    e.key = undefined;
    expect(L.texCheck(e)).toBe(true);
    expect(L.texAlive(e)).toBe(true);
  });
});
