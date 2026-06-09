import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookMarked } from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import { DANH_MUC_TABS } from '../../lib/danhMucNav';
import { cn } from '../../lib/utils';

export default function DanhMucLayout() {
  const location = useLocation();
  const isAdmin = useAuthStore((s) => s.isAdmin());

  const visibleTabs = DANH_MUC_TABS.filter((tab) => !tab.adminOnly || isAdmin);

  if (!isAdmin && location.pathname.startsWith('/danh-muc/tai-khoan')) {
    return <Navigate to="/danh-muc/khach-hang" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
          <BookMarked className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Danh mục</h1>
          <p className="mt-1 text-sm text-gray-500">Khách hàng, nhà cung cấp và tài khoản</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex gap-0 overflow-x-auto px-2" aria-label="Danh mục">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                      (isActive || location.pathname.startsWith(tab.prefix))
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                    )
                  }
                  end={tab.to.endsWith('/nha-cung-cap') || tab.to.endsWith('/tai-khoan')}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {tab.label}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
