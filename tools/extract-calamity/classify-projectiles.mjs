#!/usr/bin/env node
// 弹幕 AI 形态分类器(弹幕 profile 分型战役首刀,2026-10-08):
// 扫 CalamityModPublic HEAD 的 Projectiles/**/*.cs → 解析 AI() 体特征 →
// 分型标注(homing/gravity/orbit/boomerang/stationary/timeLeft/…) →
// 输出分类报告 + 声明面 profile 回填(--write)。
// 用法: node tools/extract-calamity/classify-projectiles.mjs [--write]
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = process.env.CALAMITY_SRC ?? '/Users/vinlic/Project/GLM/SandboxWorld/CalamityModPublic';
const CONTENT = join(process.cwd(), 'mods/calamity/content/projectiles');
const OUT = '/tmp/proj-classify.json';
const WRITE = process.argv.includes('--write');

const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** AI() 体提取(花括号配平;无 AI()=null) */
function extractAI(src) {
  const m = /public override void AI\(\)/.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index);
  let depth = 0, start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

/** 形态分类(AI 体+类字段) */
function classify(src, aiBody) {
  const feats = [];
  const fields = src.slice(0, src.indexOf('SetDefaults') > 0 ? src.indexOf('SetDefaults') : 2000);
  if (!aiBody) return { profile: null, feats: ['no-AI'] };
  // homing: 向目标加速/方向修正(多形)
  if (/\w+\.(velocity|vel)\.(X|Y) \+= .*(target|Target|player|Player)\.Center/.test(aiBody)
    || /(player|target)\.Center - \w+\.Center/.test(aiBody) && /\.velocity/.test(aiBody)
    || /MoveTowards|HomeIn|homing/i.test(aiBody)) feats.push('homing');
  // gravity
  if (/\.velocity\.Y \+= 0?\.\d+f/.test(aiBody) || /gravity\s*=\s*0?\.\d+f/.test(fields)) feats.push('gravity');
  // orbit/环绕
  if (/Math\.Cos\(\s*\w*(angle|Angle|rot|ai\[1\])/.test(aiBody) && /Math\.Sin\(\s*\w*(angle|Angle|rot|ai\[1\])/.test(aiBody)
    && /Center/.test(aiBody)) feats.push('orbit');
  // boomerang/返程
  if (/boomerang|Boomerang/.test(src)) feats.push('boomerang');
  // 静止/悬停
  if (/velocity\s*=\s*Vector2\.Zero|velocity\s*\*= ?0f/.test(aiBody)) feats.push('stationary');
  // 计时引爆
  if (/timeLeft\s*=/.test(aiBody)) feats.push('timeLeft-set');
  // 分裂/生成弹
  if (/NewProjectile/.test(aiBody)) feats.push('spawns');
  // 传送/闪现
  if (/Teleport|position (X|\+=) =.*Main\.rand/i.test(aiBody)) feats.push('teleport');
  return { profile: feats.length > 0 ? feats[0] : 'straight', feats };
}

const rows = [];
let files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.cs')) files.push(p);
  }
};
walk(join(SRC, 'Projectiles'));

for (const p of files) {
  const src = readFileSync(p, 'utf8');
  const cls = /class (\w+)/.exec(src)?.[1] ?? basename(p, '.cs');
  const aiBody = extractAI(src);
  const r = classify(src, aiBody);
  r.aiBody = aiBody;
  const lines = src.split('\n').length;
  rows.push({ cls, key: snake(cls), file: p.slice(SRC.length + 1), lines, aiLines: aiBody ? aiBody.split('\n').length : 0, ...r });
}

// 回填面:与我们的声明键对齐
const matched = [];
let numGravity = 0, numLifetime = 0, numHoming = 0;
for (const r of rows) {
  const jp = join(CONTENT, `${r.key}.json`);
  if (!existsSync(jp)) continue;
  const d = JSON.parse(readFileSync(jp, 'utf8'));
  const spec = Array.isArray(d) ? d[0] : d;
  matched.push({ key: r.key, aiLines: r.aiLines, profile: r.profile, feats: r.feats });
  if (WRITE && r.profile && r.profile !== 'straight' && !spec.profile) {
    spec.profile = r.profile;
  }
  // ★数值层(三百二十九刀):忠实字面提取(gravity/lifetime 与引擎同量纲直通;
  //   types.ts ModProjContent 已有字段,register.ts :159 透传=即刻消费)
  if (WRITE) {
    if (r.feats.includes('gravity') && spec.gravity === undefined && r.aiBody) {
      const gm = /\.velocity\.Y \+= (0?\.\d+)f/.exec(r.aiBody);
      if (gm) { spec.gravity = parseFloat(gm[1]); numGravity++; }
    }
    if (r.feats.includes('timeLeft-set') && spec.lifetime === undefined && r.aiBody) {
      const tm = /timeLeft = (\d+)/.exec(r.aiBody);
      if (tm) { spec.lifetime = parseInt(tm[1]); numLifetime++; }
    }
    // ★三百三十刀:homing 数值层——helper HomeInOnNPC(projectile, ignoreTiles,
    //   distanceRequired, homingVelocity, inertia) 实参直提(176 弹 helper 族);
    //   homingVelocity→spec.homing(惯性插值稳态≈h 速度尺度,映射标注)
    if (r.feats.includes('homing') && spec.homing === undefined && r.aiBody) {
      const hm = /(?:CalamityUtils\.)?HomeInOnNPC\(\s*(?:Projectile|projectile|proj)\s*,\s*!?(?:\w+\.)?(?:tileCollide\w*)\s*,\s*([\d.]+)f\s*,\s*([\d.]+)f\s*,\s*([\d.]+)f/.exec(r.aiBody)
        ?? /(?:CalamityUtils\.)?HomeInOnNPC\(\s*(?:Projectile|projectile|proj)\s*,\s*(?:true|false)\s*,\s*([\d.]+)f\s*,\s*([\d.]+)f\s*,\s*([\d.]+)f/.exec(r.aiBody);
      if (hm) {
        if (hm.length >= 5) { spec.homingDist = parseFloat(hm[2]); spec.homing = parseFloat(hm[3]); }
        else { spec.homing = parseFloat(hm[2]); }
        numHoming++;
      }
    }
  }
  if (WRITE && (spec.profile !== d.profile || spec.gravity !== undefined || spec.lifetime !== undefined)) {
    writeFileSync(jp, JSON.stringify(d, null, 2) + '\n');
  }
}

// 报告
const dist = {};
for (const m of matched) dist[m.profile ?? 'none'] = (dist[m.profile ?? 'none'] ?? 0) + 1;
const summary = {
  scanned: rows.length,
  matched: matched.length,
  dist,
  heavyAI: matched.filter((m) => m.aiLines > 120).length,
  lightAI: matched.filter((m) => m.aiLines <= 40).length,
  numGravity, numLifetime, numHoming,
};
writeFileSync(OUT, JSON.stringify({ summary, matched }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.log('报告:', OUT, WRITE ? '(已回填)' : '(dry-run;--write 回填声明面)');
