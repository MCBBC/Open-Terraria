// vite/vitest 共用配置。
// resolve.extensions 把 .ts 提到 .js 之前：`npm run build` 的 tsc 会在 src/ 里
// 产出与源码同名的 .js 编译产物，默认扩展序（.js 优先）会让 vitest/vite 解析到
// 过期的 .js 而不是 .ts 源码（表现为改了 .ts 测试却跑旧逻辑）。
import { defineConfig, type Plugin } from 'vite';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** l10n 键完整性自动检查 + 语言包过期自动重建。
 *  ① 自有文案源(tools/l10n-custom)或构建脚本比 public/l10n 产物新 → 先重跑 build-l10n.mjs
 *    （防"补了键没重建包"的静默裸键）。
 *  ② src 全部 Lang.text/has 字面键对 zh-Hans 合并包解析（tools/l10n-audit.mjs）：
 *    vite build 缺键即 fail（构建中断，列出键名与使用位置）；dev 启动仅 console 警告
 *    （不阻塞热更新）。vitest 不走这些钩子，回归由 tests/l10n-audit.test.ts 锁定。 */
function l10nAuditAuto(): Plugin {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)));
  const sources = [
    join(ROOT, '..', 'tools', 'l10n-custom'),
    join(ROOT, 'scripts', 'build-l10n.mjs'),
    join(ROOT, 'scripts', 'l10n-merge.mjs'),
  ];
  const stale = () => {
    if (!existsSync(join(ROOT, 'public', 'l10n', 'zh-Hans.json'))) return true;
    const srcNew = Math.max(...sources.map((f) => statSync(f).mtimeMs));
    return statSync(join(ROOT, 'public', 'l10n', 'zh-Hans.json')).mtimeMs < srcNew;
  };
  const audit = async () => {
    if (stale()) {
      console.log('[l10n-audit] 语言包源有更新,自动重建…');
      execFileSync('node', [join(ROOT, 'scripts', 'build-l10n.mjs')], { stdio: 'inherit' });
    }
    const { auditL10n } = await import('./tools/l10n-audit.mjs');
    return auditL10n(join(ROOT, 'src'), join(ROOT, 'public', 'l10n', 'zh-Hans.json'));
  };
  return {
    name: 'l10n-audit-auto',
    async configureServer() {
      const { used, missing } = await audit();
      if (missing.length) {
        console.warn(`[l10n-audit] 警告: ${missing.length}/${used} 键缺失（dev 不阻塞，build 会失败）:`);
        for (const m of missing) console.warn(`  MISSING ${m.key} ← ${m.locs.join(', ')}`);
      }
    },
    async buildStart() {
      const { used, missing } = await audit();
      if (missing.length) {
        const lines = missing.map((m) => `  MISSING ${m.key}  ←  ${m.locs.join(', ')}`).join('\n');
        throw new Error(`[l10n-audit] Lang 键缺失 ${missing.length}/${used} 条——请在 tools/l10n-custom/{en-US,zh-Hans}.json 补键后重试:\n${lines}`);
      }
      console.log(`[l10n-audit] ${used} 键全部命中 ✓`);
    },
  };
}

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
  plugins: [vanillaAtlasAuto(), l10nAuditAuto()],
});
