// ★BJ641 一次性物证提炼（用户世界档 十周年纪念种子(2).wld）：
// 定位提炼机 tile 219 / 箱锚+箱内原版 item id / 红线格 / 计时器 144 档与开关态。
// 玩家坐标（debug-report）：tile(3910,285)，扫描窗 ±60。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readLocalFixture, localFixtureMissing } from '../tests/fixturePath';
import { parseWld } from '../src/wld/WldParser';

const WLD = 'bj641-anniversary-seed.wld';   // ★C档收编+脱敏:原微信收件档(与 Downloads 副本 md5 全等)→ tests/fixtures/local

it.skipIf(localFixtureMissing(WLD))('BJ641 wld evidence', () => {
  const buf = readLocalFixture(WLD);
  const wldRaw = parseWld(new Uint8Array(buf));
  const wld = wldRaw.tiles as unknown as { active: Uint8Array; type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array; wall: Uint16Array; wire: Uint8Array };
  const wldMeta = wldRaw;
  console.log('version=', wldMeta.version, 'title=', wldMeta.title, 'size=', wldMeta.tilesWide, 'x', wldMeta.tilesHigh, 'hardMode=', wldMeta.hardMode);

  const CX = 3910, CY = 285, R = 40;
  // 1) 全图扫提炼机 tile 219 / 642
  const extr: Array<[number, number]> = [];
  const timers: Array<[number, number, number, number]> = [];
  for (let y = 0; y < wldMeta.tilesHigh; y++) {
    for (let x = 0; x < wldMeta.tilesWide; x++) {
      const i = y * wldMeta.tilesWide + x;
      if (!wld.active[i]) continue;
      if (wld.type[i] === 219 || wld.type[i] === 642) extr.push([x, y]);
      if (wld.type[i] === 144) timers.push([x, y, wld.frameX[i], wld.frameY[i]]);
    }
  }
  console.log('extractinator tiles:', JSON.stringify(extr));
  console.log('timer tiles (x,y,frameX,frameY):', JSON.stringify(timers));

  // 2) 箱子段全量（原版 id）
  console.log('--- chests near player (|dx|<=30,|dy|<=30) ---');
  for (const c of wldMeta.chests) {
    if (Math.abs(c.x - CX) <= 30 && Math.abs(c.y - CY) <= 30) {
      const items = c.items.map((it, k) => it ? `${k}:vid${it.id}x${it.stack}` : null).filter(Boolean);
      console.log(`chest @(${c.x},${c.y}) locked? name="${c.name}" items=`, items.join(' | ') || '(空)');
    }
  }
  console.log('total chests:', wldMeta.chests.length, 'all chest coords:',
    wldMeta.chests.map((c) => `(${c.x},${c.y})`).join(','));

  // 3) ASCII 地图 3910±16 × 285±14：.=空 #219=提炼机 T=计时器 C=箱锚格 w=红线 o=其他实体块
  const chestAt = new Set(wldMeta.chests.map((c) => `${c.x},${c.y}`));
  console.log('--- ASCII map (x=3894..3926, y=271..299) 行=y ---');
  let head = '     ';
  for (let x = 3894; x <= 3926; x++) head += x % 10 === 0 ? '|' : (x % 5 === 0 ? '+' : '.');
  console.log(head);
  for (let y = 271; y <= 299; y++) {
    let row = `${y}: `;
    for (let x = 3894; x <= 3926; x++) {
      const i = y * wldMeta.tilesWide + x;
      let ch = ' ';
      if (!wld.active[i]) ch = wld.wall[i] ? '_' : '.';
      else if (wld.type[i] === 219 || wld.type[i] === 642) ch = 'E';
      else if (wld.type[i] === 144) ch = 'T';
      else if (chestAt.has(`${x},${y}`)) ch = 'C';
      else if (wld.type[i] === 21) ch = 'c'; // 箱 tile（段外锚兜底）
      else ch = '#';
      if (wld.wire[i] & 1) ch = ch === ' ' ? 'w' : ch.toLowerCase() === ch ? 'W' : ch; // 红线覆盖标记（非字母块→W）
      if (ch === '#' && (wld.wire[i] & 1)) ch = 'W';
      row += ch;
    }
    console.log(row);
  }
  console.log('图例: E=提炼机 T=计时器 C=箱段锚 c=箱tile W=实体格+红线 w=空气红线 #=块 .=空 _=仅墙');

  // 4) 玩家周边 8 格线态逐格
  console.log('--- wire bits (3910±16, 285±14) nonzero ---');
  const bits: string[] = [];
  for (let y = 285 - 14; y <= 285 + 14; y++) {
    for (let x = 3910 - 16; x <= 3910 + 16; x++) {
      const i = y * wldMeta.tilesWide + x;
      if (wld.wire[i]) bits.push(`(${x},${y})=0b${wld.wire[i].toString(2)}`);
    }
  }
  console.log(bits.join(' ') || '(无)');
});
