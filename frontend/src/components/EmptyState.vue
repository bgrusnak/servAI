<template>
  <div class="empty-state text-center q-pa-xl">
    <q-icon :name="icon" size="80px" :color="color" class="q-mb-md" />
    <div class="text-h6 q-mb-sm">{{ title }}</div>
    <div class="text-body2 text-grey-7 q-mb-lg">{{ message }}</div>
    <q-btn
      v-if="actionLabel"
      :label="actionLabel"
      :color="color"
      @click="$emit('action')"
      no-caps
      unelevated
    />
  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'EmptyState',
  props: {
    icon: { type: String, default: 'inbox' },
    color: { type: String, default: 'grey' },
    title: { type: String, default: 'No data' },
    message: { type: String, default: 'There is no data to display' },
    actionLabel: { type: String, default: '' }
  },
  emits: ['action']
});
</script>
