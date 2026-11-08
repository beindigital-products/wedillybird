import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { QR_QUIET_ZONE, qrModules, qrPathData } from '../../../lib/qr';

/** Rastérise la matrice (fond blanc, zone de silence, `scale` px par module) pour un décodeur. */
function rasterize(modules: boolean[][], scale = 6) {
  const total = modules.length + QR_QUIET_ZONE * 2;
  const px = total * scale;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  modules.forEach((row, my) =>
    row.forEach((dark, mx) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = (mx + QR_QUIET_ZONE) * scale + dx;
          const y = (my + QR_QUIET_ZONE) * scale + dy;
          const i = (y * px + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }),
  );
  return { data, px };
}

describe('qrModules', () => {
  it('renvoie une matrice carrée avec les motifs de repérage aux trois coins', () => {
    const m = qrModules('ABCDEFGHJKMN');
    const n = m.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === n)).toBe(true);
    // Motif de repérage haut-gauche : anneau extérieur plein, anneau intérieur vide, cœur plein.
    expect(m[0]!.slice(0, 7)).toEqual(Array(7).fill(true));
    expect(m[1]!.slice(0, 7)).toEqual([true, false, false, false, false, false, true]);
    expect(m[3]!.slice(0, 7)).toEqual([true, false, true, true, true, false, true]);
    // Les deux autres coins : haut-droit et bas-gauche.
    expect(m[0]!.slice(n - 7)).toEqual(Array(7).fill(true));
    expect(m[n - 7]!.slice(0, 7)).toEqual(Array(7).fill(true));
  });

  it('est déterministe : même texte, même matrice', () => {
    expect(qrModules('ABCDEFGHJKMN')).toEqual(qrModules('ABCDEFGHJKMN'));
    expect(qrModules('ABCDEFGHJKMN')).not.toEqual(qrModules('ABCDEFGHJKMP'));
  });
});

describe('qrPathData', () => {
  it('fusionne les modules adjacents d’une ligne en un seul rectangle', () => {
    expect(
      qrPathData([
        [true, true, false],
        [false, true, true],
      ]),
    ).toBe('M0 0h2v1h-2zM1 1h2v1h-2z');
  });

  it('une matrice vide donne un chemin vide', () => {
    expect(qrPathData([[false, false]])).toBe('');
  });
});

describe('scannabilité', () => {
  it.each(['ABCDEFGHJKMN', 'XYZ234567ABC', 'M2N3P4Q5R6S7'])(
    'un lecteur QR relit exactement le token %s',
    (token) => {
      const { data, px } = rasterize(qrModules(token));
      const decoded = jsQR(data, px, px);
      expect(decoded?.data).toBe(token);
    },
  );
});
