import {
  Action,
  Condition,
  Elements,
  Event,
  Component as ComponentType,
  Variable,
} from '@renderer/types/diagram';
import { Point } from '@renderer/types/graphics';
import { State as StateType } from '@renderer/types/diagram';

import { Container } from '../basic/Container';
import { EventEmitter } from '../common/EventEmitter';
import { State } from '../drawable/State';
import { Transition } from '../drawable/Transition';
import { ComponentEntry, PlatformManager, operatorSet } from './PlatformManager';
import { loadPlatform } from './PlatformLoader';
import { EventSelection } from '../drawable/Events';
import { UndoRedo, possibleActions } from './UndoRedo';
import {
  ChangeStateEventsParams,
  ChangeTransitionParameters,
  CreateStateParameters,
  SetStateEventsParams,
} from '@renderer/types/EditorManager';
import { CreateTransitionParameters } from '@renderer/types/StateMachine';

export type DataUpdateCallback = (e: Elements, modified: boolean) => void;

/**
 * Данные машины состояний.
 * Хранит все состояния и переходы, предоставляет интерфейс
 * для работы с ними. Не отвечает за графику и события (эта логика
 * вынесена в контроллеры)
 *
 * @remarks
 * Все изменения, вносимые на уровне данных, должны происходить
 * здесь. Сюда закладывается история правок, импорт и экспорт.
 */

// FIXME: оптимизация: в сигнатуры функций можно поставить что-то типа (string | State),
//        чтобы через раз не делать запрос в словарь

// TODO Образовалось массивное болото, что не есть хорошо, надо додумать чем заменить переборы этих массивов.
export class StateMachine extends EventEmitter {
  container!: Container;

  states: Map<string, State> = new Map();
  transitions: Map<string, Transition> = new Map();

  platform!: PlatformManager;

  undoRedo = new UndoRedo();

  constructor(container: Container) {
    super();
    this.container = container;
  }

  reset() {
    this.transitions.forEach((value) => {
      this.container.transitions.unwatchTransition(value);
    });

    this.states.forEach((value) => {
      this.container.states.unwatchState(value);
    });
    this.states.clear();
    this.transitions.clear();
  }

  loadData() {
    this.reset();

    this.initStates();
    this.initTransitions();
    this.initPlatform();
    this.initComponents();

    this.container.isDirty = true;
  }

  initStates() {
    const items = this.container.app.manager.data.elements.states;

    for (const id in items) {
      const parent = this.states.get(items[id].parent ?? '');
      const state = new State(this.container, id, parent);

      state.parent?.children.set(id, state);
      this.container.states.watchState(state);
      this.states.set(id, state);
    }
  }

  initTransitions() {
    const items = this.container.app.manager.data.elements.transitions;

    for (const id in items) {
      const transition = new Transition(this.container, id);

      this.transitions.set(id, transition);

      this.container.transitions.watchTransition(transition);
    }
  }

  initComponents() {
    const items = this.container.app.manager.data.elements.components;

    for (const name in items) {
      const component = items[name];
      // this.components.set(name, new Component(component));
      this.platform.nameToComponent.set(name, component.type);
    }
  }

  initPlatform() {
    const platformName = this.container.app.manager.data.elements.platform;

    // ИНВАРИАНТ: платформа должна существовать, проверка лежит на внешнем поле
    const platform = loadPlatform(platformName);
    if (typeof platform === 'undefined') {
      throw Error("couldn't init platform " + platformName);
    }

    this.platform = platform;
  }

  createState = (args: CreateStateParameters, canUndo = true) => {
    const { parentId, position } = args;

    // Создание данных
    const newStateId = this.container.app.manager.createState(args);
    // Создание модельки
    const state = new State(this.container, newStateId);

    this.states.set(state.id, state);

    // вкладываем состояние, если оно создано над другим
    if (parentId) {
      this.linkState(parentId, newStateId);
    } else {
      this.linkStateByPoint(state, position);
    }

    this.container.states.watchState(state);

    this.container.isDirty = true;

    if (canUndo) {
      this.undoRedo.do(possibleActions.stateCreate(this, newStateId, args));
    }
  };

  changeStateEvents(args: ChangeStateEventsParams, canUndo = true) {
    const { id } = args;

    const state = this.states.get(id);
    if (!state) return;

    if (canUndo) {
      this.undoRedo.do(possibleActions.changeStateEvents(this, state, args));
    }

    this.container.app.manager.changeStateEvents(args);

    state.eventBox.recalculate();

    this.container.isDirty = true;
  }

  setStateEvents(args: SetStateEventsParams) {
    const { id } = args;

    const state = this.states.get(id);
    if (!state) return;

    this.container.app.manager.setStateEvents(args);

    state.eventBox.recalculate();

    this.container.isDirty = true;
  }

  changeStateName = (id: string, name: string, canUndo = true) => {
    const state = this.states.get(id);
    if (!state) return;

    if (canUndo) {
      this.undoRedo.do(possibleActions.changeStateName(this, id, name, state));
    }

    this.container.app.manager.changeStateName(id, name);

    this.container.isDirty = true;
  };

  changeStatePosition(id: string, startPosition: Point, endPosition: Point, canUndo = true) {
    const state = this.states.get(id);
    if (!state) return;

    if (canUndo) {
      this.undoRedo.do(possibleActions.changeStatePosition(this, id, startPosition, endPosition));
    }

    this.container.app.manager.changeStateBounds(id, {
      ...endPosition,
      width: state.data.bounds.width,
      height: state.data.bounds.height,
    });

    this.container.isDirty = true;
  }

  linkState(parentId: string, childId: string) {
    const parent = this.states.get(parentId);
    const child = this.states.get(childId);

    if (!parent || !child) return;

    if (child.data.parent) {
      this.unlinkState(childId);
    }

    // Вычисляем новую координату внутри контейнера
    const parentPos = parent.compoundPosition;
    const childPos = child.compoundPosition;
    const newBounds = {
      ...child.bounds,
      x: Math.max(0, childPos.x - parentPos.x),
      y: Math.max(0, childPos.y - parentPos.y - parent.bounds.height),
    };

    this.container.app.manager.linkState(parentId, childId);
    this.container.app.manager.changeStateBounds(childId, newBounds);

    child.parent = parent;
    parent.children.set(childId, child);

    this.container.isDirty = true;
  }

  linkStateByPoint(state: State, position: Point) {
    // назначаем родительское состояние по месту его создания
    let possibleParent: State | undefined = undefined;
    for (const item of this.states.values()) {
      if (state.id == item.id) continue;
      if (item.isUnderMouse(position, true)) {
        if (typeof possibleParent === 'undefined') {
          possibleParent = item;
        } else {
          // учитываем вложенность, нужно поместить состояние
          // в максимально дочернее
          let searchPending = true;
          while (searchPending) {
            searchPending = false;
            for (const child of possibleParent.children.values()) {
              if (!(child instanceof State)) continue;
              if (state.id == child.id) continue;
              if (child.isUnderMouse(position, true)) {
                possibleParent = child as State;
                searchPending = true;
                break;
              }
            }
          }
        }
      }
    }

    if (possibleParent !== state && possibleParent) {
      this.linkState(possibleParent.id, state.id);
    }
  }

  unlinkState(id: string) {
    const state = this.states.get(id);
    if (!state || !state.parent) return;

    this.container.app.manager.unlinkState(id);

    // Вычисляем новую координату, потому что после отсоединения родителя не сможем.
    const newBounds = { ...state.bounds, ...state.compoundPosition };
    this.container.app.manager.changeStateBounds(id, newBounds);

    state.parent.children.delete(id);
    state.parent = undefined;

    this.container.isDirty = true;
  }

  deleteState = (id: string, canUndo = true) => {
    const state = this.states.get(id);
    if (!state) return;

    if (canUndo) {
      this.undoRedo.do(possibleActions.deleteState(this, id, state));
    }

    // Удаляем зависимые события, нужно это делать тут а нет в данных потому что модели тоже должны быть удалены и события на них должны быть отвязаны
    this.transitions.forEach((data, transitionId) => {
      if (data.source.id === id || data.target.id === id) {
        this.deleteTransition(transitionId);
      }
    });

    // Ищем дочерние состояния и отвязываем их от текущего, делать это нужно тут потому что поле children есть только в модели и его нужно поменять
    this.states.forEach((childState) => {
      if (childState.data.parent === id) {
        // Если есть родительское, перепривязываем к нему
        if (state.data.parent) {
          this.linkState(state.data.parent, childState.id);
        } else {
          this.unlinkState(childState.id);
        }
      }
    });

    // Отсоединяемся от родительского состояния, если такое есть. Опять же это нужно делать тут из-за поля children
    if (state.data.parent) {
      this.unlinkState(state.id);
    }

    this.container.app.manager.deleteState(id);

    this.container.states.unwatchState(state);
    this.states.delete(id);

    this.container.isDirty = true;
  };

  changeInitialState = (id: string, canUndo = true) => {
    if (canUndo) {
      this.undoRedo.do(
        possibleActions.changeInitialState(
          this,
          id,
          this.container.app.manager.data.elements.initialState
        )
      );
    }

    this.container.app.manager.changeInitialState(id);

    this.container.isDirty = true;
  };

  createTransition(params: CreateTransitionParameters, canUndo = true) {
    const { source, target, color, component, method, doAction, condition, id: prevId } = params;

    const soruceState = this.states.get(source);
    const targetState = this.states.get(target);

    if (!soruceState || !targetState) return;

    // Создание данных
    const id = this.container.app.manager.createTransition({
      id: prevId,
      source,
      target,
      color,
      position: {
        x: (soruceState.bounds.x + targetState.bounds.x) / 2,
        y: (soruceState.bounds.y + targetState.bounds.y) / 2,
      },
      component,
      method,
      doAction,
      condition,
    });
    // Создание модельки
    const transition = new Transition(this.container, id);

    this.transitions.set(id, transition);
    this.container.transitions.watchTransition(transition);

    this.container.isDirty = true;

    if (canUndo) {
      this.undoRedo.do(possibleActions.createTransition(this, id, params));
    }
  }

  changeTransition(args: ChangeTransitionParameters, canUndo = true) {
    const transition = this.transitions.get(args.id);
    if (!transition) return;

    if (canUndo) {
      this.undoRedo.do(possibleActions.changeTransition(this, transition, args));
    }

    this.container.app.manager.changeTransition(args);

    this.container.isDirty = true;
  }

  changeTransitionPosition(id: string, startPosition: Point, endPosition: Point, canUndo = true) {
    const transition = this.transitions.get(id);
    if (!transition) return;

    if (canUndo) {
      this.undoRedo.do(
        possibleActions.changeTransitionPosition(this, id, startPosition, endPosition)
      );
    }

    this.container.app.manager.changeTransitionPosition(id, endPosition);

    this.container.isDirty = true;
  }

  deleteTransition(id: string, canUndo = true) {
    const transition = this.transitions.get(id);
    if (!transition) return;

    if (canUndo) {
      this.undoRedo.do(possibleActions.deleteTransition(this, transition));
    }

    this.container.app.manager.deleteTransition(id);

    this.container.transitions.unwatchTransition(transition);
    this.transitions.delete(id);

    this.container.isDirty = true;
  }

  deleteSelected() {
    let removed = false;

    const killList: string[] = [];
    this.states.forEach((state) => {
      if (state.isSelected) {
        if (state.eventBox.selection) {
          this.deleteEvent(state.id!, state.eventBox.selection);
          state.eventBox.selection = undefined;
          removed = true;
          return;
        } else {
          killList.push(state.id!);
        }
      }
    });
    for (const k of killList) {
      this.deleteState(k);
      removed = true;
    }

    killList.length = 0;

    this.transitions.forEach((value) => {
      if (value.condition.isSelected) {
        killList.push(value.id!);
      }
    });

    for (const k of killList) {
      this.deleteTransition(k);
      removed = true;
    }

    if (removed) {
      this.container.isDirty = true;
    }
  }

  //Глубокое рекурсивное копирование выбранного состояния и занесения его в буфер обмена
  copySelected() {
    this.states.forEach((state) => {
      if (state.isSelected) {
        navigator.clipboard.writeText(JSON.stringify(state.data)).then(() => {
          console.log('Скопировано!');
        });
      }
    });
    this.container.isDirty = true;
  }

  //Вставляем код из буфера обмена в редактор машин состояний
  pasteSelected() {
    navigator.clipboard.readText().then((data) => {
      const state = JSON.parse(data) as StateType;
      if (!state) return;
      this.createState({
        name: state.name,
        position: state.bounds,
        events: state.events,
        parentId: state.parent,
      });
      console.log('Вставлено!');
    });
    this.container.isDirty = true;
  }

  // Редактирование события в состояниях
  changeEvent(stateId: string, event: any, newValue: Event | Action, canUndo = true) {
    const state = this.states.get(stateId);
    if (!state) return;

    if (canUndo) {
      this.undoRedo.do(possibleActions.changeEvent(this, stateId, event, newValue));
    }

    this.container.app.manager.changeEvent(stateId, event, newValue);

    state.eventBox.recalculate();

    this.container.isDirty = true;
  }

  // Удаление события в состояниях
  //TODO показывать предупреждение при удалении события в состоянии(модалка)
  deleteEvent(id: string, eventId: EventSelection) {
    const state = this.states.get(id);
    if (!state) return;

    this.container.app.manager.deleteEvent(id, eventId.eventIdx, eventId.actionIdx);

    this.container.isDirty = true;
  }

  addComponent(name: string, type: string) {
    this.container.app.manager.addComponent(name, type);

    this.platform.nameToComponent.set(name, type);

    this.container.isDirty = true;
  }

  editComponent(name: string, parameters: ComponentType['parameters'], newName?: string) {
    this.container.app.manager.editComponent(name, parameters);

    if (newName) {
      this.renameComponent(name, newName);
    }

    this.container.isDirty = true;
  }

  private renameComponent(name: string, newName: string) {
    this.container.app.manager.renameComponent(name, newName);
    const component = this.container.app.manager.data.elements.components[newName];

    this.platform.nameToComponent.set(newName, component.type);
    this.platform.nameToComponent.delete(name);

    // А сейчас будет занимательное путешествие по схеме с заменой всего
    this.states.forEach((state) => {
      for (const ev of state.eventBox.data) {
        // заменяем в триггере
        if (ev.trigger.component == name) {
          ev.trigger.component = newName;
        }
        for (const act of ev.do) {
          // заменяем в действии
          if (act.component == name) {
            act.component = newName;
          }
        }
      }
    });

    this.transitions.forEach((value) => {
      if (value.data.trigger.component == name) {
        value.data.trigger.component = newName;
      }
      // do
      if (value.data.do) {
        for (const act of value.data.do) {
          if (act.component == name) {
            act.component = newName;
          }
        }
      }
      // condition
      if (value.data.condition) {
        this.renameCondition(value.data.condition, name, newName);
      }
    });

    this.container.isDirty = true;
  }

  renameCondition(ac: Condition, oldName: string, newName: string) {
    if (ac.type == 'value') {
      return;
    }
    if (ac.type == 'component') {
      if ((ac.value as Variable).component === oldName) {
        (ac.value as Variable).component = newName;
      }
      return;
    }
    if (operatorSet.has(ac.type)) {
      if (Array.isArray(ac.value)) {
        for (const x of ac.value) {
          this.renameCondition(x, oldName, newName);
        }
        return;
      }
      return;
    }
  }

  removeComponent(name: string, purge?: boolean) {
    this.container.app.manager.removeComponent(name);

    if (purge) {
      // TODO: «вымарывание» компонента из машины
      console.error('removeComponent purge not implemented yet');
    }

    this.platform.nameToComponent.delete(name);

    this.container.isDirty = true;
  }

  /**
   * Снимает выделение со всех нод и переходов.
   *
   * @remarks
   * Выполняется при изменении выделения.
   *
   * @privateRemarks
   * Возможно, надо переделать структуру, чтобы не пробегаться по списку каждый раз.
   */
  removeSelection() {
    this.states.forEach((state) => {
      state.setIsSelected(false);
      state.eventBox.selection = undefined;
    });

    this.transitions.forEach((value) => {
      value.condition.setIsSelected(false);
    });

    this.container.isDirty = true;
  }

  getVacantComponents(): ComponentEntry[] {
    const components = this.container.app.manager.data.elements.components;
    const vacant: ComponentEntry[] = [];
    for (const idx in this.platform.data.components) {
      const compo = this.platform.data.components[idx];
      if (compo.singletone && components.hasOwnProperty(idx)) continue;
      vacant.push({
        idx,
        name: compo.name ?? idx,
        img: compo.img ?? 'unknown',
        description: compo.description ?? '',
        singletone: compo.singletone ?? false,
      });
    }
    return vacant;
  }
}
