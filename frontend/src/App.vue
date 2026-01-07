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

<script>
import { defineComponent, onMounted, onErrorCaptured } from 'vue';
import { useAuthStore } from './stores';
import { useQuasar } from 'quasar';
import { useNetworkStatus } from './composables/useNetworkStatus';

export default defineComponent({
  name: 'App',
  setup() {
    const authStore = useAuthStore();
    const $q = useQuasar();
    const { isOnline } = useNetworkStatus();

    onMounted(async () => {
      if (authStore.token) {
        try {
          await authStore.fetchUser();
        } catch (error) {
          console.error('Failed to fetch user on mount:', error);
        }
      }
    });

    onErrorCaptured((err, instance, info) => {
      console.error('Vue Error Caught:', err, info);
      $q.notify({
        message: 'An unexpected error occurred. Please refresh the page.',
        color: 'negative',
        icon: 'error',
        timeout: 5000,
        actions: [{ label: 'Refresh', color: 'white', handler: () => window.location.reload() }]
      });
      return false;
    });

    const handleError = (error) => {
      console.error('Component Error:', error);
    };

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled Promise Rejection:', event.reason);
      $q.notify({
        message: 'An error occurred while processing your request',
        color: 'negative',
        icon: 'error'
      });
    });

    return { handleError, isOnline };
  }
});
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Roboto', sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
#app { min-height: 100vh; }
.stat-card { transition: transform 0.2s; &:hover { transform: translateY(-4px); } }
</style>
