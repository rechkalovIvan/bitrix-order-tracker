const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// 🔐 Вебхук из Битрикс24
const BITRIX_WEBHOOK_URL = 'https://ваш-домен.bitrix24.ru/rest/1/abc123xyz456def/';

// 🧩 Главная страница
app.get('/', (req, res) => {
    res.send(`
    <h1>Отслеживание заказа</h1>
    <p>Пример ссылки: <a href="/track?key=a7x9k2m5">/track?key=a7x9k2m5</a></p>
  `);
});

// 🔍 Поиск сделки по уникальному ключу
app.get('/track', async (req, res) => {
    const { key } = req.query;

    if (!key) {
        return res.status(400).send('Не указан ключ');
    }

    try {
        // 📥 Ищем сделку по полю UF_UNIQUE_KEY
        const searchResponse = await fetch(BITRIX_WEBHOOK_URL + 'crm.deal.list', {
            method: 'POST',
            body: JSON.stringify({
                filter: { UF_UNIQUE_KEY: key },
                select: ['ID', 'TITLE', 'OPPORTUNITY', 'STAGE_ID', 'DATE_CREATE']
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        const searchData = await searchResponse.json();

        if (searchData.error || searchData.result.length === 0) {
            return res.status(404).send('Заказ не найден или ключ неверный.');
        }

        const deal = searchData.result[0]; // Берём первую (и единственную) найденную сделку

        // 🖼️ Показываем страницу
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
        <p><strong>Название:</strong> ${deal.TITLE || 'Без названия'}</p>
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
        console.error(err);
        res.status(500).send('Ошибка сервера');
    }
});

// 🛠 Вспомогательные функции
function formatStage(stageId) {
    const stages = {
        'NEW': 'Новый',
        'PREPARE': 'Готовится',
        'EXECUTING': 'Выполняется',
        'WON': 'Успешно',
        'LOST': 'Проигран'
    };
    return stages[stageId] || stageId;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU');
}

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});