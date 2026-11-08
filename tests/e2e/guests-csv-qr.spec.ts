import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { callConvex, signInByEmail, useMemBackend } from './utils/mem-backend';

/**
 * Le parcours d'une cliente, de bout en bout, dans un vrai navigateur et contre
 * les vraies fonctions Convex (backend en mémoire) :
 *
 *   import CSV de la liste → l'invitée confirme sa présence → son QR s'affiche
 *   → on RELIT ce QR avec un décodeur → le check-in l'accepte.
 *
 * Le QR n'est pas vérifié sur sa seule présence dans le DOM : il est dessiné
 * dans un canvas puis décodé, comme le ferait un lecteur. Un QR décoratif ou
 * mal formé échouerait ici.
 */

const OWNER_EMAIL = 'daba@test.fr';

const CSV = [
  'Nom;Téléphone;Email;Accompagnants',
  'Aminata Diallo;06 12 34 56 78;;2',
  'Moussa Sow;+221 77 123 45 67;moussa@exemple.com;0',
  'Aminata D.;0612345678;;0', // même téléphone qu'Aminata : doublon
  'Mauvais Email;;pas-un-email;0', // email invalide : à corriger
].join('\n');

interface GuestRow {
  fullName: string;
  qrCodeToken: string;
  plusOnesAllowed: number;
  phone?: string;
}

test.describe('Import CSV → RSVP → QR → check-in', () => {
  useMemBackend();

  test('de la liste importée au QR relu par le check-in', async ({ page, browser }) => {
    /* ---------- 0. Un compte et un mariage ---------- */
    const { userId } = await callConvex<{ userId: string }>('mutation', 'seed:seedEmailOnlyUser', {
      email: OWNER_EMAIL,
    });
    const { id: eventId } = await callConvex<{ id: string }>('mutation', 'events:create', {
      ownerId: userId,
      title: 'Mariage de test',
      partnerA: 'Daba',
      partnerB: 'Alioune',
      eventDate: Date.now() + 90 * 24 * 3600 * 1000,
      timezone: 'Europe/Paris',
    });
    await signInByEmail(page, OWNER_EMAIL);

    /* ---------- 1. Import CSV ---------- */
    await page.goto(`/events/${eventId}/guests`);
    await expect(page.getByTestId('guest-row')).toHaveCount(0);

    // Composant client : un clic avant l'hydratation ne fait rien.
    const open = page.getByTestId('open-guests-import');
    await expect(async () => {
      await open.click();
      await expect(page.getByTestId('guests-csv-import')).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    await page.getByTestId('guests-csv-paste').fill(CSV);
    await page.getByTestId('guests-csv-parse').click();

    // Aperçu : 2 à importer, 1 doublon, 1 erreur. Les numéros sont normalisés.
    const importer = page.getByTestId('guests-csv-import');
    await expect(importer.getByText('+33612345678').first()).toBeVisible();
    await expect(importer.getByText('+221771234567 · moussa@exemple.com')).toBeVisible();
    await expect(importer.getByText(/doublon/i)).toBeVisible();
    await expect(importer.getByText(/ligne 5/i)).toBeVisible();

    await page.getByTestId('guests-csv-import-submit').click();
    await expect(page.getByTestId('guests-csv-result')).toBeVisible();
    await expect(page.getByTestId('guests-csv-result')).toContainText('2');

    // La liste se met à jour toute seule, sans rechargement manuel.
    await page
      .getByTestId('guests-csv-result')
      .getByRole('button', { name: /fermer/i })
      .click();
    await expect(page.getByTestId('guest-row')).toHaveCount(2);

    /* ---------- 2. Ce que la base a reçu ---------- */
    const guests = await callConvex<GuestRow[]>('query', 'guests:listByEvent', {
      eventId,
      requesterId: userId,
    });
    expect(guests.map((g) => g.fullName).sort()).toEqual(['Aminata Diallo', 'Moussa Sow']);
    const aminata = guests.find((g) => g.fullName === 'Aminata Diallo')!;
    expect(aminata).toMatchObject({ phone: '+33612345678', plusOnesAllowed: 2 });
    expect(aminata.qrCodeToken).toMatch(/^[A-Z2-9]{12}$/);

    /* ---------- 3. L'invitée, anonyme, confirme sa présence ---------- */
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`/i/${aminata.qrCodeToken}`);

    // Pas de QR tant qu'elle n'a pas répondu.
    await expect(guestPage.getByTestId('rsvp-form')).toBeVisible();
    await expect(guestPage.getByTestId('guest-qr-section')).toHaveCount(0);

    // Le radio est masqué (`sr-only`) : on clique l'étiquette visible, comme un invité.
    const attending = guestPage.getByTestId('rsvp-option-attending');
    const attendingLabel = guestPage.locator('label').filter({ has: attending });
    await expect(async () => {
      await attendingLabel.click();
      await expect(attending).toBeChecked({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await guestPage.getByTestId('submit-rsvp').click();
    await expect(guestPage.getByTestId('rsvp-success')).toBeVisible();

    /* ---------- 4. Le QR s'affiche et se décode ---------- */
    // Le QR apparaît tout seul après la réponse : l'action serveur revalide la
    // page, l'invitée n'a rien à recharger.
    const qr = guestPage.getByTestId('guest-qr');
    await expect(qr).toBeVisible();
    await expect(guestPage.getByTestId('guest-qr-section')).toContainText(aminata.qrCodeToken);

    const pixels = await qr.evaluate(async (svg) => {
      const px = 330;
      const xml = new XMLSerializer().serializeToString(svg);
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
      const img = new Image();
      img.width = px;
      img.height = px;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('svg non chargeable'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, px, px);
      URL.revokeObjectURL(url);
      return { px, data: Array.from(ctx.getImageData(0, 0, px, px).data) };
    });
    const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.px, pixels.px);
    expect(decoded?.data, 'le QR affiché doit se décoder').toBe(aminata.qrCodeToken);
    await guestContext.close();

    /* ---------- 5. Le check-in accepte ce qui a été décodé ---------- */
    await page.goto(`/events/${eventId}/check-in`);
    const manual = page.getByTestId('manual-token');
    await expect(manual).toBeVisible();
    await expect(async () => {
      await manual.fill(decoded!.data);
      await page.getByTestId('manual-submit').click();
      await expect(page.getByTestId('toast').first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId('toast').first()).toContainText('Aminata Diallo');
    await expect(page.getByTestId('toast').first()).toContainText('+2');
  });
});
