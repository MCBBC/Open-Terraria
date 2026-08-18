// _glpar-probe:WebGL2 迁移(#1 背景/#2 全屏地图)像素对拍
// 同一大世界存档,GL(?bggl 默认开) vs 2D(?bggl=0&mapgl=0) 各跑一遍:
// 钉死时钟(黄昏=满 tint 压力)+玩家落点 → 网格采样主画布 → 节点侧逐点比对。
// 采样避开 HUD/实体动画噪声:地表取上半屏(天空+背景层),地图取全屏。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });

async function runSession(query) {
  const p = await b.newPage();
  p.on('pageerror', e => console.log(`[pageerr ${query}]`, String(e).slice(0, 140)));
  p.on('console', m => { const t = m.text(); if (t.includes('GLSpriteLayer') || t.includes('[bitmap失败')) console.log(`[${query}]`, t.slice(0, 120)); });
  await p.goto(`${ORIGIN}/${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise(r => setTimeout(r, 5000));
  const ok = await p.evaluate(async () => {
    const r = await fetch('/tmp-glpar-world.json');
    if (!r.ok) return `fetch ${r.status}`;
    await window.__swFlow.loadJson(await r.text());
    return 'ok';
  }).catch(e => String(e));
  if (ok !== 'ok') { console.log(`[${query}] loadJson 失败:`, ok); await p.close(); return null; }
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
  }
  await new Promise(r => setTimeout(r, 6000));
  // 钉死状态:时钟=黄昏 0.75(tint 满压)+玩家=出生点(地表森林)
  await p.evaluate(() => {
    const g = window.__swGame;
    g.world.clock.timeOfDay = 0.75;
    const p2 = g.player;
    p2.x = (g.world.spawnX - 2) * 16; p2.y = (g.world.spawnY - 3) * 16;
    p2.vx = 0; p2.vy = 0;
  });
  await new Promise(r => setTimeout(r, 2500));
  const sample = await p.evaluate((region) => {
    const c = window.__swGame.renderer.canvas;
    const ctx = c.getContext('2d');
    const GX = 96, GY = region === 'surface' ? 30 : 54;   // 地表只取上半屏(避开实体/尘)
    const y0 = 0, y1 = region === 'surface' ? Math.floor(c.height * 0.55) : c.height;
    const out = [];
    for (let j = 0; j < GY; j++) {
      for (let i = 0; i < GX; i++) {
        const x = Math.floor((i + 0.5) * c.width / GX);
        const y = Math.floor(y0 + (j + 0.5) * (y1 - y0) / GY);
        const d = ctx.getImageData(x, y, 1, 1).data;
        out.push(d[0], d[1], d[2], d[3]);
      }
    }
    return { w: c.width, h: c.height, data: out };
  }, 'surface');
  // 开全屏地图(直接置态,跳过缩放缓动)
  await p.evaluate(() => {
    const g = window.__swGame;
    const fm = g.renderer.fullMap;
    fm.open = true; fm.zoom = 1.25; fm.zoomTarget = 1.25;
    fm.panX = g.world.w * 1.25 / 2 - (g.player.cx / 16) * 1.25 - g.renderer.canvas.width / 2 + g.world.w * 1.25 / 2;
    fm.panX = 0; fm.panY = 0;
  });
  await new Promise(r => setTimeout(r, 1200));
  const mapSample = await p.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const ctx = c.getContext('2d');
    const GX = 96, GY = 54;
    const out = [];
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const x = Math.floor((i + 0.5) * c.width / GX);
      const y = Math.floor((j + 0.5) * c.height / GY);
      const d = ctx.getImageData(x, y, 1, 1).data;
      out.push(d[0], d[1], d[2], d[3]);
    }
    return { w: c.width, h: c.height, data: out };
  });
  await p.close();
  return { sample, mapSample };
}

function compare(name, A, B) {
  if (!A || !B) { console.log(`${name}: 采样缺失`); return; }
  const n = Math.min(A.data.length, B.data.length);
  let maxD = 0, sum = 0, over8 = 0, cnt = 0;
  for (let i = 0; i < n; i += 4) {
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > maxD) maxD = d;
    sum += d; cnt++;
    if (d > 8) over8++;
  }
  console.log(`${name}: 采样${cnt}点 | 最大Δ=${maxD} | 平均Δ=${(sum / cnt).toFixed(2)} | Δ>8 占比=${(over8 / cnt * 100).toFixed(2)}%`);
}

console.log('== GL 会话(默认) ==');
const gl = await runSession('?rlog=0');
console.log('== 2D 会话(?bggl=0&mapgl=0) ==');
const c2d = await runSession('?bggl=0&mapgl=0&rlog=0');
console.log('\n---- 对拍结果 ----');
compare('#1 背景(地表·黄昏)', gl?.sample, c2d?.sample);
compare('#2 全屏地图(zoom1.25)', gl?.mapSample, c2d?.mapSample);
await b.close(); process.exit(0);
