<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width: 1200px; margin: 0 auto;">
      <div class="row items-center q-mb-md">
        <div class="col"><h5 class="q-my-none">{{ $t('complexes.edit') }}</h5></div>
        <div class="col-auto"><q-btn flat icon="arrow_back" :label="$t('common.back')" @click="$router.back()" no-caps /></div>
      </div>

      <q-inner-loading :showing="loadingData" />

      <q-form v-if="!loadingData" @submit="onSubmit" class="q-gutter-md">
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('complexes.basicInfo') }}</div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6"><q-input v-model="form.name" :label="$t('common.name') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" /></div>
              <div class="col-12 col-md-6"><q-select v-model="form.buildingType" :options="buildingTypeOptions" :label="$t('complexes.buildingType') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" /></div>
              <div class="col-12 col-md-6"><q-input v-model.number="form.buildingYear" type="number" :label="$t('complexes.buildingYear')" outlined /></div>
              <div class="col-12 col-md-6"><q-select v-model="form.status" :options="statusOptions" :label="$t('common.status') + ' *'" outlined emit-value map-options :rules="[val => !!val || $t('validation.required')]" /></div>
              <div class="col-12"><q-input v-model="form.description" :label="$t('common.description')" outlined type="textarea" rows="3" /></div>
            </div>
          </q-card-section>
        </q-card>

        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('complexes.addressInfo') }}</div>
            <div class="row q-col-gutter-md">
              <div class="col-12"><q-input v-model="form.address" :label="$t('common.address') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" /></div>
              <div class="col-12 col-md-4"><q-input v-model="form.city" :label="$t('managementCompanies.city') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" /></div>
              <div class="col-12 col-md-4"><q-input v-model="form.country" :label="$t('managementCompanies.country') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" /></div>
              <div class="col-12 col-md-4"><q-input v-model="form.postalCode" :label="$t('managementCompanies.postalCode')" outlined /></div>
            </div>
          </q-card-section>
        </q-card>

        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('complexes.managementInfo') }}</div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6"><q-input v-model="form.contactEmail" :label="$t('common.email')" type="email" outlined :rules="[val => !val || /.+@.+\..+/.test(val) || $t('validation.email')]" /></div>
              <div class="col-12 col-md-6"><q-input v-model="form.contactPhone" :label="$t('common.phone')" outlined /></div>
              <div class="col-12 col-md-6"><q-input v-model="form.adminName" label="Administrator Name" outlined /></div>
              <div class="col-12 col-md-6"><q-input v-model="form.adminEmail" label="Administrator Email" type="email" outlined :rules="[val => !val || /.+@.+\..+/.test(val) || $t('validation.email')]" /></div>
            </div>
          </q-card-section>
        </q-card>

        <div class="row q-gutter-md justify-end">
          <q-btn :label="$t('common.cancel')" outline color="grey" @click="$router.back()" no-caps />
          <q-btn type="submit" :label="$t('common.save')" color="primary" :loading="loading" no-caps unelevated />
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
import { complexesAPI } from '../../api';

export default defineComponent({
  name: 'EditComplexPage',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const { t } = useI18n();
    const $q = useQuasar();

    const loading = ref(false);
    const loadingData = ref(false);
    const form = ref({});
    const complexId = computed(() => route.params.id);
    const buildingTypeOptions = ['Residential', 'Commercial', 'Mixed'];
    const statusOptions = computed(() => [{ label: t('common.active'), value: 'active' }, { label: t('common.inactive'), value: 'inactive' }]);

    const fetchComplex = async () => {
      loadingData.value = true;
      try {
        const response = await complexesAPI.getById(complexId.value);
        form.value = { ...response.data };
      } catch (error) {
        $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' });
        router.back();
      } finally {
        loadingData.value = false;
      }
    };

    const onSubmit = async () => {
      loading.value = true;
      try {
        await complexesAPI.update(complexId.value, form.value);
        $q.notify({ message: t('complexes.updateSuccess'), color: 'positive', icon: 'check' });
        router.push(`/complexes/${complexId.value}`);
      } catch (error) {
        $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' });
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => { fetchComplex(); });

    return { loading, loadingData, form, buildingTypeOptions, statusOptions, onSubmit };
  }
});
</script>
