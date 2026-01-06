import api from '../index';

export const telegramAPI = {
  connect: (data) => api.post('/integrations/telegram/connect', data),
  disconnect: () => api.post('/integrations/telegram/disconnect'),
  getStatus: () => api.get('/integrations/telegram/status'),
  sendMessage: (chatId, message) => api.post('/integrations/telegram/send', { chatId, message }),
  getBotInfo: () => api.get('/integrations/telegram/bot-info')
};

export default telegramAPI;
