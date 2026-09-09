// SW-BJ52 一次性探针：并排/留缝/上叠三布局 宝箱右键逐像素命中图。
// 语义基准：1457 Player.cs:33314（光标 tile 本体 BasicChest 门）+:33317-33320
// 帧回溯原点 + :33497 Chest.FindChest 原点精确查 = 点箱任一本体格开本箱、
// 箱外格零命中。输出每像素列开的箱（A/B/C/.），与 tileUnder↔原版 floor 公式对拍。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  g.paused = true;   // ★冻结 rAF 主循环（世界更新/输入消费停）——防主循环以自身
                     // 鼠标坐标竞态开箱（首跑实證：主循环开出了世界生成箱）
  const tiles = await import('/src/data/tiles.ts');
  const CHEST = tiles.T.CHEST;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 8;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  // ---- 清场（地面上方 8 行 × 24 列，含液体）----
  for (let dy = -9; dy <= -1; dy++) for (let dx = -12; dx <= 12; dx++) {
    const x = px + dx, y = gy + dy;
    st.setTile(x, y, 0);
    st.liquid[st.idx(x, y)] = 0;
  }
  // ---- 地面整平 ----
  for (let dx = -12; dx <= 12; dx++) st.setTile(px + dx, gy, 2);
  // ---- 玩家落地（站在 gy 上：feet=gy*16）----
  g.player.x = px * 16; g.player.y = gy * 16 - 42; g.player.vx = 0; g.player.vy = 0;
  g.entities.npcs = []; g.entities.enemies = [];
  // 每个布局独立标注函数（用布局原点表直接判）
  const mkLabels = (chests) => (wx, wy) => {
    for (let i = 0; i < chests.length; i++) {
      const c = chests[i];
      if (!c) continue;
      if (wx >= c.x && wx <= c.x + 1 && wy >= c.y && wy <= c.y + 1) return 'ABC'[i];
    }
    return '.';
  };
  const results = {};

  const runLayout = (name, chests, scanRows) => {
    // 注册
    for (const c of chests) {
      if (!c) continue;
      for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++)
        st.setTile(c.x + dx, c.y + dy, CHEST, dx * 18, dy * 18);
      g.world.chests.push({ x: c.x, y: c.y, items: Array(40).fill(null) });
    }
    // 摄像机直对准靶区（Camera.x/y=视口中心世界 px；玩家瞬移后 follow 缓动未及）
    const last = chests.filter(Boolean).at(-1);
    g.camera.x = ((chests[0].x + last.x + 2) / 2) * 16;
    g.camera.y = (chests[0].y + 1) * 16;
    g.camera.punchX = 0; g.camera.punchY = 0;
    const rows = {};
    for (const [rowName, wy] of Object.entries(scanRows)) {
      let line = '';
      let ruler = '';
      const x0 = chests[0].x, x1 = (chests.filter(Boolean).at(-1)).x + 2;
      for (let wx = x0 * 16 - 8; wx < x1 * 16 + 8; wx++) {
        const [sx, sy] = g.camera.worldToScreen(wx + 0.5, wy + 0.5);
        if (sx < 0 || sx > 1279 || sy < 0 || sy > 799) { line += '?'; continue; }
        g.input.mouseX = sx; g.input.mouseY = sy;
        const [tx, ty] = g.camera.tileUnder(sx, sy);
        // tileUnder↔原版 (int)((mouseX+screenPosition.X)/16f) 对拍（floor 语义）
        const [wxp, wyp] = g.camera.screenToWorld(sx, sy);
        if (Math.floor(wxp / 16) !== tx || Math.floor(wyp / 16) !== ty) line += '!';
        g.input.rightDown = true; g._prevRightDown = false;
        try { g.rightClickTileNpcDispatch(tx, ty, null); } catch (e) { line += 'E'; continue; }
        const opened = g.openChestRef && g.openChestRef();
        let ch = '.';
        if (opened && opened.x !== undefined && opened.x >= 0) {
          const oc = chests.findIndex((c) => c && opened.x === c.x && opened.y === c.y);
          ch = oc >= 0 ? 'ABC'[oc] : '?';
        }
        line += ch;
        // 复位：关面板 + 收边沿
        if (g.closeChestPanel) g.closeChestPanel();
        g.input.rightDown = false;
        if (wx % 16 === 0) ruler += '^'; else ruler += ' ';
      }
      rows[rowName] = { line, ruler };
    }
    results[name] = { chests: chests.map((c) => c && { x: c.x, y: c.y }), rows };
    // 拆箱注销
    for (const c of chests) {
      if (!c) continue;
      for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) st.setTile(c.x + dx, c.y + dy, 0);
    }
    g.world.chests = [];
  };

  // ---- 布局 1：并排三箱无缝（列 px+1/px+3/px+5，行 gy-2..gy-1）----
  const A1 = { x: px + 1, y: gy - 2 }, B1 = { x: px + 3, y: gy - 2 }, C1 = { x: px + 5, y: gy - 2 };
  // ---- 布局 2：留缝（A=px+1..2，缝=px+3，B=px+4..5）----
  const A2 = { x: px + 1, y: gy - 2 }, B2 = { x: px + 4, y: gy - 2 };
  // ---- 布局 3：上叠-隔实心砖（A 行 gy-5..gy-4 / 砖 gy-3 / B 行 gy-2..gy-1，同列）。
  //  ★原版箱须实心支撑（PlaceTile），箱上直叠第二箱不可建造；本布局为可建造形态。
  //  探针先验：直贴叠（A3 y=gy-4）在部分 run 被支撑面整拆 tile（注册表留存）——
  //  非法几何探针伪影，登记备查 ----
  const A3 = { x: px + 1, y: gy - 5 }, B3 = { x: px + 1, y: gy - 2 };

  runLayout('L1-并排无缝', [A1, B1, C1], {
    顶行mid: (A1.y) * 16 + 8,
    底行mid: (A1.y + 1) * 16 + 8,
    箱上一行: (A1.y - 1) * 16 + 8,
    箱下一行: (A1.y + 2) * 16 + 8,
  });
  runLayout('L2-留缝', [A2, B2], {
    底行mid: (A2.y + 1) * 16 + 8,
  });
  // L3 隔砖行（A 箱的实心支撑；原版可建造的上下叠形态）
  for (let dx = 0; dx <= 1; dx++) st.setTile(px + 1 + dx, gy - 3, 1);
  runLayout('L3-上叠隔砖', [A3, B3], {
    上箱顶行: (A3.y) * 16 + 8,
    上箱底行: (A3.y + 1) * 16 + 8,
    隔砖行: (A3.y + 2) * 16 + 8,
    下箱顶行: (B3.y) * 16 + 8,
    下箱底行: (B3.y + 1) * 16 + 8,
  });
  return { px, gy, results };
});

const fmt = (name, data) => {
  console.log(`\n== ${name} ==  箱原点: ${JSON.stringify(data.chests)}`);
  for (const [row, { line, ruler }] of Object.entries(data.rows)) {
    console.log(`  ${row}:`);
    console.log(`    ${ruler}`);
    console.log(`    ${line}`);
  }
};
for (const [name, data] of Object.entries(out.results)) fmt(name, data);
console.log(`\n玩家tile px=${out.px} 地面 gy=${out.gy}（'^'=tile 界, 16px/格; A/B/C=开的箱, .=零命中, !=tileUnder↔vanilla公式失配, E=异常）`);
await browser.close();
