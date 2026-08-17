import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { hopDongApi, phieuGiaoHangApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { ArrowLeft } from 'lucide-react';
import { buildDaGiaoMapFromPhieuList } from '../../lib/hopDongGiaoHang';
import PhuLucForm from './PhuLucForm';
import type { HopDong, HopDongChiTiet, PhieuGiaoHang } from '../../types';

export default function PhuLucCreate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [hopDong, setHopDong] = useState<HopDong | null>(null);
  const [chiTiet, setChiTiet] = useState<HopDongChiTiet[]>([]);
  const [daGiaoMap, setDaGiaoMap] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const hdId = Number(id);
        const [hdRes, pghRes] = await Promise.all([
          hopDongApi.get(hdId),
          phieuGiaoHangApi.byHopDong(hdId),
        ]);
        if (!hdRes.data) {
          addToast('error', 'Không tìm thấy hợp đồng');
          navigate('/hop-dong');
          return;
        }
        setHopDong(hdRes.data as HopDong);
        setChiTiet((hdRes.data.chi_tiet || []) as HopDongChiTiet[]);
        setDaGiaoMap(buildDaGiaoMapFromPhieuList((pghRes.data || []) as PhieuGiaoHang[]));
      } catch {
        addToast('error', 'Không thể tải hợp đồng');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading || !hopDong) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/hop-dong/${hopDong.id}`)}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          title="Quay lại"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lập phụ lục hợp đồng</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {hopDong.so_hop_dong}
            {hopDong.ten_du_an ? ` — ${hopDong.ten_du_an}` : ''}
          </p>
        </div>
      </div>
      <PhuLucForm hopDong={hopDong} chiTiet={chiTiet} daGiaoMap={daGiaoMap} />
    </div>
  );
}
