import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/shared/ProtectedRoute';
import LoginPage from './pages/login/LoginPage';

import DashboardPage from './pages/dashboard/DashboardPage';
import KhachHangList from './pages/khach-hang/KhachHangList';
import KhachHangDetail from './pages/khach-hang/KhachHangDetail';
import BaoGiaList from './pages/bao-gia/BaoGiaList';
import BaoGiaCreate from './pages/bao-gia/BaoGiaCreate';
import BaoGiaDetail from './pages/bao-gia/BaoGiaDetail';
import HopDongList from './pages/hop-dong/HopDongList';
import HopDongCreate from './pages/hop-dong/HopDongCreate';
import HopDongDetail from './pages/hop-dong/HopDongDetail';
import PhieuGiaoHangList from './pages/phieu-giao-hang/PhieuGiaoHangList';
import PhieuGiaoHangDetail from './pages/phieu-giao-hang/PhieuGiaoHangDetail';
import DongTienMoiList from './pages/dong-tien/DongTienMoiList';
import CongNoPage from './pages/cong-no/CongNoPage';
import ChiPhiPage from './pages/chi-phi/ChiPhiPage';
import NhaCungCapList from './pages/nha-cung-cap/NhaCungCapList';
import HopDongMuaList from './pages/hop-dong-mua/HopDongMuaList';
import HopDongMuaCreate from './pages/hop-dong-mua/HopDongMuaCreate';
import HopDongMuaDetail from './pages/hop-dong-mua/HopDongMuaDetail';
import HoaDonNhapList from './pages/hoa-don-nhap/HoaDonNhapList';
import VatTuList from './pages/vat-tu/VatTuList';
import BaoCaoPage from './pages/bao-cao/BaoCaoPage';
import TaiKhoanList from './pages/tai-khoan/TaiKhoanList';
import CaiDatPage from './pages/cai-dat/CaiDatPage';

function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/khach-hang" element={<KhachHangList />} />
            <Route path="/khach-hang/:id" element={<KhachHangDetail />} />
            <Route path="/bao-gia" element={<BaoGiaList />} />
            <Route path="/bao-gia/tao-moi" element={<BaoGiaCreate />} />
            <Route path="/bao-gia/:id" element={<BaoGiaDetail />} />
            <Route path="/hop-dong" element={<HopDongList />} />
            <Route path="/hop-dong/tao-moi" element={<HopDongCreate />} />
            <Route path="/hop-dong/:id" element={<HopDongDetail />} />
            <Route path="/phieu-giao-hang" element={<PhieuGiaoHangList />} />
            <Route path="/phieu-giao-hang/:id" element={<PhieuGiaoHangDetail />} />
            <Route path="/dong-tien" element={<DongTienMoiList />} />
            <Route path="/dong-tien-moi" element={<DongTienMoiList />} />
            <Route path="/cong-no" element={<CongNoPage />} />
            <Route path="/chi-phi" element={<ChiPhiPage />} />
            <Route path="/nha-cung-cap" element={<NhaCungCapList />} />
            <Route path="/hop-dong-mua" element={<HopDongMuaList />} />
            <Route path="/hop-dong-mua/tao-moi" element={<HopDongMuaCreate />} />
            <Route path="/hop-dong-mua/:id" element={<HopDongMuaDetail />} />
            <Route path="/hoa-don-nhap" element={<HoaDonNhapList />} />
            <Route path="/vat-tu" element={<VatTuList />} />
            <Route path="/bao-cao" element={<BaoCaoPage />} />
            <Route path="/tai-khoan" element={<TaiKhoanList />} />
            <Route path="/cai-dat" element={<CaiDatPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
