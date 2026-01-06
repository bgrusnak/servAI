<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width: 1000px; margin: 0 auto;">
      <div class="row items-center q-mb-md"><div class="col"><h5 class="q-my-none">{{ resident?.fullName }}</h5></div><div class="col-auto q-gutter-sm"><q-btn flat icon="arrow_back" label="Back" @click="$router.back()" no-caps /><q-btn color="secondary" icon="edit" label="Edit" no-caps unelevated /></div></div>
      <q-inner-loading :showing="loading" />
      <div v-if="!loading && resident">
        <q-card class="q-mb-md"><q-card-section><div class="row q-col-gutter-md"><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Email</div><div class="info-value">{{ resident.email }}</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Phone</div><div class="info-value">{{ resident.phone }}</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Passport Number</div><div class="info-value">{{ resident.passportNumber }}</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Birth Date</div><div class="info-value">{{ formatDate(resident.birthDate) }}</div></div></div><div class="col-12 col-md-6"><div class="info-item"><div class="info-label">Complex</div><div class="info-value">{{ resident.complex?.name }}</div></div></div></div></q-card-section></q-card>
      </div>
    </div>
  </q-page>
</template>
<script>
import { defineComponent, ref, onMounted, computed } from 'vue'; import { useRoute } from 'vue-router'; import { useQuasar } from 'quasar'; import { residentsAPI } from '../../api';
export default defineComponent({ name: 'ViewResidentPage', setup() { const route = useRoute(); const $q = useQuasar(); const loading = ref(false), resident = ref(null); const residentId = computed(() => route.params.id); const formatDate = (date) => date ? new Date(date).toLocaleDateString() : '-'; const fetchResident = async () => { loading.value = true; try { const response = await residentsAPI.getById(residentId.value); resident.value = response.data; } catch (error) { $q.notify({ message: error.message, color: 'negative', icon: 'error' }); } finally { loading.value = false; } }; onMounted(() => { fetchResident(); }); return { loading, resident, formatDate }; } });
</script>
<style lang="scss" scoped>
.info-item { margin-bottom: 12px; .info-label { font-size: 0.875rem; color: #666; margin-bottom: 4px; } .info-value { font-size: 1rem; font-weight: 500; } }
</style>
