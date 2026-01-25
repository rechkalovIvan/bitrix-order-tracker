const config = require('../config/env');

let fetch;
(async () => {
  try {
    fetch = (await import('node-fetch')).default;
  } catch (err) {
    console.error('Ошибка загрузки node-fetch:', err);
  }
})();

class BitrixService {
  constructor() {
    this.webhookUrl = config.bitrix.webhookUrl;
    // Ensure URL ends with slash
    if (!this.webhookUrl.endsWith('/')) {
      this.webhookUrl += '/';
    }
  }

  async getLeadByKey(key) {
    if (!fetch) {
      throw new Error('Сервер не загрузил необходимые модули');
    }

    const response = await fetch(this.webhookUrl + 'crm.lead.list', {
      method: 'POST',
      body: JSON.stringify({
        filter: { UF_CRM_1754490207019: key },
        select: [
          'ID', 'TITLE', 'OPPORTUNITY', 'STATUS_ID', 'DATE_CREATE',
          'UF_CRM_BEGINDATE',
          'UF_CRM_1638818267',
          'UF_CRM_5FB96D2488307',
          'UF_CRM_1638818801',
          'UF_CRM_1614544756'
        ]
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();
    if (!data.result || data.result.length === 0) {
      throw new Error('Лид не найден или ключ неверный');
    }

    return data.result[0];
  }

  async getUserFields() {
    if (!fetch) {
      throw new Error('Сервер не загрузил необходимые модули');
    }

    const response = await fetch(this.webhookUrl + 'crm.lead.userfield.list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();
    const userFields = data.result || [];

    // Build field mappings for time and equipment fields
    const fieldMappings = {};
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

    return fieldMappings;
  }

  async getLeadProducts(leadId) {
    if (!fetch) {
      throw new Error('Сервер не загрузил необходимые модули');
    }

    const response = await fetch(this.webhookUrl + 'crm.lead.productrows.get', {
      method: 'POST',
      body: JSON.stringify({ id: leadId }),
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();
    return data.result || [];
  }

  async updateLeadStatus(leadId, statusId) {
    if (!fetch) {
      throw new Error('Сервер не загрузил необходимые модули');
    }

    const response = await fetch(this.webhookUrl + 'crm.lead.update', {
      method: 'POST',
      body: JSON.stringify({
        id: leadId,
        fields: {
          STATUS_ID: statusId
        }
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();
    return data.result;
  }

  formatTimeList(fieldId, fieldName, fieldMappings) {
    if (!fieldId) return '—';

    // Multiple values
    if (Array.isArray(fieldId)) {
      return fieldId.map(id =>
        fieldMappings[fieldName]?.[id] || `ID: ${id}`
      ).join(', ');
    }

    return fieldMappings[fieldName]?.[fieldId] || `ID: ${fieldId}`;
  }

  formatEquipmentType(fieldId, fieldName, fieldMappings) {
    if (!fieldId) return '—';

    if (Array.isArray(fieldId)) {
      return fieldId.map(id =>
        fieldMappings[fieldName]?.[id] || `ID: ${id}`
      ).join(', ');
    }

    return fieldMappings[fieldName]?.[fieldId] || `ID: ${fieldId}`;
  }

  getEquipmentTypes(fieldId, fieldName, fieldMappings) {
    if (!fieldId) return [];

    if (Array.isArray(fieldId)) {
      return fieldId.map(id =>
        fieldMappings[fieldName]?.[id] || `ID: ${id}`
      );
    } else {
      return [fieldMappings[fieldName]?.[fieldId] || `ID: ${fieldId}`];
    }
  }

  hasWashingVacuum(equipmentTypes) {
    return equipmentTypes.some(type =>
      type.includes('Моющий пылесос') || type === 'Моющий пылесос'
    );
  }

  getStatusText(statusId) {
    const statusMap = {
      '1': 'Отправлена форма',
      '2': 'Предварительный расчет',
      '7': 'Согласовано',
      '8': 'Проверьте и подтвердите'
    };
    return statusMap[statusId] || 'Проверьте и подтвердите';
  }
}

module.exports = new BitrixService();
