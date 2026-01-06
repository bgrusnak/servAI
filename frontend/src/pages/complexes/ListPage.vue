<template>
  <q-page padding>
    <div class="q-pa-md">
      <!-- Header -->
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">{{ $t('nav.complexes') }}</h5>
          <p class="text-grey-7 q-mb-none">{{ $t('complexes.subtitle') }}</p>
        </div>
        <div class="col-auto q-gutter-sm">
          <q-btn
            color="secondary"
            icon="upload_file"
            :label="$t('common.import')"
            @click="showImportDialog = true"
            outline
            no-caps
          />
          <q-btn
            color="primary"
            icon="add"
            :label="$t('common.create')"
            @click="$router.push('/complexes/create')"
            no-caps
            unelevated
          />
        </div>
      </div>

      <!-- Filters -->
      <q-card class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-4">
              <q-input
                v-model="filters.search"
                :label="$t('common.search')"
                outlined
                dense
                clearable
                @update:model-value="onSearch"
              >
                <template v-slot:prepend>
                  <q-icon name="search" />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-md-3" v-if="isSuperAdmin">
              <q-select
                v-model="filters.managementCompanyId"
                :options="managementCompanies"
                option-value="id"
                option-label="name"
                :label="$t('complexes.managementCompany')"
                outlined
                dense
                clearable
                emit-value
                map-options
                @update:model-value="fetchComplexes"
              />
            </div>
            <div class="col-12 col-md-3">
              <q-select
                v-model="filters.buildingType"
                :options="buildingTypeOptions"
                :label="$t('complexes.buildingType')"
                outlined
                dense
                clearable
                @update:model-value="fetchComplexes"
              />
            </div>
            <div class="col-12 col-md-2">
              <q-select
                v-model="filters.status"
                :options="statusOptions"
                :label="$t('common.status')"
                outlined
                dense
                emit-value
                map-options
                clearable
                @update:model-value="fetchComplexes"
              />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Grid View -->
      <div class="row q-col-gutter-md">
        <div
          v-for="complex in complexes"
          :key="complex.id"
          class="col-12 col-sm-6 col-md-4 col-lg-3"
        >
          <q-card class="complex-card cursor-pointer" @click="viewComplex(complex.id)">
            <q-img
              :src="complex.imageUrl || '/placeholder-building.jpg'"
              ratio="16/9"
              class="complex-image"
            >
              <div class="absolute-top-right q-pa-sm">
                <q-badge
                  :color="complex.status === 'active' ? 'positive' : 'negative'"
                  :label="$t(`common.${complex.status}`)"
                />
              </div>
            </q-img>
            
            <q-card-section>
              <div class="text-h6 ellipsis">{{ complex.name }}</div>
              <div class="text-caption text-grey-7 ellipsis">{{ complex.address }}</div>
            </q-card-section>

            <q-separator />

            <q-card-section horizontal>
              <q-card-section class="col text-center">
                <div class="text-caption text-grey-7">{{ $t('complexes.floorsCount') }}</div>
                <div class="text-h6">{{ complex.floorsCount || 0 }}</div>
              </q-card-section>
              
              <q-separator vertical />
              
              <q-card-section class="col text-center">
                <div class="text-caption text-grey-7">{{ $t('complexes.unitsCount') }}</div>
                <div class="text-h6">{{ complex.unitsCount || 0 }}</div>
              </q-card-section>
            </q-card-section>

            <q-separator />

            <q-card-actions align="right">
              <q-btn flat round dense icon="edit" color="secondary" @click.stop="editComplex(complex.id)" />
              <q-btn flat round dense icon="delete" color="negative" @click.stop="confirmDelete(complex)" />
            </q-card-actions>
          </q-card>
        </div>
      </div>

      <!-- Empty State -->
      <q-card v-if="!loading && !complexes.length" class="q-pa-lg text-center">
        <q-icon name="apartment" size="80px" color="grey-5" />
        <div class="text-h6 q-mt-md text-grey-7">{{ $t('common.noData') }}</div>
      </q-card>

      <!-- Import Dialog -->
      <q-dialog v-model="showImportDialog">
        <q-card style="min-width: 400px">
          <q-card-section>
            <div class="text-h6">{{ $t('common.import') }} Excel</div>
          </q-card-section>

          <q-card-section>
            <q-file
              v-model="importFile"
              :label="$t('common.selectFile')"
              outlined
              accept=".xlsx,.xls"
            >
              <template v-slot:prepend>
                <q-icon name="upload_file" />
              </template>
            </q-file>
          </q-card-section>

          <q-card-actions align="right">
            <q-btn flat :label="$t('common.cancel')" color="grey" v-close-popup />
            <q-btn
              :label="$t('common.import')"
              color="primary"
              :loading="importing"
              @click="importExcel"
              :disable="!importFile"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../../stores';
import { complexesAPI, managementCompaniesAPI } from '../../api';

export default defineComponent({
  name: 'ComplexesListPage',

  setup() {
    const router = useRouter();
    const { t } = useI18n();
    const $q = useQuasar();
    const authStore = useAuthStore();

    const loading = ref(false);
    const importing = ref(false);
    const complexes = ref([]);
    const managementCompanies = ref([]);
    const showImportDialog = ref(false);
    const importFile = ref(null);
    
    const filters = ref({
      search: '',
      managementCompanyId: null,
      buildingType: null,
      status: null
    });

    const isSuperAdmin = computed(() => authStore.isSuperAdmin);

    const statusOptions = computed(() => [
      { label: t('common.active'), value: 'active' },
      { label: t('common.inactive'), value: 'inactive' }
    ]);

    const buildingTypeOptions = ref([
      'Residential', 'Commercial', 'Mixed'
    ]);

    const fetchComplexes = async () => {
      loading.value = true;

      try {
        const params = {
          search: filters.value.search,
          managementCompanyId: filters.value.managementCompanyId,
          buildingType: filters.value.buildingType,
          status: filters.value.status
        };

        const response = await complexesAPI.getAll(params);
        complexes.value = response.data.data || [];
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

    const fetchManagementCompanies = async () => {
      if (!isSuperAdmin.value) return;
      
      try {
        const response = await managementCompaniesAPI.getAll({ limit: 100 });
        managementCompanies.value = response.data.data || [];
      } catch (error) {
        console.error('Failed to fetch management companies', error);
      }
    };

    let searchTimeout;
    const onSearch = () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        fetchComplexes();
      }, 500);
    };

    const viewComplex = (id) => {
      router.push(`/complexes/${id}`);
    };

    const editComplex = (id) => {
      router.push(`/complexes/${id}/edit`);
    };

    const confirmDelete = (complex) => {
      $q.dialog({
        title: t('common.confirm'),
        message: t('complexes.deleteConfirm', { name: complex.name }),
        cancel: true,
        persistent: true
      }).onOk(async () => {
        await deleteComplex(complex.id);
      });
    };

    const deleteComplex = async (id) => {
      try {
        await complexesAPI.delete(id);
        
        $q.notify({
          message: t('complexes.deleteSuccess'),
          color: 'positive',
          icon: 'check'
        });
        
        await fetchComplexes();
      } catch (error) {
        $q.notify({
          message: error.message || t('common.error'),
          color: 'negative',
          icon: 'error'
        });
      }
    };

    const importExcel = async () => {
      importing.value = true;

      try {
        const formData = new FormData();
        formData.append('file', importFile.value);

        await complexesAPI.importExcel(formData);
        
        $q.notify({
          message: t('common.success'),
          color: 'positive',
          icon: 'check'
        });
        
        showImportDialog.value = false;
        importFile.value = null;
        await fetchComplexes();
      } catch (error) {
        $q.notify({
          message: error.message || t('common.error'),
          color: 'negative',
          icon: 'error'
        });
      } finally {
        importing.value = false;
      }
    };

    onMounted(() => {
      fetchComplexes();
      fetchManagementCompanies();
    });

    return {
      loading,
      importing,
      complexes,
      managementCompanies,
      filters,
      isSuperAdmin,
      statusOptions,
      buildingTypeOptions,
      showImportDialog,
      importFile,
      onSearch,
      viewComplex,
      editComplex,
      confirmDelete,
      importExcel
    };
  }
});
</script>

<style lang="scss" scoped>
.complex-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  }
}

.complex-image {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
</style>
