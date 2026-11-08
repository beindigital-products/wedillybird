/**
 * Génération de QR codes — helpers purs (aucune dépendance React), testables.
 *
 * Le rendu est un SVG dessiné par nos soins à partir de la matrice de modules
 * (pas de `dangerouslySetInnerHTML`, pas d'image, fonctionne en composant
 * serveur). La bibliothèque `uqr` ne fait que l'encodage (Reed-Solomon, masques).
 */

import { encode } from 'uqr';

/** Zone de silence réglementaire autour du code, en modules (norme QR : 4). */
export const QR_QUIET_ZONE = 4;

/**
 * Matrice de modules (`true` = module sombre), sans bordure.
 * Niveau de correction `M` (15 %) : bon compromis entre robustesse à l'écran
 * (reflets, capture d'écran compressée) et densité pour un scan rapide.
 */
export function qrModules(value: string): boolean[][] {
  return encode(value, { ecc: 'M', border: 0 }).data;
}

/**
 * Chemin SVG des modules sombres. Les modules adjacents d'une même ligne sont
 * fusionnés en un seul rectangle (`h{run}`) : ~3× moins de commandes qu'un
 * `<rect>` par module, pour un rendu identique.
 */
export function qrPathData(modules: boolean[][]): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return parts.join('');
}
