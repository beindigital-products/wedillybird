import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import { routing } from '@/i18n/routing';
import fr from '../../../messages/fr.json';

type Messages = Record<string, unknown>;

/** Valeurs plausibles pour toutes les variables ICU des blocs testés. */
const SAMPLE = {
  sent: 3,
  total: 7,
  count: 1,
  name: 'Aminata',
  message: 'oups',
  column: 'Nom',
  n: 2,
  max: 500,
};

/** Feuilles (clés) d'un bloc de messages, en chemins pointés. */
function leaves(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

const NAMESPACES = ['Guests.import', 'Guests.tickets', 'Guests.qr'] as const;

describe.each(routing.locales)('messages « invités » — %s', (locale) => {
  const messages = JSON.parse(
    readFileSync(`${process.cwd()}/messages/${locale}.json`, 'utf8'),
  ) as Messages;

  for (const ns of NAMESPACES) {
    it(`${ns} : chaque message se formate sans erreur ICU, pour 0, 1, 2 et 5`, () => {
      const errors: string[] = [];
      const t = createTranslator({
        locale,
        messages: messages as never,
        namespace: ns,
        onError: (e: { message: string }) => errors.push(e.message),
      } as never) as unknown as (key: string, values?: Record<string, unknown>) => string;

      const keys = leaves(ns.split('.').reduce<unknown>((n, k) => (n as Messages)[k], messages));
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        for (const count of [0, 1, 2, 5]) {
          const out = t(key, { ...SAMPLE, count });
          expect(typeof out).toBe('string');
          expect(out.length).toBeGreaterThan(0);
          // Aucune variable restée telle quelle dans le texte final.
          expect(out).not.toMatch(/\{[a-z]+\}/i);
        }
      }
      expect(errors).toEqual([]);
    });
  }
});

describe('référence française', () => {
  it('expose les blocs attendus', () => {
    expect(Object.keys((fr as Messages).Guests as Messages)).toEqual(
      expect.arrayContaining(['import', 'tickets', 'qr']),
    );
  });
});
