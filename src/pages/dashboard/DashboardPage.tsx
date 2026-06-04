import { useState, useEffect } from 'react';
import { dashboardApi } from '../../lib/api';
import { formatVND, formatDate, formatNumber } from '../../lib/utils';
import { useAuthStore } from '../../store/auth';
import {
  FileText,
  BookOpen,
  Banknote,
  Receipt,
  CircleDollarSign,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import type { DashboardStats } from '../../types';

interface StatCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'green' | 'red' | 'blue';
}

const colorMap = {
  green: {
    bg: 'bg-emerald-50',
    icon: 'bg-emerald-100 text-emerald-600',
    value: 'text-emerald-700',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'bg-red-100 text-red-600',
    value: 'text-red-700',
  },
  blue: {
    bg: 'bg-blue-50',
    icon: 'bg-blue-100 text-blue-600',
    value: 'text-blue-700',
  },
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const result = await dashboardApi.stats();
      setStats({
        tong_bao_gia_thang: result.tong_bao_gia_thang,
        tong_gia_tri_bao_gia_thang: 0,
        so_bao_gia_chuyen_hop_dong: 0,
        tong_hop_dong_hieu_luc: result.tong_hop_dong_hieu_luc,
        tong_gia_tri_hop_dong: 0,
        tong_tien_da_thu: result.tong_tien_da_thu,
        tong_tien_da_chi: result.tong_tien_da_chi,
        so_du_tai_khoan: result.so_du_tai_khoan,
        cong_no_phai_thu: result.cong_no_phai_thu,
        cong_no_phai_tra: 0,
        tong_chi_phi_thang: result.tong_chi_phi_thang,
        top_khach_hang: [],
        top_chi_phi: [],
        hop_dong_moi_nhat: result.hop_dong_moi_nhat || [],
        dong_tien_moi_nhat: result.dong_tien_moi_nhat || [],
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const statCards: StatCard[] = [
    {
      label: 'Tổng báo giá tháng',
      value: formatNumber(stats.tong_bao_gia_thang),
      icon: <FileText size={20} />,
      color: 'blue',
    },
    {
      label: 'Tổng giá trị báo giá tháng',
      value: formatVND(stats.tong_gia_tri_bao_gia_thang),
      icon: <BookOpen size={20} />,
      color: 'blue',
    },
    {
      label: 'Hợp đồng hiệu lực',
      value: formatNumber(stats.tong_hop_dong_hieu_luc),
      icon: <Receipt size={20} />,
      color: 'blue',
    },
    {
      label: 'Tổng giá trị hợp đồng',
      value: formatVND(stats.tong_gia_tri_hop_dong),
      icon: <Banknote size={20} />,
      color: 'blue',
    },
    {
      label: 'Tổng tiền đã thu',
      value: formatVND(stats.tong_tien_da_thu),
      icon: <ArrowUpRight size={20} />,
      color: 'green',
    },
    {
      label: 'Tổng tiền đã chi',
      value: formatVND(stats.tong_tien_da_chi),
      icon: <ArrowDownRight size={20} />,
      color: 'red',
    },
    {
      label: 'Công nợ phải thu',
      value: formatVND(stats.cong_no_phai_thu),
      icon: <CircleDollarSign size={20} />,
      color: 'green',
    },
    {
      label: 'Tổng chi phí tháng',
      value: formatVND(stats.tong_chi_phi_thang),
      icon: <CreditCard size={20} />,
      color: 'red',
    },
  ];

  function trangThaiLabel(value: string): string {
    switch (value) {
      case 'Hieu luc':
        return 'Hiệu lực';
      case 'Thanh ly':
        return 'Thanh lý';
      case 'Huy':
        return 'Hủy';
      default:
        return value;
    }
  }

  function trangThaiBadgeClass(value: string): string {
    switch (value) {
      case 'Hieu luc':
        return 'badge-success';
      case 'Thanh ly':
        return 'badge-warning';
      case 'Huy':
        return 'badge-error';
      default:
        return 'badge-info';
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {user?.ten ? `Xin chào, ${user.ten}` : 'Tổng quan'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Quản lý kinh doanh Phạm Gia - Thống kê và tình hình kinh doanh
        </p>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const colors = colorMap[card.color];
          return (
            <div
              key={card.label}
              className={`card ${colors.bg} border-0`}
            >
              <div className="card-body flex items-start gap-4">
                <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${colors.icon}`}>
                  {card.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 truncate">
                    {card.label}
                  </p>
                  <p className={`mt-1 text-xl font-bold ${colors.value} truncate`}>
                    {card.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Account Balances */}
      {stats.so_du_tai_khoan.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CreditCard size={20} className="text-primary-600" />
              Số dư tài khoản
            </h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.so_du_tai_khoan.map((tk) => (
                <div
                  key={tk.tai_khoan_id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tk.ten_tai_khoan}</p>
                  </div>
                  <p
                    className={`text-sm font-bold ${
                      tk.so_du >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {formatVND(tk.so_du)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Hop Dong */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Receipt size={20} className="text-primary-600" />
              Hợp đồng mới nhất
            </h2>
          </div>
          <div className="card-body p-0">
            {stats.hop_dong_moi_nhat.length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-500">Chưa có hợp đồng nào</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {stats.hop_dong_moi_nhat.map((hd) => (
                  <div
                    key={hd.id}
                    className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {hd.so_hop_dong}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {hd.ten_du_an || (hd as any).khach_hang?.ten_cong_ty || '--'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <span className={trangThaiBadgeClass(hd.trang_thai)}>
                        {trangThaiLabel(hd.trang_thai)}
                      </span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(hd.ngay_hop_dong)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Dong Tien */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Banknote size={20} className="text-primary-600" />
              Dòng tiền mới nhất
            </h2>
          </div>
          <div className="card-body p-0">
            {stats.dong_tien_moi_nhat.length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-500">Chưa có giao dịch nào</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {stats.dong_tien_moi_nhat.map((dt) => (
                  <div
                    key={dt.id}
                    className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {dt.mo_ta_giao_dich}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {(dt as any).tai_khoan?.ten_tai_khoan || '--'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      {dt.ghi_no > 0 ? (
                        <span className="text-sm font-semibold text-emerald-600 whitespace-nowrap">
                          +{formatVND(dt.ghi_no)}
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-red-600 whitespace-nowrap">
                          -{formatVND(dt.ghi_co)}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(dt.ngay_gio_giao_dich)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
