// dist 混淆后处理(anti-decompile-plan-v2 B1 零代价档;2026-08-24)。
//
// 职责:对 dist/assets/*.js 的【冷 chunk】做发布混淆。铁律:
//   ① 只改文件内容,不改名——index.html 引用与 sw.js 壳缓存正则(/^\/assets\/.+\.(js|css)$/)
//     都依赖现名(v2 计划 C8);
//   ② 全部开关显式写死,不依赖默认值(J-O master 默认值漂移前科:
//     stringArrayCallsTransform 曾默认翻 true);
//   ③ 零运行时代价档:字符串数组(none 编码,取值=一次数组索引)+构建期
//     rotate/shuffle/indexShift + variable 包装×1 + simplify + mangled 短名。
//     有代价项全关死(CFF 1.5×/DCI +200% 体积/callsTransform 间接化/base64·rc4
//     逐次解码/自防御/调试保护——v2 计划 §4 禁用清单);
//   ④ ★主包(index-*.js)整块跳过——2026-08-24 实验矩阵定案(/tmp/obf-lab):
//       hexadecimal 标识符底座 +52%、mangled 底座 +24%(babel 重序列化+名字变长,
//       与 stringArray 无关)、stringArray 再 +28pp;gz 亦 +9~35%。
//       主包=首屏唯一 JS,任何 J-O 过手都 ≥+24% 首屏解析成本,违反「不损失性能」;
//       且 stringArray 档 webcrack/synchrony 可自动还原,防护边际不值这个价。
//       主包防护维持 esbuild minify 态(零代价下的诚实上限)。
//   ⑤ sw.js(根目录)不碰:SW 逻辑可读性优先,且不含游戏逻辑;
//   ⑥ 逃生门:OBFUSCATE=0 直接跳过;单文件失败即整体非零退出。
//
// 分级:hot=index-*.js(跳过)  worker=*.worker.js(mT0.8 全覆盖)  panel=其余(mT0.8)
//
// 用法:node --max-old-space-size=6144 tools/obfuscate-dist.mjs(build:release 已带)。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const DIST = join(import.meta.dirname, '..', 'dist');
const ASSETS = join(DIST, 'assets');

if (process.env.OBFUSCATE === '0') {
  console.log('[obfuscate] OBFUSCATE=0 → 跳过(产物=普通 build)');
  process.exit(0);
}

/** 零运行时代价档(冷 chunk 用;mangled 短名=与 esbuild 同级不可读且体积中性) */
const ZERO_COST_CONFIG = Object.freeze({
  compact: true,
  simplify: true,                        // 静态等价变换,0 开销
  identifierNamesGenerator: 'mangled',   // 短名:hexadecimal 实测底座 +52% vs mangled +24%
  stringArray: true,                     // 字符串入数组:每次访问 +1 次索引
  stringArrayThreshold: 0.8,             // 冷 chunk 全覆盖;官方提示覆盖过高变慢,留 20% 直通
  stringArrayEncoding: [],               // none:不编码(编码档逐次解码=实开销)
  stringArrayRotate: true,               // 构建期偏移,运行时 0
  stringArrayShuffle: true,              // 构建期洗牌,运行时 0
  stringArrayIndexShift: true,           // 运行时 0
  stringArrayWrappersType: 'variable',   // 官方注明 function 包装 slower
  stringArrayWrappersCount: 1,
  stringArrayCallsTransform: false,      // ⚠ 唯一反自动工具开关但=调用间接化,零代价档禁用
  numbersToExpressions: false,           // ≈0 但增体积,零代价档不取
  splitStrings: false,                   // 同上
  unicodeEscapeSequence: false,
  transformObjectKeys: false,            // 禁用清单:表驱动架构命门
  renameGlobals: false,                  // 禁用清单:esbuild 已 mangle,风险>收益
  renameProperties: false,               // 禁用清单:存档字段/联机协议/l10n 键动态访问必炸
  controlFlowFlattening: false,          // 禁用清单:最高 1.5× 变慢
  deadCodeInjection: false,              // 禁用清单:体积 +200%
  debugProtection: false,                // 禁用清单:可冻结浏览器
  debugProtectionInterval: 0,
  disableConsoleOutput: false,           // 禁用清单:线上排障瞎眼
  selfDefending: false,                  // 禁用清单:咬后续后处理
  sourceMap: false,                      // dist 内不留 map(私有 map 归档是未来可选项)
  target: 'browser-no-eval',             // 未来 CSP 兼容预留
});

const classify = (name) => {
  if (/^index-.*\.js$/.test(name)) return 'hot';       // 跳过(见文件头④)
  if (/\.worker\.js$/.test(name)) return 'worker';
  return 'panel';
};

const files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
if (!files.length) {
  console.error('[obfuscate] dist/assets/ 无 js——请先 vite build');
  process.exit(1);
}

let totalBefore = 0, totalAfter = 0, done = 0, skipped = 0;
const t0 = Date.now();
for (const f of files) {
  const tier = classify(f);
  if (tier === 'hot') {
    console.log(`[obfuscate] ⊘ ${f}(hot) 跳过——首屏主包维持 esbuild 态(零首屏代价,见文件头④)`);
    skipped++;
    continue;
  }
  const p = join(ASSETS, f);
  const src = readFileSync(p, 'utf8');
  const before = Buffer.byteLength(src);
  const tFile = Date.now();
  let result;
  try {
    result = JavaScriptObfuscator.obfuscate(src, {
      ...ZERO_COST_CONFIG,
      inputFileName: f,
    }).getObfuscatedCode();
  } catch (e) {
    console.error(`[obfuscate] ✗ ${f}(${tier}) 混淆失败: ${e.message}`);
    console.error('[obfuscate] 整体中止——dist 保持 vite build 原样,可 OBFUSCATE=0 出未混淆包');
    process.exit(1);
  }
  writeFileSync(p, result);
  const after = Buffer.byteLength(result);
  totalBefore += before; totalAfter += after; done++;
  console.log(`[obfuscate] ✓ ${f}(${tier}) ${(before / 1048576).toFixed(2)}→${(after / 1048576).toFixed(2)}MB(+${((after / before - 1) * 100).toFixed(0)}%) ${((Date.now() - tFile) / 1000).toFixed(1)}s`);
}

console.log(`[obfuscate] 完成:混淆 ${done} + 跳过 hot ${skipped};冷 chunk ${(totalBefore / 1048576).toFixed(2)}→${(totalAfter / 1048576).toFixed(2)}MB 总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('[obfuscate] 首屏主包字节零变化(首屏传输/解析零代价);冷 chunk 涨幅为加载期一次性解析,运行时零开销');
