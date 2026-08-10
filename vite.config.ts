// vite/vitest 共用配置。
// resolve.extensions 把 .ts 提到 .js 之前：`npm run build` 的 tsc 会在 src/ 里
// 产出与源码同名的 .js 编译产物，默认扩展序（.js 优先）会让 vitest/vite 解析到
// 过期的 .js 而不是 .ts 源码（表现为改了 .ts 测试却跑旧逻辑）。
import { defineConfig, type Plugin } from 'vite';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 素材过期自动重打包(物品图集/贴图表管线)。
 *  判定 = 源目录(terraria-assets/Images)·白名单·TEdit 数据·脚本本体的最新 mtime
 *  晚于产物(vanilla.json / Item_Atlas_0.png)的最旧 mtime → 同步重跑 vanilla-atlas.mjs。
 *  dev 启动与 vite build 均触发;vitest 不走这些钩子,零开销 */
function vanillaAtlasAuto(): Plugin {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)));
  const sources = [
    join(ROOT, '..', 'terraria-assets', 'Images'),
    join(ROOT, 'scripts', 'vanilla-whitelist.json'),
    join(ROOT, 'scripts', 'vanilla-atlas.mjs'),
    join(ROOT, '..', 'Terraria-Map-Editor', 'src', 'TEdit.Terraria', 'Data', 'items.json'),
    join(ROOT, '..', 'Terraria-Map-Editor', 'src', 'TEdit.Terraria', 'Data', 'tiles.json'),
    join(ROOT, '..', 'Terraria-Map-Editor', 'src', 'TEdit.Terraria', 'Data', 'walls.json'),
  ];
  const outputs = [
    join(ROOT, 'public', 'sprites', 'vanilla.json'),
    join(ROOT, 'public', 'sprites', 'vanilla', 'Item_Atlas_0.png'),
  ];
  const stale = () => {
    if (outputs.some((f) => !existsSync(f))) return true;
    const srcNew = Math.max(...sources.map((f) => (existsSync(f) ? statSync(f).mtimeMs : 0)));
    const outOld = Math.min(...outputs.map((f) => statSync(f).mtimeMs));
    return srcNew > outOld;
  };
  const run = () => {
    if (!stale()) return;
    console.log('[vanilla-atlas] 素材源有更新,自动重打包…');
    execFileSync('node', [join(ROOT, 'scripts', 'vanilla-atlas.mjs')], { stdio: 'inherit' });
  };
  return {
    name: 'vanilla-atlas-auto',
    configureServer() { run(); },
    buildStart() { run(); },
  };
}

export default defineConfig({
  resolve: {
    extensions: ['.ts', '.mts', '.mjs', '.js', '.jsx', '.tsx', '.json'],
  },
  // worker 打包格式：默认 'iife' 遇到 worker 图内代码分割/动态 import 会构建报错；
  // 'es' 与 dev 态 module worker 一致（worldGen.worker 及其依赖全为静态 import）
  worker: { format: 'es' },
  plugins: [vanillaAtlasAuto()],
});
