// ★IIIII223 探针③（F-7/F-8 毁灭清算红队清偿验收）：普通种子世界,清算块直臂化
// （w.flags.afterPartyOfDoom 直接武装,零掷流耦合）：
//   F-7 netMode!=1 显式门（Main.cs:18109）——访客态（fake net.policy.isHost=false）→
//       击杀循环+六旗复位整块不跑（219 批判语「访客本地照跑六旗」清偿）；host/单机态照跑。
//   F-8 owner=255∧Damage≥9999 静默（NPC.cs:82065/:82078）——清算击杀不冒 9999 飘字、
//       不出 #B01818 血粒子；普通伤(10) 照冒（窄域回归,防门过宽）。
// 运行：SW_ORIGIN=http://localhost:5279 node tools/run-diag.mjs --timeout=600000 scripts/_iii223-doom.mjs
// 产物：/tmp/iii223-out/doom-report.json
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5279';
const OUT = '/tmp/iii223-out';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('22114455', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const R = [];
  const chk = (name, ok, extra = '') => { R.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); return ok; };
  const pump = (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); };
  const spawnAt = () => {
    const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
    const npc = new TownNPC('guide', (px + 3) * 16, (py - 2) * 16);
    g.entities.add(npc, 'npcs');
    return npc;
  };
  const aliveGuides = () => g.entities.npcs.filter((n) => n instanceof TownNPC && n.npcKey === 'guide' && !n.dead).length;
  // 飘字/血粒子观测（own property 影子覆盖,收尾 delete 还原原型）
  const tap = () => {
    const rec = { nums: [], parts: [] };
    const origN = g.addDamageNumber, origP = g.spawnParticles;
    g.addDamageNumber = function (...a) { rec.nums.push({ v: a[2], x: a[0], y: a[1] }); return origN.apply(this, a); };
    g.spawnParticles = function (...a) { rec.parts.push({ color: a[2], x: a[0], y: a[1] }); return origP.apply(this, a); };
    return () => { delete g.addDamageNumber; delete g.spawnParticles; return rec; };
  };

  pump(60);
  const baseGuides = aliveGuides();
  chk('D0 前置：普通种子起始向导在场,afterPartyOfDoom 未武装', baseGuides >= 1 && w.flags.afterPartyOfDoom !== true,
    `guides=${baseGuides}`);

  // ── D1/F-8：单机清算静默（net=null → F-7 门放行）──
  {
    const untap = tap();
    w.flags.afterPartyOfDoom = true;
    pump(30);
    const rec = untap();
    chk('D1a 清算执行：向导全灭+卸武装（net=null 门放行,F-7 非回归）',
      aliveGuides() === 0 && w.flags.afterPartyOfDoom === false,
      `alive=${aliveGuides()} armed=${w.flags.afterPartyOfDoom}`);
    chk('D1b 飘字静默：无 9999 大字（NPC.cs:82078 !flag 憋 CombatText）',
      !rec.nums.some((n) => n.v >= 9999), `nums=${JSON.stringify(rec.nums.map((n) => n.v))}`);
    chk('D1c 血粒子静默：无 #B01818 尘（本仓 StrikeNPC 尘近似随门）',
      !rec.parts.some((p) => p.color === '#B01818'), `parts=${rec.parts.length}`);
  }

  // ── D2/F-8 窄域回归：普通伤照冒（门不过宽）──
  {
    const npc = spawnAt();
    pump(10);
    const untap = tap();
    npc.iframes = 0;
    npc.hurt(10, 0, 0, g);
    const rec1 = untap();
    const okNormal = rec1.nums.some((n) => n.v >= 1 && n.v < 100) && rec1.parts.some((p) => p.color === '#B01818');
    npc.iframes = 0;
    const untap2 = tap();
    npc.hurt(9999, 0, 0, g);          // StrikeNPCNoInteraction(9999) 同形直击
    const rec2 = untap2();
    chk('D2a 普通伤(10)：飘字+血粒子照出（lifeMax>1 支不误伤）', okNormal,
      `nums=${JSON.stringify(rec1.nums.map((n) => n.v))} parts=${rec1.parts.length}`);
    chk('D2b 直击 9999：静默（同 F-8 判据 dmg≥9999）',
      !rec2.nums.some((n) => n.v >= 9999) && !rec2.parts.some((p) => p.color === '#B01818'),
      `nums=${JSON.stringify(rec2.nums.map((n) => n.v))}`);
  }

  // ── D3/F-7：访客态整块跳过（六旗复位也不跑）──
  // fake net = no-op Proxy（fixedUpdate/postUpdate 对 this.net 的未守卫调用面全部吞掉,
  // 首跑实测 net.tick is not a function → 桩全方法）
  const fakeNet = (isHost) => new Proxy(
    { active: false, policy: { isHost, protectTiles: true, protectItems: true, pvpAllowed: false }, players: new Map() },
    { get(t, p) { if (p in t) return t[p]; return () => undefined; } },
  );
  {
    const npc = spawnAt();
    pump(10);
    g.net = fakeNet(false);
    const before = { savedMech: w.flags.savedMech, unlockedPrincessSpawn: w.flags.unlockedPrincessSpawn };
    w.flags.afterPartyOfDoom = true;
    w.flags.savedMech = true; w.flags.unlockedPrincessSpawn = true;   // 复位面证人
    pump(30);
    const clientRan = aliveGuides() > (npc.dead ? 0 : 1) || w.flags.afterPartyOfDoom === false;
    chk('D3a 访客态(isHost=false)：清算整块不跑（NPC 存活+武装保持+六旗保持）',
      !npc.dead && w.flags.afterPartyOfDoom === true && w.flags.savedMech === true,
      `dead=${npc.dead} armed=${w.flags.afterPartyOfDoom} savedMech=${w.flags.savedMech}`);
    void clientRan; void before;
    g.net = null;                       // 还原单机 → 同拍放行
    pump(10);
    chk('D3b 还原 host：清算照跑（门只在客户端侧拦截）',
      npc.dead && w.flags.afterPartyOfDoom === false && w.flags.savedMech === false,
      `dead=${npc.dead} armed=${w.flags.afterPartyOfDoom} savedMech=${w.flags.savedMech}`);
  }

  // ── D4/F-7：host 态照跑（服务器权威域语义）──
  {
    const npc = spawnAt();
    pump(10);
    g.net = new Proxy(
      { active: true, policy: { isHost: true, protectTiles: true, protectItems: true, pvpAllowed: false }, players: new Map() },
      { get(t, p) { if (p in t) return t[p]; return () => undefined; } },
    );
    w.flags.afterPartyOfDoom = true;
    pump(30);
    g.net = null;
    chk('D4 host 态(isHost=true)：清算照跑（netMode!=1 单机/服务器域）',
      npc.dead && w.flags.afterPartyOfDoom === false, `dead=${npc.dead}`);
  }

  return { R, world: { w: w.w, groundLevel: w.groundLevel } };
});

writeFileSync(`${OUT}/doom-report.json`, JSON.stringify(out, null, 2));
const fails = out.R.filter((r) => !r.ok);
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 10).join('\n'));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
