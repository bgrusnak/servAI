<template>
  <router-view />
</template>

<script>
import { defineComponent, onMounted } from 'vue';
import { useAuthStore } from './stores';

export default defineComponent({
  name: 'App',
  setup() {
    const authStore = useAuthStore();

    onMounted(async () => {
      if (authStore.token) {
        try {
          await authStore.fetchUser();
        } catch (error) {
          console.error('Failed to fetch user on mount', error);
        }
      }
    });

    return {};
  }
});
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Roboto', sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
#app { min-height: 100vh; }
.stat-card { transition: transform 0.2s; &:hover { transform: translateY(-4px); } }
</style>
