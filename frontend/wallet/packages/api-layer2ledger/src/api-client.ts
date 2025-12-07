import Axios from 'axios';
import type { AxiosRequestConfig } from 'axios';

// Use a function to get the base URL to avoid import.meta issues during code generation
const getBaseURL = (): string => {
  try {
    // This will work at runtime in Vite, but won't cause issues during Orval's esbuild processing
    return import.meta.env?.VITE_API_BASE_URL || 'http://0.0.0.0:8000/';
  } catch {
    return 'http://0.0.0.0:8000/';
  }
};

export const AXIOS_INSTANCE = Axios.create({
  baseURL: getBaseURL(),
});

// Add interceptors for auth, error handling, etc.
AXIOS_INSTANCE.interceptors.request.use((config) => {
  // Add auth token, etc.
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  const source = Axios.CancelToken.source();
  const promise = AXIOS_INSTANCE({
    ...config,
    cancelToken: source.token,
  }).then(({ data }) => data);

  // @ts-ignore
  promise.cancel = () => {
    source.cancel('Query was cancelled');
  };

  return promise;
};