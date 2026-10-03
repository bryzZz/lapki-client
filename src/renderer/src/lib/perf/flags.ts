/**
 * ВРЕМЕННО, только для ветки perf/windows-matrix: переключатели оптимизаций,
 * чтобы замерить в одной сборке все варианты (см. window.__perf.runMatrix()).
 *
 * nesting — линейная геометрия вложенности (Shape.computedWidth/childrenContainerHeight)
 * culling — отсечение невидимых фигур (EditorView.draw)
 * tooltip — hit-test подсказок без лишних вызовов (EditorView.handleMouseMove)
 * bounds — Shape.drawBounds без двойного spread
 */
export const perfFlags = {
  nesting: true,
  culling: true,
  tooltip: true,
  bounds: true,
};

export type PerfFlags = typeof perfFlags;
