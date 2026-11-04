import { convexApi, getConvexServerClient } from '@/lib/auth/convex-server';
import { isQrToken } from '@/lib/guests/qr';
import { renderQrPng } from '@/lib/guests/qr-render';

export const runtime = 'nodejs';

/**
 * GET /api/qr/<jeton> — image PNG du QR d'entrée d'un invité.
 *
 * Publique, sans session : WhatsApp doit pouvoir télécharger l'image pour
 * l'en-tête du message, et l'invité l'affiche depuis sa page. Le jeton est le
 * secret (12 caractères tirés avec `crypto.getRandomValues`) — comme sur
 * `/i/<jeton>`, qui ouvre déjà toute la fiche. On ne rend le QR que pour un
 * invité qui existe, sur un événement ni annulé ni archivé : la route ne sert
 * pas de générateur de QR générique.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;
  if (!isQrToken(token)) return notFound();

  let guest: unknown;
  try {
    guest = await getConvexServerClient().query(convexApi.getGuestByToken, { token });
  } catch {
    return new Response('UNAVAILABLE', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!guest) return notFound();

  const png = await renderQrPng(token);
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // Contenu entièrement déterminé par le jeton : cache long, partagé OK.
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function notFound(): Response {
  return new Response('NOT_FOUND', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
