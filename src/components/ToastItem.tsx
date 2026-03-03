import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Toast as ToastType } from '../lib/toast';
import { TOAST_CONFIGS } from '../lib/toast';

interface ToastItemProps {
  toast: ToastType;
  onRemove: (id: string) => void;
  onHoverChange: (isHovered: boolean) => void;
}

export function ToastItem({ toast, onRemove, onHoverChange }: ToastItemProps) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const config = TOAST_CONFIGS[toast.type];
  const Icon = config.icon;

  useEffect(() => {
    if (toast.duration <= 0) {
      setProgress(0);
      return;
    }

    if (isPaused) return;

    const interval = 50; // Update every 50ms
    const step = (interval / toast.duration) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev - step;
        return next <= 0 ? 0 : next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [toast.duration, isPaused]);

  const handleMouseEnter = () => {
    setIsPaused(true);
    onHoverChange(true);
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
    onHoverChange(false);
  };

  return (
    <div
      className={`animate-toast-in ${config.colors.bg} ${config.colors.border} border rounded-lg shadow-lg p-4 min-w-[320px] max-w-md`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${config.colors.icon} flex-shrink-0 mt-0.5`} />
        <div className={`flex-1 ${config.colors.text} text-sm font-medium`}>
          {toast.message}
        </div>
        <button
          onClick={() => onRemove(toast.id)}
          className={`flex-shrink-0 ${config.colors.icon} hover:opacity-70 transition-opacity`}
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {toast.duration > 0 && (
        <div className={`mt-2 h-1 ${config.colors.bg} rounded-full overflow-hidden`}>
          <div
            className={`h-full ${config.colors.icon} transition-all duration-50 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
