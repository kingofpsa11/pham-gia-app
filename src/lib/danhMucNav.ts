import { Users, Building2, CreditCard } from 'lucide-react';

export const DANH_MUC_BASE = '/danh-muc';

export const DANH_MUC_TABS = [
  {
    to: `${DANH_MUC_BASE}/khach-hang`,
    prefix: `${DANH_MUC_BASE}/khach-hang`,
    label: 'Khách hàng',
    icon: Users,
  },
  {
    to: `${DANH_MUC_BASE}/nha-cung-cap`,
    prefix: `${DANH_MUC_BASE}/nha-cung-cap`,
    label: 'Nhà cung cấp',
    icon: Building2,
  },
  {
    to: `${DANH_MUC_BASE}/tai-khoan`,
    prefix: `${DANH_MUC_BASE}/tai-khoan`,
    label: 'Tài khoản',
    icon: CreditCard,
    adminOnly: true,
  },
] as const;

export function isDanhMucPath(pathname: string): boolean {
  return pathname === DANH_MUC_BASE || pathname.startsWith(`${DANH_MUC_BASE}/`);
}
