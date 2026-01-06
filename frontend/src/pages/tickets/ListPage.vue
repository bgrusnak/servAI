<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col"><h5 class="q-my-none">{{ $t('nav.tickets') }}</h5></div>
        <div class="col-auto q-gutter-sm">
          <q-btn-toggle v-model="viewMode" :options="[{label: 'List', value: 'list', icon: 'list'}, {label: 'Kanban', value: 'kanban', icon: 'view_kanban'}]" />
          <q-btn color="primary" icon="add" :label="$t('tickets.create')" @click="showCreateDialog = true" no-caps unelevated />
        </div>
      </div>

      <!-- Filters -->
      <q-card class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-3"><q-input v-model="filters.search" :label="$t('common.search')" outlined dense clearable @update:model-value="onSearch"><template v-slot:prepend><q-icon name="search" /></template></q-input></div>
            <div class="col-12 col-md-2"><q-select v-model="filters.status" :options="statusOptions" :label="$t('common.status')" outlined dense clearable emit-value map-options @update:model-value="fetchTickets" /></div>
            <div class="col-12 col-md-2"><q-select v-model="filters.priority" :options="priorityOptions" :label="$t('tickets.priority')" outlined dense clearable emit-value map-options @update:model-value="fetchTickets" /></div>
            <div class="col-12 col-md-2"><q-select v-model="filters.category" :options="categoryOptions" :label="$t('tickets.category')" outlined dense clearable @update:model-value="fetchTickets" /></div>
            <div class="col-12 col-md-3"><q-select v-model="filters.complexId" :options="complexes" option-value="id" option-label="name" :label="$t('nav.complexes')" outlined dense clearable emit-value map-options @update:model-value="fetchTickets" /></div>
          </div>
        </q-card-section>
      </q-card>

      <!-- List View -->
      <q-card v-if="viewMode === 'list'">
        <q-table :rows="tickets" :columns="columns" row-key="id" :loading="loading" :pagination="pagination" @request="onRequest" flat bordered>
          <template v-slot:body-cell-status="props">
            <q-td :props="props"><q-badge :color="getStatusColor(props.row.status)" :label="$t(`tickets.statuses.${props.row.status}`)" /></q-td>
          </template>
          <template v-slot:body-cell-priority="props">
            <q-td :props="props"><q-badge :color="getPriorityColor(props.row.priority)" :label="$t(`tickets.priorities.${props.row.priority}`)" /></q-td>
          </template>
          <template v-slot:body-cell-actions="props">
            <q-td :props="props"><q-btn flat round dense icon="visibility" color="primary" @click="viewTicket(props.row.id)" /></q-td>
          </template>
        </q-table>
      </q-card>

      <!-- Kanban View -->
      <div v-else class="row q-col-gutter-md">
        <div v-for="status in kanbanStatuses" :key="status" class="col-12 col-md-3">
          <q-card class="kanban-column">
            <q-card-section class="bg-grey-2">
              <div class="text-h6">{{ $t(`tickets.statuses.${status}`) }}</div>
              <div class="text-caption">{{ getTicketsByStatus(status).length }} tickets</div>
            </q-card-section>
            <q-separator />
            <q-card-section class="kanban-cards">
              <q-card v-for="ticket in getTicketsByStatus(status)" :key="ticket.id" class="ticket-card q-mb-sm cursor-pointer" @click="viewTicket(ticket.id)" flat bordered>
                <q-card-section>
                  <div class="text-subtitle2">{{ ticket.title }}</div>
                  <div class="text-caption text-grey-7 q-mt-xs">{{ ticket.complex?.name }}</div>
                  <div class="row items-center q-mt-sm q-gutter-xs">
                    <q-badge :color="getPriorityColor(ticket.priority)" :label="$t(`tickets.priorities.${ticket.priority}`)" size="sm" />
                    <q-chip dense size="sm" icon="confirmation_number">{{ ticket.ticketNumber }}</q-chip>
                  </div>
                </q-card-section>
              </q-card>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Create Dialog -->
      <q-dialog v-model="showCreateDialog" persistent>
        <q-card style="min-width: 600px">
          <q-card-section><div class="text-h6">{{ $t('tickets.create') }}</div></q-card-section>
          <q-card-section>
            <q-form @submit="createTicket" class="q-gutter-md">
              <q-input v-model="newTicket.title" :label="$t('tickets.title') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" />
              <q-input v-model="newTicket.description" :label="$t('common.description') + ' *'" outlined type="textarea" rows="3" :rules="[val => !!val || $t('validation.required')]" />
              <q-select v-model="newTicket.complexId" :options="complexes" option-value="id" option-label="name" :label="$t('nav.complexes') + ' *'" outlined emit-value map-options :rules="[val => !!val || $t('validation.required')]" />
              <q-select v-model="newTicket.category" :options="categoryOptions" :label="$t('tickets.category') + ' *'" outlined :rules="[val => !!val || $t('validation.required')]" />
              <q-select v-model="newTicket.priority" :options="priorityOptions" :label="$t('tickets.priority') + ' *'" outlined emit-value map-options :rules="[val => !!val || $t('validation.required')]" />
              <div class="row q-gutter-md justify-end">
                <q-btn flat :label="$t('common.cancel')" color="grey" v-close-popup />
                <q-btn type="submit" :label="$t('common.create')" color="primary" :loading="creating" />
              </div>
            </q-form>
          </q-card-section>
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
import { ticketsAPI, complexesAPI } from '../../api';

export default defineComponent({
  name: 'TicketsListPage',
  setup() {
    const router = useRouter();
    const { t } = useI18n();
    const $q = useQuasar();

    const loading = ref(false);
    const creating = ref(false);
    const viewMode = ref('list');
    const tickets = ref([]);
    const complexes = ref([]);
    const showCreateDialog = ref(false);
    const filters = ref({ search: '', status: null, priority: null, category: null, complexId: null });
    const pagination = ref({ sortBy: 'createdAt', descending: true, page: 1, rowsPerPage: 10, rowsNumber: 0 });
    const newTicket = ref({ title: '', description: '', complexId: null, category: '', priority: 'medium' });

    const columns = computed(() => [
      { name: 'ticketNumber', label: t('tickets.number'), field: 'ticketNumber', align: 'left', sortable: true },
      { name: 'title', label: t('tickets.title'), field: 'title', align: 'left', sortable: true },
      { name: 'category', label: t('tickets.category'), field: 'category', align: 'left' },
      { name: 'priority', label: t('tickets.priority'), field: 'priority', align: 'center', sortable: true },
      { name: 'status', label: t('common.status'), field: 'status', align: 'center', sortable: true },
      { name: 'createdAt', label: t('common.date'), field: 'createdAt', align: 'left', sortable: true, format: val => new Date(val).toLocaleDateString() },
      { name: 'actions', label: t('common.actions'), field: 'actions', align: 'center' }
    ]);

    const statusOptions = computed(() => [{ label: t('tickets.statuses.new'), value: 'new' }, { label: t('tickets.statuses.in_progress'), value: 'in_progress' }, { label: t('tickets.statuses.resolved'), value: 'resolved' }, { label: t('tickets.statuses.closed'), value: 'closed' }]);
    const priorityOptions = computed(() => [{ label: t('tickets.priorities.low'), value: 'low' }, { label: t('tickets.priorities.medium'), value: 'medium' }, { label: t('tickets.priorities.high'), value: 'high' }, { label: t('tickets.priorities.urgent'), value: 'urgent' }]);
    const categoryOptions = ['Plumbing', 'Electrical', 'Heating', 'Cleaning', 'Security', 'Other'];
    const kanbanStatuses = ['new', 'in_progress', 'resolved', 'closed'];

    const getStatusColor = (status) => ({ new: 'info', in_progress: 'warning', resolved: 'positive', closed: 'grey' }[status]);
    const getPriorityColor = (priority) => ({ low: 'grey', medium: 'info', high: 'warning', urgent: 'negative' }[priority]);
    const getTicketsByStatus = (status) => tickets.value.filter(t => t.status === status);

    const fetchTickets = async (props = {}) => {
      loading.value = true;
      try {
        const { page, rowsPerPage, sortBy, descending } = props.pagination || pagination.value;
        const params = { page, limit: rowsPerPage, sortBy, order: descending ? 'desc' : 'asc', ...filters.value };
        const response = await ticketsAPI.getAll(params);
        tickets.value = response.data.data || [];
        pagination.value.page = response.data.page || 1;
        pagination.value.rowsPerPage = response.data.limit || 10;
        pagination.value.rowsNumber = response.data.total || 0;
        if (props.pagination) { pagination.value.sortBy = sortBy; pagination.value.descending = descending; }
      } catch (error) {
        $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' });
      } finally { loading.value = false; }
    };

    const fetchComplexes = async () => {
      try {
        const response = await complexesAPI.getAll({ limit: 100 });
        complexes.value = response.data.data || [];
      } catch (error) { console.error('Failed to fetch complexes', error); }
    };

    let searchTimeout;
    const onSearch = () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { pagination.value.page = 1; fetchTickets(); }, 500); };
    const onRequest = (props) => { fetchTickets(props); };
    const viewTicket = (id) => { router.push(`/tickets/${id}`); };

    const createTicket = async () => {
      creating.value = true;
      try {
        await ticketsAPI.create(newTicket.value);
        $q.notify({ message: t('tickets.createSuccess'), color: 'positive', icon: 'check' });
        showCreateDialog.value = false;
        newTicket.value = { title: '', description: '', complexId: null, category: '', priority: 'medium' };
        await fetchTickets();
      } catch (error) {
        $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' });
      } finally { creating.value = false; }
    };

    onMounted(() => { fetchTickets(); fetchComplexes(); });

    return { loading, creating, viewMode, tickets, complexes, filters, pagination, columns, statusOptions, priorityOptions, categoryOptions, kanbanStatuses, showCreateDialog, newTicket, getStatusColor, getPriorityColor, getTicketsByStatus, onSearch, onRequest, viewTicket, createTicket };
  }
});
</script>

<style lang="scss" scoped>
.kanban-column { height: calc(100vh - 250px); display: flex; flex-direction: column; }
.kanban-cards { flex: 1; overflow-y: auto; }
.ticket-card { transition: transform 0.2s; &:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); } }
</style>
