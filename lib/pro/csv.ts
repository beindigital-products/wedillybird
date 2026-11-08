/**
 * Import CSV de clients — helpers purs (parsing, détection de délimiteur,
 * auto-mapping des colonnes, construction des lignes client). Aucune dépendance
 * externe ; testable. Réutilisé par le module Intégrations pour alimenter le CRM.
 */

export type CsvDelimiter = ',' | ';' | '\t';

/**
 * Détecte le délimiteur le plus probable d'une ligne d'en-tête (`,`, `;` ou
 * tabulation — un copier-coller depuis Excel ou Google Sheets sépare par tab).
 */
export function detectDelimiter(firstLine: string): CsvDelimiter {
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs > commas && tabs > semis) return '\t';
  return semis > commas ? ';' : ',';
}

/**
 * Parse un CSV (gère les champs entre guillemets, les `""` échappés, les
 * délimiteurs `,`/`;`/tab et les retours `\r\n`). Renvoie les lignes non vides.
 */
export function parseCsv(text: string, delimiter?: CsvDelimiter): string[][] {
  const delim = delimiter ?? detectDelimiter(text.split(/\r?\n/)[0] ?? '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export type ClientField = 'partnerA' | 'partnerB' | 'email' | 'phone' | 'ignore';

export const CLIENT_FIELD_LABEL: Record<ClientField, string> = {
  partnerA: 'Partenaire A',
  partnerB: 'Partenaire B',
  email: 'Email',
  phone: 'Téléphone',
  ignore: 'Ignorer',
};

const HEADER_HINTS: Array<[Exclude<ClientField, 'ignore'>, RegExp]> = [
  ['partnerB', /partenaire ?b|conjoint ?2|[ée]pous|second|partner ?2/i],
  ['email', /e-?mail|courriel/i],
  ['phone', /t[ée]l|phone|portable|whatsapp|mobile/i],
  ['partnerA', /partenaire ?a|conjoint ?1|mari[ée]?|nom|client|couple|pr[ée]nom|partner ?1|name/i],
];

/** Auto-mappe des en-têtes vers les champs client (chaque champ une seule fois). */
export function autoMapColumns(headers: string[]): ClientField[] {
  const used = new Set<ClientField>();
  return headers.map((h) => {
    for (const [field, re] of HEADER_HINTS) {
      if (!used.has(field) && re.test(h)) {
        used.add(field);
        return field;
      }
    }
    return 'ignore' as ClientField;
  });
}

export interface CsvClient {
  partnerA: string;
  partnerB?: string;
  email?: string;
  phone?: string;
}

/** Construit les lignes client à partir des données + du mapping (ignore les lignes sans Partenaire A). */
export function buildClientRows(dataRows: string[][], mapping: ClientField[]): CsvClient[] {
  const idx = (f: ClientField) => mapping.indexOf(f);
  const ia = idx('partnerA');
  const ib = idx('partnerB');
  const ie = idx('email');
  const ip = idx('phone');
  const out: CsvClient[] = [];
  for (const r of dataRows) {
    const partnerA = (ia >= 0 ? r[ia] : '')?.trim() ?? '';
    if (!partnerA) continue;
    out.push({
      partnerA,
      partnerB: ib >= 0 ? r[ib]?.trim() || undefined : undefined,
      email: ie >= 0 ? r[ie]?.trim() || undefined : undefined,
      phone: ip >= 0 ? r[ip]?.trim() || undefined : undefined,
    });
  }
  return out;
}

/** Marque les doublons (même Partenaire A + email) par rapport aux noms existants. */
export function markDuplicates(
  rows: CsvClient[],
  existingKeys: ReadonlySet<string>,
): Array<CsvClient & { duplicate: boolean }> {
  const seen = new Set(existingKeys);
  return rows.map((r) => {
    const key = `${r.partnerA.toLowerCase()}|${(r.email ?? '').toLowerCase()}`;
    const duplicate = seen.has(key) || seen.has(r.partnerA.toLowerCase());
    seen.add(key);
    return { ...r, duplicate };
  });
}
