// IIII230 探针 v2：TOW(Otherworld) 选曲链进图验证（UpdateAudio_DecideOnTOWMusic
// 1458 Main.cs:11789-12336 → src/data/Music.ts pickTowMusic + Game.ts drunkTow 派发）。
//   D 组：drunk 世界（05162020）多场景曲 id 断言——昼63/夜64/地狱71/太空70/雪72/
//         微光72(:12113 锚支,去液→65 对照)/丛林86/腐化73/双邪恶血主75/地牢69/
//         沙漠66/海洋67/血月79/日食79/风暴62/雨62/boss 族(81/84/87/80)/月事件82
//   N 组：非 drunk 零扰动对照——normal/ftw 经典链（1/18、3、36、42/15、14、8、7、
//         微光91 非72、EoC 5 非81、血月2 非79）；remix/zenith 42 非70。
// v2 修正：全场窗 clearUntilClean（drunk 散布/remix 倒置层残留）;weatherCounter 冻结
//   （天气 RNG 重掷雨致 62 污染）;N 组 expectMusic 泵后取值;boss 事件夜间+活性前置
//   断言（不活=SKIP 探针限界,槽表语义由单测覆盖）;zenith 种子='getfixedboi'。
// 用法: SW_ORIGIN=http://localhost:5286 node tools/run-diag.mjs scripts/_iii230-tow-music.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

async function bootWorld(seed) {
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000, polling: 500 });
  await page.evaluate((s) => { window.__swFlow.newWorld(s, 4200, 1200); }, seed);
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 600000, polling: 1000 });
  await new Promise((r) => setTimeout(r, 1500));
}

// 每个世界一套完整场景（inPage 由 page.evaluate 执行）
async function runSuite(seed, tag) {
  await bootWorld(seed);
  return page.evaluate(async (tag) => {
    const g = window.__swGame, w = g.world, st = w.store;
    const R = [];
    const chk = (name, ok, extra = '') => { R.push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); return ok; };
    const pump = (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); };
    const { TILE_DEFS } = await import('/src/data/tiles.ts');
    const { scanScene } = await import('/src/world/SceneMetrics.ts');
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const sheetId = (sheet) => { for (let i = 0; i < TILE_DEFS.length; i++) { const d = TILE_DEFS[i]; if (d?.vanilla?.sheet === sheet) return i; } throw new Error('sheet ' + sheet); };
    const inB = (x, y) => x >= 0 && y >= 0 && x < st.w && y < st.h;
    const clearRect = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inB(x, y)) { st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0); } };
    const patch = (x0, y0, ww, hh, tile, wall = 0) => { for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) if (inB(x, y)) { st.setTileSilent(x, y, tile, 0, 0); if (wall) st.setWallSilent(x, y, wall); } };
    const floorAt = (cx, ty) => patch(cx - 30, ty, 61, 3, sheetId(0));
    const tp = (tx, ty) => { g.player.x = tx * 16; g.player.y = ty * 16 - 40; g.player.vx = 0; g.player.vy = 0; };
    const sceneAt = () => scanScene(w, g.player.cx, g.player.cy, 0);

    const ws = Math.floor(w.groundLevel), h = st.h;
    const AX = 1500;
    const isTow = tag === 'drunk';

    const calm = () => {
      w.weather.raining = false; w.weather.rainTime = 0; w.weather.maxRaining = 0;
      w.weather.cloudAlpha = 0; w.weather.windSpeedTarget = 0; w.weather.storming = false;
      w.weather.shouldUseStormMusic = false; w.weather.shouldUseWindyDayMusic = false;
      w.weather.weatherCounter = 1e9;   // 冻结天气 RNG 重掷（雨/风随机启动污染场景）
      w.clock.bloodMoon = false; w.clock.eclipse = false; w.clock.timeOfDay = 0.5;
      w.moonEvent.kind = 0;
      g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
      g.player.hp = g.player.maxHp;
    };
    // 期望曲断言：先泵足（15t 场景刷新 ×4+ 滞回）再取 lastMusic
    const expectMusic = (name, want, extra = '') => {
      pump(120);
      chk(name, g.lastMusic === want, `got=${g.lastMusic} want=${want}${extra ? ' ' + extra : ''}`);
    };
    // 场景清场：整窗(±66 行)逐半径扩清至零群系旗（drunk 散布/remix 倒置层残留防御）
    const clearUntilClean = (tx, ty, maxR = 110) => {
      for (let r = 70; r <= maxR; r += 20) {
        clearRect(tx - r, tx + r, ty - 66, ty + 64);
        tp(tx, ty); calm(); pump(8);
        const sc = sceneAt();
        if (!sc.zoneCorrupt && !sc.zoneCrimson && !sc.zoneJungle && !sc.zoneSnow && !sc.zoneDesert
          && !sc.zoneGlowshroom && !sc.zoneMeteor && !sc.zoneGraveyard && !sc.zoneDungeon
          && !sc.zoneHallow && !sc.zoneBeach && !sc.zoneShimmer && !sc.zoneUndergroundDesert) return true;
      }
      return false;
    };
    const zoneNoise = (sc) => [sc.zoneCorrupt && 'corrupt', sc.zoneCrimson && 'crimson', sc.zoneJungle && 'jungle',
      sc.zoneSnow && 'snow', sc.zoneDesert && 'desert', sc.zoneGlowshroom && 'shroom', sc.zoneMeteor && 'meteor',
      sc.zoneGraveyard && 'grave', sc.zoneDungeon && 'dungeon', sc.zoneHallow && 'hallow', sc.zoneBeach && 'beach',
      sc.zoneShimmer && 'shimmer', sc.zoneUndergroundDesert && 'ugdesert'].filter(Boolean).join(',');

    // ── D 组：TOW 链多场景 ──
    if (isTow) {
      chk('D0a drunk 旗在位（drunkWorld && !remix && !getGood）',
        w.seedFlags.drunkWorld === true && !w.seedFlags.remix && !w.seedFlags.getGoodWorld,
        `flags=${JSON.stringify({ drunk: w.seedFlags.drunkWorld, remix: w.seedFlags.remix, gg: w.seedFlags.getGoodWorld })}`);
      clearUntilClean(AX, ws + 2); floorAt(AX, ws + 3); tp(AX, ws + 2); calm(); pump(16);
      expectMusic('D0b 地表森林白天 → 63 OtherworldDay', 63);

      w.clock.timeOfDay = 0.95;
      expectMusic('D1 森林夜 → 64 OtherworldNight', 64);

      const hellY = h - 188;
      clearRect(AX - 40, AX + 40, hellY - 20, hellY + 10); floorAt(AX, hellY + 4); tp(AX, hellY + 3); calm(); pump(16);
      expectMusic('D2 地狱层 → 71 OtherworldUnderworld', 71, `y=${hellY} underworld=${h - 200}`);

      clearRect(AX - 40, AX + 40, 20, 80); floorAt(AX, 44); tp(AX, 42); calm(); pump(16);
      expectMusic('D3 太空层 → 70 OtherworldSpace', 70);

      clearUntilClean(AX, ws + 2); floorAt(AX, ws + 3); tp(AX, ws + 2); calm(); pump(16);
      expectMusic('D4 回地表 → 63（恢复哨兵）', 63);

      patch(AX - 60, ws - 24, 121, 25, sheetId(147));
      chk('D5a zoneSnow=true', sceneAt().zoneSnow === true, `snow=${sceneAt().snowTileCount} noise=${zoneNoise(sceneAt())}`);
      expectMusic('D5b 雪原地表 → 72 OtherworldSnow', 72);
      patch(AX - 60, ws - 24, 121, 25, 0);

      // D6 微光（:12113 锚支）：地下带 300+ 微光液 → 72;去液同点 → 65 对照
      const dy6 = ws + 120;
      clearUntilClean(AX, dy6 + 4);
      floorAt(AX, dy6 + 6); tp(AX, dy6 + 4); calm(); pump(16);
      expectMusic('D6a 同深度无微光 → 65 OtherworldUnderground（对照）', 65);
      for (let y = dy6 - 8; y < dy6 + 6; y++) for (let x = AX - 15; x < AX + 15; x++) {
        if (!inB(x, y)) continue;
        st.setTileSilent(x, y, 0, 0, 0);
        const i = st.idx(x, y); st.liquid[i] = 255; st.liquidType[i] = 4;
      }
      chk('D6b zoneShimmer=true（:12113 支域成立）', sceneAt().zoneShimmer === true,
        `shim=${sceneAt().shimmerTileCount} depth=${Math.floor(g.player.cy / 16)} band=[${ws + 84},${h - 396}]`);
      expectMusic('D6c 微光带 → 72 OtherworldSnow（ZoneShimmer 支）', 72);
      for (let y = dy6 - 8; y < dy6 + 6; y++) for (let x = AX - 15; x < AX + 15; x++) { if (!inB(x, y)) continue; const i = st.idx(x, y); st.liquid[i] = 0; }

      clearUntilClean(AX, ws + 2); floorAt(AX, ws + 3); tp(AX, ws + 2); calm(); pump(16);
      patch(AX - 12, ws - 9, 24, 10, sheetId(60));
      chk('D7a zoneJungle=true', sceneAt().zoneJungle === true, `j=${sceneAt().jungleTileCount}`);
      expectMusic('D7b 丛林 → 86 OtherworldJungle', 86);
      patch(AX - 12, ws - 9, 24, 10, 0);

      patch(AX - 10, ws - 20, 21, 20, sheetId(23));
      const sc8 = sceneAt();
      chk('D8a zoneCorrupt && evil≥300', sc8.zoneCorrupt === true && sc8.evilTileCount >= 300, `evil=${sc8.evilTileCount} blood=${sc8.bloodTileCount}`);
      expectMusic('D8b 腐化地表 → 73 OtherworldCorruption', 73);
      for (let y = ws - 24; y < ws - 2; y++) for (let x = AX + 12; x < AX + 35; x++) st.setTileSilent(x, y, sheetId(199), 0, 0);
      const sc9 = sceneAt();
      chk('D9a 双邪恶且 blood>evil（vanilla :12143 判据）', sc9.zoneCorrupt === true && sc9.zoneCrimson === true && sc9.bloodTileCount > sc9.evilTileCount,
        `evil=${sc9.evilTileCount} blood=${sc9.bloodTileCount}`);
      expectMusic('D9b 双邪恶血主 → 75 OtherworldCrimson', 75);
      clearRect(AX - 40, AX + 40, ws - 30, ws + 10);

      const dFloor = Math.max(ws, w.dungeonY + 40);
      const dyy = Math.min(dFloor + 60, h - 240);
      clearRect(AX - 60, AX + 60, dyy - 30, dyy + 25);
      floorAt(AX, dyy + 5); patch(AX - 10, dyy - 8, 21, 16, sheetId(41), 7); tp(AX, dyy + 3); calm(); pump(16);
      chk('D10a zoneDungeon=true（drunk 下限 max(ws,dungeonY+40) 域内）', sceneAt().zoneDungeon === true,
        `dungeonY=${w.dungeonY} floor=${dFloor} y=${Math.floor(g.player.cy / 16)}`);
      expectMusic('D10b 地牢 → 69 OtherworldDungeon', 69);

      clearUntilClean(AX, ws + 2); floorAt(AX, ws + 3); tp(AX, ws + 2); calm(); pump(16);
      patch(AX - 60, ws - 24, 121, 25, sheetId(53));
      chk('D11a zoneDesert=true', sceneAt().zoneDesert === true, `d=${sceneAt().desertSandTileCount}`);
      expectMusic('D11b 沙漠 → 66 OtherworldDesert', 66);
      patch(AX - 60, ws - 24, 121, 25, 0);

      clearRect(100, 300, ws - 60, ws + 30); floorAt(200, ws + 3); tp(200, ws + 2); calm(); pump(16);
      chk('D12a zoneBeach=true', sceneAt().zoneBeach === true, `x=${Math.floor(g.player.cx / 16)}`);
      expectMusic('D12b 海洋 → 67 OtherworldOcean', 67);

      clearUntilClean(AX, ws + 2); floorAt(AX, ws + 3); tp(AX, ws + 2); calm(); pump(16);
      w.clock.timeOfDay = 0.95; w.clock.bloodMoon = true;
      expectMusic('D13 血月夜 → 79 OtherworldEerie', 79);
      w.clock.bloodMoon = false; w.clock.timeOfDay = 0.5; w.clock.eclipse = true;
      expectMusic('D14 日食昼（地表带严格<worldSurface*16+half）→ 79', 79);
      w.clock.eclipse = false; w.weather.cloudAlpha = 1; w.weather.windSpeedTarget = 0.6;
      expectMusic('D15 风暴（storm 门）→ 62', 62);
      w.weather.cloudAlpha = 0.45; w.weather.windSpeedTarget = 0; w.weather.shouldUseStormMusic = false;
      expectMusic('D16 雨（cloudAlpha>0）→ 62', 62);
      calm(); w.clock.timeOfDay = 0.95;   // boss 事件夜间（EoC 昼逃离防御）
      pump(60);

      const bossCases = [
        [4, 81, 'EoC 表外→兜底 num2=1'],
        [13, 81, 'EoW 头→槽1'],
        [35, 81, '骷髅王 TOW 表外→兜底81（经典链=104,差分哨兵）'],
        [50, 81, '史王 TOW 表外→兜底81（经典链=93）'],
        [113, 87, '血肉墙→87'],
        [125, 80, '双子→80'],
        [398, 84, '月总→84'],
        [668, 80, '鹿角怪→80'],
      ];
      for (const [id, want, label] of bossCases) {
        const sy = id === 113 ? (h - 190) : (id === 13 ? (Math.floor(w.rockLevel) + 40) : null);
        let saved = null;
        if (sy != null) { saved = { y: g.player.y }; clearRect(AX - 40, AX + 40, sy - 24, sy + 12); floorAt(AX, sy + 5); tp(AX, sy + 3); }
        const e = Enemy.fromVanilla(id, g.player.cx + (sy != null ? 300 : 1200), g.player.cy - (sy != null ? 100 : 500));
        if (!e) { R.push(`SKIP: boss ${id} 未注册（${label}）`); continue; }
        g.entities.add(e, 'enemies');
        pump(25);
        const alive = g.entities.enemies.filter((x) => x.vanillaId === id && !x.dead).length;
        if (alive === 0) { R.push(`SKIP: boss ${id} 未存活至扫描（${label}）——槽表语义由单测覆盖`); }
        else chk(`D17 boss ${id} → ${want}（${label}）`, g.lastMusic === want, `got=${g.lastMusic} alive=${alive}`);
        g.entities.enemies.length = 0; g.entities.projectiles.length = 0; g.player.hp = g.player.maxHp;
        if (saved) { tp(AX, ws + 2); }
        pump(16);
      }
      tp(AX, ws + 2); calm(); pump(16);
      expectMusic('D17z boss 清场 → 回 63', 63);

      w.moonEvent.kind = 2; pump(25);
      chk('D18a 南瓜月 → 82（链尾覆写）', g.lastMusic === 82, `got=${g.lastMusic}`);
      w.moonEvent.kind = 1; pump(25);
      chk('D18b 霜月 → 82', g.lastMusic === 82, `got=${g.lastMusic}`);
      w.moonEvent.kind = 0;
      expectMusic('D18c 复位 → 回 63', 63);
      return R;
    }

    // ── N 组：非 drunk 零扰动对照 ──
    const remixLike = !!(w.seedFlags.remix);
    const flags = JSON.stringify({ drunk: w.seedFlags.drunkWorld, remix: w.seedFlags.remix, gg: w.seedFlags.getGoodWorld });
    chk(`[${tag}]a 旗域（非纯 drunk——drunkWorld 缺席或被 remix/getGood 抑制）`, !w.seedFlags.drunkWorld || remixLike || !!w.seedFlags.getGoodWorld, `flags=${flags}`);
    clearUntilClean(AX, ws + 2); floorAt(AX, ws + 3); tp(AX, ws + 2); calm(); pump(16);
    if (remixLike) {
      expectMusic(`[${tag}]b remix 系地表森林 → 42 SpaceDay（非 70 OtherworldSpace）`, 42);
      w.clock.timeOfDay = 0.95;
      expectMusic(`[${tag}]c remix 系地表夜 → 15 SpaceNight（非 64）`, 15);
      w.clock.timeOfDay = 0.5; pump(60);
    } else {
      pump(120);
      chk(`[${tag}]b 地表森林白天 → 1/18（经典链）`, g.lastMusic === 1 || g.lastMusic === 18, `got=${g.lastMusic}`);
      w.clock.timeOfDay = 0.95; pump(120);
      chk(`[${tag}]c 夜 → 3（经典链,非 64）`, g.lastMusic === 3, `got=${g.lastMusic}`);
      w.clock.bloodMoon = true; pump(120);
      chk(`[${tag}]d 血月夜 → 2 Eerie（经典链,非 79）`, g.lastMusic === 2, `got=${g.lastMusic}`);
      w.clock.bloodMoon = false; w.clock.timeOfDay = 0.5; pump(120);
      chk(`[${tag}]e 复位昼 → 1/18`, g.lastMusic === 1 || g.lastMusic === 18, `got=${g.lastMusic}`);
    }

    // 微光同 fixture → 91 Aether（经典链 :12834,非 72）——TOW 批零扰动核心哨兵
    const dy = ws + 120;
    clearUntilClean(AX, dy + 4); floorAt(AX, dy + 6); tp(AX, dy + 4); calm(); pump(16);
    for (let y = dy - 8; y < dy + 6; y++) for (let x = AX - 15; x < AX + 15; x++) {
      if (!inB(x, y)) continue;
      st.setTileSilent(x, y, 0, 0, 0);
      const i = st.idx(x, y); st.liquid[i] = 255; st.liquidType[i] = 4;
    }
    chk(`[${tag}]f zoneShimmer=true`, sceneAt().zoneShimmer === true, `shim=${sceneAt().shimmerTileCount}`);
    expectMusic(`[${tag}]g 微光 → 91 Aether（非 72 OtherworldSnow）`, 91);
    for (let y = dy - 8; y < dy + 6; y++) for (let x = AX - 15; x < AX + 15; x++) { if (!inB(x, y)) continue; const i = st.idx(x, y); st.liquid[i] = 0; }

    tp(AX, ws + 2); clearUntilClean(AX, ws + 2); floorAt(AX, ws + 3); tp(AX, ws + 2); calm(); pump(16);
    patch(AX - 60, ws - 24, 121, 25, sheetId(147)); pump(120);
    // remix 系地表带雪原=经典 remix 分支 SpaceDay 42（:12960-12981 if(remix) 臂）——
    // 关键差分=非 72 OtherworldSnow;深带（rock+120,belowHalf∧y>rock*16+half）→ 14
    if (remixLike) {
      chk(`[${tag}]h1 remix 雪原地表 → 42（非 72）`, g.lastMusic === 42, `got=${g.lastMusic}`);
      patch(AX - 60, ws - 24, 121, 25, 0);
      // （remix 深带雪原 14 子场景撤除：经典链地狱带以 w.lavaLine 近似（R22 登记）,
      //  remix 倒置层语义下深带落点不可靠——深带差分 14↔72 由单测覆盖）
      tp(AX, ws + 2); clearUntilClean(AX, ws + 2); floorAt(AX, ws + 3); tp(AX, ws + 2); calm(); pump(16);
    } else {
      chk(`[${tag}]h 雪原 → 14（非 72）`, g.lastMusic === 14, `got=${g.lastMusic}`);
      patch(AX - 60, ws - 24, 121, 25, 0);
    }
    patch(AX - 10, ws - 20, 21, 20, sheetId(23)); pump(120);
    chk(`[${tag}]i 腐化 → 8（非 73）`, g.lastMusic === 8, `got=${g.lastMusic}`);
    patch(AX - 10, ws - 20, 21, 20, 0);
    patch(AX - 12, ws - 9, 24, 10, sheetId(60)); pump(120);
    // remix 系地表带丛林=经典 remix 分支 SpaceDay 42（:12921-12935 if(remix) 臂）——非 86
    chk(`[${tag}]j ${remixLike ? 'remix 丛林地表 → 42（非 86）' : '丛林 → 7（非 86）'}`,
      remixLike ? g.lastMusic === 42 : g.lastMusic === 7, `got=${g.lastMusic}`);
    patch(AX - 12, ws - 9, 24, 10, 0);
    const hellY = h - 188; clearRect(AX - 40, AX + 40, hellY - 20, hellY + 10); floorAt(AX, hellY + 4); tp(AX, hellY + 3); calm(); pump(16);
    expectMusic(`[${tag}]k 地狱 → 36（非 71）`, 36);

    tp(AX, ws + 2); calm(); w.clock.timeOfDay = 0.95; pump(60);   // 夜间（EoC 昼逃离防御）
    const e = Enemy.fromVanilla(4, g.player.cx + 1200, g.player.cy - 500);
    if (e) {
      g.entities.add(e, 'enemies'); pump(25);
      const alive = g.entities.enemies.filter((x) => x.vanillaId === 4 && !x.dead).length;
      if (alive === 0) R.push(`SKIP: [${tag}] EoC 未存活至扫描`);
      else chk(`[${tag}]l EoC → 5 Boss1（非 81）`, g.lastMusic === 5, `got=${g.lastMusic} alive=${alive}`);
    } else R.push(`SKIP: [${tag}] EoC 未注册`);
    return R;
  }, tag);
}

const drunk = await runSuite('05162020', 'drunk');
const na = await runSuite('1010101', 'normal');
const nb = await runSuite('fortheworthy', 'ftw');
const nc = await runSuite('dontdigup', 'remix');
const nd = await runSuite('getfixedboi', 'zenith');

const all = [...drunk.map((l) => '[D] ' + l), ...na, ...nb, ...nc, ...nd];
console.log(all.join('\n'));
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 8).join('\n'));
const fails = all.filter((l) => l.startsWith('FAIL'));
const skips = all.filter((l) => l.startsWith('SKIP'));
if (skips.length) console.log('SKIP:\n' + skips.join('\n'));
console.log(fails.length ? `RESULT: ${fails.length} FAIL / ${all.length} checks` : `RESULT: ALL PASS (${all.length} checks)`);
await browser.close();
process.exit(fails.length ? 1 : 0);
