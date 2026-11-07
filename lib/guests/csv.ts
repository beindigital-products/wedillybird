/**
 * Import CSV d'invités — helpers purs (aucune dépendance React/Convex), testables.
 *
 * Flux : `parseGuestCsv` → `autoMapGuestColumns` → `buildGuestRows` (validation
 * ligne à ligne avec les mêmes schémas que le formulaire « Ajouter une
 * invitation ») → `markGuestDuplicates` → envoi en lot de `toImportPayload`.
 *
 * Le parseur CSV est celui de l'import clients pro (`lib/pro/csv.ts`) : il gère
 * `,`, `;` (Excel FR) et la tabulation (copier-coller depuis un tableur).
 */

import { parseCsv } from '@/lib/pro/csv';
import { isValidE164, normalizePhoneE164 } from '@/lib/phone';
import { addGuestSchema } from '@/lib/validators/guests';

/** Plafond d'invités par import. Doit rester égal à `ADD_MANY_MAX` de `convex/guests.ts`. */
export const GUEST_IMPORT_MAX = 500;

export type GuestField =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'email'
  | 'category'
  | 'plusOnes'
  | 'notes'
  | 'ignore';

/** Les champs proposés dans le menu de mapping (ordre d'affichage). */
export const GUEST_FIELDS: readonly GuestField[] = [
  'fullName',
  'firstName',
  'lastName',
  'phone',
  'email',
  'category',
  'plusOnes',
  'notes',
  'ignore',
];

/** Modèle téléchargeable : `;` + BOM pour une ouverture directe dans Excel FR. */
export const GUEST_CSV_TEMPLATE =
  '\uFEFFNom;Téléphone;Email;Catégorie;Accompagnants;Notes\n' +
  'Aminata Diallo;+33612345678;aminata@exemple.com;Famille;2;Végétarienne\n' +
  'Moussa Sow;+221771234567;;Amis;0;\n';

/** Retire le BOM UTF-8 que laissent Excel et Numbers en tête de fichier. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parse le texte d'un CSV (fichier ou collage). Renvoie `null` sans en-tête + 1 ligne de données. */
export function parseGuestCsv(text: string): { headers: string[]; rows: string[][] } | null {
  const all = parseCsv(stripBom(text));
  if (all.length < 2) return null;
  return { headers: all[0]!.map((h) => h.trim()), rows: all.slice(1) };
}

// L'ordre compte : un champ n'est attribué qu'à une seule colonne (la 1re qui
// correspond). `plusOnes` passe avant `fullName` pour que « Nombre » ne soit pas
// pris pour un nom ; « Nom » seul est traité à part (cf. fin d'`autoMapGuestColumns`).
const HEADER_HINTS: Array<[Exclude<GuestField, 'ignore'>, RegExp]> = [
  ['email', /e-?mail|courriel|\bmail\b/i],
  ['phone', /t[ée]l|phone|portable|whatsapp|mobile|gsm/i],
  ['plusOnes', /accompagn|plus ?ones?|nb ?(pers|invit)|nombre|\+ ?\d/i],
  ['firstName', /pr[ée]nom|first ?name|given/i],
  ['fullName', /nom ?(complet|et pr[ée]nom)|full ?name|^name$|^invit[ée]/i],
  ['lastName', /^nom( de famille)?$|last ?name|surname|family ?name/i],
  ['category', /cat[ée]gorie|category|groupe|c[ôo]t[ée]|\btype\b/i],
  ['notes', /notes?|remarque|commentaire|observation/i],
];

/** Auto-mappe les en-têtes vers les champs invité (chaque champ une seule fois). */
export function autoMapGuestColumns(headers: string[]): GuestField[] {
  const used = new Set<GuestField>();
  const mapping = headers.map((h) => {
    for (const [field, re] of HEADER_HINTS) {
      if (!used.has(field) && re.test(h.trim())) {
        used.add(field);
        return field;
      }
    }
    return 'ignore' as GuestField;
  });
  // « Nom » seul sans colonne « Prénom » = le nom complet de l'invité.
  if (used.has('lastName') && !used.has('firstName') && !used.has('fullName')) {
    return mapping.map((f) => (f === 'lastName' ? 'fullName' : f));
  }
  return mapping;
}

export type GuestRowStatus = 'ok' | 'duplicate' | 'error';

export interface GuestImportRow {
  /** Numéro de ligne dans le fichier (l'en-tête est la ligne 1). */
  line: number;
  fullName: string;
  phone?: string;
  email?: string;
  category?: string;
  plusOnesAllowed: number;
  notes?: string;
  status: GuestRowStatus;
  /** Code i18n `Validation.*` de la 1re erreur (si `status === 'error'`). */
  error?: string;
}

/**
 * Normalise un numéro saisi dans un tableur vers E.164.
 *
 * - `+…` et `00…` : déjà internationaux.
 * - sinon : numéro local → on retire le `0` de tête et on préfixe l'indicatif par
 *   défaut. Un numéro qui commence déjà par cet indicatif et qui est assez long
 *   (`33612345678`) est pris tel quel. `normalizePhoneE164` seul ferait de
 *   `771234567` un `+771234567` (faux) : d'où ce wrapper.
 *
 * Renvoie la saisie nettoyée (invalide → rejetée par le schéma) si impossible.
 */
export function normalizeGuestPhone(raw: string, defaultDial: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+') || cleaned.startsWith('00')) {
    return normalizePhoneE164(cleaned, defaultDial) ?? cleaned;
  }
  const digits = cleaned.replace(/^0/, '');
  if (cleaned.startsWith(defaultDial) && cleaned.length >= defaultDial.length + 8) {
    return `+${cleaned}`;
  }
  const candidate = `+${defaultDial}${digits}`;
  return isValidE164(candidate) ? candidate : cleaned;
}

/** « 2 », « +2 », « oui » → nombre ; vide → 0 ; reste → NaN (rejeté par le schéma). */
function parsePlusOnes(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/^\+/, '');
  if (s === '') return 0;
  if (/^\d+$/.test(s)) return Number.parseInt(s, 10);
  if (['oui', 'yes', 'o', 'x'].includes(s)) return 1;
  if (['non', 'no', 'n'].includes(s)) return 0;
  return Number.NaN;
}

/** Construit et valide les lignes à partir des données + du mapping de colonnes. */
export function buildGuestRows(
  dataRows: string[][],
  mapping: GuestField[],
  defaultDial: string,
): GuestImportRow[] {
  const col = (f: GuestField) => mapping.indexOf(f);
  const cell = (r: string[], f: GuestField) => {
    const i = col(f);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };

  return dataRows.map((r, idx) => {
    const line = idx + 2;
    const fullName =
      cell(r, 'fullName') || [cell(r, 'firstName'), cell(r, 'lastName')].filter(Boolean).join(' ');
    const rawPhone = cell(r, 'phone');
    const phone = rawPhone ? normalizeGuestPhone(rawPhone, defaultDial) : '';
    const plusOnes = parsePlusOnes(cell(r, 'plusOnes'));

    const parsed = addGuestSchema.safeParse({
      fullName,
      phone,
      email: cell(r, 'email'),
      category: cell(r, 'category'),
      // Zod rejette `NaN` avec un message générique : on passe le texte brut pour
      // obtenir le code `Validation.plusOnesRange` (parseInt → NaN → refine).
      plusOnesAllowed: Number.isNaN(plusOnes) ? cell(r, 'plusOnes') : plusOnes,
      notes: cell(r, 'notes'),
    });

    if (!parsed.success) {
      return {
        line,
        fullName,
        phone: phone || undefined,
        email: cell(r, 'email') || undefined,
        category: cell(r, 'category') || undefined,
        plusOnesAllowed: Number.isFinite(plusOnes) ? plusOnes : 0,
        notes: cell(r, 'notes') || undefined,
        status: 'error',
        error: parsed.error.issues[0]?.message ?? 'Validation.guestNameRequired',
      };
    }
    const d = parsed.data;
    return {
      line,
      fullName: d.fullName,
      phone: d.phone,
      email: d.email,
      category: d.category,
      plusOnesAllowed: d.plusOnesAllowed,
      notes: d.notes,
      status: 'ok',
    };
  });
}

export interface ExistingGuestKeys {
  phones: Set<string>;
  emails: Set<string>;
  /** Noms des invités SANS téléphone ni email (sinon le nom seul ne prouve rien : homonymes). */
  names: Set<string>;
}

export function existingGuestKeys(
  guests: ReadonlyArray<{ fullName: string; phone?: string; email?: string }>,
): ExistingGuestKeys {
  const keys: ExistingGuestKeys = { phones: new Set(), emails: new Set(), names: new Set() };
  for (const g of guests) {
    if (g.phone) keys.phones.add(g.phone);
    if (g.email) keys.emails.add(g.email.toLowerCase());
    if (!g.phone && !g.email) keys.names.add(g.fullName.trim().toLowerCase());
  }
  return keys;
}

/**
 * Marque les doublons (déjà dans la liste, ou répétés dans le fichier) : même
 * téléphone, ou même email, ou — faute des deux — même nom. Les lignes en
 * erreur ne comptent pas comme « vues ».
 */
export function markGuestDuplicates(
  rows: GuestImportRow[],
  existing: ExistingGuestKeys,
): GuestImportRow[] {
  const phones = new Set(existing.phones);
  const emails = new Set(existing.emails);
  const names = new Set(existing.names);
  return rows.map((row) => {
    if (row.status === 'error') return row;
    const name = row.fullName.toLowerCase();
    const duplicate =
      (row.phone !== undefined && phones.has(row.phone)) ||
      (row.email !== undefined && emails.has(row.email)) ||
      (!row.phone && !row.email && names.has(name));
    if (row.phone) phones.add(row.phone);
    if (row.email) emails.add(row.email);
    if (!row.phone && !row.email) names.add(name);
    return duplicate ? { ...row, status: 'duplicate' } : row;
  });
}

/** Lignes prêtes à l'envoi (statut `ok`), au format de l'action serveur. */
export function toImportPayload(rows: GuestImportRow[]) {
  return rows
    .filter((r) => r.status === 'ok')
    .map((r) => ({
      fullName: r.fullName,
      plusOnesAllowed: r.plusOnesAllowed,
      ...(r.phone ? { phone: r.phone } : {}),
      ...(r.email ? { email: r.email } : {}),
      ...(r.category ? { category: r.category } : {}),
      ...(r.notes ? { notes: r.notes } : {}),
    }));
}
