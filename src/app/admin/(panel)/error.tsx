'use client';
import { AdminError } from '@/components/AdminError';

// A page of the coach space failed: the menu (the layout) stays on screen.
export default function PanelError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminError {...props} />;
}
