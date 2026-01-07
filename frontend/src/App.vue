<template>
  <ErrorBoundary>
    <router-view v-slot="{ Component }">
      <Suspense>
        <component :is="Component" />
        
        <template #fallback>
          <div class="flex flex-center" style="min-height: 100vh;">
            <q-spinner-dots color="primary" size="50px" />
          </div>
        </template>
        
        <template #error="{ error }">
          <div class="flex flex-center column q-pa-lg" style="min-height: 100vh;">
            <q-icon name="error_outline" size="60px" color="negative" class="q-mb-md" />
            <h3 class="text-h5 q-mb-sm">Failed to load page</h3>
            <p class="text-subtitle1 text-grey-7 q-mb-md">{{ error?.message || 'Unknown error' }}</p>
            <q-btn color="primary" @click="router.go(0)" label="Reload Page" unelevated />
          </div>
        </template>
      </Suspense>
    </router-view>
  </ErrorBoundary>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useQuasar } from 'quasar';
import { useNetworkStatus } from './composables/useNetworkStatus';
import ErrorBoundary from './components/ErrorBoundary.vue';

const router = useRouter();
const authStore = useAuthStore();
const $q = useQuasar();
const { isOnline } = useNetworkStatus();

onMounted(async () => {
  // Fetch user data if token exists
  if (authStore.token) {
    try {
      await authStore.fetchUser();
    } catch (error) {
      console.error('Failed to fetch user on mount:', error);
      // Don't logout here - let router navigation handle it
    }
  }
  
  // Show network status notifications
  if (!isOnline.value) {
    $q.notify({
      message: 'You are offline. Some features may not work.',
      color: 'warning',
      icon: 'cloud_off',
      timeout: 0,
      actions: [{ label: 'Dismiss', color: 'white' }]
    });
  }
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
  
  // Prevent default browser handling
  event.preventDefault();
  
  // Send to error tracking service in production
  if (import.meta.env.PROD && window.Sentry) {
    window.Sentry.captureException(event.reason, {
      tags: { type: 'unhandled_rejection' }
    });
  }
  
  // Show user-friendly notification
  $q.notify({
    message: 'An unexpected error occurred',
    caption: import.meta.env.DEV ? event.reason?.message : undefined,
    color: 'negative',
    icon: 'error',
    timeout: 5000,
    actions: [
      { label: 'Dismiss', color: 'white' },
      { label: 'Reload', color: 'white', handler: () => window.location.reload() }
    ]
  });
});

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global Error:', event.error);
  
  if (import.meta.env.PROD && window.Sentry) {
    window.Sentry.captureException(event.error);
  }
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

/* Utility classes */
.stat-card { 
  transition: transform 0.2s ease, box-shadow 0.2s ease; 
}

.stat-card:hover { 
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0,0,0,0.1);
}

/* Print styles */
@media print {
  .no-print {
    display: none !important;
  }
}
</style>
