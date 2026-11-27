#!/usr/bin/env python3
"""Maakt lib/world.json: landsgrenzen uit Natural Earth 1:50m (publiek domein), vereenvoudigd en compact.

Elke ring is een lijst gehele getallen [lon0*50, lat0*50, dlon1, dlat1, ...] (stappen van 0,02°, verschillen).
Gebruik: python3 tools/make_world.py pad/naar/ne_50m_admin_0_countries.geojson
"""
import json, sys
from pathlib import Path

Q = 50          # 1/50 graad = 0,02°
TOL = 0.04      # vereenvoudiging in graden

def dp(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = (dx * dx + dy * dy) ** 0.5 or 1e-9
    best, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L
        if d > best: best, idx = d, i
    if best > tol:
        return dp(pts[:idx + 1], tol)[:-1] + dp(pts[idx:], tol)
    return [a, b]

def area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2

rings = []
for f in json.load(open(sys.argv[1]))["features"]:
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    for poly in polys:
        for ring in poly[:1]:  # alleen de buitenrand: meren en gaten zijn op dit formaat niet nodig
            if area(ring) < 0.02: continue  # heel kleine eilanden weglaten
            # Gesloten ring: in twee helften vereenvoudigen (begin en einde vallen samen)
            h = len(ring) // 2
            s = dp(ring[:h + 1], TOL)[:-1] + dp(ring[h:], TOL)
            q = []
            for lon, lat in s:
                p = (round(lon * Q), round(lat * Q))
                if not q or q[-1] != p: q.append(p)
            if len(q) < 4: continue
            flat = [q[0][0], q[0][1]]
            for i in range(1, len(q)):
                flat += [q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]]
            rings.append(flat)
out = Path(__file__).resolve().parents[1] / "lib" / "world.json"
out.write_text(json.dumps({"q": Q, "src": "Natural Earth 1:50m, publiek domein", "rings": rings}, separators=(",", ":")))
print(len(rings), "ringen,", out.stat().st_size // 1024, "KB")
