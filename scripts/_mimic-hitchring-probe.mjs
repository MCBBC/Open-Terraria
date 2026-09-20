// ★SW-BJxxx 一次性探针：神圣宝箱怪 475 真实弹幕命中环逐环采样（用户实报"武器无伤,子弹穿透"）
//  场景 S0 桶归属：BJ174 生成链（spawnVanillaEnemy→fromVanilla→addEnemy）落桶亲读
//  场景 S1 伪装态(ai0=0)真实木箭命中：盒相交/命中环/hurt 三环采样
//  场景 S2 清醒态(ai0=2) 状态3 之前：真实木箭命中（预期掉血=BJ174 直驱结论对齐）
//  场景 S3 蓄能态(ai0=3) 走完 180t 出态后：真实木箭命中（原版 NPC.cs:37848 头部每拍
//        dontTakeDamage=false 复位——本仓 bigMimicAI 头缺该行 → 出态后旗标卡死）
//  判别：S3 hpDelta>0=原版同相；=0 且 dontTakeDamage=true=断环实证
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5255';

const boot = async (tag) => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/?play=small&mimicring' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ok) throw new Error(tag + ' 未进游戏');
  await new Promise((r) => setTimeout(r, 1200));
  // 出生清场窗口（ForceClearArea）settle 后再布置夹具
  await new Promise((r) => setTimeout(r, 8000));
  return { browser, page, errors };
};

/** 页内夹具：宝箱怪生成（BJ174 spawnMimic 同链：spawnVanillaEnemy+底锚修正）+ 状态钉制 */
async function setupMimic(page, cfg) {
  return page.evaluate(async (cfg) => {
    const g = window.__swGame;
    const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
    // BJ174 spawnMimic 链复刻：NewNPC Bottom 锚（x*16+16, y*16+32）→ fromVanilla 盒心锚修正
    const bx = g.player.cx + (cfg.playerAway ? 300 : 0), by = g.player.cy;
    const e = spawnVanillaEnemy(g, 475, bx, by);
    if (!e) return { ok: false, why: 'spawn-null' };
    e.y -= e.h / 2;
    // 钉状态：0 伪装 / 2 清醒跳扑 / 3 蓄能（ai1 179→下拍即出态）
    e.ai0 = cfg.ai0; e.ai1 = cfg.ai0 === 3 ? 179 : 0; e.ai2 = 0; e.ai3 = 0;
    e.vx = 0; e.vy = 0;
    // 玩家拉远防 80px 邻近唤醒/600px 换态（伪装态采样需要）
    if (cfg.playerAway) { g.player.x = e.x - 400; g.player.y = e.y; }
    return {
      ok: true,
      id: e.id,
      bucket: g.entities.enemies.includes(e) ? 'enemies'
        : g.entities.npcs.includes(e) ? 'npcs'
        : g.entities.critters.includes(e) ? 'critters' : '???',
      box: { x: e.x, y: e.y, w: e.w, h: e.h },
      hp0: e.hp, maxHp: e.maxHp, ai0: e.ai0, vanillaId: e.vanillaId,
      flags: {
        dontTakeDamage: e.dontTakeDamage, immortal: e.immortal, iframes: e.iframes,
        friendly: e.def?.friendly, reflectsProjectiles: e.reflectsProjectiles,
        noTileCollide: e.noTileCollide,
      },
    };
  }, cfg);
}

/** 页内：真实武器弹幕（木箭 2=WoodenArrowFriendly，Arrow 主命中环=Damage_PVE 移植）
 *  从 mimic 左侧 80px 水平射入盒心，等 40 拍后采样三环 */
async function fireArrow(page, tag) {
  const r = await page.evaluate(async () => {
    const g = window.__swGame;
    const { Arrow } = await import('/src/entities/Arrow.ts');
    const e = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 475);
    if (!e) return { ok: false, why: 'no-mimic' };
    const cy = e.y + e.h / 2;
    const a = new Arrow(e.x - 80, cy, 12, 0, 40, 2, 2, { grav: 0 });
    const hp0 = e.hp;
    g.entities.add(a, 'projectiles');
    await new Promise((r) => setTimeout(r, 40 * 16.6));   // 弹 12px/t → 80px 约 7 拍到位
    const overlapNow = a.x < e.x + e.w && a.x + a.w > e.x && a.y < e.y + e.h && a.y + a.h > e.y;
    return {
      ok: true,
      proj: { x: Math.round(a.x), y: Math.round(a.y), w: a.w, h: a.h, dead: a.dead, damage: a.damage },
      enemy: {
        x: Math.round(e.x), y: Math.round(e.y), w: e.w, h: e.h, ai0: e.ai0, hp: e.hp,
        iframes: e.iframes, dontTakeDamage: e.dontTakeDamage, justHitT: e.justHitT,
        reflectsProjectiles: e.reflectsProjectiles,
      },
      overlapNow, hpDelta: hp0 - e.hp,
    };
  });
  return { tag, ...r };
}

const out = {};

// ================= S0+S1：伪装态（玩家拉远）真实木箭 =================
{
  const { browser, page, errors } = await boot('ringS1');
  out.S0_bucket = await setupMimic(page, { ai0: 0, playerAway: true });
  await new Promise((r) => setTimeout(r, 300));   // 等 2-3 拍确认伪装态不被邻近唤醒
  out.S1_disguised = await fireArrow(page, 'S1');
  out.S1_errors = errors;
  await page.close(); await browser.close();
}

// ================= S2：清醒态（状态3 之前）真实木箭 =================
{
  const { browser, page, errors } = await boot('ringS2');
  out.S2_setup = await setupMimic(page, { ai0: 2, playerAway: true });
  await new Promise((r) => setTimeout(r, 200));
  out.S2_preState3 = await fireArrow(page, 'S2');
  out.S2_errors = errors;
  await page.close(); await browser.close();
}

// ================= S3：蓄能态出态后（头部缺复位 → 旗标卡死） =================
{
  const { browser, page, errors } = await boot('ringS3');
  out.S3_setup = await setupMimic(page, { ai0: 3, playerAway: true });   // ai1=179
  await new Promise((r) => setTimeout(r, 300));   // 2-3 拍 → 出态 ai0=2
  out.S3_afterExit = await page.evaluate(() => {
    const e = window.__swGame.entities.enemies.find((n) => !n.dead && n.vanillaId === 475);
    return { ai0: e?.ai0, dontTakeDamage: e?.dontTakeDamage, hp: e?.hp };
  });
  out.S3_postExit = await fireArrow(page, 'S3');
  // 直驱 hurt 对照（BJ174 探针 C 同参,旗标卡死应返 false=直驱面也断）
  out.S3_directHurt = await page.evaluate(() => {
    const g = window.__swGame;
    const e = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 475);
    const hp0 = e.hp;
    const ret = e.hurt(100, 0, 0, g, 0, false, 1, true);
    return { ret, hpDelta: hp0 - e.hp, dontTakeDamage: e.dontTakeDamage };
  });
  out.S3_errors = errors;
  await page.close(); await browser.close();
}

console.log(JSON.stringify(out, null, 1));
