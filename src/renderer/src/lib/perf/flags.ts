/**
 * ВРЕМЕННО, только для ветки perf/windows-matrix: переключатели оптимизаций,
 * чтобы замерить в одной сборке все варианты (см. window.__perf.runMatrix()).
 *
 * nesting - линейная геометрия вложенности (Shape.computedWidth/childrenContainerHeight)
 * culling - отсечение невидимых фигур (EditorView.draw)
 * tooltip - hit-test подсказок без лишних вызовов (EditorView.handleMouseMove)
 * bounds - Shape.drawBounds без двойного spread
 * icons - как рисовать иконки (P11): svg - как в main, cache - кеш растров IconCache,
 *   off - не рисовать (замер, сколько стоят иконки)
 */
export type IconMode = 'svg' | 'cache' | 'off';

export const perfFlags = {
  nesting: true,
  culling: true,
  tooltip: true,
  bounds: true,
  icons: 'cache' as IconMode,
};

export type PerfFlags = typeof perfFlags;
