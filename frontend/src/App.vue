<template>
  <router-view v-slot="{ Component }">
    <suspense>
      <component :is="Component" @vue:error="handleError" />
      <template #fallback>
        <div class="flex flex-center" style="min-height: 100vh;">
          <q-spinner-dots color="primary" size="50px" />
        </div>
      </template>
    </suspense>
  </router-view>
</template>

<script setup>
import { onMounted, onErrorCaptured } from 'vue';
import { useAuthStore } from './stores/auth';
import { useQuasar } from 'quasar';
import { useNetworkStatus } from './composables/useNetworkStatus';

const authStore = useAuthStore();
const $q = useQuasar();
const { isOnline } = useNetworkStatus();

onMounted(async () => {
  if (authStore.token) {
    try {
      await authStore.fetchUser();
    } catch (error) {
      console.error('Failed to fetch user on mount:', error);
      // Don't logout here - let router navigation handle it
    }
  }
  
  // Register service worker
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('Service worker registration failed:', err);
    });
  }
});

onErrorCaptured((err, instance, info) => {
  console.error('Vue Error Caught:', err, info);
  
  $q.notify({
    message: 'An unexpected error occurred. Please try again.',
    color: 'negative',
    icon: 'error',
    timeout: 5000,
    actions: [
      { label: 'Dismiss', color: 'white' },
      { label: 'Refresh', color: 'white', handler: () => window.location.reload() }
    ]
  });
  
  // Send to error tracking service (Sentry, etc.)
  if (import.meta.env.PROD && window.Sentry) {
    window.Sentry.captureException(err, { extra: { info, instance } });
  }
  
  return false;
});

const handleError = (error) => {
  console.error('Component Error:', error);
};

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
  
  if (import.meta.env.PROD && window.Sentry) {
    window.Sentry.captureException(event.reason);
  }
  
  $q.notify({
    message: 'An error occurred while processing your request',
    color: 'negative',
    icon: 'error',
    timeout: 3000
  });
});
</script>

<style>
* { 
  margin: 0; 
  padding: 0; 
  box-sizing: border-box; 
}

body { 
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased; 
  -moz-osx-font-smoothing: grayscale; 
}

#app { 
  min-height: 100vh; 
}

.stat-card { 
  transition: transform 0.2s ease; 
  
  &:hover { 
    transform: translateY(-4px); 
  } 
}

/* Accessibility */
:focus-visible {
  outline: 2px solid #667eea;
  outline-offset: 2px;
}

/* Loading transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Scrollbar styles */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
