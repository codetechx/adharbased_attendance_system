import axios from "axios";
import toast from "react-hot-toast";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  timeout: 30_000,
});

// Request interceptor — attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ams_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle errors globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status  = err.response?.status;
    const message = err.response?.data?.message;

    if (status === 401) {
      localStorage.removeItem("ams_token");
      window.location.href = "/login";
      return Promise.reject(err);
    }

    if (status === 403) {
      toast.error(message || "Access denied.");
    } else if (status === 422) {
      // Validation errors handled per-form; don't toast globally
    } else if (status === 500) {
      toast.error("Server error. Please try again.");
    } else if (!err.response) {
      toast.error("Network error. Check your connection.");
    }

    return Promise.reject(err);
  }
);

export default api;
