// 中央服务器房间制端到端验证（v3）：
// 1) 起 server（:7901 ws / :7902 lobby）
// 2) 页面 A 建小世界 → createRoom（公开 + 破坏保护 + 物品保护）→ 房间码
// 3) HTTP：公开列表含该房 / 码校验可达
// 4) A 以 hostToken 进房（policy.isHost=true）→ B 码加入（policy.isHost=false）
// 5) 双端互见
// 6) 破坏保护：B（非房主）tile op 被服务端拒绝 + correction 回滚；A（房主）op 中继到 B
// 7) 公开性过滤：非公开房不在列表、但码可查
// 用法：node scripts/_roomprobe.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const SERVER_DIR = new URL('../../server/', import.meta.url).pathname;
const PORT = 7901; // ws
const LOBBY = PORT + 1; // http

// ---- 起 server ----
const server = spawn('npx', ['tsx', 'src/index.ts', '--port', String(PORT)], {
  cwd: SERVER_DIR, stdio: ['ignore', 'pipe', 'pipe'],
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
if (!(await waitServer())) {
  console.log('FAIL: 服务器启动超时\n' + serverLog.slice(-10).join(''));
  server.kill();
  process.exit(1);
}
console.log('server up');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const mkPage = async () => {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));
  page.setDefaultTimeout(300000); // 世界生成 evaluate 可能分钟级
  await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  return page;
};

try {
  // ---- A：建世界 + 建房 ----
  const pageA = await mkPage();
  await pageA.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
  console.log('A: 生成世界（worker，约 30-90s）…');
  await pageA.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
  await pageA.waitForFunction(() => !!window.__swGame, { timeout: 60000 });
  check('A 世界就绪', true);

  const created = await pageA.evaluate(async (lobby) => {
    return window.__swFlow.createRoom(`127.0.0.1:${lobby}`, { public: true, protectTiles: true, protectItems: true });
  }, LOBBY);
  console.log('createRoom:', JSON.stringify(created));
  check('建房成功（6 位码 + hostToken）', !!created.code && /^\d{6}$/.test(created.code) && !!created.hostToken, created.error ?? `code=${created.code}`);
  if (!created.code) throw new Error('建房失败，终止');

  // ---- HTTP lobby 断言 ----
  const listRes = await fetch(`http://127.0.0.1:${LOBBY}/rooms`).then((r) => r.json());
  const listed = (listRes.rooms ?? []).find((rm) => rm.code === created.code);
  check('公开房出现在列表（含保护标记）', !!listed && listed.protectTiles === true && listed.protectItems === true, JSON.stringify(listed ?? null));
  const codeRes = await fetch(`http://127.0.0.1:${LOBBY}/rooms/${created.code}`).then((r) => r.json());
  check('码校验可达', codeRes.ok === true && codeRes.protectTiles === true);

  // ---- A 房主进房 ----
  const hostUrl = `ws://127.0.0.1:${PORT}/${created.code}?token=${encodeURIComponent(created.hostToken)}`;
  const joinA = await pageA.evaluate(async (url, token) => {
    try {
      await window.__swFlow.joinRoom(url, token);
    } catch (e) { return { err: String(e) }; }
    const g = window.__swGame;
    const oldWorld = g.world; // 建房用的世界已被换为服务器下发副本
    return {
      ok: !!g.net?.active,
      isHost: g.net?.policy?.isHost,
      protectTiles: g.net?.policy?.protectTiles,
      protectItems: g.net?.policy?.protectItems,
      w: g.world?.w, slot: g.net?.mySlot,
      canEdit: g.netCanEditTile(), canChest: g.netCanChestInteract(),
      worldReplaced: oldWorld !== null,
    };
  }, hostUrl, created.hostToken).catch((e) => ({ err: String(e) }));
  console.log('A(房主):', JSON.stringify(joinA));
  check('A 房主进房成功', !!joinA.ok && joinA.isHost === true, joinA.err ?? `slot=${joinA.slot}`);
  check('A policy 双保护生效 + 门禁放行（房主）', joinA.protectTiles === true && joinA.protectItems === true && joinA.canEdit === true && joinA.canChest === true);

  // ---- B 码加入（无 token） ----
  const pageB = await mkPage();
  await pageB.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
  const joinB = await pageB.evaluate(async (url) => {
    try {
      await window.__swFlow.joinRoom(url, '');
    } catch (e) { return { err: String(e) }; }
    const g = window.__swGame;
    return {
      ok: !!g.net?.active,
      isHost: g.net?.policy?.isHost,
      protectTiles: g.net?.policy?.protectTiles,
      canEdit: g.netCanEditTile(), canChest: g.netCanChestInteract(),
      w: g.world?.w, slot: g.net?.mySlot,
    };
  }, `ws://127.0.0.1:${PORT}/${created.code}`).catch((e) => ({ err: String(e) }));
  console.log('B(访客):', JSON.stringify(joinB));
  check('B 码加入成功', !!joinB.ok, joinB.err ?? `slot=${joinB.slot}`);
  check('B policy 非房主 + 门禁拦截（protectTiles/Items）', joinB.isHost === false && joinB.canEdit === false && joinB.canChest === false);

  if (joinA.ok && joinB.ok) {
    // ---- 双端互见 ----
    await pageA.evaluate(() => {
      const g = window.__swGame;
      for (let i = 0; i < 180; i++) {
        if (i % 3 === 0) g.player.x += 0.8;
        g.fixedUpdate(1 / 60);
      }
    });
    await sleep(800);
    const seeB = await pageA.evaluate(() => [...window.__swGame.net.players.values()].filter((p) => p.active).length);
    const seeA = await pageB.evaluate(() => [...window.__swGame.net.players.values()].filter((p) => p.active).length);
    check('双端互见', seeB >= 1 && seeA >= 1, `A侧=${seeB} B侧=${seeA}`);

    // ---- 破坏保护：B（非房主）tile op 被拒 + correction 回滚 ----
    const t0 = await pageB.evaluate(() => {
      const g = window.__swGame;
      const x = g.world.spawnX, y = g.world.spawnY + 3;
      return { x, y, before: g.world.store.get(x, y) };
    });
    // B 直接改 store（模拟绕过 UI 门禁的恶意/乐观写入）→ 上报 → 服务器拒绝 + 纠正
    await pageB.evaluate((t) => {
      const g = window.__swGame;
      g.world.store.setTile(t.x, t.y, 0);
      g.net.tick();
    }, t0);
    await sleep(1000);
    const afterB = await pageB.evaluate((t) => window.__swGame.world.store.get(t.x, t.y), t0);
    const afterA = await pageA.evaluate((t) => window.__swGame.world.store.get(t.x, t.y), t0);
    check('B 非房主 tile op 被拒（本地回滚 + 房主侧不变）', t0.before !== 0 && afterB === t0.before && afterA === t0.before,
      `before=${t0.before} B=${afterB} A=${afterA}`);

    // ---- 房主 op 正常中继 ----
    const t1 = await pageA.evaluate(() => {
      const g = window.__swGame;
      const x = g.world.spawnX, y = g.world.spawnY + 3;
      const before = g.world.store.get(x, y);
      g.world.store.setTile(x, y, 0);
      g.net.tick();
      return { x, y, before };
    });
    await sleep(1000);
    const relayB = await pageB.evaluate((t) => window.__swGame.world.store.get(t.x, t.y), t1);
    check('房主 tile op 中继到 B', t1.before !== 0 && relayB === 0, `before=${t1.before} B=${relayB}`);
    // 恢复（避免影响后续）：房主写回
    await pageA.evaluate((t) => {
      const g = window.__swGame;
      g.world.store.setTile(t.x, t.y, t.before);
      g.net.tick();
    }, t1);
  }

  // ---- 公开性过滤：非公开房不在列表、码可查 ----
  const created2 = await pageA.evaluate(async (lobby) => {
    return window.__swFlow.createRoom(`127.0.0.1:${lobby}`, { public: false });
  }, LOBBY);
  check('第二房（非公开）创建成功', !!created2.code, created2.error ?? '');
  if (created2.code) {
    const list2 = await fetch(`http://127.0.0.1:${LOBBY}/rooms`).then((r) => r.json());
    const visible = (list2.rooms ?? []).some((rm) => rm.code === created2.code);
    check('非公开房不出现在列表', visible === false);
    const direct = await fetch(`http://127.0.0.1:${LOBBY}/rooms/${created2.code}`).then((r) => r.json());
    check('非公开房码可查（码加入可行）', direct.ok === true);
  }
} finally {
  server.kill();
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
