// ★BJ647 一次性物证提炼（用户世界档 十周年纪念种子(2).wld）：
// 定位巫医/海盗 home 与瞬移区域（behavior-log: 巫医 x∈[62858,62868] y=4476；
// 海盗 x∈[62938,62954] y=4476；玩家 tile(3920,273)），画 ASCII 图找椅/床格。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readLocalFixture, localFixtureMissing } from '../tests/fixturePath';
import { parseWld } from '../src/wld/WldParser';

const WLD = 'bj641-anniversary-seed.wld';   // ★C档收编:原 ~/Downloads/十周年纪念种子(2).wld(与微信收件副本 md5 全等)

it.skipIf(localFixtureMissing(WLD))('BJ647 wld evidence', () => {
  const buf = readLocalFixture(WLD);
  const wldRaw = parseWld(new Uint8Array(buf));
  const wld = wldRaw.tiles as unknown as { active: Uint8Array; type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array; wall: Uint16Array };
  const meta = wldRaw;
  console.log('version=', meta.version, 'title=', meta.title, 'size=', meta.tilesWide, 'x', meta.tilesHigh);

  console.log('--- npcs ---');
  for (const n of meta.npcs) {
    console.log(`npc "${n.name}" sprite=${n.spriteId} pos=(${(n.x / 16).toFixed(1)},${(n.y / 16).toFixed(1)}) home=(${n.homeX},${n.homeY}) homeless=${n.homeless}`);
  }

  // 巫医采样盒中心 x≈62868→tile 3929；海盗 x≈62954→tile 3934；y=4476→tile 279
  const X0 = 3912, X1 = 3958, Y0 = 262, Y1 = 288;
  console.log(`--- ASCII map x=${X0}..${X1} y=${Y0}..${Y1} (椅10/床77/门10?/工作台/桌) ---`);
  let head = '     ';
  for (let x = X0; x <= X1; x++) head += x % 10 === 0 ? '|' : (x % 5 === 0 ? '+' : '.');
  console.log(head);
  for (let y = Y0; y <= Y1; y++) {
    let row = `${y}: `;
    for (let x = X0; x <= X1; x++) {
      const i = y * meta.tilesWide + x;
      let ch = ' ';
      if (!wld.active[i]) ch = wld.wall[i] ? '_' : '.';
      else {
        const t = wld.type[i];
        ch = '#';
        if (t === 10 || t === 11) ch = 'D';           // 门
        if (t === 15) ch = 's';                        // 椅类之一
        if (t === 18) ch = 't';                        // 桌
        if (t === 19) ch = 'p';                        // 工作台
        if (t === 79) ch = 'C';                        // 椅
        if (t === 77) ch = 'B';                        // 床
        if (t === 87) ch = 'T';                        // 衣柜? 87=椅子之一? 87=toilet? 87=chandelier
        if (t === 88) ch = 'W';                        // 手表? 88=bench
        if (t === 4) ch = 'Z';                         // 火把? 4=多帧
        if (t === 5) ch = 'T';                         // 树
        if (t === 128) ch = 'M';                       // 唱片机
        if (t === 129 || t === 132) ch = 'c';          // 钟表类
        if (t === 21) ch = 'x';                        // 箱
        if (t === 33 || t === 334) ch = 'l';           // 灯笼/烛台
        if (t === 34) ch = 'v';                        // 吊灯
        if (t === 172 || t === 186 || t === 187) ch = 'f'; // 家具
        if (t === 177 || t === 178 || t === 179 || t === 180 || t === 181 || t === 182) ch = 'f';
      }
      if (wld.active[i] && (wld.type[i] === 79 || wld.type[i] === 15 || wld.type[i] === 207)) ch = 'S'; // 强调可坐
      row += ch;
    }
    console.log(row);
  }

  // 可坐格全扫（本地窗）：tile 79 椅 / 15 表面? 原版椅子 tile=79( Chairs ), 沙发=206? 凳=?
  console.log('--- sit-candidates tile79/15/206/207 near witchdoctor/pirate ---');
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const i = y * meta.tilesWide + x;
      if (!wld.active[i]) continue;
      const t = wld.type[i];
      if (t === 79 || t === 15 || t === 206 || t === 207 || t === 87 || t === 186) {
        console.log(`tile ${t} @(${x},${y}) frameX=${wld.frameX[i]} frameY=${wld.frameY[i]}`);
      }
    }
  }
});
