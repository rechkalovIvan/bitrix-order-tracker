<template>
  <div class="container">
    <div class="header">
      <h1>{{ pageTitle }}</h1>
    </div>
    
    <div v-if="loading" class="card">
      <div class="loading">Загрузка...</div>
    </div>
    
    <div v-else-if="error" class="card">
      <div class="error">{{ error }}</div>
    </div>
    
    <template v-else-if="leadData">
      <!-- Lead Information Card -->
      <div class="card">
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Статус</div>
            <div class="info-value">{{ leadData.statusText }}</div>
          </div>
          
          <div class="info-item">
            <div class="info-label">Дата начала</div>
            <div class="info-value">{{ leadData.beginDate }}</div>
          </div>
          
          <div class="info-item">
            <div class="info-label">Время начала</div>
            <div class="info-value">{{ leadData.beginTime }}</div>
          </div>
          
          <div class="info-item">
            <div class="info-label">Дата завершения</div>
            <div class="info-value">{{ leadData.endDate }}</div>
          </div>
          
          <div class="info-item">
            <div class="info-label">Время завершения</div>
            <div class="info-value">{{ leadData.endTime }}</div>
          </div>
          
          <div v-if="leadData.equipmentType" class="info-item">
            <div class="info-label">Тип оборудования</div>
            <div class="info-value">{{ leadData.equipmentType }}</div>
          </div>
        </div>
      </div>
      
      <!-- Products Card -->
      <div class="card">
        <ProductList :products="leadData.products" :total-amount="leadData.totalAmount" />
      </div>
      
      <!-- Additional Info Cards -->
      <template v-if="leadData.hasWashingVacuum">
        <InfoCard 
          type="warning" 
          icon="⚠️"
          title="Дополнительно"
          text="2шт. средства (порошок) на запас, потратите оплатите нет, вернете."
        />
        
        <InfoCard 
          type="alert" 
          icon="❗"
          title="ВНИМАНИЕ!!!"
          text="в комплекте будет щетка для чистки сильнозагрязненных поверхностей. Она ПЛАТНАЯ 150 рублей. Если вы ей воспользуетесь, то оплачиваете и оставляете у себя. Если нет вернете обратно (не нарушая упаковку)."
        />
      </template>
      
      <!-- Slider for confirmation -->
      <SliderConfirm 
        v-if="leadData.status === '8'"
        :lead-id="leadData.id"
        :key="key"
        @confirm="handleConfirm"
      />
    </template>
  </div>
</template>

<script>
import api from '../services/api'
import ProductList from '../components/ProductList.vue'
import InfoCard from '../components/InfoCard.vue'
import SliderConfirm from '../components/SliderConfirm.vue'

export default {
  name: 'TrackLead',
  components: {
    ProductList,
    InfoCard,
    SliderConfirm
  },
  data() {
    return {
      loading: false,
      error: null,
      leadData: null
    }
  },
  computed: {
    key() {
      return this.$route.params.key
    },
    pageTitle() {
      if (!this.leadData) return 'Загрузка...'
      return this.leadData.statusText
    }
  },
  async mounted() {
    await this.loadLeadData()
  },
  methods: {
    async loadLeadData() {
      this.loading = true
      this.error = null
      
      try {
        this.leadData = await api.getLeadByKey(this.key)
      } catch (error) {
        this.error = error.message
      } finally {
        this.loading = false
      }
    },
    
    async handleConfirm() {
      try {
        await api.confirmLead(this.leadData.id, this.key)
        // Reload data to show new status
        await this.loadLeadData()
      } catch (error) {
        console.error('Confirm error:', error)
        // Error handling is done in SliderConfirm component
      }
    }
  }
}
</script>

<style scoped>
.loading {
  text-align: center;
  padding: 40px 20px;
  color: #666;
  font-size: 1.1rem;
}

.error {
  text-align: center;
  padding: 40px 20px;
  color: #f44336;
  font-size: 1rem;
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
</style>