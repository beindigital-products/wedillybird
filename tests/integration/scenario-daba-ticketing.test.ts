// @vitest-environment edge-runtime
/**
 * Scénario « ticketing seul » (demande d'une cliente : 250 invités, RSVP déjà
 * gérés ailleurs) joué sur les VRAIES fonctions Convex.
 *
 * Chaque test décrit un comportement OBSERVÉ — pas un comportement souhaité. Les
 * tests marqués « ÉCART » documentent un manque par rapport au besoin de la
 * cliente : ils passent tant que le manque existe, et casseront (volontairement)
 * le jour où il est comblé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { newHarness, seedEvent, seedUser, type Harness } from './utils/convex-harness';

let t: Harness;
let owner: Id<'users'>;
let eventId: Id<'events'>;

beforeEach(async () => {
  t = newHarness();
  owner = await seedUser(t, { phone: '+33611111111', fullName: 'Daba' });
  eventId = await seedEvent(t, owner);
});

async function addGuest(i: number, extra: { phone?: string } = {}) {
  return t.mutation(api.guests.add, {
    eventId,
    requesterId: owner,
    fullName: `Invité ${i}`,
    phone: extra.phone ?? `+3366000${String(i).padStart(4, '0')}`,
    plusOnesAllowed: 0,
  });
}

describe('1. Constituer la liste de 250 invités', () => {
  it('ajoute 250 invités, chacun avec un jeton QR unique', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 250; i++) {
      const { qrCodeToken } = await addGuest(i);
      expect(qrCodeToken).toMatch(/^[A-HJKMNP-Z2-9]{12}$/);
      tokens.add(qrCodeToken);
    }
    expect(tokens.size).toBe(250);
    const counts = await t.query(api.guests.countByEvent, { eventId, requesterId: owner });
    expect(counts.total).toBe(250);
  });

  it('ÉCART : aucun moyen de créer un invité directement « confirmé » (attending)', async () => {
    // La cliente a déjà ses confirmations ailleurs : il lui faudrait importer
    // des invités en statut `attending`. `guests.add` n'accepte pas ce champ.
    await expect(
      t.mutation(api.guests.add, {
        eventId,
        requesterId: owner,
        fullName: 'Déjà confirmé',
        plusOnesAllowed: 0,
        // @ts-expect-error — champ inexistant dans la signature publique
        rsvpStatus: 'attending',
      }),
    ).rejects.toThrow();

    const { id } = await addGuest(1);
    const list = await t.query(api.guests.listByEvent, { eventId, requesterId: owner });
    expect(list.find((g) => g._id === id)?.rsvpStatus).toBe('pending');
  });

  it('ÉCART : le plafond B2C du plan (100 / 250) n’est pas appliqué — seul le garde-fou 5000 existe', async () => {
    const ev = await t.run(async (ctx) => ctx.db.get(eventId));
    expect(ev?.maxGuests).toBe(5000);
  });

  it('applique bien le plafond quand maxGuests est abaissé (INVITATION_LIMIT_REACHED)', async () => {
    await t.run(async (ctx) => ctx.db.patch(eventId, { maxGuests: 3 }));
    for (let i = 0; i < 3; i++) await addGuest(i);
    await expect(addGuest(99)).rejects.toThrow('INVITATION_LIMIT_REACHED');
  });

  it('ÉCART : un même numéro de téléphone peut être ajouté deux fois (pas de dédoublonnage)', async () => {
    await addGuest(1, { phone: '+33600000000' });
    await addGuest(2, { phone: '+33600000000' });
    const counts = await t.query(api.guests.countByEvent, { eventId, requesterId: owner });
    expect(counts.total).toBe(2);
  });

  it('ÉCART : le numéro n’est pas validé côté serveur (un numéro invalide est accepté)', async () => {
    // Un import de masse enverrait des messages WhatsApp vers des numéros
    // inexploitables sans aucun retour à l’import.
    const { id } = await addGuest(1, { phone: '0612' });
    const list = await t.query(api.guests.listByEvent, { eventId, requesterId: owner });
    expect(list.find((g) => g._id === id)?.phone).toBe('0612');
  });
});

describe('2. Le statut change quand l’invité valide son RSVP', () => {
  it('pending → attending à la validation, avec horodatage', async () => {
    const { qrCodeToken, id } = await addGuest(1);
    await t.mutation(api.rsvps.submit, { token: qrCodeToken, rsvpStatus: 'attending' });
    const g = (await t.query(api.guests.listByEvent, { eventId, requesterId: owner })).find(
      (x) => x._id === id,
    );
    expect(g?.rsvpStatus).toBe('attending');
    const counts = await t.query(api.guests.countByEvent, { eventId, requesterId: owner });
    expect(counts.attending).toBe(1);
    expect(counts.pending).toBe(0);
  });
});

describe('3. Contrôle d’accès à l’entrée', () => {
  it('1er scan accepté, 2e scan signalé « déjà utilisé » sans écraser l’heure d’entrée', async () => {
    const { qrCodeToken } = await addGuest(1);
    const first = await t.mutation(api.guests.checkInByToken, {
      token: qrCodeToken,
      eventId,
      requesterId: owner,
    });
    expect(first.alreadyCheckedIn).toBe(false);

    const second = await t.mutation(api.guests.checkInByToken, {
      token: qrCodeToken,
      eventId,
      requesterId: owner,
    });
    expect(second.alreadyCheckedIn).toBe(true);
    expect(second.checkedInAt).toBe(first.checkedInAt);
  });

  it('deux scans simultanés du même code : un seul est accepté', async () => {
    const { qrCodeToken } = await addGuest(1);
    const args = { token: qrCodeToken, eventId, requesterId: owner };
    const [a, b] = await Promise.all([
      t.mutation(api.guests.checkInByToken, args),
      t.mutation(api.guests.checkInByToken, args),
    ]);
    expect([a.alreadyCheckedIn, b.alreadyCheckedIn].sort()).toEqual([false, true]);
  });

  it('refuse un code inconnu', async () => {
    await expect(
      t.mutation(api.guests.checkInByToken, { token: 'ZZZZZZZZZZZZ', eventId, requesterId: owner }),
    ).rejects.toThrow('GUEST_NOT_FOUND');
  });

  it('refuse le code d’un autre événement', async () => {
    const other = await seedEvent(t, owner);
    const { qrCodeToken } = await t.mutation(api.guests.add, {
      eventId: other,
      requesterId: owner,
      fullName: 'Autre',
      plusOnesAllowed: 0,
    });
    await expect(
      t.mutation(api.guests.checkInByToken, { token: qrCodeToken, eventId, requesterId: owner }),
    ).rejects.toThrow('GUEST_WRONG_EVENT');
  });

  it('refuse un utilisateur étranger à l’événement', async () => {
    const stranger = await seedUser(t, { phone: '+33699999999' });
    const { qrCodeToken } = await addGuest(1);
    await expect(
      t.mutation(api.guests.checkInByToken, { token: qrCodeToken, eventId, requesterId: stranger }),
    ).rejects.toThrow('FORBIDDEN');
  });

  it('ÉCART : un invité qui a REFUSÉ est accepté à l’entrée', async () => {
    const { qrCodeToken } = await addGuest(1);
    await t.mutation(api.rsvps.submit, { token: qrCodeToken, rsvpStatus: 'declined' });
    const r = await t.mutation(api.guests.checkInByToken, {
      token: qrCodeToken,
      eventId,
      requesterId: owner,
    });
    expect(r.ok).toBe(true);
    expect(r.guest.rsvpStatus).toBe('declined'); // renvoyé, mais jamais bloquant
  });

  it('ÉCART : un invité jamais confirmé (pending) est accepté à l’entrée', async () => {
    const { qrCodeToken } = await addGuest(1);
    const r = await t.mutation(api.guests.checkInByToken, {
      token: qrCodeToken,
      eventId,
      requesterId: owner,
    });
    expect(r.ok).toBe(true);
    expect(r.guest.rsvpStatus).toBe('pending');
  });

  it('ÉCART : un événement annulé/archivé accepte encore les scans', async () => {
    const { qrCodeToken } = await addGuest(1);
    await t.run(async (ctx) => ctx.db.patch(eventId, { status: 'cancelled' }));
    const r = await t.mutation(api.guests.checkInByToken, {
      token: qrCodeToken,
      eventId,
      requesterId: owner,
    });
    expect(r.ok).toBe(true);
  });

  it('ÉCART : le rôle « scanner » (agent d’accueil) existe au schéma mais est REFUSÉ au scan (FORBIDDEN)', async () => {
    const hostess = await seedUser(t, { phone: '+33688888888', fullName: 'Hôtesse' });
    await t.run(async (ctx) =>
      ctx.db.insert('eventCollaborators', {
        eventId,
        userId: hostess,
        role: 'scanner',
        invitedBy: owner,
        invitedAt: Date.now(),
        acceptedAt: Date.now(),
      }),
    );
    const { qrCodeToken } = await addGuest(1);
    const outcome = await t
      .mutation(api.guests.checkInByToken, { token: qrCodeToken, eventId, requesterId: hostess })
      .then(
        () => 'accepté',
        (e: Error) => e.message,
      );
    // `checkInByToken` exige un accès en écriture (couple/co_owner/planner) ; aucun
    // code ne crée de collaborateur « scanner » et ce rôle n'ouvre aucun droit.
    expect(outcome).toBe('FORBIDDEN');
  });
});

describe('4. Envoi WhatsApp', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.TEST' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
    delete process.env.E2E_MODE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  it('broadcast : envoie le gabarit d’INVITATION (avec jeton en bouton), pas un QR seul', async () => {
    const { qrCodeToken } = await addGuest(1);
    await addGuest(2);
    await t.mutation(api.rsvps.submit, { token: qrCodeToken, rsvpStatus: 'attending' });

    const res = await t.action(api.invitationActions.broadcast, {
      eventId,
      requesterId: owner,
    });
    expect(res.sent).toBe(2);
    expect(res.failed).toBe(0);

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String(c[1]?.body)));
    const first = bodies[0];
    expect(first.type).toBe('template');
    expect(first.template.name).toMatch(/^wedding_invitation_/);
    // Aucun composant « header image » : le QR n'est pas envoyé comme image.
    const kinds = first.template.components.map((c: { type: string }) => c.type);
    expect(kinds).toEqual(['body', 'button']);
    expect(JSON.stringify(first)).not.toMatch(/image/i);
    // Le bouton porte le jeton → lien vers la page RSVP /i/<jeton>.
    expect(first.template.components[1].parameters[0].text).toHaveLength(12);
  });

  it('ÉCART : le broadcast envoie aussi aux invités DÉJÀ confirmés (pas de filtre sur le statut)', async () => {
    const { qrCodeToken } = await addGuest(1);
    await t.mutation(api.rsvps.submit, { token: qrCodeToken, rsvpStatus: 'attending' });
    const res = await t.action(api.invitationActions.broadcast, { eventId, requesterId: owner });
    expect(res.sent).toBe(1); // reçoit « Confirmer ma présence » alors qu'il a confirmé
  });

  it('est idempotent : un 2e broadcast n’envoie rien aux invités déjà servis', async () => {
    await addGuest(1);
    await t.action(api.invitationActions.broadcast, { eventId, requesterId: owner });
    const again = await t.action(api.invitationActions.broadcast, { eventId, requesterId: owner });
    expect(again.total).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ne touche pas les invités sans téléphone', async () => {
    await t.mutation(api.guests.add, {
      eventId,
      requesterId: owner,
      fullName: 'Sans numéro',
      plusOnesAllowed: 0,
    });
    const res = await t.action(api.invitationActions.broadcast, { eventId, requesterId: owner });
    expect(res.total).toBe(0);
  });

  it('refuse l’envoi pour un événement non publié', async () => {
    await addGuest(1);
    await t.run(async (ctx) => ctx.db.patch(eventId, { status: 'draft' }));
    await expect(
      t.action(api.invitationActions.broadcast, { eventId, requesterId: owner }),
    ).rejects.toThrow('EVENT_NOT_PUBLISHED');
  });

  it('ÉCART : un collaborateur (couple rattaché) ne peut pas lancer l’envoi — propriétaire uniquement', async () => {
    const stranger = await seedUser(t, { phone: '+33677777777' });
    await expect(
      t.action(api.invitationActions.broadcast, { eventId, requesterId: stranger }),
    ).rejects.toThrow('EVENT_NOT_FOUND_OR_FORBIDDEN');
  });
});
