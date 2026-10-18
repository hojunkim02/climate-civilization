#!/usr/bin/env python3
"""세계지도 SVG 2종 생성: 태평양 중심(기본) + 대서양 중심.
태평양 중심은 다각형 클리핑 대신 도형을 ±720px 이동해 두 번 그리고
뷰포트(viewBox)로 잘라내는 방식 사용 — 경계를 여러 번 통과하는
대륙(유라시아 등)도 형태가 깨지지 않음.
"""
import re
import xml.etree.ElementTree as ET

SRC = 'worldmap.svg'
PAC = 'worldmap_pacific.svg'
ATL = 'worldmap_atlantic.svg'

tree = ET.parse(SRC)
root = tree.getroot()
PATH_NS = '{http://www.w3.org/2000/svg}'


def parse_path(d):
    toks = re.findall(r'[MLZ]|-?\d+\.?\d*', d)
    pts, cmd, nums = [], None, []
    for t in toks:
        if t in ('M', 'L'):
            if cmd:
                for i in range(0, len(nums) - 1, 2):
                    pts.append((float(nums[i]), float(nums[i + 1])))
            cmd, nums = t, []
        elif t == 'Z':
            pass
        else:
            nums.append(t)
    if cmd:
        for i in range(0, len(nums) - 1, 2):
            pts.append((float(nums[i]), float(nums[i + 1])))
    return pts


def shifted_d(pts, dx):
    return 'M' + ' L'.join('%.1f %.1f' % (x + dx, y) for x, y in pts) + ' Z'


def x_of(lon, mode):
    if mode == 'pacific':
        return ((lon + 360) % 360) * 4
    return (lon + 180) * 4


paths = []
for el in root.iter(PATH_NS + 'path'):
    d = el.get('d')
    if not d:
        continue
    paths.append({
        'pts': parse_path(d),
        'fill': el.get('fill', ''),
        'stroke': el.get('stroke', ''),
        'sw': el.get('stroke-width', '1.5'),
    })

# (text, font-size, lon, y, fill, weight, letter-spacing)
LABELS = [
    ('P A C I F I C', 18, 175, 300, '#7ba6bd', 'bold', 4),
    ('A T L A N T I C', 18, -30, 330, '#7ba6bd', 'bold', 3),
    ('인도양', 15, 82, 330, '#8fb8cc', '', 0),
    ('북아메리카', 14, -118, 150, '#6b8a5e', '', 0),
    ('남아메리카', 14, -62, 285, '#6b8a5e', '', 0),
    ('유라시아', 14, 85, 120, '#6b8a5e', '', 0),
    ('아프리카', 14, 8, 440, '#6b8a5e', '', 0),
    ('오스트레일리아', 14, 133, 478, '#6b8a5e', '', 0),
    ('인도네시아', 13, 108, 340, '#6b8a5e', '', 0),
    ('🇰🇷 한국', 13, 127, 194, '#9a7a1a', 'bold', 0),
]

GRID = '''  <g stroke="#9fc3d8" stroke-width="1" opacity="0.45"><line x1="0" y1="120" x2="1440" y2="120"/><line x1="0" y1="240" x2="1440" y2="240"/><line x1="0" y1="480" x2="1440" y2="480"/><line x1="0" y1="600" x2="1440" y2="600"/><line x1="120" y1="0" x2="120" y2="720"/><line x1="240" y1="0" x2="240" y2="720"/><line x1="360" y1="0" x2="360" y2="720"/><line x1="480" y1="0" x2="480" y2="720"/><line x1="600" y1="0" x2="600" y2="720"/><line x1="720" y1="0" x2="720" y2="720"/><line x1="840" y1="0" x2="840" y2="720"/><line x1="960" y1="0" x2="960" y2="720"/><line x1="1080" y1="0" x2="1080" y2="720"/><line x1="1200" y1="0" x2="1200" y2="720"/><line x1="1320" y1="0" x2="1320" y2="720"/></g>'''

LAT_LABELS = '''  <g font-family="'Segoe UI', sans-serif" font-size="12" fill="#7a99ad"><text x="8" y="116">60°N</text><text x="8" y="236">30°N</text><text x="8" y="356">0°</text><text x="8" y="476">30°S</text><text x="8" y="596">60°S</text><text x="1412" y="116">60°N</text><text x="1412" y="236">30°N</text><text x="1412" y="356">0°</text><text x="1412" y="476">30°S</text><text x="1412" y="596">60°S</text></g>'''


def build(mode, outfile):
    out = []
    out.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 720">')
    out.append('  <title>세계지도 (등장방형 투법, %s)</title>' % ('태평양 중심' if mode == 'pacific' else '대서양 중심'))
    out.append('''  <defs><linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#dbeafe"/><stop offset="35%" stop-color="#cfe8f7"/><stop offset="50%" stop-color="#c7e6f5"/><stop offset="65%" stop-color="#cfe8f7"/><stop offset="100%" stop-color="#d5e9f2"/></linearGradient><linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8f0d8"/><stop offset="100%" stop-color="#d3e2bc"/></linearGradient><linearGradient id="landWarm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f0ead2"/><stop offset="100%" stop-color="#e2d9b4"/></linearGradient><filter id="soft" x="-4%" y="-4%" width="108%" height="108%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#5a7a94" flood-opacity="0.25"/></filter></defs>''')
    out.append('  <rect width="1440" height="720" fill="url(#ocean)"/>')
    out.append(GRID)
    out.append('  <line x1="0" y1="360" x2="1440" y2="360" stroke="#d4a24e" stroke-width="1.5" stroke-dasharray="10 6" opacity="0.55"/>')
    out.append('  <g filter="url(#soft)">')

    offsets = (0,) if mode == 'atlantic' else (720, -720)
    for p in paths:
        for dx in offsets:
            out.append('    <path fill="%s" stroke="%s" stroke-width="%s" d="%s"/>' % (p['fill'], p['stroke'], p['sw'], shifted_d(p['pts'], dx)))
    out.append('  </g>')
    out.append(LAT_LABELS)
    for text, size, lon, y, fill, weight, ls in LABELS:
        x = x_of(lon, mode)
        extra = ' font-weight="%s"' % weight if weight else ''
        extra += ' letter-spacing="%s"' % ls if ls else ''
        out.append('  <text x="%.0f" y="%d" font-family="\'Segoe UI\', sans-serif" font-size="%d" fill="%s" text-anchor="middle"%s>%s</text>' % (x, y, size, fill, extra, text))
    out.append('</svg>')
    with open(outfile, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
    print('생성:', outfile)


build('pacific', PAC)
build('atlantic', ATL)
