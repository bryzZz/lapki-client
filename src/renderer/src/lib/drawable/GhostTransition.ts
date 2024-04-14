import { EditorView } from '@renderer/lib/basic';
import { State } from '@renderer/lib/drawable';
import { transitionStyle } from '@renderer/lib/styles';
import { Point } from '@renderer/lib/types/graphics';
import {
  degrees_to_radians,
  drawCircle,
  drawCurvedLine,
  drawTriangle,
  getLine,
} from '@renderer/lib/utils';

/**
 * Неоформленный («призрачный») переход.
 * Используется для визуализации создаваемого перехода.
 */
export class GhostTransition {
  source!: State | null;
  target!: Point | null;

  constructor(public editorView: EditorView) {}

  draw(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement) {
    if (!this.source || !this.target) return;

    const sourceBounds = this.source.drawBounds;

    const line = getLine(
      sourceBounds,
      {
        ...this.target,
        width: 1,
        height: 1,
      },
      10
    );

    ctx.lineWidth = transitionStyle.width;

    drawCurvedLine(ctx, line, 12 / this.editorView.app.model.data.scale);
    drawCircle(ctx, line.start, transitionStyle.startSize / this.editorView.app.model.data.scale);
    drawTriangle(
      ctx,
      line.end,
      10 / this.editorView.app.model.data.scale,
      degrees_to_radians(line.ee)
    );
  }

  setSource(state: State) {
    this.source = state;
  }

  setTarget(target: Point) {
    this.target = target;
  }

  clear() {
    this.source = null;
    this.target = null;
  }
}
