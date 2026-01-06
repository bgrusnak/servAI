<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width: 1200px; margin: 0 auto;">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">{{ complex?.name }}</h5>
          <q-badge :color="complex?.status === 'active' ? 'positive' : 'negative'" :label="$t(`common.${complex?.status}`)" />
        </div>
        <div class="col-auto q-gutter-sm">
          <q-btn flat icon="arrow_back" :label="$t('common.back')" @click="$router.back()" no-caps />
          <q-btn color="secondary" icon="edit" :label="$t('common.edit')" @click="$router.push(`/complexes/${complexId}/edit`)" no-caps unelevated />
        </div>
      </div>

      <q-inner-loading :showing="loading" />

      <div v-if="!loading && complex">
        <!-- Stats -->
        <div class="row q-col-gutter-md q-mb-lg">
          <div class="col-12 col-sm-6 col-md-3">
            <q-card class="stat-card"><q-card-section><div class="stat-value text-primary">{{ stats.buildings }}</div><div class="stat-label">{{ $t('nav.buildings') }}</div></q-card-section></q-card>
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-card class="stat-card"><q-card-section><div class="stat-value text-secondary">{{ stats.units }}</div><div class="stat-label">{{ $t('nav.units') }}</div></q-card-section></q-card>
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-card class="stat-card"><q-card-section><div class="stat-value text-positive">{{ stats.residents }}</div><div class="stat-label">{{ $t('nav.residents') }}</div></q-card-section></q-card>
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-card class="stat-card"><q-card-section><div class="stat-value text-warning">{{ stats.openTickets }}</div><div class="stat-label">{{ $t('dashboard.stats.openTickets') }}</div></q-card-section></q-card>
          </div>
        </div>

        <!-- Info Cards -->
        <q-card class="q-mb-md">
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('complexes.basicInfo') }}</div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6"><div class="info-item"><div class="info-label">{{ $t('complexes.buildingType') }}</div><div class="info-value">{{ complex.buildingType }}</div></div></div>
              <div class="col-12 col-md-6"><div class="info-item"><div class="info-label">{{ $t('complexes.buildingYear') }}</div><div class="info-value">{{ complex.buildingYear || '-' }}</div></div></div>
              <div class="col-12"><div class="info-item"><div class="info-label">{{ $t('common.description') }}</div><div class="info-value">{{ complex.description || '-' }}</div></div></div>
            </div>
          </q-card-section>
        </q-card>

        <q-card class="q-mb-md">
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('complexes.addressInfo') }}</div>
            <div class="row q-col-gutter-md">
              <div class="col-12"><div class="info-item"><div class="info-label">{{ $t('common.address') }}</div><div class="info-value">{{ complex.address }}</div></div></div>
              <div class="col-12 col-md-4"><div class="info-item"><div class="info-label">{{ $t('managementCompanies.city') }}</div><div class="info-value">{{ complex.city }}</div></div></div>
              <div class="col-12 col-md-4"><div class="info-item"><div class="info-label">{{ $t('managementCompanies.country') }}</div><div class="info-value">{{ complex.country }}</div></div></div>
              <div class="col-12 col-md-4"><div class="info-item"><div class="info-label">{{ $t('managementCompanies.postalCode') }}</div><div class="info-value">{{ complex.postalCode || '-' }}</div></div></div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Buildings -->
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('nav.buildings') }}</div>
            <div class="row q-col-gutter-md">
              <div v-for="building in buildings" :key="building.id" class="col-12 col-sm-6 col-md-4">
                <q-card class="building-card" flat bordered>
                  <q-card-section>
                    <div class="text-h6">{{ building.name }}</div>
                    <div class="q-mt-sm">
                      <div class="text-caption text-grey-7">{{ $t('complexes.floorsCount') }}: <strong>{{ building.floorsCount }}</strong></div>
                      <div class="text-caption text-grey-7">{{ $t('complexes.unitsCount') }}: <strong>{{ building.unitsCount }}</strong></div>
                      <div class="text-caption text-grey-7" v-if="building.entrance">Entrance: <strong>{{ building.entrance }}</strong></div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';
import { complexesAPI } from '../../api';

export default defineComponent({
  name: 'ViewComplexPage',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const { t } = useI18n();
    const $q = useQuasar();

    const loading = ref(false);
    const complex = ref(null);
    const buildings = ref([]);
    const stats = ref({ buildings: 0, units: 0, residents: 0, openTickets: 0 });
    const complexId = computed(() => route.params.id);

    const fetchComplex = async () => {
      loading.value = true;
      try {
        const response = await complexesAPI.getById(complexId.value);
        complex.value = response.data;
        buildings.value = response.data.buildings || [];
        
        const statsResponse = await complexesAPI.getStats(complexId.value);
        stats.value = statsResponse.data;
      } catch (error) {
        $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' });
        router.back();
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => { fetchComplex(); });

    return { loading, complex, buildings, stats, complexId };
  }
});
</script>

<style lang="scss" scoped>
.info-item { margin-bottom: 16px; .info-label { font-size: 0.875rem; color: #666; margin-bottom: 4px; } .info-value { font-size: 1rem; font-weight: 500; } }
.building-card { border-left: 4px solid $primary; }
</style>
