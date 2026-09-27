// ★BJ364 实机探针——利刃台风 2611（弹 404 头弹 aiStyle69 / 405 泡泡 aiStyle70）
// 断言面（对拍 1457 反编译基线 Projectile.cs:30730-30829/18428-18441/19626-19686/14031-14186）：
//  A. 空旷出手：404 出生锚/初速≈14×攻速缩放/alpha 淡入(255→0,ai1>5)/泡泡节拍(ai1%4==0→第4拍首枚)
//     /出程 dist>400 转回收(速20)/>600 升档(40)/dist<spd 回手 Kill/回收期仍每4拍伴泡泡。
//  B. 打靶：404 命中敌 → 敌 iframes=10（共享窗写入）+ 404 st=1 回收；405 追踪命中 → 敌 hp 减
//     + 405 即爆（Item_54 音 + d212 尘）+ iframes【不变】（不写窗）。
//  C. 窗交互：敌 iframes>0 时——404 再碰 = 不命中（读共享窗）；405 碰 = 命中（flag3 豁免）。
//  D. 撞墙：404 朝墙 → 不死转回收(ai0=1)+HitTiles 尘+撞墙音；405 → 第1次反弹(速度反转)第2次 Kill 爆。
//  E. 寿命尽：无敌场静置 405 → 第 120 拍爆（Item_54+d212），非静默消失。
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj364-flairon-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await g.newWorld('bj364', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  const O = { A: {}, B: {}, C: {}, D: {}, E: {}, env: {} };

  // 音/尘探针（wrap 记录）
  const sfxLog = [];
  const dustLog = [];
  if (g.playSfxFiles) {
    const origS = g.playSfxFiles.bind(g);
    g.playSfxFiles = (...a) => { sfxLog.push({ files: a[0], at: Date.now() }); return origS(...a); };
  }
  if (g.playSfx) {
    const origP = g.playSfx.bind(g);
    g.playSfx = (...a) => { sfxLog.push({ play: a[0], at: Date.now() }); return origP(...a); };
  }
  if (g.spawnDust) {
    const origD = g.spawnDust.bind(g);
    g.spawnDust = (...a) => { const d = origD(...a); dustLog.push({ type: a[4], x: a[0], y: a[1] }); return d; };
  }

  // ---- 落位：干净地表 ----
  const pcol0 = Math.trunc(4200 * 8);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(pcol0, y)) { groundY = y; break; } }
  if (groundY < 0) {
    const c0 = Math.trunc(p.x / 16);
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
    p.x = c0 * 16; p.y = groundY * 16 - p.h;
  } else {
    p.x = pcol0 * 16; p.y = groundY * 16 - p.h;
  }
  p.vx = 0; p.vy = 0;
  O.env.groundY = groundY;

  // ---- 装备利刃台风 ----
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  const itemId = items[key2611];
  p.inv.slots[0] = { id: itemId, stack: 1 };
  p.inv.selected = 0;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);

  const fireOnce = () => {
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };
  const projs = () => g.entities.projectiles;
  const byId = (id) => projs().filter((q) => q.projId === id);
  const clearProjs = () => { for (const q of projs()) q.dead = true; g.fixedUpdate(1 / 60); };
  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };

  // ================= A. 空旷出手（三段/节拍/淡入） =================
  {
    const { Enemy } = await import('/src/entities/Enemy.ts');
    void Enemy;
    clearProjs();
    sfxLog.length = 0; dustLog.length = 0;
    aim(p.cx + 320, p.cy - 4);
    fireOnce();
    const heads = byId(404);
    O.A.headSpawned = heads.length;
    if (heads.length) {
      const h = heads[0];
      O.A.spawnOffset = { dx: +(h.cx - p.cx).toFixed(1), dy: +(h.cy - p.cy).toFixed(1) };
      O.A.v0 = { vx: +h.vx.toFixed(2), vy: +h.vy.toFixed(2), sp: +Math.hypot(h.vx, h.vy).toFixed(2) };
      O.A.alpha0 = h.alphaView;
      // 逐拍 100 拍：st/alpha/aiTick/泡泡计数
      const trace = [];
      const bubbleBirths = [];
      let lastBubbleCount = 0;
      for (let t = 1; t <= 100; t++) {
        g.fixedUpdate(1 / 60);
        const nb = byId(405).length;
        if (nb > lastBubbleCount) { bubbleBirths.push({ t, v: (() => { const bs = byId(405); return bs[bs.length - 1] ? { vx: +bs[bs.length - 1].vx.toFixed(2), vy: +bs[bs.length - 1].vy.toFixed(2), sp: +Math.hypot(bs[bs.length - 1].vx, bs[bs.length - 1].vy).toFixed(2) } : null; })() }); lastBubbleCount = nb; }
        if (t <= 40 || t % 10 === 0 || h.st !== (trace[trace.length - 1]?.st ?? 0)) {
          if (!trace.length || trace[trace.length - 1].t !== t) {
            trace.push({ t, st: h.st, dist: +Math.hypot(p.cx - h.cx, p.cy - h.cy).toFixed(0), sp: +Math.hypot(h.vx, h.vy).toFixed(1), alpha: h.alphaView, aiTick: h.aiTick, dead: !!h.dead });
          }
        }
        if (h.dead) { O.A.headDeathTick = t; break; }
      }
      O.A.trace = trace;
      O.A.bubbleBirths = bubbleBirths;
      O.A.bubbleBirthTickPattern = bubbleBirths.map((b) => b.t);
      O.A.headAlive100t = !h.dead;
    }
    clearProjs();
  }

  // ================= B. 打靶（命中/窗/泡泡命中/即爆） =================
  do {
    const { Enemy } = await import('/src/entities/Enemy.ts');
    clearProjs();
    sfxLog.length = 0; dustLog.length = 0;
    // 僵尸 vid=3 悬空放在玩家右 240px（浮空防走位干扰）
    const foe = Enemy.fromVanilla(3, p.cx + 240, p.cy - 40);
    if (!foe) { O.B.fail = 'spawn-foe'; break; }
    foe.id = 987001;
    foe.hp = 500; foe.maxHp = 500;   // 防 404 一击致死干扰窗观测
    foe.ai0 = 0; // 静止
    g.entities.add(foe, 'enemies');
    g.fixedUpdate(1 / 60);
    O.B.foeHp0 = foe.hp;
    O.B.foeDefense = foe.def?.defense ?? null;
    aim(foe.cx, foe.cy);
    fireOnce();
    const events = [];
    let fired404Hit = -1, firstBubbleHit = -1;
    let prevIframes = 0, prevHp = foe.hp, prevHeadSt = 0;
    for (let t = 1; t <= 140 && !byId(404).length === false; t++) {
      g.fixedUpdate(1 / 60);
      const h = byId(404)[0];
      if (foe.iframes !== prevIframes) { events.push({ t, kind: 'foe-iframes', v: foe.iframes, prev: prevIframes }); prevIframes = foe.iframes; }
      if (foe.hp !== prevHp) { events.push({ t, kind: 'foe-hp', v: foe.hp, prev: prevHp }); prevHp = foe.hp; if (fired404Hit < 0 && h && h.st === 1) fired404Hit = t; else if (firstBubbleHit < 0) firstBubbleHit = t; }
      if (h && h.st !== prevHeadSt) { events.push({ t, kind: 'head-st', v: h.st, prev: prevHeadSt }); prevHeadSt = h.st; }
      const iB = byId(405);
      if (iB.length !== (events.filter((e) => e.kind === 'bubble-count').at(-1)?.v ?? 0)) {
        events.push({ t, kind: 'bubble-count', v: iB.length });
      }
      if (!h || h.dead) { O.B.headGoneTick = t; break; }
      if (t > 139) break;
    }
    O.B.events = events;
    O.B.foeHpEnd = foe.hp;
    O.B.foeIframesEnd = foe.iframes;
    O.B.headRecycledOnHit = fired404Hit;
    O.B.sfxAfterCombat = sfxLog.slice(0, 6);
    O.B.dustTypes = [...new Set(dustLog.map((d) => d.type))];
    // 泡泡命中后 iframes 不写窗验证已在 events 里（bubble-hit 前后 iframes 对比）
    void firstBubbleHit;
    // 清场
    for (const e of g.entities.enemies) e.dead = true;
    g.fixedUpdate(1 / 60);
    clearProjs();
  } while (0);

  // ================= C. 窗交互专项（iframes>0 时 404 拒 / 405 收） =================
  do {
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const { FlaironHeadProj, FlaironSpike } = await import('/src/entities/WeaponProj.ts');
    clearProjs();
    const foe = Enemy.fromVanilla(3, p.cx + 200, p.cy - 40);
    if (!foe) { O.C.fail = 'spawn-foe'; break; }
    foe.id = 987002;
    foe.hp = 500; foe.maxHp = 500;   // 防 404 一击致死干扰窗观测
    g.entities.add(foe, 'enemies');
    g.fixedUpdate(1 / 60);
    const hp0 = foe.hp;
    // 手动 404 在敌身边（必中）
    const h1 = new FlaironHeadProj(foe.x - 4, foe.y + 4, 0, 0, 60, 4.5);
    h1.critChance = 0;
    g.entities.add(h1, 'projectiles');
    g.fixedUpdate(1 / 60);
    const hit1 = { hp1: foe.hp, iframes1: foe.iframes, headSt: h1.st, headDead: h1.dead };
    // 敌处于 iframes 窗中 → 再放一颗 404 → 应【不命中】（hp 不再减、head 不因 onHit 回收——
    // 但 404 无敌重叠区外可能撞敌盒每拍都试——iframes>0 挡）
    const h2 = new FlaironHeadProj(foe.x - 4, foe.y + 4, 0, 0, 60, 4.5);
    h2.critChance = 0;
    g.entities.add(h2, 'projectiles');
    g.fixedUpdate(1 / 60);
    const hit2 = { hp2: foe.hp, iframes2: foe.iframes, head2St: h2.st };
    // 同窗内放 405 → 应【命中】（flag3 豁免）：hp 减、405 即爆
    const b1 = new FlaironSpike(foe.cx - 7, foe.cy - 7, 0, 0, 30, 4.5);
    b1.critChance = 0;
    g.entities.add(b1, 'projectiles');
    const b1Trace = [];
    for (let t = 1; t <= 15 && !b1.dead; t++) {
      g.fixedUpdate(1 / 60);
      b1Trace.push({ t, x: +b1.cx.toFixed(1), hp: foe.hp, iframes: foe.iframes });
    }
    const hit3 = { hp3: foe.hp, iframes3: foe.iframes, b1Dead: b1.dead, iframesUnchangedByBubble: foe.iframes === hit2.iframes2, b1Trace };
    O.C.hit1_fullHp = { hp0, ...hit1 };
    O.C.hit2_whileIframes_404 = hit2;
    O.C.hit3_whileIframes_405 = hit3;
    for (const e of g.entities.enemies) e.dead = true;
    g.fixedUpdate(1 / 60);
    clearProjs();
  } while (0);

  // ================= D. 撞墙（404 转回收 / 405 反弹1次再碰 Kill） =================
  {
    clearProjs();
    sfxLog.length = 0; dustLog.length = 0;
    // 玩家右方 180px 造 3 高石墙（1 号土块→1 系实心；直接用 1 stone=1）
    const wx = Math.trunc((p.cx + 180) / 16);
    const wy = Math.trunc(p.cy / 16);
    for (let dy = -3; dy <= 2; dy++) st.setTile(wx, wy + dy, 1, 0, 0);
    // 404 朝墙
    aim(wx * 16 + 8, p.cy);
    fireOnce();
    const h = byId(404)[0];
    const seq = [];
    if (h) {
      for (let t = 1; t <= 80; t++) {
        g.fixedUpdate(1 / 60);
        if (h.st !== (seq.at(-1)?.st ?? 0)) seq.push({ t, st: h.st, sp: +Math.hypot(h.vx, h.vy).toFixed(1), dead: !!h.dead });
        if (h.dead) { seq.push({ t, dead: true }); break; }
      }
    }
    O.D.headWallSeq = seq;
    O.D.headSurvivedWall = !byId(404)[0]?.dead || byId(404).length > 0;
    O.D.wallDustTypes = [...new Set(dustLog.map((d) => d.type))];
    clearProjs();
    // 405 撞墙:出生在墙左侧 40px 朝墙飞（手动构造排除 404 干扰）
    const { FlaironSpike } = await import('/src/entities/WeaponProj.ts');
    sfxLog.length = 0; dustLog.length = 0;
    const b = new FlaironSpike(wx * 16 - 40 - 7, wy * 16 - 7, 4, 0, 30, 4.5);
    b.critChance = 0;
    g.entities.add(b, 'projectiles');
    const bSeq = [];
    for (let t = 1; t <= 40; t++) {
      g.fixedUpdate(1 / 60);
      bSeq.push({ t, x: +b.cx.toFixed(1), vx: +b.vx.toFixed(2), wet: !!b.wet, dead: !!b.dead });
      if (b.dead) break;
    }
    O.D.bubbleWallSeq = bSeq.slice(0, 12);
    O.D.bubbleWallSeqTail = bSeq.slice(-6);
    O.D.bubbleBounceThenKill = b.dead && bSeq.length >= 2;
    O.D.bubbleExplodeDust212 = dustLog.filter((d) => d.type === 212).length;
    O.D.item54Played = sfxLog.some((s) => String(s.files ?? s.play ?? '').includes('Item_54') || String(s.files ?? s.play ?? '').includes('54'));
    clearProjs();
  }

  // ================= D2. 405 夹缝：反弹后反向墙 → 第2次接触 Kill 爆 =================
  do {
    clearProjs();
    sfxLog.length = 0; dustLog.length = 0;
    const wxc = Math.trunc((p.cx + 300) / 16);
    const wyc = Math.trunc(p.cy / 16);
    for (let dy = -3; dy <= 2; dy++) { st.setTile(wxc - 2, wyc + dy, 1, 0, 0); st.setTile(wxc + 2, wyc + dy, 1, 0, 0); }
    const { FlaironSpike } = await import('/src/entities/WeaponProj.ts');
    // 出生在两墙（3 格夹缝 48px）正中，vx=6 朝右墙飞 → 反弹 → 左墙 → Kill
    const b = new FlaironSpike(wxc * 16 - 7, wyc * 16 - 7, 6, 0, 30, 4.5);
    b.critChance = 0;
    g.entities.add(b, 'projectiles');
    const seq = [];
    let deathT = -1;
    for (let t = 1; t <= 60; t++) {
      g.fixedUpdate(1 / 60);
      seq.push({ t, x: +b.cx.toFixed(0), vx: +b.vx.toFixed(2) });
      if (b.dead) { deathT = t; break; }
    }
    O.D2 = {
      deathT,
      firstThird: seq.slice(0, 3),
      bouncePoints: seq.filter((s, i) => i > 0 && Math.sign(s.vx) !== Math.sign(seq[i - 1].vx)).slice(0, 4),
      explodeDust212: dustLog.filter((d) => d.type === 212).length,
      item54: sfxLog.some((s) => String(s.files ?? s.play ?? '').includes('Item_54')),
      bouncedOnceThenKilled: deathT > 0 && dustLog.filter((d) => d.type === 212).length === 20,
    };
    for (let dy = -3; dy <= 2; dy++) { st.setTile(wxc - 2, wyc + dy, 0, 0, 0); st.setTile(wxc + 2, wyc + dy, 0, 0, 0); }
    clearProjs();
  } while (0);

  // ================= E. 寿命尽爆（静置 405 → 120 拍 Kill 带 Item_54+d212） =================
  {
    clearProjs();
    sfxLog.length = 0; dustLog.length = 0;
    const { FlaironSpike } = await import('/src/entities/WeaponProj.ts');
    const b = new FlaironSpike(p.cx - 7, p.cy - 60 - 7, 0, 0, 30, 4.5);
    b.critChance = 0;
    g.entities.add(b, 'projectiles');
    let deathTick = -1;
    for (let t = 1; t <= 150; t++) {
      g.fixedUpdate(1 / 60);
      if (b.dead) { deathTick = t; break; }
    }
    O.E.deathTick = deathTick;
    O.E.explodeDust212 = dustLog.filter((d) => d.type === 212).length;
    O.E.item54Played = sfxLog.some((s) => String(s.files ?? s.play ?? '').includes('Item_54'));
    O.E.silentVanish = deathTick > 0 && O.E.explodeDust212 === 0;
    clearProjs();
  }

  return O;
});
console.log('BJ364_PROBE=' + JSON.stringify(out, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors));
await browser.close();
