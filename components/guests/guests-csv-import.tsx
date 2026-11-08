'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COUNTRIES } from '@/components/auth/phone-input';
import { cn } from '@/lib/cn';
import { translateZodMessage } from '@/lib/validators/translate-zod';
import {
  GUEST_CSV_TEMPLATE,
  GUEST_FIELDS,
  GUEST_IMPORT_MAX,
  autoMapGuestColumns,
  buildGuestRows,
  existingGuestKeys,
  markGuestDuplicates,
  parseGuestCsv,
  toImportPayload,
  type GuestField,
} from '@/lib/guests/csv';
import { importGuestsAction } from '@/app/[locale]/(app)/events/[eventId]/guests/actions';

const STEPS = ['upload', 'map', 'result'] as const;
type Step = (typeof STEPS)[number];

interface Props {
  eventId: string;
  /** Invités déjà présents : sert à repérer les doublons. */
  existing: ReadonlyArray<{ fullName: string; phone?: string; email?: string }>;
  /** Invitations encore disponibles dans la formule (quota − déjà ajoutées). */
  remaining: number;
  onClose: () => void;
}

/**
 * Un fichier Excel FR enregistré en « CSV » est souvent en Windows-1252 : lu en
 * UTF-8 il transforme « é » en « � ». On tente l'UTF-8 strict, puis Windows-1252.
 */
async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function downloadTemplate() {
  const blob = new Blob([GUEST_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modele-invites.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function GuestsCsvImport({ eventId, existing, remaining, onClose }: Props) {
  const t = useTranslations('Guests.import');
  const tGuests = useTranslations('Guests');
  const tRoot = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<GuestField[]>([]);
  const [paste, setPaste] = useState('');
  const [countryCode, setCountryCode] = useState('FR');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState({ created: 0, skipped: 0 });

  const dial = COUNTRIES.find((c) => c.code === countryCode)?.dial ?? '33';
  const existingKeys = useMemo(() => existingGuestKeys(existing), [existing]);

  const rows = useMemo(
    () =>
      step === 'map'
        ? markGuestDuplicates(buildGuestRows(dataRows, mapping, dial), existingKeys)
        : [],
    [step, dataRows, mapping, dial, existingKeys],
  );
  const okRows = rows.filter((r) => r.status === 'ok');
  const dupCount = rows.filter((r) => r.status === 'duplicate').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;
  const hasName = ['fullName', 'firstName', 'lastName'].some((f) =>
    mapping.includes(f as GuestField),
  );
  const overQuota = okRows.length > remaining;
  const canImport = hasName && okRows.length > 0 && !overQuota && !pending;

  function ingest(text: string) {
    setError(null);
    const parsed = parseGuestCsv(text);
    if (!parsed) {
      setError(t('tooFew'));
      return;
    }
    if (parsed.rows.length > GUEST_IMPORT_MAX) {
      setError(t('tooMany', { max: GUEST_IMPORT_MAX }));
      return;
    }
    setHeaders(parsed.headers);
    setDataRows(parsed.rows);
    setMapping(autoMapGuestColumns(parsed.headers));
    setStep('map');
  }

  function runImport() {
    setError(null);
    start(async () => {
      const res = await importGuestsAction(eventId, toImportPayload(rows));
      if (res.ok) {
        setResult({ created: res.created, skipped: rows.length - res.created });
        setStep('result');
        router.refresh();
        return;
      }
      setError(
        res.error === 'INVITATION_LIMIT_REACHED'
          ? tGuests('errors.limitReached')
          : t('submitError'),
      );
    });
  }

  function reset() {
    setStep('upload');
    setHeaders([]);
    setDataRows([]);
    setMapping([]);
    setPaste('');
    setError(null);
  }

  // Les lignes à corriger d'abord : c'est ce que l'utilisateur doit voir sans défiler.
  const previewRows = [...rows]
    .sort((a, b) => Number(b.status === 'error') - Number(a.status === 'error'))
    .slice(0, 60);

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5"
      data-testid="guests-csv-import"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <h3 className="font-display text-lg font-semibold">{t('title')}</h3>
          <span className="text-xs text-[color:var(--color-muted)]">{t('subtitle')}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          {step === 'result' ? t('close') : t('cancel')}
        </Button>
      </div>

      <ol className="flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-[color:var(--color-muted)] uppercase">
        {STEPS.map((s, i) => {
          const active = s === step;
          const done = STEPS.indexOf(step) > i;
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-[9px]',
                  active
                    ? 'border-[color:var(--color-ink-900)] text-[color:var(--color-ink-900)]'
                    : done
                      ? 'border-[color:var(--color-sage-500)] text-[color:var(--color-sage-500)]'
                      : 'border-[color:var(--color-border)]',
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={2.4} /> : `0${i + 1}`}
              </span>
              {t(`steps.${s}`)}
            </li>
          );
        })}
      </ol>

      {error ? (
        <p role="alert" className="text-sm text-[color:var(--color-destructive)]">
          {error}
        </p>
      ) : null}

      {step === 'upload' ? (
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[color:var(--color-border-strong)] px-6 py-8 text-center focus-within:border-[color:var(--color-ink-900)]">
            <Upload
              className="h-6 w-6 text-[color:var(--color-muted)]"
              strokeWidth={1.6}
              aria-hidden
            />
            <span className="text-sm">{t('dropzone')}</span>
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              data-testid="guests-csv-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readCsvFile(f).then(ingest);
              }}
            />
          </label>
          <span className="text-center font-mono text-[10px] text-[color:var(--color-muted)]">
            {t('orPaste')}
          </span>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={4}
            placeholder={t('pastePlaceholder')}
            aria-label={t('pasteAria')}
            data-testid="guests-csv-paste"
            className="focus-ring rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 font-mono text-xs"
          />
          <p className="text-xs text-[color:var(--color-muted)]">{t('tip')}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {t('template')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!paste.trim()}
              onClick={() => ingest(paste)}
              data-testid="guests-csv-parse"
            >
              {t('parse')}
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Button>
          </div>
        </div>
      ) : step === 'map' ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {headers.map((h, i) => (
              <label
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate" title={h}>
                  {h || t('columnFallback', { n: i + 1 })}
                </span>
                <Select
                  value={mapping[i] ?? 'ignore'}
                  onValueChange={(v) =>
                    setMapping((m) => m.map((x, j) => (j === i ? (v as GuestField) : x)))
                  }
                >
                  <SelectTrigger
                    aria-label={t('mapColumn', { column: h || t('columnFallback', { n: i + 1 }) })}
                    className="focus-ring h-auto w-auto rounded-md border border-[color:var(--color-border)] px-2 py-1 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GUEST_FIELDS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {t(`fields.${f}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ))}
          </div>

          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[color:var(--color-muted)]">{t('defaultCountry')}</span>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger
                aria-label={t('defaultCountry')}
                className="focus-ring h-auto w-auto rounded-md border border-[color:var(--color-border)] px-2 py-1 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.flag} {c.name} (+{c.dial})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {!hasName ? (
            <p className="text-sm text-[color:var(--color-destructive)]">{t('needName')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[color:var(--color-muted)]">
                <span>
                  {t.rich('toImport', {
                    count: okRows.length,
                    b: (chunks) => <b className="text-[color:var(--color-ink-900)]">{chunks}</b>,
                  })}
                </span>
                {dupCount > 0 ? (
                  <span>
                    {t.rich('duplicates', {
                      count: dupCount,
                      b: (chunks) => <b className="text-[color:var(--color-warning)]">{chunks}</b>,
                    })}
                  </span>
                ) : null}
                {errorCount > 0 ? (
                  <span>
                    {t.rich('errorsCount', {
                      count: errorCount,
                      b: (chunks) => (
                        <b className="text-[color:var(--color-destructive)]">{chunks}</b>
                      ),
                    })}
                  </span>
                ) : null}
              </div>

              {overQuota ? (
                <p role="alert" className="text-sm text-[color:var(--color-destructive)]">
                  {t('quota', { remaining, count: okRows.length })}
                </p>
              ) : null}

              <div className="max-h-56 overflow-y-auto rounded-lg border border-[color:var(--color-border)]">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {previewRows.map((r) => (
                      <tr
                        key={r.line}
                        className={cn(
                          'border-b border-[color:var(--color-border)] last:border-0',
                          r.status === 'duplicate' && 'opacity-50',
                        )}
                      >
                        <td className="px-3 py-1.5">
                          {r.fullName || '—'}
                          {r.plusOnesAllowed > 0 ? ` +${r.plusOnesAllowed}` : ''}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[color:var(--color-muted)]">
                          {[r.phone, r.email].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {r.status === 'duplicate' ? (
                            <span className="font-mono text-[9px] text-[color:var(--color-warning)] uppercase">
                              {t('duplicateBadge')}
                            </span>
                          ) : r.status === 'error' ? (
                            <span className="text-[color:var(--color-destructive)]">
                              {t('lineError', {
                                line: r.line,
                                error: translateZodMessage(r.error, (k) => tRoot(k as never)),
                              })}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > previewRows.length ? (
                <p className="text-xs text-[color:var(--color-muted)]">
                  {t('previewTruncated', { shown: previewRows.length, total: rows.length })}
                </p>
              ) : null}
            </>
          )}

          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={pending}>
              <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t('back')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canImport}
              onClick={runImport}
              data-testid="guests-csv-import-submit"
            >
              {pending ? t('importing') : t('importCta', { count: okRows.length })}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-testid="guests-csv-result">
          <p className="text-base font-medium">{t('resultTitle', { count: result.created })}</p>
          {result.skipped > 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">
              {t('resultSkipped', { count: result.skipped })}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={onClose}>
              {t('close')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              {t('again')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
