import axios from "axios";

const TOKEN_KEY = "nw_token";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const url = response.config?.url || "";
    if ((url.includes("/user/login") || url.includes("/user/register")) && response.data?.token) {
      sessionStorage.setItem(TOKEN_KEY, response.data.token);
    } else if (url.includes("/user/logout")) {
      sessionStorage.removeItem(TOKEN_KEY);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
    }
    return Promise.reject(error);
  }
);

export default api;
