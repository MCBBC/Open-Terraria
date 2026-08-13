// 雪原天气探针（一次性）：① 雨天雪原雨量≈0 且雪粒系统活(暴风雪) ② 晴天雪原轻雪
//   ③ 涟漪(环)已退役——Weather.ripples 池不存在 ④ 雨落水 splash 粒子位置=表面一步回退
// 权威：Rain.cs:159-209(雪区削减) / Main.cs:12964-13045(snowing) / Rain.cs:120-133(splash)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5199'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 找雪原列(sheet 147/148 雪块/雪砖密集)并传送
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const w = st.w, h = st.h;
  const snowSheet = (t) => { const d = g.__tileDef?.(t); return d; };
  // 用类型注册表反查(渲染侧暴露 TILE_DEFS 太深——直接扫 store type 的 mapColor 不可得,
  // 改扫帧上小地图不可行;走 __swTileSheets? 简化:直接数各列 sheet==147 的格数)
  // sheet 147 的内部 id 反查:借 Renderer 无;改由 type 频率列直方图 + 已知雪块 drop 593?
  // 最稳:直接调 atlas 无关的 store 扫描,先取内部 id:遍历 TILE_DEFS 不行→
  // 用 Game 暴露的 debugSpawnNpc 无关。退而求其次:雪原在 small 世界一侧,扫
  // mapColor '#D3ECF1' 的小地图不可得。走 world.genState? 直接扫 store 找大片
  // snow:小世界雪原特征=表面下大量 sheet147。此处通过 tile id: snow 内部 id 可由
  // g.__swItems 反查 place 键... 太绕——改用 hooks:渲染器 attach 的 hooks.snowTileCount
  // 本身就是 SceneMetrics 计数,分列扫太贵;直接全图粗扫 32 列粒度找 147。
  void snowSheet; void w; void h;
  return { todo: true };
});
// 上面的通用反查太绕——直接在页面里 import tiles 模块拿 sheet 147 内部 id
const snowInfo = await page.evaluate(async () => {
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  let snowId = -1;
  for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === 147) { snowId = i; break; }
  // 列直方图:每 16 列采样 24 行(表面下)数雪格
  const colSnow = new Array(Math.ceil(st.w / 16)).fill(0);
  for (let cx = 0; cx < colSnow.length; cx++) {
    const x0 = cx * 16;
    for (let x = x0; x < x0 + 16; x += 2) {
      for (let y = 60; y < 60 + 48; y += 2) {
        if (st.type[st.idx(x, y)] === snowId) colSnow[cx]++;
      }
    }
  }
  let best = 0, bestCount = 0;
  for (let i = 0; i < colSnow.length; i++) if (colSnow[i] > bestCount) { bestCount = colSnow[i]; best = i; }
  // 雪原中心列的表面行
  const cx2 = best * 16 + 8;
  let surf = 0;
  for (let y = 10; y < st.h; y++) if (st.flags[st.idx(cx2, y)]) { surf = y; break; }
  return { snowId, bestCol: cx2, surf, bestCount };
});
check('定位雪原列', snowInfo.bestCount > 20, JSON.stringify(snowInfo));

// 传送玩家到雪原表面
await page.evaluate((s) => {
  const g = window.__swGame;
  g.player.x = s.bestCol * 16 - 8;
  g.player.y = (s.surf - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
}, snowInfo);
await new Promise((r) => setTimeout(r, 1500));

// ① 晴天雪原:等 hooks 刷新,断言雪粒池有活片(轻雪)
const sunny = await page.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now();
  const iv = setInterval(() => {
    const g = window.__swGame;
    const fx = g.renderer.weatherFx;
    const live = fx.snow.filter((f) => f.active).length;
    const hooks = fx.hooks;
    if (live > 5 || performance.now() - t0 > 8000) {
      clearInterval(iv);
      resolve({ live, snowTileCount: hooks?.snowTileCount ?? -1, cloudAlpha: g.world.weather.cloudAlpha });
    }
  }, 200);
}));
check('① 晴天雪原轻雪(snowing 常开)', sunny.live > 5, JSON.stringify(sunny));

// ② 强制下雨(雨强 1) → 暴风雪:雪粒大增 + 雨滴在雪区 ≈0
await page.evaluate(() => {
  const g = window.__swGame;
  g.world.weather.startRain(true, 1);
  g.world.weather.cloudAlpha = 0.9;   // 跳过缓动
});
await new Promise((r) => setTimeout(r, 2500));
const blizzard = await page.evaluate(() => {
  const g = window.__swGame;
  const fx = g.renderer.weatherFx;
  return {
    snowLive: fx.snow.filter((f) => f.active).length,
    rainLive: fx.pool.filter((d) => d.active).length,
    snowTileCount: fx.hooks?.snowTileCount ?? -1,
    cloudAlpha: g.world.weather.cloudAlpha,
    raining: g.world.weather.raining,
  };
});
check('②a 雨天雪原=暴风雪(雪粒>50)', blizzard.snowLive > 50, JSON.stringify(blizzard));
check('②b 雨滴被雪区削减(≈0)', blizzard.rainLive <= 5, `rainLive=${blizzard.rainLive}`);

// ③ 环状涟漪池已退役(Weather 无 ripples 字段)
const rippleGone = await page.evaluate(() => {
  const g = window.__swGame;
  return { has: 'ripples' in g.world.weather, budget: typeof g.world.weather.rippleBudget };
});
check('③ 自创环涟漪系统已退役', !rippleGone.has && rippleGone.budget === 'undefined', JSON.stringify(rippleGone));

// ④ splash 位置:造一小片水+观察粒子——轻量近似:验证 WeatherRenderer splash 公式
//    位置=d.x-vx-2(检查源码级不可行,改行为:放水 2 格在雪原表面,强制雨滴落上,
//    采样 particles 中 '#B8D0E8' 粒子位置 vs 水面顶)
const splash = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  const ptx = Math.floor(p.cx / 16), pty = Math.floor(p.cy / 16);
  // 玩家右侧 4 格挖 6 宽坑填水(顶 2 行留空)
  for (let x = ptx + 4; x < ptx + 10; x++) {
    for (let y = pty; y < pty + 3; y++) {
      const i = st.idx(x, y);
      st.flags[i] = 0; st.type[i] = 0;
    }
    for (let y = pty; y < pty + 3; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255; st.liquidType[i] = 1;
    }
  }
  g.chunks.invalidateAll();
  return { ptx, pty };
});
await new Promise((r) => setTimeout(r, 2000));
const splashPos = await page.evaluate((s) => {
  const g = window.__swGame;
  const surfaceY = s.pty * 16;
  // 采 3 秒内的蓝色 splash 粒子位置
  const seen = [];
  const t0 = performance.now();
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      for (const p of g.particles) {
        if (p.color === '#B8D0E8' && p.x > (s.ptx + 3) * 16 && p.x < (s.ptx + 11) * 16
          && Math.abs(p.y - surfaceY) < 40) seen.push(Math.round(p.y - surfaceY));
      }
      if (performance.now() - t0 > 3000 || seen.length >= 8) {
        clearInterval(iv);
        resolve({ n: seen.length, offs: seen.slice(0, 8) });
      }
    }, 100);
  });
}, splash);
// 原版 splash = 落点回退一步(-v≈-14)+2 → 应在水面附近 ±(2..18)px(不再深 14px+)
check('④ splash 位置=水面附近(偏移带 -12..+18)', splashPos.n === 0
  || splashPos.offs.every((o) => o >= -12 && o <= 18), JSON.stringify(splashPos));
check('④b 实际有 splash 粒子产生', splashPos.n > 0, `n=${splashPos.n}`);

check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
