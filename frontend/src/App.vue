<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" @vue:error="handleError" />
  </router-view>
</template>

<script>
import { defineComponent, onMounted, onErrorCaptured } from 'vue';
import { useAuthStore } from './stores';
import { useQuasar } from 'quasar';

export default defineComponent({
  name: 'App',
  setup() {
    const authStore = useAuthStore();
    const $q = useQuasar();

    onMounted(async () => {
      if (authStore.token) {
        try {
          await authStore.fetchUser();
        } catch (error) {
          console.error('Failed to fetch user on mount', error);
        }
      }
    });

    onErrorCaptured((err, instance, info) => {
      console.error('Vue Error Caught:', err, info);
      $q.notify({
        message: 'An error occurred. Please refresh the page.',
        color: 'negative',
        icon: 'error',
        timeout: 5000
      });
      return false;
    });

    const handleError = (error) => {
      console.error('Component Error:', error);
    };

    return { handleError };
  }
});
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Roboto', sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
#app { min-height: 100vh; }
.stat-card { transition: transform 0.2s; &:hover { transform: translateY(-4px); } }
</style>
