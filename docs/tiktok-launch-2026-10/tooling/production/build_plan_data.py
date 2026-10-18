#!/usr/bin/env python3
"""Aggregate the 30 script JSON files into plan data for the dashboard and the repo calendar.

usage: build_plan_data.py [--out plan] [--start 2026-11-02]
Writes <out>/plan.json (everything the dashboard needs) and <out>/calendar.md (human table).
"""
import argparse
import datetime as dt
import json
import re
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts" if (ROOT / "scripts").is_dir() else ROOT.parent / "scripts"
SERIES_LABEL = {
    "QUIET_LIST": "The Quiet List",
    "COPY_PASTE_SEND": "Copy, Paste, Send",
    "NOTEBOOK": "Norah's Notebook",
    "INSIDE": "Inside Wedillybird",
}
LOOKS = {
    "L1": "Camel & crème, Paris le matin", "L2": "Cardigan sauge, bureau", "L3": "Trench pierre & écharpe blush, marché aux fleurs",
    "L4": "Maille écrue & manteau anthracite, château", "L5": "Bordeaux, café du soir", "L6": "Manteau noir & écharpe ivoire, heure bleue",
    "L7": "Manteau blush, visite de lieu", "L8": "Cocooning ivoire, maison", "L9": "Doudoune sauge, campagne",
    "L10": "Satin champagne & camel, soirée",
}
SLOT_ET = {"A": (12, 30), "B": (19, 30)}


def local(day: dt.date, slot: str, tz: str) -> dt.datetime:
    h, m = SLOT_ET[slot]
    et = dt.datetime(day.year, day.month, day.day, h, m, tzinfo=ZoneInfo("America/New_York"))
    return et.astimezone(ZoneInfo(tz))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "plan"))
    ap.add_argument("--start", default="2026-11-02")
    a = ap.parse_args()
    start = dt.date.fromisoformat(a.start)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    vids = []
    for f in sorted(SCRIPTS.glob("D*.json")):
        j = json.loads(f.read_text())
        decor, screens, cards, norah = set(), [], 0, 0
        for b in j["beats"]:
            for v in b["visual"] if isinstance(b["visual"], list) else [b["visual"]]:
                k = v["kind"]
                if k == "DECOR":
                    decor.add(v["asset"])
                elif k == "SCREEN":
                    screens.append(v["asset"])
                elif k == "CARD":
                    cards += 1
                elif k == "NORAH":
                    norah += 1
        cr = j.get("claims_review", {})
        vids.append({
            "id": j["id"], "day": j["day"], "slot": j["slot"], "series": j["series"], "seriesLabel": SERIES_LABEL[j["series"]],
            "episode": j.get("episode"), "fiction": bool(j.get("fiction")), "title": j["working_title"], "pillar": j.get("pillar"),
            "searchIntent": j.get("search_intent"),
            "hook": j["hook"]["spoken"], "hookOnScreen": j["hook"].get("on_screen"), "look": j["look"], "lookLabel": LOOKS.get(j["look"], j["look"]),
            "voiceover": j["voiceover"], "words": j["word_count"], "seconds": round(j["word_count"] / 2.75 + 2.4),
            "caption": j["caption"], "hashtags": j["hashtags"], "keywords": j.get("keywords", []),
            "pinned": j.get("pinned_comment", ""), "bait": j.get("comment_bait", ""), "cta": j["cta"], "teaser": j["next_teaser"],
            "screens": sorted(set(screens)), "screenBeats": len(screens), "cardBeats": cards, "norahBeats": norah,
            "decorTotal": len(decor), "decorDone": sum((ROOT / "assets" / "decor" / f"{d}.jpg").exists() for d in decor),
            "needsProof": cr.get("needs_proof", []), "notes": cr.get("notes", ""),
            "numbers": cr.get("numbers_used", []),
            "sources": [{k: s.get(k) for k in ("publisher", "title", "url", "date")} for s in j.get("sources", [])],
        })
    vids.sort(key=lambda v: (v["day"], v["slot"]))
    plan = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "defaultStart": a.start, "videos": vids}
    (out / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1))

    lines = ["# Calendrier — 15 jours, 2 vidéos par jour", "",
             f"Date de départ proposée : **{start.strftime('%A %d %B %Y')}** (modifiable : décaler toutes les dates d'autant).",
             "Créneaux : A = 12:30 heure de New York (recherche, evergreen) · B = 19:30 heure de New York (rendez-vous du soir).",
             "Heures indiquées pour Paris, calculées avec les changements d'heure (fuseaux IANA).", "",
             "| Jour | Date | Créneau | Paris | New York | ID | Série | Titre de travail | Durée estimée | Look |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for v in vids:
        d = start + dt.timedelta(days=v["day"] - 1)
        p = local(d, v["slot"], "Europe/Paris")
        lines.append(f"| {v['day']} | {d.strftime('%a %d/%m')} | {v['slot']} | {p.strftime('%H:%M')}{' (+1 j)' if p.date() > d else ''} | "
                     f"{SLOT_ET[v['slot']][0]:02d}:{SLOT_ET[v['slot']][1]:02d} | {v['id']} | {v['seriesLabel']} | {v['title']} | "
                     f"~{v['seconds']} s | {v['look']} |")
    (out / "calendar.md").write_text("\n".join(lines) + "\n")
    tot_d, done_d = sum(v["decorTotal"] for v in vids), sum(v["decorDone"] for v in vids)
    print(f"{len(vids)} videos, decor {done_d}/{tot_d}, plan.json {len(json.dumps(plan)) // 1024} KB -> {out}")


if __name__ == "__main__":
    main()
