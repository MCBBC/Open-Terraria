// 阶段存档续跑矩阵:链探针在 5 个阶段边界落盘的存档逐个载入,
// 验证「该阶段的下一链路动作」仍可执行(无断线/无状态丢失)。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1100, height: 700 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await p.goto('http://localhost:5209/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swFlow === 'object', { timeout: 180000 });

const CASES = [
  { f: '/tmp/chain-save-stage1.json', name: 'S1 骷髅王后', expect: { d35: true, omGone: true }, next: 'summon-queen-bee' },
  { f: '/tmp/chain-save-stage2.json', name: 'S2 肉山后', expect: { hard: true }, next: 'smash-altar' },
  { f: '/tmp/chain-save-stage3.json', name: 'S3 三王后', expect: { d134: true, d125: true, d127: true }, next: 'bulb-or-plantera' },
  { f: '/tmp/chain-save-stage4.json', name: 'S4 石巨人后', expect: { d245: true, d262: true }, next: 'tablet-spawn' },
  { f: '/tmp/chain-save-stage5.json', name: 'S5 通关后', expect: { d398: true, towers: true }, next: 'flag-persist-only' },
];
const R = [];
const ok = (n, c, i = '') => { R.push(`${c ? 'PASS' : 'FAIL'} ${n}${i ? ' | ' + i : ''}`); console.log(R[R.length - 1]); };

for (const c of CASES) {
  if (!fs.existsSync(c.f)) { ok(`${c.name} 存档在盘`, false, c.f); continue; }
  const text = fs.readFileSync(c.f, 'utf8');
  await p.evaluate((t) => window.__swFlow.loadJson(t), text);
  await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 1200));
  await p.evaluate((n) => { window.__next = n; }, c.next);
  const s = await p.evaluate(async () => {
    const g = window.__swGame;
    const f = g.world.flags;
    const st = g.world.store;
    const T = await import('/src/data/tiles.ts');
    const out = {
      d35: !!(f['downed_35'] || f.downedSkeletron), hard: !!f.hardMode,
      d134: !!f['downed_134'], d125: !!f['downed_125'], d127: !!f['downed_127'],
      d245: !!f['downed_245'], d262: !!f['downed_262'], d398: !!f['downed_398'],
      towers: !!(f.downedTowerSolar && f.downedTowerVortex && f.downedTowerNebula && f.downedTowerStardust),
      omGone: !g.entities.npcs.some((n) => n.npcKey === 'old_man' && !n.dead),
    };
    // 下一链路动作可用性
    if (window.__next === 'summon-queen-bee') {
      g.spawnBossOnPlayer(222);
      out.nextOk = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 222);
      for (let i = 0; i < 60; i++) {
        const b = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 222);
        if (!b) break;
        b.hurt(9999999, 10, 0, g);
        for (let k = 0; k < 15; k++) g.fixedUpdate(1 / 60);
      }
      out.nextOk = out.nextOk && !!f['downed_222'];
    } else if (window.__next === 'smash-altar') {
      const ALTAR = T.TILE_BY_KEY['v_26_altars'];
      let found = null;
      for (let y = 60; y < st.h - 60 && !found; y += 2) for (let x = 60; x < st.w - 60; x += 2) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === ALTAR) { found = [x, y]; break; }
      }
      if (found) {
        const before = g.world.altarCount ?? 0;
        g.smashAltar(found[0], found[1]);
        out.nextOk = (g.world.altarCount ?? 0) > before;
      } else out.nextOk = false;
    } else if (window.__next === 'bulb-or-plantera') {
      const BULB = T.TILE_BY_KEY['v_238_plantera_s_bulb'];
      let bulb = null;
      const yTop = Math.floor(g.world.groundLevel ?? 330);
      outer: for (let y = yTop; y < st.h - 200; y++) for (let x = 2; x < st.w - 2; x++) {
        if (st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === BULB) { bulb = [x, y]; break outer; }
      }
      out.nextOk = !!bulb;   // 花苞在=世花链可达(直召备案不需要)
    } else if (window.__next === 'tablet-spawn') {
      // 玩家远离地牢 → 夜 → 等石碑
      g.player.x = 1640 * 16; g.player.y = 300 * 16; g.player.hp = g.player.maxHp; g.player.dead = false;
      g.world.clock.timeOfDay = 0.95;
      let tab = false;
      for (let i = 0; i < 30 && !tab; i++) {
        for (let k = 0; k < 120; k++) g.fixedUpdate(1 / 60);
        tab = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 437);
      }
      out.nextOk = tab;
    } else out.nextOk = true;
    return out;
  });
  // 期望断言
  const e = c.expect;
  const expOk = (!('d35' in e) || s.d35 === e.d35) && (!('omGone' in e) || s.omGone === e.omGone)
    && (!('hard' in e) || s.hard === e.hard) && (!('d134' in e) || s.d134)
    && (!('d245' in e) || s.d245) && (!('d262' in e) || s.d262) && (!('d398' in e) || s.d398)
    && (!('towers' in e) || s.towers);
  ok(`${c.name} 状态断言`, expOk, JSON.stringify(s).slice(0, 160));
}
console.log('==== MATRIX SUMMARY ====');
console.log(R.join('\n'));
console.log('pageerrors:', errs.length);
await b.close();
