// 一次性诊断：贝壳堆链路插桩(shellStart 记录→盒扫描→shellPile 返回值)
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_shell-debug.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199'), { waitUntil: 'networkidle0', timeout: 60000 });

const out = await page.evaluate(async () => {
  const beach = await import('/src/world/gen/vanilla/BeachPass.ts');
  const gsMod = await import('/src/world/gen/vanilla/GenState.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => { BK[d.key] = i; });
  const { RNG } = await import('/src/core/rng.ts');

  // 手动走前置链太长——直接跑完整 generateWorld，在 onWorldPartial 的"海滩装饰"pass
  // 前后采样 gs（lastGenState 在 pass 后可用）。改为 monkey-patch 统计：
  const mod = await import('/src/world/gen/WorldGen.ts');
  const calls = [];
  const orig = beach.runBeachDecorPass;
  // BeachPass 模块内 shellPile 未导出——统计靠前后网格差分
  let world = null;
  let shellBefore = -1, shellAfter = -1;
  const cntShell = (st) => { const S = BK['v_495_shell_pile_block']; let n = 0; for (let i = 0; i < st.type.length; i++) if (st.type[i] === S) n++; return n; };
  world = await mod.generateWorld({
    width: 4200, height: 1200, seedText: '123456', name: 'dbg',
    onWorldPartial: (w, _i, name) => {
      const gs = mod.lastGenState();
      if (name === '水体沉降') { shellBefore = cntShell(w.store); }
      if (name === '海滩装饰') { shellAfter = cntShell(w.store); }
      if (name === '海滩装饰' || name === '水体沉降') {
        calls.push({ name, shellStart: gs ? { xl: gs.shellStartXLeft, yl: gs.shellStartYLeft, xr: gs.shellStartXRight, yr: gs.shellStartYRight } : null, worldSurface: gs?.worldSurface, shellBefore, shellAfter });
      }
    },
  });
  const gs = mod.lastGenState();
  // 海滩装饰后 gs 已被盒扫描改写——看最终值
  return { calls, finalShellStart: { xl: gs.shellStartXLeft, yl: gs.shellStartYLeft, xr: gs.shellStartXRight, yr: gs.shellStartYRight }, worldSurface: gs.worldSurface, shellTotal: cntShell(world.store) };
});
console.log(JSON.stringify(out));
console.log('pageerrors:', errors.slice(0, 5));
await browser.close();
