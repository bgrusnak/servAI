<template>
  <q-dialog v-model="isVisible" persistent>
    <q-card style="min-width: 350px; max-width: 500px;">
      <q-card-section class="row items-center">
        <q-icon 
          v-if="icon" 
          :name="icon" 
          :color="iconColor" 
          size="32px" 
          class="q-mr-sm" 
        />
        <div class="text-h6">{{ title }}</div>
      </q-card-section>
      
      <q-card-section>
        <div v-html="message"></div>
      </q-card-section>
      
      <q-card-actions align="right">
        <q-btn 
          flat 
          :label="cancelLabel" 
          color="grey" 
          @click="cancel"
          :disable="loading"
        />
        <q-btn 
          flat 
          :label="confirmLabel" 
          :color="confirmColor" 
          @click="confirm"
          :loading="loading"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent, ref, watch } from 'vue';

export default defineComponent({
  name: 'ConfirmDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: 'Confirm', required: true },
    message: { type: String, default: 'Are you sure?', required: true },
    icon: { type: String, default: '' },
    iconColor: { type: String, default: 'primary' },
    confirmLabel: { type: String, default: 'Confirm' },
    cancelLabel: { type: String, default: 'Cancel' },
    confirmColor: { type: String, default: 'primary' },
    loading: { type: Boolean, default: false }
  },
  emits: ['update:modelValue', 'confirm', 'cancel'],
  setup(props, { emit }) {
    const isVisible = ref(props.modelValue);

    watch(() => props.modelValue, (val) => {
      isVisible.value = val;
    });

    watch(isVisible, (val) => {
      emit('update:modelValue', val);
    });

    const confirm = () => {
      emit('confirm');
      if (!props.loading) {
        isVisible.value = false;
      }
    };

    const cancel = () => {
      emit('cancel');
      isVisible.value = false;
    };

    return { isVisible, confirm, cancel };
  }
});
</script>
