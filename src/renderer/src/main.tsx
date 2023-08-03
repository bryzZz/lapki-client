import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';

import './index.css';
import { App } from './App';

/*
 Для отладки мы запускаем React в строгом режиме.
 Он отрисовывает виджеты по нескольку раз и выявляет
 типовые ошибки. Это тормозит работу среды при отладке,
 но в релизе оно мешать не будет.
 https://react.dev/reference/react/StrictMode
*/

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
