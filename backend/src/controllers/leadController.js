const bitrixService = require('../services/bitrixService');
const { formatRussianDate } = require('../utils/dateHelpers');

class LeadController {
  async getLeadByKey(req, res, next) {
    try {
      const { key } = req.params;

      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'Не указан ключ доступа'
        });
      }

      // 1. Получаем лид по ключу
      const lead = await bitrixService.getLeadByKey(key);

      // 2. Получаем пользовательские поля для списков
      const fieldMappings = await bitrixService.getUserFields();

      // 3. Получаем товары лида
      const products = await bitrixService.getLeadProducts(lead.ID);

      // 4. Рассчитываем общую сумму
      let total = 0;
      const formattedProducts = products.map(product => {
        const price = parseFloat(product.PRICE || 0);
        const quantity = parseFloat(product.QUANTITY || 0);
        const sum = price * quantity;
        total += sum;

        return {
          name: product.PRODUCT_NAME || 'Без названия',
          price: price.toFixed(2),
          quantity: quantity.toString(),
          total: sum.toFixed(2)
        };
      });

      // 5. Форматируем типы оборудования
      const equipmentTypes = bitrixService.getEquipmentTypes(
        lead.UF_CRM_1614544756,
        'UF_CRM_1614544756',
        fieldMappings
      );

      // 6. Проверяем наличие моющего пылесоса
      const hasWashingVacuum = bitrixService.hasWashingVacuum(equipmentTypes);

      // 7. Формируем ответ
      const responseData = {
        id: lead.ID,
        title: lead.TITLE,
        status: lead.STATUS_ID,
        statusText: bitrixService.getStatusText(lead.STATUS_ID),
        beginDate: formatRussianDate(lead.UF_CRM_BEGINDATE),
        beginTime: bitrixService.formatTimeList(
          lead.UF_CRM_1638818267,
          'UF_CRM_1638818267',
          fieldMappings
        ),
        endDate: formatRussianDate(lead.UF_CRM_5FB96D2488307),
        endTime: bitrixService.formatTimeList(
          lead.UF_CRM_1638818801,
          'UF_CRM_1638818801',
          fieldMappings
        ),
        equipmentType: bitrixService.formatEquipmentType(
          lead.UF_CRM_1614544756,
          'UF_CRM_1614544756',
          fieldMappings
        ),
        products: formattedProducts,
        totalAmount: total.toFixed(2),
        hasWashingVacuum
      };

      res.json({
        success: true,
        data: responseData
      });

    } catch (error) {
      next(error);
    }
  }

  async confirmLead(req, res, next) {
    try {
      const { id } = req.params;
      const { key } = req.body;

      if (!id || !key) {
        return res.status(400).json({
          success: false,
          error: 'Некорректные данные'
        });
      }

      // Проверяем, что лид принадлежит этому ключу и имеет статус 8
      const lead = await bitrixService.getLeadByKey(key);
      
      if (lead.ID !== id || lead.STATUS_ID !== '8') {
        return res.status(400).json({
          success: false,
          error: 'Лид не найден, ключ неверный или статус не 8'
        });
      }

      // Обновляем статус лида на ID 7
      const result = await bitrixService.updateLeadStatus(id, '7');

      if (result) {
        res.json({
          success: true,
          message: 'Lead confirmed successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Не удалось обновить статус лида'
        });
      }

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LeadController();