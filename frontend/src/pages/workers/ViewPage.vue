<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width: 1000px; margin: 0 auto;">
      <div class="row items-center q-mb-md"><div class="col"><h5 class="q-my-none">{{ worker?.fullName }}</h5></div><div class="col-auto q-gutter-sm"><q-btn flat icon="arrow_back" label="Back" @click="$router.back()" no-caps /><q-btn color="secondary" icon="edit" label="Edit" no-caps unelevated /></div></div>
      <q-inner-loading :showing="loading" />
      <div v-if="!loading && worker">
        <q-card class="q-mb-md"><q-card-section><div class="row q-col-gutter-md"><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Email</div><div class="info-value">{{ worker.email }}</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Phone</div><div class="info-value">{{ worker.phone }}</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Position</div><div class="info-value">{{ worker.position }}</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Hire Date</div><div class="info-value">{{ formatDate(worker.hireDate) }}</div></div></div></div></q-card-section></q-card>
      </div>
    </div>
  </q-page>
</template>
<script>
import { defineComponent, ref, onMounted, computed } from 'vue'; import { useRoute } from 'vue-router'; import { useQuasar } from 'quasar'; import { workersAPI } from '../../api';
export default defineComponent({ name: 'ViewWorkerPage', setup() { const route = useRoute(); const $q = useQuasar(); const loading = ref(false), worker = ref(null); const workerId = computed(() => route.params.id); const formatDate = (date) => date ? new Date(date).toLocaleDateString() : '-'; const fetchWorker = async () => { loading.value = true; try { const response = await workersAPI.getById(workerId.value); worker.value = response.data; } catch (error) { $q.notify({ message: error.message, color: 'negative', icon: 'error' }); } finally { loading.value = false; } }; onMounted(() => { fetchWorker(); }); return { loading, worker, formatDate }; } });
</script>
<style lang="scss" scoped>
.info-item { margin-bottom: 12px; .info-label { font-size: 0.875rem; color: #666; margin-bottom: 4px; } .info-value { font-size: 1rem; font-weight: 500; } }
</style>
