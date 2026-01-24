<template>
  <div>
    <h3>Товары:</h3>
    <div v-if="products.length === 0" class="no-products">
      Нет товаров
    </div>
    <div v-else class="products-grid">
      <div 
        v-for="product in products" 
        :key="product.name"
        class="product-card"
      >
        <div class="product-name">{{ product.name }}</div>
        <div class="product-details">
          <span class="product-price">{{ product.price }} ₽</span>
          <span class="product-quantity">× {{ product.quantity }}</span>
        </div>
        <div class="product-total">{{ product.total }} ₽</div>
      </div>
      
      <div class="products-total">
        <div class="total-label">Итого:</div>
        <div class="total-amount">{{ totalAmount }} ₽</div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ProductList',
  props: {
    products: {
      type: Array,
      default: () => []
    },
    totalAmount: {
      type: String,
      default: '0.00'
    }
  }
}
</script>

<style scoped>
h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 16px;
  color: #333;
}

.no-products {
  text-align: center;
  color: #666;
  padding: 20px;
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
</style>