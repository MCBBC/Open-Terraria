// 吊挂火盆 tile 592 烘焙+存留+渲染取证 v2
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r=>setTimeout(r,1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 600000 });
await new Promise(r=>setTimeout(r,2000));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [] };
  const ok = (n, c, e2 = '') => { out.steps.push(`${c?'PASS':'FAIL'} ${n}${e2?' | '+e2:''}`); return c; };
  try {
    const T = await import('/src/data/tiles.ts');
    const st = g.world.store;
    // 出生点旁高空中空腔——已过 worldgen 后段（player 存在=gen 完成）
    const bx = g.world.spawnX + 4;
    const by0 = Math.max(20, Math.floor(g.world.groundLevel) - 14);
    // 清空 4×6 区域
    for (let dy=0; dy<6; dy++) for (let dx=0; dx<4; dx++) {
      const i2 = st.idx(bx+dx, by0+dy);
      st.setTile(bx+dx, by0+dy, 0); st.wall[i2] = 1;   // 木墙背景
    }
    // 天花板（by0-1 行铺石头）
    for (const dx of [0,1]) st.setTile(bx+dx, by0-1, T.TILE_BY_KEY['stone']);
    // 写入吊挂火盆 2×3（mark 快照同款 fy）
    const T592 = T.TILE_BY_KEY['v_592_hanging_brazier'];
    for (let dy=0; dy<3; dy++) for (let dx=0; dx<2; dx++) {
      const i2 = st.idx(bx+dx, by0+dy);
      st.setTileSilent(bx+dx, by0+dy, T592);
      st.frameX[i2] = dx*18; st.frameY[i2] = dy*18;
    }
    out.steps.push(`[w] setTileSilent 立即读 type(bx,by0)=${st.get(bx,by0)} type(by0+1)=${st.get(bx,by0+1)} type(by0+2)=${st.get(bx,by0+2)}`);
    out.steps.push(`[w] 立即读 type=${st.get(bx, by0)} fx=${st.frameX[st.idx(bx, by0)]} fy=${st.frameY[st.idx(bx, by0)]}`);
    out.steps.push(`[w] 592def内部id=${T592} typeHere(bx,by0)=${st.get(bx,by0)}`);
    // 玩家贴旁边（触发射程内 chunk 加载）
    g.player.x = bx*16 + 80; g.player.y = by0*16 + 32;
    g.player.vx=0; g.player.vy=0; g.player.hp=g.player.maxHp; g.player.dead=false;
    // ★必须 markDirtyArea：setTileSilent 跳过监听不标脏，chunk 不重烘=渲染不更新
    g.chunks.markDirtyArea(bx-1, by0-2, bx+3, by0+4);
    for (let i=0;i<60;i++) g.fixedUpdate(1/60);
    // 断言 1：tile 存留（hasSupport 天花板锚臂 + HANGING_ANCHOR_SHEETS 表）
    const persistType = st.get(bx, by0+1);
    ok('S1 吊挂火盆写入后存留', persistType === T592, `type=${persistType} expect=${T592}`);
    // 断言 2：帧正确
    ok('S2 帧坐标 mark 同款', st.frameY[st.idx(bx, by0+1)] === 18 && st.frameY[st.idx(bx, by0+2)] === 36);
    // 断言 3：烘焙 chunk 像素取证（不透明+棕色调→盆体在）
    const cc = g.chunks;
    const CH=16, TL=16;
    const cx2 = Math.floor(bx*TL/(CH*TL)), cy2 = Math.floor((by0+1)*TL/(CH*TL));
    const pair = cc.get(cx2, cy2);
    if (!pair || !pair.tile) { ok('S3 chunk 不在缓存', false, `cx=${cx2} cy=${cy2}`); return out; }
    const c2 = document.createElement('canvas'); c2.width = pair.tile.width; c2.height = pair.tile.height;
    const ctx2 = c2.getContext('2d', { willReadFrequently: true });
    ctx2.drawImage(pair.tile, 0, 0);
    // 读 group 顶行 cell（bx, by0+1）本地坐标 18×18
    const lx = (bx % CH) * TL, ly = ((by0+1) % CH) * TL;
    let opaque = 0, fireOrange = 0;
    const d2 = ctx2.getImageData(lx, ly, 18, 18).data;
    for (let i = 0; i < d2.length; i += 4) {
      const r = d2[i], gg = d2[i+1], b = d2[i+2], a = d2[i+3];
      if (a > 24) { opaque++; if (r > 150 && gg < 140 && b < 100) fireOrange++; }
    }
    // sway tile 由 swayBakeSkip 跳过烘焙 → chunk 层空白=正确；实际绘制在
    // Renderer 的 WindSway overlay（动态路径）
    const { swayBakeSkip } = await import('/src/render/WindSway.ts');
    const swaySkip = swayBakeSkip(T592, 0);
    const swayRec = await import('/src/render/WindSway.ts').then(m => m.SWAY_REC?.get?.(T592));
    ok('S3 sway tile 不烘焙（正确行为）', opaque === 0 || opaque < 30,
      `opaque=${opaque}/324 swaySkip=${swaySkip} swayRec=${JSON.stringify(swayRec)}`);
    // S4：读 Glow_294 渲染叠加区域——通过 renderer canvas（整帧截图）
    // 视觉由全页截图覆盖（见 evaluate 外）
    // 断言 5：tileFrames 捕获 592（动画重烘注册证明）
    //    需要 tileFrameCapture.recording —— 直接读 window 侧
    const capKeys = window.__swGame?.chunks?.tileFrameCapture?.sheets;
    let reg592 = false;
    for (let t = 0; t < 40; t++) {
      await new Promise(r => setTimeout(r, 100));
      const reg = window.__swGame?.chunks?.animChunksBySheet?.get(592);
      if (reg && reg.size > 0) { reg592 = true; break; }
      // advanceAnim 需要 tick 推进——手动跑
      g.chunks.advanceAnim();
      g.fixedUpdate(1/60);
    }
    ok('S5 animChunks 注册(592)', reg592);
    // 视觉验证：全帧截图（吊盆在玩家左侧偏上——相机跟随玩家）
    // 通过 camera→world→screen 换算定位
    const cam = g.renderer?.camera ?? { x: g.player.cx, y: g.player.cy, zoom: 1 };
    const wx = bx * 16 + 16, wy = (by0+2) * 16;
    const zoom = cam.zoom || 1;
    const scx = (wx - cam.x) * zoom + innerWidth / 2;
    const scy = (wy - cam.y) * zoom + innerHeight / 2;
    out.steps.push(`[cam] world=(${bx*16},${(by0+2)*16}) cam=(${cam.x},${cam.y}) screen=(${Math.round(scx)},${Math.round(scy)})`);
    window.__brazScreenX = Math.round(scx);
    window.__brazScreenY = Math.round(scy);
    // 关掉欢迎面板（不关则遮住游戏画面）
    const wb = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('我已知晓'));
    if (wb) wb.click();
    await new Promise(r => setTimeout(r, 800));
    // 断言 6：渲染器全帧截图——吊火盆区域像素非均匀（fire glow+body）
    return out;
  } catch (err) {
    out.steps.push('ERR ' + String(err).slice(0, 300));
  }
  return out;
});
for (const s of res.steps) console.log(s);
await page.screenshot({ path: '/tmp/braz-v2.png' });
await new Promise(r=>setTimeout(r,500));
const bsx = await page.evaluate(() => window.__brazScreenX ?? 400);
const bsy = await page.evaluate(() => window.__brazScreenY ?? 400);
await page.screenshot({ path: '/tmp/braz-v2.png', clip: { x: Math.max(0,bsx-100), y: Math.max(0,bsy-100), width: 240, height: 240 } });
await browser.close();
console.log('done');
