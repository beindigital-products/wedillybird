import { expect, test } from '@playwright/test';
import { callConvex, signInByEmail, useMemBackend } from './utils/mem-backend';

/**
 * Le parcours « ticketing seul », dans un vrai navigateur contre les vraies
 * fonctions Convex : une liste déjà confirmée ailleurs est importée, chaque
 * invité a un QR qui s'affiche et se télécharge, le panneau d'envoi par WhatsApp
 * fonctionne, et l'invité retrouve son QR sur sa propre page.
 *
 * Le backend de test est en mode simulation (`E2E_MODE`) : l'envoi n'envoie rien
 * et ne marque personne — un essai à blanc ne doit jamais empêcher le vrai envoi.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@wedillybird.test';
const OWNER_EMAIL = 'daba@test.fr';

const CSV = [
  'Nom;Téléphone;Email',
  'Aminata Diallo;06 12 34 56 78;aminata@exemple.com',
  'Kwame Mensah;+233 20 123 4567;',
  'Sans numéro;;',
].join('\n');

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

async function userId(email: string): Promise<string> {
  const user = await callConvex<{ _id: string } | null>('query', 'auth:_userByEmail', { email });
  if (!user) throw new Error(`${email} introuvable`);
  return user._id;
}

test.describe('Ticketing : QR et envoi', () => {
  useMemBackend();

  test('de la liste importée au QR de l’invité', async ({ page, browser }) => {
    /* ---- Un événement publié (forfait offert par l'admin) ---- */
    const adminPage = await (await browser.newContext()).newPage();
    await signInByEmail(adminPage, ADMIN_EMAIL);
    await signInByEmail(page, OWNER_EMAIL);
    const ownerId = await userId(OWNER_EMAIL);
    const { id: eventId } = await callConvex<{ id: string }>('mutation', 'events:create', {
      ownerId,
      title: 'Mariage de Daba',
      partnerA: 'Daba',
      partnerB: 'Moussa',
      eventDate: Date.now() + 45 * 24 * 60 * 60 * 1000,
      timezone: 'Europe/Paris',
    });
    await callConvex('mutation', 'admin:grantEventPlan', {
      adminId: await userId(ADMIN_EMAIL),
      eventId,
      reason: 'test e2e',
    });
    await callConvex('mutation', 'events:publish', { eventId, requesterId: ownerId });

    /* ---- Import d'une liste déjà confirmée ---- */
    await page.goto(`/events/${eventId}/guests`);
    await expect(async () => {
      await page.getByTestId('import-open').click();
      await expect(page.getByTestId('guests-import')).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByTestId('import-paste').fill(CSV);
    await page.getByTestId('import-parse').click();
    await page.getByTestId('import-confirmed').click();
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('import-result')).toBeVisible();
    await expect(page.getByTestId('guest-row')).toHaveCount(3);

    /* ---- Le panneau d'envoi voit 3 confirmés, 2 joignables, 1 sans numéro ---- */
    await expect(page.getByTestId('tickets-progress')).toContainText(
      '0 sur 3 invités confirmés ont reçu leur QR code',
    );
    await expect(page.getByTestId('tickets-hint-nophone')).toContainText('1 invité confirmé');
    await expect(page.getByTestId('tickets-send')).toContainText('Envoyer 2 QR codes');

    /* ---- Chaque invité a un QR qui s'affiche réellement ---- */
    const aminata = page.getByTestId('guest-row').filter({ hasText: 'Aminata Diallo' });
    await aminata.getByTestId('guest-qr-open').click();
    const qr = page.getByTestId('guest-qr-image');
    await expect(qr).toBeVisible();
    await expect
      .poll(() => qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    await expect(page.getByTestId('guest-qr-download')).toHaveAttribute(
      'download',
      'qr-aminata-diallo.png',
    );
    await page.keyboard.press('Escape');

    /* ---- La route d'image : PNG pour un invité, 404 sinon ---- */
    const guests = await callConvex<Array<{ fullName: string; qrCodeToken: string }>>(
      'query',
      'guests:listByEvent',
      { eventId, requesterId: ownerId },
    );
    const token = guests.find((g) => g.fullName === 'Aminata Diallo')!.qrCodeToken;

    const ok = await page.request.get(`/api/qr/${token}`);
    expect(ok.status()).toBe(200);
    expect(ok.headers()['content-type']).toBe('image/png');
    expect([...(await ok.body()).subarray(0, 4)]).toEqual(PNG_SIGNATURE);
    expect((await page.request.get('/api/qr/ZZZZZZZZZZZZ')).status()).toBe(404);
    expect((await page.request.get('/api/qr/pas-un-jeton')).status()).toBe(404);

    /* ---- Envoi : le backend de test est en mode simulation ---- */
    await page.getByTestId('tickets-send').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Aucune invitation ni demande de confirmation');
    await dialog.getByRole('button', { name: /envoyer 2 qr codes/i }).click();
    const outcome = page.getByTestId('tickets-outcome');
    await expect(outcome).toContainText("Mode simulation : 2 messages simulés, rien n'est parti.");
    // Un essai à blanc ne marque personne : pas de badge « QR envoyé », et le
    // bouton reste disponible pour le vrai envoi.
    await expect(page.getByTestId('guest-ticket-sent')).toHaveCount(0);
    await expect(page.getByTestId('tickets-send')).toContainText('Envoyer 2 QR codes');
    await expect(page.getByTestId('tickets-send')).toBeEnabled();

    /* ---- Côté invité : sa page affiche son propre QR ---- */
    const guestPage = await (await browser.newContext()).newPage();
    await guestPage.goto(`/i/${token}`);
    const mine = guestPage.getByTestId('rsvp-qr').locator('img');
    await expect(mine).toHaveAttribute('src', `/api/qr/${token}`);
    await expect
      .poll(() => mine.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
  });
});
