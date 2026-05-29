import { useToastState } from '@/shared/hooks/useToast';
import {
  ToastProvider, ToastViewport, ToastWithIcon,
} from './ui/toast';

export function Toaster() {
  const { toasts } = useToastState();

  return (
    <ToastProvider>
      {toasts.map(t => (
        <ToastWithIcon
          key={t.id}
          open={t.open}
          variant={t.variant}
          title={t.title}
          description={t.description}
          duration={t.duration}
        />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
