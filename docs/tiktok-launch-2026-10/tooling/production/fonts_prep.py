#!/usr/bin/env python3
"""Instantiate static Bodoni Moda Italic cuts from the variable font (libass + PIL friendly).

usage: fonts_prep.py <fonts_dir>
Reads  <fonts_dir>/BodoniModa-Italic-VF.ttf
Writes <fonts_dir>/BodoniModa-Italic-Display.ttf (opsz 72, wght 500)
       <fonts_dir>/BodoniModa-Italic-Text.ttf    (opsz 18, wght 600)
"""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


def main() -> None:
    d = Path(sys.argv[1])
    src = d / "BodoniModa-Italic-VF.ttf"
    for name, opsz, wght, family in (
        ("Display", 72, 500, "Bodoni Moda Display"),
        ("Text", 18, 600, "Bodoni Moda Text"),
    ):
        f = TTFont(src)
        inst = instancer.instantiateVariableFont(f, {"opsz": opsz, "wght": wght})
        # give each cut its own family so libass can address it unambiguously
        for rec in inst["name"].names:
            if rec.nameID in (1, 16):
                rec.string = family
            elif rec.nameID in (2, 17):
                rec.string = "Italic"
            elif rec.nameID == 4:
                rec.string = f"{family} Italic"
            elif rec.nameID == 6:
                rec.string = f"{family.replace(' ', '')}-Italic"
        out = d / f"BodoniModa-Italic-{name}.ttf"
        inst.save(out)
        print("wrote", out)


if __name__ == "__main__":
    main()
