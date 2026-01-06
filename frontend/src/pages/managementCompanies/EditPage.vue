<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width: 1200px; margin: 0 auto;">
      <!-- Header -->
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">{{ $t('managementCompanies.edit') }}</h5>
        </div>
        <div class="col-auto">
          <q-btn
            flat
            icon="arrow_back"
            :label="$t('common.back')"
            @click="$router.back()"
            no-caps
          />
        </div>
      </div>

      <q-inner-loading :showing="loadingData" />

      <!-- Form -->
      <q-form v-if="!loadingData" @submit="onSubmit" class="q-gutter-md">
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('managementCompanies.basicInfo') }}</div>
            
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.name"
                  :label="$t('common.name') + ' *'"
                  outlined
                  :rules="[val => !!val || $t('validation.required')]"
                />
              </div>
              
              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.registrationNumber"
                  :label="$t('managementCompanies.registrationNumber') + ' *'"
                  outlined
                  :rules="[val => !!val || $t('validation.required')]"
                />
              </div>

              <div class="col-12">
                <q-input
                  v-model="form.legalAddress"
                  :label="$t('managementCompanies.legalAddress') + ' *'"
                  outlined
                  :rules="[val => !!val || $t('validation.required')]"
                />
              </div>

              <div class="col-12 col-md-4">
                <q-select
                  v-model="form.country"
                  :options="countryOptions"
                  :label="$t('managementCompanies.country') + ' *'"
                  outlined
                  :rules="[val => !!val || $t('validation.required')]"
                />
              </div>

              <div class="col-12 col-md-4">
                <q-input
                  v-model="form.city"
                  :label="$t('managementCompanies.city') + ' *'"
                  outlined
                  :rules="[val => !!val || $t('validation.required')]"
                />
              </div>

              <div class="col-12 col-md-4">
                <q-input
                  v-model="form.postalCode"
                  :label="$t('managementCompanies.postalCode')"
                  outlined
                />
              </div>

              <div class="col-12 col-md-6">
                <q-select
                  v-model="form.status"
                  :options="statusOptions"
                  :label="$t('common.status') + ' *'"
                  outlined
                  emit-value
                  map-options
                  :rules="[val => !!val || $t('validation.required')]"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>

        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('managementCompanies.contactInfo') }}</div>
            
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.email"
                  :label="$t('common.email') + ' *'"
                  type="email"
                  outlined
                  :rules="[
                    val => !!val || $t('validation.required'),
                    val => /.+@.+\..+/.test(val) || $t('validation.email')
                  ]"
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.phone"
                  :label="$t('common.phone') + ' *'"
                  outlined
                  mask="+# (###) ###-####"
                  :rules="[val => !!val || $t('validation.required')]"
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.directorName"
                  :label="$t('managementCompanies.directorName') + ' *'"
                  outlined
                  :rules="[val => !!val || $t('validation.required')]"
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.directorEmail"
                  :label="$t('managementCompanies.directorEmail') + ' *'"
                  type="email"
                  outlined
                  :rules="[
                    val => !!val || $t('validation.required'),
                    val => /.+@.+\..+/.test(val) || $t('validation.email')
                  ]"
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.accountantName"
                  :label="$t('managementCompanies.accountantName')"
                  outlined
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.accountantEmail"
                  :label="$t('managementCompanies.accountantEmail')"
                  type="email"
                  outlined
                  :rules="[
                    val => !val || /.+@.+\..+/.test(val) || $t('validation.email')
                  ]"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>

        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('managementCompanies.bankingInfo') }}</div>
            
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.bankName"
                  :label="$t('managementCompanies.bankName')"
                  outlined
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.bankAccount"
                  :label="$t('managementCompanies.bankAccount')"
                  outlined
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.swift"
                  :label="$t('managementCompanies.swift')"
                  outlined
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.iban"
                  :label="$t('managementCompanies.iban')"
                  outlined
                />
              </div>

              <div class="col-12 col-md-6">
                <q-select
                  v-model="form.currency"
                  :options="currencyOptions"
                  :label="$t('managementCompanies.currency') + ' *'"
                  outlined
                  :rules="[val => !!val || $t('validation.required')]"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Actions -->
        <div class="row q-gutter-md justify-end">
          <q-btn
            :label="$t('common.cancel')"
            outline
            color="grey"
            @click="$router.back()"
            no-caps
          />
          <q-btn
            type="submit"
            :label="$t('common.save')"
            color="primary"
            :loading="loading"
            no-caps
            unelevated
          />
        </div>
      </q-form>
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
  name: 'EditManagementCompanyPage',

  setup() {
    const route = useRoute();
    const router = useRouter();
    const { t } = useI18n();
    const $q = useQuasar();

    const loading = ref(false);
    const loadingData = ref(false);
    const form = ref({});

    const companyId = computed(() => route.params.id);

    const countryOptions = [
      'Russia', 'Bulgaria', 'Poland', 'Germany', 'France', 'Spain', 'Italy'
    ];

    const currencyOptions = [
      'EUR', 'USD', 'RUB', 'BGN', 'PLN'
    ];

    const statusOptions = computed(() => [
      { label: t('common.active'), value: 'active' },
      { label: t('common.inactive'), value: 'inactive' }
    ]);

    const fetchCompany = async () => {
      loadingData.value = true;

      try {
        const response = await managementCompaniesAPI.getById(companyId.value);
        form.value = { ...response.data };
      } catch (error) {
        $q.notify({
          message: error.message || t('common.error'),
          color: 'negative',
          icon: 'error'
        });
        router.back();
      } finally {
        loadingData.value = false;
      }
    };

    const onSubmit = async () => {
      loading.value = true;

      try {
        await managementCompaniesAPI.update(companyId.value, form.value);
        
        $q.notify({
          message: t('managementCompanies.updateSuccess'),
          color: 'positive',
          icon: 'check'
        });
        
        router.push(`/management-companies/${companyId.value}`);
      } catch (error) {
        $q.notify({
          message: error.message || t('common.error'),
          color: 'negative',
          icon: 'error'
        });
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => {
      fetchCompany();
    });

    return {
      loading,
      loadingData,
      form,
      countryOptions,
      currencyOptions,
      statusOptions,
      onSubmit
    };
  }
});
</script>
