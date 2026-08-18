// 裁缝巫毒娃娃 1307 全链验证：夜间+装备娃娃杀裁缝 → 骷髅王 35 生成于裁缝位
// （NewNPC Bottom 语义：头底 Y=裁缝中心 Y）+ boss 槽指向；四反向门（白天/
// 已有 35 不二召/未装备/其他 NPC）+ Weather 史莱姆雨计数王在场门。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5208') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world && g.world.store; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, w = g.world;
  const TownNPC = (await import('/src/entities/TownNPC.ts')).TownNPC;
  // 公告 spy（Game.announce :18941——HasAwoken 走此口）
  const announces = [];
  const origAnnounce = g.announce.bind(g);
  g.announce = (k, who, r, gr, b) => { announces.push([k, who, r, gr, b]); origAnnounce(k, who, r, gr, b); };
  // 装备 1307（Player.ts:634 accVid===1307 → killClothier；配饰槽 armor[3]）
  const dollKey = Object.keys(window.__swItems).find(k => /^vi_1307_/.test(k));
  if (!dollKey) return { error: 'no vi_1307_* item key in __swItems' };
  p.inv.armor[3] = { id: window.__swItems[dollKey], stack: 1 };
  const eqKillClothier = p.equipStats.killClothier;
  const enemies35 = () => g.entities.enemies.filter(e => !e.dead && e.vanillaId === 35);
  // 造裁缝（玩家上方错位排布防重叠；hurt 即时结算不依赖落地）
  const mkClothier = (dy) => {
    const t = new TownNPC('clothier', p.cx, p.y - 60 - dy);
    g.entities.add(t, 'npcs');
    return t;
  };

  // ---- A: 夜间 + 娃娃 → 召骷髅王 ----
  w.clock.timeOfDay = 0;                       // 午夜（isDay=false）
  const night = !w.clock.isDay;
  const t1 = mkClothier(0);
  const c1 = { cx: t1.cx, cy: t1.cy };
  t1.hurt(99999, 2, 0, g);
  const heads1 = enemies35();
  const head = heads1[0] ?? null;
  const headBottom = head ? head.y + head.h : null;
  const posOk = head
    ? Math.abs(head.cx - c1.cx) < 0.51 && Math.abs(headBottom - c1.cy) < 0.51 : false;
  const bossSlotA = head ? g.boss === head : false;

  // ---- B: 夜间且 35 已在场 → 再杀裁缝不二召（AnyNPCs(35) 门 :78959）----
  const t2 = mkClothier(100);
  t2.hurt(99999, 2, 0, g);
  const countB = enemies35().length;

  // ---- C: 白天 + 娃娃 → 不召（!Main.IsItDay() 门）----
  w.clock.timeOfDay = 0.5;                     // 正午
  const day = w.clock.isDay;
  const t3 = mkClothier(200);
  t3.hurt(99999, 2, 0, g);
  const countC = enemies35().length;

  // ---- D: 夜间但卸下娃娃 → 不召（killClothier 玩家门 :78963）----
  w.clock.timeOfDay = 0;
  p.inv.armor[3] = null;
  const eqOff = !p.equipStats.killClothier;
  const t4 = mkClothier(300);
  t4.hurt(99999, 2, 0, g);
  const countD = enemies35().length;

  // ---- E: Weather.advanceSlimeRainKill 王在场计数门（NPC.cs:79881 !AnyNPCs(50)）----
  const wt = w.weather;
  const saved = { rain: wt.slimeRain, cnt: wt.slimeRainKillCount };
  wt.slimeRain = true; wt.slimeRainKillCount = 100;
  wt.advanceSlimeRainKill(1, false, true);           // 王在场：不计数
  const kingGatedCount = wt.slimeRainKillCount;
  wt.advanceSlimeRainKill(1, false, false);          // 王不在：递增
  const openCount = wt.slimeRainKillCount;
  wt.slimeRainKillCount = wt.slimeRainKillCount >= 150 ? -75 : wt.slimeRainKillCount; // 不触出王（100+1=101<150）
  wt.slimeRain = saved.rain; wt.slimeRainKillCount = saved.cnt;

  return {
    dollKey, eqKillClothier,
    A: { night, spawned: heads1.length, posOk, clothier: c1, head: head ? { cx: head.cx, bottomY: headBottom, hp: head.hp, maxHp: head.maxHp } : null, bossSlot: bossSlotA },
    B_nodoubleWhen35Present: countB,
    C: { day, countAfterDayKill: countC },
    D: { eqOff, countAfterNoDollKill: countD },
    E: { kingGatedCount, openCount },
    announces,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
