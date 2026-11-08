import { QR_QUIET_ZONE, qrModules, qrPathData } from '@/lib/qr';

/**
 * QR code scannable (SVG). Fond blanc et modules quasi noirs en dur, quel que
 * soit le thème : un lecteur a besoin d'un contraste fort, pas d'une couleur
 * d'accent. La zone de silence est incluse dans le `viewBox`.
 */
export function GuestQr({
  value,
  label,
  className,
}: {
  /** Texte encodé : le `qrCodeToken` de l'invité, tel que le scanner de check-in le relit. */
  value: string;
  /** Texte alternatif lu par les lecteurs d'écran. */
  label: string;
  className?: string;
}) {
  const modules = qrModules(value);
  const total = modules.length + QR_QUIET_ZONE * 2;

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={className}
      data-testid="guest-qr"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path
        transform={`translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})`}
        d={qrPathData(modules)}
        fill="#111111"
      />
    </svg>
  );
}
