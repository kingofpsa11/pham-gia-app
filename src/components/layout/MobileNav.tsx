import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/auth';
import { useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  Truck,
  Banknote,
  Receipt,
  BookMarked,
  FileInput,
  Package,
  LineChart,
  Settings,
} from 'lucide-react';
import { isDanhMucPath } from '../../lib/danhMucNav';

const menuItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/danh-muc/khach-hang', label: 'Danh mục', icon: BookMarked, match: isDanhMucPath },
  { to: '/bao-gia', label: 'Báo giá', icon: FileText },
  { to: '/hop-dong', label: 'Hợp đồng bán', icon: BookOpen },
  { to: '/phieu-giao-hang', label: 'Phiếu giao hàng', icon: Truck },
  { to: '/dong-tien', label: 'Dòng tiền', icon: Banknote },
  { to: '/cong-no', label: 'Công nợ', icon: Receipt },
  { to: '/hop-dong-mua', label: 'Hợp đồng mua', icon: BookMarked },
  { to: '/hoa-don-nhap', label: 'Hóa đơn nhập', icon: FileInput },
  { to: '/vat-tu', label: 'Vật tư', icon: Package },
  { to: '/phan-tich-dong-tien', label: 'Phân tích dòng tiền', icon: LineChart },
  { to: '/cai-dat', label: 'Cài đặt', icon: Settings, adminOnly: true },
];

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileNav({ open, onClose }: MobileNavProps) {
  const location = useLocation();
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const filteredItems = menuItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={onClose} />
          <div className="fixed left-0 top-0 bottom-0 w-72 bg-sidebar-bg animate-slide-in">
            <div className="flex items-center justify-between h-16 px-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">PG</span>
                </div>
                <h1 className="text-white font-semibold text-sm">Phạm Gia</h1>
              </div>
              <button onClick={onClose} className="text-sidebar-text hover:text-white">
                <X size={20} />
              </button>
            </div>

            <nav className="overflow-y-auto py-4 px-3 h-[calc(100%-4rem)] scrollbar-thin">
              <ul className="space-y-1">
                {filteredItems.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) => {
                        const active = isActive || ('match' in item && item.match?.(location.pathname));
                        return cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                          active
                            ? 'bg-sidebar-active text-sidebar-text-active'
                            : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white',
                        );
                      }}
                    >
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
