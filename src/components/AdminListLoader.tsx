import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';

export function AdminListLoader() {
  useTrustedAdmin();
  return null;
}
