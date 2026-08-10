// 联机 v1 端到端验证：
// 1) 起 server 子进程（--seed 固定，小世界）
// 2) 浏览器 A 加入 → 断言世界到达（出生点周围 tile 非空）+ 玩家可行动
// 3) 浏览器 B 加入 → 断言双端互见（net.players 含对方）
// 4) tile 中继：A 挖块 → B 侧同步消失
// 用法：node scripts/_netprobe.mjs（需先 npm install in server/）
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const SERVER_DIR = new URL('../../server/', import.meta.url).pathname;
const PORT = 7901;

// ---- 起 server ----
const server = spawn('npx', ['tsx', 'src/index.ts', '--port', String(PORT), '--seed', 'netprobe', '--size', 'small', '--save-interval', '0'], {
  cwd: SERVER_DIR,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env },
});
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
server.stderr.on('data', (d) => serverLog.push(d.toString()));
const waitServer = async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    if (serverLog.join('').includes(`ws://0.0.0.0:${PORT}`)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};
const serverUp = await waitServer();
if (!serverUp) {
  console.log('FAIL: 服务器启动超时\n' + serverLog.slice(-10).join(''));
  server.kill();
  process.exit(1);
}
console.log('server up');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const mkPage = async (browser) => {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
  await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  return page;
};

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
try {
  const pageA = await mkPage(browser);
  // A 加入
  const joinA = await pageA.evaluate(async (port) => {
    const g = window.__swGame;
    if (!g) return { err: 'no game' };
    try {
      await g.joinNetGame(`ws://127.0.0.1:${port}`, () => {});
    } catch (e) {
      return { err: String(e) };
    }
    return {
      ok: !!g.world && g.world.w > 1000,
      w: g.world?.w, h: g.world?.h,
      spawn: [g.world?.spawnX, g.world?.spawnY],
      netActive: g.net?.active,
      slot: g.net?.mySlot,
    };
  }, PORT);
  console.log('A:', JSON.stringify(joinA));
  check('A 加入成功', !!joinA.ok, `w=${joinA.w} slot=${joinA.slot}`);

  if (joinA.ok) {
    // A 世界 tile 非空（出生点周围）
    const tiles = await pageA.evaluate(() => {
      const st = window.__swGame.world.store;
      let solid = 0, total = 0;
      for (let dy = -10; dy <= 20; dy++) for (let dx = -10; dx <= 10; dx++) {
        const x = window.__swGame.world.spawnX + dx, y = window.__swGame.world.spawnY + dy;
        total++;
        if (st.isSolid(x, y)) solid++;
      }
      return { solid, total };
    });
    check('A 世界 tile 到达（出生点周围有地形）', tiles.solid > 20, JSON.stringify(tiles));

    // B 加入
    const pageB = await mkPage(browser);
    const joinB = await pageB.evaluate(async (port) => {
      const g = window.__swGame;
      try { await g.joinNetGame(`ws://127.0.0.1:${port}`, () => {}); } catch (e) { return { err: String(e) }; }
      return { ok: !!g.world && g.world.w > 1000, slot: g.net?.mySlot };
    }, PORT);
    console.log('B:', JSON.stringify(joinB));
    check('B 加入成功', !!joinB.ok, `slot=${joinB.slot}`);

    if (joinB.ok) {
      // 双端互见：A 走几步让状态包发出
      await pageA.evaluate(() => {
        const g = window.__swGame;
        for (let i = 0; i < 180; i++) {
          if (i % 3 === 0) g.player.x += 0.8; // 直接位移驱动上报（探针确定性）
          g.fixedUpdate(1 / 60);
        }
      });
      await new Promise((r) => setTimeout(r, 800));
      const seeB = await pageA.evaluate(() => {
        const ps = [...window.__swGame.net.players.values()].filter((p) => p.active);
        return { count: ps.length, names: ps.map((p) => `${p.slot}@${Math.round(p.x)},${Math.round(p.y)}`) };
      });
      const seeA = await pageB.evaluate(() => {
        const ps = [...window.__swGame.net.players.values()].filter((p) => p.active);
        return { count: ps.length, moved: ps[0] ? Math.round(ps[0].x) : -1 };
      });
      check('A 看到 B', seeB.count >= 1, JSON.stringify(seeB));
      check('B 看到 A（含位移）', seeA.count >= 1 && seeA.moved > 0, JSON.stringify(seeA));

      // tile 中继：A 挖块 → B 同步
      const tileTest = await pageA.evaluate(() => {
        const g = window.__swGame;
        const st = g.world.store;
        // 找一个实心格挖掉
        const x = g.world.spawnX, y = g.world.spawnY + 3;
        const before = st.get(x, y);
        st.setTile(x, y, 0);
        g.net.tick(); // 冲洗上报
        return { x, y, before };
      });
      await new Promise((r) => setTimeout(r, 800));
      const tileB = await pageB.evaluate((t) => window.__swGame.world.store.get(t.x, t.y), tileTest);
      check('tile 中继（A 挖 → B 消失）', tileTest.before !== 0 && tileB === 0, `before=${tileTest.before} afterB=${tileB}`);

      // 聊天中继
      await pageA.evaluate(() => window.__swGame.net.sendChat('hello from A'));
      await new Promise((r) => setTimeout(r, 600));
      // B 侧聊天走 onChat → newText（无断言 UI，仅验证不抛错）
      check('聊天发送不抛错', true);
    }
  }
} finally {
  server.kill();
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
