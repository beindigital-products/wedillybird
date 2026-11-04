// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { generateQrToken } from '../../../convex/lib/qrToken';
import { isQrToken, qrImagePath, qrImageUrl } from '@/lib/guests/qr';
import { QR_PNG_SIZE, renderQrPng } from '@/lib/guests/qr-render';

/**
 * Rendre puis relire un PNG de 640 px est du calcul pur : ~0,2 s par image, ~1 s
 * sous couverture sur une machine de CI. La limite par défaut de 5 s ne laisse
 * aucune marge — on la relève explicitement pour les tests qui touchent à l'image.
 */
const IMAGE_TEST_TIMEOUT = 30_000;

/** Bornes de l'alphabet des jetons (premier/dernier caractère de chaque famille). */
const EDGE_TOKENS = ['AAAAAAAAAAAA', 'ZZZZZZZZZZZZ', '222222222222', '999999999999'];

const queryMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/convex-server', () => ({
  convexApi: { getGuestByToken: 'getGuestByToken' },
  getConvexServerClient: () => ({ query: (...a: unknown[]) => queryMock(...a) }),
}));

/** Relit un PNG avec un décodeur QR indépendant — ce que ferait un scanner. */
function decode(png: Buffer): string | null {
  const { data, width, height } = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(data), width, height)?.data ?? null;
}

describe('jeton QR', () => {
  it('reconnaît tous les jetons produits par le générateur', () => {
    for (let i = 0; i < 500; i++) expect(isQrToken(generateQrToken())).toBe(true);
  });

  it('accepte un jeton de 12 caractères de l’alphabet et refuse la chaîne vide', () => {
    expect(isQrToken('ABCDEFGHJKMN')).toBe(true);
    expect(isQrToken('')).toBe(false);
  });

  it.each([
    'abcdefghjkmn', // minuscules
    'ABCDEFGHJKM', // 11 caractères
    'ABCDEFGHJKMNP', // 13 caractères
    'ABCDEFGHIKMN', // « I » exclu de l'alphabet
    'ABCDEFGHJKML', // « L » exclu
    'ABCDEFGHJKMO', // « O » exclu
    'ABCDEFGHJKM0', // « 0 » exclu
    'ABCDEFGHJKM1', // « 1 » exclu
    '../../etc/pw',
    'ABCDEFGHJKM%',
  ])('refuse « %s »', (value) => {
    expect(isQrToken(value)).toBe(false);
  });

  it('construit le chemin et l’URL absolue de l’image', () => {
    expect(qrImagePath('ABCDEFGHJKMN')).toBe('/api/qr/ABCDEFGHJKMN');
    expect(qrImageUrl('https://wedillybird.com/', 'ABCDEFGHJKMN')).toBe(
      'https://wedillybird.com/api/qr/ABCDEFGHJKMN',
    );
  });
});

describe('renderQrPng', () => {
  it('produit un PNG carré de la taille prévue', async () => {
    const png = await renderQrPng('ABCDEFGHJKMN');
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const { width, height } = PNG.sync.read(png);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(QR_PNG_SIZE - 40);
  });

  it(
    'se relit : le scanner retrouve exactement le jeton',
    async () => {
      // Les bornes de l'alphabet + quelques jetons tirés comme en production.
      const tokens = [...EDGE_TOKENS, ...Array.from({ length: 4 }, () => generateQrToken())];
      for (const token of tokens) {
        expect(decode(await renderQrPng(token))).toBe(token);
      }
    },
    IMAGE_TEST_TIMEOUT,
  );

  it(
    'reste lisible quand l’image est réduite (aperçu WhatsApp, écran éloigné)',
    async () => {
      const token = generateQrToken();
      const big = PNG.sync.read(await renderQrPng(token));
      // Sous-échantillonnage ×3 au plus proche voisin.
      const f = 3;
      const w = Math.floor(big.width / f);
      const small = new PNG({ width: w, height: w });
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const s = (y * f * big.width + x * f) * 4;
          const d = (y * w + x) * 4;
          small.data[d] = big.data[s]!;
          small.data[d + 1] = big.data[s + 1]!;
          small.data[d + 2] = big.data[s + 2]!;
          small.data[d + 3] = 255;
        }
      }
      expect(decode(PNG.sync.write(small))).toBe(token);
    },
    IMAGE_TEST_TIMEOUT,
  );

  it(
    'donne deux images distinctes pour deux jetons distincts',
    async () => {
      const a = await renderQrPng('ABCDEFGHJKMN');
      const b = await renderQrPng('NMKJHGFEDCBA');
      expect(a.equals(b)).toBe(false);
    },
    IMAGE_TEST_TIMEOUT,
  );
});

describe('GET /api/qr/[token]', () => {
  async function call(token: string) {
    const { GET } = await import('@/app/api/qr/[token]/route');
    return GET(new Request('http://localhost/api/qr/' + token), {
      params: Promise.resolve({ token }),
    });
  }

  it(
    'sert le PNG d’un invité existant, avec un cache long',
    async () => {
      queryMock.mockResolvedValueOnce({ guest: { _id: 'g1' }, event: { _id: 'e1' } });
      const token = generateQrToken();
      const res = await call(token);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
      expect(res.headers.get('Cache-Control')).toContain('immutable');
      expect(decode(Buffer.from(await res.arrayBuffer()))).toBe(token);
    },
    IMAGE_TEST_TIMEOUT,
  );

  it('répond 404 pour un jeton mal formé, sans interroger la base', async () => {
    queryMock.mockClear();
    const res = await call('pas-un-jeton');
    expect(res.status).toBe(404);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('répond 404 pour un invité inconnu ou un événement annulé', async () => {
    queryMock.mockResolvedValueOnce(null);
    const res = await call(generateQrToken());
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('répond 503 sans cache si la base est injoignable', async () => {
    queryMock.mockRejectedValueOnce(new Error('down'));
    const res = await call(generateQrToken());
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
