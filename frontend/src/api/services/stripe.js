import api from '../index';

export const stripeAPI = {
  createPaymentIntent: (amount, currency = 'eur') => api.post('/payments/stripe/create-intent', { amount, currency }),
  confirmPayment: (paymentIntentId) => api.post('/payments/stripe/confirm', { paymentIntentId }),
  getPaymentMethods: () => api.get('/payments/stripe/methods'),
  addPaymentMethod: (data) => api.post('/payments/stripe/methods', data),
  setDefaultPaymentMethod: (id) => api.put(`/payments/stripe/methods/${id}/default`),
  deletePaymentMethod: (id) => api.delete(`/payments/stripe/methods/${id}`),
  getTransactions: (params) => api.get('/payments/stripe/transactions', { params })
};

export default stripeAPI;
