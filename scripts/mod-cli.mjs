#!/usr/bin/env node
// sw-mod CLI(2026-10-04 P3):mod 工程脚手架/打包/校验。
// 零引擎依赖(纯 node + fflate,自 game/node_modules 解析)——与 loader 的 TS 模块面
// 解耦,CLI 侧做轻 schema 校验(引擎侧 plan.ts 是权威校验,双闸互补)。
//
// 用法(在 game/ 目录):
//   node scripts/mod-cli.mjs init <目标目录> [--ts|--js]   # 模板工程(缺省 js;
//                                                          --ts=TypeScript 入口+tsconfig)
//   node scripts/mod-cli.mjs build <工程目录> [-o out.swmod]  # 打包(scripts/*.ts
//                                                          自动 esbuild 编译进包)
//   node scripts/mod-cli.mjs validate <工程目录|.swmod>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, basename } from 'node:path';
import { zipSync, unzipSync, strFromU8 } from 'fflate';

const cmd = process.argv[2];
const arg = process.argv[3];
const ID_RE = /^[a-z][a-z0-9_]{1,31}$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,47}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const die = (msg) => { console.error(`[sw-mod] ${msg}`); process.exit(1); };

// ---- 模板 ----

const TEMPLATE_MANIFEST = {
  id: 'example_mod',
  name: 'Example Mod',
  version: '1.0.0',
  author: 'your-name',
  description: 'A starter mod for SandboxWorld',
  api: 1,
  side: 'both',
  config: {
    power: { type: 'number', default: 2, min: 1, max: 10, label: '倍率 / Power' },
  },
};

const TEMPLATE_ITEM = {
  key: 'example_sword',
  name: 'Example Sword',
  rare: 2,
  value: 2000,
  maxStack: 1,
  combat: { damage: 25, knockBack: 5.5, useTime: 22, useAnimation: 22, melee: true, autoReuse: true },
  func: { useStyle: 1, autoReuse: 1 },
  texture: 'textures/items/example_sword.png',
};

const TEMPLATE_MAIN_JS = `// SandboxWorld mod 入口(可选;内容数据走 content/*.json)
export default function main(sw) {
  sw.log('loaded, power =', sw.config.get('power'));

  // 自定义 AI(接管本 mod NPC;不注册则走原版 aiStyle 家族):
  // sw.npcAi('example_slime', (e, game, player) => { e.vy = -0.4; });

  // 自定义物品使用(返回 true=已消费,useTime 节奏自管):
  // sw.itemUse('example_sword', (ctx) => { ctx.applyBuff('my_buff', 120); return true; });

  // 声明弹幕的代码钩:
  // sw.projectileHook('example_bolt', { update(p, game) {} });

  // 自定义 buff:
  // sw.buff('my_buff', { name: 'Example Buff', texture: 'textures/buff/x.png', onTick(p, g) {} });

  // 生命周期:
  // sw.system({ preUpdate(g, dt) {}, postEntities(g, dt) {}, postUpdate(g) {},
  //             onWorldLoad(g) {}, onWorldUnload(g) {} });
}
`;

/** 1×1 透明 PNG(base64;node 用 Buffer,勿 Uint8Array.from(atob())=全零判例) */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const TEMPLATE_MAIN_TS = `// SandboxWorld mod 入口(TypeScript;内容数据走 content/*.json)
// 类型契约=同目录 mod-api.d.ts(拷贝自引擎 templates/;IDE 悬停/补全全通)
import type { ModContext } from '../mod-api.d.ts';

export default function main(sw: ModContext): void {
  sw.log('mod ready (TS)');

  // 示例:弹幕命中钩(入口只挂行为;内容声明走 content/*.json)
  // sw.projectileHook('example_bolt', {
  //   onHit(p, _enemy, _game) { sw.log('hit @', p.x, p.y); },
  // });

  // 示例:浏览器独有接口(Tier1)
  // const page = sw.ui.htmlPage('main', { html: '<div>hello</div>' });
  // await sw.storage.set('first', true);   // 入口同步——异步面在钩内
}

// TS 编译链:build 命令自动经 esbuild 把 scripts/*.ts 编译为 scripts/main.js 进包;
// tsconfig.json 仅作 IDE/类型检查(noEmit)——构建零配置。
`;

function cmdInit(dir, opts = {}) {
  if (!dir) die('init 需要 <目标目录>');
  const root = resolve(dir);
  if (existsSync(root)) die(`目录已存在: ${root}`);
  const useTs = opts.ts === true;   // 缺省 js(与既有工程零迁移)
  mkdirSync(root, { recursive: true });
  const w = (p, data) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
  };
  w(join(root, 'mod.json'), JSON.stringify(TEMPLATE_MANIFEST, null, 2) + '\n');
  w(join(root, 'content/items/example_sword.json'), JSON.stringify(TEMPLATE_ITEM, null, 2) + '\n');
  w(join(root, 'textures/items/example_sword.png'), PNG_1PX);
  if (useTs) w(join(root, 'scripts/main.ts'), TEMPLATE_MAIN_TS);
  else w(join(root, 'scripts/main.js'), TEMPLATE_MAIN_JS);
  // 类型契约(P4):两形态都拷(d.ts 零副作用;js 工程也享 IDE 类型)
  try {
    const apiDts = readFileSync(join(dirname(new URL(import.meta.url).pathname), '..', 'templates', 'mod-api.d.ts'));
    w(join(root, 'mod-api.d.ts'), apiDts);
    if (useTs) {
      w(join(root, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2020', module: 'ESNext', moduleResolution: 'Bundler',
          strict: true, noEmit: true, skipLibCheck: true,
        },
        include: ['mod-api.d.ts', 'scripts/**/*.ts'],
      }, null, 2) + '\n');
    } else {
      // js 工程:checkJs 可选开(悬停有类型;严格度低)
      w(join(root, 'jsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2020', module: 'ESNext', moduleResolution: 'Bundler',
          checkJs: false, allowJs: true, noEmit: true, skipLibCheck: true,
        },
        include: ['mod-api.d.ts', 'scripts/**/*.js'],
      }, null, 2) + '\n');
    }
  } catch { /* 模板缺失=跳过(打包面不受影响) */ }
  w(join(root, 'README.md'), `# ${TEMPLATE_MANIFEST.name}\n\nSandboxWorld mod 工程。\n\n\`\`\`sh\n# 打包(在 game/ 目录):\nnode scripts/mod-cli.mjs build ${basename(root)}   # 输出到 mods/dist/<id>.swmod\n\`\`\`\n`);
  console.log(`[sw-mod] 模板工程已生成: ${root}`);
  console.log('[sw-mod] 下一步: node scripts/mod-cli.mjs build ' + basename(root));
}

// ---- build:目录 → .swmod zip ----

function walkFiles(root, rel = '', out = []) {
  for (const name of readdirSync(join(root, rel))) {
    const p = rel ? `${rel}/${name}` : name;
    const st = statSync(join(root, p));
    if (st.isDirectory()) walkFiles(root, p, out);
    else out.push(p);
  }
  return out;
}

async function cmdBuild(dir, outPath) {
  if (!dir) die('build 需要 <工程目录>');
  const root = resolve(dir);
  if (!existsSync(join(root, 'mod.json'))) die(`缺 mod.json: ${root}`);
  const files = walkFiles(root);
  const entries = {};
  for (const rel of files) entries[rel.split('\\').join('/')] = new Uint8Array(readFileSync(join(root, rel)));
  // ★TS 工程:scripts/*.ts 自动编译为同名 .js 进包(esbuild;源 .ts 不入包——
  //  引擎 blob 装载只认 js)。编译失败 fail-loud(包不带残缺 js)。js 工程零路径。
  const tsFiles = Object.keys(entries).filter((f) => /^scripts\/.*\.ts$/.test(f));
  if (tsFiles.length > 0) {
    let esbuild;
    try {
      esbuild = await import('esbuild');
    } catch {
      die('TypeScript 工程需 esbuild(game/node_modules 已带;在 game/ 目录运行)');
    }
    for (const tsf of tsFiles) {
      delete entries[tsf];
      const jsf = tsf.replace(/\.ts$/, '.js');
      // 同名 .js 已存在(js/ts 混放)= ts 优先但警告
      if (entries[jsf]) console.warn(`[sw-mod] ${jsf} 与 ${tsf} 同名——ts 编译版覆盖`);
      const r = await esbuild.transform(strFromU8(readFileSync(join(root, tsf))), {
        loader: 'ts', format: 'esm', target: 'es2020',
      });
      entries[jsf] = new TextEncoder().encode(r.code);
    }
  }
  const manifest = JSON.parse(strFromU8(entries['mod.json']));
  if (!ID_RE.test(manifest.id ?? '')) die(`mod.json id 非法: ${manifest.id}`);
  // ★默认输出=mods/dist/(用户拍板 2026-10-06:swmod 不落 game 根;探针等消费方
  //  均按 game/mods/dist/calamity.swmod 取包)。-o 显式指定时原样尊重。
  const defaultOut = resolve(dirname(root), 'dist', `${manifest.id}.swmod`);
  mkdirSync(dirname(defaultOut), { recursive: true });
  const out = outPath ?? defaultOut;
  const zip = zipSync(entries);
  writeFileSync(resolve(out), zip);
  console.log(`[sw-mod] 打包完成: ${resolve(out)} (${files.length} 文件, ${(zip.length / 1024).toFixed(1)} KB)`);
}

// ---- validate:工程目录或 .swmod ----

function validatePack(files) {
  const errs = [];
  if (!files['mod.json']) return ['缺 mod.json'];
  let manifest;
  try { manifest = JSON.parse(strFromU8(files['mod.json'])); }
  catch (e) { return [`mod.json 解析失败: ${e.message}`]; }
  if (!ID_RE.test(manifest.id ?? '')) errs.push(`id 非法: ${manifest.id}`);
  if (!SEMVER_RE.test(manifest.version ?? '')) errs.push(`version 须 x.y.z: ${manifest.version}`);
  if (manifest.api !== 1) errs.push(`api 不受支持: ${manifest.api}`);
  const itemKeys = new Set();
  const projKeys = new Set();
  for (const [path, bytes] of Object.entries(files)) {
    if (!path.startsWith('content/') || !path.endsWith('.json') || path === 'content/recipes.json' || path === 'content/shops.json') continue;
    try {
      const spec = JSON.parse(strFromU8(bytes));
      if (!KEY_RE.test(spec.key ?? '')) { errs.push(`${path}: key 非法/缺失`); continue; }
      if (path.startsWith('content/items/')) itemKeys.add(spec.key);
      if (path.startsWith('content/projectiles/')) projKeys.add(spec.key);
      const tex = spec.texture;
      if (tex && !files[tex] && !files[tex.replace(/^textures\//, '')]) errs.push(`${path}: 贴图缺失 ${tex}`);
    } catch (e) { errs.push(`${path}: JSON 解析失败 ${e.message}`); }
  }
  // 配方引用
  if (files['content/recipes.json']) {
    try {
      const list = JSON.parse(strFromU8(files['content/recipes.json']));
      for (const r of (Array.isArray(list) ? list : list.recipes ?? [])) {
        const refOk = (raw) => /^\d+$/.test(raw) || itemKeys.has(raw);
        if (!refOk(r.create)) errs.push(`recipes.json: create 引用未注册物品 ${r.create}`);
        for (const it of r.items ?? []) if (!refOk(it.item)) errs.push(`recipes.json: 引用未注册物品 ${it.item}`);
      }
    } catch (e) { errs.push(`content/recipes.json 解析失败: ${e.message}`); }
  }
  // 物品 shoot 引用
  for (const [path, bytes] of Object.entries(files)) {
    if (!path.startsWith('content/items/') || !path.endsWith('.json')) continue;
    try {
      const spec = JSON.parse(strFromU8(bytes));
      const sh = spec.combat?.shoot;
      if (typeof sh === 'string' && sh.startsWith('proj:')) {
        const key = sh.slice(5);
        if (!projKeys.has(key)) errs.push(`${path}: shoot 引用未注册弹幕 ${sh}`);
      }
    } catch { /* 上循环已报 */ }
  }
  return errs;
}

function cmdValidate(target) {
  if (!target) die('validate 需要 <工程目录|.swmod>');
  const p = resolve(target);
  let files;
  if (existsSync(p) && statSync(p).isDirectory()) {
    files = {};
    for (const rel of walkFiles(p)) files[rel.split('\\').join('/')] = new Uint8Array(readFileSync(join(p, rel)));
  } else {
    files = unzipSync(new Uint8Array(readFileSync(p)));
  }
  const errs = validatePack(files);
  if (errs.length) { errs.forEach((e) => console.error('[sw-mod] ✗ ' + e)); die(`校验失败(${errs.length} 项)`); }
  console.log('[sw-mod] ✓ 校验通过: ' + Object.keys(files).length + ' 文件');
}

switch (cmd) {
  case 'init': cmdInit(arg, { ts: process.argv.includes('--ts'), js: process.argv.includes('--js') }); break;
  case 'build': {
    const oi = process.argv.indexOf('-o');
    await cmdBuild(arg, oi > 0 ? process.argv[oi + 1] : undefined);
    break;
  }
  case 'validate': cmdValidate(arg); break;
  default:
    console.log('用法: node scripts/mod-cli.mjs init|build|validate <...>');
    process.exit(cmd ? 1 : 0);
}
