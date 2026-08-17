import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { phuLucHopDongApi } from '../../lib/api';
import { useToastStore } from '../../store/toast';
import { formatNumber, formatVND, todayVN, vnToISO } from '../../lib/utils';
import NumInput from '../../components/ui/NumInput';
import VnDateInput from '../../components/ui/VnDateInput';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { HopDong, HopDongChiTiet } from '../../types';

interface ExistingRow {
  key: string;
  hop_dong_chi_tiet_id: number;
  ten_san_pham: string;
  don_vi: string;
  so_luong_cu: number;
  da_giao: number;
  so_luong_thay_doi: number;
  gia_hop_dong: number;
  gia_ban_thuc_te: number;
  don_gia_von: number;
  thue_suat: number;
  chenh_lech_phan_tram: number;
}

interface NewRow {
  key: string;
  ten_san_pham: string;
  don_vi: string;
  so_luong_thay_doi: number;
  gia_hop_dong: number;
  don_gia_von: number;
  thue_suat: number;
}

function lineGiaTri(sl: number, gia: number, thue: number) {
  const base = sl * gia;
  return base + (base * (Number(thue) || 0)) / 100;
}

export default function PhuLucForm({
  hopDong,
  chiTiet,
  daGiaoMap,
}: {
  hopDong: HopDong;
  chiTiet: HopDongChiTiet[];
  daGiaoMap: Record<number, number>;
}) {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [ngayKy, setNgayKy] = useState(todayVN());
  const [lyDo, setLyDo] = useState('');
  const [saving, setSaving] = useState(false);

  const [existing, setExisting] = useState<ExistingRow[]>(() =>
    chiTiet.filter((ct) => ct.id).map((ct) => ({
      key: `hdct-${ct.id}`,
      hop_dong_chi_tiet_id: Number(ct.id),
      ten_san_pham: ct.ten_san_pham,
      don_vi: ct.don_vi || '',
      so_luong_cu: Number(ct.so_luong) || 0,
      da_giao: daGiaoMap[Number(ct.id)] || 0,
      so_luong_thay_doi: 0,
      gia_hop_dong: Number(ct.gia_hop_dong) || 0,
      gia_ban_thuc_te: Number(ct.gia_ban_thuc_te) || 0,
      don_gia_von: Number(ct.don_gia_von) || 0,
      thue_suat: Number(ct.thue_suat) || 10,
      chenh_lech_phan_tram: Number(ct.chenh_lech_phan_tram) || 0,
    })),
  );
  const [news, setNews] = useState<NewRow[]>([]);

  function updateExisting(key: string, delta: number) {
    setExisting((rows) => rows.map((r) => (r.key === key ? { ...r, so_luong_thay_doi: delta } : r)));
  }

  function updateNew(key: string, patch: Partial<NewRow>) {
    setNews((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addNewRow() {
    setNews((rows) => [
      ...rows,
      {
        key: crypto.randomUUID(),
        ten_san_pham: '',
        don_vi: '',
        so_luong_thay_doi: 0,
        gia_hop_dong: 0,
        don_gia_von: 0,
        thue_suat: 10,
      },
    ]);
  }

  const changedExisting = existing.filter((r) => r.so_luong_thay_doi !== 0);
  const validNews = news.filter((r) => r.ten_san_pham.trim() && r.so_luong_thay_doi > 0);

  const giaTriPhuLuc = useMemo(() => {
    const fromOld = changedExisting.reduce(
      (s, r) => s + lineGiaTri(r.so_luong_thay_doi, r.gia_hop_dong, r.thue_suat),
      0,
    );
    const fromNew = validNews.reduce(
      (s, r) => s + lineGiaTri(r.so_luong_thay_doi, r.gia_hop_dong, r.thue_suat),
      0,
    );
    return fromOld + fromNew;
  }, [changedExisting, validNews]);

  const giaTriHdTruoc = useMemo(
    () => chiTiet.reduce((s, ct) => s + lineGiaTri(Number(ct.so_luong) || 0, Number(ct.gia_hop_dong) || 0, Number(ct.thue_suat) || 0), 0)
      + (Number(hopDong.che_do_van_chuyen ?? 0) === 0 ? Number(hopDong.phi_van_chuyen) || 0 : 0),
    [chiTiet, hopDong],
  );

  async function handleSave() {
    for (const r of changedExisting) {
      const moi = r.so_luong_cu + r.so_luong_thay_doi;
      if (moi < 0) {
        addToast('warning', `"${r.ten_san_pham}": số lượng mới không được âm`);
        return;
      }
      if (moi < r.da_giao) {
        addToast('warning', `"${r.ten_san_pham}": không giảm dưới số đã giao (${formatNumber(r.da_giao, 2)})`);
        return;
      }
    }
    if (changedExisting.length === 0 && validNews.length === 0) {
      addToast('warning', 'Nhập số lượng thay đổi hoặc thêm hàng mới');
      return;
    }

    setSaving(true);
    try {
      const chi_tiet = [
        ...changedExisting.map((r) => ({
          hop_dong_chi_tiet_id: r.hop_dong_chi_tiet_id,
          so_luong_thay_doi: r.so_luong_thay_doi,
        })),
        ...validNews.map((r) => ({
          ten_san_pham: r.ten_san_pham.trim(),
          don_vi: r.don_vi.trim(),
          so_luong_thay_doi: r.so_luong_thay_doi,
          gia_hop_dong: r.gia_hop_dong,
          gia_ban_thuc_te: r.gia_hop_dong,
          don_gia_von: r.don_gia_von,
          thue_suat: r.thue_suat,
        })),
      ];
      const res = await phuLucHopDongApi.create(hopDong.id, {
        ngay_ky: vnToISO(ngayKy),
        ly_do: lyDo.trim(),
        chi_tiet,
      });
      addToast('success', `Đã lập PLHĐ ${res.data?.so_phu_luc || ''} và cập nhật khối lượng hợp đồng`);
      navigate(`/hop-dong/${hopDong.id}/phu-luc/${res.data.id}`);
    } catch (err: unknown) {
      addToast('error', err instanceof Error ? err.message : 'Không thể tạo phụ lục');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Thông tin phụ lục</h2>
        </div>
        <div className="card-body grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày ký</label>
            <VnDateInput value={ngayKy} onChange={setNgayKy} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Căn cứ / lý do điều chỉnh</label>
            <input
              className="input-field w-full"
              value={lyDo}
              onChange={(e) => setLyDo(e.target.value)}
              placeholder="VD: Căn cứ nhu cầu bổ sung thiết bị của bên mua"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Điều chỉnh khối lượng hàng hiện có</h2>
          <p className="text-xs text-gray-500 mt-0.5">Số dương = tăng, số âm = giảm. Không giảm dưới số đã giao.</p>
        </div>
        <div className="card-body p-0 overflow-x-auto">
          {existing.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">Hợp đồng chưa có dòng hàng</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sản phẩm</th>
                  <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 w-16">ĐV</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-gray-500 w-24">SL HĐ</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-orange-600 w-24">Đã giao</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-blue-600 w-28">SL +/-</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-gray-500 w-24">SL mới</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-gray-500 w-32">Giá HĐ</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-gray-500 w-36">Giá trị PL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {existing.map((r) => {
                  const moi = r.so_luong_cu + r.so_luong_thay_doi;
                  const invalid = moi < r.da_giao || moi < 0;
                  const plVal = lineGiaTri(r.so_luong_thay_doi, r.gia_hop_dong, r.thue_suat);
                  return (
                    <tr key={r.key} className={r.so_luong_thay_doi !== 0 ? 'bg-blue-50/40' : ''}>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.ten_san_pham}</td>
                      <td className="px-2 py-2 text-center text-gray-500">{r.don_vi}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(r.so_luong_cu, 2)}</td>
                      <td className="px-2 py-2 text-right text-orange-600">{formatNumber(r.da_giao, 2)}</td>
                      <td className="px-2 py-2">
                        <NumInput
                          value={r.so_luong_thay_doi}
                          onChange={(v) => updateExisting(r.key, v)}
                          min={-(r.so_luong_cu)}
                          className="w-full px-2 py-1 text-sm text-right border border-blue-300 bg-white rounded focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className={`px-2 py-2 text-right font-semibold ${invalid ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatNumber(moi, 2)}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-600">{formatVND(r.gia_hop_dong)}</td>
                      <td className={`px-2 py-2 text-right font-medium ${plVal >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                        {r.so_luong_thay_doi === 0 ? '—' : formatVND(plVal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Thêm hàng mới</h2>
            <p className="text-xs text-gray-500 mt-0.5">Dòng chưa có trên hợp đồng gốc</p>
          </div>
          <button type="button" className="btn-secondary flex items-center gap-1.5 text-sm" onClick={addNewRow}>
            <Plus className="w-4 h-4" /> Thêm dòng
          </button>
        </div>
        <div className="card-body p-0 overflow-x-auto">
          {news.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-500">Chưa thêm hàng mới</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Tên sản phẩm</th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-500 w-20">ĐV</th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-500 w-24">SL tăng</th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-500 w-32">Giá HĐ</th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-500 w-20">Thuế %</th>
                  <th className="px-2 py-2 text-xs font-semibold text-gray-500 w-32">Giá trị PL</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {news.map((r) => (
                  <tr key={r.key}>
                    <td className="px-3 py-1.5">
                      <input
                        className="w-full px-2 py-1 border border-gray-200 rounded"
                        value={r.ten_san_pham}
                        onChange={(e) => updateNew(r.key, { ten_san_pham: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className="w-full px-2 py-1 border border-gray-200 rounded"
                        value={r.don_vi}
                        onChange={(e) => updateNew(r.key, { don_vi: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumInput
                        value={r.so_luong_thay_doi}
                        onChange={(v) => updateNew(r.key, { so_luong_thay_doi: v })}
                        min={0}
                        className="w-full px-2 py-1 text-right border border-gray-200 rounded"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumInput
                        value={r.gia_hop_dong}
                        onChange={(v) => updateNew(r.key, { gia_hop_dong: v })}
                        min={0}
                        format="money"
                        className="w-full px-2 py-1 text-right border border-gray-200 rounded"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumInput
                        value={r.thue_suat}
                        onChange={(v) => updateNew(r.key, { thue_suat: v })}
                        min={0}
                        className="w-full px-2 py-1 text-right border border-gray-200 rounded"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium">
                      {formatVND(lineGiaTri(r.so_luong_thay_doi, r.gia_hop_dong, r.thue_suat))}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        className="p-1 text-gray-300 hover:text-red-500"
                        onClick={() => setNews((rows) => rows.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Giá trị hợp đồng hiện tại</span>
            <span className="font-semibold">{formatVND(giaTriHdTruoc)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Giá trị phụ lục (sau thuế)</span>
            <span className={`font-semibold ${giaTriPhuLuc >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
              {formatVND(giaTriPhuLuc)}
            </span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-2">
            <span className="font-semibold text-gray-900">Giá trị HĐ sau phụ lục</span>
            <span className="text-lg font-bold text-primary-600">{formatVND(giaTriHdTruoc + giaTriPhuLuc)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => navigate(`/hop-dong/${hopDong.id}`)} disabled={saving}>
          Hủy
        </button>
        <button type="button" className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4" />
          {saving ? 'Đang lưu...' : 'Lập phụ lục và cập nhật HĐ'}
        </button>
      </div>
    </div>
  );
}
