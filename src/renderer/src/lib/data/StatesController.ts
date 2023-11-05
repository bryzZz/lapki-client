import throttle from 'lodash.throttle';

import { Point } from '@renderer/types/graphics';

import { Container } from '../basic/Container';
import { EventEmitter } from '../common/EventEmitter';
import { MyMouseEvent } from '../common/MouseEventEmitter';
import { EventSelection } from '../drawable/Events';
import { InitialStateMark } from '../drawable/InitialStateMark';
import { State } from '../drawable/State';

type DragHandler = (state: State, e: { event: MyMouseEvent }) => void;

type DragInfo = {
  parentId: string;
  childId: string;
} | null;

/**
 * Контроллер {@link State|состояний}.
 * Предоставляет подписку на события, связанные с состояниями.
 */
interface StatesControllerEvents {
  mouseUpOnState: State;
  startNewTransition: State;
  changeState: State;
  changeStateName: State;
  stateContextMenu: { state: State; position: Point };
  changeEvent: { state: State; event: EventSelection; click: boolean };
  eventContextMenu: { state: State; event: EventSelection; position: Point };
}

export class StatesController extends EventEmitter<StatesControllerEvents> {
  dragInfo: DragInfo = null;
  initialStateMark: InitialStateMark | null = null;

  constructor(public container: Container) {
    super();
  }

  handleStartNewTransition = (state: State) => {
    this.emit('startNewTransition', state);
  };

  handleMouseUpOnState = (state: State) => {
    this.emit('mouseUpOnState', state);
  };

  handleStateClick = (state: State, e: { event: MyMouseEvent }) => {
    this.container.machineController.selectState(state.id);

    const targetPos = state.computedPosition;
    const titleHeight = state.titleHeight;
    const y = e.event.y - targetPos.y;
    // FIXME: если будет учёт нажатий на дочерний контейнер, нужно отсеять их здесь
    if (y > titleHeight) {
      // FIXME: пересчитывает координаты внутри, ещё раз
      state.eventBox.handleClick({ x: e.event.x, y: e.event.y });
    }
  };

  handleStateDoubleClick = (state: State, e: { event: MyMouseEvent }) => {
    const targetPos = state.computedPosition;
    const titleHeight = state.computedTitleSizes.height;
    const y = e.event.y - targetPos.y;
    if (y <= titleHeight) {
      this.emit('changeStateName', state);
    } else {
      // FIXME: если будет учёт нажатий на дочерний контейнер, нужно отсеять их здесь
      // FIXME: пересчитывает координаты внутри, ещё раз
      const eventIdx = state.eventBox.handleDoubleClick({ x: e.event.x, y: e.event.y });
      if (!eventIdx) {
        this.emit('changeState', state);
      } else {
        this.emit('changeEvent', { state, event: eventIdx, click: true });
      }
    }
  };

  handleContextMenu = (state: State, e: { event: MyMouseEvent }) => {
    this.container.machineController.selectState(state.id);

    const eventIdx = state.eventBox.handleClick({ x: e.event.x, y: e.event.y });
    if (!eventIdx) {
      this.emit('stateContextMenu', { state, position: { x: e.event.x, y: e.event.y } });
    } else {
      this.emit('eventContextMenu', {
        state,
        position: { x: e.event.x, y: e.event.y },
        event: eventIdx,
      });
    }
  };

  // TODO: визуальная обратная связь
  // если состояние вложено – отсоединяем
  handleLongPress = (state: State) => {
    if (typeof state.parent === 'undefined') return;

    this.container.machineController.unlinkState({ id: state.id });
  };

  handleDrag: DragHandler = throttle<DragHandler>((state, e) => {
    const possibleParent = (state.parent ?? this.container).getCapturedNode({
      position: e.event,
      exclude: [state.id],
      includeChildrenHeight: true,
      type: 'states',
    });

    this.dragInfo = null;

    if (possibleParent) {
      this.dragInfo = {
        parentId: possibleParent.id,
        childId: state.id,
      };
    }
  }, 100);

  handleDragEnd = (state: State, e: { dragStartPosition: Point; dragEndPosition: Point }) => {
    if (this.dragInfo) {
      this.container.machineController.linkState(this.dragInfo.parentId, this.dragInfo.childId);
      this.dragInfo = null;
      return;
    }

    this.container.machineController.changeStatePosition(
      state.id,
      e.dragStartPosition,
      e.dragEndPosition
    );
  };

  watchState(state: State) {
    state.on('mousedown', this.handleStateClick.bind(this, state));
    state.on('mouseup', this.handleMouseUpOnState.bind(this, state));
    state.on('dblclick', this.handleStateDoubleClick.bind(this, state));
    state.on('contextmenu', this.handleContextMenu.bind(this, state));
    state.on('drag', this.handleDrag.bind(this, state));
    state.on('dragend', this.handleDragEnd.bind(this, state));
    state.on('longpress', this.handleLongPress.bind(this, state));

    state.edgeHandlers.onStartNewTransition = this.handleStartNewTransition;
  }

  unwatchState(state: State) {
    state.off('mousedown', this.handleStateClick.bind(this, state));
    state.off('mouseup', this.handleMouseUpOnState.bind(this, state));
    state.off('dblclick', this.handleStateDoubleClick.bind(this, state));
    state.off('contextmenu', this.handleContextMenu.bind(this, state));
    state.off('drag', this.handleDrag.bind(this, state));
    state.off('dragend', this.handleDragEnd.bind(this, state));
    state.off('longpress', this.handleLongPress.bind(this, state));

    state.edgeHandlers.unbindEvents();
  }

  initInitialStateMark(stateId: string) {
    this.initialStateMark = new InitialStateMark(this.container, stateId);
  }
}
