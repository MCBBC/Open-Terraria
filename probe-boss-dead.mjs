// 全 Boss 玩家死亡处置验证（对照 NPC.cs 各 AI 块）：
// EoC4=上飞+despawn / KS50=传送离场 / EoW13=缓消300 / BoC266=钻地逃离 /
// 双子125=上飞 / Prime127=下落 / 毁灭者134=下钻 / 世花262=反向逃跑 / 猪鲨370=急升 /
// 邪教徒439=瞬消 / 光皇636=渐隐 / 皇后657=despawn / 蜂后222=离场(已修)
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const res = {};
  const cases = [
    { id: 4, name: 'EoC', want: 'up' },      // vy 变负
    { id: 50, name: 'KS', want: 'tp' },      // 传送离场（位置跳到世界右下或消散）
    { id: 13, name: 'EoW', want: 'slow' },   // 缓慢消散 encourage(300)：离屏 5s 消
    { id: 266, name: 'BoC', want: 'down' },  // vy 累积变正
    { id: 125, name: 'Twin', want: 'up' },
    { id: 127, name: 'Prime', want: 'down' },
    { id: 134, name: 'Destroyer', want: 'down' },
    { id: 262, name: 'Plantera', want: 'alive' }, // 反向逃跑：短时间内仍存活
    { id: 370, name: 'Duke', want: 'up' },
    { id: 439, name: 'Cultist', want: 'gone' },
    { id: 636, name: 'Empress', want: 'fade' },  // ai0=13 渐隐
    { id: 657, name: 'QSlime', want: 'encouraged' },
  ];
  for (const c of cases) {
    const e = Enemy.fromVanilla(c.id, g.player.cx + 150, g.player.cy - 100);
    if (!e) { res[c.name] = 'spawn-fail'; continue; }
    e.id = g.entities.nextId++;
    g.entities.add(e, 'enemies');
    if (c.id === 127) { e.ai0 = 1; e.ai1 = 0; } // Prime 战斗参数
    const vx0 = e.vx, y0 = e.y, ai0_0 = e.ai0;
    // 玩家死亡
    g.player.hp = 0; g.player.dead = true;
    await sleep(1500); // ~90 tick（BoC 计数/传送等需 >60t；<180t 重生线）
    const r = { vy: +e.vy.toFixed(2), gone: e.dead, y: Math.round(e.y - y0), ai0: e.ai0, desp: e.despawnEncouraged, despT: e.despawnTimer };
    g.player.dead = false; g.player.hp = g.player.maxHp;
    await sleep(50);
    e.dead = true;
    res[c.name + '_raw'] = r;
    switch (c.want) {
      case 'up': res[c.name] = r.vy < 0 && r.desp; break;
      case 'down': res[c.name] = r.vy > 0 || r.y > 0; break;
      case 'tp': res[c.name] = r.gone || Math.abs(e.x - (g.player.cx + 150)) > 500; break;
      case 'slow': res[c.name] = r.desp && !r.gone; break; // encourage(300) 未到期
      case 'gone': res[c.name] = r.gone; break;
      case 'fade': res[c.name] = e.ai0 === 13 || r.gone; break;
      case 'alive': res[c.name] = !r.gone; break;
      case 'encouraged': res[c.name] = r.desp; break;
      default: res[c.name] = r;
    }
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
