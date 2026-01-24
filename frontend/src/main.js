import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import TrackLead from './views/TrackLead.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/track/:key', component: TrackLead }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

const app = createApp(App)
app.use(router)
app.mount('#app')