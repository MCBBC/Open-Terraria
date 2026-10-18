// ★652b-3:gen.ts chasmGenerator 逐字提取计数(不经判卷仪计数栈,独立清点)。
// 从 gen.ts 源码正则切出 chasmGenerator 函数体,以桩 store 运行 → 裁定 42/45 掷差归属。
import { REPO_ROOT, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { RNG, translateSeed } from '../src/core/rng.ts';

const GEN_PATH = process.env.SW_GAME_ROOT
  ? `${process.env.SW_GAME_ROOT}/mods/calamity/src/gen.ts`
  : join(REPO_ROOT, 'mods/calamity/src/gen.ts');
const src = readFileSync(GEN_PATH, 'utf8');
// 切出 "const chasmGenerator = (i, jScan, steps) => {" 到 "\n      };" (函数收口)
const m = src.match(/const chasmGenerator = \(i, jScan, steps\) => \{[\s\S]*?\n      \};/);
if (!m) throw new Error('chasmGenerator 未切出');
// 剥离 recon 打点行(TS 标注不可 new Function;计数面与其无关)
const fnSrc = m[0].split('\n').filter((l) => !l.includes('globalThis as')).join('\n');

const w = 4200, h = 1200;
const carved: number[] = [];
const store = {
  w, h,
  idx: (x: number, y: number) => y * w + x,
  hasTile: (_x: number, _y: number) => false,   // probe: 首列即命中(计数只依赖 j,与 probe 命中无关——由调用方给 j)
  get: () => 0,
  flags: new Uint8Array(w * h),
  liquid: new Uint8Array(w * h),
  liquidType: new Uint8Array(w * h),
};
const atLeft = false, chasmBottom = 850;
const chasmX = 4030, surfLow = 194;

// 包一层:替换 chasmGenerator 内的 hasTile probe(桩恒 false 会让 probe 扫到 h-1——
// 计数不受影响:C# probe 零掷,probe 结果只改 j;我们直接跳过 probe,以 jScan 直用)
const wrapped = fnSrc.replace('while (ty < h - 1 && !store.hasTile(probe, ty)) ty++;', 'ty = jScan;');

const factory = new Function('store', 'rng', 'globalThis', 'atLeft', 'chasmBottom', 'chasmX', 'surfLow', 'carved', 'w', 'h', `
  const nExc = (a, b) => a + Math.floor(rng.next() * (b - a));
  const coin = () => rng.next() < 0.5;
  ${wrapped}
  return chasmGenerator;
`);

const rng = new RNG(translateSeed('9293480'));
for (let z = 0; z < 4880; z++) rng.next();
let n = 0;
const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(rng))) {
  const fn = proto[k];
  if (typeof fn === 'function' && /^(next|int|intRange|nextBool|nextFloat|nextDouble)/i.test(k)) {
    proto[k] = function (this: unknown, ...a: unknown[]) { n++; return fn.apply(this, a); };
  }
}
const chasmGenerator = factory(store, rng, globalThis, atLeft, chasmBottom, chasmX, surfLow, carved, w, h);
chasmGenerator(4065, 281, 850);
console.log('[verbatim] chasm1 掷数=', n);
process.exit(0);
