// 服务器权威房客户端浏览器 E2E（plan §9 B4 验收）：
//   ① 真实客户端建服务器房（createRoom rules.serverAuth）→ 进房为访客
//   ② v8 policy 解析（rules.serverAuth + isHost=false + 世界换为服务器副本）
//   ③ 本地模拟关断实证（enemies 桶内全部 netPuppet——访客门生效）
//   ④ 召唤意图链：summonBoss（访客分支）→ msg202 → SimHost 生成 → msg23 → Boss 傀儡可见
//   ⑤ 打击回流：傀儡 hurt → msg42 → SimHost 结算 → 傀儡消亡
// 用法：SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs scripts/_sr-e2e.mjs
import puppeteer from 'puppeteer-core';
import { spawnServer } from './_netfake.mjs';

const PORT = 7931; // ws
const LOBBY = PORT + 1;

const server = spawnServer(PORT);
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
server.stderr.on('data', (d) => serverLog.push(d.toString()));
const waitServer = async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (serverLog.join('').includes(`ws://0.0.0.0:${PORT}`)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });

try {
  if (!(await waitServer())) throw new Error('服务器启动超时');
  console.log('server up');

  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));
  page.setDefaultTimeout(300000);
  await page.goto(process.env.SW_ORIGIN || 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
  await sleep(1500);
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });

  // ---- ① 载入现成世界(4200×1200 真实档) + 建服务器房 ----
  // （不走 worldGen worker:并行会话在途改动致 worker 运行期爆栈,与本批无关——
  //   进程内 generateWorld(vitest _fullgen-smoke)双种子全绿可证）
  console.log('① loadJson 载入现成世界…');
  const loaded = await page.evaluate(async () => {
    const r = await fetch('/tmp-sr-e2e-world.json');
    const json = await r.text();
    try {
      await window.__swFlow.loadJson(json);
      return { ok: true };
    } catch (e) { return { err: String(e).slice(0, 150) }; }
  });
  check('① 世界载入', !!loaded?.ok, JSON.stringify(loaded));
  await page.waitForFunction(() => !!window.__swGame, { timeout: 60000 });
  const created = await page.evaluate((lobby) => window.__swFlow.createRoom(`127.0.0.1:${lobby}`, { public: true, rules: { serverAuth: true } }), LOBBY);
  check('① 建服务器房成功', !!created?.code, JSON.stringify(created).slice(0, 120));
  check('① 返回 gmToken', typeof created?.gmToken === 'string' && created.gmToken.length > 10);

  // ---- ② 进房（无 token——serverAuth 房无房主概念） ----
  const join = await page.evaluate(async (url) => {
    try {
      await window.__swFlow.joinRoom(url, '');
    } catch (e) { return { err: String(e) }; }
    const g = window.__swGame;
    return {
      ok: !!g.net?.active,
      isHost: g.net?.policy?.isHost,
      serverAuth: g.net?.policy?.rules?.serverAuth,
      w: g.world?.w, h: g.world?.h,
    };
  }, `ws://127.0.0.1:${PORT}/${created.code}`).catch((e) => ({ err: String(e) }));
  check('② 进房成功（net.active）', !!join?.ok, JSON.stringify(join).slice(0, 150));
  check('② serverAuth 解析', join?.serverAuth === true);
  check('② 建房者亦为访客（isHost=false）', join?.isHost === false);
  check('② 世界换为服务器副本（4200×1200）', join?.w === 4200 && join?.h === 1200, `w=${join?.w} h=${join?.h}`);

  // ---- ③ 本地模拟关断：滚动等待首个服务器源傀儡（自然刷怪是概率门,给足 25s） ----
  console.log('③ 观察服务器源刷怪（自然掷骰,滚动等待 ≤25s）…');
  let buckets = null;
  for (let i = 0; i < 100; i++) {
    await sleep(250);
    buckets = await page.evaluate(() => {
      const g = window.__swGame;
      const en = g.entities.enemies;
      return {
        enemies: en.length,
        localEnemies: en.filter((e) => !e.netPuppet).length,
        puppets: g.netNpcPuppets?.size ?? -1,
      };
    });
    if (buckets.puppets > 0) break;
  }
  check('③ 无本地模拟敌怪（访客门生效）', buckets.localEnemies === 0, JSON.stringify(buckets));
  check('③ 服务器源傀儡在场（SimHost 刷怪下发）', buckets.puppets > 0, `puppets=${buckets.puppets}`);

  // ---- ④ 召唤意图：访客 summonBoss → msg202 → SimHost → Boss 傀儡 ----
  const summon = await page.evaluate(() => window.__swGame.summonBoss('king_slime'));
  check('④ summonBoss 访客意图受理（true=物品消耗语义）', summon === true);
  let bossPuppet = null;
  for (let i = 0; i < 40 && !bossPuppet; i++) {
    await sleep(250);
    bossPuppet = await page.evaluate(() => {
      for (const [, p] of window.__swGame.netNpcPuppets) {
        if (p.e?.def?.boss && !p.e.dead) return { key: p.e.key, hp: p.e.hp, maxHp: p.e.maxHp };
      }
      return null;
    });
  }
  check('④ Boss 傀儡经 msg23 可见', !!bossPuppet, JSON.stringify(bossPuppet));

  // ---- ⑤ 打击回流：傀儡 hurt → msg42 → SimHost 结算 → 消亡 ----
  if (bossPuppet) {
    const strikeResult = await page.evaluate(() => {
      // msg42 线格式 i16 dmg + 服务器 9999 钳位——探针伤害取 9999(勿超,99999 会 i16 溢出)
      for (const [, p] of window.__swGame.netNpcPuppets) {
        if (p.e?.def?.boss && !p.e.dead) { p.e.hurt(9999, 0, 0, window.__swGame); return true; }
      }
      return false;
    });
    check('⑤ 傀儡受击上报发出（msg42）', strikeResult);
    let bossGone = false, hpAfter = null;
    for (let i = 0; i < 60 && !bossGone; i++) {
      await sleep(250);
      const st = await page.evaluate(() => {
        for (const [, p] of window.__swGame.netNpcPuppets) {
          if (p.e?.def?.boss) return { dead: p.e.dead, hp: p.e.hp };
        }
        return null;
      });
      if (!st) { bossGone = true; break; }          // 傀儡已被清扫
      hpAfter = st;
      if (st.dead) { bossGone = true; break; }
    }
    check('⑤ 服务器结算击杀回流（傀儡死亡/移除）', bossGone, hpAfter ? JSON.stringify(hpAfter) : '移除');
  }

  // ---- ⑥ 服务器健康 ----
  check('⑥ 服务器进程存活', server.exitCode === null);
  const errs = serverLog.join('').split('\n').filter((l) => l.includes('TypeError') || l.includes('uncaught'));
  check('⑥ 无异常日志', errs.length === 0, errs.slice(0, 2).join(' | ').slice(0, 200));

  await browser.close();
} catch (e) {
  console.log('FAIL: 异常中断 —', e instanceof Error ? e.message : e);
  fail++;
  try { await browser.close(); } catch { /* */ }
} finally {
  console.log(`\n===== _sr-e2e 结果: ${pass} PASS / ${fail} FAIL =====`);
  if (fail > 0) console.log('--- server log tail ---\n' + serverLog.slice(-25).join(''));
  server.killGroup();
  if (fail > 0) process.exitCode = 1;
}
