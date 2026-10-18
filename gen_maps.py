#!/usr/bin/env python3
"""세계지도 SVG 2종 생성: 태평양 중심(기본) + 대서양 중심.
기존 worldmap.svg(그리니치 중앙 = 대서양 중심)을 파싱해
x좌표를 720px(180°) 이동+랩어라운드하여 태평양 중심 버전을 만든다.
경도 crossing 도형(유라시아, 아프리카)은 x=720에서 절단해 두 조각으로 출력.
해양 라벨은 실제 지리에 맞게 재배치(기존 버전은 태평양/대서양 라벨이 서로 바뀌어 있었음).
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


def clip_half(pts, keep_left):
    X = 720.0
    def inside(p):
        return p[0] <= X if keep_left else p[0] >= X
    res = []
    n = len(pts)
    for i in range(n):
        cur, nxt = pts[i], pts[(i + 1) % n]
        cin, nin = inside(cur), inside(nxt)
        if cin:
            res.append(cur)
        if cin != nin:
            t = (X - cur[0]) / (nxt[0] - cur[0])
            res.append((X, cur[1] + t * (nxt[1] - cur[1])))
    return res


def shift(pts):
    return [((x + 720) % 1440, y) for x, y in pts]


def fmt(pts):
    return 'M ' + ' L '.join('%.1f,%.1f' % p for p in pts) + ' Z'


# 지도별 x 좌표: 태평양 중심 = 날짜변경선이 중앙, 대서양 중심 = 그리니치가 중앙
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
        'd': d,
        'fill': el.get('fill', ''),
        'stroke': el.get('stroke', ''),
        'sw': el.get('stroke-width', '1.5'),
    })

LABELS = [
    # (text, font-size, lon, y, fill, weight, letter-spacing)
    ('P A C I F I C', 18, -115, 300, '#7ba6bd', 'bold', 4),
    ('A T L A N T I C', 18, -25, 330, '#7ba6bd', 'bold', 3),
    ('인도양', 15, 82, 330, '#8fb8cc', '', 0),
    ('북아메리카', 14, -118, 150, '#6b8a5e', '', 0),
    ('남아메리카', 14, -62, 285, '#6b8a5e', '', 0),
    ('유라시아', 14, 85, 120, '#6b8a5e', '', 0),
    ('아프리카', 14, 8, 440, '#6b8a5e', '', 0),
    ('오스트레일리아', 14, 133, 478, '#6b8a5e', '', 0),
    ('인도네시아', 13, 108, 340, '#6b8a5e', '', 0),
    ('🇰🇷 한국', 13, 127, 194, '#9a7a1a', 'bold', 0),
]

GRID = '''  <g stroke="#9fc3d8" stroke-width="1" opacity="0.45">
    <line x1="0" y1="120" x2="1440" y2="120"/><line x1="0" y1="240" x2="1440" y2="240"/>
    <line x1="0" y1="480" x2="1440" y2="480"/><line x1="0" y1="600" x2="1440" y2="600"/>
    <line x1="120" y1="0" x2="120" y2="720"/><line x1="240" y1="0" x2="240" y2="720"/>
    <line x1="360" y1="0" x2="360" y2="720"/><line x1="480" y1="0" x2="480" y2="720"/>
    <line x1="600" y1="0" x2="600" y2="720"/><line x1="720" y1="0" x2="720" y2="720"/>
    <line x1="840" y1="0" x2="840" y2="720"/><line x1="960" y1="0" x2="960" y2="720"/>
    <line x1="1080" y1="0" x2="1080" y2="720"/><line x1="1200" y1="0" x2="1200" y2="720"/>
    <line x1="1320" y1="0" x2="1320" y2="720"/>
  </g>'''

LAT_LABELS = '''  <g font-family="'Segoe UI', sans-serif" font-size="12" fill="#7a99ad">
    <text x="8" y="116">60°N</text><text x="8" y="236">30°N</text>
    <text x="8" y="356">0°</text><text x="8" y="476">30°S</text>
    <text x="8" y="596">60°S</text>
    <text x="1412" y="116">60°N</text><text x="1412" y="236">30°N</text>
    <text x="1412" y="356">0°</text><text x="1412" y="476">30°S</text>
    <text x="1412" y="596">60°S</text>
  </g>'''


def build(mode, outfile):
    out = []
    out.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 720">')
    out.append('  <title>세계지도 (등장방형 투법, %s)</title>' % ('태평양 중심' if mode == 'pacific' else '대서양 중심'))
    out.append('''  <defs>
    <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dbeafe"/>
      <stop offset="35%" stop-color="#cfe8f7"/>
      <stop offset="50%" stop-color="#c7e6f5"/>
      <stop offset="65%" stop-color="#cfe8f7"/>
      <stop offset="100%" stop-color="#d5e9f2"/>
    </linearGradient>
    <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8f0d8"/>
      <stop offset="100%" stop-color="#d3e2bc"/>
    </linearGradient>
    <linearGradient id="landWarm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0ead2"/>
      <stop offset="100%" stop-color="#e2d9b4"/>
    </linearGradient>
    <filter id="soft" x="-4%" y="-4%" width="108%" height="108%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#5a7a94" flood-opacity="0.25"/>
    </filter>
  </defs>''')
    out.append('  <rect width="1440" height="720" fill="url(#ocean)"/>')
    out.append(GRID)
    out.append('  <line x1="0" y1="360" x2="1440" y2="360" stroke="#d4a24e" stroke-width="1.5" stroke-dasharray="10 6" opacity="0.55"/>')
    out.append('  <g filter="url(#soft)">')

    for p in paths:
        pts = parse_path(p['d'])
        xs = [q[0] for q in pts]
        full_span = min(xs) <= 1 and max(xs) >= 1439  # 남극 등 전체 폭 도형
        if mode == 'atlantic' or full_span:
            d_out = p['d']
            pieces = [d_out]
        else:
            lo, hi = min(xs), max(xs)
            if lo < 720 < hi:
                left = shift(clip_half(pts, True))
                right = shift(clip_half(pts, False))
                pieces = [fmt(left), fmt(right)]
            else:
                pieces = [fmt(shift(pts))]
        for d in pieces:
            out.append('    <path fill="%s" stroke="%s" stroke-width="%s" d="%s"/>' % (p['fill'], p['stroke'], p['sw'], d))
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
