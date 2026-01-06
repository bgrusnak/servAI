<template>
  <div class="loading-spinner">
    <q-spinner-dots color="primary" size="50px" />
    <div v-if="message" class="loading-message q-mt-md">{{ message }}</div>
  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'LoadingSpinner',
  props: {
    message: {
      type: String,
      default: 'Loading...'
    }
  }
});
</script>

<style lang="scss" scoped>
.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  .loading-message {
    font-size: 0.875rem;
    color: #666;
  }
}
</style>
