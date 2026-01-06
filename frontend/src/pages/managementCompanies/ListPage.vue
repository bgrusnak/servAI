<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">{{ $t('nav.managementCompanies') }}</h5>
        </div>
        <div class="col-auto">
          <q-btn
            color="primary"
            icon="add"
            :label="$t('common.create')"
            @click="$router.push('/management-companies/create')"
            no-caps
          />
        </div>
      </div>

      <q-card>
        <q-card-section>
          <q-input
            v-model="search"
            :label="$t('common.search')"
            outlined
            dense
            clearable
          >
            <template v-slot:prepend>
              <q-icon name="search" />
            </template>
          </q-input>
        </q-card-section>

        <q-table
          :rows="companies"
          :columns="columns"
          row-key="id"
          :loading="loading"
          flat
          bordered
        >
          <template v-slot:body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat round dense icon="visibility" color="primary" @click="viewCompany(props.row.id)" />
              <q-btn flat round dense icon="edit" color="secondary" @click="editCompany(props.row.id)" />
            </q-td>
          </template>
        </q-table>
      </q-card>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

export default defineComponent({
  name: 'ManagementCompaniesListPage',

  setup() {
    const router = useRouter();
    const { t } = useI18n();
    const search = ref('');
    const loading = ref(false);
    const companies = ref([]);

    const columns = [
      { name: 'name', label: t('common.name'), field: 'name', align: 'left', sortable: true },
      { name: 'email', label: t('common.email'), field: 'email', align: 'left' },
      { name: 'phone', label: t('common.phone'), field: 'phone', align: 'left' },
      { name: 'complexCount', label: 'Complexes', field: 'complexCount', align: 'center' },
      { name: 'status', label: t('common.status'), field: 'status', align: 'center' },
      { name: 'actions', label: t('common.actions'), field: 'actions', align: 'center' }
    ];

    const fetchCompanies = async () => {
      loading.value = true;
      // TODO: Implement API call
      await new Promise(resolve => setTimeout(resolve, 500));
      companies.value = [];
      loading.value = false;
    };

    const viewCompany = (id) => {
      router.push(`/management-companies/${id}`);
    };

    const editCompany = (id) => {
      router.push(`/management-companies/${id}/edit`);
    };

    onMounted(() => {
      fetchCompanies();
    });

    return {
      search,
      loading,
      companies,
      columns,
      viewCompany,
      editCompany
    };
  }
});
</script>
