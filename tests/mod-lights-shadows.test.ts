// lights-and-shadows mod 契约守卫(2026-10-12 WebGL2 移植批)。
// 锚:mods/lights-and-shadows(PORTING.md=反编译定谳)。本测试锁:
// ①mod.json schema 合法+config 键与脚本消费面一致;②scripts/main.js 装载即注册
//   screenFx pass;③hook 注册表 reset 纪律。
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerModScreenFx, collectModScreenFx, _resetModHooksForTests } from '../src/mods/hooks.ts';

const modDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mods', 'lights-and-shadows');

interface Registered { id: string; exec: (gl: WebGL2RenderingContext, pipe: unknown,
  inputTex: WebGLTexture, outFbo: unknown, w: number, h: number, st: unknown) => void }
let registered: Registered[] = [];

const mockSw = () => ({
  config: {
    get: (k: string) => ({
      useLight: true, lightIntensity: 1, moonlightIntensity: 1, shadowIntensity: 1,
      dayColor: 'Classic', useBloom: true, bloomIntensity: 1, bloomCounts: 4,
    }[k] as boolean | number | string),
  },
  screenFx: (p: Registered) => {
    registered.push(p);
    registerModScreenFx(p);   // 同步走真注册表(重复注册 fail-fast 可同步观测)
  },
  log: () => {},
});

beforeEach(() => { registered = []; });

describe('lights-and-shadows mod 契约', () => {
  it('mod.json: schema 必需面 + config 键全齐(与 main.js 消费面一致)', async () => {
    const { parseModManifest } = await import('../src/mods/manifest.ts');
    const raw = JSON.parse(readFileSync(join(modDir, 'mod.json'), 'utf8'));
    const m = parseModManifest(JSON.stringify(raw));   // fail-fast 校验(抛即红)
    expect(m.id).toBe('lights_and_shadows');
    expect(m.side).toBe('client');
    const keys = Object.keys(raw.config).sort();
    expect(keys).toEqual([
      'abOldGodray', 'bloomCounts', 'bloomIntensity', 'dayColor', 'lightIntensity',
      'moonlightIntensity', 'shadowIntensity', 'useBloom', 'useLight',
    ]);
    // 键型:bool×2 / number×5 / string×1(与原版 LightsConfig 字段一一对应)
    expect(raw.config.useLight.type).toBe('bool');
    expect(raw.config.useBloom.type).toBe('bool');
    expect(raw.config.dayColor.type).toBe('string');
    for (const k of ['lightIntensity', 'moonlightIntensity', 'shadowIntensity', 'bloomIntensity', 'bloomCounts']) {
      expect(raw.config[k].type).toBe('number');
      expect(typeof raw.config[k].min).toBe('number');
      expect(typeof raw.config[k].max).toBe('number');
    }
    // 原版默认值对齐(LightsConfig.cs DefaultValue)
    expect(raw.config.lightIntensity.default).toBe(1);
    expect(raw.config.bloomCounts.default).toBe(4);
    expect(raw.config.dayColor.default).toBe('Classic');
  });

  it('scripts/main.js: main(sw) 注册唯一 screenFx pass(exec 可调)', async () => {
    const src = readFileSync(join(modDir, 'scripts', 'main.js'), 'utf8');
    const cjs = src.replace(/export\s+default\s+function\s+main/, 'function main');
    // eslint-disable-next-line no-new-func
    const main = new Function(`${cjs}; return main;`)() as (sw: unknown) => void;
    main(mockSw());
    expect(registered.length).toBe(1);
    expect(registered[0].id).toBe('lights_and_shadows');
    expect(typeof registered[0].exec).toBe('function');
  });

  it('重复 main(sw) 调用 fail-fast(重复注册纪律)', () => {
    const src = readFileSync(join(modDir, 'scripts', 'main.js'), 'utf8');
    const cjs = src.replace(/export\s+default\s+function\s+main/, 'function main');
    // eslint-disable-next-line no-new-func
    const main = new Function(`${cjs}; return main;`)() as (sw: unknown) => void;
    _resetModHooksForTests();
    main(mockSw());
    expect(() => main(mockSw())).toThrow(/重复注册/);
    _resetModHooksForTests();
  });

  it('collectModScreenFx: 空注册零成本(快照工厂不调用),注册后绑定状态', () => {
    _resetModHooksForTests();
    let calls = 0;
    const empty = collectModScreenFx(() => { calls++; return {} as never; });
    expect(empty.length).toBe(0);
    expect(calls).toBe(0);   // 空注册:工厂零调用
    registerModScreenFx({ id: 't', exec: () => {} });
    const passes = collectModScreenFx(() => { calls++; return { time: 100 } as never; });
    expect(passes.length).toBe(1);
    expect(calls).toBe(1);
    expect(passes[0].kind).toBe('ModScreenFx');
    _resetModHooksForTests();
  });
});
