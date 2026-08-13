// 读取 debug-report 的石块装饰物数据
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('/Users/vinlic/Downloads/debug-report-不灭的弓太空-2026-08-13T16-30-03-481Z.json', 'utf8'));
console.log('warnings:', (j.warnings || []).length);
for (const w of (j.warnings || []).slice(0, 6)) console.log('WARN:', w.msg?.slice(0, 120));
console.log('seed:', j.world.seed, 'name:', j.world.name);
const area = j.tiles.areaCamera;
console.log('camera:', area.x0, area.y0, '→', area.x0 + area.w, area.y0 + area.h);
const decode = (r) => r.split(';').flatMap(seg => { const [v, n] = seg.split('*'); return Array(+(n || 1)).fill(v); });
const grid = [];
for (let row of area.rows) grid.push(decode(row));
const types = {};
for (let dy = 0; dy < grid.length; dy++) {
  for (let dx = 0; dx < grid[dy].length; dx++) {
    const [type, fx, fy, wall, liquid] = grid[dy][dx].split(':');
    if (type === '-1' || type === '0') continue;
    types[type] = types[type] || { count: 0, cells: [] };
    types[type].count++;
    if (types[type].cells.length < 20) types[type].cells.push({ x: area.x0 + dx, y: area.y0 + dy, fx, fy });
  }
}
const sorted = Object.entries(types).sort((a, b) => b[1].count - a[1].count);
for (const [t, info] of sorted.slice(0, 15)) {
  console.log(`type ${t} ×${info.count}  cells:`, info.cells.slice(0, 4).map(c => `(${c.x},${c.y})f${c.fx},${c.fy}`).join(' '));
}
