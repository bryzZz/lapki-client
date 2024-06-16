import { useCallback, useMemo, useState } from 'react';

import { SingleValue } from 'react-select';

import { SelectOption } from '@renderer/components/UI';
import { useEditorContext } from '@renderer/store/EditorContext';
import { Event } from '@renderer/types/diagram';

/**
 * Инкапсуляция логики триггера формы {@link CreateModal}
 */
export const useTrigger = (addSystemComponents: boolean) => {
  const editor = useEditorContext();
  const model = editor.model;

  const componentsData = model.useData('elements.components');
  const controller = editor.controller;

  const [tabValue, setTabValue] = useState(0);

  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  const [text, setText] = useState('');

  const componentOptions: SelectOption[] = useMemo(() => {
    const getComponentOption = (id: string) => {
      const proto = controller.platform?.getComponent(id);

      return {
        value: id,
        label: id,
        hint: proto?.description,
        icon: controller.platform?.getFullComponentIcon(id, 'mr-1 h-7 w-7'),
      };
    };

    const result = Object.entries(componentsData)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([idx]) => getComponentOption(idx));

    if (addSystemComponents) {
      result.unshift(getComponentOption('System'));
    }

    return result;
  }, [componentsData, addSystemComponents, controller]);

  const methodOptions: SelectOption[] = useMemo(() => {
    if (!selectedComponent || !controller.platform) return [];
    const getAll = controller.platform['getAvailableEvents'];
    const getImg = controller.platform['getEventIconUrl'];

    // Тут call потому что контекст теряется
    return getAll.call(controller.platform, selectedComponent).map(({ name, description }) => {
      return {
        value: name,
        label: name,
        hint: description,
        icon: (
          <img
            src={getImg.call(controller.platform, selectedComponent, name, true)}
            className="mr-1 h-7 w-7 object-contain"
          />
        ),
      };
    });
  }, [controller, selectedComponent]);

  const handleComponentChange = useCallback((value: SingleValue<SelectOption>) => {
    setSelectedComponent(value?.value ?? null);
    setSelectedMethod(null);
  }, []);

  const handleMethodChange = useCallback((value: SingleValue<SelectOption>) => {
    setSelectedMethod(value?.value ?? null);
  }, []);

  const clear = useCallback(() => {
    setSelectedComponent(null);
    setSelectedMethod(null);
    setText('');
    setTabValue(0);
  }, []);

  const parse = useCallback(
    (triggerToParse: Event | string | undefined) => {
      clear();

      if (!triggerToParse) return;

      if (typeof triggerToParse !== 'string') {
        setSelectedComponent(triggerToParse.component);
        setSelectedMethod(triggerToParse.method);
        return setTabValue(0);
      }

      setText(triggerToParse);
      setTabValue(1);
    },
    [clear]
  );

  return {
    componentOptions,
    methodOptions,

    tabValue,
    onTabChange: setTabValue,

    text,
    onChangeText: setText,

    selectedComponent,
    selectedMethod,
    onComponentChange: handleComponentChange,
    onMethodChange: handleMethodChange,
    setSelectedComponent,
    setSelectedMethod,

    parse,
    clear,
  };
};
