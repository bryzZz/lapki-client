import { CanvasEditor } from '@renderer/lib/CanvasEditor';
import { DEFAULT_TRANSITION_COLOR } from '@renderer/lib/constants';
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

  constructor(private app: CanvasEditor) {}

  draw(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement) {
    if (!this.source || !this.target) return;

    const sourceBounds = this.source.drawBounds;

    const line = getLine(
      { ...sourceBounds, height: sourceBounds.height + sourceBounds.childrenHeight },
      {
        ...this.target,
        width: 1,
        height: 1,
      },
      10
    );

    ctx.lineWidth = transitionStyle.width;
    ctx.fillStyle = DEFAULT_TRANSITION_COLOR;

    drawCurvedLine(ctx, line, 12 / this.app.model.data.scale);
    drawCircle(ctx, {
      position: line.start,
      radius: transitionStyle.startSize / this.app.model.data.scale,
      fillStyle: DEFAULT_TRANSITION_COLOR,
    });
    drawTriangle(ctx, line.end, 10 / this.app.model.data.scale, degrees_to_radians(line.ee));
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
