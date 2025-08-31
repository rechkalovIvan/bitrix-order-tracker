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
                    <div class="modern-slider-container">
                        <div class="slider-instructions">Сдвиньте вправо для подтверждения</div>
                        <div id="modern-slider" class="modern-slider">
                            <div class="slider-track">
                                <div class="slider-text">
                                    <span class="slider-text-normal">Сдвиньте →</span>
                                    <span class="slider-text-success">Подтверждено!</span>
                                </div>
                                <div class="slider-thumb" id="slider-thumb">
                                    <div class="thumb-handle">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </div>
                                </div>
                            </div>
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
            margin: 40px 0 30px;
          }
          
          .modern-slider-container {
            padding: 0 15px;
          }
          
          .slider-instructions {
            text-align: center;
            color: white;
            font-size: 0.9rem;
            margin-bottom: 15px;
            font-weight: 500;
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
          }
          
          .modern-slider {
            position: relative;
            width: 100%;
            height: 70px;
            user-select: none;
          }
          
          .slider-track {
            position: relative;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 35px;
            overflow: hidden;
            cursor: pointer;
            box-shadow: 
              inset 0 2px 10px rgba(0,0,0,0.1),
              0 4px 20px rgba(0,0,0,0.15);
            backdrop-filter: blur(10px);
            border: 2px solid rgba(255, 255, 255, 0.3);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .slider-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 1.1rem;
            font-weight: 600;
            z-index: 2;
            pointer-events: none;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: opacity 0.3s ease;
          }
          
          .slider-text-success {
            display: none;
          }
          
          .slider-thumb {
            position: absolute;
            top: 5px;
            left: 5px;
            width: 60px;
            height: 60px;
            cursor: grab;
            z-index: 3;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .thumb-handle {
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 
              0 6px 20px rgba(0,0,0,0.25),
              0 2px 6px rgba(0,0,0,0.2),
              inset 0 2px 4px rgba(255,255,255,0.8);
            color: #666;
            border: 2px solid rgba(255, 255, 255, 0.5);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .slider-thumb:active {
            cursor: grabbing;
          }
          
          .thumb-handle:active {
            transform: scale(1.05);
            box-shadow: 
              0 8px 25px rgba(0,0,0,0.3),
              0 4px 10px rgba(0,0,0,0.25),
              inset 0 2px 4px rgba(255,255,255,0.6);
          }
          
          .modern-slider.completed .slider-track {
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            box-shadow: 0 0 30px rgba(76, 175, 80, 0.4);
          }
          
          .modern-slider.completed .slider-text-normal {
            display: none;
          }
          
          .modern-slider.completed .slider-text-success {
            display: flex;
            animation: pulse 0.5s ease-in-out;
          }
          
          .modern-slider.completed .thumb-handle {
            background: linear-gradient(135deg, #4CAF50, #2E7D32);
            color: white;
            box-shadow: 
              0 8px 25px rgba(76, 175, 80, 0.4),
              0 4px 15px rgba(76, 175, 80, 0.3),
              inset 0 2px 4px rgba(255,255,255,0.3);
          }
          
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
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
            
            .modern-slider-container {
              padding: 0 10px;
            }
            
            .slider-text {
              font-size: 1rem;
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
          let isDragging = false;
          let startX = 0;
          let startLeft = 0;
          let trackWidth = 0;
          let thumbWidth = 0;
          
          function initSlider() {
            const slider = document.getElementById('modern-slider');
            if (!slider) return;
            
            const thumb = document.getElementById('slider-thumb');
            const track = slider.querySelector('.slider-track');
            
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
            document.getElementById('modern-slider').classList.remove('completed');
          }
          
          function handleTouchStart(e) {
            e.preventDefault();
            isDragging = true;
            startX = e.touches[0].clientX;
            const thumb = document.getElementById('slider-thumb');
            startLeft = parseInt(getComputedStyle(thumb).left) || 0;
            document.getElementById('modern-slider').classList.remove('completed');
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
            const track = document.getElementById('modern-slider').querySelector('.slider-track');
            
            const deltaX = clientX - startX;
            let newLeft = startLeft + deltaX;
            
            // Ограничиваем движение ползунка
            const maxLeft = trackWidth - thumbWidth - 10;
            newLeft = Math.max(5, Math.min(newLeft, maxLeft));
            
            thumb.style.left = newLeft + 'px';
            
            // Изменяем градиент фона трека в зависимости от позиции
            const progress = (newLeft - 5) / (maxLeft - 5);
            const greenValue = Math.min(255, Math.floor(progress * 255));
            const redValue = Math.min(255, Math.floor((1 - progress) * 255));
            
            track.style.background = \`linear-gradient(90deg, 
              rgba(\${redValue}, \${255 - greenValue}, \${255 - greenValue}, 0.3) 0%, 
              rgba(\${Math.min(255, Math.floor(progress * 100))}, \${greenValue}, \${Math.floor(progress * 50)}, 0.4) 100%)\`;
            
            // Проверяем, достиг ли ползунок конца
            if (newLeft >= maxLeft - 2) {
              thumb.style.left = maxLeft + 'px';
            }
          }
          
          function endDrag(e) {
            if (!isDragging) return;
            isDragging = false;
            
            const thumb = document.getElementById('slider-thumb');
            const maxLeft = trackWidth - thumbWidth - 10;
            const currentLeft = parseInt(getComputedStyle(thumb).left) || 0;
            
            if (currentLeft >= maxLeft - 2) {
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
            
            if (currentLeft >= maxLeft - 2) {
              // Успешное завершение
              completeSlider();
            } else {
              // Сброс позиции
              resetSlider();
            }
          }
          
          function completeSlider() {
            const slider = document.getElementById('modern-slider');
            const thumb = document.getElementById('slider-thumb');
            const track = slider.querySelector('.slider-track');
            const message = document.getElementById('message');
            
            slider.classList.add('completed');
            
            // Устанавливаем финальный градиент
            track.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
            
            // Отправляем запрос на подтверждение
            confirmLead(${lead.ID});
          }
          
          function resetSlider() {
            const thumb = document.getElementById('slider-thumb');
            const track = document.getElementById('modern-slider').querySelector('.slider-track');
            
            // Плавный сброс
            thumb.style.transition = 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
            
            thumb.style.left = '5px';
            
            // Сброс градиента
            setTimeout(() => {
              track.style.background = 'rgba(255, 255, 255, 0.2)';
              thumb.style.transition = '';
            }, 400);
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
                message.innerHTML = '<div style="color: #f44336; text-align: center; margin-top: 16px; padding: 12px; background: #ffebee; border-radius: 8px; font-size: 0.875rem;">❌ Ошибка: ' + result.error + '</div>';
                // Сбрасываем слайдер при ошибке
                setTimeout(() => {
                  const slider = document.getElementById('modern-slider');
                  slider.classList.remove('completed');
                  resetSlider();
                }, 2000);
              }
            } catch (error) {
              message.innerHTML = '<div style="color: #f44336; text-align: center; margin-top: 16px; padding: 12px; background: #ffebee; border-radius: 8px; font-size: 0.875rem;">❌ Ошибка: ' + error.message + '</div>';
              // Сбрасываем слайдер при ошибке
              setTimeout(() => {
                const slider = document.getElementById('modern-slider');
                slider.classList.remove('completed');
                resetSlider();
              }, 2000);
            }
          }
          
          // Инициализация слайдера при загрузке страницы
          document.addEventListener('DOMContentLoaded', initSlider);
          window.addEventListener('resize', () => {
            // Пересчитываем размеры при ресайзе
            const slider = document.getElementById('modern-slider');
            if (slider) {
              const track = slider.querySelector('.slider-track');
              trackWidth = track.offsetWidth;
              thumbWidth = document.getElementById('slider-thumb').offsetWidth;
            }
          });
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

    return `${weekday}, ${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});