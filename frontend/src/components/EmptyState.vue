<template>
  <div class="empty-state text-center q-pa-xl" :class="classes">
    <q-icon :name="icon" :size="iconSize" :color="color" class="q-mb-md" />
    <div :class="titleClass">{{ title }}</div>
    <div class="text-body2 text-grey-7 q-mb-lg" v-if="message">{{ message }}</div>
    <q-btn
      v-if="actionLabel"
      :label="actionLabel"
      :color="color"
      :icon="actionIcon"
      @click="$emit('action')"
      no-caps
      unelevated
    />
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue';

export default defineComponent({
  name: 'EmptyState',
  props: {
    icon: { 
      type: String, 
      default: 'inbox',
      validator: (v) => typeof v === 'string' && v.length > 0
    },
    iconSize: { type: String, default: '80px' },
    color: { type: String, default: 'grey' },
    title: { 
      type: String, 
      default: 'No data',
      required: true
    },
    message: { type: String, default: '' },
    actionLabel: { type: String, default: '' },
    actionIcon: { type: String, default: '' },
    size: { 
      type: String, 
      default: 'medium',
      validator: (v) => ['small', 'medium', 'large'].includes(v)
    }
  },
  emits: ['action'],
  setup(props) {
    const titleClass = computed(() => {
      const sizeMap = {
        small: 'text-subtitle1',
        medium: 'text-h6',
        large: 'text-h5'
      };
      return `${sizeMap[props.size]} q-mb-sm`;
    });

    const classes = computed(() => ({
      'empty-state--small': props.size === 'small',
      'empty-state--large': props.size === 'large'
    }));

    return { titleClass, classes };
  }
});
</script>

<style lang="scss" scoped>
.empty-state {
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  
  &--small {
    min-height: 150px;
    padding: 1rem;
  }
  
  &--large {
    min-height: 300px;
    padding: 3rem;
  }
}
</style>
