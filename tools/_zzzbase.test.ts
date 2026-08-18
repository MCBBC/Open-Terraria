// ZZZ 批基线测量：golden 104/105 的苔藓 184 计数（扫的写侧证据）+ 668 格。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';

const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;

function load(idx: number, name: string) {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${name}`;
  return {
    t: new Uint16Array(readFileSync(`${pre}.typ`).buffer.slice(0)),
    a: new Uint8Array(readFileSync(`${pre}.act`).buffer.slice(0)),
  };
}

it('golden moss/668 baseline', () => {
  for (const [idx, name] of [[104, 'Remove_Broken_Traps'], [105, 'Final_Cleanup']] as const) {
    const { t, a } = load(idx, name);
    let moss = 0, dirtiest = 0;
    const mossDead: number[] = [];
    for (let i = 0; i < N; i++) {
      if (a[i]) {
        if (t[i] === 184) moss++;
        if (t[i] === 668) dirtiest++;
      }
    }
    console.log(`golden ${idx} ${name}: moss184=${moss} dirtiest668=${dirtiest}`);
  }
  // 104 → 105 苔藓逐格差（写侧：哪些 184 被扫杀/保留）
  const c104 = load(104, 'Remove_Broken_Traps');
  const c105 = load(105, 'Final_Cleanup');
  let killed = 0, added = 0;
  const kSamples: string[] = [];
  for (let i = 0; i < N; i++) {
    const v0 = c104.a[i] && c104.t[i] === 184 ? 1 : 0;
    const v1 = c105.a[i] && c105.t[i] === 184 ? 1 : 0;
    if (v0 && !v1) { killed++; if (kSamples.length < 8) kSamples.push(`kill(${i % W},${(i / W) | 0})`); }
    if (!v0 && v1) { added++; if (kSamples.length < 8) kSamples.push(`add(${i % W},${(i / W) | 0})`); }
  }
  console.log(`104→105 moss delta: killed=${killed} added=${added} ${kSamples.join(' ')}`);
  // 668 位置
  const pos: string[] = [];
  for (let i = 0; i < N; i++) if (c105.a[i] && c105.t[i] === 668) pos.push(`(${i % W},${(i / W) | 0})`);
  console.log(`golden105 668 cells: ${pos.join(' ')}`);
  // 104 里这些位置的类型
  for (const p of pos) {
    const [x, y] = p.slice(1, -1).split(',').map(Number);
    const i = y * W + x;
    console.log(`  ${p}: 104 typ=${c104.t[i]} act=${c104.a[i]}`);
  }
});
