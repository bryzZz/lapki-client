/**
 * Сценарии замеров холста. Общие для бенчмарка (npm run perf:bench) и прогона
 * в приложении (window.__perf.run()).
 *
 * Шаг сценария только подаёт ввод через те же обработчики, что и реальная мышь
 * (EditorView.handleMouse*), и помечает кадр «грязным». Рисует вызывающая сторона:
 * в бенчмарке — сразу после шага, в приложении — настоящий цикл рендера.
 */
import type { CanvasEditor } from '@renderer/lib/CanvasEditor';
import type { State } from '@renderer/lib/drawable';
import type { MyMouseEvent } from '@renderer/lib/types/mouse';

export type Scenario = {
  name: string;
  description: string;
  /** Подготовка; может вернуть функцию завершения (например, отпустить кнопку мыши) */
  setup: (editor: CanvasEditor) => void | (() => void);
  step: (editor: CanvasEditor, i: number) => void;
};

function mouseEvent(x: number, y: number, extra: Partial<MyMouseEvent> = {}): MyMouseEvent {
  return {
    x,
    y,
    dx: 0,
    dy: 0,
    left: false,
    right: false,
    button: 0,
    stopPropagation: () => undefined,
    nativeEvent: {} as MouseEvent,
    ...extra,
  };
}

function resetCamera(editor: CanvasEditor) {
  editor.view.viewCentering();
}

function getStates(editor: CanvasEditor) {
  return [...editor.controller.states.data.states.values()] as State[];
}

function findDeepestState(editor: CanvasEditor) {
  return getStates(editor).reduce((a, b) => (b.getDepth() > a.getDepth() ? b : a));
}

/** Корневое состояние с самым большим числом вложенных состояний */
function findBiggestRoot(editor: CanvasEditor) {
  const sizes = new Map<State, number>();
  for (const state of getStates(editor)) {
    let root = state;
    while (root.parent) root = root.parent as State;
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  return [...sizes.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/** Ставит камеру так, чтобы состояние было в центре экрана, и возвращает точку на его заголовке */
function focusOn(editor: CanvasEditor, state: State) {
  const controller = editor.controller;
  const scale = controller.scale;
  const world = state.compoundPosition;
  // window = (world + offset) / scale  =>  offset = window * scale - world
  controller.offset = {
    x: (editor.canvas.width / 2) * scale - world.x,
    y: (editor.canvas.height / 2) * scale - world.y,
  };
  editor.view.isDirty = true;
  const pos = state.computedPosition;
  return { x: pos.x + 15, y: pos.y + 10 };
}

// Простой детерминированный ГПСЧ, чтобы прогоны были одинаковыми
function createRandom(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** Направление движения на шаге i: туда-обратно, чтобы за 40 шагов вернуться в исходную точку */
const direction = (i: number) => (i % 40 < 20 ? 1 : -1);

function createDragScenario(
  name: string,
  description: string,
  findTarget: (editor: CanvasEditor) => State
): Scenario {
  let cursor = { x: 0, y: 0 };

  return {
    name,
    description,
    setup: (editor) => {
      resetCamera(editor);
      const target = findTarget(editor);
      cursor = focusOn(editor, target);
      editor.view.handleMouseDown(mouseEvent(cursor.x, cursor.y, { left: true }));

      const captured = (editor.view as unknown as { mouseDownNode: State | null }).mouseDownNode;
      if (captured?.id !== target.id) {
        throw new Error(`Захватилось ${captured?.id ?? 'ничего'} вместо ${target.id}`);
      }

      return () => editor.view.handleMouseUp(mouseEvent(cursor.x, cursor.y, { left: true }));
    },
    step: (editor, i) => {
      const dx = 3 * direction(i);
      const dy = direction(i);
      cursor = { x: cursor.x + dx, y: cursor.y + dy };
      editor.view.handleMouseMove(mouseEvent(cursor.x, cursor.y, { dx, dy, left: true }));
    },
  };
}

export function createScenarios(): Scenario[] {
  const random = createRandom(42);

  return [
    {
      name: 'frame',
      description: 'Полная перерисовка кадра без изменений',
      setup: resetCamera,
      step: (editor) => {
        editor.view.isDirty = true;
      },
    },
    {
      name: 'pan',
      description: 'Панорамирование правой кнопкой',
      setup: resetCamera,
      step: (editor, i) => {
        const dx = 5 * direction(i);
        editor.view.handleMouseMove(mouseEvent(500, 500, { dx, dy: 0, right: true }));
      },
    },
    {
      name: 'zoom',
      description: 'Зум (смена масштаба + перерисовка)',
      setup: resetCamera,
      step: (editor, i) => {
        const scale = 1 + 0.5 * Math.sin(i / 5);
        editor.view.setScale(Number(scale.toFixed(2)));
      },
    },
    {
      name: 'hover',
      description: 'Движение мыши без кнопок (хит-тест под курсором)',
      setup: resetCamera,
      step: (editor) => {
        const x = random() * editor.canvas.width;
        const y = random() * editor.canvas.height;
        editor.view.handleMouseMove(mouseEvent(x, y, { dx: 1, dy: 1 }));
      },
    },
    createDragScenario(
      'drag-nested',
      'Перетаскивание самого глубоко вложенного состояния',
      findDeepestState
    ),
    createDragScenario(
      'drag-parent',
      'Перетаскивание корневого состояния с самым большим поддеревом',
      findBiggestRoot
    ),
  ];
}

export function percentile(sorted: number[], p: number) {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}
