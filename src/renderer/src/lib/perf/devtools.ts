/**
 * Инструменты замера производительности холста прямо в приложении.
 *
 *  - Ctrl+Shift+F — FPS-оверлей в правом верхнем углу;
 *  - window.__perf.run() в консоли DevTools — автоматический прогон сценариев
 *    из scenarios.ts на открытом сейчас холсте; результат печатается таблицей
 *    и копируется в буфер обмена в виде markdown.
 *
 * Пока их не вызвали, ничего не делают. Подробнее: docs/perf.md
 */
import type { CanvasEditor } from '@renderer/lib/CanvasEditor';
import { ModelController } from '@renderer/lib/data/ModelController';

import { PerfFlags, perfFlags } from './flags';
import { frameStats } from './frameStats';
import { createScenarios, percentile } from './scenarios';

const WARMUP_STEPS = 20;
// WARMUP_STEPS + STEPS кратно 40: перетаскиваемое состояние возвращается на место
const STEPS = 60;

type RunOptions = {
  /** Какие сценарии гонять, по умолчанию все */
  scenarios?: string[];
};

type RunResult = {
  scenario: string;
  fps: number;
  frameP50: number;
  frameP95: number;
  frameMax: number;
  drawP50: number;
  drawP95: number;
  drawMax: number;
  draws: number;
};

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const round = (value: number) => Math.round(value * 10) / 10;

/** Холст, который сейчас виден пользователю */
function getVisibleEditor(): CanvasEditor | null {
  const model = ModelController.instance;
  if (!model) return null;

  const mounted = Object.values(model.controllers).filter((c) => c.isMounted);
  const visible = mounted.find((c) => c.app.canvas.element.offsetParent !== null);
  return (visible ?? mounted[0])?.app ?? null;
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: round(percentile(sorted, 50) ?? 0),
    p95: round(percentile(sorted, 95) ?? 0),
    max: round(sorted[sorted.length - 1] ?? 0),
  };
}

function describeDocument(editor: CanvasEditor) {
  const states = [...editor.controller.states.data.states.values()];
  const depth = states.reduce((max, state) => Math.max(max, state.getDepth() + 1), 0);
  const transitions = editor.controller.transitions.items.size;
  return `${states.length} состояний, ${transitions} переходов, глубина ${depth}`;
}

function toMarkdown(editor: CanvasEditor, results: RunResult[]) {
  const { width, height } = editor.canvas;
  return [
    `Холст ${width}×${height}, ${describeDocument(editor)}, ${
      navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? ''
    }`,
    '',
    '| Сценарий | FPS | кадр p50 | кадр p95 | кадр max | отрисовка p50 | отрисовка p95 | отрисовка max | отрисовок |',
    '|---|---|---|---|---|---|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.scenario} | ${r.fps} | ${r.frameP50} | ${r.frameP95} | ${r.frameMax} | ` +
        `${r.drawP50} | ${r.drawP95} | ${r.drawMax} | ${r.draws} |`
    ),
    '',
    'кадр — интервал между requestAnimationFrame (всё вместе, мс); отрисовка — время view.draw (мс)',
  ].join('\n');
}

let running = false;

function getEditorForRun() {
  if (running) throw new Error('Прогон уже идёт');
  const editor = getVisibleEditor();
  if (!editor) throw new Error('Не найден открытый холст — откройте схему');
  if (editor.controller.states.data.states.size === 0) {
    throw new Error('На открытом холсте нет состояний — откройте вкладку с машиной состояний');
  }
  return editor;
}

function selectScenarios(options: RunOptions) {
  return createScenarios().filter((s) => !options.scenarios || options.scenarios.includes(s.name));
}

/** Прогоняет сценарии на холсте и возвращает камеру и настройки как было */
async function measureScenarios(
  editor: CanvasEditor,
  scenarios: ReturnType<typeof createScenarios>,
  label = ''
) {
  const controller = editor.controller;
  const camera = { offset: { ...controller.offset }, scale: controller.scale };
  const animations = editor.settings.animations;
  editor.settings = { ...editor.settings, animations: false };

  const results: RunResult[] = [];

  try {
    for (const scenario of scenarios) {
      overlay.setStatus(`прогон: ${label}${scenario.name}`);
      const teardown = scenario.setup(editor);
      await nextFrame();
      await nextFrame();

      for (let i = 0; i < WARMUP_STEPS; i++) {
        scenario.step(editor, i);
        await nextFrame();
      }

      const intervals: number[] = [];
      const start = performance.now();
      let last = await nextFrame();
      for (let i = 0; i < STEPS; i++) {
        scenario.step(editor, WARMUP_STEPS + i);
        const now = await nextFrame();
        intervals.push(now - last);
        last = now;
      }
      // Даём циклу рендера дорисовать последний кадр
      await nextFrame();
      const draws = frameStats.drawsSince(start);

      teardown?.();

      const frame = stats(intervals);
      const draw = stats(draws);
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      results.push({
        scenario: scenario.name,
        fps: Math.round(1000 / mean),
        frameP50: frame.p50,
        frameP95: frame.p95,
        frameMax: frame.max,
        drawP50: draw.p50,
        drawP95: draw.p95,
        drawMax: draw.max,
        draws: draws.length,
      });
    }
  } finally {
    controller.offset = camera.offset;
    editor.view.setScale(camera.scale);
    editor.settings = { ...editor.settings, animations };
    editor.view.isDirty = true;
  }

  return results;
}

async function publish(markdown: string, command: string) {
  console.log(markdown);
  try {
    await navigator.clipboard.writeText(markdown);
    console.log('Таблица скопирована в буфер обмена');
  } catch {
    console.log(
      'Не удалось скопировать в буфер обмена (фокус в DevTools). ' +
        `Выполните copy(await ${command}) или скопируйте текст выше`
    );
  }
  return markdown;
}

async function run(options: RunOptions = {}) {
  const editor = getEditorForRun();
  running = true;
  try {
    const results = await measureScenarios(editor, selectScenarios(options));
    console.table(results);
    return await publish(toMarkdown(editor, results), '__perf.run()');
  } finally {
    running = false;
    overlay.setStatus('');
  }
}

// ВРЕМЕННО (ветка perf/windows-matrix): все комбинации оптимизаций в одной сборке
const VARIANTS: { name: string; flags: PerfFlags }[] = [
  { name: 'baseline', flags: { nesting: false, culling: false, tooltip: false } },
  { name: 'P1', flags: { nesting: true, culling: false, tooltip: false } },
  { name: 'P2', flags: { nesting: false, culling: true, tooltip: false } },
  { name: 'P3', flags: { nesting: false, culling: false, tooltip: true } },
  { name: 'P1+P2', flags: { nesting: true, culling: true, tooltip: false } },
  { name: 'P1+P2+P3', flags: { nesting: true, culling: true, tooltip: true } },
];

/** Средний интервал кадров в простое — частота обновления монитора */
async function measureRefreshRate() {
  const times: number[] = [];
  for (let i = 0; i < 31; i++) times.push(await nextFrame());
  const intervals = times.slice(1).map((t, i) => t - times[i]);
  return Math.round(
    1000 /
      (percentile(
        [...intervals].sort((a, b) => a - b),
        50
      ) ?? 16.7)
  );
}

function getGpu() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    if (!gl || !info) return 'неизвестно (нет WebGL)';
    return String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  } catch {
    return 'неизвестно';
  }
}

async function describeEnvironment(editor: CanvasEditor) {
  const ua = navigator.userAgent;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return [
    `- Схема: ${describeDocument(editor)}`,
    `- Холст: ${editor.canvas.width}×${editor.canvas.height}, окно ${window.innerWidth}×${window.innerHeight}`,
    `- Экран: ${screen.width}×${screen.height}, devicePixelRatio ${
      window.devicePixelRatio
    }, частота ~${await measureRefreshRate()} Гц`,
    `- Видеокарта (WebGL): ${getGpu()}`,
    `- Процессор: ${navigator.hardwareConcurrency} потоков; память: ${
      memory ? `≥${memory} ГБ` : 'неизвестно'
    }`,
    `- ${ua.match(/Electron\/[\d.]+/)?.[0] ?? 'Electron ?'}, ${
      ua.match(/Chrome\/[\d.]+/)?.[0] ?? ''
    }, ${ua.match(/\(([^)]+)\)/)?.[1] ?? ''}`,
  ].join('\n');
}

async function runMatrix(options: RunOptions = {}) {
  const editor = getEditorForRun();
  running = true;
  const saved = { ...perfFlags };
  const scenarios = selectScenarios(options);
  const results: Record<string, RunResult[]> = {};

  try {
    const environment = await describeEnvironment(editor);

    // Прогрев всех вариантов без замера: иначе первый вариант (baseline) попадает
    // на холодный JIT и выглядит хуже, чем есть
    const warmup = createScenarios().filter((s) => ['frame', 'drag-nested'].includes(s.name));
    for (const variant of VARIANTS) {
      Object.assign(perfFlags, variant.flags);
      await measureScenarios(editor, warmup, `прогрев ${variant.name}: `);
    }

    for (const variant of VARIANTS) {
      Object.assign(perfFlags, variant.flags);
      results[variant.name] = await measureScenarios(editor, scenarios, `${variant.name}: `);
    }

    const names = VARIANTS.map((v) => v.name);
    const pivot = (title: string, pick: (r: RunResult) => number) => [
      `**${title}**`,
      '',
      `| Сценарий | ${names.join(' | ')} |`,
      `|---|${names.map(() => '---').join('|')}|`,
      ...scenarios.map(
        (s, i) => `| ${s.name} | ${names.map((n) => pick(results[n][i])).join(' | ')} |`
      ),
      '',
    ];

    const markdown = [
      '## Матрица замеров',
      '',
      environment,
      '',
      'Варианты: P1 — линейная геометрия вложенности, P2 — отсечение невидимого, P3 — hit-test подсказок без лишних вызовов. Все варианты в одной сборке, переключаются флагами.',
      '',
      ...pivot('Отрисовка p50, мс', (r) => r.drawP50),
      ...pivot('Кадр p50, мс', (r) => r.frameP50),
      ...pivot('Кадр p95, мс', (r) => r.frameP95),
      ...pivot('FPS', (r) => r.fps),
      '### Полные таблицы',
      '',
      ...VARIANTS.flatMap((v) => [`#### ${v.name}`, '', toMarkdown(editor, results[v.name]), '']),
    ].join('\n');

    return await publish(markdown, '__perf.runMatrix()');
  } finally {
    Object.assign(perfFlags, saved);
    editor.view.isDirty = true;
    running = false;
    overlay.setStatus('');
  }
}

/** Плашка с FPS: частота кадров браузера и время отрисовки холста за последнюю секунду */
const overlay = (() => {
  let element: HTMLDivElement | null = null;
  let status = '';
  let frames: number[] = [];
  let rafId = 0;
  let timerId: ReturnType<typeof setInterval> | undefined;

  const loop = (time: number) => {
    frames.push(time);
    rafId = requestAnimationFrame(loop);
  };

  const render = () => {
    if (!element) return;
    const now = performance.now();
    frames = frames.filter((t) => now - t <= 1000);
    const draws = frameStats.drawsSince(now - 1000);
    const draw = stats(draws);
    element.textContent =
      `FPS ${frames.length}\n` +
      `отрисовок/с ${draws.length}\n` +
      `отрисовка p50 ${draw.p50} мс\n` +
      `отрисовка max ${draw.max} мс` +
      (status ? `\n${status}` : '');
  };

  const show = () => {
    element = document.createElement('div');
    Object.assign(element.style, {
      position: 'fixed',
      top: '8px',
      right: '8px',
      zIndex: '100000',
      padding: '6px 8px',
      font: '12px/1.4 monospace',
      whiteSpace: 'pre',
      color: '#fff',
      background: 'rgba(0, 0, 0, 0.7)',
      borderRadius: '4px',
      pointerEvents: 'none',
    });
    document.body.append(element);
    rafId = requestAnimationFrame(loop);
    timerId = setInterval(render, 250);
    render();
  };

  const hide = () => {
    cancelAnimationFrame(rafId);
    clearInterval(timerId);
    element?.remove();
    element = null;
    frames = [];
  };

  return {
    toggle: () => (element ? hide() : show()),
    setStatus: (value: string) => {
      status = value;
      render();
    },
  };
})();

declare global {
  interface Window {
    __perf?: {
      run: typeof run;
      runMatrix: typeof runMatrix;
      overlay: () => void;
      scenarios: string[];
    };
  }
}

export function installPerfDevtools() {
  if (window.__perf) return;

  window.__perf = {
    run,
    runMatrix,
    overlay: overlay.toggle,
    scenarios: createScenarios().map((s) => s.name),
  };

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyF') {
      event.preventDefault();
      overlay.toggle();
    }
  });
}
