const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

let fetch;
(async () => {
    try {
        fetch = (await import('node-fetch')).default;
    } catch (err) {
        console.error('Ошибка загрузки node-fetch:', err);
    }
})();

const BITRIX_WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL;

app.get('/', (req, res) => {
    res.send(`
    <h1>Отслеживание лида</h1>
    <p>Пример ссылки: <a href="/track?key=a7x9k2m5">/track?key=a7x9k2m5</a></p>
  `);
});

app.get('/track', async (req, res) => {
    const { key } = req.query;

    if (!key) {
        return res.status(400).send('Не указан ключ доступа.');
    }

    if (!fetch) {
        return res.status(500).send('Сервер не загрузил необходимые модули.');
    }

    try {
        // 1. Поиск лида по ключу
        const leadResponse = await fetch(BITRIX_WEBHOOK_URL + 'crm.lead.list', {
            method: 'POST',
            body: JSON.stringify({
                filter: { UF_CRM_1754490207019: key },
                select: [
                    'ID', 'TITLE', 'OPPORTUNITY', 'STATUS_ID', 'DATE_CREATE',
                    'UF_CRM_BEGINDATE',           // Дата начала
                    'UF_CRM_1638818267',          // Время начала (ID из списка)
                    'UF_CRM_5FB96D2488307',       // Дата завершения
                    'UF_CRM_1638818801'           // Время завершения (ID из списка)
                ]
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        const leadData = await leadResponse.json();
        if (!leadData.result || leadData.result.length === 0) {
            return res.status(404).send('Лид не найден или ключ неверный.');
        }

        const lead = leadData.result[0];

        // 2. Получаем все пользовательские поля лидов для списков
        let fieldMappings = {};
        try {
            const userFieldsResponse = await fetch(BITRIX_WEBHOOK_URL + 'crm.lead.userfield.list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const userFieldsData = await userFieldsResponse.json();
            const userFields = userFieldsData.result || [];

            // Обрабатываем нужные поля
            const timeFields = ['UF_CRM_1638818267', 'UF_CRM_1638818801'];
            userFields.forEach(field => {
                if (timeFields.includes(field.FIELD_NAME) && field.LIST) {
                    const mapping = {};
                    field.LIST.forEach(item => {
                        mapping[item.ID] = item.VALUE;
                    });
                    fieldMappings[field.FIELD_NAME] = mapping;
                }
            });
        } catch (err) {
            console.error('Ошибка при получении пользовательских полей:', err);
        }

        // 3. Получаем товары лида
        let productsHtml = '<h3>Товары:</h3><p>Нет товаров</p>';
        try {
            const productsResponse = await fetch(BITRIX_WEBHOOK_URL + 'crm.lead.productrows.get', {
                method: 'POST',
                body: JSON.stringify({ id: lead.ID }),
                headers: { 'Content-Type': 'application/json' }
            });

            const productsData = await productsResponse.json();
            const products = productsData.result || [];

            if (products.length > 0) {
                let productsTable = `
                    <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                        <thead>
                            <tr style="background-color: #f2f2f2;">
                                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Название</th>
                                <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Цена</th>
                                <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Кол-во</th>
                                <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Сумма</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                let total = 0;
                products.forEach(product => {
                    const price = parseFloat(product.PRICE || 0);
                    const quantity = parseFloat(product.QUANTITY || 0);
                    const sum = price * quantity;
                    total += sum;

                    productsTable += `
                        <tr>
                            <td style="border: 1px solid #ddd; padding: 8px;">${product.PRODUCT_NAME || 'Без названия'}</td>
                            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${price.toFixed(2)} ₽</td>
                            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${quantity}</td>
                            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${sum.toFixed(2)} ₽</td>
                        </tr>
                    `;
                });

                productsTable += `
                        <tr style="font-weight: bold;">
                            <td colspan="3" style="border: 1px solid #ddd; padding: 8px; text-align: right;">Итого:</td>
                            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${total.toFixed(2)} ₽</td>
                        </tr>
                        </tbody>
                    </table>
                `;

                productsHtml = `<h3>Товары:</h3>${productsTable}`;
            }
        } catch (productErr) {
            console.error('Ошибка при получении товаров:', productErr);
            productsHtml = '<h3>Товары:</h3><p style="color: red;">Ошибка загрузки товаров</p>';
        }

        // 4. Форматируем значения времени
        const formatTimeList = (fieldId, fieldName) => {
            if (!fieldId) return '—';

            // Обработка множественных значений
            if (Array.isArray(fieldId)) {
                return fieldId.map(id =>
                    fieldMappings[fieldName]?.[id] || `ID: ${id}`
                ).join(', ');
            }

            return fieldMappings[fieldName]?.[fieldId] || `ID: ${fieldId}`;
        };

        // 5. Отправляем HTML клиенту
        res.send(`
      <html>
      <head>
        <title>Ваш лид</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          h2 { color: #2c3e50; }
          p { font-size: 16px; }
          strong { color: #16a085; }
          hr { border: 1px solid #eee; }
          .footer { font-size: 12px; color: #7f8c8d; margin-top: 30px; }
          .dates-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; }
          .date-item { background: #f8f9fa; padding: 10px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h2>Информация о лиде</h2>
        <p><strong>Название:</strong> ${lead.TITLE || 'Не указано'}</p>
        <p><strong>Сумма:</strong> ${lead.OPPORTUNITY || '0'} ₽</p>
        <p><strong>Статус:</strong> ${formatStatus(lead.STATUS_ID)}</p>
        <p><strong>Дата создания:</strong> ${formatDate(lead.DATE_CREATE)}</p>
        
        <div class="dates-grid">
            <div class="date-item">
                <strong>Дата начала:</strong> ${formatDate(lead.UF_CRM_BEGINDATE)}
            </div>
            <div class="date-item">
                <strong>Время начала:</strong> ${formatTimeList(lead.UF_CRM_1638818267, 'UF_CRM_1638818267')}
            </div>
            <div class="date-item">
                <strong>Дата завершения:</strong> ${formatDate(lead.UF_CRM_5FB96D2488307)}
            </div>
            <div class="date-item">
                <strong>Время завершения:</strong> ${formatTimeList(lead.UF_CRM_1638818801, 'UF_CRM_1638818801')}
            </div>
        </div>

        <hr>
        ${productsHtml}
        <hr>
        <div class="footer">Лид №${lead.ID}</div>
        <script>
          // Автообновление каждые 30 секунд
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

// Вспомогательные функции
function formatStatus(statusId) {
    const map = {
        'NEW': '🔹 Новый',
        'IN_PROCESS': '⏳ В работе',
        'CONVERTED': '✅ Конвертирован',
        'JUNK': '❌ Спам'
    };
    return map[statusId] || statusId;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU');
    } catch {
        return dateStr;
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});