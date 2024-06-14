import React, { useEffect, useMemo, useState } from 'react';

import { Modal } from '@renderer/components/UI';
import { useModal } from '@renderer/hooks/useModal';
import { ChoiceState, FinalState, State, Transition } from '@renderer/lib/drawable';
import { useEditorContext } from '@renderer/store/EditorContext';

import { Events, Condition, ColorField, Trigger } from './components';
import { useTrigger, useCondition, useEvents } from './hooks';

export const TransitionModal: React.FC = () => {
  const editor = useEditorContext();

  const [isOpen, open, close] = useModal(false);

  const [transition, setTransition] = useState<Transition | null>(null);
  const [newTransition, setNewTransition] = useState<{
    source: State | ChoiceState;
    target: State | ChoiceState | FinalState;
  } | null>();

  // Данные формы
  const trigger = useTrigger(false);
  const condition = useCondition();
  const events = useEvents();
  const [color, setColor] = useState<string | undefined>();

  // Если создается новый переход и это переход из состояния выбора то показывать триггер не нужно
  const showTrigger = useMemo(() => {
    if (newTransition) {
      return !(newTransition.source instanceof ChoiceState);
    }

    if (transition) {
      return !(transition.source instanceof ChoiceState);
    }

    return true;
  }, [newTransition, transition]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const { selectedComponent, selectedMethod, tabValue } = trigger;
    const triggerText = trigger.text.trim();

    if (
      showTrigger &&
      ((tabValue === 0 && (!selectedComponent || !selectedMethod)) ||
        (tabValue === 1 && !triggerText))
    ) {
      return;
    }

    const {
      show,
      isParamOneInput1,
      selectedComponentParam1,
      selectedMethodParam1,
      isParamOneInput2,
      selectedComponentParam2,
      selectedMethodParam2,
      argsParam1,
      argsParam2,
      conditionOperator,
    } = condition;

    //Проверка на наличие пустых блоков условия, если же они пустые, то форма не отправляется
    if (show) {
      const errors = condition.checkForErrors();

      for (const key in errors) {
        if (errors[key]) return;
      }
    }

    const getCondition = () => {
      if (!show) return undefined;

      if (condition.tabValue === 0) {
        // Тут много as string потому что проверка на null в checkForErrors
        return {
          type: conditionOperator as string,
          value: [
            {
              type: isParamOneInput1 ? 'component' : 'value',
              value: isParamOneInput1
                ? {
                    component: selectedComponentParam1 as string,
                    method: selectedMethodParam1 as string,
                    args: {},
                  }
                : (argsParam1 as string),
            },
            {
              type: isParamOneInput2 ? 'component' : 'value',
              value: isParamOneInput2
                ? {
                    component: selectedComponentParam2 as string,
                    method: selectedMethodParam2 as string,
                    args: {},
                  }
                : (argsParam2 as string),
            },
          ],
        };
      }

      return condition.text.trim() || undefined;
    };

    const getTrigger = () => {
      if (!showTrigger) return undefined;

      if (tabValue === 0)
        return { component: selectedComponent as string, method: selectedMethod as string };

      return triggerText;
    };

    const getEvents = () => {
      if (events.tabValue === 0) {
        return events.events;
      }

      return events.text.trim() || undefined; // Чтобы при пустом текте возвращался undefined
    };

    // Если редактируем состояние
    if (transition) {
      editor.controller.transitions.changeTransition({
        id: transition.id,
        sourceId: transition.source.id,
        targetId: transition.target.id,
        color,
        label: {
          trigger: getTrigger(),
          condition: getCondition(),
          do: getEvents(),
        } as any, // Из-за position,
      });

      close();
    }

    // Если создаем новое
    if (newTransition) {
      editor.controller.transitions.createTransition({
        sourceId: newTransition.source.id,
        targetId: newTransition.target.id,
        color,
        label: {
          trigger: getTrigger(),
          condition: getCondition(),
          do: getEvents(),
        } as any, // Из-за position,
      });
    }

    close();
  };

  // Сброс формы после закрытия
  const handleAfterClose = () => {
    trigger.clear();
    condition.clear();
    events.clear();
    setColor(undefined);

    setTransition(null);
    setNewTransition(null);
  };

  useEffect(() => {
    const handleCreateTransition = (data: {
      source: State | ChoiceState;
      target: State | ChoiceState | FinalState;
    }) => {
      setNewTransition(data);
      events.setEvents([]);
      open();
    };

    const handleChangeTransition = (target: Transition) => {
      const { data: initialData } = target;

      if (initialData.label?.trigger) {
        if (typeof initialData.label.trigger !== 'string') {
          trigger.setSelectedComponent(initialData.label.trigger.component);
          trigger.setSelectedMethod(initialData.label.trigger.method);
          trigger.onTabChange(0);
        } else {
          trigger.onChangeText(initialData.label.trigger);
          trigger.onTabChange(1);
        }
      }

      condition.parseCondition(initialData.label?.condition);

      if (initialData.label?.do) {
        if (typeof initialData.label.do !== 'string') {
          events.setEvents(initialData.label.do);
          events.onTabChange(0);
        } else {
          events.onChangeText(initialData.label.do);
          events.onTabChange(1);
        }
      }

      setColor(initialData.color);

      setTransition(target);
      open();
    };

    editor.controller.transitions.on('createTransition', handleCreateTransition);
    editor.controller.transitions.on('changeTransition', handleChangeTransition);

    return () => {
      editor.controller.transitions.off('createTransition', handleCreateTransition);
      editor.controller.transitions.off('changeTransition', handleChangeTransition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Modal
        title="Редактор соединения"
        onSubmit={handleSubmit}
        isOpen={isOpen}
        onRequestClose={close}
        onAfterClose={handleAfterClose}
      >
        <div className="flex flex-col gap-4">
          {showTrigger && <Trigger {...trigger} />}
          <Condition {...condition} />
          <Events {...events} />
          <ColorField label="Цвет линии:" value={color} onChange={setColor} />
        </div>
      </Modal>
    </>
  );
};
