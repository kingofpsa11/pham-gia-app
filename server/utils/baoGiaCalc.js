export function applyVanChuyenToChiTiet(items, cheDoVanChuyen, phiVanChuyen) {
  const phi = Number(phiVanChuyen) || 0;
  const cheDo = Number(cheDoVanChuyen ?? 1);

  const tongChuaVC = items.reduce((s, r) => {
    const sl = Number(r.so_luong) || 0;
    const giaChua =
      Number(r.gia_ban_chua_van_chuyen) ||
      Number(r.gia_ban_thuc_te) ||
      0;
    return s + sl * giaChua;
  }, 0);

  return items.map((r) => {
    const sl = Number(r.so_luong) || 0;
    const giaChua =
      Number(r.gia_ban_chua_van_chuyen) ||
      Number(r.gia_ban_thuc_te) ||
      0;

    if (cheDo === 1 && phi > 0 && tongChuaVC > 0 && sl > 0) {
      const tyLe = (sl * giaChua) / tongChuaVC;
      const vcThanhTien = phi * tyLe;
      const vcDonGia = Math.round(vcThanhTien / sl / 1000) * 1000;
      return {
        ...r,
        chi_phi_van_chuyen_phan_bo: vcDonGia,
        gia_ban_thuc_te: giaChua + vcDonGia,
      };
    }

    return {
      ...r,
      chi_phi_van_chuyen_phan_bo: Number(r.chi_phi_van_chuyen_phan_bo) || 0,
      gia_ban_thuc_te: giaChua,
    };
  });
}

export function calcTongTruocVAT(chiTiet) {
  return chiTiet.reduce((sum, item) => {
    const sl = Number(item.so_luong) || 0;
    const gia = Number(item.gia_ban_thuc_te) || 0;
    return sum + sl * gia;
  }, 0);
}

export function calcTongVAT(chiTiet) {
  return chiTiet.reduce((sum, item) => {
    const sl = Number(item.so_luong) || 0;
    const gia = Number(item.gia_ban_thuc_te) || 0;
    const thue = Number(item.thue_suat) || 0;
    return sum + (sl * gia * thue) / 100;
  }, 0);
}

export function calcTongThanhToan(tongTruocVAT, tongVAT, phiVanChuyen) {
  return tongTruocVAT + tongVAT + (Number(phiVanChuyen) || 0);
}

export function calcTongThanhToanBaoGia(chiTiet, cheDoVanChuyen, phiVanChuyen) {
  const cheDo = Number(cheDoVanChuyen ?? 1);
  const phi = Number(phiVanChuyen) || 0;
  const withVC = applyVanChuyenToChiTiet(chiTiet, cheDo, phi);
  const calcItems = withVC.map((r) => ({
    so_luong: r.so_luong,
    gia_ban_thuc_te: r.gia_ban_thuc_te,
    thue_suat: r.thue_suat,
  }));
  const tongTruocVAT = calcTongTruocVAT(calcItems);
  const tongVAT = calcTongVAT(calcItems);
  const phiRieng = cheDo === 0 ? phi : 0;
  return calcTongThanhToan(tongTruocVAT, tongVAT, phiRieng);
}

/** Tổng thanh toán HĐ: tiền hàng theo giá HĐ + VAT + phí VC (chế độ riêng). */
export function calcTongThanhToanHopDong(chiTiet, cheDoVanChuyen, phiVanChuyen) {
  const cheDo = Number(cheDoVanChuyen ?? 0);
  const phi = Number(phiVanChuyen) || 0;
  const calcItems = (chiTiet || []).map((r) => ({
    so_luong: r.so_luong,
    gia_ban_thuc_te: Number(r.gia_hop_dong) || 0,
    thue_suat: r.thue_suat,
  }));
  const tongTruocVAT = calcTongTruocVAT(calcItems);
  const tongVAT = calcTongVAT(calcItems);
  const phiRieng = cheDo === 0 ? phi : 0;
  return calcTongThanhToan(tongTruocVAT, tongVAT, phiRieng);
}
