<template>
  <div class="container">
    <div class="header">
      <h1>Отслеживание лида</h1>
    </div>
    
    <div class="card">
      <h3>Пример ссылки:</h3>
      <p>
        <router-link to="/track/a7x9k2m5" class="example-link">
          /track/a7x9k2m5
        </router-link>
      </p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Home'
}
</script>

<style scoped>
.example-link {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
}

.example-link:hover {
  text-decoration: underline;
}

h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 16px;
  color: #333;
}

p {
  margin-bottom: 8px;
}
</style>