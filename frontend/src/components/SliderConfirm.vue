<template>
  <div class="slider-section">
    <div class="slider-wrapper">
      <div id="slider-track" ref="track">
        <div class="slider-text">Все верно</div>
        <div class="completion-animation" ref="completionAnimation"></div>
      </div>
      <div id="slider-thumb" ref="thumb">
        <div class="slider-icon">→</div>
      </div>
      <div class="hint-text">Проведите вправо</div>
    </div>
    <div id="message" ref="message"></div>
  </div>
</template>

<script>
import api from '../services/api'

export default {
  name: 'SliderConfirm',
  props: {
    leadId: {
      type: String,
      required: true
    },
    key: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      isDragging: false,
      startX: 0,
      startLeft: 0,
      trackWidth: 0,
      thumbWidth: 0,
      maxLeft: 0
    }
  },
  mounted() {
    this.initSlider()
  },
  beforeUnmount() {
    this.removeEventListeners()
  },
  methods: {
    initSlider() {
      const track = this.$refs.track
      const thumb = this.$refs.thumb
      
      if (!track || !thumb) return
      
      // Get actual dimensions
      this.trackWidth = track.offsetWidth
      this.thumbWidth = thumb.offsetWidth
      this.maxLeft = this.trackWidth - this.thumbWidth - 10
      
      // Reset state
      this.resetSlider()
      
      // Add event listeners
      this.addEventListeners()
    },
    
    addEventListeners() {
      const thumb = this.$refs.thumb
      
      // Mouse events
      thumb.addEventListener('mousedown', this.onDragStart)
      document.addEventListener('mousemove', this.onDragMove)
      document.addEventListener('mouseup', this.onDragEnd)
      
      // Touch events
      thumb.addEventListener('touchstart', this.onTouchStart, { passive: false })
      document.addEventListener('touchmove', this.onTouchMove, { passive: false })
      document.addEventListener('touchend', this.onDragEnd)
      document.addEventListener('touchcancel', this.onDragEnd)
      
      // Prevent context menu on thumb
      thumb.addEventListener('contextmenu', (e) => e.preventDefault())
    },
    
    removeEventListeners() {
      const thumb = this.$refs.thumb
      
      if (thumb) {
        thumb.removeEventListener('mousedown', this.onDragStart)
        thumb.removeEventListener('touchstart', this.onTouchStart)
        thumb.removeEventListener('contextmenu', this.onDragEnd)
      }
      
      document.removeEventListener('mousemove', this.onDragMove)
      document.removeEventListener('mouseup', this.onDragEnd)
      document.removeEventListener('touchmove', this.onTouchMove)
      document.removeEventListener('touchend', this.onDragEnd)
      document.removeEventListener('touchcancel', this.onDragEnd)
    },
    
    onDragStart(e) {
      e.preventDefault()
      this.isDragging = true
      this.startX = e.clientX
      this.startLeft = parseInt(getComputedStyle(this.$refs.thumb).left) || 0
      
      this.$refs.thumb.classList.add('active')
      document.body.style.overflow = 'hidden'
    },
    
    onTouchStart(e) {
      if (e.cancelable) e.preventDefault()
      this.isDragging = true
      this.startX = e.touches[0].clientX
      this.startLeft = parseInt(getComputedStyle(this.$refs.thumb).left) || 0
      
      this.$refs.thumb.classList.add('active')
      document.body.style.overflow = 'hidden'
    },
    
    onDragMove(e) {
      if (!this.isDragging) return
      
      const clientX = e.clientX || (e.touches && e.touches[0].clientX)
      if (!clientX) return
      
      e.preventDefault()
      this.updateThumbPosition(clientX)
    },
    
    onTouchMove(e) {
      if (!this.isDragging) return
      
      if (e.cancelable) e.preventDefault()
      this.updateThumbPosition(e.touches[0].clientX)
    },
    
    onDragEnd() {
      if (!this.isDragging) return
      
      this.isDragging = false
      this.$refs.thumb.classList.remove('active')
      document.body.style.overflow = ''
      
      const currentLeft = parseInt(getComputedStyle(this.$refs.thumb).left) || 0
      
      if (currentLeft >= this.maxLeft - 15) {
        this.completeSlider()
      } else {
        this.resetSlider()
      }
    },
    
    updateThumbPosition(clientX) {
      const deltaX = clientX - this.startX
      let newLeft = this.startLeft + deltaX
      
      // Limit movement
      newLeft = Math.max(5, Math.min(newLeft, this.maxLeft))
      
      // Update position
      this.$refs.thumb.style.left = newLeft + 'px'
      
      // Calculate fill percentage
      const fillPercent = (newLeft / this.maxLeft) * 100
      
      // Change background color based on progress
      this.updateTrackColor(fillPercent)
      
      // Hide text when moving
      const sliderText = this.$refs.track.querySelector('.slider-text')
      if (fillPercent > 10) {
        sliderText.style.opacity = '0'
      } else {
        sliderText.style.opacity = '1'
      }
    },
    
    updateTrackColor(percent) {
      const track = this.$refs.track
      const sliderText = track.querySelector('.slider-text')
      
      // Interpolate color from gray to green
      const r = Math.floor(237 + (56 - 237) * percent / 100)
      const g = Math.floor(242 + (161 - 242) * percent / 100)
      const b = Math.floor(247 + (105 - 247) * percent / 100)
      
      track.style.backgroundColor = 'rgb(' + r + ', ' + g + ', ' + b + ')'
      
      // Change text color to white at sufficient progress
      if (percent > 50) {
        sliderText.style.color = 'white'
      } else {
        sliderText.style.color = '#4a5568'
      }
    },
    
    resetSlider() {
      const thumb = this.$refs.thumb
      const track = this.$refs.track
      const sliderText = track.querySelector('.slider-text')
      
      thumb.style.transition = 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
      track.style.transition = 'background-color 0.4s ease'
      
      thumb.style.left = '5px'
      track.style.backgroundColor = '#edf2f7'
      sliderText.style.opacity = '1'
      sliderText.style.color = '#4a5568'
      
      // Remove transition after completion
      setTimeout(() => {
        thumb.style.transition = ''
        track.style.transition = ''
      }, 400)
    },
    
    async completeSlider() {
      const thumb = this.$refs.thumb
      const track = this.$refs.track
      const sliderText = track.querySelector('.slider-text')
      const completionAnimation = this.$refs.completionAnimation
      
      // Completion animation
      thumb.style.transition = 'left 0.3s ease, transform 0.3s ease'
      track.style.transition = 'background-color 0.3s ease'
      
      thumb.style.left = this.maxLeft + 'px'
      track.style.backgroundColor = '#38a169'
      sliderText.style.color = 'white'
      
      completionAnimation.style.transition = 'opacity 0.3s ease'
      completionAnimation.style.opacity = '1'
      
      try {
        await api.confirmLead(this.leadId, this.key)
        this.$refs.message.innerHTML = `
          <div class="success-message">
            ✅ Подтверждено! Страница обновится через секунду...
          </div>
        `
        
        // Emit event to parent
        this.$emit('confirm')
        
        // Reload page after delay
        setTimeout(() => {
          window.location.reload()
        }, 1000)
        
      } catch (error) {
        this.$refs.message.innerHTML = `
          <div class="error-message">
            ❌ Ошибка: ${error.message}
          </div>
        `
        
        // Reset slider after delay
        setTimeout(() => {
          completionAnimation.style.opacity = '0'
          this.resetSlider()
          this.$refs.message.innerHTML = ''
        }, 2000)
      }
    }
  }
}
</script>

<style scoped>
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
  margin-top: 16px;
}

.error-message {
  background: #ffebee;
  color: #f44336;
  padding: 16px;
  border-radius: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  animation: fadeIn 0.5s ease;
  margin-top: 16px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>