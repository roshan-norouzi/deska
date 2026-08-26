'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError, type ApiFetchOptions } from '@/lib/utils';

interface UseApiState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

interface UseApiOptions<T> extends ApiFetchOptions {
  immediate?: boolean;
  initialData?: T | null;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

export function useApi<T = unknown>(
  path: string | null,
  options: UseApiOptions<T> = {},
) {
  const { immediate = true, initialData = null, onSuccess, onError, ...fetchOptions } = options;
  const [state, setState] = useState<UseApiState<T>>({
    data: initialData,
    error: null,
    isLoading: immediate && !!path,
  });

  const fetchOptionsRef = useRef(fetchOptions);
  fetchOptionsRef.current = fetchOptions;

  const execute = useCallback(async (overridePath?: string, overrideOptions?: ApiFetchOptions) => {
    const targetPath = overridePath ?? path;
    if (!targetPath) return null;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const data = await apiFetch<T>(targetPath, { ...fetchOptionsRef.current, ...overrideOptions });
      setState({ data, error: null, isLoading: false });
      onSuccess?.(data);
      return data;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'خطای ناشناخته';
      setState((prev) => ({ ...prev, error: message, isLoading: false }));
      onError?.(message);
      return null;
    }
  }, [path, onSuccess, onError]);

  const mutate = useCallback((data: T | null) => {
    setState((prev) => ({ ...prev, data }));
  }, []);

  const reset = useCallback(() => {
    setState({ data: initialData, error: null, isLoading: false });
  }, [initialData]);

  useEffect(() => {
    if (immediate && path) {
      void execute();
    }
  }, [path, immediate]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    execute,
    mutate,
    reset,
    refetch: () => execute(),
  };
}

export function useMutation<TBody = unknown, TResult = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (body?: TBody, overridePath?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await apiFetch<TResult>(overridePath ?? path, {
          method,
          body,
        });
        setIsLoading(false);
        return result;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'خطای ناشناخته';
        setError(message);
        setIsLoading(false);
        throw err;
      }
    },
    [path, method],
  );

  return { mutate, isLoading, error };
}
