<template>
  <div class="file-uploader">
    <q-file v-model="files" :multiple="multiple" :accept="accept" :label="label" outlined counter :max-files="maxFiles" @update:model-value="handleFiles"><template v-slot:prepend><q-icon name="cloud_upload" /></template></q-file>
    <div v-if="uploadedFiles.length > 0" class="q-mt-md">
      <div class="text-subtitle2 q-mb-sm">Uploaded Files:</div>
      <q-list bordered separator>
        <q-item v-for="file in uploadedFiles" :key="file.id">
          <q-item-section avatar><q-icon :name="getFileIcon(file.type)" color="primary" /></q-item-section>
          <q-item-section><q-item-label>{{ file.name }}</q-item-label><q-item-label caption>{{ formatSize(file.size) }}</q-item-label></q-item-section>
          <q-item-section side><q-btn flat round dense icon="delete" color="negative" @click="deleteFile(file.id)" /></q-item-section>
        </q-item>
      </q-list>
    </div>
    <q-linear-progress v-if="uploading" :value="uploadProgress / 100" color="primary" class="q-mt-md" />
  </div>
</template>
<script>
import { defineComponent, ref } from 'vue'; import { useFileUpload } from '../composables/useFileUpload';
export default defineComponent({ name: 'FileUploader', props: { multiple: { type: Boolean, default: false }, accept: { type: String, default: '*/*' }, label: { type: String, default: 'Choose file(s)' }, folder: { type: String, default: 'general' }, maxFiles: { type: Number, default: 5 } }, emits: ['uploaded', 'deleted'], setup(props, { emit }) { const { uploading, uploadProgress, uploadedFiles, uploadFile, uploadMultiple, deleteFile: removeFile } = useFileUpload(); const files = ref(null); const handleFiles = async () => { if (!files.value) return; try { if (Array.isArray(files.value)) { const result = await uploadMultiple(files.value, props.folder); emit('uploaded', result); } else { const result = await uploadFile(files.value, props.folder); emit('uploaded', result); } files.value = null; } catch (error) { console.error('Upload failed', error); } }; const deleteFile = async (id) => { await removeFile(id); emit('deleted', id); }; const getFileIcon = (type) => { if (type?.includes('image')) return 'image'; if (type?.includes('pdf')) return 'picture_as_pdf'; if (type?.includes('video')) return 'videocam'; if (type?.includes('audio')) return 'audiotrack'; return 'insert_drive_file'; }; const formatSize = (bytes) => { if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB'; }; return { files, uploading, uploadProgress, uploadedFiles, handleFiles, deleteFile, getFileIcon, formatSize }; } });
</script>
