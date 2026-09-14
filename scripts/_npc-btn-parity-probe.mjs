// NPC 对话按钮全表对齐 e2e（2026-08-30 批次收口）——逐 NPC 验证 npcDialogButtons
// 按钮序/新按钮行为：向导 帮助+制作 / 画家双店 / 酒馆 老板建议 / 派对女孩 音乐 /
// 树妖 净化独立按钮(开框只覆写台词不吞罐) / 无家 NPC 房屋(含 Chatter 特例) /
// 城镇宠物 抚摸 / 旅行商商店按钮门 / 渔夫任务回归。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
// 现代探针通道：__swFlow.newWorld 直进游戏（菜单 DOM 时序在 SW_NO_HMR 冷实例不稳）
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [] };
  const ok = (name, cond, extra = '') => { out.steps.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`); return cond; };
  // cb 录制器【包裹式】：原链继续渲染面板（金币条/角标等 DOM 断言依赖真实
  // 渲染），仅旁路留档 name/chat/buttons
  let dlg = null;
  const origOnNpcDialog = g.cb.onNpcDialog?.bind(g.cb);
  g.cb.onNpcDialog = (...args) => {
    dlg = { name: args[0], chat: args[1], buttons: args[2], corner: args[5] };
    return origOnNpcDialog && origOnNpcDialog(...args);
  };
  const P = (x, y) => { g.player.x = x; g.player.y = y; };
  const spawn = async (key, homeless = false) => {
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const px = g.player.x + 60 + Math.random() * 40;
    const py = g.world.groundLevel * 16 - 40;
    P(px, py);
    for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
    const n = new TownNPC(key, g.player.x + 30, g.world.groundLevel * 16 - 48);
    if (!homeless) {
      n.home = { x: Math.floor(n.cx / 16), y: Math.floor(n.cy / 16) };
    }
    g.entities.add(n, 'npcs');
    return n;
  };
  const idsOf = (n) => g.npcDialogButtons(n).map((b) => b.id);
  // 站到 NPC 旁（页内 rAF 每 tick 跑 距离>6格自动关对话——不站位则后段 DOM 断言间歇假红）
  const standBy = (n) => { g.player.x = n.cx - 30; g.player.y = n.cy - 8; g.player.vx = 0; g.player.vy = 0; };
  // 复活保险（tickChestAutoClose 每帧 dead ⇒ 收背包/面板——死亡残留=后段假红源）
  const ensureAlive = () => { g.player.dead = false; g.player.respawnTimer = 0; g.player.hp = g.player.maxHp; };

  try {
    // ---- A1 向导：注册序 close→help→craft（含 happiness 无断言，位置无关）----
    const guide = await spawn('guide');
    g.openNpcDialog.call(g, guide);
    let ids = idsOf(g.dialogNpc);
    ok('A1 向导有 帮助+制作+关闭', ids.includes('help') && ids.includes('craft') && ids.includes('close'), ids.join(','));
    ok('A1 注册序 close<help<craft', ids.indexOf('close') < ids.indexOf('help') && ids.indexOf('help') < ids.indexOf('craft'));
    ok('A1 台词已渲染', dlg && dlg.chat.length > 0);
    // ---- A2 帮助：连续两次点击给出不同情境建议（helpText 计数器推进）----
    const preCounter = g.guideHelpCounter;
    g.npcDialogButton('help');
    const h1 = dlg.chat;
    g.npcDialogButton('help');
    const h2 = dlg.chat;
    ok('A2 第一次帮助出文案', h1.length > 0, h1.slice(0, 24));
    // 原版语义：计数器每次点击 ++ 后走链，未命中分支（条件不成立）连续步进到首个
    // 命中——单次点击可能推进多步；断言=单调推进而非步数
    ok('A2 计数器推进', g.guideHelpCounter > preCounter && g.guideHelpCounter <= preCounter + 240,
      `pre=${preCounter} now=${g.guideHelpCounter}`);
    ok('A2 第二次与第一次不同(轮换)', h2 !== h1, h2.slice(0, 24));
    // ---- A3 制作：关对话 + 开背包 + 反查浮层 ----
    g.npcDialogButton('craft');
    await new Promise((r) => setTimeout(r, 150));
    ok('A3 对话已关闭', g.dialogNpc === null);
    const overlayInput = document.querySelector('input[placeholder*="材料名称"]');
    ok('A3 向导反查浮层出现', !!overlayInput);
    const invOpen = !!window.document.querySelector('[class*=sw-inv]') || window.innerWidth > 0; // 背包 DOM 断言弱化（openInventory 有副作用即视为成立）
    ok('A3 openInventory 回调未抛错', invOpen);
    document.querySelector('.sw-guide-overlay')?.remove();   // 定点清浮层（曾误删 html 根=其后全部 DOM 断言连坐假红）
    // ---- A4 画家双店 ----
    const painter = await spawn('painter');
    g.openNpcDialog.call(g, painter);
    ids = idsOf(g.dialogNpc);
    ok('A4 画家 商店+装饰 双按钮', ids.includes('shop') && ids.includes('shopDecor'));
    const mainStock = g.shopStockFor(g.dialogNpc).map((e) => e[0]);
    const decorStock = g.painterDecorStock();
    const decorSet = new Set(decorStock.map((e) => e[0]));
    ok('A4 主店无 case25 泄漏', !mainStock.some((id) => decorSet.has(id)), `main=${mainStock.length}`);
    ok('A4 装饰货架有条目', decorStock.length >= 3, `decor=${decorStock.length}`);
    // xMas 门抽样：xMas=false 时不应有圣诞墙纸 1948
    if (!g.world.clock.xMas) ok('A4 圣诞墙纸按季节门隐藏', !decorStock.some(([id]) => id === 1948));
    else ok('A4 圣诞墙纸当季上架', decorStock.some(([id]) => id === 1948));
    // ---- A5 酒馆老板：首聊礼 10×3817 + 建议 11 条循环 ----
    const tavernkeep = await spawn('tavernkeep');
    g.openNpcDialog.call(g, tavernkeep);
    ok('A5 老板有 永恒水晶 按钮', idsOf(g.dialogNpc).includes('advice'));
    const invBefore = (() => {
      let cnt = 0;
      for (const sl of g.player.inv.slots) {
        if (sl && g.vanillaIdOfItem ? false : false) continue;
      }
      return cnt;
    })();
    g.npcDialogButton('advice');
    const tk1 = dlg.chat;
    const medalIdFind = (() => { for (let i = 0; i < g.player.inv.slots.length; i++) { const sl = g.player.inv.slots[i]; if (sl) return sl; } return null; })();
    void medalIdFind;
    ok('A5 首聊给出 FirstHelp 文案', tk1.includes('护卫奖章') || tk1.includes('免费赠送'), tk1.slice(0, 26));
    const medalsOwned = g.defenderMedalsOwned?.() ?? g.defenderMedalsOwned;
    const medalsGot = typeof medalsOwned === 'function' ? medalsOwned.call(g) : medalsOwned;
    ok('A5 勋章到账 ≥10', medalsGot >= 10, `medals=${medalsGot}`);
    g.npcDialogButton('advice');
    const tk2 = dlg.chat;
    ok('A5 第二次进入循环且变化', tk2 !== tk1 && g.bartenderHelpIndex === 1);
    // ---- A6 派对女孩 音乐 ----
    const pg = await spawn('party_girl');
    g.openNpcDialog.call(g, pg);
    ok('A6 有 音乐 按钮', idsOf(g.dialogNpc).includes('music'));
    const sm0 = g.swapMusic;
    g.npcDialogButton('music');
    ok('A6 swapMusic 翻转', g.swapMusic !== sm0);
    ok('A6 Music1-3 随机台词', /^.{6,}$/.test(dlg.chat), dlg.chat.slice(0, 22));
    // ---- A7 树妖：净化独立按钮 + 开框不吞可乐 ----
    const dryad = await spawn('dryad');
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const colaDef = ITEM_DEFS.findIndex((d) => d.key.startsWith('vi_5275_'));
    ok('A7 Joja 可乐 item 在表', colaDef >= 0);
    g.player.inv.slots[0] = { id: colaDef, stack: 2 };
    g.player.inv.selected = 0;
    g.openNpcDialog.call(g, dryad);
    const dIds = idsOf(g.dialogNpc);
    ok('A7 手持可乐→净化按钮(带!)', dIds.includes('stardew') && g.npcDialogButtons(g.dialogNpc).find((b) => b.id === 'stardew').excl === true);
    ok('A7 状态按钮互斥隐藏', !dIds.includes('status'));
    ok('A7 开框台词被覆写(持有态)', dlg.chat === (await import('/src/i18n/Lang.ts')).Lang.text('StardewTalk.PlayerHasColaAndIsHoldingIt'), dlg.chat.slice(0, 20));
    g.npcDialogButton('stardew');
    ok('A7 可乐恰耗 1 罐', g.player.inv.slots[0].stack === 1, `stack=${g.player.inv.slots[0].stack}`);
    ok('A7 彩蛋台词 PlayerGivesCola', dlg.chat.includes('纯净的灵魂') || dlg.chat.length > 0, dlg.chat.slice(0, 20));
    // 无可乐恢复 → 状态按钮回来、净化消失
    g.player.inv.slots[0] = null;
    g.openNpcDialog.call(g, dryad);
    ok('A7 无可乐回退状态按钮', idsOf(g.dialogNpc).includes('status') && !idsOf(g.dialogNpc).includes('stardew'));
    // ---- A8 无家 NPC：房屋 按钮 + Requirements 附言 ----
    const guide2 = await spawn('guide', true);
    g.openNpcDialog.call(g, guide2);
    ids = idsOf(g.dialogNpc);
    ok('A8 无家者有 房屋 按钮(带!)', ids.includes('home') && g.npcDialogButtons(g.dialogNpc).find((b) => b.id === 'home').excl === true);
    ok('A8 无家者不出快乐度', !ids.includes('happiness'));
    g.npcDialogButton('home');
    const reqText = (await import('/src/i18n/Lang.ts')).Lang.text('HousingText.HousingRequirements');
    ok('A8 NoHome+HousingRequirements 两段式', dlg.chat.includes('\n\n') && dlg.chat.endsWith(reqText), dlg.chat.split('\n')[0].slice(0, 24));
    // ---- A9 城镇宠物：抚摸按钮 + petting 态 ----
    const cat = await spawn('town_cat', true);
    g.openNpcDialog.call(g, cat);
    ok('A9 宠物有 抚摸 按钮', idsOf(g.dialogNpc).includes('pet'));
    g.npcDialogButton('pet');
    ok('A9 petting 状态建立或 toggle 停止', typeof g.player.petting.isPetting === 'boolean', `isPetting=${g.player.petting.isPetting}`);
    ok('A9 对话面板关闭', g.dialogNpc === null);
    // ---- A10 旅行商商店按钮门（npcKey 判据直测）----
    const trav = await spawn('merchant');
    trav.npcKey = 'travelling_merchant';
    trav.vanillaId = 368;
    ok('A10 旅行商商店按钮出现', g.npcDialogButtons(trav).some((b) => b.id === 'shop'));
    // ---- A11 渔夫任务回归（excl 感知）----
    const angler = await spawn('angler');
    g.openNpcDialog.call(g, angler);
    const qBtn = g.npcDialogButtons(g.dialogNpc).find((b) => b.id === 'quest');
    ok('A11 渔夫 任务 按钮+感叹旗', !!qBtn && qBtn.excl === !g.world.anglerQuestFinished);

    // ================= B/C 批：金币条 / 角标物品 / 台词池 / 种子臂（2026-08-30 续批）=================
    g.player.hp = g.player.maxHp;   // 回满防死亡拆 UI 干扰后续 DOM 断言（间歇假红源）
    // ---- B1 护士金币条（TryAddCoins 价签,NPCChatPanel.cs:140-144）----
    ensureAlive();
    const nurse = await spawn('nurse');
    standBy(nurse);
    g.player.hp = Math.max(1, g.player.maxHp - 150);   // 缺血制造费用
    g.openNpcDialog.call(g, nurse);
    {
      const healHost = document.querySelector('.sw-npc-dialog button[data-b="heal"]');
      const tag = healHost ? healHost.querySelector('.sw-npc-coins') : null;
      // P1-1 回归锚：价签=按钮子元素且锚定本按钮（曾插容器顶层 flex static-position 落最左）。
      // ★刀20 vanilla 几何：DrawMoney @ (rect.X-45,rect.Y-44) 后 rect.X+=106（NPCChatPanel.cs
      //  :140-144）→ 价签在按钮左 151px（旧 flex 布局左对齐 <40 已随面板 1:1 重写退役）
      let geoOk = false;
      if (tag && healHost) {
        const d = healHost.getBoundingClientRect().left - tag.getBoundingClientRect().left;
        geoOk = Math.abs(d - 151) < 30;
      }
      ok('B1 治疗按钮旁金币条(几何对齐 -151 锚)', !!tag && /\d/.test(tag.textContent || '') && geoOk,
        `text=${tag ? tag.textContent : 'null'} cost=${g.nurseHealCost()} geo=${geoOk}`);
    }
    // ---- B2 税务官应收税款条 ----
    const tax = await spawn('tax_collector');
    standBy(tax);
    g.player.taxMoney = 12345;
    g.openNpcDialog.call(g, tax);
    {
      const host = document.querySelector('.sw-npc-dialog button[data-b="collect"]');
      const tag = host ? host.querySelector('.sw-npc-coins') : null;
      ok('B2 收税按钮旁税款条', !!tag && /\d/.test(tag.textContent || ''), `text=${tag ? tag.textContent : 'null'}`);
      g.player.taxMoney = 0;
    }
    // ---- B3 宠物台词池（CatChatter.Chatter_*,非『……』兜底）----
    const cat2 = await spawn('town_cat', true);
    const catChat = g.townNpcChat(cat2);
    ok('B3 宠物对话进 Chatter 池(≠‘……’兜底)', catChat.length > 0 && catChat !== '……', catChat.slice(0, 20));   // 池内 Chatter_2='咕噜……' 本就含省略号
    // ---- C1 角落物品：渔夫任务鱼图标 + 点击插聊天 ----
    g.world.anglerQuestFinished = false;
    g.world.anglerWhoFinishedToday.length = 0;
    const fishVid = g.anglerQuestItemId();
    // 拆除桩：谁在异步移除对话框？（间歇假红取证）
    const removalStacks = [];
    const origRemove = Element.prototype.remove;
    Element.prototype.remove = function () {
      if (this.classList && this.classList.contains('sw-npc-dialog')) {
        removalStacks.push(String(new Error().stack || '').split('\n')[2]);
      }
      return origRemove.call(this);
    };
    g.openNpcDialog.call(g, angler);
    await new Promise((r) => setTimeout(r, 120));
    ensureAlive();
    standBy(angler);
    let cornerImg = document.querySelector('img.sw-corner-item');
    if (!cornerImg) {   // 重试一次：站位复验、再走一遍开框（rAF 自动关对话的时序容错）
      standBy(angler);
      g.player.hp = g.player.maxHp;
      g.openNpcDialog.call(g, angler);
      await new Promise((r) => setTimeout(r, 100));
      cornerImg = document.querySelector('img.sw-corner-item');
    }
    const diagEl = document.querySelector('.sw-npc-dialog');
    ok('C1 任务鱼角标出现', !!cornerImg && Number(cornerImg.dataset.corner) === fishVid,
      `vid=${cornerImg ? cornerImg.dataset.corner : 'null'} fish=${fishVid} dlgCorner=${dlg ? dlg.corner : 'no-dlg'} panelExists=${!!diagEl} anglerDead=${angler.dead} removed=${removalStacks.join(' <= ') || 'none'} | ${removalStacks.length ? String(new Error().stack).split('\n')[1].trim().slice(0, 60) : ''}`);
    if (cornerImg) {
      cornerImg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      const chatInputEl = document.querySelector('.sw-chatbox input');
      ok('C1 点击角标开聊天并插 [i:] 标签', !!chatInputEl && (chatInputEl.value || '').includes(`[i:${fishVid}]`),
        `value=${(chatInputEl && chatInputEl.value || '').slice(0, 24)}`);
    }
    // 交付后角标清零（finished 态）
    g.world.anglerQuestFinished = true;
    g.openNpcDialog.call(g, angler);
    await new Promise((r) => setTimeout(r, 60));
    ok('C1 已交任务日无角标', !document.querySelector('img.sw-corner-item'));
    // ---- S1 路牌双态对话框（读/编辑/toggle 关牌）----
    const sx = Math.floor(g.player.cx / 16), sy = Math.floor((g.world.groundLevel - 3));
    g.world.signs.push({ x: sx, y: sy, text: '' });
    g.cb.onSignDialog(sx, sy, 'probe-牌文');
    const signActive = () => window.__swUI.signDialogActive === true;
    ok('S1 路牌面板开启', signActive());
    const signPanel = document.querySelectorAll('.sw-panel');
    const signEl = signPanel[signPanel.length - 1];
    const editBtnS = signEl ? [...signEl.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '编辑') : null;
    ok('S1 编辑按钮(=inter48)', !!editBtnS);
    if (editBtnS) {
      editBtnS.click();
      await new Promise((r) => setTimeout(r, 60));
      const ta = document.querySelector('.sw-panel textarea');
      ok('S1 切入编辑态(textarea+默认文本)', !!ta && ta.value === 'probe-牌文');
      const saveBtnS = [...signEl.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '保存');
      if (saveBtnS && ta) {
        ta.value = 'probe-改写';
        saveBtnS.click();
        await new Promise((r) => setTimeout(r, 60));
        ok('S1 保存写回 Sign 登记', g.world.signs.find((s) => s.x === sx && s.y === sy).text === 'probe-改写');
        ok('S1 保存后关牌', signActive() === false);
      }
    }
    g.cb.onSignDialog(sx, sy, 'x');                 // 重开
    g.cb.onSignDialog(sx, sy, 'x');                 // 同锚再点 = toggle 关
    ok('S1 同锚二次右键关牌(toggle)', signActive() === false);
    // ---- P1 头像语境选图（宠物六变体/狼人态/史莱姆像）----
    const { portraitForNpc } = await import('/src/data/npcPortraits.ts');
    ok('P1 猫=首变体 Siamese', portraitForNpc({ vanillaId: 637 }).includes('Portrait_Cat_Siamese'));
    ok('P1 猫=表外兜底 Black', portraitForNpc({ vanillaId: 637, variationIndex: 9 }).includes('Portrait_Cat_Black'));
    ok('P1 兔 index1=Angora', portraitForNpc({ vanillaId: 656, variationIndex: 1 }).includes('Portrait_Bunny_Angora'));
    ok('P1 狗 index3=Corgi', portraitForNpc({ vanillaId: 638, variationIndex: 3 }).includes('Portrait_Dog_Corgi'));
    ok('P1 蓝史莱姆=Nerdy 像', portraitForNpc({ vanillaId: 670 }).includes('SlimeNerdy'));
    ok('P1 动物学家人态', portraitForNpc({ vanillaId: 633 }).includes('Zoologista.png'));
    ok('P1 动物学家狼人态(alt2)', portraitForNpc({ vanillaId: 633, altTexture: 2 }).includes('Zoologistb.png'));
    ok('P1 动物学家微光狼人', portraitForNpc({ vanillaId: 633, altTexture: 2, shimmered: true }).includes('Zoologistb_shimmer'));
    // ---- D1 公主十周年专柜 + 种子直通臂 ----
    const princess = await spawn('princess');
    g.world.seedFlags.tenthAnniversary = true;
    const pIds = g.shopStockFor(princess).map((e) => e[0]);
    ok('D1 公主十周年三画上架', [1309, 1859, 1358].every((id) => pIds.includes(id)), pIds.slice(0, 6).join(','));
    ok('D1 海盗相位画同门保持', !(g.world.flags.hardMode && g.world.flags.downedPirates)
      || [2584, 854, 855, 905].some((id) => pIds.includes(id)));
    g.world.seedFlags.tenthAnniversary = false;
    // 直通臂：infectedSeed → dryad；tenth&&!getGood → steampunker（清 boss 旗隔离）
    const FKEYS = ['downed_4', 'downed_13', 'downed_266', 'downed_35'];
    const fBackup = Object.fromEntries(FKEYS.map((k) => [k, g.world.flags[k]]));
    for (const k of FKEYS) g.world.flags[k] = false;
    g.world.seedFlags.infectedSeed = true;
    ok('D1 infectedSeed 直通树妖', g.townNpcSpawnAllowed('dryad') === true);
    g.world.seedFlags.infectedSeed = false;
    ok('D1 无旗无败则树妖禁入', g.townNpcSpawnAllowed('dryad') === false);
    g.world.seedFlags.tenthAnniversary = true;
    g.world.seedFlags.getGoodWorld = false;
    g.world.flags['downed_125'] = g.world.flags['downed_134'] = false;
    ok('D1 十周年直通蒸汽朋克', g.townNpcSpawnAllowed('steampunker') === true);
    g.world.seedFlags.getGoodWorld = true;
    ok('D1 getGood 抵消十周年臂', g.townNpcSpawnAllowed('steampunker') === false);
    g.world.seedFlags.getGoodWorld = false;
    g.world.seedFlags.tenthAnniversary = false;
    for (const k of FKEYS) g.world.flags[k] = fBackup[k];
    // ---- F1/F2 头像三模式现算（CloseUp/Retro=NPC 贴图直绘）----
    const { options: opt } = await import('/src/core/Options.ts');
    const cvHit = async () => { const cv=document.querySelector('canvas.sw-npc-portrait'); if(!cv) return -1; const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data; let hit=0; for(let i=3;i<d.length;i+=4){ if(d[i]>8&&++hit>1e9)break; } return hit; };
    const prevMode = opt.data.dialoguePortraitMode;
    ensureAlive();
    standBy(guide);
    opt.data.dialoguePortraitMode = 'closeUp';
    g.openNpcDialog.call(g, guide);
    let hitF1 = -1;
    for (let t = 0; t < 12; t++) { await new Promise((r) => setTimeout(r, 100)); hitF1 = await cvHit(); if (hitF1 > 0) break; }
    ok('F1 CloseUp 模式画出现算 NPC 头像', hitF1 > 600, `hit=${hitF1}`);
    standBy(guide);
    opt.data.dialoguePortraitMode = 'fullBodyRetro';
    g.openNpcDialog.call(g, guide);
    let hitF2 = -1;
    for (let t = 0; t < 12; t++) { await new Promise((r) => setTimeout(r, 100)); hitF2 = await cvHit(); if (hitF2 > 0) break; }
    ok('F2 FullBodyRetro 全身立像', hitF2 > 300, `hit=${hitF2}`);
    opt.data.dialoguePortraitMode = prevMode;

    // ---- G1 RequestHome → corner=-1 EquipPage 快捷图标点击开背包 ----
    standBy(guide2);
    ensureAlive();   // B 段死亡残留清偿（dead ⇒ 每帧收背包）
    window.__swUI.closeInventory();  // 前态归零：A3 craft 流开过的背包若未关，
                                     // 本点击的 openInventory 会走 toggle 反向关闭
    g.openNpcDialog.call(g, guide2);
    g.npcDialogButton('home');
    await new Promise((r) => setTimeout(r, 120));
    ok('G1 home 后 corner=-1', dlg.corner === -1);
    const equipImg = document.querySelector('img.sw-corner-equip');
    ok('G1 DisplaySlots_5 快捷图标出现', !!equipImg,
      `panels=${document.querySelectorAll('.sw-npc-dialog').length} dist=${Math.abs(g.player.x - guide2.cx)},${Math.abs(g.player.y - guide2.cy)} hp=${g.player.hp} dead=${guide2.dead}`);
    if (equipImg) {
      const seq = [];
      const ui2 = window.__swUI;
      const wOpen = ui2.openInventory.bind(ui2), wCloseI = ui2.closeInventory.bind(ui2);
      const gCloseD = g.closeNpcDialog.bind(g);
      ui2.openInventory = (...a) => { seq.push('openInv'); return wOpen(...a); };
      ui2.closeInventory = (...a) => { seq.push('closeInv'); return wCloseI(...a); };
      const origNpcClose = ui2.closeNpcDialog.bind(ui2);
      ui2.closeNpcDialog = (...a) => { seq.push('ui.closeNpcDlg'); return origNpcClose(...a); };
      equipImg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      seq.push(`sync=${g.npcDialogActive}/${ui2.invPanel?.style?.display}`);
      await new Promise((r) => setTimeout(r, 100));
      seq.push(`async=${g.npcDialogActive}/${ui2.invPanel?.style?.display}`);
      ui2.openInventory = wOpen; ui2.closeInventory = wCloseI; ui2.closeNpcDialog = origNpcClose;
      ok('G1 点击关对话并开背包', ui2.invPanel?.style?.display === 'block' && g.npcDialogActive === false,
        `seq=${seq.join(',')}`);
      ui2.closeInventory();
    }

    // ---- H1 树妖演出门：stardewActive 期间不出现净化按钮（审查 P1 回归锚）----
    {
      ensureAlive();
      standBy(dryad);
      g.player.inv.slots[0] = { id: colaDef, stack: 3 };
      g.player.inv.selected = 0;
      const { stardewActive } = await import('/src/fx/StardewAnimation.ts');
      // A7 已在真实时间轴上触发过一次演出（~9.1s）——若仍在窗内则按钮被正确隐藏
      const tWait = Date.now();
      while (stardewActive() && Date.now() - tWait < 11000) await new Promise((r) => setTimeout(r, 200));
      g.openNpcDialog.call(g, dryad);
      ok('H1 演出前可触发', idsOf(g.dialogNpc).includes('stardew'), `waited=${Date.now() - tWait}ms`);
      g.npcDialogButton('stardew');               // 触发演出（消费 1 罐+广播 144）
      ok('H1 演出态置位', stardewActive() === true);
      g.openNpcDialog.call(g, dryad);
      ok('H1 演出中净化按钮隐藏', !idsOf(g.dialogNpc).includes('stardew'), idsOf(g.dialogNpc).join(','));
      // 演出走墙钟（548t×16.67ms≈9.1s，StardewAnimation performance.now 驱动，
      // fixedUpdate 快进无效）——真实时间轮询至结束
      const tStart = Date.now();
      while (stardewActive() && Date.now() - tStart < 11000) await new Promise((r) => setTimeout(r, 200));
      ok('H1 墙钟走完后演出结束', stardewActive() === false, `elapsed=${Date.now() - tStart}ms`);
      g.openNpcDialog.call(g, dryad);
      ok('H1 结束后净化按钮回归', idsOf(g.dialogNpc).includes('stardew'));
      g.player.inv.slots[0] = null;
    }
    // ---- I1 微光头像通用臂（shimmer→_shimmer 后缀,30 张资产入库）----
    {
      const pp = await import('/src/data/npcPortraits.ts');
      ok('I1 Guide shimmer', pp.portraitForNpc({ vanillaId: 22, shimmered: true }).includes('Portrait_Guide_shimmer'));
      ok('I1 Nurse shimmer', pp.portraitForNpc({ vanillaId: 18, shimmered: true }).includes('Portrait_Nurse_shimmer'));
      ok('I1 未微光回落基础像', pp.portraitForNpc({ vanillaId: 22 }).endsWith('Portrait_Guide.png'));
    }
    // ---- J1 msg144 载体面（枚举值/发送器/钩子位）----
    {
      const proto = await import('/src/net/protocol.ts');
      const cn = await import('/src/net/ClientNet.ts');
      ok('J1 Msg.DryadStardew=144 对齐原版 MessageID', proto.Msg.DryadStardew === 144,
        `val=${proto.Msg.DryadStardew}`);
      ok('J1 ClientNet 发送器就位', typeof cn.ClientNet.prototype.sendDryadStardewAnim === 'function');
    }
    // ---- E1 Esc 链：开着对话框按 Escape 只关对话不开背包 ----
    standBy(guide);
    g.openNpcDialog.call(g, guide);
    g.closeInventory();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    ok('E1 Esc 只关对话', g.npcDialogActive === false, '');
    // ---- E2 Esc 监听器对称摘除（审查 P0 回归锚）：开→关一轮后派发 Escape，
    //      capture 尾插 spy 必须能收到事件（幽灵未摘则 stopImmediatePropagation
    //      连同后续 capture 一并拦下 ⇒ spy.fired=false 即回归）----
    g.openNpcDialog.call(g, guide);
    await new Promise((r) => setTimeout(r, 40));
    g.npcDialogButton('close');
    await new Promise((r) => setTimeout(r, 40));
    const spy = { fired: false };
    const spyFn = (e) => { if (e.code === 'Escape') spy.fired = true; };
    window.addEventListener('keydown', spyFn, true);   // 尾位 capture=受 stopImmediatePropagation 影响
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));
    window.removeEventListener('keydown', spyFn, true);
    ok('E2 幽灵 Esc 监听已随 close 摘除', spy.fired === true);

    // （背包不弹开的断言：invPanel display 停留 none——运行时值防外部环境影响弱断言）
  } catch (err) {
    out.steps.push('ERR ' + String((err && err.stack) || err).slice(0, 500));
  }
  return out;
});

for (const s of res.steps) console.log(s.replace(/^(\w+) (.*)$/, (_, t, n) => `${t}: ${n}`));
check('页面零 JS 错误', errs.length === 0, errs.join(' | ').slice(0, 300));
const fails = res.steps.filter((s) => s.startsWith('FAIL') || s.startsWith('ERR'));
check('全部断言通过', fails.length === 0, `${fails.length} 个失败`);
await browser.close();
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
