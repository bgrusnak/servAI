<template>
  <q-page padding>
    <div class="q-pa-md">
      <!-- Header -->
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">{{ $t('nav.managementCompanies') }}</h5>
          <p class="text-grey-7 q-mb-none">{{ $t('managementCompanies.subtitle') }}</p>
        </div>
        <div class="col-auto">
          <q-btn
            color="primary"
            icon="add"
            :label="$t('common.create')"
            @click="$router.push('/management-companies/create')"
            no-caps
            unelevated
          />
        </div>
      </div>

      <!-- Filters -->
      <q-card class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-6">
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
            <div class="col-12 col-md-3">
              <q-select
                v-model="filters.status"
                :options="statusOptions"
                :label="$t('common.status')"
                outlined
                dense
                emit-value
                map-options
                clearable
                @update:model-value="fetchCompanies"
              />
            </div>
            <div class="col-12 col-md-3">
              <q-select
                v-model="filters.country"
                :options="countryOptions"
                :label="$t('managementCompanies.country')"
                outlined
                dense
                clearable
                @update:model-value="fetchCompanies"
              />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Table -->
      <q-card>
        <q-table
          :rows="companies"
          :columns="columns"
          row-key="id"
          :loading="loading"
          :pagination="pagination"
          @request="onRequest"
          flat
          bordered
        >
          <!-- Status badge -->
          <template v-slot:body-cell-status="props">
            <q-td :props="props">
              <q-badge
                :color="props.row.status === 'active' ? 'positive' : 'negative'"
                :label="$t(`common.${props.row.status}`)"
              />
            </q-td>
          </template>

          <!-- Complex count -->
          <template v-slot:body-cell-complexCount="props">
            <q-td :props="props">
              <q-chip color="primary" text-color="white" size="sm">
                {{ props.row.complexCount || 0 }}
              </q-chip>
            </q-td>
          </template>

          <!-- Actions -->
          <template v-slot:body-cell-actions="props">
            <q-td :props="props">
              <q-btn
                flat
                round
                dense
                icon="visibility"
                color="primary"
                @click="viewCompany(props.row.id)"
              >
                <q-tooltip>{{ $t('common.view') }}</q-tooltip>
              </q-btn>
              <q-btn
                flat
                round
                dense
                icon="edit"
                color="secondary"
                @click="editCompany(props.row.id)"
              >
                <q-tooltip>{{ $t('common.edit') }}</q-tooltip>
              </q-btn>
              <q-btn
                flat
                round
                dense
                icon="delete"
                color="negative"
                @click="confirmDelete(props.row)"
              >
                <q-tooltip>{{ $t('common.delete') }}</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </q-card>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';
import { managementCompaniesAPI } from '../../api';

export default defineComponent({
  name: 'ManagementCompaniesListPage',

  setup() {
    const router = useRouter();
    const { t } = useI18n();
    const $q = useQuasar();

    const loading = ref(false);
    const companies = ref([]);
    const filters = ref({
      search: '',
      status: null,
      country: null
    });

    const pagination = ref({
      sortBy: 'name',
      descending: false,
      page: 1,
      rowsPerPage: 10,
      rowsNumber: 0
    });

    const columns = computed(() => [
      {
        name: 'name',
        label: t('common.name'),
        field: 'name',
        align: 'left',
        sortable: true
      },
      {
        name: 'registrationNumber',
        label: t('managementCompanies.registrationNumber'),
        field: 'registrationNumber',
        align: 'left'
      },
      {
        name: 'country',
        label: t('managementCompanies.country'),
        field: 'country',
        align: 'left',
        sortable: true
      },
      {
        name: 'email',
        label: t('common.email'),
        field: 'email',
        align: 'left'
      },
      {
        name: 'phone',
        label: t('common.phone'),
        field: 'phone',
        align: 'left'
      },
      {
        name: 'complexCount',
        label: t('managementCompanies.complexes'),
        field: 'complexCount',
        align: 'center',
        sortable: true
      },
      {
        name: 'status',
        label: t('common.status'),
        field: 'status',
        align: 'center',
        sortable: true
      },
      {
        name: 'actions',
        label: t('common.actions'),
        field: 'actions',
        align: 'center'
      }
    ]);

    const statusOptions = computed(() => [
      { label: t('common.active'), value: 'active' },
      { label: t('common.inactive'), value: 'inactive' }
    ]);

    const countryOptions = ref([
      'Russia', 'Bulgaria', 'Poland', 'Germany', 'France'
    ]);

    const fetchCompanies = async (props = {}) => {
      loading.value = true;

      try {
        const { page, rowsPerPage, sortBy, descending } = props.pagination || pagination.value;
        
        const params = {
          page,
          limit: rowsPerPage,
          sortBy,
          order: descending ? 'desc' : 'asc',
          search: filters.value.search,
          status: filters.value.status,
          country: filters.value.country
        };

        const response = await managementCompaniesAPI.getAll(params);
        
        companies.value = response.data.data || [];
        pagination.value.page = response.data.page || 1;
        pagination.value.rowsPerPage = response.data.limit || 10;
        pagination.value.rowsNumber = response.data.total || 0;
        
        if (props.pagination) {
          pagination.value.sortBy = sortBy;
          pagination.value.descending = descending;
        }
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

    const onRequest = (props) => {
      fetchCompanies(props);
    };

    let searchTimeout;
    const onSearch = () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        pagination.value.page = 1;
        fetchCompanies();
      }, 500);
    };

    const viewCompany = (id) => {
      router.push(`/management-companies/${id}`);
    };

    const editCompany = (id) => {
      router.push(`/management-companies/${id}/edit`);
    };

    const confirmDelete = (company) => {
      $q.dialog({
        title: t('common.confirm'),
        message: t('managementCompanies.deleteConfirm', { name: company.name }),
        cancel: true,
        persistent: true
      }).onOk(async () => {
        await deleteCompany(company.id);
      });
    };

    const deleteCompany = async (id) => {
      try {
        await managementCompaniesAPI.delete(id);
        
        $q.notify({
          message: t('managementCompanies.deleteSuccess'),
          color: 'positive',
          icon: 'check'
        });
        
        await fetchCompanies();
      } catch (error) {
        $q.notify({
          message: error.message || t('common.error'),
          color: 'negative',
          icon: 'error'
        });
      }
    };

    onMounted(() => {
      fetchCompanies();
    });

    return {
      loading,
      companies,
      filters,
      pagination,
      columns,
      statusOptions,
      countryOptions,
      onRequest,
      onSearch,
      viewCompany,
      editCompany,
      confirmDelete
    };
  }
});
</script>
