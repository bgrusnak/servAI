<template>
  <q-dialog v-model="show" persistent>
    <q-card style="min-width: 350px">
      <q-card-section>
        <div class="text-h6">{{ title }}</div>
      </q-card-section>
      <q-card-section>
        {{ message }}
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat :label="cancelLabel" color="grey" @click="cancel" />
        <q-btn flat :label="confirmLabel" :color="confirmColor" @click="confirm" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent, ref } from 'vue';

export default defineComponent({
  name: 'ConfirmDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: 'Confirm' },
    message: { type: String, default: 'Are you sure?' },
    confirmLabel: { type: String, default: 'Confirm' },
    cancelLabel: { type: String, default: 'Cancel' },
    confirmColor: { type: String, default: 'primary' }
  },
  emits: ['update:modelValue', 'confirm', 'cancel'],
  setup(props, { emit }) {
    const show = ref(props.modelValue);

    const confirm = () => {
      emit('confirm');
      emit('update:modelValue', false);
    };

    const cancel = () => {
      emit('cancel');
      emit('update:modelValue', false);
    };

    return { show, confirm, cancel };
  }
});
</script>
