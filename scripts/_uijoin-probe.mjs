// UI 加入路径崩溃复现与修复验证：选角色后点击进房曾踩 g.player undefined
// （生产构建 "Cannot set properties of undefined (setting 'appearance')"）。
// 链路：页面播种角色 → 真实 UI 开多人面板 → 点选角色 → 刷新列表 → 点击房间 →
// 断言:无 TypeError + 进房成功 + 加入公告带真名（pendingJoinName 链验证）。
// 用法：SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs scripts/_uijoin-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { spawnServer, WebSocket, Writer, PROTO_MAGIC, PROTO_VER, Msg } from './_netfake.mjs';

const PORT = 7935;
const LOBBY = PORT + 1;
const CHAR_NAME = '真名角色';

const server = spawnServer(PORT);
const log = [];
server.stdout.on('data', (d) => log.push(d.toString()));
server.stderr.on('data', (d) => log.push(d.toString()));
const t0 = Date.now();
while (Date.now() - t0 < 120000 && !log.join('').includes('RoomHost 就绪')) await new Promise((r) => setTimeout(r, 400));

const save = fs.readFileSync(new URL('../../server/worlds/auto-1786375290718.json', import.meta.url), 'utf8');
const res = await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'uijoin', public: true, save, rules: { serverAuth: true } }),
}).then((r) => r.json());

// 陪练端（抓加入公告真名）
const peer = new WebSocket(`ws://127.0.0.1:${PORT}/${res.code}`);
const pframes = [];
let pbuf = Buffer.alloc(0);
await new Promise((r) => {
  peer.on('open', () => {
    peer.send(new Writer(Msg.Hello).str(PROTO_MAGIC).u16(PROTO_VER).str('peer').str('').finish());
    peer.send(new Writer(Msg.RequestWorldData).finish());
    peer.send(new Writer(Msg.SpawnTileData).i32(2100).i32(237).finish());
    r();
  });
  peer.on('message', (d) => {
    pbuf = Buffer.concat([pbuf, d]);
    for (;;) {
      if (pbuf.length < 3) break;
      const len = pbuf.readUInt16LE(0);
      if (pbuf.length < len) break;
      pframes.push({ id: pbuf[2], r: pbuf.subarray(3, len) });
      pbuf = pbuf.subarray(len);
    }
  });
});
await new Promise((r) => setTimeout(r, 800));

let pass = 0, fail = 0;
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${e ? '  ' + e : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
try {
  check('建房+陪练就绪', !!res.ok && peer.readyState === 1);
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 120)));
  page.setDefaultTimeout(120000);
  await page.goto(process.env.SW_ORIGIN || 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });

  // 播种角色（面板 listCharacters 读同一存储）
  const seeded = await page.evaluate(async (name) => {
    const { CharacterStore } = await import('/src/save/CharacterStore.ts');
    const s = new CharacterStore();
    await s.ensureLoaded();
    await s.create({ name, team: 0 });
    return s.list().some((c) => c.name === name);
  }, CHAR_NAME).catch((e) => ({ err: String(e).slice(0, 100) }));
  check('角色播种', seeded === true, JSON.stringify(seeded).slice(0, 80));

  // 开多人面板 + 选角色 + 输地址 + 刷新 + 点房间
  await page.click('[data-act="mp"]');
  await sleep(900);
  const picked = await page.evaluate((name) => {
    const els = [...document.querySelectorAll('.sw-panel *')];
    const hit = els.filter((e) => e.textContent === name && e.onclick !== null).pop() || els.find((e) => e.textContent === name);
    (hit ?? { click: () => {} }).click?.();
    return !!hit;
  }, CHAR_NAME);
  check('UI 点选角色', picked === true);
  await sleep(300);
  await page.evaluate((lobby) => {
    const panel = document.querySelector('.sw-panel');
    const input = panel?.querySelector('input');
    if (input) input.value = `127.0.0.1:${lobby}`;
  }, LOBBY);
  await page.evaluate(() => {
    [...document.querySelectorAll('.sw-panel button')].find((b) => b.textContent.includes('刷新房间'))?.click();
  });
  await sleep(1600);
  let clicked = false;
  for (let i = 0; i < 4 && !clicked; i++) {
    clicked = await page.evaluate((code) => {
      for (const item of [...document.querySelectorAll('.sw-panel div')]) {
        if (item.textContent.includes(`[${code}]`) && item.onclick) { item.click(); return true; }
      }
      return false;
    }, res.code).catch(() => false);
    if (!clicked) {
      await page.evaluate(() => [...document.querySelectorAll('.sw-panel button')].find((b) => b.textContent.includes('刷新房间'))?.click());
      await sleep(1200);
    }
  }
  check('UI 点击房间加入', clicked === true);

  // 关键断言：不崩 + 进房成功
  await page.waitForFunction(() => !!window.__swGame?.net?.active, { timeout: 60000 }).catch(() => { });
  const joined = await page.evaluate(() => !!window.__swGame?.net?.active);
  check('选角色进房成功（修复生效,不再卡死）', joined === true);
  const appearanceErr = pageErrors.find((e) => e.includes("setting 'appearance'"));
  check('无 appearance TypeError', !appearanceErr, appearanceErr ?? '');

  // 真名公告（pendingJoinName 链）
  await sleep(2500);
  const annText = (f) => {
    if (f.id !== 82 || f.r.length < 6) return '';
    const mod = f.r.readUInt16LE(0);
    if (mod !== 3) { // JoinLeave=3 或 Text=1 的公告都找
      if (mod !== 1) return '';
    }
    return f.r.toString('utf8', 3, Math.min(f.r.length, 60));
  };
  // PlayerActive(14)=u8 slot+u8 active+str name（Hello 名广播;offset 4 起）——真名链验证
  const nameSeen = pframes.some((f) => f.id === 14 && f.r.toString('utf8', 4).includes(CHAR_NAME));
  check(`PlayerActive 帧带真名(${CHAR_NAME})`, nameSeen);

  check('服务器健康', server.exitCode === null);
  await browser.close();
} catch (e) {
  console.log('FAIL: 异常中断 —', String(e?.message ?? e).slice(0, 150));
  fail++;
  try { await browser.close(); } catch { }
} finally {
  console.log(`\n===== _uijoin-probe 结果: ${pass} PASS / ${fail} FAIL =====`);
  if (fail > 0) console.log(log.slice(-12).join(''));
  server.killGroup();
  if (fail > 0) process.exitCode = 1;
}
try { peer.close(); } catch { }
process.exit(fail > 0 ? 1 : 0);
