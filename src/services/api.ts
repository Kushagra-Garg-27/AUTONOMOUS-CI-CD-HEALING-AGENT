const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL =
  typeof rawBaseUrl === "string" ? rawBaseUrl.replace(/\/+$/, "") : "";

export const withApiBase = (path: string): string =>
  API_BASE_URL ? `${API_BASE_URL}${path}` : path;
