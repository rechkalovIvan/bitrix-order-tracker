const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000; // Render ожидает порт 10000 по умолчанию

// 🚀 Динамический импорт node-fetch (ESM)
let fetch;
(async () => {
    try {
        fetch = (await import('node-fetch')).default;
    } catch (err) {
        console.error('Ошибка загрузки node-fetch:', err);
    }
})();

// 🔐 Вебхук из Битрикс24 (установи в Render как переменную окружения!)
const BITRIX_WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL;

// 🏠 Главная страница
app.get('/', (req, res) => {
    res.send(`
    <h1>Отслеживание заказа</h1>
    <p>Пример ссылки: <a href="/track?key=a7x9k2m5">/track?key=a7x9k2m5</a></p>
  `);
});

// 🔍 Обработчик /track?key=...
app.get('/track', async (req, res) => {
    const { key } = req.query;

    if (!key) {
        return res.status(400).send('Не указан ключ доступа.');
    }

    if (!fetch) {
        return res.status(500).send('Сервер не загрузил необходимые модули.');
    }

    try {
        // 📥 Поиск сделки по UF_CRM_1754162105
        const response = await fetch(BITRIX_WEBHOOK_URL + 'crm.deal.list', {
            method: 'POST',
            body: JSON.stringify({
                filter: { UF_CRM_1754162105: key },
                select: ['ID', 'TITLE', 'OPPORTUNITY', 'STAGE_ID', 'DATE_CREATE']
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (!data.result || data.result.length === 0) {
            return res.status(404).send('Заказ не найден или ключ неверный.');
        }

        const deal = data.result[0];

        // 🖼️ Отправляем HTML клиенту
        res.send(`
      <html>
      <head>
        <title>Ваш заказ</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
          h2 { color: #2c3e50; }
          p { font-size: 16px; }
          strong { color: #16a085; }
          hr { border: 1px solid #eee; }
          .footer { font-size: 12px; color: #7f8c8d; margin-top: 30px; }
        </style>
      </head>
      <body>
        <h2>Информация о заказе</h2>
        <p><strong>Название:</strong> ${deal.TITLE || 'Не указано'}</p>
        <p><strong>Сумма:</strong> ${deal.OPPORTUNITY || '0'} ₽</p>
        <p><strong>Статус:</strong> ${formatStage(deal.STAGE_ID)}</p>
        <p><strong>Дата создания:</strong> ${formatDate(deal.DATE_CREATE)}</p>
        <hr>
        <div class="footer">Заказ №${deal.ID}</div>
        <script>
          // 🔄 Автообновление каждые 30 секунд
          setTimeout(() => location.reload(), 30000);
        </script>
      </body>
      </html>
    `);

    } catch (err) {
        console.error('Ошибка при обработке запроса:', err);
        res.status(500).send('Ошибка сервера. Попробуйте позже.');
    }
});

// 🛠 Вспомогательные функции
function formatStage(stageId) {
    const map = {
        'NEW': '🔹 Новый',
        '7': 'Подтверждена',
        'EXECUTING': '🚚 В доставке',
        'WON': '✅ Выполнен',
        'LOST': '❌ Отменён'
    };
    return map[stageId] || stageId;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU');
}

// ✅ ВАЖНО: привязываемся к 0.0.0.0 и используем PORT из окружения
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});