import { describe, expect, it } from 'vitest';
import {
  autoMapGuestColumns,
  buildGuestRows,
  decodeCsvBuffer,
  normalizeGuestPhone,
  parseCsv,
} from '@/lib/guests/import';
import { guestDedupeKey, guestRowProblem } from '@/lib/guests/rules';

describe('normalizeGuestPhone', () => {
  it.each([
    ['06 12 34 56 78', '33', '+33612345678'],
    ['06.12.34.56.78', '33', '+33612345678'],
    ['+33 6 12 34 56 78', '33', '+33612345678'],
    ['+33 (0)6 12 34 56 78', '33', '+33612345678'],
    ['0033612345678', '33', '+33612345678'],
    // Excel a mangé le 0 initial d'un numéro stocké comme nombre.
    ['612345678', '33', '+33612345678'],
    // Déjà préfixé par l'indicatif par défaut.
    ['33612345678', '33', '+33612345678'],
    ['77 123 45 67', '221', '+221771234567'],
    ['+221 77 123 45 67', '33', '+221771234567'],
  ])('« %s » (indicatif %s) → %s', (raw, dial, expected) => {
    expect(normalizeGuestPhone(raw, dial)).toEqual({ value: expected, valid: true });
  });

  it('traite une cellule vide ou non numérique comme « pas de numéro »', () => {
    expect(normalizeGuestPhone('', '33')).toEqual({ valid: true });
    expect(normalizeGuestPhone('  ', '33')).toEqual({ valid: true });
    expect(normalizeGuestPhone('n/a', '33')).toEqual({ valid: true });
  });

  it('refuse un numéro trop court, trop long ou à « + » mal placé', () => {
    expect(normalizeGuestPhone('06 12', '33').valid).toBe(false);
    expect(normalizeGuestPhone('+33 6 12 34 56 78 90 12 34', '33').valid).toBe(false);
    // Notation scientifique d'Excel : « 6.12345678E+8 ».
    expect(normalizeGuestPhone('6.12345678E+8', '33').valid).toBe(false);
  });
});

describe('autoMapGuestColumns', () => {
  it('reconnaît les en-têtes courants d’un export Excel français', () => {
    expect(autoMapGuestColumns(['Nom complet', 'Téléphone', 'Email', 'Catégorie'])).toEqual([
      'fullName',
      'phone',
      'email',
      'category',
    ]);
  });

  it('sépare prénom et nom quand les deux colonnes existent', () => {
    expect(autoMapGuestColumns(['Prénom', 'Nom', 'Portable', 'Accompagnants'])).toEqual([
      'firstName',
      'lastName',
      'phone',
      'plusOnes',
    ]);
  });

  it('prend « Nom » seul pour le nom complet', () => {
    expect(autoMapGuestColumns(['Nom', 'Mobile'])).toEqual(['fullName', 'phone']);
  });

  it('ignore ce qu’il ne reconnaît pas et n’utilise chaque champ qu’une fois', () => {
    expect(autoMapGuestColumns(['Nom', 'Téléphone', 'Téléphone 2', 'Commentaire'])).toEqual([
      'fullName',
      'phone',
      'ignore',
      'ignore',
    ]);
  });
});

describe('decodeCsvBuffer', () => {
  const bytes = (...n: number[]) => new Uint8Array(n).buffer;

  it('lit l’UTF-8 et retire le BOM', () => {
    const utf8 = new TextEncoder().encode('﻿Élodie;+33612345678');
    expect(decodeCsvBuffer(utf8.buffer as ArrayBuffer)).toBe('Élodie;+33612345678');
  });

  it('retombe sur Windows-1252 pour un CSV « ANSI » d’Excel', () => {
    // « Élodie » en Windows-1252 : 0xC9 est un octet UTF-8 invalide seul.
    expect(decodeCsvBuffer(bytes(0xc9, 0x6c, 0x6f, 0x64, 0x69, 0x65))).toBe('Élodie');
  });
});

describe('buildGuestRows', () => {
  const base = { defaultDial: '33', existing: [] as never[], remaining: 100 };
  const map = ['fullName', 'phone', 'email', 'category', 'plusOnes'] as const;

  it('construit les lignes prêtes, avec numéros normalisés et email en minuscules', () => {
    const rows = buildGuestRows(
      [['Aminata Diallo', '06 12 34 56 78', 'Aminata@Exemple.COM', 'Famille', '2']],
      [...map],
      base,
    );
    expect(rows).toEqual([
      {
        fullName: 'Aminata Diallo',
        phone: '+33612345678',
        email: 'aminata@exemple.com',
        category: 'Famille',
        plusOnesAllowed: 2,
        status: 'ready',
      },
    ]);
  });

  it('assemble prénom + nom', () => {
    const rows = buildGuestRows([['Aminata', 'Diallo']], ['firstName', 'lastName'], base);
    expect(rows[0]?.fullName).toBe('Aminata Diallo');
  });

  it('ignore les lignes entièrement vides', () => {
    const rows = buildGuestRows(
      [
        ['', '', '', '', ''],
        ['Kwame', '', '', '', ''],
      ],
      [...map],
      base,
    );
    expect(rows).toHaveLength(1);
  });

  it('signale chaque défaut sans bloquer les autres lignes', () => {
    const rows = buildGuestRows(
      [
        ['', '06 12 34 56 78', '', '', ''],
        ['Phone KO', '06 12', '', '', ''],
        ['Email KO', '', 'pas-un-email', '', ''],
        ['Trop d’accompagnants', '', '', '', '11'],
        ['Accompagnants texte', '', '', '', 'beaucoup'],
        ['OK', '', '', '', ''],
      ],
      [...map],
      base,
    );
    expect(rows.map((r) => [r.status, r.problem])).toEqual([
      ['invalid', 'nameMissing'],
      ['invalid', 'phoneInvalid'],
      ['invalid', 'emailInvalid'],
      ['invalid', 'plusOnesRange'],
      ['invalid', 'plusOnesRange'],
      ['ready', undefined],
    ]);
  });

  it('repère les doublons dans le fichier et face aux invités existants', () => {
    const rows = buildGuestRows(
      [
        ['Aminata Diallo', '06 12 34 56 78', '', '', ''],
        ['  aminata   diallo ', '+33612345678', '', '', ''],
        ['Déjà là', '', 'deja@la.fr', '', ''],
      ],
      [...map],
      {
        ...base,
        existing: [{ fullName: 'Déjà là', email: 'deja@la.fr' }],
      },
    );
    expect(rows.map((r) => r.status)).toEqual(['ready', 'duplicate', 'duplicate']);
  });

  it('garde deux personnes distinctes qui partagent un numéro de foyer', () => {
    const rows = buildGuestRows(
      [
        ['Marie Dupont', '06 12 34 56 78', '', '', ''],
        ['Jean Dupont', '06 12 34 56 78', '', '', ''],
      ],
      [...map],
      base,
    );
    expect(rows.map((r) => r.status)).toEqual(['ready', 'ready']);
  });

  it('marque « limit » les lignes au-delà du quota restant', () => {
    const rows = buildGuestRows([['A'], ['B'], ['C']], ['fullName'], { ...base, remaining: 2 });
    expect(rows.map((r) => r.status)).toEqual(['ready', 'ready', 'limit']);
  });

  it('ne consomme pas le quota avec les doublons ni les lignes invalides', () => {
    const rows = buildGuestRows(
      [['A'], ['A'], ['', '06 12 34 56 78'], ['B']],
      ['fullName', 'phone'],
      { ...base, remaining: 2 },
    );
    expect(rows.map((r) => r.status)).toEqual(['ready', 'duplicate', 'invalid', 'ready']);
  });
});

describe('parseCsv appliqué à un export Excel', () => {
  it('lit un CSV « ; » avec champs entre guillemets', () => {
    const rows = parseCsv('Nom;Téléphone\r\n"Diallo; Aminata";"06 12 34 56 78"\r\n');
    expect(rows).toEqual([
      ['Nom', 'Téléphone'],
      ['Diallo; Aminata', '06 12 34 56 78'],
    ]);
  });
});

describe('règles partagées', () => {
  it('guestDedupeKey ignore la casse et les espaces multiples, pas la coordonnée', () => {
    expect(guestDedupeKey({ fullName: ' Aminata  DIALLO ', phone: '+33612345678' })).toBe(
      guestDedupeKey({ fullName: 'aminata diallo', phone: '+33612345678' }),
    );
    expect(guestDedupeKey({ fullName: 'Aminata', phone: '+33612345678' })).not.toBe(
      guestDedupeKey({ fullName: 'Aminata', phone: '+33612345679' }),
    );
  });

  it('guestRowProblem accepte une fiche minimale', () => {
    expect(guestRowProblem({ fullName: 'A', plusOnesAllowed: 0 })).toBeNull();
  });
});
