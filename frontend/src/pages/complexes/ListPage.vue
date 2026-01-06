<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">{{ $t('nav.complexes') }}</h5>
        </div>
        <div class="col-auto">
          <q-btn color="primary" icon="add" :label="$t('common.create')" @click="$router.push('/complexes/create')" no-caps />
        </div>
      </div>
      <q-card>
        <q-card-section>
          <p class="text-grey-7">Complexes list will be here</p>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script>
import { defineComponent } from 'vue';
export default defineComponent({ name: 'ComplexesListPage' });
</script>
