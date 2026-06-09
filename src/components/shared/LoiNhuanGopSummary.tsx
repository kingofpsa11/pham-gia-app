import { formatVND } from '../../lib/utils';

interface LoiNhuanGopSummaryProps {
  tongGiaVonChuaVc: number;
  phiVanChuyen: number;
  giaBanChuaThue: number;
  loiNhuan: number;
  tyLeLai: number;
}

export default function LoiNhuanGopSummary({
  tongGiaVonChuaVc,
  phiVanChuyen,
  giaBanChuaThue,
  loiNhuan,
  tyLeLai,
}: LoiNhuanGopSummaryProps) {
  return (
    <div className="rounded-xl p-4 bg-green-50 border border-green-200">
      <div className="mb-2">
        <span className="text-xs font-bold text-green-800 uppercase tracking-wide">
          Lợi nhuận gộp dự kiến
        </span>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Tổng giá vốn chưa có vận chuyển:</span>
          <span className="font-medium text-red-600">
            {tongGiaVonChuaVc > 0 ? formatVND(tongGiaVonChuaVc) : <span className="text-red-400">0</span>}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Phí vận chuyển:</span>
          <span className="font-medium text-orange-700">
            {phiVanChuyen > 0 ? formatVND(phiVanChuyen) : <span className="text-gray-400">0</span>}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Giá bán chưa thuế:</span>
          <span className="font-medium text-gray-900">
            {giaBanChuaThue > 0 ? formatVND(giaBanChuaThue) : '0'}
          </span>
        </div>
        <div className="border-t border-green-200 pt-2 mt-2 flex justify-between items-center">
          <span className="font-bold text-green-800 uppercase text-xs tracking-wide">Lợi nhuận:</span>
          <span className={`text-lg font-bold ${loiNhuan >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatVND(loiNhuan)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Tỷ lệ lãi:</span>
          <span className={`font-semibold ${tyLeLai >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {tyLeLai}%
          </span>
        </div>
      </div>
    </div>
  );
}
