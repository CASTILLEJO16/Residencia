import axios from 'axios';

/**
 * El access token vive solo en memoria (no en localStorage), asi un XSS no
 * puede leerlo de almacenamiento persistente. El refresh token lo maneja el
 * navegador en una cookie httpOnly que JavaScript no puede leer; al recargar
 * la pagina la sesion se recupera llamando a /auth/refresh.
 */
let accessToken = null;

// Limpieza de versiones anteriores que guardaban los tokens en localStorage.
try {
  localStorage.removeItem('sio.accessToken');
  localStorage.removeItem('sio.refreshToken');
} catch { /* almacenamiento no disponible */ }

export const tokenStore = {
  get access() { return accessToken; },
  set({ accessToken: token }) {
    if (token) accessToken = token;
  },
  clear() {
    accessToken = null;
  },
};

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Renovacion del token de acceso.
 *
 * El detalle importante: si el dashboard dispara ocho peticiones a la vez
 * y todas reciben 401, solo una debe llamar a /auth/refresh. Las demas
 * esperan en la cola y se reintentan con el token nuevo. Sin esto, el
 * backend recibe ocho refresh en paralelo, rota el token ocho veces y
 * termina cerrando la sesion por reuso.
 */
let refreshing = null;
let queue = [];

/**
 * Renueva la sesion usando la cookie httpOnly. Si ya hay una renovacion en
 * curso se reutiliza (evita rotar el token dos veces, p. ej. con StrictMode).
 * Devuelve { user, accessToken } o lanza si no hay sesion.
 */
let restoring = null;
export function restoreSession() {
  if (!restoring) {
    restoring = axios.post('/api/auth/refresh', null, { withCredentials: true })
      .then(({ data }) => {
        tokenStore.set(data.data);
        return data.data;
      })
      .finally(() => { restoring = null; });
  }
  return restoring;
}

function requestNewAccessToken() {
  return restoreSession().then((data) => data.accessToken);
}

function flushQueue(error, token) {
  queue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token)));
  queue = [];
}

let onSessionExpired = () => {};
export function setSessionExpiredHandler(fn) { onSessionExpired = fn; }

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    if (!response) return Promise.reject(normalize(error));

    const isAuthCall = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');
    const expired = response.status === 401 && response.data?.error?.code === 'TOKEN_EXPIRED';

    if (!expired || isAuthCall || config._retried) {
      if (response.status === 401 && !isAuthCall) {
        tokenStore.clear();
        onSessionExpired();
      }
      return Promise.reject(normalize(error));
    }

    config._retried = true;

    if (refreshing) {
      return new Promise((resolve, reject) => queue.push({ resolve, reject }))
        .then((token) => {
          config.headers.Authorization = `Bearer ${token}`;
          return api(config);
        });
    }

    refreshing = requestNewAccessToken();
    try {
      const token = await refreshing;
      flushQueue(null, token);
      config.headers.Authorization = `Bearer ${token}`;
      return api(config);
    } catch (err) {
      flushQueue(err, null);
      tokenStore.clear();
      onSessionExpired();
      return Promise.reject(normalize(error));
    } finally {
      refreshing = null;
    }
  }
);

/** Un error de la API siempre llega con la misma forma a los componentes. */
function normalize(error) {
  const data = error.response?.data?.error;
  const normalized = new Error(data?.message || error.message || 'Error de comunicacion');
  normalized.status = error.response?.status ?? 0;
  normalized.code = data?.code || null;
  normalized.details = data?.details || null;
  return normalized;
}

/** Descarga un archivo generado por el backend. */
export async function download(url, params) {
  const response = await api.get(url, { params, responseType: 'blob' });
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const objectUrl = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = match ? match[1] : 'reporte';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export default api;
