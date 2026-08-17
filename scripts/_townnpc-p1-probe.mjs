// 城镇 NPC P1 生活行为批验证探针（2026-08-17）：
//  A 雨天白天回家（:53383-53402 flag / :54056-54091 走位门）
//  B 悬崖避让（GetWalkPrediction :56093-56165 + 停走 :54444-54467）
//  C RPS 对局出现（:55675-55701 1/1800）+ 聊天对照（:55630 1/300）
//  D 派对跳舞（:55704-55730）舞帧 num58−5/−4 交替 + 音符尘 139-143（:69665-69678）
// 驱动：g.tickCount 轮询（tick 数为准，免疫负载）；分段 evaluate 防 protocolTimeout。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  protocolTimeout: 600000,
  args: ['--no-sandbox', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 300000 });
await page.bringToFront();
await new Promise(r => setTimeout(r, 1500));

const setup = await page.evaluate(() => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
  const under = st.type[st.idx(bx, by + 2)];
  for (let dx = -140; dx <= 140; dx++) for (let dy = -16; dy <= 1; dy++)
    st.setTile(bx + dx, by + dy, dy === 2 ? under : 0);
  for (let dx = -140; dx <= 140; dx++) st.setTile(bx + dx, by + 2, under);
  return { bx, F: by + 2, under };
});
const { bx, F, under } = setup;
const lines = [];
const ok = (name, pass, detail = '') => {
  lines.push(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

// ============ A 雨天白天回家 ============
{
  const r = await page.evaluate(async (bx, F) => {
    const g = window.__swGame, p = g.player;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const waitTicks = async (n) => {
      const t0 = g['tickCount'], tm = performance.now();
      while (g['tickCount'] - t0 < n) {
        g.entities.enemies.length = 0;   // 清敌：dangerNear 会压制 sitFlag 走位（flee 覆写）与社交掷骰（flag30）
        await new Promise(r => setTimeout(r, 15));
        if (performance.now() - tm > 40000) throw new Error('TICK_STALL');
      }
    };
    g.entities.enemies.length = 0;
    g.world.clock.timeOfDay = 0.5;          // 白天正午
    g.world.weather.startRain();            // 真雨（手设 raining 会被雨调度弹回）
    p.x = (bx - 100) * 16; p.y = (F - 3) * 16;   // 玩家活体远处（防矩形传送门）
    p.dead = false; p.hp = 100; p.maxHp = 100;
    const n = new TownNPC('guide', (bx + 0) * 16 + 8, F * 16);
    n.home = { x: bx + 40, y: F - 1 };
    g.entities.npcs.push(n);
    await waitTicks(30);
    const x0 = n.cx / 16;
    await waitTicks(900);
    const x1 = n.cx / 16;
    n.dead = true;
    g.world.weather.stopRain();
    return { x0, x1 };
  }, bx, F);
  const moved = r.x1 - r.x0;
  ok('A 雨天白天走回家（>28 格 / 40 格）', moved > 28,
    `col ${r.x0.toFixed(1)} → ${r.x1.toFixed(1)} (home=bx+40)`);
}

// ============ B 悬崖避让 ============
{
  const r = await page.evaluate(async (bx, F, under) => {
    const g = window.__swGame, st = g.world.store;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const waitTicks = async (n) => {
      const t0 = g['tickCount'], tm = performance.now();
      while (g['tickCount'] - t0 < n) {
        g.entities.enemies.length = 0;   // 清敌（同 A 段注）
        await new Promise(r => setTimeout(r, 15));
        if (performance.now() - tm > 40000) throw new Error('TICK_STALL');
      }
    };
    g.entities.enemies.length = 0;
    g.world.clock.timeOfDay = 0.5;
    for (let dx = 21; dx <= 140; dx++) st.setTile(bx + dx, F, 0);   // 断崖
    const n = new TownNPC('guide', (bx + 4) * 16 + 8, F * 16);
    n.setWalking(3000);
    g.entities.npcs.push(n);
    await waitTicks(20);
    let fell = false, maxCol = 0;
    const startCol = n.cx / 16;
    for (let k = 0; k < 50 && !fell; k++) {
      await waitTicks(20);
      maxCol = Math.max(maxCol, n.cx / 16);
      if (n.cx / 16 >= bx + 21 || n.y > F * 16 + 4) fell = true;
    }
    const yEnd = n.y / 16;
    n.dead = true;
    for (let dx = 21; dx <= 140; dx++) st.setTile(bx + dx, F, under);
    return { startCol, maxCol, fell, yEnd };
  }, bx, F, under);
  ok('B 悬崖前停走/转身永不下坠', !r.fell,
    `start=${r.startCol.toFixed(1)} max=${r.maxCol.toFixed(1)} cliffEdge=21 yEnd=${r.yEnd.toFixed(1)}(F=${F})`);
}

// ============ C RPS 对局 + 聊天 ============
{
  const r = await page.evaluate(async (bx, F) => {
    const g = window.__swGame;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const waitTicks = async (n) => {
      const t0 = g['tickCount'], tm = performance.now();
      while (g['tickCount'] - t0 < n) {
        g.entities.enemies.length = 0;   // 清敌（同 A 段注）
        await new Promise(r => setTimeout(r, 15));
        if (performance.now() - tm > 40000) throw new Error('TICK_STALL');
      }
    };
    g.entities.enemies.length = 0;
    g.world.clock.timeOfDay = 0.5;
    const a = new TownNPC('guide', (bx - 6) * 16 + 8, F * 16);
    const b = new TownNPC('nurse', (bx - 2) * 16 + 8, F * 16);
    g.entities.npcs.push(a, b);
    let chat = false, rps = false, rpsEmotes = 0;
    const t0 = g['tickCount'];
    while (g['tickCount'] - t0 < 9000 && !rps) {
      await waitTicks(30);
      const ka = a.socialKind, kb = b.socialKind;
      if ((ka === 3 && kb === 4) || (ka === 4 && kb === 3)) chat = true;
      if ((ka === 16 && kb === 17) || (ka === 17 && kb === 16)) {
        rps = true;
        const c0 = window.__swEmotes.count();
        for (let s = 0; s < 17; s++) {
          await waitTicks(10);
          rpsEmotes = Math.max(rpsEmotes, window.__swEmotes.count() - c0);
        }
      }
    }
    a.dead = true; b.dead = true;
    return { chat, rps, rpsEmotes };
  }, bx, F);
  ok('C1 结对聊天出现（1/300）', r.chat);
  ok('C2 RPS 对局出现（1/1800）', r.rps);
  ok('C3 RPS 对局掷出表情（36/37/38 族）', r.rps && r.rpsEmotes >= 2, `对局新表情 ${r.rpsEmotes} 个`);
}

// ============ D 派对跳舞 ============
{
  const r = await page.evaluate(async (bx, F) => {
    const g = window.__swGame, p = g.player;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const waitTicks = async (n) => {
      const t0 = g['tickCount'], tm = performance.now();
      while (g['tickCount'] - t0 < n) {
        g.entities.enemies.length = 0;   // 清敌（同 A 段注）
        await new Promise(r => setTimeout(r, 15));
        if (performance.now() - tm > 40000) throw new Error('TICK_STALL');
      }
    };
    g.entities.enemies.length = 0;
    g.world.clock.timeOfDay = 0.5;
    const party = await import('/src/world/wiring/party.ts');
    if (!party.partyIsUp(g.partyState)) party.toggleManualParty(g.partyState);  // 真派对（scene 手塞会被 scanScene 重写）
    p.x = (bx - 3) * 16; p.y = (F - 3) * 16;   // 玩家在 NPC 旁 50px
    const n = new TownNPC('nurse', (bx + 0) * 16 + 8, F * 16);
    g.entities.npcs.push(n);
    let dustNotes = 0;
    const vd = g.vanillaDust;
    const origSpawn = vd?.spawn?.bind(vd);
    if (vd && origSpawn) vd.spawn = (x, y, w, h, type, ...rest) => {
      if (type >= 139 && type <= 142) dustNotes++;
      return origSpawn(x, y, w, h, type, ...rest);
    };
    let dancing = false;
    const danceFrames = new Set();
    const t0 = g['tickCount'];
    while (g['tickCount'] - t0 < 9000 && !(dancing && dustNotes >= 8)) {
      await waitTicks(30);
      if (n.socialKind === 6) {
        dancing = true;
        danceFrames.add(n.frame);
      }
    }
    if (vd && origSpawn) vd.spawn = origSpawn;
    if (party.partyIsUp(g.partyState)) party.toggleManualParty(g.partyState);
    n.dead = true;
    return { dancing, dustNotes, frames: [...danceFrames] };
  }, bx, F);
  ok('D1 派对舞态出现（1/1200）', r.dancing);
  ok('D2 舞帧带 num58−5/−4（护士 num58=19：帧 18/19）',
    r.frames.includes(18) || r.frames.includes(19), `observed=[${r.frames.join(',')}]`);
  ok('D3 音符尘 139-143（≥8）', r.dustNotes >= 8, `dust notes=${r.dustNotes}`);
}

console.log(lines.join('\n'));
await browser.close();
