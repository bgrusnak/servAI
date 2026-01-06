<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width: 1000px; margin: 0 auto;">
      <div class="row items-center q-mb-md">
        <div class="col"><h5 class="q-my-none">{{ $t('tickets.ticket') }} #{{ ticket?.ticketNumber }}</h5><q-badge :color="getStatusColor(ticket?.status)" :label="$t(`tickets.statuses.${ticket?.status}`)" /></div>
        <div class="col-auto q-gutter-sm"><q-btn flat icon="arrow_back" :label="$t('common.back')" @click="$router.back()" no-caps /><q-btn color="secondary" icon="edit" :label="$t('common.edit')" @click="showEditDialog = true" no-caps unelevated /></div>
      </div>

      <q-inner-loading :showing="loading" />

      <div v-if="!loading && ticket">
        <q-card class="q-mb-md">
          <q-card-section><div class="text-h6">{{ ticket.title }}</div><div class="text-caption text-grey-7 q-mt-xs">{{ $t('tickets.createdAt') }}: {{ formatDate(ticket.createdAt) }}</div></q-card-section>
          <q-separator />
          <q-card-section>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6"><div class="info-item"><div class="info-label">{{ $t('tickets.category') }}</div><div class="info-value">{{ ticket.category }}</div></div></div>
              <div class="col-12 col-md-6"><div class="info-item"><div class="info-label">{{ $t('tickets.priority') }}</div><q-badge :color="getPriorityColor(ticket.priority)" :label="$t(`tickets.priorities.${ticket.priority}`)" /></div></div>
              <div class="col-12 col-md-6"><div class="info-item"><div class="info-label">{{ $t('nav.complexes') }}</div><div class="info-value">{{ ticket.complex?.name }}</div></div></div>
              <div class="col-12 col-md-6" v-if="ticket.assignedTo"><div class="info-item"><div class="info-label">{{ $t('tickets.assignedTo') }}</div><div class="info-value">{{ ticket.assignedTo?.name }}</div></div></div>
              <div class="col-12"><div class="info-item"><div class="info-label">{{ $t('common.description') }}</div><div class="info-value">{{ ticket.description }}</div></div></div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Comments -->
        <q-card>
          <q-card-section><div class="text-h6 q-mb-md">{{ $t('tickets.comments') }}</div>
            <q-input v-model="newComment" :label="$t('tickets.addComment')" outlined type="textarea" rows="2">
              <template v-slot:append><q-btn round dense flat icon="send" color="primary" @click="addComment" :loading="addingComment" /></template>
            </q-input>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <q-timeline color="primary">
              <q-timeline-entry v-for="comment in comments" :key="comment.id" :title="comment.user?.name" :subtitle="formatDate(comment.createdAt)" icon="comment">
                <div>{{ comment.text }}</div>
              </q-timeline-entry>
            </q-timeline>
          </q-card-section>
        </q-card>
      </div>

      <!-- Edit Dialog -->
      <q-dialog v-model="showEditDialog" persistent>
        <q-card style="min-width: 500px">
          <q-card-section><div class="text-h6">{{ $t('tickets.edit') }}</div></q-card-section>
          <q-card-section>
            <q-form @submit="updateTicket" class="q-gutter-md">
              <q-select v-model="editForm.status" :options="statusOptions" :label="$t('common.status')" outlined emit-value map-options />
              <q-select v-model="editForm.priority" :options="priorityOptions" :label="$t('tickets.priority')" outlined emit-value map-options />
              <q-select v-model="editForm.assignedToId" :options="workers" option-value="id" option-label="name" :label="$t('tickets.assignedTo')" outlined emit-value map-options clearable />
              <div class="row q-gutter-md justify-end"><q-btn flat :label="$t('common.cancel')" color="grey" v-close-popup /><q-btn type="submit" :label="$t('common.save')" color="primary" :loading="updating" /></div>
            </q-form>
          </q-card-section>
        </q-card>
      </q-dialog>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';
import { ticketsAPI } from '../../api';

export default defineComponent({
  name: 'ViewTicketPage',
  setup() {
    const route = useRoute();
    const { t } = useI18n();
    const $q = useQuasar();

    const loading = ref(false);
    const updating = ref(false);
    const addingComment = ref(false);
    const ticket = ref(null);
    const comments = ref([]);
    const workers = ref([]);
    const newComment = ref('');
    const showEditDialog = ref(false);
    const editForm = ref({});
    const ticketId = computed(() => route.params.id);

    const statusOptions = computed(() => [{ label: t('tickets.statuses.new'), value: 'new' }, { label: t('tickets.statuses.in_progress'), value: 'in_progress' }, { label: t('tickets.statuses.resolved'), value: 'resolved' }, { label: t('tickets.statuses.closed'), value: 'closed' }]);
    const priorityOptions = computed(() => [{ label: t('tickets.priorities.low'), value: 'low' }, { label: t('tickets.priorities.medium'), value: 'medium' }, { label: t('tickets.priorities.high'), value: 'high' }, { label: t('tickets.priorities.urgent'), value: 'urgent' }]);
    
    const getStatusColor = (status) => ({ new: 'info', in_progress: 'warning', resolved: 'positive', closed: 'grey' }[status]);
    const getPriorityColor = (priority) => ({ low: 'grey', medium: 'info', high: 'warning', urgent: 'negative' }[priority]);
    const formatDate = (date) => new Date(date).toLocaleString();

    const fetchTicket = async () => {
      loading.value = true;
      try {
        const response = await ticketsAPI.getById(ticketId.value);
        ticket.value = response.data;
        editForm.value = { status: response.data.status, priority: response.data.priority, assignedToId: response.data.assignedToId };
        comments.value = response.data.comments || [];
      } catch (error) {
        $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' });
      } finally { loading.value = false; }
    };

    const updateTicket = async () => {
      updating.value = true;
      try {
        await ticketsAPI.update(ticketId.value, editForm.value);
        $q.notify({ message: t('tickets.updateSuccess'), color: 'positive', icon: 'check' });
        showEditDialog.value = false;
        await fetchTicket();
      } catch (error) {
        $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' });
      } finally { updating.value = false; }
    };

    const addComment = async () => {
      if (!newComment.value.trim()) return;
      addingComment.value = true;
      try {
        await ticketsAPI.addComment(ticketId.value, { text: newComment.value });
        newComment.value = '';
        await fetchTicket();
      } catch (error) {
        $q.notify({ message: error.message || t('common.error'), color: 'negative', icon: 'error' });
      } finally { addingComment.value = false; }
    };

    onMounted(() => { fetchTicket(); });

    return { loading, updating, addingComment, ticket, comments, workers, newComment, showEditDialog, editForm, statusOptions, priorityOptions, getStatusColor, getPriorityColor, formatDate, updateTicket, addComment };
  }
});
</script>

<style lang="scss" scoped>
.info-item { margin-bottom: 12px; .info-label { font-size: 0.875rem; color: #666; margin-bottom: 4px; } .info-value { font-size: 1rem; font-weight: 500; } }
</style>
