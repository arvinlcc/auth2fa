import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastContainer } from './ToastContainer';
import { logger } from '../lib/logger';
import type { Toast, ToastType, ToastOptions, ToastPosition } from '../lib/toast';
import { DEFAULT_MAX_TOASTS, DEFAULT_TOAST_POSITION, TOAST_CONFIGS } from '../lib/toast';

interface ToastContextValue {
  toasts: Toast[];
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within ToastProvider');
  }
  return context;
}

interface ToastProviderProps {
  children: ReactNode;
  position?: ToastPosition;
  maxToasts?: number;
}

export function ToastProvider({
  children,
  position = DEFAULT_TOAST_POSITION,
  maxToasts = DEFAULT_MAX_TOASTS,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions) => {
      const config = TOAST_CONFIGS[type];
      const duration = options?.duration ?? config.defaultDuration;

      // Log to logger if enabled (default true)
      if (options?.logToLogger !== false) {
        logger[config.logLevel](message, options?.context);
      }

      const newToast: Toast = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        message,
        duration,
        timestamp: new Date(),
      };

      setToasts((prev) => {
        const updated = [newToast, ...prev];
        // Keep only the most recent toasts
        return updated.slice(0, maxToasts);
      });

      // Auto-remove after duration (if duration > 0)
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
        }, duration);
      }
    },
    [maxToasts]
  );

  const success = useCallback((message: string, options?: ToastOptions) => {
    addToast('success', message, options);
  }, [addToast]);

  const error = useCallback((message: string, options?: ToastOptions) => {
    addToast('error', message, options);
  }, [addToast]);

  const warning = useCallback((message: string, options?: ToastOptions) => {
    addToast('warning', message, options);
  }, [addToast]);

  const info = useCallback((message: string, options?: ToastOptions) => {
    addToast('info', message, options);
  }, [addToast]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  const value: ToastContextValue = {
    toasts,
    success,
    error,
    warning,
    info,
    removeToast,
    clearAll,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} position={position} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}
