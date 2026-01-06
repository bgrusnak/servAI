<template>
  <q-page padding>
    <div class="q-pa-md">
      <h5 class="q-my-none q-mb-md">{{ $t('nav.workers') }}</h5>
      <q-card><q-card-section><p class="text-grey-7">Workers list</p></q-card-section></q-card>
    </div>
  </q-page>
</template>
<script>
import { defineComponent } from 'vue';
export default defineComponent({ name: 'WorkersListPage' });
</script>
