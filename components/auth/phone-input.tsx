'use client';

import { forwardRef, useEffect, useState, type InputHTMLAttributes } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { splitE164 } from '@/lib/phone';
import type { Locale } from '@/i18n/routing';

export interface Country {
  code: string;
  dial: string;
  name: string;
  flag: string;
  /** Format typique d'un mobile local (sans indicatif), affiché en placeholder. */
  placeholder: string;
}

const FR: Country = {
  code: 'FR',
  dial: '33',
  name: 'France',
  flag: '🇫🇷',
  placeholder: '6 12 34 56 78',
};

export const COUNTRIES: ReadonlyArray<Country> = [
  FR,
  { code: 'BE', dial: '32', name: 'Belgique', flag: '🇧🇪', placeholder: '470 12 34 56' },
  { code: 'CH', dial: '41', name: 'Suisse', flag: '🇨🇭', placeholder: '78 123 45 67' },
  { code: 'LU', dial: '352', name: 'Luxembourg', flag: '🇱🇺', placeholder: '621 123 456' },
  { code: 'GB', dial: '44', name: 'United Kingdom', flag: '🇬🇧', placeholder: '7700 900123' },
  { code: 'US', dial: '1', name: 'United States', flag: '🇺🇸', placeholder: '555 123 4567' },
  { code: 'CA', dial: '1', name: 'Canada', flag: '🇨🇦', placeholder: '416 555 0123' },
  { code: 'IE', dial: '353', name: 'Ireland', flag: '🇮🇪', placeholder: '85 123 4567' },
  { code: 'ES', dial: '34', name: 'España', flag: '🇪🇸', placeholder: '612 34 56 78' },
  { code: 'PT', dial: '351', name: 'Portugal', flag: '🇵🇹', placeholder: '912 345 678' },
  { code: 'BR', dial: '55', name: 'Brasil', flag: '🇧🇷', placeholder: '11 91234 5678' },
  { code: 'IT', dial: '39', name: 'Italia', flag: '🇮🇹', placeholder: '320 123 4567' },
  { code: 'DE', dial: '49', name: 'Deutschland', flag: '🇩🇪', placeholder: '151 23456789' },
  { code: 'AT', dial: '43', name: 'Österreich', flag: '🇦🇹', placeholder: '664 1234567' },
  { code: 'NL', dial: '31', name: 'Nederland', flag: '🇳🇱', placeholder: '6 12345678' },
  {
    code: 'SA',
    dial: '966',
    name: 'المملكة العربية السعودية',
    flag: '🇸🇦',
    placeholder: '51 234 5678',
  },
  { code: 'AE', dial: '971', name: 'الإمارات', flag: '🇦🇪', placeholder: '50 123 4567' },
  { code: 'EG', dial: '20', name: 'مصر', flag: '🇪🇬', placeholder: '100 123 4567' },
  { code: 'SN', dial: '221', name: 'Sénégal', flag: '🇸🇳', placeholder: '77 123 45 67' },
  { code: 'CI', dial: '225', name: "Côte d'Ivoire", flag: '🇨🇮', placeholder: '07 12 34 56 78' },
  { code: 'MA', dial: '212', name: 'Maroc', flag: '🇲🇦', placeholder: '6 12 34 56 78' },
  { code: 'DZ', dial: '213', name: 'Algérie', flag: '🇩🇿', placeholder: '5 51 23 45 67' },
  { code: 'TN', dial: '216', name: 'Tunisie', flag: '🇹🇳', placeholder: '20 123 456' },
  { code: 'CM', dial: '237', name: 'Cameroun', flag: '🇨🇲', placeholder: '6 71 23 45 67' },
  { code: 'ML', dial: '223', name: 'Mali', flag: '🇲🇱', placeholder: '76 12 34 56' },
  { code: 'CD', dial: '243', name: 'RD Congo', flag: '🇨🇩', placeholder: '81 234 5678' },
  { code: 'CG', dial: '242', name: 'Congo', flag: '🇨🇬', placeholder: '06 123 45 67' },
  { code: 'BF', dial: '226', name: 'Burkina Faso', flag: '🇧🇫', placeholder: '70 12 34 56' },
  { code: 'GN', dial: '224', name: 'Guinée', flag: '🇬🇳', placeholder: '6 21 23 45 67' },
  { code: 'TG', dial: '228', name: 'Togo', flag: '🇹🇬', placeholder: '90 12 34 56' },
  { code: 'BJ', dial: '229', name: 'Bénin', flag: '🇧🇯', placeholder: '90 12 34 56' },
  { code: 'NE', dial: '227', name: 'Niger', flag: '🇳🇪', placeholder: '93 12 34 56' },
  { code: 'GA', dial: '241', name: 'Gabon', flag: '🇬🇦', placeholder: '06 03 12 34' },
  { code: 'MG', dial: '261', name: 'Madagascar', flag: '🇲🇬', placeholder: '32 12 345 67' },
  { code: 'MU', dial: '230', name: 'Maurice', flag: '🇲🇺', placeholder: '5251 2345' },
  { code: 'HT', dial: '509', name: 'Haïti', flag: '🇭🇹', placeholder: '34 10 1234' },
];

const LOCALE_TO_COUNTRY: Record<Locale, string> = {
  fr: 'FR',
  en: 'GB',
  es: 'ES',
  it: 'IT',
  pt: 'PT',
  de: 'DE',
  ar: 'SA',
};

const DIAL_CODES = COUNTRIES.map((c) => c.dial);

interface PhoneInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'name' | 'defaultValue'
> {
  name?: string;
  error?: string;
  defaultCountry?: string;
  /** Numéro E.164 initial (édition) — pré-remplit l'indicatif + le local. */
  defaultValue?: string;
  /** Notifié à chaque changement du numéro complet E.164 (ou '' si vide). */
  onValueChange?: (value: string) => void;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      className,
      error,
      id = 'phone',
      name = 'phone',
      defaultCountry,
      defaultValue,
      onValueChange,
      ...props
    },
    ref,
  ) => {
    const locale = useLocale() as Locale;
    const t = useTranslations('Auth');
    const parts = defaultValue ? splitE164(defaultValue, DIAL_CODES) : null;
    const fallbackCode = defaultCountry ?? LOCALE_TO_COUNTRY[locale] ?? FR.code;
    const initialCountry = parts
      ? (COUNTRIES.find((c) => c.dial === parts.dial) ?? FR)
      : (COUNTRIES.find((c) => c.code === fallbackCode) ?? FR);
    const [country, setCountry] = useState<Country>(initialCountry);
    const [local, setLocal] = useState(parts?.local ?? '');

    const describedBy = error ? `${id}-error` : undefined;
    const sanitizedLocal = local.replace(/[^\d]/g, '').replace(/^0+/, '');
    const fullPhone = sanitizedLocal ? `+${country.dial}${sanitizedLocal}` : '';

    useEffect(() => {
      onValueChange?.(fullPhone);
    }, [fullPhone, onValueChange]);

    function handleChange(value: string) {
      const trimmed = value.trimStart();
      if (trimmed.startsWith('+')) {
        const digits = trimmed.slice(1).replace(/[^\d]/g, '');
        const match = [...COUNTRIES]
          .sort((a, b) => b.dial.length - a.dial.length)
          .find((c) => digits.startsWith(c.dial));
        if (match) {
          setCountry(match);
          setLocal(digits.slice(match.dial.length));
          return;
        }
      }
      setLocal(value);
    }

    return (
      <div className="flex flex-col gap-1.5">
        <div
          className={cn(
            'flex h-11 items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] focus-within:ring-2 focus-within:ring-[color:var(--color-primary)]/40',
            error ? 'border-[color:var(--color-destructive)]' : '',
          )}
        >
          <Select
            value={country.code}
            onValueChange={(code) => {
              const next = COUNTRIES.find((c) => c.code === code);
              if (next) setCountry(next);
            }}
          >
            <SelectTrigger
              aria-label={t('countryCodeLabel')}
              className="h-full w-auto gap-1 rounded-l-lg rounded-r-none border-0 border-r border-[color:var(--color-border)] bg-transparent pr-2 pl-3 hover:border-[color:var(--color-border)]"
            >
              <span aria-hidden className="text-base leading-none">
                {country.flag}
              </span>
              <span className="text-sm text-[color:var(--color-muted)]">+{country.dial}</span>
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.flag} {c.name} (+{c.dial})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            ref={ref}
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            aria-invalid={!!error}
            aria-describedby={describedBy}
            value={local}
            onChange={(e) => handleChange(e.target.value)}
            className={cn(
              'h-full w-full bg-transparent px-3 text-sm outline-none placeholder:text-[color:var(--color-muted)]',
              className,
            )}
            placeholder={country.placeholder}
            {...props}
          />
          <input type="hidden" name={name} value={fullPhone} />
        </div>
        {error ? (
          <p id={describedBy} className="text-xs text-[color:var(--color-destructive)]">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
PhoneInput.displayName = 'PhoneInput';
