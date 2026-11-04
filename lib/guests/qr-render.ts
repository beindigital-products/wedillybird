import QRCode from 'qrcode';

/** Côté de l'image en pixels : lisible plein écran à l'accueil, léger pour WhatsApp. */
export const QR_PNG_SIZE = 640;

/**
 * Rend le QR d'un jeton en PNG noir sur blanc, avec la zone de silence de
 * 4 modules exigée par la norme (sans elle certains scanners décrochent). Niveau
 * de correction « M » : un écran de téléphone rayé ou un reflet ne suffisent pas
 * à rendre le code illisible.
 */
export function renderQrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, {
    type: 'png',
    width: QR_PNG_SIZE,
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}
