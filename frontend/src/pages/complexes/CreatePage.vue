<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width: 1200px; margin: 0 auto;">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">{{ $t('complexes.create') }}</h5>
        </div>
        <div class="col-auto">
          <q-btn flat icon="arrow_back" :label="$t('common.back')" @click="$router.back()" no-caps />
        </div>
      </div>

      <q-form @submit="onSubmit" class="q-gutter-md">
        <!-- Basic Info -->
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('complexes.basicInfo') }}</div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <q-input v-model="form.name" :label="$t('common.name') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" />
              </div>
              <div class="col-12 col-md-6" v-if="isSuperAdmin">
                <q-select v-model="form.managementCompanyId" :options="managementCompanies" option-value="id" option-label="name" :label="$t('complexes.managementCompany') + ' *'" outlined emit-value map-options :rules="[val => !!val || $t('validation.required')]" />
              </div>
              <div class="col-12 col-md-6">
                <q-select v-model="form.buildingType" :options="buildingTypeOptions" :label="$t('complexes.buildingType') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" />
              </div>
              <div class="col-12 col-md-6">
                <q-input v-model.number="form.buildingYear" type="number" :label="$t('complexes.buildingYear')" outlined />
              </div>
              <div class="col-12">
                <q-input v-model="form.description" :label="$t('common.description')" outlined type="textarea" rows="3" />
              </div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Address -->
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('complexes.addressInfo') }}</div>
            <div class="row q-col-gutter-md">
              <div class="col-12">
                <q-input v-model="form.address" :label="$t('common.address') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" />
              </div>
              <div class="col-12 col-md-4">
                <q-input v-model="form.city" :label="$t('managementCompanies.city') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" />
              </div>
              <div class="col-12 col-md-4">
                <q-input v-model="form.country" :label="$t('managementCompanies.country') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" />
              </div>
              <div class="col-12 col-md-4">
                <q-input v-model="form.postalCode" :label="$t('managementCompanies.postalCode')" outlined />
              </div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Buildings -->
        <q-card>
          <q-card-section>
            <div class="row items-center q-mb-md">
              <div class="col"><div class="text-h6">{{ $t('complexes.buildingsInfo') }}</div></div>
              <div class="col-auto"><q-btn color="primary" icon="add" label="Add Building" @click="addBuilding" size="sm" no-caps /></div>
            </div>
            <q-list separator>
              <q-item v-for="(building, index) in form.buildings" :key="index">
                <q-item-section>
                  <div class="row q-col-gutter-md">
                    <div class="col-12 col-md-4">
                      <q-input v-model="building.name" label="Building Name *" outlined dense :rules="[val => !!val || 'Required']" />
                    </div>
                    <div class="col-6 col-md-2">
                      <q-input v-model.number="building.floorsCount" type="number" :label="$t('complexes.floorsCount') + ' *'" outlined dense :rules="[val => val > 0 || 'Required']" />
                    </div>
                    <div class="col-6 col-md-2">
                      <q-input v-model.number="building.unitsCount" type="number" :label="$t('complexes.unitsCount') + ' *'" outlined dense :rules="[val => val > 0 || 'Required']" />
                    </div>
                    <div class="col-6 col-md-2">
                      <q-input v-model="building.entrance" label="Entrance" outlined dense />
                    </div>
                    <div class="col-6 col-md-2">
                      <q-btn flat round dense icon="delete" color="negative" @click="removeBuilding(index)" />
                    </div>
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>

        <!-- Contact & Management -->
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">{{ $t('complexes.managementInfo') }}</div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <q-input v-model="form.contactEmail" :label="$t('common.email')" type="email" outlined :rules="[val => !val || /.+@.+\..+/.test(val) || $t('validation.email')]" />
              </div>
              <div class="col-12 col-md-6">
                <q-input v-model="form.contactPhone" :label="$t('common.phone')" outlined />
              </div>
              <div class="col-12 col-md-6">
                <q-input v-model="form.adminName" label="Administrator Name" outlined />
              </div>
              <div class="col-12 col-md-6">
                <q-input v-model="form.adminEmail" label="Administrator Email" type="email" outlined :rules="[val => !val || /.+@.+\..+/.test(val) || $t('validation.email')]" />
              </div>
            </div>
          </q-card-section>
        </q-card>

        <div class="row q-gutter-md justify-end">
          <q-btn :label="$t('common.cancel')" outline color="grey" @click="$router.back()" no-caps />
          <q-btn type="submit" :label="$t('common.create')" color="primary" :loading="loading" no-caps unelevated />
        </div>
      </q-form>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../../stores';
import { complexesAPI, managementCompaniesAPI } from '../../api';

export default defineComponent({
  name: 'CreateComplexPage',
  setup() {
    const router = useRouter();
    const { t } = useI18n();
    const $q = useQuasar();
    const authStore = useAuthStore();

    const loading = ref(false);
    const managementCompanies = ref([]);
    const form = ref({
      name: '',
      managementCompanyId: null,
      buildingType: 'Residential',
      buildingYear: new Date().getFullYear(),
      description: '',
      address: '',
      city: '',
      country: '',
      postalCode: '',
      contactEmail: '',
      contactPhone: '',
      adminName: '',
      adminEmail: '',
      buildings: []
    });

    const isSuperAdmin = computed(() => authStore.isSuperAdmin);
    const buildingTypeOptions = ['Residential', 'Commercial', 'Mixed'];

    const addBuilding = () => {
      form.value.buildings.push({
        name: `Building ${form.value.buildings.length + 1}`,
        floorsCount: 1,
        unitsCount: 1,
        entrance: ''
      });
    };

    const removeBuilding = (index) => {
      form.value.buildings.splice(index, 1);
    };

    const fetchManagementCompanies = async () => {
      if (!isSuperAdmin.value) return;
      try {
        const response = await managementCompaniesAPI.getAll({ limit: 100 });
        managementCompanies.value = response.data.data || [];
      } catch (error) {
        console.error('Failed to fetch companies', error);
      }
    };

    const onSubmit = async () => {
      loading.value = true;
      try {
        await complexesAPI.create(form.value);
        $q.notify({ message: t('complexes.createSuccess'), color: 'positive', icon: 'check' });
        router.push('/complexes');
      } catch (error) {
        $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' });
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => {
      fetchManagementCompanies();
      addBuilding();
    });

    return { loading, form, isSuperAdmin, managementCompanies, buildingTypeOptions, addBuilding, removeBuilding, onSubmit };
  }
});
</script>
