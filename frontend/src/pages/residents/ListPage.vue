<template>
  <q-page padding>
    <div class="q-pa-md">
      <h5 class="q-my-none q-mb-md">{{ $t('nav.residents') }}</h5>
      <q-card><q-card-section><p class="text-grey-7">Residents list</p></q-card-section></q-card>
    </div>
  </q-page>
</template>
<script>
import { defineComponent } from 'vue';
export default defineComponent({ name: 'ResidentsListPage' });
</script>
