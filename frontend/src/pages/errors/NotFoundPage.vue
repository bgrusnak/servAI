<template>
  <q-page class="flex flex-center">
    <div class="text-center">
      <q-icon name="error_outline" size="120px" color="warning" />
      <h4 class="q-my-md">404 - Page Not Found</h4>
      <p class="text-grey-7">The page you are looking for doesn't exist</p>
      <q-btn color="primary" label="Go to Dashboard" @click="$router.push('/dashboard')" />
    </div>
  </q-page>
</template>
<script>
import { defineComponent } from 'vue';
export default defineComponent({ name: 'NotFoundPage' });
</script>
