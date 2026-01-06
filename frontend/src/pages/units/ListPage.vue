<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col"><h5 class="q-my-none">{{ $t('nav.units') }}</h5><p class="text-grey-7 q-mb-none">{{ $t('units.subtitle') }}</p></div>
        <div class="col-auto"><q-btn color="primary" icon="add" :label="$t('common.create')" @click="showCreateDialog = true" no-caps unelevated /></div>
      </div>

      <q-card class="q-mb-md"><q-card-section><div class="row q-col-gutter-md"><div class="col-12 col-md-4"><q-input v-model="filters.search" :label="$t('common.search')" outlined dense clearable @update:model-value="onSearch"><template v-slot:prepend><q-icon name="search" /></template></q-input></div><div class="col-12 col-md-3"><q-select v-model="filters.complexId" :options="complexes" option-value="id" option-label="name" :label="$t('nav.complexes')" outlined dense clearable emit-value map-options @update:model-value="fetchUnits" /></div><div class="col-12 col-md-2"><q-select v-model="filters.type" :options="['Apartment', 'Office', 'Parking', 'Storage']" :label="$t('units.type')" outlined dense clearable @update:model-value="fetchUnits" /></div><div class="col-12 col-md-3"><q-select v-model="filters.status" :options="statusOptions" :label="$t('common.status')" outlined dense emit-value map-options clearable @update:model-value="fetchUnits" /></div></div></q-card-section></q-card>

      <q-card><q-table :rows="units" :columns="columns" row-key="id" :loading="loading" :pagination="pagination" @request="onRequest" flat bordered><template v-slot:body-cell-status="props"><q-td :props="props"><q-badge :color="props.row.status === 'occupied' ? 'positive' : 'grey'" :label="props.row.status" /></q-td></template><template v-slot:body-cell-actions="props"><q-td :props="props"><q-btn flat round dense icon="visibility" color="primary" @click="viewUnit(props.row.id)" /><q-btn flat round dense icon="edit" color="secondary" @click="editUnit(props.row)" /></q-td></template></q-table></q-card>

      <q-dialog v-model="showCreateDialog" persistent><q-card style="min-width: 500px"><q-card-section><div class="text-h6">{{ $t('common.create') }} {{ $t('nav.units') }}</div></q-card-section><q-card-section><q-form @submit="createUnit" class="q-gutter-md"><q-select v-model="newUnit.complexId" :options="complexes" option-value="id" option-label="name" :label="$t('nav.complexes') + ' *'" outlined emit-value map-options :rules="[val => !!val || $t('validation.required')]" /><q-input v-model="newUnit.unitNumber" :label="$t('units.unitNumber') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" /><q-select v-model="newUnit.type" :options="['Apartment', 'Office', 'Parking', 'Storage']" :label="$t('units.type') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" /><q-input v-model.number="newUnit.area" type="number" :label="$t('units.area')" outlined suffix="m²" /><q-input v-model.number="newUnit.floor" type="number" :label="$t('units.floor')" outlined /><div class="row q-gutter-md justify-end"><q-btn flat :label="$t('common.cancel')" color="grey" v-close-popup /><q-btn type="submit" :label="$t('common.create')" color="primary" :loading="creating" /></div></q-form></q-card-section></q-card></q-dialog>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';
import { unitsAPI, complexesAPI } from '../../api';

export default defineComponent({
  name: 'UnitsListPage',
  setup() {
    const router = useRouter(); const { t } = useI18n(); const $q = useQuasar();
    const loading = ref(false), creating = ref(false), units = ref([]), complexes = ref([]), showCreateDialog = ref(false);
    const filters = ref({ search: '', complexId: null, type: null, status: null }), pagination = ref({ sortBy: 'unitNumber', descending: false, page: 1, rowsPerPage: 10, rowsNumber: 0 });
    const newUnit = ref({ complexId: null, unitNumber: '', type: 'Apartment', area: null, floor: null });
    const columns = computed(() => [{ name: 'unitNumber', label: t('units.unitNumber'), field: 'unitNumber', align: 'left', sortable: true }, { name: 'complex', label: t('nav.complexes'), field: row => row.complex?.name, align: 'left' }, { name: 'type', label: t('units.type'), field: 'type', align: 'left', sortable: true }, { name: 'area', label: t('units.area'), field: 'area', align: 'right', format: val => val ? `${val} m²` : '-' }, { name: 'floor', label: t('units.floor'), field: 'floor', align: 'center' }, { name: 'status', label: t('common.status'), field: 'status', align: 'center', sortable: true }, { name: 'actions', label: t('common.actions'), field: 'actions', align: 'center' }]);
    const statusOptions = computed(() => [{ label: 'Occupied', value: 'occupied' }, { label: 'Vacant', value: 'vacant' }]);
    const fetchUnits = async (props = {}) => { loading.value = true; try { const { page, rowsPerPage, sortBy, descending } = props.pagination || pagination.value; const params = { page, limit: rowsPerPage, sortBy, order: descending ? 'desc' : 'asc', ...filters.value }; const response = await unitsAPI.getAll(params); units.value = response.data.data || []; pagination.value.page = response.data.page || 1; pagination.value.rowsPerPage = response.data.limit || 10; pagination.value.rowsNumber = response.data.total || 0; if (props.pagination) { pagination.value.sortBy = sortBy; pagination.value.descending = descending; } } catch (error) { $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' }); } finally { loading.value = false; } };
    const fetchComplexes = async () => { try { const response = await complexesAPI.getAll({ limit: 100 }); complexes.value = response.data.data || []; } catch (error) { console.error('Failed', error); } };
    let searchTimeout; const onSearch = () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { pagination.value.page = 1; fetchUnits(); }, 500); };
    const onRequest = (props) => { fetchUnits(props); }; const viewUnit = (id) => { router.push(`/units/${id}`); }; const editUnit = (unit) => { console.log('Edit', unit); };
    const createUnit = async () => { creating.value = true; try { await unitsAPI.create(newUnit.value); $q.notify({ message: t('units.createSuccess'), color: 'positive', icon: 'check' }); showCreateDialog.value = false; newUnit.value = { complexId: null, unitNumber: '', type: 'Apartment', area: null, floor: null }; await fetchUnits(); } catch (error) { $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' }); } finally { creating.value = false; } };
    onMounted(() => { fetchUnits(); fetchComplexes(); });
    return { loading, creating, units, complexes, filters, pagination, columns, statusOptions, showCreateDialog, newUnit, onSearch, onRequest, viewUnit, editUnit, createUnit };
  }
});
</script>
