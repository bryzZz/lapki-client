import { useCallback, useState } from 'react';

import { EventsModalData } from '@renderer/components';
import { useModal } from '@renderer/hooks/useModal';
import { Event } from '@renderer/types/diagram';

export const useEvents = () => {
  const [isEventsModalOpen, openEventsModal, closeEventsModal] = useModal(false);
  const [eventsModalData, setEventsModalData] = useState<EventsModalData>();

  const [tabValue, setTabValue] = useState(0);

  const [events, setEvents] = useState<Event[]>([]);
  const [text, setText] = useState('');

  const handleAddEvent = () => {
    setEventsModalData(undefined);
    openEventsModal();
  };
  const handleChangeEvent = (event: Event) => {
    setEventsModalData(event && { event, isEditingEvent: false });
    openEventsModal();
  };
  const handleDeleteEvent = (index: number) => {
    setEvents((p) => p.filter((_, i) => index !== i));
  };
  const handleReorderEvent = (from: number, to: number) => {
    setEvents((p) => {
      const newEvents = [...p];

      [newEvents[from], newEvents[to]] = [newEvents[to], newEvents[from]];

      return newEvents;
    });
  };

  const handleEventsModalSubmit = (data: Event) => {
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

    closeEventsModal();
  };

  const clear = () => {
    setEvents([]);
    setText('');
    setTabValue(0);
  };

  const parse = useCallback((eventsToParse: Event[] | string | undefined) => {
    clear();

    if (!eventsToParse) return;

    if (typeof eventsToParse !== 'string') {
      setTabValue(0);
      return setEvents(eventsToParse);
    }

    setTabValue(1);
    setText(eventsToParse);
  }, []);

  return {
    events,
    setEvents,

    onAddEvent: handleAddEvent,
    onChangeEvent: handleChangeEvent,
    onDeleteEvent: handleDeleteEvent,
    onReorderEvent: handleReorderEvent,

    tabValue,
    onTabChange: setTabValue,

    text,
    onChangeText: setText,

    modal: {
      isOpen: isEventsModalOpen,
      onClose: closeEventsModal,
      onSubmit: handleEventsModalSubmit,
      initialData: eventsModalData,
    },

    parse,
    clear,
  };
};
