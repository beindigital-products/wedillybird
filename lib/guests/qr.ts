/**
 * QR d'entrée d'un invité — helpers purs (importables côté client ET Convex).
 *
 * Le QR encode le jeton brut de l'invité (`guests.qrCodeToken`, 12 caractères) :
 * c'est exactement ce que lit le scanner du check-in. Un lien vers la page
 * d'invitation aurait ouvert, chez un invité qui a déjà répondu ailleurs, un
 * formulaire de RSVP dont il n'a que faire.
 *
 * Le rendu de l'image est dans `qr-render.ts` (serveur seul : il embarque la
 * librairie `qrcode`).
 */

/**
 * Jeton valide : 12 caractères de l'alphabet de `convex/lib/qrToken.ts`
 * (A–Z sans I, L, O, et 2–9). Sert à refuser d'emblée toute autre entrée sur la
 * route d'image, sans interroger la base.
 */
export const QR_TOKEN_PATTERN = /^[A-HJKMNP-Z2-9]{12}$/;

export function isQrToken(value: string): boolean {
  return QR_TOKEN_PATTERN.test(value);
}

/** Chemin de l'image QR d'un invité, relatif à l'origine de l'app. */
export function qrImagePath(token: string): string {
  return `/api/qr/${token}`;
}

/** URL absolue de l'image — celle que WhatsApp télécharge pour l'en-tête du message. */
export function qrImageUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}${qrImagePath(token)}`;
}
