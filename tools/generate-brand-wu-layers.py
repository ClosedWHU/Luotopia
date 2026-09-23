# Regenerates public/brand/wu-layers.json — the 14 horizontal slices of the 武
# logo consumed by the /brand page's 3D viewer (src/lib/logo3d/wu.js).
# Rasterizes the SVG composite, traces it with OpenCV, then slices it with
# Shapely. Run from the homepage root:  python tools/generate-brand-wu-layers.py
# Requires: numpy, opencv-python-headless, shapely  (pip install ...).
import numpy as np, cv2, json, re
from shapely.geometry import Polygon, box, Point
from shapely.ops import unary_union
from shapely.validation import make_valid

SRC = 'public/brand/logo-wu.svg'
OUT = 'public/brand/wu-layers.json'

X0, X1, Y0, Y1 = 205.0, 818.0, 175.0, 788.0
W = 760
H = int(round(W * (Y1 - Y0) / (X1 - X0)))

def parse_path(d):
    toks = re.findall(r'[MCLZ]|-?\d+\.?\d*', d)
    polys, i, cur, start, mode, poly = [], 0, (0.0, 0.0), (0.0, 0.0), None, []
    while i < len(toks):
        t = toks[i]
        if t in 'MCLZ':
            if t == 'M' and poly:
                polys.append(poly); poly = []
            mode = t; i += 1
            if t == 'Z':
                cur = start; poly.append(cur); mode = None
            continue
        if mode == 'M':
            x, y = float(toks[i]), float(toks[i+1]); i += 2
            cur = start = (x, y); poly = [cur]; mode = 'L'
        elif mode == 'L':
            if i >= len(toks) or toks[i] in 'MCLZ': mode = None; continue
            x, y = float(toks[i]), float(toks[i+1]); i += 2
            cur = (x, y); poly.append(cur)
        elif mode == 'C':
            if i >= len(toks) or toks[i] in 'MCLZ': mode = None; continue
            x1, y1, x2, y2, x, y = [float(v) for v in toks[i:i+6]]; i += 6
            for s in range(1, 13):
                tt = s/12.0; mt = 1-tt
                poly.append((mt**3*cur[0]+3*mt*mt*tt*x1+3*mt*tt*tt*x2+tt**3*x,
                             mt**3*cur[1]+3*mt*mt*tt*y1+3*mt*tt*tt*y2+tt**3*y))
            cur = (x, y)
        else:
            break
    if poly: polys.append(poly)
    return polys

def render_grid(polys):
    g = np.zeros((H, W), bool)
    sx = W/(X1-X0); sy = H/(Y1-Y0)
    edges = [(p[j], p[j+1]) for p in polys for j in range(len(p)-1)]
    for r in range(H):
        y = Y0 + (r+0.5)/sy
        xs = []
        for (ax, ay), (bx, by) in edges:
            if (ay > y) != (by > y):
                xs.append((ax + (bx-ax)*(y-ay)/(by-ay), 1 if by > ay else -1))
        xs.sort()
        depth = 0; sa = 0.0
        for x, dd in xs:
            pd = depth; depth += dd
            if pd == 0 and depth != 0: sa = x
            elif pd != 0 and depth == 0:
                ca = max(0, int((sa-X0)*sx)); cb = min(W, int((x-X0)*sx)+1)
                g[r, ca:cb] = True
    return g

def as_polys(geom, min_area=4.0):
    if geom is None or geom.is_empty:
        return []
    gt = geom.geom_type
    if gt == 'Polygon':
        return [geom] if geom.area >= min_area else []
    if gt == 'MultiPolygon':
        return [g for g in geom.geoms if g.area >= min_area]
    if gt == 'GeometryCollection':
        out = []
        for g in geom.geoms:
            out.extend(as_polys(g, min_area))
        return out
    return []

def clean(geom):
    if geom.is_valid:
        return geom
    b = geom.buffer(0)
    if b.is_valid and not b.is_empty:
        return b
    return make_valid(geom)

src = open(SRC, encoding='utf-8').read()
mtn_d = re.search(r'<path fill="#0E4675" d="([^"]+)"/>', src).group(1)
big_d = re.search(r'<path d="(M0 0 C9[^"]+)" fill="#0E4675" transform="translate\(511,182\)"/>', src).group(1)

mtn = parse_path(mtn_d)
big = [[(x+511, y+182) for x, y in p] for p in parse_path(big_d)]
rect = parse_path('M0 402 L1024 402 L1024 1024 L0 1024 Z')

clipA = render_grid(rect)
clipB = render_grid(mtn)
tex = render_grid(big)
final = clipB | (tex & (clipA | clipB))
img = (final*255).astype(np.uint8)
print('composite filled px:', int(final.sum()), 'of', H*W)

contours, hier = cv2.findContours(img, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
def g2c(col, row):
    return (X0 + col*(X1-X0)/W, Y0 + row*(Y1-Y0)/H)

polys = []
for i, ct in enumerate(contours):
    if hier[0][i][3] != -1:
        continue
    pts = ct.reshape(-1, 2)
    if len(pts) < 4:
        continue
    outer = [g2c(float(p[0]), float(p[1])) for p in pts]
    holes = []
    child = hier[0][i][2]
    while child != -1:
        hp = contours[child].reshape(-1, 2)
        if len(hp) >= 4:
            holes.append([g2c(float(p[0]), float(p[1])) for p in hp])
        child = hier[0][child][0]
    poly = clean(Polygon(outer, holes))
    polys.extend(as_polys(poly))

print('collected polys:', len(polys), 'total area %.0f' % sum(p.area for p in polys))
sil = clean(unary_union(polys))
print('silhouette:', sil.geom_type, 'area %.0f' % sil.area)

minx, miny, maxx, maxy = sil.bounds
print('bounds x[%.0f,%.0f] y[%.0f,%.0f]' % (minx, maxx, miny, maxy))

N = 14
gap = 11.0
bandH = (maxy - miny)/N
bands = []
for k in range(N):
    ya = miny + k*bandH + gap/2
    yb = miny + (k+1)*bandH - gap/2
    if yb <= ya:
        bands.append([]); continue
    piece = clean(sil.intersection(box(minx-6, ya, maxx+6, yb)))
    piece = piece.simplify(1.1, preserve_topology=True)
    piece = clean(piece)
    bandpolys = []
    for g in as_polys(piece, min_area=3.0):
        ext = [[float(x), float(y)] for x, y in g.exterior.coords]
        hl = []
        for h in g.interiors:
            hc = [[float(x), float(y)] for x, y in h.coords]
            if len(hc) >= 4:
                hl.append(hc)
        bandpolys.append({'outer': ext, 'holes': hl})
    bands.append(bandpolys)

print('bands:', len(bands), 'per-band polys:', [len(b) for b in bands],
      'total:', sum(len(b) for b in bands))

json.dump({
    'bands': bands,
    'bounds': {'minx': minx, 'miny': miny, 'maxx': maxx, 'maxy': maxy},
    'N': N, 'gap': gap,
}, open(OUT, 'w'))
print('wrote', OUT)

cols = 116
rows = int(cols*(maxy-miny)/(maxx-minx)/2.05)
print('\n=== vector silhouette ASCII (should read as 武) ===')
for r in range(rows):
    yy = miny + (r+0.5)*(maxy-miny)/rows
    line = ''.join('#' if sil.contains(Point(minx+(c+0.5)*(maxx-minx)/cols, yy)) else '.' for c in range(cols))
    print(line)
