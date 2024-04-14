import { useEffect, useRef, useState } from 'react';

import { Scale } from '@renderer/components';
import { useModal } from '@renderer/hooks/useModal';
import { EventSelection, State, Transition } from '@renderer/lib/drawable';
import { useEditorContext } from '@renderer/store/EditorContext';
import { Action, Event } from '@renderer/types/diagram';
import { defaultTransColor } from '@renderer/utils';

import { CreateModal, CreateModalResult } from './CreateModal/CreateModal';
import { EventsModal, EventsModalData } from './EventsModal/EventsModal';
import { NoteEdit } from './NoteEdit';
import { StateNameModal } from './StateNameModal';

export const DiagramEditor: React.FC = () => {
  const editor = useEditorContext();

  const isMounted = editor.model.useData('isMounted');

  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State | null>(null);
  const [events, setEvents] = useState<Action[]>([]);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [newTransition, setNewTransition] = useState<{ source: State; target: State }>();

  const [isCreateModalOpen, openCreateModal, closeCreateModal] = useModal(false);

  const [isEventsModalOpen, openEventsModal, closeEventsModal] = useModal(false);
  const [eventsModalData, setEventsModalData] = useState<EventsModalData>();
  // Дополнительные данные о родителе события
  const [eventsModalParentData, setEventsModalParentData] = useState<{
    state: State;
    eventSelection: EventSelection;
  }>();

  useEffect(() => {
    if (!containerRef.current) return;

    editor.mount(containerRef.current);

    //Функция очистки всех данных
    const ClearUseState = () => {
      setState(null);
      setEvents([]);
      setTransition(null);
      setNewTransition(undefined);
    };

    editor.container.on('dblclick', (position) => {
      editor.container.editorController.states.createState({
        name: 'Состояние',
        position,
        placeInCenter: true,
      });
    });

    //Здесь мы открываем модальное окно редактирования ноды
    editor.container.editorController.states.on('changeState', (state) => {
      ClearUseState();
      setState(state);
      openCreateModal();
    });

    editor.container.editorController.states.on('changeEvent', (data) => {
      const { state, eventSelection, event, isEditingEvent } = data;

      ClearUseState();
      setEventsModalParentData({ state, eventSelection });
      setEventsModalData({ event, isEditingEvent });
      openEventsModal();
    });

    //Здесь мы открываем модальное окно редактирования созданной связи
    editor.container.editorController.transitions.on('changeTransition', (target) => {
      ClearUseState();
      setEvents(target.data.label?.do ?? []);
      setTransition(target);
      openCreateModal();
    });

    //Здесь мы открываем модальное окно редактирования новой связи
    editor.container.editorController.transitions.on('createTransition', ({ source, target }) => {
      ClearUseState();
      setNewTransition({ source, target });
      openCreateModal();
    });

    return () => {
      // снятие слежки произойдёт по смене редактора новым
      // model.unwatchEditor();
      editor?.cleanUp();
    };
    // FIXME: containerRef не влияет на перезапуск эффекта.
    // Скорее всего, контейнер меняться уже не будет, поэтому
    // реф закомментирован, но если что, https://stackoverflow.com/a/60476525.
    // }, [ containerRef.current ]);
  }, [editor, openCreateModal, openEventsModal]);

  const handleEventsModalSubmit = (data: Event) => {
    // Если есть какие-то данные то мы редактируем событие а не добавляем
    if (eventsModalData) {
      setEvents((p) => {
        const { component, method } = eventsModalData.event;
        const prevEventIndex = p.findIndex((v) => v.component === component && v.method === method);

        if (prevEventIndex === -1) return p;

        const newEvents = [...p];

        newEvents[prevEventIndex] = data;

        return newEvents;
      });
    } else {
      setEvents((p) => [...p, data]);
    }

    if (!isCreateModalOpen && eventsModalParentData) {
      editor?.container.editorController.states.changeEvent(
        eventsModalParentData.state.id,
        eventsModalParentData.eventSelection,
        data
      );
    }
    closeEventsModal();
  };

  const handleCreateModalSubmit = (data: CreateModalResult) => {
    if (data.key === 2) {
      editor.container.editorController.states.changeStateEvents({
        id: data.id,
        triggerComponent: data.trigger.component,
        triggerMethod: data.trigger.method,
        actions: events,
      });
    } else if (transition && data.key === 3) {
      editor.container.editorController.transitions.changeTransition({
        id: transition.id,
        source: transition.source.id,
        target: transition.target.id,
        color: data.color ?? defaultTransColor,
        label: {
          trigger: data.trigger,
          do: events,
          condition: data.condition,
        } as any,
      });
    } else if (newTransition) {
      editor.container.editorController.transitions.createTransition({
        source: newTransition.source.id,
        target: newTransition.target.id,
        color: data.color ?? defaultTransColor,
        label: {
          condition: data.condition,
          do: events,
          trigger: {
            component: data.trigger.component,
            method: data.trigger.method,
          },
        } as any,
      });
    }
    closeCreateModal();
  };

  const handleOpenEventsModal = (event?: Event) => {
    setEventsModalData(event && { event, isEditingEvent: false });
    setEventsModalParentData(undefined);

    openEventsModal();
  };

  return (
    <>
      <div className="relative h-full overflow-hidden bg-neutral-800" ref={containerRef}>
        {isMounted && <Scale />}
      </div>

      {isMounted && (
        <>
          <StateNameModal />
          <NoteEdit />

          <EventsModal
            initialData={eventsModalData}
            onSubmit={handleEventsModalSubmit}
            isOpen={isEventsModalOpen}
            onClose={closeEventsModal}
          />

          <CreateModal
            state={state ? state : undefined}
            transition={transition ? transition : undefined}
            events={events}
            setEvents={setEvents}
            onOpenEventsModal={handleOpenEventsModal}
            onSubmit={handleCreateModalSubmit}
            isOpen={isCreateModalOpen}
            onClose={closeCreateModal}
          />
        </>
      )}
    </>
  );
};
