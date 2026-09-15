import axios, { AxiosError, AxiosInstance } from 'axios';
import { ApiResponse } from '@bidstrat/shared';
import { useAuthStore } from '../store/auth';

export const http: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 60000,
});

http.interceptors.request.use((cfg) => {
  const token = useAuthStore.getState().token;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

http.interceptors.response.use(
  (resp) => resp,
  (err: AxiosError<ApiResponse<unknown>>) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export async function api<T>(method: string, url: string, data?: unknown, cfg?: { params?: Record<string, unknown> }): Promise<T> {
  const resp = await http.request<ApiResponse<T>>({ method, url, data, params: cfg?.params });
  if (resp.data.code !== 0 && resp.data.code !== 200) {
    throw new Error(resp.data.message);
  }
  return (resp.data.data ?? (resp.data as unknown)) as T;
}