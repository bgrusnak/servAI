<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width: 1200px; margin: 0 auto;">
      <!-- Header -->
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">{{ company?.name }}</h5>
          <q-badge
            :color="company?.status === 'active' ? 'positive' : 'negative'"
            :label="$t(`common.${company?.status}`)"
          />
        </div>
        <div class="col-auto q-gutter-sm">
          <q-btn
            flat
            icon="arrow_back"
            :label="$t('common.back')"
            @click="$router.back()"
            no-caps
          />
          <q-btn
            color="secondary"
            icon="edit"
            :label="$t('common.edit')"
            @click="$router.push(`/management-companies/${companyId}/edit`)"
            no-caps
            unelevated
          />
        </div>
      </div>

      <q-inner-loading :showing="loading" />

      <div v-if="!loading && company">
        <!-- Stats Cards -->
        <div class="row q-col-gutter-md q-mb-lg">
          <div class="col-12 col-sm-6 col-md-3">
            <q-card class="stat-card">
              <q-card-section>
                <div class="stat-value text-primary">{{ stats.complexes }}</div>
                <div class="stat-label">{{ $t('managementCompanies.complexes') }}</div>
              </q-card-section>
            </q-card>
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-card class="stat-card">
              <q-card-section>
                <div class="stat-value text-secondary">{{ stats.units }}</div>
                <div class="stat-label">{{ $t('dashboard.stats.totalUnits') }}</div>
              </q-card-section>
            </q-card>
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-card class="stat-card">
              <q-card-section>
                <div class="stat-value text-positive">{{ stats.residents }}</div>
                <div class="stat-label">{{ $t('dashboard.stats.activeResidents') }}</div>
              </q-card-section>
            </q-card>
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-card class="stat-card">
              <q-card-section>
                <div class="stat-value text-info">{{ formatCurrency(stats.revenue) }}</div>
                <div class="stat-label">{{ $t('dashboard.stats.monthlyRevenue') }}</div>
              </q-card-section>
            </q-card>
          </div>
        </div>

        <!-- Main Info -->
        <q-card class="q-mb-md">
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('managementCompanies.basicInfo') }}</div>
            
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.registrationNumber') }}</div>
                  <div class="info-value">{{ company.registrationNumber }}</div>
                </div>
              </div>
              
              <div class="col-12 col-md-6">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.country') }}</div>
                  <div class="info-value">{{ company.country }}</div>
                </div>
              </div>

              <div class="col-12">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.legalAddress') }}</div>
                  <div class="info-value">{{ company.legalAddress }}</div>
                </div>
              </div>

              <div class="col-12 col-md-6">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.city') }}</div>
                  <div class="info-value">{{ company.city }}</div>
                </div>
              </div>

              <div class="col-12 col-md-6">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.postalCode') }}</div>
                  <div class="info-value">{{ company.postalCode || '-' }}</div>
                </div>
              </div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Contact Info -->
        <q-card class="q-mb-md">
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('managementCompanies.contactInfo') }}</div>
            
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <div class="info-item">
                  <div class="info-label">{{ $t('common.email') }}</div>
                  <div class="info-value">
                    <a :href="`mailto:${company.email}`">{{ company.email }}</a>
                  </div>
                </div>
              </div>

              <div class="col-12 col-md-6">
                <div class="info-item">
                  <div class="info-label">{{ $t('common.phone') }}</div>
                  <div class="info-value">
                    <a :href="`tel:${company.phone}`">{{ company.phone }}</a>
                  </div>
                </div>
              </div>

              <div class="col-12 col-md-6">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.directorName') }}</div>
                  <div class="info-value">{{ company.directorName }}</div>
                </div>
              </div>

              <div class="col-12 col-md-6">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.directorEmail') }}</div>
                  <div class="info-value">
                    <a :href="`mailto:${company.directorEmail}`">{{ company.directorEmail }}</a>
                  </div>
                </div>
              </div>

              <div class="col-12 col-md-6" v-if="company.accountantName">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.accountantName') }}</div>
                  <div class="info-value">{{ company.accountantName }}</div>
                </div>
              </div>

              <div class="col-12 col-md-6" v-if="company.accountantEmail">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.accountantEmail') }}</div>
                  <div class="info-value">
                    <a :href="`mailto:${company.accountantEmail}`">{{ company.accountantEmail }}</a>
                  </div>
                </div>
              </div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Banking Info -->
        <q-card class="q-mb-md">
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('managementCompanies.bankingInfo') }}</div>
            
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.currency') }}</div>
                  <div class="info-value">{{ company.currency }}</div>
                </div>
              </div>

              <div class="col-12 col-md-6" v-if="company.bankName">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.bankName') }}</div>
                  <div class="info-value">{{ company.bankName }}</div>
                </div>
              </div>

              <div class="col-12 col-md-6" v-if="company.bankAccount">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.bankAccount') }}</div>
                  <div class="info-value">{{ company.bankAccount }}</div>
                </div>
              </div>

              <div class="col-12 col-md-6" v-if="company.swift">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.swift') }}</div>
                  <div class="info-value">{{ company.swift }}</div>
                </div>
              </div>

              <div class="col-12 col-md-6" v-if="company.iban">
                <div class="info-item">
                  <div class="info-label">{{ $t('managementCompanies.iban') }}</div>
                  <div class="info-value">{{ company.iban }}</div>
                </div>
              </div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Complexes List -->
        <q-card>
          <q-card-section>
            <div class="row items-center q-mb-md">
              <div class="col">
                <div class="text-h6">{{ $t('nav.complexes') }}</div>
              </div>
              <div class="col-auto">
                <q-btn
                  color="primary"
                  icon="add"
                  :label="$t('complexes.add')"
                  @click="$router.push('/complexes/create')"
                  no-caps
                  unelevated
                  size="sm"
                />
              </div>
            </div>
            
            <q-list separator>
              <q-item v-if="!complexes.length">
                <q-item-section>
                  <q-item-label class="text-grey-7 text-center">{{ $t('common.noData') }}</q-item-label>
                </q-item-section>
              </q-item>
              <q-item
                v-for="complex in complexes"
                :key="complex.id"
                clickable
                @click="$router.push(`/complexes/${complex.id}`)"
              >
                <q-item-section avatar>
                  <q-icon name="apartment" color="primary" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ complex.name }}</q-item-label>
                  <q-item-label caption>{{ complex.address }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge color="primary">{{ complex.unitsCount }} {{ $t('nav.units') }}</q-badge>
                </q-item-section>
              </q-item>
            </q-list>
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
import { managementCompaniesAPI } from '../../api';

export default defineComponent({
  name: 'ViewManagementCompanyPage',

  setup() {
    const route = useRoute();
    const router = useRouter();
    const { t } = useI18n();
    const $q = useQuasar();

    const loading = ref(false);
    const company = ref(null);
    const complexes = ref([]);
    const stats = ref({
      complexes: 0,
      units: 0,
      residents: 0,
      revenue: 0
    });

    const companyId = computed(() => route.params.id);

    const formatCurrency = (value) => {
      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: company.value?.currency || 'EUR'
      }).format(value);
    };

    const fetchCompany = async () => {
      loading.value = true;

      try {
        const response = await managementCompaniesAPI.getById(companyId.value);
        company.value = response.data;

        // Fetch stats
        const statsResponse = await managementCompaniesAPI.getStats(companyId.value);
        stats.value = statsResponse.data;

        // Mock complexes for now
        complexes.value = [];
      } catch (error) {
        $q.notify({
          message: error.message || t('common.error'),
          color: 'negative',
          icon: 'error'
        });
        router.back();
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => {
      fetchCompany();
    });

    return {
      loading,
      company,
      complexes,
      stats,
      companyId,
      formatCurrency
    };
  }
});
</script>

<style lang="scss" scoped>
.info-item {
  margin-bottom: 16px;
  
  .info-label {
    font-size: 0.875rem;
    color: #666;
    margin-bottom: 4px;
  }
  
  .info-value {
    font-size: 1rem;
    font-weight: 500;
    
    a {
      color: $primary;
      text-decoration: none;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
}
</style>
