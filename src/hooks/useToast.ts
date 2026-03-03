import { useToastContext } from '../components/ToastProvider';
import type { ToastOptions } from '../lib/toast';

export function useToast() {
  const context = useToastContext();

  return {
    success: (message: string, options?: ToastOptions) => context.success(message, options),
    error: (message: string, options?: ToastOptions) => context.error(message, options),
    warning: (message: string, options?: ToastOptions) => context.warning(message, options),
    info: (message: string, options?: ToastOptions) => context.info(message, options),
    remove: (id: string) => context.removeToast(id),
    clearAll: () => context.clearAll(),
    toasts: context.toasts,
  };
}
