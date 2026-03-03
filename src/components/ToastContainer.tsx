import type { Toast as ToastType, ToastPosition } from '../lib/toast';
import { ToastItem } from './ToastItem';

interface ToastContainerProps {
  toasts: ToastType[];
  position?: ToastPosition;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, position = 'top-right', onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  const positionClasses: Record<ToastPosition, string> = {
    'top-right': 'top-4 right-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  };

  return (
    <div
      className={`fixed z-50 flex flex-col gap-2 ${positionClasses[position]} pointer-events-none`}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto" onMouseEnter={() => {}}>
          <ToastItem toast={toast} onRemove={onRemove} onHoverChange={() => {}} />
        </div>
      ))}
    </div>
  );
}
