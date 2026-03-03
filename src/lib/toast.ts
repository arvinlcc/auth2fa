import { CheckCircle, AlertCircle, AlertTriangle, Info, LucideIcon } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  timestamp: Date;
}

export interface ToastOptions {
  duration?: number;
  logToLogger?: boolean;
  context?: Record<string, any>;
}

export interface ToastTypeConfig {
  icon: LucideIcon;
  defaultDuration: number;
  colors: {
    bg: string;
    border: string;
    text: string;
    icon: string;
  };
  logLevel: 'info' | 'warn' | 'error';
}

export const TOAST_CONFIGS: Record<ToastType, ToastTypeConfig> = {
  success: {
    icon: CheckCircle,
    defaultDuration: 3000,
    colors: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      icon: 'text-green-600',
    },
    logLevel: 'info',
  },
  error: {
    icon: AlertCircle,
    defaultDuration: 5000,
    colors: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: 'text-red-600',
    },
    logLevel: 'error',
  },
  warning: {
    icon: AlertTriangle,
    defaultDuration: 4000,
    colors: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      icon: 'text-yellow-600',
    },
    logLevel: 'warn',
  },
  info: {
    icon: Info,
    defaultDuration: 3000,
    colors: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      icon: 'text-blue-600',
    },
    logLevel: 'info',
  },
};

export const DEFAULT_MAX_TOASTS = 5;
export const DEFAULT_TOAST_POSITION: ToastPosition = 'top-right';

export type ToastPosition = 'top-right' | 'top-center' | 'bottom-center';
