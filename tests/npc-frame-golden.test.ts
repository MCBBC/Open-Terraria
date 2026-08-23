// NPC 帧数金标硬闸门（2026-08-13）：json × Main.npcFrameCount[697] × 贴图 三方对账，
// 运行时直读反编译源码——零快照零腐烂，数据漂移必炸。
// 背景：668 鹿角怪曾误填 25、129/130 填 1、13 条整缺失（589 困境高尔夫球手被
// spawner spawnBound 静默丢弃从未出现）——全部由本闸门三类检查覆盖。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VANILLA_NPCS } from '../src/data/vanillaNpcs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // game/ 的上一级=仓库根
const MAIN_CS = `${ROOT}/Terarria1457/Terraria/Main.cs`;   // 树基准 1457（npcFrameCount 1456/1457 零差异,recon-npc CLASS B 钉死）

/** 流式提取 Main.npcFrameCount[697]（Main.cs:65994 起的初始化数组：
 *  去 // 注释后从 '{' 收集到 '};'——已与 697 项全长核对） */
function vanillaFrameCounts(): number[] {
  const lines = readFileSync(MAIN_CS, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.includes('npcFrameCount = new int['));
  expect(start, 'Main.cs 中未找到 npcFrameCount 数组（反编译树路径变？）').toBeGreaterThan(0);
  const buf: string[] = [];
  for (let i = start; i < Math.min(lines.length, start + 400); i++) {
    buf.push(lines[i]);
    if (lines[i].includes('};')) break;
  }
  const blob = buf.join('\n');
  const body = blob.slice(blob.indexOf('{') + 1, blob.indexOf('};'));
  const nums = body.replace(/\/\/.*/g, '').match(/\d+/g);
  const vals = (nums ?? []).map(Number);
  expect(vals.length, '数组长度应 697').toBe(697);
  return vals;
}

describe('NPC 帧数金标硬闸门', () => {
  const vanilla = vanillaFrameCounts();

  it('第1层·帧数全量对账：每条 json frames === Main.npcFrameCount[id]', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(VANILLA_NPCS)) {
      const id = Number(k);
      if (id >= vanilla.length) { bad.push(`${id}:${v.frames}(超界)`); continue; }
      if (v.frames !== vanilla[id]) bad.push(`${id} json=${v.frames} vanilla=${vanilla[id]}`);
    }
    expect(bad.join(', '), '帧数漂移清单（以 Main.npcFrameCount 为权威）').toBe('');
  });

  it('第2层·完整性：数组中 frames>1 的 id 必须在 json 有条目', () => {
    // 白名单：仅在 json 缺席且 frames>1 时逐条写明理由（当前应无）
    const ALLOWED_MISSING = new Set<number>([]);
    const missing: number[] = [];
    const jsonIds = new Set(Object.keys(VANILLA_NPCS).map(Number));
    for (let id = 0; id < vanilla.length; id++) {
      if (vanilla[id] > 1 && !jsonIds.has(id) && !ALLOWED_MISSING.has(id)) missing.push(id);
    }
    expect(missing.join(', '), 'json 缺失条目（spawner 引用即静默丢弃）').toBe('');
  });

  it('第3层·消费端覆盖：spawner/Game 里被引用的 id 必须在 json 有条目', () => {
    const targets = [
      'src/world/spawn/VanillaSpawner.ts',
      'src/core/Game.ts',
    ].map((p) => `${ROOT}/game/${p}`);
    const ids = new Set<number>();
    for (const f of targets) {
      const src = readFileSync(f, 'utf8').split('\n');
      for (const raw of src) {
        // 行内注释剥离后匹配（勿整行跳过——D(696); // xxx 这类会被注释行规则漏放,
        // 自证③的教训）;只认 字母函数名(数字 紧跟 , 或 ) 的字面量调用
        const line = raw.replace(/\/\/.*/g, '');
        for (const m of line.matchAll(/\b(?:spawnBound|spawnPart|fromVanilla|D)\(\s*(\d+)\s*[,)]/g)) {
          ids.add(Number(m[1]));
        }
      }
    }
    const missing: number[] = [];
    for (const id of ids) {
      if (id > 696) continue;               // 超出 npcFrameCount 界=源码误匹配,不判
      if (!VANILLA_NPCS[String(id)]) missing.push(id);
    }
    expect(missing.join(', '), '被代码消费但 json 缺条目的 id（fromVanilla null 静默丢弃）').toBe('');
  });

  it('附·贴图自洽：多帧条的帧高 = 高/frames ∈ [8,300] 合理带', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(VANILLA_NPCS)) {
      if (v.frames <= 1) continue;         // 单帧贴图（荷兰人590px 等）尺寸不设限
      const f = `${ROOT}/game/public/sprites/vanilla/NPC_${k}.png`;
      if (!existsSync(f)) continue;
      const ihdr = readFileSync(f).subarray(16, 24); // IHDR：宽 @16..20、高 @20..24（大端）
      const h = (ihdr[4] << 24 | ihdr[5] << 16 | ihdr[6] << 8 | ihdr[7]) >>> 0;
      const fh = h / v.frames;
      if (!(fh >= 8 && fh <= 300)) bad.push(`${k} ${v.name} h=${h} frames=${v.frames} fh=${fh.toFixed(1)}`);
    }
    expect(bad.join('; '), '帧高越合理带[8,300]（贴图损坏/帧数错配）').toBe('');
  });
});
