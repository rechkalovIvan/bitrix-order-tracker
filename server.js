require('dotenv').config();
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
                    <div class="products-grid">
                `;

        let total = 0;
        products.forEach(product => {
          const price = parseFloat(product.PRICE || 0);
          const quantity = parseFloat(product.QUANTITY || 0);
          const sum = price * quantity;
          total += sum;

          productsTable += `
                        <div class="product-card">
                            <div class="product-name">${product.PRODUCT_NAME || 'Без названия'}</div>
                            <div class="product-details">
                                <span class="product-price">${price.toFixed(2)} ₽</span>
                                <span class="product-quantity">× ${quantity}</span>
                            </div>
                            <div class="product-total">${sum.toFixed(2)} ₽</div>
                        </div>
                    `;
        });

        productsTable += `
                        <div class="products-total">
                            <div class="total-label">Итого:</div>
                            <div class="total-amount">${total.toFixed(2)} ₽</div>
                        </div>
                    </div>
                `;

        productsHtml = `<h3>Товары:</h3>${productsTable}`;
      }
    } catch (productErr) {
      console.error('Ошибка при получении товаров:', productErr);
      productsHtml = '<h3>Товары:</h3><p class="error-text">Ошибка загрузки товаров</p>';
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
                <div class="info-card warning">
                    <div class="info-icon">⚠️</div>
                    <div class="info-content">
                        <div class="info-title">Дополнительно</div>
                        <div class="info-text">2шт. средства (порошок) на запас, потратите оплатите нет, вернете.</div>
                    </div>
                </div>
                <div class="info-card alert">
                    <div class="info-icon">❗</div>
                    <div class="info-content">
                        <div class="info-title">ВНИМАНИЕ!!!</div>
                        <div class="info-text">в комплекте будет щетка для чистки сильнозагрязненных поверхностей. Она ПЛАТНАЯ 150 рублей. Если вы ей воспользуетесь, то оплачиваете и оставляете у себя. Если нет вернете обратно (не нарушая упаковку).</div>
                    </div>
                </div>
            `;
    }

    // 9. Определяем заголовок в зависимости от статуса
    let pageTitle = 'Проверьте и подтвердите';
    if (lead.STATUS_ID === '1') {
      pageTitle = 'Отправлена форма';
    } else if (lead.STATUS_ID === '2') {
      pageTitle = 'Предварительный расчет';
    } else if (lead.STATUS_ID === '7') {
      pageTitle = 'Согласовано';
    }

    // 10. Генерируем HTML слайдера (если статус = 8)
    let sliderHtml = '';
    if (lead.STATUS_ID === '8') {
      sliderHtml = `
                <div class="slider-section">
                    <div class="slider-wrapper">
                        <div id="slider-track">
                            <div class="slider-text">Все верно</div>
                            <div class="completion-animation"></div>
                        </div>
                        <div id="slider-thumb">
                            <div class="slider-icon">→</div>
                        </div>
                        <div class="hint-text">Проведите вправо</div>
                    </div>
                    <div id="message"></div>
                </div>
            `;
    }

    // 11. Подготавливаем HTML для типа оборудования (если поле заполнено)
    let equipmentHtml = '';
    if (lead.UF_CRM_1614544756) {
      equipmentHtml = `
                <div class="info-item">
                    <div class="info-label">Тип оборудования</div>
                    <div class="info-value">${formatEquipmentType(lead.UF_CRM_1614544756, 'UF_CRM_1614544756')}</div>
                </div>
            `;
    }

    // 12. Отправляем HTML клиенту
    res.send(`
      <html>
      <head>
        <title>Ваш лид</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            line-height: 1.6;
            padding: 20px;
            min-height: 100vh;
          }
          
          .container {
            max-width: 500px;
            margin: 0 auto;
          }
          
          .header {
            text-align: center;
            margin-bottom: 30px;
            color: white;
          }
          
          .header h1 {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 8px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          
          .card {
            background: white;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            backdrop-filter: blur(10px);
          }
          
          .info-grid {
            display: grid;
            gap: 16px;
          }
          
          .info-item {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          
          .info-label {
            font-weight: 500;
            color: #666;
            font-size: 0.9rem;
          }
          
          .info-value {
            text-align: right;
            font-weight: 500;
            color: #333;
            font-size: 0.9rem;
          }
          
          h3 {
            font-size: 1.125rem;
            font-weight: 600;
            margin-bottom: 16px;
            color: #333;
          }
          
          .products-grid {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          
          .product-card {
            padding: 16px;
            background: #f8f9fa;
            border-radius: 12px;
            border: 1px solid #e9ecef;
          }
          
          .product-name {
            font-weight: 500;
            margin-bottom: 8px;
            color: #333;
          }
          
          .product-details {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 0.875rem;
          }
          
          .product-price {
            color: #666;
          }
          
          .product-quantity {
            color: #888;
          }
          
          .product-total {
            font-weight: 600;
            color: #333;
            text-align: right;
            font-size: 1rem;
          }
          
          .products-total {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0 8px;
            border-top: 2px solid #e9ecef;
            font-weight: 600;
          }
          
          .total-label {
            font-size: 1.125rem;
            color: #333;
          }
          
          .total-amount {
            font-size: 1.25rem;
            color: #4caf50;
          }
          
          .info-card {
            display: flex;
            gap: 12px;
            padding: 16px;
            border-radius: 12px;
            margin-bottom: 16px;
            align-items: flex-start;
          }
          
          .info-card.warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
          }
          
          .info-card.alert {
            background: #ffebee;
            border: 1px solid #ffcdd2;
          }
          
          .info-icon {
            font-size: 1.25rem;
            flex-shrink: 0;
          }
          
          .info-content {
            flex: 1;
          }
          
          .info-title {
            font-weight: 600;
            margin-bottom: 4px;
            font-size: 0.9rem;
          }
          
          .info-text {
            font-size: 0.875rem;
            line-height: 1.4;
            color: #333;
          }
          
          .slider-section {
            margin: 30px 0;
          }
          
          .slider-wrapper {
            position: relative;
            margin: 30px 0;
            padding: 0 10px;
          }
          
          #slider-track {
            position: relative;
            height: 60px;
            background: #edf2f7;
            border-radius: 30px;
            overflow: hidden;
            transition: background-color 0.3s ease;
          }
          
          #slider-thumb {
            position: absolute;
            top: 5px;
            left: 5px;
            width: 50px;
            height: 50px;
            background: white;
            border-radius: 50%;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
            z-index: 10;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: grab;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          
          #slider-thumb:active {
            transform: scale(1.1);
            box-shadow: 0 6px 15px rgba(0, 0, 0, 0.25);
            cursor: grabbing;
          }
          
          .slider-icon {
            color: #4299e1;
            font-size: 20px;
            transition: color 0.3s;
          }
          
          .slider-text {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #4a5568;
            font-weight: 500;
            font-size: 18px;
            user-select: none;
            pointer-events: none;
            transition: opacity 0.3s, color 0.3s;
            z-index: 5;
          }
          
          .hint-text {
            margin-top: 15px;
            color: #ffffff;
            font-size: 14px;
            font-weight: 500;
            text-align: center;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
          }
          
          .completion-animation {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(56, 161, 105, 0.3);
            border-radius: 30px;
            opacity: 0;
            pointer-events: none;
          }
          
          .success-message {
            background: #f0fff4;
            color: #38a169;
            padding: 16px;
            border-radius: 12px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            animation: fadeIn 0.5s ease;
          }
          
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .error-text {
            color: #f44336;
            text-align: center;
            padding: 20px;
          }
          
          @media (max-width: 480px) {
            body {
              padding: 16px;
            }
            
            .card {
              padding: 20px;
            }
            
            .header h1 {
              font-size: 1.75rem;
            }
            
            .product-card {
              padding: 12px;
            }
            
            .info-card {
              padding: 12px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${pageTitle}</h1>
          </div>
          
          <div class="card">
            <div class="info-grid">

             <div class="info-item">
                <div class="info-label">Статус</div>
                <div class="info-value">${lead.STATUS_ID}</div>
              </div>
                            
              <div class="info-item">
                <div class="info-label">Дата начала</div>
                <div class="info-value">${formatRussianDate(lead.UF_CRM_BEGINDATE)}</div>
              </div>
              
              <div class="info-item">
                <div class="info-label">Время начала</div>
                <div class="info-value">${formatTimeList(lead.UF_CRM_1638818267, 'UF_CRM_1638818267')}</div>
              </div>
              
              <div class="info-item">
                <div class="info-label">Дата завершения</div>
                <div class="info-value">${formatRussianDate(lead.UF_CRM_5FB96D2488307)}</div>
              </div>
              
              <div class="info-item">
                <div class="info-label">Время завершения</div>
                <div class="info-value">${formatTimeList(lead.UF_CRM_1638818801, 'UF_CRM_1638818801')}</div>
              </div>
            </div>
          </div>
          
          <div class="card">
            ${productsHtml}
          </div>
          
          ${additionalBlocks}
          
          ${sliderHtml}
        </div>

        <script>
          // Элементы DOM
          let track, thumb, message, sliderText, completionAnimation;
          
          // Состояние слайдера
          let isDragging = false;
          let startX = 0;
          let startLeft = 0;
          let trackWidth = 0;
          let thumbWidth = 0;
          let maxLeft = 0;
          
          // Инициализация слайдера
          function initSlider() {
            track = document.getElementById('slider-track');
            thumb = document.getElementById('slider-thumb');
            message = document.getElementById('message');
            sliderText = document.querySelector('.slider-text');
            completionAnimation = document.querySelector('.completion-animation');
            
            if (!track || !thumb) return;
            
            // Получаем актуальные размеры
            trackWidth = track.offsetWidth;
            thumbWidth = thumb.offsetWidth;
            maxLeft = trackWidth - thumbWidth - 10;
            
            // Сбрасываем состояние
            resetSlider();
            
            // Добавляем обработчики событий
            addEventListeners();
          }
          
          // Добавление обработчиков событий
          function addEventListeners() {
            // События для мыши
            thumb.addEventListener('mousedown', onDragStart);
            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('mouseup', onDragEnd);
            
            // События для касаний
            thumb.addEventListener('touchstart', onTouchStart, { passive: false });
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onDragEnd);
            document.addEventListener('touchcancel', onDragEnd);
            
            // Предотвращение контекстного меню на thumb
            thumb.addEventListener('contextmenu', (e) => e.preventDefault());
          }
          
          // Обработчик начала перетаскивания
          function onDragStart(e) {
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startLeft = parseInt(getComputedStyle(thumb).left) || 0;
            
            // Добавляем активный класс
            thumb.classList.add('active');
            
            // Блокируем скролл страницы
            document.body.style.overflow = 'hidden';
          }
          
          // Обработчик касания
          function onTouchStart(e) {
            if (e.cancelable) e.preventDefault();
            isDragging = true;
            startX = e.touches[0].clientX;
            startLeft = parseInt(getComputedStyle(thumb).left) || 0;
            
            // Добавляем активный класс
            thumb.classList.add('active');
            
            // Блокируем скролл страницы
            document.body.style.overflow = 'hidden';
          }
          
          // Обработчик движения при перетаскивании
          function onDragMove(e) {
            if (!isDragging) return;
            
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            if (!clientX) return;
            
            e.preventDefault();
            updateThumbPosition(clientX);
          }
          
          // Обработчик движения при касании
          function onTouchMove(e) {
            if (!isDragging) return;
            
            if (e.cancelable) e.preventDefault();
            updateThumbPosition(e.touches[0].clientX);
          }
          
          // Обработчик окончания перетаскивания
          function onDragEnd() {
            if (!isDragging) return;
            
            isDragging = false;
            thumb.classList.remove('active');
            
            // Восстанавливаем скролл страницы
            document.body.style.overflow = '';
            
            const currentLeft = parseInt(getComputedStyle(thumb).left) || 0;
            
            if (currentLeft >= maxLeft - 15) {
              completeSlider();
            } else {
              resetSlider();
            }
          }
          
          // Обновление позиции thumb
          function updateThumbPosition(clientX) {
            const deltaX = clientX - startX;
            let newLeft = startLeft + deltaX;
            
            // Ограничиваем движение
            newLeft = Math.max(5, Math.min(newLeft, maxLeft));
            
            // Обновляем позицию
            thumb.style.left = newLeft + 'px';
            
            // Вычисляем процент заполнения
            const fillPercent = (newLeft / maxLeft) * 100;
            
            // Меняем цвет фона в зависимости от прогресса
            updateTrackColor(fillPercent);
            
            // Скрываем текст при движении
            if (fillPercent > 10) {
              sliderText.style.opacity = '0';
            } else {
              sliderText.style.opacity = '1';
            }
          }
          
          // Изменение цвета фона в зависимости от прогресса
          function updateTrackColor(percent) {
            // Интерполяция цвета от серого к зеленому
            const r = Math.floor(237 + (56 - 237) * percent / 100);
            const g = Math.floor(242 + (161 - 242) * percent / 100);
            const b = Math.floor(247 + (105 - 247) * percent / 100);
            
            track.style.backgroundColor = 'rgb(' + r + ', ' + g + ', ' + b + ')';
            
            // Меняем цвет текста на белый при достаточном прогрессе
            if (percent > 50) {
              sliderText.style.color = 'white';
            } else {
              sliderText.style.color = '#4a5568';
            }
          }
          
          // Сброс слайдера
          function resetSlider() {
            thumb.style.transition = 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
            track.style.transition = 'background-color 0.4s ease';
            
            thumb.style.left = '5px';
            track.style.backgroundColor = '#edf2f7';
            sliderText.style.opacity = '1';
            sliderText.style.color = '#4a5568';
            
            // Убираем transition после завершения
            setTimeout(() => {
              thumb.style.transition = '';
              track.style.transition = '';
            }, 400);
          }
          
          // Завершение слайдера
          function completeSlider() {
            // Анимация завершения
            thumb.style.transition = 'left 0.3s ease, transform 0.3s ease';
            track.style.transition = 'background-color 0.3s ease';
            
            thumb.style.left = maxLeft + 'px';
            track.style.backgroundColor = '#38a169';
            sliderText.style.color = 'white';
            
            // Анимация завершения
            completionAnimation.style.transition = 'opacity 0.3s ease';
            completionAnimation.style.opacity = '1';
            
            // Отправляем запрос на подтверждение
            confirmLead(${lead.ID});
          }
          
          // Отправка запроса на подтверждение лида
          async function confirmLead(leadId) {
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
                // Перезагружаем страницу через 0.5 секунды
                setTimeout(() => {
                  location.reload();
                }, 500);
              } else {
                message.innerHTML = '<div style="color: #f44336; text-align: center; margin-top: 16px; padding: 12px; background: #ffebee; border-radius: 8px; font-size: 0.875rem;">❌ Ошибка: ' + result.error + '</div>';
                // Сбрасываем слайдер при ошибке
                setTimeout(() => {
                  completionAnimation.style.opacity = '0';
                  resetSlider();
                }, 2000);
              }
            } catch (error) {
              message.innerHTML = '<div style="color: #f44336; text-align: center; margin-top: 16px; padding: 12px; background: #ffebee; border-radius: 8px; font-size: 0.875rem;">❌ Ошибка: ' + error.message + '</div>';
              // Сбрасываем слайдер при ошибке
              setTimeout(() => {
                completionAnimation.style.opacity = '0';
                resetSlider();
              }, 2000);
            }
          }
          
          // Инициализация при загрузке
          document.addEventListener('DOMContentLoaded', initSlider);
          
          // Переинициализация при изменении размера окна
          let resizeTimeout;
          window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(initSlider, 250);
          });
          
          // Предотвращение zoom на странице при двойном тапе
          let lastTouchEnd = 0;
          document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd < 300) {
              e.preventDefault();
            }
            lastTouchEnd = now;
          }, { passive: false });
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

// Форматирование даты в формате "Воскресенье, 31 августа 2025"
function formatRussianDate(dateStr) {
  if (!dateStr) return '—';

  try {
    const date = new Date(dateStr);

    // Дни недели
    const weekdays = [
      'Воскресенье', 'Понедельник', 'Вторник', 'Среда',
      'Четверг', 'Пятница', 'Суббота'
    ];

    // Месяцы в родительном падеже
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];

    const weekday = weekdays[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return weekday + ', ' + day + ' ' + month + ' ' + year;
  } catch {
    return dateStr;
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('Сервер запущен на порту ' + PORT);
});
