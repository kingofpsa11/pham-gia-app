import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import HopDongMuaForm from './HopDongMuaForm';

export default function HopDongMuaCreate() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/hop-dong-mua')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tạo hợp đồng mua mới</h1>
          <p className="mt-0.5 text-sm text-gray-500">Nhập thông tin và chi tiết sản phẩm hợp đồng mua</p>
        </div>
      </div>

      <HopDongMuaForm
        mode="create"
        onSaved={(id) => navigate(`/hop-dong-mua/${id}`)}
        onCancel={() => navigate('/hop-dong-mua')}
      />
    </div>
  );
}
