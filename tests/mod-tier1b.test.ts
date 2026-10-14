// ★Tier1-b 守卫(2026-10-14):shader 源审查纯函数面 + clipboard 限额。
//   GLSL 编译/GL 链=浏览器探针批;node 侧锁审查门与限额语义。
import { describe, it, expect } from 'vitest';
import { registerModShader, _resetModShadersForTests } from '../src/mods/modShader';
import { createModClipboard } from '../src/mods/modClipboard';
import { registerModScreenFx, _resetModHooksForTests } from '../src/mods/hooks';

describe('Tier1-b:sw.shader 源审查', () => {
  it('禁令面:#version/#extension/#include/超 64KB 全拒', () => {
    _resetModHooksForTests();
    expect(() => registerModShader('s1', { src: '#version 300 es\nvoid main(){}' })).toThrow('#version');
    expect(() => registerModShader('s1', { src: '#extension GL_OES : enable\nvoid main(){}' })).toThrow('#extension');
    expect(() => registerModShader('s1', { src: '#include "x"\nvoid main(){}' })).toThrow('#include');
    expect(() => registerModShader('s1', { src: 'x'.repeat(65 * 1024) })).toThrow('64KB');
    _resetModShadersForTests();
    _resetModHooksForTests();
  });

  it('合法源注册不抛(审查门放行;GL 编译=浏览器批)', () => {
    _resetModHooksForTests();
    expect(() => registerModShader('s2', { src: 'void main() { gl_FragColor = vec4(1.0); }' })).not.toThrow();
    _resetModShadersForTests();
    _resetModHooksForTests();
  });
});

describe('Tier1-b:sw.clipboard 限额', () => {
  it('写 256KB 限(超=false 不抛)/读拒绝=null', async () => {
    const cb = createModClipboard('t');
    // node 无 document/navigator.clipboard——write 走 execCommand 兜底也缺
    // document→false(不抛);限额门在一切兜底前
    expect(await cb.write('x'.repeat(256 * 1024 + 1))).toBe(false);
    expect(await cb.read()).toBeNull();   // 无 clipboard API→null
  });
});
