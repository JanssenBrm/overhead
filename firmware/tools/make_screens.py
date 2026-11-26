#!/usr/bin/env python3
"""Maakt de vaste schermen van de firmware (opstarten, wifi instellen, geen verbinding) als jpg van 1024 x 600.

Zelfde stijl als het beeld van de site: wit vel, Geist, zachte grijstinten.
Gebruik: python3 tools/make_screens.py  (schrijft naar main/screens/)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT.parent / "fonts"
OUT = ROOT / "main" / "screens"
W, H = 1024, 600
INK, MUTED, LINE, ACCENT = (17, 19, 22), (106, 113, 122), (216, 212, 205), (47, 98, 201)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def plane(d, x, y, s, col):
    """Klein zijaanzicht van een vliegtuig (neus naar rechts) als icoon."""
    d.rounded_rectangle([x, y - 6 * s, x + 90 * s, y + 6 * s], radius=6 * s, fill=col)
    d.polygon([(x + 30 * s, y), (x + 58 * s, y), (x + 40 * s, y + 30 * s), (x + 30 * s, y + 30 * s)], fill=col)
    d.polygon([(x + 30 * s, y), (x + 58 * s, y), (x + 40 * s, y - 26 * s), (x + 30 * s, y - 26 * s)], fill=col)
    d.polygon([(x + 2 * s, y - 2 * s), (x + 14 * s, y - 2 * s), (x + 6 * s, y - 24 * s), (x, y - 24 * s)], fill=col)


def screen(name, eyebrow, title, lines, foot=None):
    im = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(im)
    plane(d, 72, 118, 1, INK)
    d.text((72, 180), eyebrow.upper(), font=font("GeistMono-Medium.ttf", 18), fill=MUTED)
    d.text((70, 210), title, font=font("Geist-SemiBold.ttf", 52), fill=INK)
    y = 300
    for ln in lines:
        if isinstance(ln, tuple):  # (label, waarde): waarde in mono en accentkleur
            lab, val = ln
            d.text((72, y), lab, font=font("Geist-Regular.ttf", 28), fill=INK)
            w = d.textlength(lab, font=font("Geist-Regular.ttf", 28))
            d.text((72 + w + 10, y - 1), val, font=font("GeistMono-Medium.ttf", 28), fill=ACCENT)
        else:
            d.text((72, y), ln, font=font("Geist-Regular.ttf", 28), fill=INK)
        y += 46
    if foot:
        d.line([(72, H - 86), (W - 72, H - 86)], fill=LINE, width=2)
        d.text((72, H - 66), foot, font=font("Geist-Regular.ttf", 22), fill=MUTED)
    OUT.mkdir(parents=True, exist_ok=True)
    # Baseline jpg met 4:2:0, zoals de server: dat leest de jpg-decoder van de ESP32-P4
    im.save(OUT / f"{name}.jpg", quality=90, optimize=False, progressive=False, subsampling=2)


screen("start", "Overhead", "Even geduld…",
       ["Het scherm maakt verbinding met de wifi", "en haalt de vliegtuigen van nu op."])
screen("setup", "Overhead · wifi instellen", "Verbind met dit scherm",
       ["1. Open de wifi-instellingen op je gsm.",
        ("2. Kies het netwerk", "Overhead-scherm"),
        ("3. Surf naar", "http://192.168.4.1"),
        "4. Kies je wifi, vul het wachtwoord in en bewaar."],
       "Het scherm herstart daarna vanzelf.")
screen("offline", "Overhead", "Geen verbinding",
       ["Het scherm kan de wifi of de site nu niet bereiken.", "Het probeert het elke minuut opnieuw."],
       "Blijft dit zo? Houd het scherm 5 seconden aangeraakt om de wifi opnieuw in te stellen.")
print("klaar:", ", ".join(p.name for p in sorted(OUT.glob("*.jpg"))))
