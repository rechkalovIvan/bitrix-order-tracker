# Bitrix Order Tracker

Приложение для отслеживания статусов лидов из CRM Битрикс24.

## Архитектура

- **Backend**: Node.js + Express с REST API
- **Frontend**: Vue 3 + Vite
- **Структура**: Monorepo с workspace

## Структура проекта

```
bitrix-order-tracker/
├── backend/                 # Node.js API
│   ├── src/
│   │   ├── controllers/     # Контроллеры
│   │   ├── middleware/      # Middleware
│   │   ├── services/        # Сервисы (Bitrix API)
│   │   ├── routes/          # Роуты
│   │   ├── utils/           # Утилиты
│   │   └── config/          # Конфигурация
│   ├── .env                 # Переменные окружения
│   └── package.json
├── frontend/                # Vue.js SPA
│   ├── src/
│   │   ├── components/      # Vue компоненты
│   │   ├── views/           # Страницы
│   │   ├── services/        # API сервис
│   │   └── utils/           # Утилиты
│   └── package.json
└── package.json            # Root package.json
```

## Настройка

### Backend

1. Скопируйте `.env.example` в `.env`
2. Настройте переменные окружения:
   ```
   BITRIX_WEBHOOK_URL=https://your-bitrix.webhook.url/
   WEBHOOK_TOKEN=your-secret-token
   PORT=10000
   NODE_ENV=development
   ```

### Frontend

Фронтенд использует прокси к API бэкенда для разработки.

## Запуск

### Разработка

Запустить и backend, и frontend одновременно:
```bash
npm run dev
```

Отдельно:
```bash
# Backend
npm run dev:backend

# Frontend  
npm run dev:frontend
```

### Продакшн

```bash
npm run build
npm start
```

## API Endpoints

- `GET /api/leads/:key` - получить лид по ключу
- `POST /api/leads/:id/confirm` - подтвердить лид
- `GET /health` - проверка состояния

## Компоненты Frontend

- `ProductList` - отображение товаров
- `InfoCard` - информационные карточки
- `SliderConfirm` - слайдер подтверждения

## Особенности

- Обратная совместимость со старыми URL `/track?key=...`
- Mobile-first responsive дизайн
- Touch-friendly слайдер подтверждения
- Условная логика для типов оборудования

## Технологии

- Node.js 20.x
- Vue 3 + Composition API
- Vue Router 4
- Axios
- Express
- Vite