import { expect, test } from '@playwright/test';
import { callConvex, signInByEmail, useMemBackend } from './utils/mem-backend';

/**
 * Import CSV des invités, dans un vrai navigateur, contre les vraies fonctions
 * Convex : de la page « Liste d'invitations » jusqu'aux fiches créées (statut,
 * jeton QR) et au scan à l'entrée.
 */

const OWNER_EMAIL = 'daba@test.fr';

const CSV = [
  'Nom;Téléphone;Email;Catégorie',
  'Aminata Diallo;06 12 34 56 78;aminata@exemple.com;Famille',
  'Kwame Mensah;+233 20 123 4567;;Amis',
  'Sans numéro;;;',
  'Numéro cassé;06 12;;',
].join('\n');

async function ownerAndEvent(): Promise<{ ownerId: string; eventId: string }> {
  const user = await callConvex<{ _id: string } | null>('query', 'auth:_userByEmail', {
    email: OWNER_EMAIL,
  });
  if (!user) throw new Error('propriétaire introuvable');
  const created = await callConvex<{ id: string }>('mutation', 'events:create', {
    ownerId: user._id,
    title: 'Mariage de Daba',
    partnerA: 'Daba',
    partnerB: 'Moussa',
    eventDate: Date.now() + 45 * 24 * 60 * 60 * 1000,
    timezone: 'Europe/Paris',
  });
  return { ownerId: user._id, eventId: created.id };
}

test.describe('Import des invités (CSV)', () => {
  useMemBackend();

  test('importer une liste déjà confirmée, puis scanner à l’entrée', async ({ page }) => {
    await signInByEmail(page, OWNER_EMAIL);
    const { ownerId, eventId } = await ownerAndEvent();

    await page.goto(`/events/${eventId}/guests`);
    await expect(page.getByTestId('import-open')).toBeVisible();

    // L'ouverture est un composant client : on attend l'hydratation.
    await expect(async () => {
      await page.getByTestId('import-open').click();
      await expect(page.getByTestId('guests-import')).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    await page.getByTestId('import-paste').fill(CSV);
    await page.getByTestId('import-parse').click();

    // Aperçu : 4 lignes, dont 1 invalide (numéro cassé), numéros normalisés.
    const rows = page.getByTestId('import-row');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('+33612345678');
    await expect(rows.nth(1)).toContainText('+233201234567');
    await expect(rows.nth(3)).toHaveAttribute('data-status', 'invalid');
    await expect(page.getByTestId('import-run')).toBeEnabled();

    // « Déjà confirmés » : case cochée, import.
    await page.getByTestId('import-confirmed').click();
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('import-result')).toBeVisible();

    // La liste de la page reflète les 3 fiches importées (sans recharger à la main).
    await expect(page.getByTestId('guest-row')).toHaveCount(3);
    await expect(page.getByText('Aminata Diallo')).toBeVisible();

    // Côté backend : 3 invités, confirmés, avec un jeton QR unique chacun.
    const guests = await callConvex<
      Array<{ fullName: string; rsvpStatus: string; qrCodeToken: string; phone?: string }>
    >('query', 'guests:listByEvent', { eventId, requesterId: ownerId });
    expect(guests).toHaveLength(3);
    expect(guests.every((g) => g.rsvpStatus === 'attending')).toBe(true);
    expect(new Set(guests.map((g) => g.qrCodeToken)).size).toBe(3);
    expect(guests.find((g) => g.fullName === 'Aminata Diallo')?.phone).toBe('+33612345678');

    // À l'entrée : premier scan accepté, second signalé « déjà utilisé ».
    const token = guests.find((g) => g.fullName === 'Aminata Diallo')!.qrCodeToken;
    const scan = () =>
      callConvex<{ alreadyCheckedIn: boolean }>('mutation', 'guests:checkInByToken', {
        token,
        eventId,
        requesterId: ownerId,
      });
    expect((await scan()).alreadyCheckedIn).toBe(false);
    expect((await scan()).alreadyCheckedIn).toBe(true);
  });

  test('ré-importer le même fichier ne crée aucun doublon', async ({ page }) => {
    await signInByEmail(page, OWNER_EMAIL);
    const { eventId } = await ownerAndEvent();
    await page.goto(`/events/${eventId}/guests`);

    const importOnce = async () => {
      await expect(async () => {
        await page.getByTestId('import-open').click();
        await expect(page.getByTestId('guests-import')).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await page.getByTestId('import-paste').fill(CSV);
      await page.getByTestId('import-parse').click();
    };

    await importOnce();
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('import-result')).toBeVisible();
    await expect(page.getByTestId('guest-row')).toHaveCount(3);

    // Second passage : tout est reconnu comme doublon, rien à importer.
    await page.getByRole('button', { name: /importer un autre fichier/i }).click();
    await page.getByTestId('import-paste').fill(CSV);
    await page.getByTestId('import-parse').click();
    const statuses = await page
      .getByTestId('import-row')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
    expect(statuses).toEqual(['duplicate', 'duplicate', 'duplicate', 'invalid']);
    await expect(page.getByTestId('import-run')).toBeDisabled();
  });
});
