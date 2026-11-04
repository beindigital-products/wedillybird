/**
 * Import de la liste d'invités depuis un CSV (export Excel / Google Sheets).
 * Helpers purs : décodage, auto-mapping des colonnes, normalisation des numéros
 * et construction des lignes avec leur statut. Aucun accès réseau — testable.
 */
import { parseCsv } from '@/lib/pro/csv';
import { guestDedupeKey, guestRowProblem, type GuestRowProblem } from '@/lib/guests/rules';

export { parseCsv };

export type GuestImportField =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'email'
  | 'category'
  | 'plusOnes'
  | 'ignore';

export const GUEST_IMPORT_FIELDS: readonly GuestImportField[] = [
  'fullName',
  'firstName',
  'lastName',
  'phone',
  'email',
  'category',
  'plusOnes',
  'ignore',
];

/** Modèle proposé au téléchargement (séparateur « ; » : celui d'Excel en français). */
export const GUEST_CSV_TEMPLATE =
  'Nom complet;Téléphone;Email;Catégorie;Accompagnants\n' +
  'Aminata Diallo;+221771234567;aminata@exemple.com;Famille;1\n';

/**
 * Décode le contenu d'un fichier CSV. Excel enregistre souvent en « CSV »
 * Windows-1252 (accents illisibles si lus en UTF-8) : on tente UTF-8 strict et on
 * retombe sur Windows-1252. Retire le BOM éventuel.
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/* -------------------------------------------------------------------------- */
/*  Auto-mapping des colonnes                                                  */
/* -------------------------------------------------------------------------- */

const HINTS: Array<[Exclude<GuestImportField, 'ignore'>, RegExp]> = [
  ['firstName', /pr[ée]nom|first ?name|given ?name/i],
  ['lastName', /^\s*(nom( de famille)?|last ?name|surname|family ?name)\s*$/i],
  ['fullName', /nom (complet|et pr[ée]nom)|full ?name|invit[ée]|guest|^\s*nom|name/i],
  ['phone', /t[ée]l|phone|portable|whatsapp|mobile|gsm/i],
  ['email', /e-?mail|courriel|mail/i],
  ['plusOnes', /accompagn|plus ?ones?|\+ ?1|nb ?(de )?(pers|invit)|nombre/i],
  ['category', /cat[ée]gorie|groupe|group|c[ôo]t[ée]|famille|table|type/i],
];

/**
 * Associe chaque en-tête à un champ (chaque champ une seule fois). Un « Nom »
 * seul vaut nom complet, sauf si une colonne « Prénom » existe : il devient alors
 * le nom de famille.
 */
export function autoMapGuestColumns(headers: string[]): GuestImportField[] {
  const used = new Set<GuestImportField>();
  const mapping = headers.map((h) => {
    for (const [field, re] of HINTS) {
      if (!used.has(field) && re.test(h)) {
        used.add(field);
        return field;
      }
    }
    return 'ignore' as GuestImportField;
  });
  // « Nom » plain sans « Prénom » : c'est le nom complet.
  if (!used.has('firstName') && used.has('lastName') && !used.has('fullName')) {
    return mapping.map((f) => (f === 'lastName' ? 'fullName' : f));
  }
  return mapping;
}

/* -------------------------------------------------------------------------- */
/*  Normalisation du téléphone                                                 */
/* -------------------------------------------------------------------------- */

export interface PhoneResult {
  /** Numéro E.164, absent si la cellule est vide ou invalide. */
  value?: string;
  valid: boolean;
}

/**
 * Convertit une cellule en E.164. `defaultDial` (sans « + », ex. « 33 ») sert aux
 * numéros sans indicatif. Cas courants d'un export Excel gérés :
 *  - `06 12 34 56 78`, `06.12.34.56.78` → indicatif par défaut, 0 initial retiré ;
 *  - `+33 (0)6 12 34 56 78` → le « (0) » est retiré ;
 *  - `0033612345678` → `+33612345678` ;
 *  - `612345678` (Excel a mangé le 0) → indicatif par défaut ajouté ;
 *  - `33612345678` → déjà préfixé par l'indicatif par défaut, conservé.
 */
export function normalizeGuestPhone(raw: string, defaultDial: string): PhoneResult {
  const cleaned = raw.replace(/\(0\)/g, '').replace(/[^\d+]/g, '');
  if (!cleaned) return { valid: true };
  if (cleaned.indexOf('+', 1) !== -1) return { valid: false };

  let intl: string;
  if (cleaned.startsWith('+')) intl = cleaned.slice(1);
  else if (cleaned.startsWith('00')) intl = cleaned.slice(2);
  else if (cleaned.startsWith('0')) intl = defaultDial + cleaned.replace(/^0+/, '');
  else if (cleaned.startsWith(defaultDial) && cleaned.length >= defaultDial.length + 7) {
    intl = cleaned;
  } else intl = defaultDial + cleaned;

  return /^[1-9]\d{7,14}$/.test(intl) ? { value: `+${intl}`, valid: true } : { valid: false };
}

/* -------------------------------------------------------------------------- */
/*  Construction des lignes                                                    */
/* -------------------------------------------------------------------------- */

export type GuestImportStatus = 'ready' | 'duplicate' | 'invalid' | 'limit';

export interface GuestImportRow {
  fullName: string;
  phone?: string;
  email?: string;
  category?: string;
  plusOnesAllowed: number;
  status: GuestImportStatus;
  /** Renseigné quand `status === 'invalid'`. */
  problem?: GuestRowProblem;
}

export interface BuildGuestRowsOptions {
  /** Indicatif par défaut sans « + » (ex. « 33 »). */
  defaultDial: string;
  /** Invités déjà présents sur l'événement (pour repérer les doublons). */
  existing: ReadonlyArray<{ fullName: string; phone?: string; email?: string }>;
  /** Fiches encore disponibles avant d'atteindre le plafond de l'événement. */
  remaining: number;
}

function cell(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? '').trim() : '';
}

/**
 * Transforme les lignes du CSV en lignes importables, chacune avec son statut :
 * `ready` (sera importée), `duplicate` (déjà présente ou répétée dans le fichier),
 * `invalid` (à corriger — voir `problem`) ou `limit` (au-delà du plafond).
 * Les lignes entièrement vides sont ignorées.
 */
export function buildGuestRows(
  dataRows: string[][],
  mapping: GuestImportField[],
  opts: BuildGuestRowsOptions,
): GuestImportRow[] {
  const col = (f: GuestImportField) => mapping.indexOf(f);
  const [iFull, iFirst, iLast, iPhone, iEmail, iCat, iPlus] = [
    col('fullName'),
    col('firstName'),
    col('lastName'),
    col('phone'),
    col('email'),
    col('category'),
    col('plusOnes'),
  ];

  const seen = new Set(opts.existing.map(guestDedupeKey));
  let remaining = opts.remaining;
  const out: GuestImportRow[] = [];

  for (const r of dataRows) {
    const fullName =
      cell(r, iFull) || [cell(r, iFirst), cell(r, iLast)].filter(Boolean).join(' ').trim();
    const phoneRaw = cell(r, iPhone);
    const email = cell(r, iEmail).toLowerCase();
    const category = cell(r, iCat);
    const plusRaw = cell(r, iPlus);

    if (!fullName && !phoneRaw && !email && !category && !plusRaw) continue;

    const phone = normalizeGuestPhone(phoneRaw, opts.defaultDial);
    const plusOnesAllowed = plusRaw === '' ? 0 : Number(plusRaw.replace(',', '.'));

    const row: GuestImportRow = {
      fullName,
      ...(phone.value ? { phone: phone.value } : {}),
      ...(email ? { email } : {}),
      ...(category ? { category } : {}),
      plusOnesAllowed,
      status: 'ready',
    };

    const problem = !phone.valid ? 'phoneInvalid' : guestRowProblem(row);
    if (problem) {
      out.push({ ...row, status: 'invalid', problem });
      continue;
    }

    const key = guestDedupeKey(row);
    if (seen.has(key)) {
      out.push({ ...row, status: 'duplicate' });
      continue;
    }
    seen.add(key);

    if (remaining <= 0) {
      out.push({ ...row, status: 'limit' });
      continue;
    }
    remaining--;
    out.push(row);
  }
  return out;
}
