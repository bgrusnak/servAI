<template>
  <q-page class="flex flex-center">
    <div class="text-center">
      <q-icon name="block" size="120px" color="negative" />
      <h4 class="q-my-md">403 - Unauthorized</h4>
      <p class="text-grey-7">You don't have permission to access this page</p>
      <q-btn color="primary" label="Go to Dashboard" @click="$router.push('/dashboard')" />
    </div>
  </q-page>
</template>
<script>
import { defineComponent } from 'vue';
export default defineComponent({ name: 'UnauthorizedPage' });
</script>
