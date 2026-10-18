#!/usr/bin/env python3
"""Wedillybird TikTok builder: manifest + assets -> 1080x1920 H.264 MP4.

usage: build_video.py <manifest.json> <out.mp4> [--work DIR] [--no-music] [--no-outro] [--cover cover.jpg]

Manifest (paths relative to the manifest's folder unless absolute):
{
  "id": "D01-A",
  "vo": "vo/D01-A.mp3",                 # TTS audio (whole video)
  "words": "vo/D01-A.words.json",       # output of transcribe.py (word timestamps)
  "music": "harmonie",                  # public/audio/invitation/<name>.m4a, or null
  "outro": {"line": "Follow for part 2", "sub": "wedillybird.com/en", "dur": 2.4},
  "beats": [
    {"vo": "caption text spoken in this beat",
     "overlay": "optional short on-screen headline",
     "scene": {...}}                                  # or "shots": [{..., "w": 1}, {..., "w": 2}]
  ]
}
scene kinds
  clip  : {"src","ss"=0,"zoom"=0.0 (push-in),"crop"=1.0 (static zoom),"focus":[0.5,0.5],"flip":false,"scrim":true}
  still : {"src","kb":"in|out|left|right","crop"=1.0,"focus":[0.5,0.5],"crop_bottom":0.07,"flip":false}
  card  : {"type":"title|number|checklist|quote","text","sub","n","items":[...]}
  screen: {"src","ss"=0,"frame":"phone|full"}      # product capture (video or image)
"""
import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
FONTS = ASSETS / "fonts"
REPO = Path(os.environ.get("WEDILLYBIRD_REPO") or next((p for p in HERE.parents if (p / "public" / "audio" / "invitation").is_dir()), "/home/user/wedillybird"))
MUSIC_DIR = REPO / "public" / "audio" / "invitation"
LOGO = REPO / "public" / "wedillybird-logo.png"

# brand tokens (DESIGN.md)
IVORY = (0xFB, 0xF6, 0xEE)
INK = (0x19, 0x0F, 0x0D)
INK_500 = (0x59, 0x49, 0x46)
CHAMPAGNE_300 = (0xE9, 0xD5, 0xB3)
CHAMPAGNE_500 = (0xD2, 0xB2, 0x81)
CHAMPAGNE_700 = (0x92, 0x75, 0x45)
BLUSH_700 = (0x87, 0x49, 0x48)

GRADE = (
    "eq=contrast=1.03:saturation=0.95:gamma=1.02,"
    "colorbalance=rs=0.012:bs=-0.018:rh=0.018:bh=-0.028,"
    "vignette=angle=PI/7:mode=forward:eval=init,"
    "noise=alls=3:allf=t"
)
CAP_Y = {"default": 1210, "screen": 1440}


def sh(cmd, quiet=True):
    r = subprocess.run([str(c) for c in cmd], capture_output=quiet, text=True)
    if r.returncode != 0:
        sys.stderr.write((r.stderr or "")[-3000:] + "\n")
        raise SystemExit(f"command failed: {' '.join(map(str, cmd))[:300]}")


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
         "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    return {"duration": float(j["format"].get("duration") or 0), "streams": j["streams"]}


def resolve(base: Path, p: str) -> Path:
    q = Path(p)
    return q if q.is_absolute() else (base / q).resolve()


# --------------------------------------------------------------------------- alignment

def norm(t: str) -> str:
    return re.sub(r"[^a-z0-9']", "", t.lower().replace("’", "'"))


def align(beats, words, vo_dur):
    """Flat script tokens with times, fuzzy-aligned to the Whisper transcript (script spelling is kept)."""
    toks = []
    for bi, b in enumerate(beats):
        for raw in b["vo"].split():
            toks.append({"raw": raw, "beat": bi, "n": norm(raw), "s": None, "e": None})
    tw = [{"n": norm(w["w"]), "s": w["s"], "e": w["e"]} for w in words if norm(w["w"])]
    sm = difflib.SequenceMatcher(None, [t["n"] for t in toks], [w["n"] for w in tw], autojunk=False)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            toks[blk.a + k]["s"], toks[blk.a + k]["e"] = tw[blk.b + k]["s"], tw[blk.b + k]["e"]
    i = 0
    while i < len(toks):
        if toks[i]["s"] is not None:
            i += 1
            continue
        j = i
        while j < len(toks) and toks[j]["s"] is None:
            j += 1
        t0 = toks[i - 1]["e"] if i > 0 else 0.0
        t1 = toks[j]["s"] if j < len(toks) else vo_dur
        if t1 < t0:
            t1 = t0 + 0.2 * (j - i)
        weights = [max(1, len(toks[k]["n"])) for k in range(i, j)]
        tot = sum(weights)
        cur = t0
        for k, wgt in zip(range(i, j), weights):
            span = (t1 - t0) * wgt / tot
            toks[k]["s"], toks[k]["e"] = cur, cur + span
            cur += span
        i = j
    return toks


def beat_windows(beats, toks, vo_dur, tail=0.35):
    starts = []
    for bi in range(len(beats)):
        ts = [t for t in toks if t["beat"] == bi]
        starts.append(ts[0]["s"] if ts else (starts[-1] if starts else 0.0))
    starts[0] = 0.0
    wins = []
    for bi, s in enumerate(starts):
        e = starts[bi + 1] if bi + 1 < len(starts) else vo_dur + tail
        wins.append((s, max(e, s + 0.6)))
    return wins


# --------------------------------------------------------------------------- cards (PIL)

def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def paper(bg=IVORY) -> Image.Image:
    img = Image.new("RGB", (W, H), bg)
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 5.5, (H, W, 1)).astype(np.float32)
    arr = np.asarray(img).astype(np.float32) + noise
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    v = (1 - 0.05 * np.clip(d - 0.4, 0, 1))[..., None]
    return Image.fromarray(np.clip(np.asarray(img) * v, 0, 255).astype(np.uint8))


def wrap(draw, text, fnt, max_w):
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def wrap_balanced(draw, text, fnt, max_w):
    """Greedy wrap, then spread the words over the same number of lines so no line is a lone orphan word."""
    lines = wrap(draw, text, fnt, max_w)
    n, ws = len(lines), text.split()
    if n < 2 or n > 3 or len(ws) < n + 1:
        return lines
    w = lambda a, b: draw.textlength(" ".join(ws[a:b]), font=fnt)  # noqa: E731
    best, cut = None, None
    if n == 2:
        for i in range(1, len(ws)):
            m = max(w(0, i), w(i, len(ws)))
            if best is None or m < best:
                best, cut = m, (i,)
    else:
        for i in range(1, len(ws) - 1):
            for j in range(i + 1, len(ws)):
                m = max(w(0, i), w(i, j), w(j, len(ws)))
                if best is None or m < best:
                    best, cut = m, (i, j)
    if best is None or best > max_w:
        return lines
    idx = (0, *cut, len(ws))
    return [" ".join(ws[idx[k]:idx[k + 1]]) for k in range(len(idx) - 1)]


def ornament(draw, y, color=CHAMPAGNE_500, half=190):
    draw.line([(W // 2 - half, y), (W // 2 - 34, y)], fill=color, width=2)
    draw.line([(W // 2 + 34, y), (W // 2 + half, y)], fill=color, width=2)
    cx, r = W // 2, 15
    draw.polygon([(cx, y - r), (cx + r * 0.32, y - r * 0.32), (cx + r, y), (cx + r * 0.32, y + r * 0.32),
                  (cx, y + r), (cx - r * 0.32, y + r * 0.32), (cx - r, y), (cx - r * 0.32, y - r * 0.32)], fill=color)


def centered(draw, lines, fnt, y, fill, gap=1.12):
    for ln in lines:
        w = draw.textlength(ln, font=fnt)
        draw.text(((W - w) / 2, y), ln, font=fnt, fill=fill)
        y += int(fnt.size * gap)
    return y


def make_card(spec: dict, out: Path) -> None:
    img = paper()
    d = ImageDraw.Draw(img)
    kind = spec.get("type", "title")
    disp = lambda s: font("BodoniModa-Italic-Display.ttf", s)  # noqa: E731
    txt = lambda s: font("BodoniModa-Italic-Text.ttf", s)  # noqa: E731
    sans = lambda s: font("Geist-Medium.ttf", s)  # noqa: E731
    if kind == "number":
        n = str(spec.get("n", 1))
        f = txt(470)  # the Text cut keeps serifs/hairlines legible on numerals
        w = d.textlength(n, font=f)
        d.text(((W - w) / 2, 150), n, font=f, fill=CHAMPAGNE_500)
        ornament(d, 800)
        f2 = txt(80)
        y = centered(d, wrap_balanced(d, spec["text"], f2, W - 220), f2, 860, INK)
        if spec.get("sub"):
            centered(d, wrap(d, spec["sub"], sans(40), W - 260), sans(40), y + 30, INK_500, 1.35)
    elif kind == "checklist":
        d.text((120, 250), spec.get("text", ""), font=disp(86), fill=INK)
        ornament(d, 400, half=150)
        y = 470
        for item in spec.get("items", [])[:5]:
            d.ellipse([120, y + 8, 180, y + 68], outline=CHAMPAGNE_500, width=3)
            d.line([(136, y + 40), (148, y + 52), (166, y + 24)], fill=CHAMPAGNE_700, width=5)
            yy = y
            for ln in wrap(d, item, sans(54), W - 360):
                d.text((215, yy + 4), ln, font=sans(54), fill=INK)
                yy += 68
            y = max(y + 120, yy + 36)
    elif kind == "entry":  # Norah's Notebook: ruled page, ribbon bookmark, big entry number
        for yy in range(420, H - 380, 74):
            d.line([(150, yy), (W - 90, yy)], fill=(0xEA, 0xDF, 0xCC), width=2)
        d.line([(130, 0), (130, H)], fill=(0xE8, 0xB4, 0xB1), width=3)  # margin rule (blush)
        d.polygon([(W - 230, 0), (W - 130, 0), (W - 130, 330), (W - 180, 290), (W - 230, 330)], fill=(0xD7, 0x8E, 0x8D))
        d.text((180, 190), "ENTRY", font=sans(40), fill=INK_500)
        n = str(spec.get("n", 1)).zfill(2)
        d.text((165, 230), n, font=txt(330), fill=CHAMPAGNE_500)
        y = 620
        for ln in wrap(d, spec["text"], disp(96), W - 330):
            d.text((190, y), ln, font=disp(96), fill=INK)
            y += 112
        if spec.get("sub"):
            for ln in wrap(d, spec["sub"], sans(40), W - 340):
                d.text((190, y + 24), ln, font=sans(40), fill=INK_500)
                y += 56
        ornament(d, y + 90, half=140)
    elif kind == "quote":
        if spec.get("sub"):  # eyebrow above the quote: the bottom band stays free for the captions
            centered(d, wrap(d, spec["sub"], sans(38), W - 260), sans(38), 290, INK_500, 1.35)
        d.text((110, 380), "“", font=disp(420), fill=CHAMPAGNE_300)
        for size in (92, 80, 70, 62):
            f = disp(size)
            lines = wrap_balanced(d, spec["text"], f, W - 240)
            if len(lines) <= 4:
                break
        y = centered(d, lines, f, 640, INK, 1.15)
        ornament(d, y + 50)
    else:
        f = disp(118)
        lines = wrap_balanced(d, spec["text"], f, W - 200)
        block_h = int(len(lines) * f.size * 1.12)
        y0 = (H - block_h) // 2 - 250
        ornament(d, y0 - 70)
        y = centered(d, lines, f, y0, INK)
        if spec.get("sub"):
            centered(d, wrap(d, spec["sub"], sans(44), W - 240), sans(44), y + 50, INK_500, 1.35)
    img.save(out)


def make_outro(spec: dict, out: Path) -> None:
    img = paper()
    d = ImageDraw.Draw(img)
    logo = Image.open(LOGO).convert("RGBA")
    target_w = 800
    logo = logo.resize((target_w, int(logo.height * target_w / logo.width)), Image.LANCZOS)
    img.paste(logo, ((W - target_w) // 2, 640), logo)
    # spell-out device: keeps the name distinct from similar-sounding brands
    letters = ["W", "E", "D", "I", "L", "L", "Y"]
    sp = font("BodoniModa-Italic-Text.ttf", 60)
    gap = 26
    widths = [d.textlength(c, font=sp) for c in letters]
    x = (W - (sum(widths) + gap * (len(letters) - 1))) / 2
    for i, c in enumerate(letters):
        d.text((x, 905), c, font=sp, fill=BLUSH_700 if i in (4, 5) else INK)
        x += widths[i] + gap
    centered(d, ["double L, then Y"], font("Geist-Medium.ttf", 32), 990, INK_500)
    ornament(d, 1090)
    f = font("BodoniModa-Italic-Display.ttf", 80)
    y = centered(d, wrap(d, spec.get("line", "Follow for more"), f, W - 220), f, 1140, INK)
    if spec.get("sub"):
        centered(d, [spec["sub"]], font("Geist-Medium.ttf", 40), y + 24, INK_500)
    img.save(out)


def make_pill(text: str, out: Path, size: int = 27, bg=(0x19, 0x0F, 0x0D, 168), fg=IVORY) -> None:
    """Small rounded label (AI disclosure, 'real screens' notice)."""
    fnt = font("Geist-Medium.ttf", size)
    probe_d = ImageDraw.Draw(Image.new("RGBA", (4, 4)))
    pad_x, pad_y = 22, 12
    w = int(probe_d.textlength(text, font=fnt)) + 2 * pad_x
    h = size + 2 * pad_y + 4
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=h // 2, fill=bg)
    d.text((pad_x, pad_y - 1), text, font=fnt, fill=fg + (255,))
    img.save(out)


def make_screen_bg(out: Path, frame_src: Path | None = None) -> None:
    """Ivory canvas used behind framed product captures."""
    paper().save(out)


def make_phone_mask(out: Path, w: int, h: int, r: int) -> None:
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    m.save(out)


def make_shadow(out: Path, w: int, h: int, r: int) -> None:
    pad = 90
    base = Image.new("L", (w + 2 * pad, h + 2 * pad), 0)
    ImageDraw.Draw(base).rounded_rectangle([pad, pad + 26, pad + w, pad + 26 + h], radius=r, fill=70)
    base = base.filter(ImageFilter.GaussianBlur(34))
    rgba = Image.new("RGBA", base.size, (0x3B, 0x24, 0x20, 0))
    rgba.putalpha(base)
    rgba.save(out)


# --------------------------------------------------------------------------- scene rendering

COVER = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
ENC = ["-c:v", "libx264", "-preset", "fast", "-crf", "14", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]


def make_scrim(path: Path) -> None:
    """Legibility gradient: top (hook overlays) and lower half (captions)."""
    y = np.linspace(0, 1, H)[:, None]
    smooth = lambda x: x * x * (3 - 2 * x)  # noqa: E731
    top = 0.28 * (1 - smooth(np.clip(y / 0.26, 0, 1)))
    bot = 0.52 * smooth(np.clip((y - 0.40) / 0.46, 0, 1))
    a = np.repeat(np.clip(top + bot, 0, 1), W, axis=1)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 0x14, 0x0B, 0x09
    rgba[..., 3] = (a * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path)


def static_crop(sc: dict) -> str:
    cz = float(sc.get("crop", 1.0))
    if cz <= 1.001:
        return ""
    fx, fy = sc.get("focus", [0.5, 0.5])
    return f",scale=iw*{cz}:ih*{cz},crop={W}:{H}:x='(iw-ow)*{fx}':y='(ih-oh)*{fy}'"


def run_footage(inp, chain, n, out, scrim):
    if scrim is not None:
        fc = f"[0:v]{chain}[v0];[v0][1:v]overlay=0:0:format=auto,format=yuv420p[v]"
        sh(["ffmpeg", "-y", "-v", "error", *inp, "-i", scrim, "-filter_complex", fc, "-map", "[v]",
            "-frames:v", n, *ENC, out])
    else:
        sh(["ffmpeg", "-y", "-v", "error", *inp, "-vf", chain, "-frames:v", n, *ENC, out])


def render_clip(sc, n, out, base, scrim):
    src = resolve(base, sc["src"])
    ss = float(sc.get("ss", 0.0))
    need = n / FPS
    avail = max(probe(src)["duration"] - ss, 0.2)
    speed = 1.0 if avail >= need else max(avail / need, 1 / 1.6)
    vf = [COVER]
    if sc.get("flip"):
        vf.append("hflip")
    vf += [f"setpts=PTS/{speed:.5f}", f"fps={FPS}"]
    if speed < 1.0 and avail / speed < need:
        vf.append(f"tpad=stop_mode=clone:stop_duration={need:.3f}")
    chain = ",".join(vf) + static_crop(sc)
    z = float(sc.get("zoom", 0.0))
    if z:
        chain += f",scale=w='trunc({W}*(1+{z}*t/{need:.3f})/2)*2':h=-2:eval=frame,crop={W}:{H}"
    run_footage(["-ss", f"{ss:.3f}", "-i", src], chain, n, out, scrim if sc.get("scrim", True) else None)


def prep_still(sc, base, work, idx) -> Path:
    im = Image.open(resolve(base, sc["src"])).convert("RGB")
    cb = float(sc.get("crop_bottom", 0.07))  # drops generator watermarks bottom-right
    h2 = int(im.height * (1 - cb))
    w2 = min(im.width, int(h2 * 9 / 16))
    x0 = (im.width - w2) // 2
    im = im.crop((x0, 0, x0 + w2, h2)).resize((2160, 3840), Image.LANCZOS)
    if sc.get("flip"):
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    p = work / f"still_{idx:02d}.jpg"
    im.save(p, quality=95)
    return p


def render_still(sc, n, out, base, work, idx, scrim):
    img = prep_still(sc, base, work, idx)
    kb = sc.get("kb", "in")
    cz = float(sc.get("crop", 1.0))
    fx, fy = sc.get("focus", [0.5, 0.5])
    xf, yf = f"(iw-iw/zoom)*{fx}", f"(ih-ih/zoom)*{fy}"
    if kb == "out":
        z, x, y = f"{cz + 0.14}-0.14*on/{n}", xf, yf
    elif kb == "left":
        z, x, y = f"{cz + 0.12}", f"(iw-iw/zoom)*(1-on/{n})", yf
    elif kb == "right":
        z, x, y = f"{cz + 0.12}", f"(iw-iw/zoom)*on/{n}", yf
    else:
        z, x, y = f"{cz}+0.13*on/{n}", xf, yf
    vf = f"zoompan=z='{z}':x='{x}':y='{y}':d={n}:s={W}x{H}:fps={FPS},setsar=1"
    run_footage(["-loop", "1", "-i", img], vf, n, out, scrim if sc.get("scrim", True) else None)


def render_card(sc, n, out, work, idx):
    png = work / f"card_{idx:02d}.png"
    make_card(sc, png)
    vf = (f"zoompan=z='1+0.035*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS},"
          f"fade=t=in:st=0:d=0.16,setsar=1")
    sh(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", png, "-vf", vf, "-frames:v", n, *ENC, out])


def render_screen(sc, n, out, base, work, idx):
    src = resolve(base, sc["src"])
    need = n / FPS
    if sc.get("frame", "phone") == "full":
        is_img = src.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")
        pre = ["-loop", "1", "-i", src] if is_img else ["-ss", f"{float(sc.get('ss', 0)):.3f}", "-i", src]
        vf = f"{COVER},fps={FPS},tpad=stop_mode=clone:stop_duration={need:.3f}"
        sh(["ffmpeg", "-y", "-v", "error", *pre, "-vf", vf, "-frames:v", n, *ENC, out])
        return
    pw, ph, r = 600, 1067, 54  # framed capture on ivory paper, caption sits below
    bg, mask, shadow = work / "scr_bg.png", work / "scr_mask.png", work / "scr_shadow.png"
    if not bg.exists():
        make_screen_bg(bg)
        make_phone_mask(mask, pw, ph, r)
        make_shadow(shadow, pw, ph, r)
    is_img = src.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")
    pre = ["-loop", "1", "-i", src] if is_img else ["-ss", f"{float(sc.get('ss', 0)):.3f}", "-i", src]
    x, y = (W - pw) // 2, 300
    fc = (
        f"[1:v]scale={pw}:{ph}:force_original_aspect_ratio=increase,crop={pw}:{ph},fps={FPS},"
        f"tpad=stop_mode=clone:stop_duration={need:.3f},format=rgba[cap];"
        f"[2:v]format=gray[m];[cap][m]alphamerge[capr];"
        f"[0:v][3:v]overlay={x - 90}:{y - 90}[b1];[b1][capr]overlay={x}:{y},format=yuv420p[v]"
    )
    sh(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", bg, *pre, "-loop", "1", "-i", mask,
        "-loop", "1", "-i", shadow, "-filter_complex", fc, "-map", "[v]", "-frames:v", n, *ENC, out])


# --------------------------------------------------------------------------- captions (ASS)

def bgr(c):
    return "&H00%02X%02X%02X&" % (c[2], c[1], c[0])


def ts(t: float) -> str:
    cs = int(round(max(0.0, t) * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def chunk_tokens(toks):
    chunks, cur = [], []
    for t in toks:
        cur.append(t)
        text = " ".join(x["raw"] for x in cur)
        end_sentence = bool(re.search(r"[.!?]$", t["raw"]))
        soft_break = bool(re.search(r"[,;:—]$", t["raw"])) and len(cur) >= 2
        if end_sentence or soft_break or len(cur) >= 4 or len(text) >= 22:
            chunks.append(cur)
            cur = []
    if cur:
        if chunks and len(cur) == 1 and len(chunks[-1]) < 4:
            chunks[-1].extend(cur)
        else:
            chunks.append(cur)
    return chunks


PUBLISHERS = re.compile(r"\b(Zola|Joy|The Knot|Emily Post|Pew|Philadelphia|WeddingWire|Here Comes The Guide|Business Insider|New York Times|NYT|"
                        r"U\.S\. News|Anna Post|Chertoff|Genevieve|Davidson|Naval Observatory|Ofcom|Reuters)\b")


def is_citation(t: str) -> bool:
    return bool(re.match(r"^Sources?\b", t)) or (bool(PUBLISHERS.search(t)) and len(t) <= 80 and "?" not in t)


def fit_overlay(text: str, max_w: int = 900, sizes=(108, 92, 80, 70, 62, 54, 46, 40), max_lines=None):
    """Largest Bodoni size at which the text fits in at most two lines (three below 70 px)."""
    path = str(FONTS / "BodoniModa-Italic-Text.ttf")
    lines, size = [text], sizes[-1]
    for size in sizes:
        f = ImageFont.truetype(path, size)
        lines, cur = [], ""
        for w in text.split():
            trial = (cur + " " + w).strip()
            if f.getlength(trial) <= max_w:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        if len(lines) <= (max_lines or (2 if size >= 70 else 3)) and all(f.getlength(l) <= max_w for l in lines):
            if len(lines) == 2:  # balance the two lines: no orphan word on the second line
                ws = text.split()
                best = min(range(1, len(ws)), key=lambda k: max(f.getlength(" ".join(ws[:k])), f.getlength(" ".join(ws[k:]))))
                cand = [" ".join(ws[:best]), " ".join(ws[best:])]
                if all(f.getlength(l) <= max_w for l in cand):
                    lines = cand
            break
    return lines, size


def fit_cite(text: str, max_w: int = 860, sizes=(40, 36, 32)):
    path = str(FONTS / "Geist-SemiBold.ttf")
    for size in sizes:
        f = ImageFont.truetype(path, size)
        lines, cur = [], ""
        for w in text.split():
            trial = (cur + " " + w).strip()
            if f.getlength(trial) <= max_w:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        if len(lines) <= 2:
            break
    return lines, size


def build_ass(toks, overlays, out: Path, spans) -> None:
    hi, base_c = bgr(CHAMPAGNE_300), bgr(IVORY)
    hi_dark, base_dark = bgr(BLUSH_700), bgr(INK)

    def kind_at(t: float) -> str:
        for a, b, k in spans:
            if a <= t < b:
                return k
        return "clip"

    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Cap,Geist SemiBold,72,{base_c},{base_c},&H00000000&,&H00000000&,0,0,0,0,100,100,0.5,0,1,0,0,5,60,60,0,1
Style: CapShadow,Geist SemiBold,72,&H00000000&,&H00000000&,&H00000000&,&H00000000&,0,0,0,0,100,100,0.5,0,1,0,0,5,60,60,0,1
Style: Over,Bodoni Moda Text,108,{base_c},{base_c},&H00000000&,&H00000000&,0,1,0,0,100,100,0,0,1,0,0,5,70,70,0,1
Style: OverShadow,Bodoni Moda Text,108,&H00000000&,&H00000000&,&H00000000&,&H00000000&,0,1,0,0,100,100,0,0,1,0,0,5,70,70,0,1
Style: OverScr,Bodoni Moda Text,46,{base_dark},{base_dark},&H00000000&,&H00000000&,0,1,0,0,100,100,0,0,1,0,0,5,70,70,0,1
Style: Cite,Geist SemiBold,38,{base_c},{base_c},&H8C0E0F14&,&H00000000&,0,0,0,0,100,100,0.3,0,3,16,0,5,70,70,0,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    ev = []
    all_chunks = chunk_tokens(toks)
    for ci, chunk in enumerate(all_chunks):
        next_start = all_chunks[ci + 1][0]["s"] if ci + 1 < len(all_chunks) else 1e9
        words = [c["raw"] for c in chunk]
        two_lines = len(" ".join(words)) > 20
        half = (len(words) + 1) // 2
        plain = (" ".join(words[:half]) + "\\N" + " ".join(words[half:])) if two_lines else " ".join(words)
        for k, c in enumerate(chunk):
            start = c["s"]
            end = chunk[k + 1]["s"] if k + 1 < len(chunk) else min(c["e"] + 0.18, next_start)
            kind = kind_at(start)
            on_card = kind == "card"
            cy = CAP_Y["screen"] if kind == "screen" else CAP_Y["default"]
            c_hi, c_base = (hi_dark, base_dark) if (on_card or kind == "screen") else (hi, base_c)
            parts = ["{\\c%s}%s" % (c_hi if j == k else c_base, w) for j, w in enumerate(words)]
            joined = (" ".join(parts[:half]) + "\\N" + " ".join(parts[half:])) if two_lines else " ".join(parts)
            pop = "\\fscx92\\fscy92\\t(0,110,\\fscx100\\fscy100)" if k == 0 else ""
            ev.append(f"Dialogue: 1,{ts(start)},{ts(end)},Cap,,0,0,0,,{{\\an5\\pos(540,{cy}){pop}}}{joined}")
            if not (on_card or kind == "screen"):
                ev.append(f"Dialogue: 0,{ts(start)},{ts(end)},CapShadow,,0,0,0,,"
                          f"{{\\an5\\pos(540,{cy + 5})\\blur9\\alpha&H50&{pop}}}{plain}")
    for o in overlays:
        txt = o["text"].replace("\n", "\\N")
        y, s, e = o.get("y", 470), o["t0"], o["t1"]
        fade = "\\fad(180,220)"
        if kind_at(s + 0.01) == "screen":  # phone frame occupies y=300..1367: label goes in the band above it, dark on ivory
            lines_s, size = fit_overlay(o["text"].replace("\n", " "), sizes=(46, 40, 36), max_lines=2)
            scr_txt = "\\N".join(lines_s)
            ev.append(f"Dialogue: 1,{ts(s)},{ts(e)},OverScr,,0,0,0,,{{\\an5\\pos(540,262)\\fs{size}{fade}}}{scr_txt}")
            continue
        raw = o["text"].replace("\n", " ")
        if is_citation(raw):  # small boxed credit under the AI pill, readable on any footage
            lines_c, size = fit_cite(raw)
            cite_txt = "\\N".join(lines_c)
            ev.append(f"Dialogue: 2,{ts(s)},{ts(e)},Cite,,0,0,0,,{{\\an5\\pos(540,268)\\fs{size}{fade}}}{cite_txt}")
            continue
        lines, size = fit_overlay(raw)
        txt2 = "\\N".join(lines)
        ev.append(f"Dialogue: 1,{ts(s)},{ts(e)},Over,,0,0,0,,{{\\an5\\pos(540,{y})\\fs{size}{fade}}}{txt2}")
        ev.append(f"Dialogue: 0,{ts(s)},{ts(e)},OverShadow,,0,0,0,,{{\\an5\\pos(540,{y + 6})\\fs{size}\\blur12\\alpha&H48&{fade}}}{txt2}")
    out.write_text(head + "\n".join(ev) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("out")
    ap.add_argument("--work")
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--no-outro", action="store_true")
    ap.add_argument("--cover")
    a = ap.parse_args()
    man_path, out_path = Path(a.manifest).resolve(), Path(a.out).resolve()
    base = man_path.parent
    work = Path(a.work).resolve() if a.work else out_path.parent / f"_work_{out_path.stem}"
    shutil.rmtree(work, ignore_errors=True)
    (work / "scenes").mkdir(parents=True)

    man = json.loads(man_path.read_text())
    beats = man["beats"]
    vo = resolve(base, man["vo"])
    words = json.loads(resolve(base, man["words"]).read_text())["words"]
    vo_dur = probe(vo)["duration"]

    toks = align(beats, words, vo_dur)
    wins = beat_windows(beats, toks, vo_dur)
    total = wins[-1][1]

    scenes = []
    for bi, (b, (t0, t1)) in enumerate(zip(beats, wins)):
        shots = b.get("shots") or [b["scene"]]
        wts = [float(s.get("w", 1)) for s in shots]
        tot = sum(wts)
        cur = t0
        for s, w in zip(shots, wts):
            d = (t1 - t0) * w / tot
            scenes.append({"scene": s, "t0": cur, "t1": cur + d, "beat": bi})
            cur += d
    bounds = [round(s["t0"] * FPS) for s in scenes] + [round(total * FPS)]
    scrim = work / "scrim.png"
    make_scrim(scrim)
    seg_files = []
    for i, s in enumerate(scenes):
        n = max(bounds[i + 1] - bounds[i], 6)
        out = work / "scenes" / f"{i:03d}.mp4"
        sc, kind = s["scene"], s["scene"]["kind"]
        if kind == "clip":
            render_clip(sc, n, out, base, scrim)
        elif kind == "still":
            render_still(sc, n, out, base, work, i, scrim)
        elif kind == "card":
            render_card(sc, n, out, work, i)
        elif kind == "screen":
            render_screen(sc, n, out, base, work, i)
        else:
            raise SystemExit(f"unknown scene kind {kind}")
        seg_files.append(out)
        print(f"scene {i:02d} {kind:6s} {n / FPS:5.2f}s", flush=True)

    outro = man.get("outro") if not a.no_outro else None
    outro_dur = 0.0
    if outro:
        outro_dur = float(outro.get("dur", 2.4))
        png = work / "outro.png"
        make_outro(outro, png)
        on = int(round(outro_dur * FPS))
        o = work / "scenes" / "zzz_outro.mp4"
        sh(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", png, "-vf",
            f"zoompan=z='1+0.02*on/{on}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={on}:s={W}x{H}:fps={FPS},"
            f"fade=t=in:st=0:d=0.25,setsar=1", "-frames:v", on, *ENC, o])
        seg_files.append(o)

    lst = work / "concat.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in seg_files))
    raw = work / "video_raw.mp4"
    sh(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", raw])
    video_len = total + outro_dur

    overlays = []
    for bi, b in enumerate(beats):
        beat_kinds = [s.get("kind") for s in (b.get("shots") or [b["scene"]])]
        if b.get("overlay") and "card" not in beat_kinds:  # cards carry their own text
            t0, t1 = wins[bi]
            overlays.append({"text": b["overlay"], "t0": t0 + 0.05, "t1": min(t1, t0 + 3.2), "y": b.get("overlay_y", 470)})
    spans = [(bounds[i] / FPS, bounds[i + 1] / FPS, s["scene"]["kind"]) for i, s in enumerate(scenes)]
    ass = work / "subs.ass"
    build_ass(toks, overlays, ass, spans)

    inputs = ["-i", raw, "-i", vo]
    music = man.get("music") if not a.no_music else None
    fade_out = max(video_len - 1.4, 0)
    if music:
        inputs += ["-i", MUSIC_DIR / f"{music}.m4a"]
        af = (
            "[1:a]aresample=48000,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=90:makeup=3,"
            "pan=stereo|c0=c0|c1=c0,asplit=2[vo][vokey];"
            "[2:a]aresample=48000,aformat=channel_layouts=stereo,aloop=loop=-1:size=2147483647,"
            f"atrim=0:{video_len:.3f},volume=0.20,afade=t=in:st=0:d=1.2[bed];"
            "[bed][vokey]sidechaincompress=threshold=0.02:ratio=9:attack=15:release=420[duck];"
            f"[vo][duck]amix=inputs=2:duration=longest:normalize=0,apad=whole_dur={video_len:.3f},"
            f"afade=t=out:st={fade_out:.3f}:d=1.4,loudnorm=I=-14:TP=-1.0:LRA=9[a]"
        )
    else:
        af = (
            "[1:a]aresample=48000,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=90:makeup=3,"
            f"pan=stereo|c0=c0|c1=c0,apad=whole_dur={video_len:.3f},loudnorm=I=-14:TP=-1.0:LRA=9[a]"
        )
    # disclosure pills: persistent AI label (+ fiction tag on first 3 s and end card)
    has_screen = any(s["scene"]["kind"] == "screen" for s in scenes)
    tag = man.get("tag") or ("Norah: AI host · real screens, demo data" if has_screen else "Norah is an AI-generated host")
    pills = []
    p_ai = work / "pill_ai.png"
    make_pill(tag, p_ai)
    pills.append((p_ai, 48, 160, None))
    if man.get("fiction"):
        p_fx = work / "pill_fiction.png"
        make_pill("FICTION · AI CHARACTER", p_fx, bg=(0x45, 0x6F, 0x46, 225))
        pills.append((p_fx, 48, 226, f"lt(t,3.2)+gte(t,{total:.2f})"))
    base_idx = 3 if music else 2
    vf = f"[0:v]{GRADE}[g0]"
    last = "g0"
    for k, (png, px, py, en) in enumerate(pills):
        inputs += ["-i", png]
        en_s = f":enable='{en}'" if en else ""
        vf += f";[{last}][{base_idx + k}:v]overlay={px}:{py}{en_s}[p{k}]"
        last = f"p{k}"
    vf += f";[{last}]ass=filename='{ass}':fontsdir='{FONTS}'[v]"
    sh(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", f"{vf};{af}", "-map", "[v]", "-map", "[a]",
        "-t", f"{video_len:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-maxrate", "8M",
        "-bufsize", "16M", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", FPS,
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out_path])
    if a.cover:
        sh(["ffmpeg", "-y", "-v", "error", "-ss", "1.2", "-i", out_path, "-frames:v", "1", "-q:v", "2", a.cover])
    print(f"built {out_path}  {probe(out_path)['duration']:.2f}s  scenes={len(scenes)}")


if __name__ == "__main__":
    main()
