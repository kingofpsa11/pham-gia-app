import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  BookOpen,
  Truck,
  Banknote,
  Receipt,
  CircleDollarSign,
  Building2,
  BookMarked,
  FileInput,
  Package,
  BarChart3,
  CreditCard,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/auth';

const menuItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/khach-hang', label: 'Khách hàng', icon: Users },
  { to: '/bao-gia', label: 'Báo giá', icon: FileText },
  { to: '/hop-dong', label: 'Hợp đồng bán', icon: BookOpen },
  { to: '/phieu-giao-hang', label: 'Phiếu giao hàng', icon: Truck },
  { to: '/dong-tien', label: 'Dòng tiền', icon: Banknote },
  { to: '/cong-no', label: 'Công nợ', icon: Receipt },
  { to: '/chi-phi', label: 'Chi phí', icon: CircleDollarSign },
  { to: '/nha-cung-cap', label: 'Nhà cung cấp', icon: Building2 },
  { to: '/hop-dong-mua', label: 'Hợp đồng mua', icon: BookMarked },
  { to: '/hoa-don-nhap', label: 'Hóa đơn nhập', icon: FileInput },
  { to: '/vat-tu', label: 'Vật tư', icon: Package },
  { to: '/bao-cao', label: 'Báo cáo', icon: BarChart3 },
  { to: '/tai-khoan', label: 'Tài khoản', icon: CreditCard, adminOnly: true },
  { to: '/cai-dat', label: 'Cài đặt', icon: Settings, adminOnly: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const isAdmin = useAuthStore((s) => s.isAdmin());

  const filteredItems = menuItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  return (
    <aside
      className={cn(
        'hidden lg:flex lg:flex-col h-screen fixed left-0 top-0 z-30 bg-sidebar-bg transition-all duration-300 ease-in-out',
        collapsed ? 'lg:w-16' : 'lg:w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-3 border-b border-slate-700 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">PG</span>
          </div>
          <div
            className={cn(
              'transition-all duration-300 overflow-hidden',
              collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            )}
          >
            <h1 className="text-white font-semibold text-sm leading-tight whitespace-nowrap">Phạm Gia</h1>
            <p className="text-sidebar-text text-xs whitespace-nowrap">Quản lý kinh doanh</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-2">
        <ul className="space-y-1">
          {filteredItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                    collapsed ? 'justify-center' : '',
                    isActive
                      ? 'bg-sidebar-active text-sidebar-text-active'
                      : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
                  )
                }
              >
                <item.icon size={18} className="flex-shrink-0" />
                <span
                  className={cn(
                    'transition-all duration-300 overflow-hidden whitespace-nowrap',
                    collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
                  )}
                >
                  {item.label}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer + toggle */}
      <div className="px-2 py-3 border-t border-slate-700 flex flex-col gap-2">
        {!collapsed && (
          <p className="text-sidebar-text text-xs text-center">v1.0.0</p>
        )}
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full py-1.5 rounded-lg text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors"
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
