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

        // 6. Получаем реальные значения типов оборудования для проверки условия
        let equipmentTypes = [];
        if (lead.UF_CRM_1614544756) {
            if (Array.isArray(lead.UF_CRM_1614544756)) {
                equipmentTypes = lead.UF_CRM_1614544756.map(id =>
                    fieldMappings['UF_CRM_1614544756']?.[id] || `ID: ${id}`
                );
            } else {
                equipmentTypes = [fieldMappings['UF_CRM_1614544756']?.[lead.UF_CRM_1614544756] || `ID: ${lead.UF_CRM_1614544756}`];
            }
        }

        // 7. Проверяем, есть ли "Моющий пылесос" в типах оборудования
        const hasWashingVacuum = equipmentTypes.some(type =>
            type.includes('Моющий пылесос') || type === 'Моющий пылесос'
        );

        // 8. Генерируем дополнительные блоки при условии
        let additionalBlocks = '';
        if (hasWashingVacuum) {
            additionalBlocks = `
                <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <strong>Дополнительно:</strong> 2шт. средства (порошок) на запас, потратите оплатите нет, вернете.
                </div>
                <div style="background: #ffeb3b; border: 2px solid #f44336; padding: 15px; border-radius: 5px; margin: 20px 0; font-weight: bold;">
                    ВНИМАНИЕ!!! в комплекте будет щетка для чистки сильнозагрязненных поверхностей. Она ПЛАТНАЯ 150 рублей. Если вы ей воспользуетесь, то оплачиваете и оставляете у себя. Если нет вернете обратно (не нарушая упаковку).
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

        // 10. Генерируем HTML слайдера (если статус = 8)
        let sliderHtml = '';
        if (lead.STATUS_ID === '8') {
            sliderHtml = `
                <div id="slider-container" style="margin: 30px 0; padding: 20px;">
                    <div id="unlock-slider" class="unlock-slider">
                        <div class="slider-text">Сдвиньте для подтверждения</div>
                        <div class="slider-track">
                            <div class="slider-thumb" id="slider-thumb">
                                <div class="thumb-icon">→</div>
                            </div>
                            <div class="slider-fill" id="slider-fill"></div>
                        </div>
                        <div class="slider-success" id="slider-success" style="display: none;">
                            <div class="success-icon">✓</div>
                            <div class="success-text">Подтверждено!</div>
                        </div>
                    </div>
                    <div id="message"></div>
                </div>
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
          
          /* Слайдер разблокировки */
          .unlock-slider {
            position: relative;
            width: 100%;
            max-width: 400px;
            margin: 0 auto;
            user-select: none;
          }
          
          .slider-text {
            text-align: center;
            margin-bottom: 15px;
            color: #666;
            font-size: 14px;
          }
          
          .slider-track {
            position: relative;
            height: 50px;
            background: #e0e0e0;
            border-radius: 25px;
            overflow: hidden;
            cursor: pointer;
            box-shadow: inset 0 2px 5px rgba(0,0,0,0.1);
          }
          
          .slider-fill {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 0;
            background: #4CAF50;
            border-radius: 25px;
            transition: width 0.1s ease;
          }
          
          .slider-thumb {
            position: absolute;
            top: 5px;
            left: 5px;
            width: 40px;
            height: 40px;
            background: white;
            border-radius: 50%;
            cursor: grab;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            transition: all 0.2s ease;
            z-index: 2;
          }
          
          .slider-thumb:active {
            cursor: grabbing;
            transform: scale(1.1);
          }
          
          .thumb-icon {
            font-size: 18px;
            color: #666;
            font-weight: bold;
          }
          
          .slider-success {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #4CAF50;
            border-radius: 25px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            color: white;
            opacity: 0;
            transition: opacity 0.3s ease;
          }
          
          .success-icon {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          .success-text {
            font-size: 16px;
            font-weight: bold;
          }
          
          .slider-success.show {
            opacity: 1;
          }
          
          .unlock-slider.completed .slider-track {
            background: #4CAF50;
          }
          
          .unlock-slider.completed .slider-thumb {
            display: none;
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
        
        ${additionalBlocks}
        
        ${sliderHtml}

        <script>
          let isDragging = false;
          let startX = 0;
          let startLeft = 0;
          let sliderWidth = 0;
          let trackWidth = 0;
          let thumbWidth = 0;
          
          function initSlider() {
            const slider = document.getElementById('unlock-slider');
            if (!slider) return;
            
            const thumb = document.getElementById('slider-thumb');
            const track = slider.querySelector('.slider-track');
            
            sliderWidth = slider.offsetWidth;
            trackWidth = track.offsetWidth;
            thumbWidth = thumb.offsetWidth;
            
            // События для мыши
            thumb.addEventListener('mousedown', startDrag);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', endDrag);
            
            // События для тача
            thumb.addEventListener('touchstart', handleTouchStart, { passive: false });
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleTouchEnd);
          }
          
          function startDrag(e) {
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            const thumb = document.getElementById('slider-thumb');
            startLeft = parseInt(getComputedStyle(thumb).left) || 0;
            document.getElementById('unlock-slider').classList.remove('completed');
          }
          
          function handleTouchStart(e) {
            e.preventDefault();
            isDragging = true;
            startX = e.touches[0].clientX;
            const thumb = document.getElementById('slider-thumb');
            startLeft = parseInt(getComputedStyle(thumb).left) || 0;
            document.getElementById('unlock-slider').classList.remove('completed');
          }
          
          function drag(e) {
            if (!isDragging) return;
            updateThumbPosition(e.clientX);
          }
          
          function handleTouchMove(e) {
            if (!isDragging) return;
            e.preventDefault();
            updateThumbPosition(e.touches[0].clientX);
          }
          
          function updateThumbPosition(clientX) {
            const thumb = document.getElementById('slider-thumb');
            const fill = document.getElementById('slider-fill');
            const slider = document.getElementById('unlock-slider');
            const track = slider.querySelector('.slider-track');
            
            const deltaX = clientX - startX;
            let newLeft = startLeft + deltaX;
            
            // Ограничиваем движение ползунка
            const maxLeft = trackWidth - thumbWidth - 10;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            
            thumb.style.left = newLeft + 'px';
            
            // Обновляем заполнение
            const fillWidth = (newLeft / maxLeft) * 100;
            fill.style.width = fillWidth + '%';
            
            // Проверяем, достиг ли ползунок конца
            if (newLeft >= maxLeft - 5) {
              thumb.style.left = maxLeft + 'px';
              fill.style.width = '100%';
            }
          }
          
          function endDrag(e) {
            if (!isDragging) return;
            isDragging = false;
            
            const thumb = document.getElementById('slider-thumb');
            const maxLeft = trackWidth - thumbWidth - 10;
            const currentLeft = parseInt(getComputedStyle(thumb).left) || 0;
            
            if (currentLeft >= maxLeft - 5) {
              // Успешное завершение
              completeSlider();
            } else {
              // Сброс позиции
              resetSlider();
            }
          }
          
          function handleTouchEnd(e) {
            if (!isDragging) return;
            isDragging = false;
            
            const thumb = document.getElementById('slider-thumb');
            const maxLeft = trackWidth - thumbWidth - 10;
            const currentLeft = parseInt(getComputedStyle(thumb).left) || 0;
            
            if (currentLeft >= maxLeft - 5) {
              // Успешное завершение
              completeSlider();
            } else {
              // Сброс позиции
              resetSlider();
            }
          }
          
          function completeSlider() {
            const slider = document.getElementById('unlock-slider');
            const thumb = document.getElementById('slider-thumb');
            const fill = document.getElementById('slider-fill');
            const success = document.getElementById('slider-success');
            const message = document.getElementById('message');
            
            slider.classList.add('completed');
            success.style.display = 'flex';
            success.classList.add('show');
            
            // Отправляем запрос на подтверждение
            confirmLead(${lead.ID});
          }
          
          function resetSlider() {
            const thumb = document.getElementById('slider-thumb');
            const fill = document.getElementById('slider-fill');
            
            // Плавный сброс
            thumb.style.transition = 'left 0.3s ease';
            fill.style.transition = 'width 0.3s ease';
            
            thumb.style.left = '5px';
            fill.style.width = '0%';
            
            // Убираем transition после завершения
            setTimeout(() => {
              thumb.style.transition = '';
              fill.style.transition = '';
            }, 300);
          }
          
          async function confirmLead(leadId) {
            const message = document.getElementById('message');
            
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
                // Перезагружаем страницу через 1.5 секунды
                setTimeout(() => {
                  location.reload();
                }, 1500);
              } else {
                message.innerHTML = '<div style="color: red; text-align: center; margin-top: 10px;">❌ Ошибка: ' + result.error + '</div>';
                // Сбрасываем слайдер при ошибке
                setTimeout(() => {
                  const slider = document.getElementById('unlock-slider');
                  const success = document.getElementById('slider-success');
                  slider.classList.remove('completed');
                  success.classList.remove('show');
                  success.style.display = 'none';
                  resetSlider();
                }, 2000);
              }
            } catch (error) {
              message.innerHTML = '<div style="color: red; text-align: center; margin-top: 10px;">❌ Ошибка: ' + error.message + '</div>';
              // Сбрасываем слайдер при ошибке
              setTimeout(() => {
                const slider = document.getElementById('unlock-slider');
                const success = document.getElementById('slider-success');
                slider.classList.remove('completed');
                success.classList.remove('show');
                success.style.display = 'none';
                resetSlider();
              }, 2000);
            }
          }
          
          // Инициализация слайдера при загрузке страницы
          document.addEventListener('DOMContentLoaded', initSlider);
          window.addEventListener('resize', initSlider);
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