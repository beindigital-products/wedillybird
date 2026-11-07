// @vitest-environment edge-runtime
/**
 * Import CSV d'invités : `guests.addMany`, sur la VRAIE fonction Convex.
 *
 * Ce qui compte ici, ce sont les refus : un import qui dépasse le quota ou qui
 * contient une ligne invalide n'écrit RIEN (tout ou rien). Sinon un couple se
 * retrouve avec la moitié de sa liste, sans savoir laquelle.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { newHarness, seedEvent, seedUser, type Harness } from './utils/convex-harness';

let t: Harness;
let ownerId: Id<'users'>;
let eventId: Id<'events'>;

beforeEach(async () => {
  t = newHarness();
  ownerId = await seedUser(t);
  eventId = await seedEvent(t, ownerId);
});

const guest = (fullName: string, extra: Record<string, unknown> = {}) => ({
  fullName,
  plusOnesAllowed: 0,
  ...extra,
});

async function countGuests() {
  return t.run(
    async (ctx) =>
      (
        await ctx.db
          .query('guests')
          .withIndex('by_event', (q) => q.eq('eventId', eventId))
          .collect()
      ).length,
  );
}

async function setQuota(maxGuests: number) {
  await t.run(async (ctx) => ctx.db.patch(eventId, { maxGuests }));
}

describe('guests.addMany', () => {
  it('insère tout le lot, en attente, avec un QR unique par invité', async () => {
    const res = await t.mutation(api.guests.addMany, {
      eventId,
      requesterId: ownerId,
      guests: [
        guest('  Aminata Diallo ', {
          phone: '+33612345678',
          email: 'Aminata@Exemple.com',
          category: 'Famille',
          plusOnesAllowed: 2,
          notes: 'Végétarienne',
        }),
        guest('Moussa Sow', { phone: '+221771234567' }),
        guest('Awa Ndiaye'),
      ],
    });
    expect(res.created).toBe(3);

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query('guests')
        .withIndex('by_event', (q) => q.eq('eventId', eventId))
        .collect(),
    );
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.qrCodeToken)).size).toBe(3);
    expect(rows.every((r) => r.rsvpStatus === 'pending')).toBe(true);

    const aminata = rows.find((r) => r.fullName === 'Aminata Diallo')!;
    expect(aminata).toMatchObject({
      phone: '+33612345678',
      email: 'aminata@exemple.com',
      category: 'Famille',
      plusOnesAllowed: 2,
      notes: 'Végétarienne',
    });
  });

  it('un lot vide ne fait rien', async () => {
    const res = await t.mutation(api.guests.addMany, { eventId, requesterId: ownerId, guests: [] });
    expect(res.created).toBe(0);
    expect(await countGuests()).toBe(0);
  });

  it('refuse TOUT le lot quand il dépasse le quota restant', async () => {
    await setQuota(3);
    await t.mutation(api.guests.add, {
      eventId,
      requesterId: ownerId,
      fullName: 'Déjà là',
      plusOnesAllowed: 0,
    });

    await expect(
      t.mutation(api.guests.addMany, {
        eventId,
        requesterId: ownerId,
        guests: [guest('A'), guest('B'), guest('C')],
      }),
    ).rejects.toThrow('INVITATION_LIMIT_REACHED');
    expect(await countGuests()).toBe(1);

    // Pile au quota : accepté.
    const ok = await t.mutation(api.guests.addMany, {
      eventId,
      requesterId: ownerId,
      guests: [guest('A'), guest('B')],
    });
    expect(ok.created).toBe(2);
    expect(await countGuests()).toBe(3);
  });

  it('une ligne invalide fait échouer le lot entier, sans insertion partielle', async () => {
    await expect(
      t.mutation(api.guests.addMany, {
        eventId,
        requesterId: ownerId,
        guests: [guest('Valide'), guest('Trop', { plusOnesAllowed: 11 })],
      }),
    ).rejects.toThrow('INVALID_PLUS_ONES');
    await expect(
      t.mutation(api.guests.addMany, {
        eventId,
        requesterId: ownerId,
        guests: [guest('Valide'), guest('   ')],
      }),
    ).rejects.toThrow('INVALID_FULL_NAME');
    expect(await countGuests()).toBe(0);
  });

  it('refuse plus de 500 invités par appel', async () => {
    const many = Array.from({ length: 501 }, (_, i) => guest(`Invité ${i}`));
    await expect(
      t.mutation(api.guests.addMany, { eventId, requesterId: ownerId, guests: many }),
    ).rejects.toThrow('TOO_MANY_GUESTS');
    expect(await countGuests()).toBe(0);
  });

  it('refuse un utilisateur qui n’a pas accès à l’événement', async () => {
    const stranger = await seedUser(t, { phone: '+33600000099' });
    await expect(
      t.mutation(api.guests.addMany, {
        eventId,
        requesterId: stranger,
        guests: [guest('Intrus')],
      }),
    ).rejects.toThrow();
    expect(await countGuests()).toBe(0);
  });
});
