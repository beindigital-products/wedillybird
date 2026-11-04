// @vitest-environment edge-runtime
/**
 * Import en lot des invités (`guests.importMany`) sur les VRAIES fonctions Convex.
 *
 * Couvre ce que l'aperçu côté navigateur ne peut pas garantir : le serveur est
 * l'autorité (revalidation, doublons, plafond, droits) et un import « déjà
 * confirmés » doit produire des fiches directement scannables à l'entrée.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { MAX_IMPORT_ROWS } from '../../lib/guests/rules';
import { newHarness, seedEvent, seedUser, type Harness } from './utils/convex-harness';

let t: Harness;
let owner: Id<'users'>;
let eventId: Id<'events'>;

beforeEach(async () => {
  t = newHarness();
  owner = await seedUser(t, { phone: '+33611111111', fullName: 'Daba' });
  eventId = await seedEvent(t, owner);
});

interface Row {
  fullName: string;
  phone?: string;
  email?: string;
  category?: string;
  plusOnesAllowed: number;
}

function rows(n: number, offset = 0): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    fullName: `Invité ${i + offset}`,
    phone: `+3366000${String(i + offset).padStart(4, '0')}`,
    plusOnesAllowed: 0,
  }));
}

const importRows = (
  r: Row[],
  opts: { markConfirmed?: boolean; requesterId?: Id<'users'>; event?: Id<'events'> } = {},
) =>
  t.mutation(api.guests.importMany, {
    eventId: opts.event ?? eventId,
    requesterId: opts.requesterId ?? owner,
    markConfirmed: opts.markConfirmed ?? false,
    rows: r,
  });

const list = () => t.query(api.guests.listByEvent, { eventId, requesterId: owner });

describe('guests.importMany', () => {
  it('importe 250 invités déjà confirmés, chacun avec un jeton QR unique', async () => {
    const res = await importRows(rows(250), { markConfirmed: true });
    expect(res).toEqual({ imported: 250, skipped: [] });

    const guests = await list();
    expect(guests).toHaveLength(250);
    expect(new Set(guests.map((g) => g.qrCodeToken)).size).toBe(250);
    expect(guests.every((g) => g.rsvpStatus === 'attending')).toBe(true);

    const counts = await t.query(api.guests.countByEvent, { eventId, requesterId: owner });
    expect(counts).toMatchObject({ total: 250, attending: 250, pending: 0 });
  });

  it('horodate la réponse des invités importés comme confirmés', async () => {
    await importRows(rows(1), { markConfirmed: true });
    const doc = await t.run(async (ctx) => ctx.db.query('guests').first());
    expect(doc?.rsvpRespondedAt).toBeTypeOf('number');
  });

  it('laisse les invités en attente quand « déjà confirmés » n’est pas coché', async () => {
    await importRows(rows(3));
    const guests = await list();
    expect(guests.every((g) => g.rsvpStatus === 'pending')).toBe(true);
    const docs = await t.run(async (ctx) => ctx.db.query('guests').collect());
    expect(docs.every((g) => g.rsvpRespondedAt === undefined)).toBe(true);
  });

  it('les invités importés « confirmés » sont scannables, et le 2e scan est signalé', async () => {
    await importRows(rows(1), { markConfirmed: true });
    const [guest] = await list();
    const args = { token: guest!.qrCodeToken, eventId, requesterId: owner };

    const first = await t.mutation(api.guests.checkInByToken, args);
    expect(first).toMatchObject({ ok: true, alreadyCheckedIn: false });
    expect(first.guest.rsvpStatus).toBe('attending');

    const second = await t.mutation(api.guests.checkInByToken, args);
    expect(second.alreadyCheckedIn).toBe(true);
  });

  it('normalise le nom et l’email, et conserve les champs optionnels', async () => {
    await importRows([
      {
        fullName: '  Aminata Diallo ',
        phone: '+221771234567',
        email: ' Aminata@Exemple.COM ',
        category: ' Famille ',
        plusOnesAllowed: 2,
      },
    ]);
    const [g] = await list();
    expect(g).toMatchObject({
      fullName: 'Aminata Diallo',
      phone: '+221771234567',
      email: 'aminata@exemple.com',
      category: 'Famille',
      plusOnesAllowed: 2,
    });
  });

  it('ignore les lignes invalides sans bloquer les autres, en indiquant leur raison', async () => {
    const res = await importRows([
      { fullName: '', plusOnesAllowed: 0 },
      { fullName: 'Téléphone KO', phone: '0612', plusOnesAllowed: 0 },
      { fullName: 'Email KO', email: 'pas-un-email', plusOnesAllowed: 0 },
      { fullName: 'Trop d’accompagnants', plusOnesAllowed: 11 },
      { fullName: 'Accompagnants décimaux', plusOnesAllowed: 1.5 },
      { fullName: 'OK', plusOnesAllowed: 1 },
    ]);
    expect(res.imported).toBe(1);
    expect(res.skipped).toEqual([
      { index: 0, reason: 'nameMissing' },
      { index: 1, reason: 'phoneInvalid' },
      { index: 2, reason: 'emailInvalid' },
      { index: 3, reason: 'plusOnesRange' },
      { index: 4, reason: 'plusOnesRange' },
    ]);
    expect(await list()).toHaveLength(1);
  });

  it('est idempotent : ré-importer le même fichier n’ajoute rien', async () => {
    await importRows(rows(10));
    const again = await importRows(rows(10));
    expect(again.imported).toBe(0);
    expect(again.skipped.map((s) => s.reason)).toEqual(Array(10).fill('duplicate'));
    expect(await list()).toHaveLength(10);
  });

  it('écarte un doublon répété dans le même lot', async () => {
    const res = await importRows([...rows(1), ...rows(1)]);
    expect(res.imported).toBe(1);
    expect(res.skipped).toEqual([{ index: 1, reason: 'duplicate' }]);
  });

  it('garde deux personnes distinctes qui partagent un numéro', async () => {
    const res = await importRows([
      { fullName: 'Marie Dupont', phone: '+33612345678', plusOnesAllowed: 0 },
      { fullName: 'Jean Dupont', phone: '+33612345678', plusOnesAllowed: 0 },
    ]);
    expect(res.imported).toBe(2);
  });

  it('reconnaît comme doublon un invité déjà ajouté à la main', async () => {
    await t.mutation(api.guests.add, {
      eventId,
      requesterId: owner,
      fullName: 'Aminata Diallo',
      phone: '+221771234567',
      plusOnesAllowed: 0,
    });
    const res = await importRows([
      { fullName: 'aminata diallo', phone: '+221771234567', plusOnesAllowed: 0 },
    ]);
    expect(res).toEqual({ imported: 0, skipped: [{ index: 0, reason: 'duplicate' }] });
  });

  it('respecte le plafond de fiches : les lignes en trop sont ignorées, pas tout le lot', async () => {
    await t.run(async (ctx) => ctx.db.patch(eventId, { maxGuests: 5 }));
    await importRows(rows(3)); // 2 fiches restantes
    const res = await importRows(rows(4, 100));
    expect(res.imported).toBe(2);
    expect(res.skipped).toEqual([
      { index: 2, reason: 'limit' },
      { index: 3, reason: 'limit' },
    ]);
    expect(await list()).toHaveLength(5);
  });

  it('refuse un lot de plus de MAX_IMPORT_ROWS lignes', async () => {
    await expect(importRows(rows(MAX_IMPORT_ROWS + 1))).rejects.toThrow('IMPORT_TOO_LARGE');
    expect(await list()).toHaveLength(0);
  });

  it('refuse un utilisateur étranger à l’événement', async () => {
    const stranger = await seedUser(t, { phone: '+33699999999' });
    await expect(importRows(rows(1), { requesterId: stranger })).rejects.toThrow('FORBIDDEN');
  });

  it('autorise un collaborateur gestionnaire (planner), pas un « scanner »', async () => {
    const planner = await seedUser(t, { phone: '+33677777777' });
    const scanner = await seedUser(t, { phone: '+33688888888' });
    await t.run(async (ctx) => {
      const base = { eventId, invitedBy: owner, invitedAt: Date.now(), acceptedAt: Date.now() };
      await ctx.db.insert('eventCollaborators', { ...base, userId: planner, role: 'planner' });
      await ctx.db.insert('eventCollaborators', { ...base, userId: scanner, role: 'scanner' });
    });

    expect((await importRows(rows(1), { requesterId: planner })).imported).toBe(1);
    await expect(importRows(rows(1, 50), { requesterId: scanner })).rejects.toThrow('FORBIDDEN');
  });

  it('n’agit que sur l’événement ciblé', async () => {
    const other = await seedEvent(t, owner);
    await importRows(rows(2), { event: other });
    expect(await list()).toHaveLength(0);
  });
});
