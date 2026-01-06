<template>
  <q-page padding>
    <div class="q-pa-md">
      <h5 class="q-my-none q-mb-md">{{ $t('nav.billing') }}</h5>
      <q-card><q-card-section><p class="text-grey-7">Billing overview</p></q-card-section></q-card>
    </div>
  </q-page>
</template>
<script>
import { defineComponent } from 'vue';
export default defineComponent({ name: 'BillingOverviewPage' });
</script>
