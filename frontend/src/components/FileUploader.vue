<template>
  <div class="file-uploader">
    <q-file 
      v-model="files" 
      :multiple="multiple" 
      :accept="accept" 
      :label="label" 
      outlined 
      counter 
      :max-files="maxFiles"
      :max-file-size="maxFileSize"
      @update:model-value="handleFiles"
      @rejected="onRejected"
    >
      <template v-slot:prepend>
        <q-icon name="cloud_upload" />
      </template>
      <template v-slot:hint v-if="hint">
        {{ hint }}
      </template>
    </q-file>
    
    <div v-if="uploadedFiles.length > 0" class="q-mt-md">
      <div class="text-subtitle2 q-mb-sm">{{ $t('common.uploadedFiles') }}:</div>
      <q-list bordered separator>
        <q-item v-for="file in uploadedFiles" :key="file.id">
          <q-item-section avatar>
            <q-icon :name="getFileIcon(file.type)" color="primary" size="32px" />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ file.name }}</q-item-label>
            <q-item-label caption>{{ formatSize(file.size) }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-btn 
              flat 
              round 
              dense 
              icon="delete" 
              color="negative" 
              @click="deleteFile(file.id)"
              :loading="deletingFiles[file.id]"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </div>
    
    <q-linear-progress 
      v-if="uploading" 
      :value="uploadProgress / 100" 
      color="primary" 
      class="q-mt-md" 
    />
  </div>
</template>

<script>
import { defineComponent, ref, PropType } from 'vue';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { useFileUpload } from '../composables/useFileUpload';
import { FILE_UPLOAD_MAX_SIZE } from '../utils/constants';

export default defineComponent({
  name: 'FileUploader',
  props: {
    multiple: { type: Boolean, default: false },
    accept: { type: String, default: '*/*' },
    label: { type: String, default: 'Choose file(s)' },
    hint: { type: String, default: '' },
    folder: { type: String, default: 'general' },
    maxFiles: { type: Number, default: 5, validator: (v) => v > 0 },
    maxFileSize: { type: Number, default: FILE_UPLOAD_MAX_SIZE }
  },
  emits: ['uploaded', 'deleted', 'error'],
  setup(props, { emit }) {
    const $q = useQuasar();
    const { t } = useI18n();
    const { uploading, uploadProgress, uploadedFiles, uploadFile, uploadMultiple, deleteFile: removeFile } = useFileUpload();
    
    const files = ref(null);
    const deletingFiles = ref({});

    const handleFiles = async () => {
      if (!files.value) return;
      
      try {
        let result;
        if (Array.isArray(files.value)) {
          result = await uploadMultiple(files.value, props.folder);
        } else {
          result = await uploadFile(files.value, props.folder);
        }
        emit('uploaded', result);
        files.value = null;
      } catch (error) {
        emit('error', error);
        $q.notify({
          message: error.message || t('common.uploadError'),
          color: 'negative',
          icon: 'error'
        });
      }
    };

    const deleteFile = async (id) => {
      deletingFiles.value[id] = true;
      try {
        await removeFile(id);
        emit('deleted', id);
      } catch (error) {
        $q.notify({
          message: error.message || t('common.deleteError'),
          color: 'negative',
          icon: 'error'
        });
      } finally {
        delete deletingFiles.value[id];
      }
    };

    const onRejected = (rejectedEntries) => {
      const reasons = rejectedEntries.map(entry => {
        if (entry.failedPropValidation === 'max-file-size') {
          return `${entry.file.name}: File too large`;
        }
        return `${entry.file.name}: Invalid file`;
      });
      
      $q.notify({
        message: reasons.join('\n'),
        color: 'negative',
        icon: 'error',
        multiLine: true
      });
    };

    const getFileIcon = (type) => {
      if (type?.includes('image')) return 'image';
      if (type?.includes('pdf')) return 'picture_as_pdf';
      if (type?.includes('video')) return 'videocam';
      if (type?.includes('audio')) return 'audiotrack';
      if (type?.includes('word')) return 'description';
      if (type?.includes('excel') || type?.includes('spreadsheet')) return 'grid_on';
      return 'insert_drive_file';
    };

    const formatSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    return {
      files,
      uploading,
      uploadProgress,
      uploadedFiles,
      deletingFiles,
      handleFiles,
      deleteFile,
      onRejected,
      getFileIcon,
      formatSize
    };
  }
});
</script>
