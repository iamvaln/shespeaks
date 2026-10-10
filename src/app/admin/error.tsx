'use client';
import { AdminError } from '@/components/AdminError';

// The layout of the coach space itself failed (so there is no menu to show), or a page outside it (login, verification).
export default function AdminRootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminError {...props} standalone />;
}
