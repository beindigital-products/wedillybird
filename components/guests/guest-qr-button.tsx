'use client';

import { Download, QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { qrImagePath } from '@/lib/guests/qr';

/** Nom de fichier sûr pour le téléchargement : « qr-aminata-diallo.png ». */
function downloadName(fullName: string): string {
  const slug = fullName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `qr-${slug || 'invite'}.png`;
}

/**
 * Bouton « QR » d'une fiche invité : ouvre le QR d'entrée de l'invité en grand
 * (à présenter à l'écran, imprimer ou envoyer soi-même) avec un téléchargement
 * PNG. C'est l'image que le scanner du check-in sait lire.
 */
export function GuestQrButton({ token, name }: { token: string; name: string }) {
  const t = useTranslations('Guests.qr');
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-testid="guest-qr-open"
          aria-label={t('openAria', { name })}
        >
          <QrCode className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t('open')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col items-center gap-4">
          {/* Image servie par /api/qr : un `<img>` simple suffit (pas d'optimisation utile sur un QR). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImagePath(token)}
            alt={t('alt', { name })}
            width={280}
            height={280}
            data-testid="guest-qr-image"
            className="h-70 w-70 rounded-xl border border-[color:var(--color-border)] bg-white"
          />
          <a
            href={qrImagePath(token)}
            download={downloadName(name)}
            data-testid="guest-qr-download"
            className="focus-ring inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-strong)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[color:var(--color-surface-elevated)]"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t('download')}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
