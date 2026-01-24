<template>
  <div :class="['info-card', type]">
    <div class="info-icon">{{ icon }}</div>
    <div class="info-content">
      <div class="info-title">{{ title }}</div>
      <div class="info-text">{{ text }}</div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'InfoCard',
  props: {
    type: {
      type: String,
      default: 'info',
      validator: (value) => ['info', 'warning', 'alert'].includes(value)
    },
    icon: {
      type: String,
      default: 'ℹ️'
    },
    title: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true
    }
  }
}
</script>

<style scoped>
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
</style>