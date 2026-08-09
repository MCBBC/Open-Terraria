// 陷阱弹幕贴图活体验证:摆 137(frameY=18 火焰)电路 → hitSwitch → 采样弹幕像素
// 判据:贴图分支=多色渐变像素;色块回退=单一 #FF8030
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 180000 });

const out = await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 500));
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const TRAP = tiles.TILE_BY_KEY['v_137_traps'];
  const LEVER = tiles.TILE_BY_KEY['v_136_switch'];

  // 出生点旁找平地:两格空气+下方实心
  let sx = -1, sy = -1;
  outer: for (let x = g.world.spawnX + 3; x < g.world.spawnX + 80; x++) {
    for (let y = g.world.spawnY - 6; y < g.world.spawnY + 6; y++) {
      const i1 = st.idx(x, y), i2 = st.idx(x, y - 1), i3 = st.idx(x, y + 1);
      if (!st.flags[i1] && !st.flags[i2] && st.flags[i3]) { sx = x; sy = y; break outer; }
    }
  }
  if (sx < 0) return { err: 'no flat spot' };

  // 布两条电路（上下两行）:
  // 行 A: 火焰陷阱(kind1 frameY18) 朝右 —— 验证整帧 10×18 贴图
  // 行 B: 超级飞镖(kind2 frameY36) 朝右 —— 187 PNG 全透明,应回退色块(非隐形)
  const tyA = sy - 1, tyB = sy - 4;
  for (const ty of [tyA, tyB]) {
    for (let x = sx - 14; x <= sx; x++) {
      st.setTileSilent(x, ty, 0); st.setTileSilent(x, ty - 1, 0); st.setTileSilent(x, ty + 1, 0);
      st.wire[st.idx(x, ty)] = 0;
    }
    st.setTileSilent(sx - 14, ty, tiles.TILE_BY_KEY['v_43_green_brick'] ?? tiles.T.STONE);
    st.setTileSilent(sx, ty, LEVER, 0, 0);
    for (let x = sx - 13; x <= sx; x++) st.wire[st.idx(x, ty)] |= 1;
  }
  st.setTileSilent(sx - 13, tyA, TRAP, 18, 18);   // 朝右 + 火焰
  st.setTileSilent(sx - 13, tyB, TRAP, 18, 36);   // 朝右 + 超级飞镖

  // 触发两路后立即暂停:弹幕冻结在陷阱口,手动驱动渲染采样
  g.wiring.hitSwitch(sx, tyA);
  g.wiring.hitSwitch(sx, tyB);
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);
  g.paused = true; // 冻结逻辑帧(渲染循环仍走,相机可跟随后再采样)

  const projs = g.entities.projectiles.slice(-2);
  // 差分采样:弹幕在场 vs 临时移开,差值像素 = 精灵本体(背景墙/地形全部消去)
  const sample = async (proj) => {
    if (!proj) return null;
    g.player.x = proj.x - 60 - g.player.w / 2; g.player.y = proj.y - g.player.h / 2;
    g.camera.x = proj.x; g.camera.y = proj.y;
    await new Promise((r) => setTimeout(r, 600));
    const cx0 = Math.round(g.camera.worldToScreen(proj.cx, proj.cy)[0]);
    const cy0 = Math.round(g.camera.worldToScreen(proj.cx, proj.cy)[1]);
    const S = 16;
    const grab = () => g.renderer.ctx.getImageData(cx0 - S, cy0 - S, S * 2, S * 2).data;
    const withP = grab();
    const ox = proj.x;
    proj.x += 100000; // 临时移出画面(逻辑已暂停,不会自己动)
    await new Promise((r) => setTimeout(r, 200));
    const withoutP = grab();
    proj.x = ox;
    let diff = 0;
    const uniq = new Map();
    for (let p = 0; p < withP.length; p += 4) {
      const d = Math.abs(withP[p] - withoutP[p]) + Math.abs(withP[p + 1] - withoutP[p + 1]) + Math.abs(withP[p + 2] - withoutP[p + 2]);
      if (d > 60) {
        diff++;
        const key = [withP[p], withP[p + 1], withP[p + 2]].join(',');
        uniq.set(key, (uniq.get(key) ?? 0) + 1);
      }
    }
    return { kind: proj.kind, diff, uniq: uniq.size };
  };
  const flame = await sample(projs.find((p) => p.kind === 'flame'));
  const superdart = await sample(projs.find((p) => p.kind === 'superdart'));
  g.paused = false;
  return { circuit: [sx, sy], flame, superdart };
});
console.log(JSON.stringify(out, null, 1));
// 火焰整帧贴图:差分像素应显著多于旧 10×10 裁剪(≈60%×100px²≈94px),且多色渐变
// 超级飞镖:全透明图回退 6×6 色块(≈56px,单色为主),必须非零(非隐形)
const flameOk = out.flame && out.flame.diff > 140 && out.flame.uniq >= 8;
const dartOk = out.superdart && out.superdart.diff > 30;
console.log(`${flameOk ? 'PASS' : 'FAIL'}: 火焰整帧贴图(${out.flame?.diff}px/${out.flame?.uniq}色)  ${dartOk ? 'PASS' : 'FAIL'}: 超级飞镖回退可见(${out.superdart?.diff}px/${out.superdart?.uniq}色)`);
await browser.close();
process.exit(flameOk && dartOk ? 0 : 1);
