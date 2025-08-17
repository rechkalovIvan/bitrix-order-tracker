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
                    'UF_CRM_1638818801',          // Время завершения (ID из списка)
                    'UF_CRM_1614544756'           // Тип оборудования (ID из списка, может быть множественным)
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
            const timeFields = ['UF_CRM_1638818267', 'UF_CRM_1638818801', 'UF_CRM_1614544756'];
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

        // 5. Форматируем тип оборудования
        const formatEquipmentType = (fieldId, fieldName) => {
            if (!fieldId) return '—';

            // Обработка множественных значений
            if (Array.isArray(fieldId)) {
                return fieldId.map(id =>
                    fieldMappings[fieldName]?.[id] || `ID: ${id}`
                ).join(', ');
            }

            return fieldMappings[fieldName]?.[fieldId] || `ID: ${fieldId}`;
        };

        // 6. Получаем текстовые значения типа оборудования для проверки
        let equipmentTypeTexts = [];
        if (lead.UF_CRM_1614544756) {
            if (Array.isArray(lead.UF_CRM_1614544756)) {
                equipmentTypeTexts = lead.UF_CRM_1614544756.map(id =>
                    fieldMappings['UF_CRM_1614544756']?.[id] || ''
                );
            } else {
                equipmentTypeTexts = [fieldMappings['UF_CRM_1614544756']?.[lead.UF_CRM_1614544756] || ''];
            }
        }

        // 7. Проверяем, есть ли "Моющий пылесос" в типе оборудования
        const hasWashingVacuum = equipmentTypeTexts.some(text =>
            text && text.includes('Моющий пылесос')
        );

        // 8. Создаем HTML для дополнительного блока
        let additionalHtml = '';
        if (hasWashingVacuum) {
            additionalHtml = `
                <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #ffeaa7;">
                    <strong>Дополнительно:</strong> 2шт. средства (порошок) на запас, потратите оплатите нет, вернете.
                </div>
            `;
        }

        // 9. Определяем заголовок в зависимости от статуса
        let pageTitle = 'Проверьте пожалуйста и подтвердите:';
        if (lead.STATUS_ID === '2') {
            pageTitle = 'Предварительный расчет';
        } else if (lead.STATUS_ID === '7') {
            pageTitle = 'Согласовано';
        }

        // 10. Генерируем HTML кнопки (если статус = 8)
        let buttonHtml = '';
        if (lead.STATUS_ID === '8') {
            buttonHtml = `
                <div id="button-container">
                  <button class="confirm-btn" onclick="confirmLead(${lead.ID})" id="confirmButton">Все верно</button>
                </div>
                <div id="message"></div>
            `;
        }

        // 11. Подготавливаем HTML для типа оборудования (если поле заполнено)
        let equipmentHtml = '';
        if (lead.UF_CRM_1614544756) {
            equipmentHtml = `
                <div class="date-item">
                    <strong>Тип оборудования:</strong> ${formatEquipmentType(lead.UF_CRM_1614544756, 'UF_CRM_1614544756')}
                </div>
            `;
        }

        // 12. Отправляем HTML клиенту
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
          .dates-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; }
          .date-item { background: #f8f9fa; padding: 10px; border-radius: 4px; }
          .status { background: #e8f4f8; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          .confirm-btn {
            background: #4CAF50;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin: 20px 0;
          }
          .confirm-btn:hover {
            background: #45a049;
          }
          .confirm-btn:disabled {
            background: #cccccc;
            cursor: not-allowed;
          }
          .success-message {
            color: #4CAF50;
            font-weight: bold;
            font-size: 18px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <h2>${pageTitle}</h2>
        
        <div class="status">
            <strong>Статус:</strong> ${lead.STATUS_ID}
        </div>
        
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
            ${equipmentHtml}
        </div>

        <hr>
        ${productsHtml}
        ${additionalHtml}
        ${buttonHtml}

        <script>
          async function confirmLead(leadId) {
            const button = document.getElementById('confirmButton');
            const message = document.getElementById('message');
            const buttonContainer = document.getElementById('button-container');
            
            // Блокируем кнопку
            button.disabled = true;
            button.textContent = 'Обработка...';
            
            try {
              // Отправляем запрос на обновление статуса лида
              const response = await fetch('/confirm-lead', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  leadId: leadId,
                  key: '${key}'
                })
              });
              
              const result = await response.json();
              
              if (result.success) {
                // Перезагружаем страницу через 1 секунду, чтобы показать обновленный статус
                message.innerHTML = '<div class="success-message">✅ Согласована</div>';
                setTimeout(() => {
                  location.reload();
                }, 1000);
              } else {
                message.innerHTML = '<div style="color: red;">❌ Ошибка: ' + result.error + '</div>';
                button.disabled = false;
                button.textContent = 'Все верно';
              }
            } catch (error) {
              message.innerHTML = '<div style="color: red;">❌ Ошибка: ' + error.message + '</div>';
              button.disabled = false;
              button.textContent = 'Все верно';
            }
          }
        </script>
      </body>
      </html>
    `);

    } catch (err) {
        console.error('Ошибка при обработке запроса:', err);
        res.status(500).send('Ошибка сервера. Попробуйте позже.');
    }
});

// Обработчик подтверждения лида
app.post('/confirm-lead', express.json(), async (req, res) => {
    const { leadId, key } = req.body;

    if (!leadId || !key) {
        return res.json({ success: false, error: 'Некорректные данные' });
    }

    if (!fetch) {
        return res.json({ success: false, error: 'Сервер не загрузил необходимые модули' });
    }

    try {
        // Проверяем, что лид принадлежит этому ключу и имеет статус 8
        const leadResponse = await fetch(BITRIX_WEBHOOK_URL + 'crm.lead.list', {
            method: 'POST',
            body: JSON.stringify({
                filter: {
                    ID: leadId,
                    UF_CRM_1754490207019: key,
                    STATUS_ID: '8'
                },
                select: ['ID']
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        const leadData = await leadResponse.json();
        if (!leadData.result || leadData.result.length === 0) {
            return res.json({ success: false, error: 'Лид не найден, ключ неверный или статус не 8' });
        }

        // Обновляем статус лида на ID 7
        const updateResponse = await fetch(BITRIX_WEBHOOK_URL + 'crm.lead.update', {
            method: 'POST',
            body: JSON.stringify({
                id: leadId,
                fields: {
                    STATUS_ID: '7'
                }
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        const updateData = await updateResponse.json();

        if (updateData.result) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Не удалось обновить статус лида' });
        }

    } catch (err) {
        console.error('Ошибка при подтверждении лида:', err);
        res.json({ success: false, error: 'Ошибка сервера' });
    }
});

// Вспомогательные функции
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