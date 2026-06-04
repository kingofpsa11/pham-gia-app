import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import BaoGiaForm from './BaoGiaForm';

export default function BaoGiaCreate() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/bao-gia')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
            <Plus className="w-3.5 h-3.5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-blue-700 uppercase tracking-wide">Tạo báo giá mới</h1>
        </div>
      </div>

      <BaoGiaForm
        mode="create"
        onSaved={(id) => navigate(`/bao-gia/${id}`)}
        onCancel={() => navigate('/bao-gia')}
      />
    </div>
  );
}
