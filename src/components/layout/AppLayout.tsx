import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNav from './MobileNav';
import Toast from '../ui/Toast';
import { cn } from '../../lib/utils';

export default function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className={cn('transition-all duration-300 ease-in-out', sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <Header onMenuToggle={() => setMobileNavOpen(true)} />
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <Toast />
    </div>
  );
}
