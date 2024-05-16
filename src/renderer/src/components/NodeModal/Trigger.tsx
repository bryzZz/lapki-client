import React, { useMemo, useRef } from 'react';

import CodeMirror, { Transaction, EditorState, ReactCodeMirrorRef } from '@uiw/react-codemirror';
import throttle from 'lodash.throttle';

import { Select, TabPanel, Tabs } from '@renderer/components/UI';

import { useTrigger } from './hooks/useTrigger';

import './style.css';

type TriggerProps = ReturnType<typeof useTrigger>;

export const Trigger: React.FC<TriggerProps> = (props) => {
  const {
    componentOptions,
    methodOptions,
    tabValue,
    onTabChange,

    selectedComponent,
    selectedMethod,
    onComponentChange,
    onMethodChange,

    text,
    onChangeText,
  } = props;

  const editorRef = useRef<ReactCodeMirrorRef | null>(null);

  const handleTabChange = (tab: number) => {
    onTabChange(tab);

    // Фокусировка и установка каретки
    if (tab === 1) {
      setTimeout(() => {
        const view = editorRef?.current?.view;
        if (!view) return;

        view.focus();
        view.dispatch({
          selection: {
            anchor: view.state.doc.length,
            head: view.state.doc.length,
          },
        });
      }, 0);
    }
  };

  const handleLengthLimit = (tr: Transaction) => {
    return tr.newDoc.lines <= 10;

    // return tr.startState.doc.length + tr.newDoc.length < 200;
  };

  const handleChangeText = useMemo(() => throttle(onChangeText, 500), [onChangeText]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="mb-1 min-w-11 text-lg font-bold">Когда</p>

        <Tabs
          className="mb-4"
          tabs={['Выбор', 'Код']}
          value={tabValue}
          onChange={handleTabChange}
        />
      </div>

      <div className="pl-4">
        <div className="w-full">
          <TabPanel value={0} tabValue={tabValue}>
            <div className="flex w-full gap-2">
              <Select
                containerClassName="w-full"
                options={componentOptions}
                onChange={onComponentChange}
                value={componentOptions.find((o) => o.value === selectedComponent) ?? null}
                isSearchable={false}
              />
              <Select
                containerClassName="w-full"
                options={methodOptions}
                onChange={onMethodChange}
                value={methodOptions.find((o) => o.value === selectedMethod) ?? null}
                isSearchable={false}
              />
            </div>
          </TabPanel>

          <TabPanel value={1} tabValue={tabValue}>
            <CodeMirror
              ref={editorRef}
              value={text}
              onChange={handleChangeText}
              placeholder={'Напишите код'}
              className="editor"
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
              }}
              minHeight="4.7rem"
              width="100%"
              extensions={[EditorState.changeFilter.of(handleLengthLimit)]}
            />
          </TabPanel>
        </div>
      </div>
    </div>
  );
};
