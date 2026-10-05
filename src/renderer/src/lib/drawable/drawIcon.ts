import { perfFlags } from '@renderer/lib/perf/flags';

import { iconCache } from './IconCache';

/**
 * ВРЕМЕННО (ветка perf/windows-matrix): способ отрисовки иконки выбирается флагом
 * perfFlags.icons. Аргументы как у ctx.drawImage(img, x, y, width, height)
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (perfFlags.icons === 'cache') {
    iconCache.draw(ctx, img, x, y, width, height);
  } else if (perfFlags.icons === 'svg') {
    ctx.drawImage(img, x, y, width, height);
  }
}
