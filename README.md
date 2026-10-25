# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Администрирование и аналитика

Админ-панель разделена на пользователей, направления, группы и предметы. Создание
пользователя отправляет роли и группу вместе с учётными данными одним запросом.
Студенту в этой форме нужно выбрать направление и группу. Редактирование направления
меняет код, название и псевдоним; пустой псевдоним очищается, связи групп сохраняются.

В аналитике преподавателя доступны период, лекция, группа, студент, сводки и динамика
по неделям. Статус «Нет отметок» отличается от короткого присутствия. Настройки
длительности и порогов применяются ко всем лекциям отчёта. Расчёт использует текущий
состав групп, поскольку история состава и фактическое время окончания лекции в базе
не сохраняются. Будущие лекции исключаются.

CSV экспортирует все строки выбранного периода и фильтров лекции/группы/студента,
независимо от страницы и фильтра статуса. Excel содержит отдельные листы с параметрами,
отметками, лекциями, группами, студентами и неделями. Предельный период — 366 дней;
отчёты больше 50 000 строк отклоняются с просьбой сократить период, без тихого усечения.
Frontend и backend с новыми API нужно обновлять вместе; миграция базы не требуется.

### Проверки изменений

```sh
npm run build
npm test # Node.js 22.6+ с поддержкой --experimental-strip-types
```

Тесты проверяют пороги, отсутствие отметок, расчёт по студентам/неделям и экранирование
CSV. В браузере дополнительно проверены создание пользователя с несколькими ролями,
смена направления и группы, сохранение формы при конфликте, мобильная навигация,
пагинация и выгрузка всех 122 тестовых строк в настоящий XLSX и CSV.

Исходная команда `npm run lint` требует отсутствующие в package.json пакеты
`eslint-plugin-react-refresh` и `typescript-eslint`. Для изменённых компонентов и
новых утилит отдельно выполнены проверки ESLint с установленными TypeScript-парсером
и плагином и правилами React Hooks.
