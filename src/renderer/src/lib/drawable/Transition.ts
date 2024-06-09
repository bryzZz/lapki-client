import { picto, Shape } from '@renderer/lib/drawable';
import { stateStyle, transitionStyle } from '@renderer/lib/styles';
import {
  degrees_to_radians,
  drawCircle,
  drawCurvedLine,
  drawTriangle,
  getLine,
} from '@renderer/lib/utils';
import { prepareText, drawText } from '@renderer/lib/utils/text';
import { getColor } from '@renderer/theme';

import { CanvasEditor } from '../CanvasEditor';
import { serializeTransitionActions } from '../data/GraphmlBuilder';

/**
 * Переход между состояниями.
 * Выполняет отрисовку стрелки между тремя движущимися блоками:
 * источник, назначение, а также условие перехода.
 */
export class Transition extends Shape {
  isSelected = false;
  private textData = {
    height: 100,
    textArray: [] as string[],
  };

  constructor(app: CanvasEditor, id: string) {
    super(app, id);

    if (this.app.textMode) {
      this.prepareText();
    }
  }

  get data() {
    return this.app.model.data.elements.transitions[this.id];
  }

  get source() {
    const state = this.app.controller.states.get(this.data.source);

    if (!state) {
      throw new Error(`State with id ${this.data.source} does not exist`);
    }

    return state;
  }

  get target() {
    const state = this.app.controller.states.get(this.data.target);

    if (!state) {
      throw new Error(`State with id ${this.data.target} does not exist`);
    }

    return state;
  }

  get position() {
    return this.data.label?.position ?? { x: 0, y: 0 };
  }
  set position(value) {
    if (!this.data.label) {
      throw new Error(`Transition with id ${this.id} does not have label`);
    }

    this.data.label.position = value;
  }
  get dimensions() {
    if (!this.data.label) {
      return { width: 0, height: 0 };
    }

    if (this.app.textMode) {
      return {
        ...this.data.label.position,
        width: 200,
        height: Math.max(70, this.textData.height),
      };
    }

    return { width: 130, height: 70 };
  }
  set dimensions(_value) {
    throw new Error('Transition does not have dimensions');
  }

  prepareText() {
    if (!this.data.label?.trigger) return;

    // const getText = () => {};

    const text =
      typeof this.data.label.trigger === 'string'
        ? this.data.label.trigger
        : serializeTransitionActions(this.data.label.trigger, this.data.label.do ?? []);

    this.textData = prepareText({
      text,
      maxWidth: 200 - 2 * 15,
      fontFamily: 'Fira Sans',
      fontSize: 16,
      lineHeight: 1.4,
    });
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.drawArrows(ctx);
    this.drawLabel(ctx);
  }

  private drawLabel(ctx: CanvasRenderingContext2D) {
    this.drawLabelBody(ctx);

    if (this.isSelected) {
      this.drawSelection(ctx);
    }

    if (this.app.textMode) {
      return this.drawTextCondition(ctx);
    }

    this.drawImageCondition(ctx);
  }

  private drawLabelBody(ctx: CanvasRenderingContext2D) {
    if (!this.data.label) return;

    const { x, y, width, height } = this.drawBounds;

    ctx.fillStyle = 'rgb(23, 23, 23)';

    ctx.beginPath();

    ctx.roundRect(x, y, width, height, 8 / this.app.model.data.scale);

    ctx.fill();
    ctx.closePath();
  }

  private drawImageCondition(ctx: CanvasRenderingContext2D) {
    if (!this.data.label) return;

    const platform = this.app.controller.platform;

    if (!platform) return;

    const { x, y, width, height } = this.drawBounds;
    const eventMargin = picto.eventMargin;
    const p = 15 / this.app.model.data.scale;
    const px = x + p;
    const py = y + p;
    const yDx = picto.eventHeight + 10;
    const fontSize = stateStyle.titleFontSize / this.app.model.data.scale;
    const opacity = this.isSelected ? 1.0 : 0.7;

    const eventRowLength = Math.max(
      3,
      Math.floor((width * this.app.model.data.scale - 30) / (picto.eventWidth + 5)) - 1
    );

    ctx.font = `${fontSize}px/${stateStyle.titleLineHeight} ${stateStyle.titleFontFamily}`;
    ctx.fillStyle = stateStyle.eventColor;
    ctx.textBaseline = stateStyle.eventBaseLine;
    ctx.fillStyle = 'rgb(23, 23, 23)';

    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8 / this.app.model.data.scale);
    ctx.fill();
    ctx.closePath();

    ctx.fillStyle = transitionStyle.bgColor;

    if (this.data.label.trigger && typeof this.data.label.trigger !== 'string') {
      const trigger = this.data.label.trigger;
      ctx.beginPath();
      platform.drawEvent(ctx, trigger, px, py);
      ctx.closePath();
    }

    //Здесь начинается прорисовка действий и условий для связей
    //TODO: Требуется допиливание прорисовки условий
    if (this.data.label.condition && typeof this.data.label.condition !== 'string') {
      const offsetByTrigger =
        this.data.label.trigger && (eventMargin * 2 + picto.eventWidth) / this.app.model.data.scale;
      const aX = px + (offsetByTrigger || 0);

      ctx.beginPath();
      platform.drawCondition(ctx, this.data.label.condition, aX, py, opacity);
      ctx.closePath();
    }

    if (this.data.label.do && typeof this.data.label.do !== 'string') {
      ctx.beginPath();
      this.data.label.do?.forEach((data, actIdx) => {
        const ax = 1 + (actIdx % eventRowLength);
        const ay = 1 + Math.floor(actIdx / eventRowLength);
        const aX =
          px + (eventMargin + (picto.eventWidth + eventMargin) * ax) / this.app.model.data.scale;
        const aY = py + (ay * yDx) / this.app.model.data.scale;
        platform.drawAction(ctx, data, aX, aY, opacity);
      });
      ctx.closePath();
    }
  }

  private drawTextCondition(ctx: CanvasRenderingContext2D) {
    const { x, y } = this.drawBounds;
    const p = 15 / this.app.model.data.scale;
    const fontSize = 16 / this.app.model.data.scale;

    drawText(ctx, this.textData.textArray, {
      x: x + p,
      y: y + p,
      textAlign: 'left',
      color: getColor('text-primary'),
      fontSize,
      fontFamily: 'monospace',
      lineHeight: 1.4,
    });

    ctx.closePath();
  }

  private drawSelection(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height, childrenHeight } = this.drawBounds;

    // NOTE: Для каждого нового объекта рисования требуется указывать их начало и конец,
    //       а перед ними прописывать стили!
    ctx.beginPath();
    ctx.strokeStyle = transitionStyle.bgColor;
    ctx.roundRect(x, y, width, height + childrenHeight, 8 / this.app.model.data.scale);
    ctx.stroke();
    ctx.closePath();
  }

  private drawArrowsWithLabel(ctx: CanvasRenderingContext2D) {
    const sourceBounds = this.source.drawBounds;
    const targetBounds = this.target.drawBounds;

    const sourceLine = getLine({
      rect1: { ...sourceBounds, height: sourceBounds.height + sourceBounds.childrenHeight },
      rect2: this.drawBounds,
      rectPadding: 10,
    });
    const targetLine = getLine({
      rect1: { ...targetBounds, height: targetBounds.height + targetBounds.childrenHeight },
      rect2: this.drawBounds,
      rectPadding: 10,
    });

    ctx.lineWidth = transitionStyle.width;
    ctx.strokeStyle = this.data.color;
    ctx.fillStyle = this.data.color;

    drawCurvedLine(ctx, sourceLine, 12 / this.app.model.data.scale);
    drawCurvedLine(ctx, targetLine, 12 / this.app.model.data.scale);
    drawCircle(ctx, {
      position: sourceLine.start,
      radius: transitionStyle.startSize / this.app.model.data.scale,
      fillStyle: this.data.color,
    });
    drawTriangle(
      ctx,
      targetLine.start,
      10 / this.app.model.data.scale,
      degrees_to_radians(targetLine.se)
    );
  }

  private drawArrowsWithoutLabel(ctx: CanvasRenderingContext2D) {
    const targetBounds = this.target.drawBounds;
    const sourceBounds = this.source.drawBounds;

    const line = getLine({
      rect1: { ...targetBounds, height: targetBounds.height + targetBounds.childrenHeight },
      rect2: { ...sourceBounds, height: sourceBounds.height + sourceBounds.childrenHeight },
      rectPadding: 10,
    });

    ctx.lineWidth = transitionStyle.width;
    ctx.strokeStyle = this.data.color;
    ctx.fillStyle = this.data.color;

    drawCurvedLine(ctx, line, 12 / this.app.model.data.scale);
    drawCircle(ctx, {
      position: line.end,
      radius: transitionStyle.startSize / this.app.model.data.scale,
      fillStyle: this.data.color,
    });
    drawTriangle(ctx, line.start, 10 / this.app.model.data.scale, degrees_to_radians(line.se));
  }

  private drawArrows(ctx: CanvasRenderingContext2D) {
    if (this.data.label) {
      return this.drawArrowsWithLabel(ctx);
    }

    return this.drawArrowsWithoutLabel(ctx);
  }

  setIsSelected(value: boolean) {
    this.isSelected = value;
  }
}
