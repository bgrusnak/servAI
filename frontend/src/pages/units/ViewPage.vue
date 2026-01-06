<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width: 1000px; margin: 0 auto;">
      <div class="row items-center q-mb-md"><div class="col"><h5 class="q-my-none">Unit {{ unit?.unitNumber }}</h5></div><div class="col-auto q-gutter-sm"><q-btn flat icon="arrow_back" label="Back" @click="$router.back()" no-caps /><q-btn color="secondary" icon="edit" label="Edit" @click="showEditDialog = true" no-caps unelevated /></div></div>
      <q-inner-loading :showing="loading" />
      <div v-if="!loading && unit">
        <q-card class="q-mb-md"><q-card-section><div class="row q-col-gutter-md"><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Complex</div><div class="info-value">{{ unit.complex?.name }}</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Type</div><div class="info-value">{{ unit.type }}</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Area</div><div class="info-value">{{ unit.area }} m²</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Floor</div><div class="info-value">{{ unit.floor }}</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Status</div><q-badge :color="unit.status === 'occupied' ? 'positive' : 'grey'" :label="unit.status" /></div></div></div></q-card-section></q-card>
        <q-card><q-card-section><div class="text-h6 q-mb-md">Residents</div><q-list v-if="unit.residents?.length > 0" separator><q-item v-for="resident in unit.residents" :key="resident.id"><q-item-section><q-item-label>{{ resident.fullName }}</q-item-label><q-item-label caption>{{ resident.email }}</q-item-label></q-item-section></q-item></q-list><div v-else class="text-grey-7">No residents</div></q-card-section></q-card>
      </div>
    </div>
  </q-page>
</template>
<script>
import { defineComponent, ref, onMounted, computed } from 'vue'; import { useRoute } from 'vue-router'; import { useQuasar } from 'quasar'; import { unitsAPI } from '../../api';
export default defineComponent({ name: 'ViewUnitPage', setup() { const route = useRoute(); const $q = useQuasar(); const loading = ref(false), unit = ref(null), showEditDialog = ref(false); const unitId = computed(() => route.params.id); const fetchUnit = async () => { loading.value = true; try { const response = await unitsAPI.getById(unitId.value); unit.value = response.data; } catch (error) { $q.notify({ message: error.message, color: 'negative', icon: 'error' }); } finally { loading.value = false; } }; onMounted(() => { fetchUnit(); }); return { loading, unit, showEditDialog }; } });
</script>
<style lang="scss" scoped>
.info-item { margin-bottom: 12px; .info-label { font-size: 0.875rem; color: #666; margin-bottom: 4px; } .info-value { font-size: 1rem; font-weight: 500; } }
</style>
