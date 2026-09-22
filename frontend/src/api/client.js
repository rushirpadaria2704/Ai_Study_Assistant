import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      return Promise.reject(error.response.data || { error: `Server error (${error.response.status})` });
    } else if (error.request) {
      return Promise.reject({ error: 'Network Error: Cannot connect to backend server. Ensure Flask API is running.' });
    } else {
      return Promise.reject({ error: error.message });
    }
  }
);

export default client;
