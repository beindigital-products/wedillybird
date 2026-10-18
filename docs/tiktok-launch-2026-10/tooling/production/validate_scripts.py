#!/usr/bin/env python3
"""Validate TikTok script JSON files against the production rules.

usage: validate_scripts.py <scripts_dir> [--glob "D0[1-8]-A.json"]
Exit code 1 on any hard error. Prints a per-video table.
"""
import argparse
import json
import re
import sys
from pathlib import Path

WPS = 2.75                          # words per second measured on the TTS voice (incl. short pauses)
MIN_WORDS, MAX_WORDS = 255, 295     # ~93-107 s of voice-over -> 96-110 s final with tail + end card
MIN_BEATS, MAX_BEATS = 28, 46
SERIES = {"QUIET_LIST", "COPY_PASTE_SEND", "NOTEBOOK", "INSIDE"}
SCREEN_IDS = {"S01", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10", "S11", "S12"}
CARD_TYPES = {"number", "title", "checklist", "quote", "entry"}
BANNED = [
    r"game[- ]?changer", r"revolution", r"guarantee", r"100\s?%", r"best ever", r"\bfree\b", r"no credit card",
    r"\bviral\b", r"as seen on", r"thousands of (couples|weddings)", r"millions of", r"\bstudies show\b",
    r"\bresearch shows\b", r"\bexperts say\b", r"\bunlock\b", r"supercharge", r"seamless", r"cutting[- ]edge",
    r"nobody tells you", r"\bwedding planner\b.*\bI am\b", r"when i planned", r"my clients", r"our couples",
    r"couples love", r"brides love", r"\bi('ve| have) planned\b", r"\bi used\b", r"in my years",
    r"delivered on whatsapp", r"qr code in your invitation", r"every guest gets a qr", r"twelve openings",
    r"pdf album", r"import your (guest )?list", r"automatic(ally)? (chase|follow)", r"works offline\b",
    r"100% offline", r"encrypted", r"hosted in europe", r"gdpr", r"full refund", r"no commission",
    r"no hidden fees", r"thirty seconds", r"three taps", r"two seconds", r"three seconds",
]
REQUIRED = ["id", "day", "slot", "series", "look", "voiceover", "beats", "caption", "hashtags", "hook",
            "cta", "next_teaser", "claims_review", "sources"]
ASSET_NORAH = re.compile(r"^L(10|[1-9])-S[1-8]$")


def words(s: str) -> int:
    return len(re.findall(r"[A-Za-z0-9’'\-]+", s))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--glob", default="D*.json")
    a = ap.parse_args()
    d = Path(a.dir)
    errs, warns, rows = [], [], []
    files = sorted(d.glob(a.glob))
    if not files:
        raise SystemExit(f"no files matching {a.glob} in {d}")
    seen = set()
    for f in files:
        try:
            j = json.loads(f.read_text())
        except Exception as e:  # noqa: BLE001
            errs.append(f"{f.name}: invalid JSON ({e})")
            continue
        vid = j.get("id", f.stem)
        e0 = len(errs)
        if f.stem != vid:
            errs.append(f"{vid}: file name {f.name} != id")
        for k in REQUIRED:
            if k not in j:
                errs.append(f"{vid}: missing field {k}")
        if vid in seen:
            errs.append(f"{vid}: duplicate id")
        seen.add(vid)
        if j.get("series") not in SERIES:
            errs.append(f"{vid}: series must be one of {sorted(SERIES)}")
        vo = j.get("voiceover", "")
        beats = j.get("beats", [])
        joined = " ".join(b.get("vo", "").strip() for b in beats)
        norm = lambda s: re.sub(r"\s+", " ", s).strip()  # noqa: E731
        if norm(joined) != norm(vo):
            errs.append(f"{vid}: voiceover != concatenation of beats[].vo")
        wc = words(vo)
        if not (MIN_WORDS <= wc <= MAX_WORDS):
            errs.append(f"{vid}: {wc} words (need {MIN_WORDS}-{MAX_WORDS})")
        if not (MIN_BEATS <= len(beats) <= MAX_BEATS):
            errs.append(f"{vid}: {len(beats)} beats (need {MIN_BEATS}-{MAX_BEATS})")
        kinds = {"NORAH": 0, "DECOR": 0, "SCREEN": 0, "CARD": 0}
        norah_assets, decor_assets = set(), set()
        run_kind, run_len = None, 0
        for i, b in enumerate(beats, 1):
            bw = words(b.get("vo", ""))
            if not (3 <= bw <= 22):
                warns.append(f"{vid} beat {i}: {bw} words")
            vis = b.get("visual")
            vl = vis if isinstance(vis, list) else [vis]
            first_kind = None
            for v in vl:
                if not isinstance(v, dict) or v.get("kind") not in kinds:
                    errs.append(f"{vid} beat {i}: bad visual {str(v)[:80]}")
                    continue
                k = v["kind"]
                first_kind = first_kind or k
                kinds[k] += 1
                if k == "NORAH":
                    asset = v.get("asset", "")
                    norah_assets.add(asset)
                    if not ASSET_NORAH.match(asset):
                        errs.append(f"{vid} beat {i}: bad NORAH asset {asset!r}")
                    elif asset.split("-")[0] != j.get("look"):
                        errs.append(f"{vid} beat {i}: NORAH {asset} outside look {j.get('look')}")
                elif k == "DECOR":
                    decor_assets.add(v.get("asset", ""))
                    if not v.get("prompt") or not v.get("asset"):
                        errs.append(f"{vid} beat {i}: DECOR needs asset+prompt")
                    elif re.search(r"\b(woman|man|people|person|bride|groom|couple|face|guests?)\b", v["prompt"].lower()):
                        errs.append(f"{vid} beat {i}: DECOR prompt must not contain people")
                elif k == "CARD":
                    c = v.get("card") or {}
                    if c.get("type") not in CARD_TYPES or not (c.get("text") or c.get("items")):
                        errs.append(f"{vid} beat {i}: bad CARD {str(c)[:80]}")
                    elif c.get("type") in ("number", "entry") and not str(c.get("n", "")).strip():
                        errs.append(f"{vid} beat {i}: {c['type']} card needs the numeral field n")
                elif k == "SCREEN":
                    if v.get("asset") not in SCREEN_IDS:
                        errs.append(f"{vid} beat {i}: SCREEN asset {v.get('asset')!r} not in catalog")
            if first_kind == run_kind:
                run_len += 1
                if run_len > 2:
                    warns.append(f"{vid} beat {i}: >2 consecutive {first_kind}")
            else:
                run_kind, run_len = first_kind, 1
            if b.get("overlay") and words(b["overlay"]) > 9:
                warns.append(f"{vid} beat {i}: overlay > 9 words")
        if len(decor_assets) > 9:
            warns.append(f"{vid}: {len(decor_assets)} unique DECOR (budget 9)")
        if not (5 <= kinds["NORAH"] <= 11):
            warns.append(f"{vid}: {kinds['NORAH']} NORAH beats (target 5-11)")
        low = vo.lower()
        for pat in BANNED:
            if re.search(pat, low):
                errs.append(f"{vid}: banned phrase /{pat}/ in voiceover")
        if len(re.findall(r"(part|step|one) people skip", low)) > 2:
            warns.append(f"{vid}: re-hook line 'people skip' used more than twice (brief: at ~40 s and ~70 s)")
        if re.search(r"\d", vo):
            errs.append(f"{vid}: digits in voiceover (spell numbers out for TTS)")
        if not re.search(r"\bai (host|character)\b|\bai-generated\b", low):
            errs.append(f"{vid}: voiceover must disclose that Norah is an AI host/character")
        if j.get("series") == "NOTEBOOK":
            if not j.get("fiction"):
                errs.append(f"{vid}: NOTEBOOK needs \"fiction\": true")
            if "the story is fiction" not in low:
                errs.append(f"{vid}: NOTEBOOK voiceover must contain 'The story is fiction'")
        h = j.get("hashtags", [])
        if not (3 <= len(h) <= 5) or any(not x.startswith("#") for x in h):
            errs.append(f"{vid}: hashtags must be 3-5 items starting with #")
        elif len(h) != 5:
            warns.append(f"{vid}: {len(h)} hashtags (plan is 5)")
        if any(x.lower() in ("#fyp", "#viral", "#foryou", "#foryoupage", "#weddybird", "#weddy") for x in h):
            errs.append(f"{vid}: forbidden hashtag")
        cap = j.get("caption", "")
        if len(cap) > 420:
            warns.append(f"{vid}: caption {len(cap)} chars")
        hook = j.get("hook", {})
        if words(hook.get("spoken", "")) > 14:
            warns.append(f"{vid}: hook longer than 14 words")
        if beats and not norm(vo).lower().startswith(norm(hook.get("spoken", "x")).lower()[:22]):
            errs.append(f"{vid}: voiceover must start with hook.spoken")
        cr = j.get("claims_review", {})
        for n in cr.get("numbers_used", []):
            if not (isinstance(n, dict) and n.get("source") and n.get("r2_id")):
                errs.append(f"{vid}: numbers_used entries need {{figure, source, r2_id}}")
                break
        rows.append((vid, wc, round(wc / WPS), len(beats), kinds["NORAH"], len(norah_assets), kinds["DECOR"],
                     len(decor_assets), kinds["SCREEN"], kinds["CARD"], len(re.findall(r"wedillybird", low)),
                     "ERR" if len(errs) > e0 else "ok"))
    print(f"{'id':8s} {'words':>5s} {'~sec':>5s} {'beats':>5s} {'nor':>4s} {'uN':>3s} {'dec':>4s} {'uD':>3s} {'scr':>4s} {'card':>4s} {'brand':>5s}  status")
    for r in rows:
        print(f"{r[0]:8s} {r[1]:5d} {r[2]:5d} {r[3]:5d} {r[4]:4d} {r[5]:3d} {r[6]:4d} {r[7]:3d} {r[8]:4d} {r[9]:4d} {r[10]:5d}  {r[11]}")
    for w in warns:
        print("WARN ", w)
    for e in errs:
        print("ERROR", e)
    print(f"\n{len(rows)} videos, {len(errs)} errors, {len(warns)} warnings")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
