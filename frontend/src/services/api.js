import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

// Error handling
api.interceptors.response.use(
  response => response.data,
  error => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export default {
  // Get lead by key
  async getLeadByKey(key) {
    try {
      const response = await api.get(`/leads/${key}`)
      return response
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Ошибка при загрузке данных')
    }
  },

  // Confirm lead
  async confirmLead(leadId, key) {
    try {
      const response = await api.post(`/leads/${leadId}/confirm`, { key })
      return response
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Ошибка при подтверждении')
    }
  }
}