import { describe, it, expect } from 'vitest';
import {
  GUEST_CSV_TEMPLATE,
  autoMapGuestColumns,
  buildGuestRows,
  existingGuestKeys,
  markGuestDuplicates,
  normalizeGuestPhone,
  parseGuestCsv,
  stripBom,
  toImportPayload,
  type GuestField,
} from '../../../lib/guests/csv';

describe('parseGuestCsv', () => {
  it('retire le BOM Excel et parse le point-virgule', () => {
    const parsed = parseGuestCsv('\uFEFFNom;Téléphone\nAminata Diallo;0612345678');
    expect(parsed?.headers).toEqual(['Nom', 'Téléphone']);
    expect(parsed?.rows).toEqual([['Aminata Diallo', '0612345678']]);
  });

  it('parse un copier-coller depuis un tableur (tabulations)', () => {
    const parsed = parseGuestCsv('Nom\tTéléphone\tAccompagnants\nMoussa Sow\t0771234567\t2');
    expect(parsed?.headers).toEqual(['Nom', 'Téléphone', 'Accompagnants']);
    expect(parsed?.rows).toEqual([['Moussa Sow', '0771234567', '2']]);
  });

  it('refuse un fichier sans ligne de données', () => {
    expect(parseGuestCsv('Nom;Téléphone')).toBeNull();
    expect(parseGuestCsv('')).toBeNull();
  });

  it('stripBom ne touche pas un texte sans BOM', () => {
    expect(stripBom('Nom')).toBe('Nom');
  });

  it('le modèle téléchargeable se relit sans erreur, avec le mapping automatique', () => {
    const parsed = parseGuestCsv(GUEST_CSV_TEMPLATE)!;
    expect(parsed.rows).toHaveLength(2);
    const mapping = autoMapGuestColumns(parsed.headers);
    const rows = buildGuestRows(parsed.rows, mapping, '33');
    expect(rows.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(rows[0]).toMatchObject({ fullName: 'Aminata Diallo', plusOnesAllowed: 2 });
    expect(rows[1]).toMatchObject({ phone: '+221771234567', plusOnesAllowed: 0 });
  });
});

describe('autoMapGuestColumns', () => {
  it('Nom + Prénom → nom de famille + prénom', () => {
    expect(
      autoMapGuestColumns([
        'Nom',
        'Prénom',
        'Téléphone',
        'Email',
        'Accompagnants',
        'Catégorie',
        'Notes',
      ]),
    ).toEqual(['lastName', 'firstName', 'phone', 'email', 'plusOnes', 'category', 'notes']);
  });

  it('« Nom » seul devient le nom complet', () => {
    expect(autoMapGuestColumns(['Nom', 'Portable'])).toEqual(['fullName', 'phone']);
  });

  it('« Nombre de personnes » est un nombre d’accompagnants, pas un nom', () => {
    expect(autoMapGuestColumns(['Nom complet', 'Nombre de personnes'])).toEqual([
      'fullName',
      'plusOnes',
    ]);
  });

  it('relit un export de la plateforme (colonnes techniques ignorées)', () => {
    const exported = [
      'fullName',
      'phone',
      'email',
      'category',
      'plusOnesAllowed',
      'plusOnesNames',
      'rsvpStatus',
      'dietaryRestrictions',
      'notes',
      'qrCodeToken',
    ];
    expect(autoMapGuestColumns(exported)).toEqual([
      'fullName',
      'phone',
      'email',
      'category',
      'plusOnes',
      'ignore',
      'ignore',
      'ignore',
      'notes',
      'ignore',
    ]);
  });

  it('chaque champ n’est attribué qu’une fois', () => {
    const mapping = autoMapGuestColumns(['Email', 'Email pro', 'Tél', 'Téléphone fixe']);
    expect(mapping).toEqual(['email', 'ignore', 'phone', 'ignore']);
  });
});

describe('normalizeGuestPhone', () => {
  it('numéro local français avec 0 de tête', () => {
    expect(normalizeGuestPhone('06 12 34 56 78', '33')).toBe('+33612345678');
  });
  it('numéro déjà international', () => {
    expect(normalizeGuestPhone('+221 77 123 45 67', '33')).toBe('+221771234567');
    expect(normalizeGuestPhone('0033612345678', '33')).toBe('+33612345678');
  });
  it('numéro local sénégalais sans 0 : l’indicatif choisi s’applique', () => {
    expect(normalizeGuestPhone('77 123 45 67', '221')).toBe('+221771234567');
  });
  it('numéro avec indicatif mais sans « + »', () => {
    expect(normalizeGuestPhone('33612345678', '33')).toBe('+33612345678');
  });
  it('vide reste vide', () => {
    expect(normalizeGuestPhone('', '33')).toBe('');
    expect(normalizeGuestPhone('abc', '33')).toBe('');
  });
});

const MAP: GuestField[] = ['fullName', 'phone', 'email', 'category', 'plusOnes', 'notes'];

describe('buildGuestRows', () => {
  it('construit une ligne valide et numérote à partir de 2 (l’en-tête est la ligne 1)', () => {
    const [row] = buildGuestRows(
      [['  Aminata Diallo ', '0612345678', 'Aminata@Exemple.com', 'Famille', '2', 'Végé']],
      MAP,
      '33',
    );
    expect(row).toEqual({
      line: 2,
      fullName: 'Aminata Diallo',
      phone: '+33612345678',
      email: 'aminata@exemple.com',
      category: 'Famille',
      plusOnesAllowed: 2,
      notes: 'Végé',
      status: 'ok',
    });
  });

  it('assemble prénom + nom de famille', () => {
    const rows = buildGuestRows(
      [['Diallo', 'Aminata']],
      ['lastName', 'firstName'] satisfies GuestField[],
      '33',
    );
    expect(rows[0]).toMatchObject({ fullName: 'Aminata Diallo', status: 'ok' });
  });

  it('accompagnants : « +2 », « oui », vide, « non »', () => {
    const rows = buildGuestRows(
      [
        ['A', '', '', '', '+2', ''],
        ['B', '', '', '', 'oui', ''],
        ['C', '', '', '', '', ''],
        ['D', '', '', '', 'non', ''],
      ],
      MAP,
      '33',
    );
    expect(rows.map((r) => r.plusOnesAllowed)).toEqual([2, 1, 0, 0]);
    expect(rows.every((r) => r.status === 'ok')).toBe(true);
  });

  it('refuse un nombre d’accompagnants hors 0-10 ou illisible', () => {
    const rows = buildGuestRows(
      [
        ['A', '', '', '', '11', ''],
        ['B', '', '', '', 'beaucoup', ''],
      ],
      MAP,
      '33',
    );
    expect(rows.map((r) => [r.status, r.error])).toEqual([
      ['error', 'Validation.plusOnesRange'],
      ['error', 'Validation.plusOnesRange'],
    ]);
  });

  it('signale email invalide, téléphone invalide et nom manquant', () => {
    const rows = buildGuestRows(
      [
        ['A', '', 'pas-un-email', '', '0', ''],
        ['B', '12', '', '', '0', ''],
        ['', '0612345678', '', '', '0', ''],
      ],
      MAP,
      '33',
    );
    expect(rows.map((r) => r.error)).toEqual([
      'Validation.emailInvalid',
      'Validation.phoneE164Invalid',
      'Validation.guestNameRequired',
    ]);
  });
});

describe('markGuestDuplicates', () => {
  const rows = (data: string[][]) => buildGuestRows(data, MAP, '33');

  it('doublon avec un invité existant : même téléphone ou même email', () => {
    const existing = existingGuestKeys([
      { fullName: 'Aminata Diallo', phone: '+33612345678' },
      { fullName: 'Moussa Sow', email: 'moussa@exemple.com' },
    ]);
    const out = markGuestDuplicates(
      rows([
        ['Aminata D.', '06 12 34 56 78', '', '', '', ''],
        ['M. Sow', '', 'MOUSSA@exemple.com', '', '', ''],
        ['Nouvelle Personne', '0698765432', '', '', '', ''],
      ]),
      existing,
    );
    expect(out.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'ok']);
  });

  it('doublon dans le fichier lui-même', () => {
    const out = markGuestDuplicates(
      rows([
        ['A', '0612345678', '', '', '', ''],
        ['A bis', '0612345678', '', '', '', ''],
      ]),
      existingGuestKeys([]),
    );
    expect(out.map((r) => r.status)).toEqual(['ok', 'duplicate']);
  });

  it('le nom seul ne prouve rien quand le téléphone ou l’email existe (homonymes)', () => {
    const existing = existingGuestKeys([{ fullName: 'Awa Ndiaye', phone: '+33611111111' }]);
    const out = markGuestDuplicates(rows([['Awa Ndiaye', '0622222222', '', '', '', '']]), existing);
    expect(out[0]!.status).toBe('ok');
  });

  it('sans téléphone ni email, le nom sert de clé', () => {
    const existing = existingGuestKeys([{ fullName: 'Famille Diallo' }]);
    const out = markGuestDuplicates(
      rows([
        ['famille diallo', '', '', '', '', ''],
        ['Famille Diallo', '', '', '', '', ''],
      ]),
      existing,
    );
    expect(out.map((r) => r.status)).toEqual(['duplicate', 'duplicate']);
  });

  it('une ligne en erreur reste en erreur et ne masque pas la suivante', () => {
    const out = markGuestDuplicates(
      rows([
        ['A', '0612345678', 'pas-un-email', '', '', ''],
        ['A', '0612345678', '', '', '', ''],
      ]),
      existingGuestKeys([]),
    );
    expect(out.map((r) => r.status)).toEqual(['error', 'ok']);
  });
});

describe('toImportPayload', () => {
  it('ne garde que les lignes ok et omet les champs vides', () => {
    const built = markGuestDuplicates(
      buildGuestRows(
        [
          ['Aminata Diallo', '0612345678', '', 'Famille', '2', ''],
          ['Sans Telephone', '', '', '', '', ''],
          ['Mauvais Email', '', 'x', '', '', ''],
        ],
        MAP,
        '33',
      ),
      existingGuestKeys([]),
    );
    expect(toImportPayload(built)).toEqual([
      {
        fullName: 'Aminata Diallo',
        plusOnesAllowed: 2,
        phone: '+33612345678',
        category: 'Famille',
      },
      { fullName: 'Sans Telephone', plusOnesAllowed: 0 },
    ]);
  });
});
