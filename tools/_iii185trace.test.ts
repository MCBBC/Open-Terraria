// IIII185: room r=5 填充时点追踪（dungeonL/Climb/E/PD/Pi/S 各 snap 点转储房间盒 act/type 简账）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I185TR === '1';
const W = 4200, H = 1200;
const BOX = { x0: 3760, x1: 3890, y0: 840, y1: 970 };

(RUN ? it : it.skip)('i185 room fill trace', { timeout: 900_000 }, async () => {
  const snaps: Record<string, string> = {};
  (globalThis as { __dgSegWatch?: (name: string, s: unknown) => void }).__dgSegWatch = (name, s2) => {
    if (!['dungeonL', 'dungeonClimb', 'dungeonE', 'dungeonPD', 'dungeonPi', 'dungeonS',
          'dualEntranceRoom', 'dualStartRooms', 'dualLayout', 'dualHalls', 'dualRoomsGen', 'dualPreHall', 'dualHallsGen'].includes(name)) return;
    if (snaps[name]) return;
    const st = s2 as { type: Uint16Array; flags: Uint8Array };
    // 每行: act 比例 + type 众数（internal）
    const lines: string[] = [];
    for (let y = BOX.y0; y <= BOX.y1; y += 4) {
      let inact = 0, tot = 0; const types = new Map<number, number>();
      for (let x = BOX.x0; x <= BOX.x1; x++) {
        const i = y * W + x;
        tot++;
        if (!(st.flags[i] & 1)) inact++;
        types.set(st.type[i], (types.get(st.type[i]) ?? 0) + 1);
      }
      const top = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t, c]) => `${t}:${c}`).join(',');
      lines.push(`y=${y} inact=${inact}/${tot} ${top}`);
    }
    snaps[name] = lines.join('\n');
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    delete (globalThis as { __dgSegWatch?: unknown }).__dgSegWatch;
  }
  writeFileSync('/tmp/iii185-out/roomtrace.txt', Object.entries(snaps).map(([k, v]) => `===== ${k} =====\n${v}`).join('\n'));
  console.log('[i185tr] snaps=' + Object.keys(snaps).join(','));
}, 900_000);
