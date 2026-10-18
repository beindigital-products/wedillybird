#!/usr/bin/env python3
"""Compact review view of script JSON files (no visual prompts): hook, VO, overlays, caption, tags, claims.

usage: review_view.py <file.json> [...]
"""
import json
import sys
from pathlib import Path


def main() -> None:
    short = "-s" in sys.argv
    for p in [a for a in sys.argv[1:] if a != "-s"]:
        j = json.loads(Path(p).read_text())
        print("=" * 100)
        print(f"{j['id']}  series={j['series']} ep={j.get('episode')} look={j['look']} pillar={j.get('pillar')} hook_id={j.get('hook_id')}")
        print(f"TITLE: {j.get('working_title')}")
        print(f"HOOK: {j['hook']['spoken']}  |  ON-SCREEN: {j['hook'].get('on_screen')}")
        print(f"VO ({j.get('word_count')}w): {j['voiceover']}")
        if short:
            cr = j.get('claims_review', {})
            print("NEEDS_PROOF:", json.dumps(cr.get('needs_proof'), ensure_ascii=False))
            print("NOTES:", cr.get('notes'))
            print("TEASER:", j['next_teaser'], "| CTA:", j['cta'])
            continue
        ov = [(b['n'], b['overlay']) for b in j['beats'] if b.get('overlay')]
        print("OVERLAYS:", "; ".join(f"{n}:{t}" for n, t in ov))
        cards = []
        for b in j['beats']:
            vis = b['visual'] if isinstance(b['visual'], list) else [b['visual']]
            for v in vis:
                if v['kind'] == 'CARD':
                    c = v['card']
                    cards.append(f"{b['n']}:{c['type']}:{c.get('text') or c.get('items')}|{c.get('sub','')}")
                elif v['kind'] == 'SCREEN':
                    cards.append(f"{b['n']}:SCREEN:{v.get('asset')}")
        print("CARDS/SCREENS:", " ; ".join(cards))
        print(f"CTA: {j['cta']}")
        print(f"TEASER: {j['next_teaser']}")
        print(f"CAPTION: {j['caption']!r}")
        print(f"TAGS: {' '.join(j['hashtags'])}   KEYWORDS: {j.get('keywords')}")
        print(f"PINNED: {j.get('pinned_comment')!r}")
        print(f"BAIT: {j.get('comment_bait')}")
        print(f"R2: {j.get('r2_items')}")
        cr = j.get('claims_review', {})
        print("NUMBERS:", json.dumps(cr.get('numbers_used'), ensure_ascii=False))
        print("NEEDS_PROOF:", json.dumps(cr.get('needs_proof'), ensure_ascii=False))
        print("NOTES:", cr.get('notes'))


if __name__ == '__main__':
    main()
