// 贴图可用性假设的静态防线(2026-08-13,三轮枚举 review 的自动化沉淀)。
// 历史 bug 三类,本测试各自守门:
//  (a) vimages.get/uiimages.get 直取 → 绕过懒加载=贴图永不出现(TowerBolt/SquidCloud 三犯)
//  (b) vui 裸键(无 .png 后缀/清单不存在)→ 恒 null 连请求都不发(全屏地图背景从未画过)
//  (c) 素材路径字面量文件不存在 → 恒 404(WorldCreation 双 W typo / NPC_Head 81-120)
// 扩 allowlist 规则:只接受"带理由"的显式追加;新增违例应优先改 ensureVImage/修键名。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

function walkTs(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const rel = (p: string) => p.slice(SRC.length + 1);
const FILES = walkTs(SRC);

/** (a) 直取 allowlist:文件 → 理由。新增条目必须写明为何安全。 */
const DIRECT_READ_ALLOW: Record<string, string> = {
  'assets/SpriteAtlas.ts': '懒加载设施本体',
  'entities/Dart.ts': 'isBlank 只读守卫(调用方 draw 先 ensure 成功才调)',
  'entities/SquidCloud.ts': 'typeof Image 守卫的回退分支,主路径 ensureVImage',
  'entities/MeteorChunk.ts': '同 SquidCloud',
  'main.ts': '调试 tile 检查器(有 meta&&img 守卫,只读展示)',
  'ui/UI.ts': '调试贴图选择器 toast(miss 有提示)',
  'ui/BestiaryPanel.ts': '快路径查缓存,miss 自取 new Image+onload 补画(面板作用域)',
};

describe('贴图防线:静态 lint', () => {
  it('(a) vimages/uiimages 直取不得新增(DIRECT_READ_ALLOW 之外)', () => {
    const bad: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8');
      if (/\.vimages\.get\(|\.uiimages\.get\(/.test(src) && !DIRECT_READ_ALLOW[rel(f)]) {
        bad.push(rel(f));
      }
    }
    expect(bad, `新增直取违例(改走 atlas.ensureVImage/ensureUiImage,或带理由扩 allowlist): ${bad.join(', ')}`).toEqual([]);
  });

  it('(b) vui() 字面量键必须带 .png 且存在于清单(裸键/错键恒 null)', () => {
    const uiFiles = (JSON.parse(readFileSync(join(ROOT, 'public/sprites/vanilla-ui.json'), 'utf8')) as { files: Record<string, string> }).files;
    const bad: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.vui\(\s*(['"])([^'"]+)\1/g)) {
        const key = m[2];
        if (key.includes('${')) continue; // 模板串交给运行期 vuiKeyMiss warn
        if (!key.endsWith('.png')) bad.push(`${rel(f)}: vui('${key}') 缺 .png 后缀`);
        else if (!(key in uiFiles)) bad.push(`${rel(f)}: vui('${key}') 不在 vanilla-ui.json 清单`);
      }
    }
    expect(bad, `vui 键失配(键须带 .png 且真实存在;历史犯:全屏地图 Map/MapBG): ${bad.join('; ')}`).toEqual([]);
  });

  it('(c) 静态素材路径字面量必须存在于 public/sprites(macOS 大小写不敏感比对)', () => {
    // 收集磁盘文件小写集(递归一次)
    const disk = new Set<string>();
    const walkDisk = (dir: string, prefix: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walkDisk(p, `${prefix}${e}/`);
        else disk.add((prefix + e).toLowerCase());
      }
    };
    const spritesDir = join(ROOT, 'public', 'sprites');
    if (existsSync(spritesDir)) walkDisk(spritesDir, '');
    const bad: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8');
      const pats = [
        /['"`](vanilla\/[A-Za-z0-9_./-]+\.png)['"`]/g,          // 'vanilla/...' (SpriteAtlas 语义, sprites/ 前缀由加载器补)
        /['"`](sprites\/vanilla(?:-ui)?\/[A-Za-z0-9_./-]+\.png)['"`]/g, // 直 URL 全路径
      ];
      for (const re of pats) {
        for (const m of src.matchAll(re)) {
          const p = m[1];
          if (p.includes('${')) continue;
          // disk 集相对 sprites/ 归一:剥去直 URL 的 sprites/ 前缀
          const norm = p.startsWith('sprites/') ? p.slice('sprites/'.length) : p;
          if (!disk.has(norm.toLowerCase())) bad.push(`${rel(f)}: ${p}`);
        }
      }
    }
    expect(bad, `素材路径不存在(历史犯:双W typo/UI_WWorldCreation、NPC_Head 81-120): ${bad.slice(0, 20).join('; ')}${bad.length > 20 ? ` …共${bad.length}条` : ''}`).toEqual([]);
  });
});
