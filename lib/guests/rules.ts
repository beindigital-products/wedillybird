/**
 * Règles d'une fiche invité partagées entre l'import (prévisualisation côté
 * navigateur) et la mutation Convex `guests.importMany` (autorité côté serveur).
 *
 * Pur et sans dépendance : importable depuis `convex/` comme depuis l'app, pour
 * que l'aperçu montre exactement ce que le serveur acceptera.
 */

/** Plafond de lignes par import — borne le travail d'une seule mutation. */
export const MAX_IMPORT_ROWS = 500;

export const GUEST_NAME_MAX = 120;
export const GUEST_CATEGORY_MAX = 60;
export const GUEST_PLUS_ONES_MAX = 10;

/** E.164 : « + », un indicatif ne commençant pas par 0, 7 à 15 chiffres au total. */
export const E164 = /^\+[1-9]\d{6,14}$/;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidGuestEmail(email: string): boolean {
  return EMAIL.test(email);
}

export type GuestRowProblem =
  | 'nameMissing'
  | 'nameTooLong'
  | 'phoneInvalid'
  | 'emailInvalid'
  | 'plusOnesRange'
  | 'categoryTooLong';

export interface GuestRowFields {
  fullName: string;
  phone?: string;
  email?: string;
  category?: string;
  plusOnesAllowed: number;
}

/** Premier défaut d'une ligne, ou `null` si elle est importable. */
export function guestRowProblem(row: GuestRowFields): GuestRowProblem | null {
  const name = row.fullName.trim();
  if (name.length < 1) return 'nameMissing';
  if (name.length > GUEST_NAME_MAX) return 'nameTooLong';
  // Les coordonnées sont enregistrées « trimées » : on valide donc la même valeur.
  const phone = row.phone?.trim();
  const email = row.email?.trim();
  if (phone && !E164.test(phone)) return 'phoneInvalid';
  if (email && !isValidGuestEmail(email)) return 'emailInvalid';
  if (row.category && row.category.trim().length > GUEST_CATEGORY_MAX) return 'categoryTooLong';
  if (
    !Number.isInteger(row.plusOnesAllowed) ||
    row.plusOnesAllowed < 0 ||
    row.plusOnesAllowed > GUEST_PLUS_ONES_MAX
  ) {
    return 'plusOnesRange';
  }
  return null;
}

/**
 * Clé de détection des doublons : même nom ET même coordonnée (téléphone, sinon
 * email). Deux personnes qui partagent un numéro de foyer restent donc deux
 * invités distincts, alors qu'une même personne listée deux fois — ou un fichier
 * ré-importé — est reconnue.
 */
export function guestDedupeKey(g: { fullName: string; phone?: string; email?: string }): string {
  const name = g.fullName.trim().toLowerCase().replace(/\s+/g, ' ');
  const contact = g.phone?.trim() || g.email?.trim().toLowerCase() || '';
  return `${name}|${contact}`;
}
