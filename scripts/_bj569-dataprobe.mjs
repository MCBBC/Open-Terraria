// ★BJ569 数据面二分探针:vite 模块直读 ITEM_DEFS/wireTool/combatWeapon/projectileData
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const log = (...a) => console.log('[bj569d]', ...a);

async function main() {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    const face = await page.evaluate(async () => {
      const g = window.__swGame;
      const items = await import('/src/data/items.ts');
      const vc = await import('/src/data/vanillaItemCombat.ts');
      const vp = await import('/src/data/vanillaProjectiles.ts');
      const tci = await import('/src/player/ToolCursorIcon.ts');
      const key3611 = items.VANILLA_ITEM_KEY_BY_ID[3611];
      const idx3611 = key3611 ? items.ITEM_BY_KEY[key3611] : undefined;
      const def3611 = idx3611 !== undefined ? items.ITEM_DEFS[idx3611] : undefined;
      const held = g.player.inv.heldItem();
      const heldDef = held ? items.ITEM_DEFS[held.id] : undefined;
      // 3625 对照
      const key3625 = items.VANILLA_ITEM_KEY_BY_ID[3625];
      const idx3625 = key3625 ? items.ITEM_BY_KEY[key3625] : undefined;
      const def3625 = idx3625 !== undefined ? items.ITEM_DEFS[idx3625] : undefined;
      return {
        key3611, idx3611,
        def3611: def3611 ? { key: def3611.key, vid: def3611.vid, wireTool: def3611.wireTool, tool: !!def3611.tool, tile: def3611.tile } : null,
        heldDef: heldDef ? { key: heldDef.key, vid: heldDef.vid, wireTool: heldDef.wireTool, sameAs3611: heldDef === def3611, heldId: held.id } : null,
        key3625, idx3625,
        def3625: def3625 ? { key: def3625.key, vid: def3625.vid, wireTool: def3625.wireTool } : null,
        combat3611: vc.itemCombat(3611),
        combatWeapon3611: vc.combatWeapon(def3611 ?? { key: 'vi_3611_WireKite', vid: 3611 }),
        combatWeaponHeld: heldDef ? vc.combatWeapon(heldDef) : null,
        proj651: vp.projectileData(651),
        boost3611: tci.tileBoostOfVid(3611),
        boost3625: tci.tileBoostOfVid(3625),
        wireToolVidsHas3611: tci.WIRE_TOOL_VIDS.has(3611),
      };
    });
    log(JSON.stringify(face, null, 2));

    // 行为面:直接调私有 useWireTool(带假 tx,ty)看走哪个门
    const beh = await page.evaluate(() => {
      const g = window.__swGame;
      const st = g.world.store;
      const tx = Math.floor(g.player.cx / 16) + 3, ty = Math.floor(g.player.cy / 16) - 1;
      const before = st.wire[st.idx(tx, ty)];
      let gate = { reached: false };
      try {
        // 猴测:临时包装 useWireTool 观察进入
        const proto = Object.getPrototypeOf(g);
        const orig = g.useWireTool.bind(g);
        g.useWireTool = (tx2, ty2, def) => {
          gate.reached = true;
          gate.defKey = def?.key; gate.wireTool = def?.wireTool;
          return orig(tx2, ty2, def);
        };
        // 直接走公开使用入口? updateUse 是逐帧的——直接喂输入跑一拍更真实:
        g.input.mouseX = (tx * 16 - g.camera.x) | 0;
        g.input.mouseY = (ty * 16 - g.camera.y) | 0;
        g.input.mouseDown = true; g.input.mouseHeld = true; g.input.rightDown = false;
      } catch (e) { gate.err = String(e); }
      return { tx, ty, before, gate };
    });
    await pump(page, 4);
    const beh2 = await page.evaluate(() => {
      const g = window.__swGame;
      g.input.mouseDown = false; g.input.mouseHeld = false;
      const st = g.world.store;
      const tx = Math.floor(g.player.cx / 16) + 3, ty = Math.floor(g.player.cy / 16) - 1;
      return { anchor: g.grandAnchor, wire: st.wire[st.idx(tx, ty)], useTime: g.player.useTime };
    });
    log('beh', JSON.stringify(beh));
    log('beh2', JSON.stringify(beh2));
  } finally {
    await closeAllBrowsers();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
