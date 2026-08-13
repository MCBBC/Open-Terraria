import json, re
d = json.load(open('/Users/vinlic/Downloads/debug-report-紧张的照片隐居处-2026-08-13T04-36-21-418Z.json'))
rows = (d['tiles'].get('areaPlayer') or {}).get('rows') or []
hits = []
for ri, r in enumerate(rows):
    col = 0
    for cell in r.split(';'):
        m = re.match(r'^(.*?):(\d+)$', cell)
        if m and '*' in cell:
            base, n = m.group(1), int(m.group(2))
        else:
            base, n = cell, 1
        parts = base.split(':')
        if parts[0] == '31':
            hits.append((ri, col, cell if n == 1 else base + f' x{n}'))
        col += n
print('sheet-31 cells (row, realCol, cell):')
for h in hits:
    print(' ', h)
