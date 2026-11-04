'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, Download, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COUNTRIES } from '@/components/auth/phone-input';
import { cn } from '@/lib/cn';
import {
  GUEST_CSV_TEMPLATE,
  GUEST_IMPORT_FIELDS,
  autoMapGuestColumns,
  buildGuestRows,
  decodeCsvBuffer,
  parseCsv,
  type GuestImportField,
} from '@/lib/guests/import';
import { MAX_IMPORT_ROWS } from '@/lib/guests/rules';
import { importGuestsAction } from '@/app/[locale]/(app)/events/[eventId]/guests/actions';

const STEPS = ['upload', 'map', 'result'] as const;
type Step = (typeof STEPS)[number];

const DEFAULT_COUNTRY = 'FR';
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${GUEST_CSV_TEMPLATE}`)}`;

interface Props {
  eventId: string;
  /** Invités déjà sur l'événement — sert à repérer les doublons dans l'aperçu. */
  existingGuests: ReadonlyArray<{ fullName: string; phone?: string; email?: string }>;
  /** Fiches encore disponibles avant le plafond de l'événement. */
  remaining: number;
}

export function GuestsImport({ eventId, existingGuests, remaining }: Props) {
  const t = useTranslations('Guests.import');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<GuestImportField[]>([]);
  const [paste, setPaste] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [markConfirmed, setMarkConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState({ imported: 0, skipped: 0 });
  const [pending, startTransition] = useTransition();

  const defaultDial = COUNTRIES.find((c) => c.code === country)?.dial ?? '33';

  const rows = useMemo(
    () =>
      step === 'map'
        ? buildGuestRows(dataRows, mapping, { defaultDial, existing: existingGuests, remaining })
        : [],
    [step, dataRows, mapping, defaultDial, existingGuests, remaining],
  );
  const ready = rows.filter((r) => r.status === 'ready');
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const hasName = mapping.includes('fullName') || mapping.includes('firstName');
  const tooMany = ready.length > MAX_IMPORT_ROWS;

  function ingest(text: string) {
    setError(null);
    const all = parseCsv(text);
    if (all.length < 2) {
      setError(t('errors.empty'));
      return;
    }
    setHeaders(all[0]!);
    setDataRows(all.slice(1));
    setMapping(autoMapGuestColumns(all[0]!));
    setStep('map');
  }

  function reset() {
    setStep('upload');
    setHeaders([]);
    setDataRows([]);
    setMapping([]);
    setPaste('');
    setError(null);
  }

  function runImport() {
    setError(null);
    startTransition(async () => {
      const res = await importGuestsAction(eventId, {
        markConfirmed,
        rows: ready.map((r) => ({
          fullName: r.fullName,
          ...(r.phone ? { phone: r.phone } : {}),
          ...(r.email ? { email: r.email } : {}),
          ...(r.category ? { category: r.category } : {}),
          plusOnesAllowed: r.plusOnesAllowed,
        })),
      });
      if (!res.ok) {
        setError(res.error === 'IMPORT_TOO_LARGE' ? t('errors.tooLarge') : t('errors.submit'));
        return;
      }
      setResult({
        imported: res.imported,
        skipped: rows.length - ready.length + res.skipped.length,
      });
      setStep('result');
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="import-open">
          <FileUp className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t('open')}
        </Button>
      </div>
    );
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5"
      data-testid="guests-import"
      aria-label={t('title')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg font-semibold">{t('title')}</h3>
          <p className="text-sm text-[color:var(--color-muted)]">{t('intro')}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          {t('close')}
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
                    ? 'border-[color:var(--color-primary)] text-[color:var(--color-primary)]'
                    : done
                      ? 'border-[color:var(--color-sage-500)] text-[color:var(--color-sage-500)]'
                      : 'border-[color:var(--color-border)]',
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={2.4} /> : `0${i + 1}`}
              </span>
              {t(`steps.${s}`)}
              {i < STEPS.length - 1 ? <span aria-hidden>·</span> : null}
            </li>
          );
        })}
      </ol>

      {step === 'upload' ? (
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[color:var(--color-border-strong)] px-6 py-8 text-center focus-within:border-[color:var(--color-primary)]">
            <Upload
              className="h-6 w-6 text-[color:var(--color-muted)]"
              strokeWidth={1.6}
              aria-hidden
            />
            <span className="text-sm">{t('dropzone')}</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              data-testid="import-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void f.arrayBuffer().then((buf) => ingest(decodeCsvBuffer(buf)));
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
            data-testid="import-paste"
            className="focus-ring rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 font-mono text-xs"
          />
          {error ? (
            <p role="alert" className="text-sm text-[color:var(--color-danger)]">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a
              href={TEMPLATE_HREF}
              download="modele-invites.csv"
              className="focus-ring inline-flex items-center gap-1.5 text-sm text-[color:var(--color-primary)] underline-offset-4 hover:underline"
              data-testid="import-template"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {t('template')}
            </a>
            <Button
              type="button"
              size="md"
              disabled={!paste.trim()}
              onClick={() => ingest(paste)}
              data-testid="import-parse"
            >
              {t('parse')}
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'map' ? (
        <div className="flex flex-col gap-4">
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
                    setMapping((m) => m.map((x, j) => (j === i ? (v as GuestImportField) : x)))
                  }
                >
                  <SelectTrigger
                    aria-label={t('mapColumn', { column: h || t('columnFallback', { n: i + 1 }) })}
                    className="focus-ring h-auto w-auto rounded-md border border-[color:var(--color-border)] px-2 py-1 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GUEST_IMPORT_FIELDS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {t(`fields.${f}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--color-border)] p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">{t('defaultCountry')}</span>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger
                  aria-label={t('defaultCountry')}
                  className="focus-ring h-auto w-auto rounded-md border border-[color:var(--color-border)] px-2 py-1 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {`${c.flag} ${c.name} (+${c.dial})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="import-confirmed"
                checked={markConfirmed}
                onCheckedChange={(v) => setMarkConfirmed(v === true)}
                data-testid="import-confirmed"
              />
              <label htmlFor="import-confirmed" className="flex flex-col gap-0.5 text-sm">
                <span>{t('markConfirmed')}</span>
                <span className="text-xs text-[color:var(--color-muted)]">
                  {t('markConfirmedHint')}
                </span>
              </label>
            </div>
          </div>

          {!hasName ? (
            <p role="alert" className="text-sm text-[color:var(--color-danger)]">
              {t('errors.noNameColumn')}
            </p>
          ) : (
            <div
              className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[color:var(--color-muted)]"
              data-testid="import-summary"
            >
              <span className="text-[color:var(--color-ink-900)]">
                {t('summaryReady', { count: ready.length })}
              </span>
              {count('duplicate') > 0 ? (
                <span>{t('summaryDuplicate', { count: count('duplicate') })}</span>
              ) : null}
              {count('invalid') > 0 ? (
                <span className="text-[color:var(--color-danger)]">
                  {t('summaryInvalid', { count: count('invalid') })}
                </span>
              ) : null}
              {count('limit') > 0 ? (
                <span className="text-[color:var(--color-danger)]">
                  {t('summaryLimit', { count: count('limit') })}
                </span>
              ) : null}
            </div>
          )}

          {hasName ? (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-[color:var(--color-border)]">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr
                      key={i}
                      data-testid="import-row"
                      data-status={r.status}
                      className={cn(
                        'border-b border-[color:var(--color-border)] last:border-0',
                        r.status !== 'ready' && 'opacity-60',
                      )}
                    >
                      <td className="px-3 py-1.5">{r.fullName || '—'}</td>
                      <td className="px-3 py-1.5 font-mono text-[color:var(--color-muted)]">
                        {[r.phone, r.email].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[9px] uppercase">
                        {r.status === 'duplicate' ? t('badgeDuplicate') : null}
                        {r.status === 'limit' ? t('badgeLimit') : null}
                        {r.status === 'invalid' && r.problem ? (
                          <span className="text-[color:var(--color-danger)]">
                            {t(`problems.${r.problem}`)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {tooMany ? (
            <p role="alert" className="text-sm text-[color:var(--color-danger)]">
              {t('errors.tooMany', { max: MAX_IMPORT_ROWS })}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-[color:var(--color-danger)]">
              {error}
            </p>
          ) : null}

          <div className="flex justify-between">
            <Button type="button" variant="ghost" size="md" onClick={reset}>
              <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t('back')}
            </Button>
            <Button
              type="button"
              size="md"
              disabled={pending || !hasName || ready.length === 0 || tooMany}
              onClick={runImport}
              data-testid="import-run"
            >
              {pending ? t('importing') : t('importCta', { count: ready.length })}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'result' ? (
        <div
          className="flex flex-col items-center gap-3 py-6 text-center"
          data-testid="import-result"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--color-sage-500)]/15 text-[color:var(--color-sage-500)]">
            <Check className="h-6 w-6" strokeWidth={2.2} aria-hidden />
          </span>
          <span className="font-display text-lg italic">
            {t('resultImported', { count: result.imported })}
          </span>
          {result.skipped > 0 ? (
            <span className="text-xs text-[color:var(--color-muted)]">
              {t('resultSkipped', { count: result.skipped })}
            </span>
          ) : null}
          <Button type="button" variant="outline" size="md" onClick={reset}>
            {t('importAnother')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
