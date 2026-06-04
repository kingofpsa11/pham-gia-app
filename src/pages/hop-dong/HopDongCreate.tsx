import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import HopDongForm from './HopDongForm';

export default function HopDongCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromBaoGia = (location.state as any)?.fromBaoGia;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(fromBaoGia ? `/bao-gia/${fromBaoGia.bao_gia_id}` : '/hop-dong')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tạo hợp đồng mới</h1>
          {fromBaoGia ? (
            <p className="mt-0.5 text-sm text-blue-600">
              Chuyển từ báo giá <span className="font-semibold">{fromBaoGia.so_bao_gia}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-gray-500">Nhập thông tin và chi tiết sản phẩm hợp đồng</p>
          )}
        </div>
      </div>

      <HopDongForm
        mode="create"
        fromBaoGia={fromBaoGia}
        onSaved={(id) => navigate(`/hop-dong/${id}`)}
        onCancel={() => navigate(fromBaoGia ? `/bao-gia/${fromBaoGia.bao_gia_id}` : '/hop-dong')}
      />
    </div>
  );
}
