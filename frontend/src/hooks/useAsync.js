import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Carga datos y expone estado, error y recarga. Descarta respuestas de
 * peticiones que ya quedaron obsoletas al cambiar los filtros.
 */
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const run = useCallback(async (...args) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fn(...args);
      if (id === requestId.current) setData(result);
      return result;
    } catch (err) {
      if (id === requestId.current) setError(err);
      throw err;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) run().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return { data, loading, error, reload: run, setData };
}

/** Ejecuta una accion puntual (guardar, borrar) con estado de envio. */
export function useAction(fn) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (...args) => {
    setRunning(true);
    setError(null);
    try {
      return await fn(...args);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setRunning(false);
    }
  }, [fn]);

  return { execute, running, error, setError };
}

/** Intervalo que se pausa cuando la pestana no esta visible. */
export function useInterval(callback, delayMs) {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);

  useEffect(() => {
    if (!delayMs) return undefined;
    const tick = () => { if (!document.hidden) saved.current(); };
    const id = setInterval(tick, delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}
