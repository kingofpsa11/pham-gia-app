import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import mysql from "npm:mysql2@3.9.4";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MYSQL_CONFIG = {
  host: "194.59.164.103",
  port: 3306,
  user: "u169101909_phamgia",
  password: "Minhtu@23",
  database: "u169101909_phamgia",
};

const GOOGLE_CLIENT_ID = "463347043107-54jf3pf1gm3oqq8h393ratk6jji8rprn.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

let pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!pool) pool = mysql.createPool({ ...MYSQL_CONFIG, waitForConnections: true, connectionLimit: 5 });
  return pool;
}
function queryOne(sql: string, params?: any[]): Promise<any | null> {
  return new Promise((res, rej) =>
    getPool().query(sql, params, (e: any, r: any) => e ? rej(e) : res(Array.isArray(r) ? r[0] || null : null))
  );
}
function queryAll(sql: string, params?: any[]): Promise<any[]> {
  return new Promise((res, rej) =>
    getPool().query(sql, params, (e: any, r: any) => e ? rej(e) : res(Array.isArray(r) ? r : []))
  );
}

function fmtDate(d: any): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n || 0));
}

function escXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseSharedStrings(xml: string): string[] {
  const result: string[] = [];
  let pos = 0;
  while (true) {
    const s = xml.indexOf("<si>", pos);
    if (s === -1) break;
    const e = xml.indexOf("</si>", s);
    if (e === -1) break;
    const block = xml.slice(s + 4, e);
    const texts: string[] = [];
    let tp = 0;
    while (true) {
      const ts = block.indexOf("<t", tp);
      if (ts === -1) break;
      const te = block.indexOf("</t>", ts);
      if (te === -1) break;
      const tagEnd = block.indexOf(">", ts);
      if (tagEnd === -1 || tagEnd > te) break;
      texts.push(block.slice(tagEnd + 1, te));
      tp = te + 4;
    }
    result.push(decodeXml(texts.join("")));
    pos = e + 5;
  }
  return result;
}

function buildSiXml(text: string): string {
  const needsSpace = text.startsWith(" ") || text.endsWith(" ");
  const attr = needsSpace ? ' xml:space="preserve"' : "";
  return `<si><t${attr}>${escXml(text)}</t></si>`;
}

function rebuildSharedStrings(origXml: string, newTexts: string[]): string {
  const sstStart = origXml.indexOf("<sst");
  const sstBodyStart = origXml.indexOf(">", sstStart) + 1;
  const sstEnd = origXml.lastIndexOf("</sst>");
  if (sstStart === -1 || sstEnd === -1) return origXml;
  const tag = origXml.slice(sstStart, sstBodyStart)
    .replace(/count="[^"]*"/, `count="${newTexts.length}"`)
    .replace(/uniqueCount="[^"]*"/, `uniqueCount="${newTexts.length}"`);
  return origXml.slice(0, sstStart) + tag + newTexts.map(buildSiXml).join("") + origXml.slice(sstEnd);
}

interface RowInfo { rowNum: number; start: number; end: number; xml: string; }
interface CellInfo {
  col: string; rowNum: number; type: string; styleIdx: string;
  value: string; start: number; end: number; fullXml: string;
}

function parseRows(xml: string): RowInfo[] {
  const rows: RowInfo[] = [];
  let pos = 0;
  while (true) {
    const s = xml.indexOf("<row ", pos);
    if (s === -1) break;
    const e = xml.indexOf("</row>", s);
    if (e === -1) break;
    const fullEnd = e + 6;
    const rowXml = xml.slice(s, fullEnd);
    const m = rowXml.match(/\br="(\d+)"/);
    if (m) rows.push({ rowNum: parseInt(m[1]), start: s, end: fullEnd, xml: rowXml });
    pos = fullEnd;
  }
  return rows;
}

function parseCells(rowXml: string): CellInfo[] {
  const cells: CellInfo[] = [];
  let pos = 0;
  while (true) {
    const cStart = rowXml.indexOf("<c ", pos);
    if (cStart === -1) break;
    const selfClose = rowXml.indexOf("/>", cStart);
    const fullClose = rowXml.indexOf("</c>", cStart);
    let cEnd: number;
    if (selfClose !== -1 && (fullClose === -1 || selfClose < fullClose)) {
      cEnd = selfClose + 2;
    } else if (fullClose !== -1) {
      cEnd = fullClose + 4;
    } else {
      break;
    }
    const fullXml = rowXml.slice(cStart, cEnd);
    const refM   = fullXml.match(/\br="([A-Z]+)(\d+)"/);
    if (refM) {
      cells.push({
        col:      refM[1],
        rowNum:   parseInt(refM[2]),
        type:     (fullXml.match(/\bt="([^"]*)"/) || [])[1] || "",
        styleIdx: (fullXml.match(/\bs="(\d+)"/)   || [])[1] || "",
        value:    (fullXml.match(/<v>([^<]*)<\/v>/) || [])[1] || "",
        start: cStart, end: cEnd, fullXml,
      });
    }
    pos = cEnd;
  }
  return cells;
}

function buildItemRow(
  templateXml: string,
  newRowNum: number,
  ssReplace: Record<string, number>,
  numericReplace: Record<string, number>,
): string {
  const cells     = parseCells(templateXml);
  const openTagEnd = templateXml.indexOf(">") + 1;
  const newOpenTag = templateXml.slice(0, openTagEnd).replace(/\br="(\d+)"/, `r="${newRowNum}"`);
  const parts: string[] = [];
  let cursor = openTagEnd;

  for (const cell of cells) {
    if (cell.start > cursor) parts.push(templateXml.slice(cursor, cell.start));
    cursor = cell.end;
    const newRef = cell.col + newRowNum;
    const s = cell.styleIdx ? ` s="${cell.styleIdx}"` : "";
    if (numericReplace[cell.col] !== undefined) {
      parts.push(`<c r="${newRef}"${s}><v>${numericReplace[cell.col]}</v></c>`);
    } else if (ssReplace[cell.col] !== undefined) {
      parts.push(`<c r="${newRef}"${s} t="s"><v>${ssReplace[cell.col]}</v></c>`);
    } else {
      parts.push(cell.fullXml.replace(/\br="[A-Z]+\d+"/, `r="${newRef}"`));
    }
  }
  if (cursor < templateXml.length) parts.push(templateXml.slice(cursor));
  return newOpenTag + parts.join("");
}

function shiftAllRowNums(xml: string, delta: number): string {
  if (delta <= 0) return xml;
  const rows = parseRows(xml);
  if (rows.length === 0) return xml;
  const out: string[] = [];
  let pos = 0;
  for (const row of rows) {
    out.push(xml.slice(pos, row.start));
    pos = row.end;
    const newRowNum  = row.rowNum + delta;
    const cells      = parseCells(row.xml);
    const openTagEnd = row.xml.indexOf(">") + 1;
    const newOpenTag = row.xml.slice(0, openTagEnd).replace(/\br="(\d+)"/, `r="${newRowNum}"`);
    const parts: string[] = [];
    let cur = openTagEnd;
    for (const cell of cells) {
      if (cell.start > cur) parts.push(row.xml.slice(cur, cell.start));
      cur = cell.end;
      parts.push(cell.fullXml.replace(/\br="[A-Z]+\d+"/, `r="${cell.col}${newRowNum}"`));
    }
    if (cur < row.xml.length) parts.push(row.xml.slice(cur));
    out.push(newOpenTag + parts.join(""));
  }
  out.push(xml.slice(pos));
  return out.join("");
}

function shiftMerges(xml: string, afterRow: number, delta: number): string {
  if (delta <= 0) return xml;
  return xml.replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g,
    (_: string, c1: string, r1s: string, c2: string, r2s: string) => {
      const r1 = parseInt(r1s), r2 = parseInt(r2s);
      return `<mergeCell ref="${c1}${r1 > afterRow ? r1 + delta : r1}:${c2}${r2 > afterRow ? r2 + delta : r2}"/>`;
    }
  );
}

function upsertSsCellInRow(sheetXml: string, rowNum: number, col: string, ssIdx: number, styleIdx: string): string {
  const rows = parseRows(sheetXml);
  const row  = rows.find(r => r.rowNum === rowNum);
  if (!row) return sheetXml;
  const cells    = parseCells(row.xml);
  const existing = cells.find(c => c.col === col);
  const s        = styleIdx ? ` s="${styleIdx}"` : "";
  const newCell  = `<c r="${col}${rowNum}"${s} t="s"><v>${ssIdx}</v></c>`;
  let newRowXml: string;
  if (existing) {
    newRowXml = row.xml.slice(0, existing.start) + newCell + row.xml.slice(existing.end);
  } else {
    const closeTag = row.xml.lastIndexOf("</row>");
    newRowXml = row.xml.slice(0, closeTag) + newCell + row.xml.slice(closeTag);
  }
  return sheetXml.slice(0, row.start) + newRowXml + sheetXml.slice(row.end);
}

// ---- Google Drive helpers ----

async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!data.access_token) return null;
  return data;
}

async function uploadToDrive(
  accessToken: string,
  fileName: string,
  fileBytes: Uint8Array,
  folderId?: string,
): Promise<{ id: string; webViewLink: string } | null> {
  const metadata: Record<string, any> = {
    name: fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  if (folderId) metadata.parents = [folderId];

  const boundary = "-------phamgia_boundary";
  const metaJson = JSON.stringify(metadata);
  const encoder = new TextEncoder();

  const parts: Uint8Array[] = [
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
    ),
    fileBytes,
    encoder.encode(`\r\n--${boundary}--`),
  ];

  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const body = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) { body.set(p, offset); offset += p.length; }

  const uploadResp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(totalLen),
      },
      body,
    }
  );

  if (!uploadResp.ok) return null;
  return await uploadResp.json();
}

// ---- Main handler ----

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json();
    const { bao_gia_id, mau_key } = body as { bao_gia_id: number; mau_key: string };
    if (!bao_gia_id || !mau_key) {
      return new Response(JSON.stringify({ error: "Thiếu bao_gia_id hoặc mau_key" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get calling user for Drive token lookup
    const authHeader = req.headers.get("Authorization") || "";
    const userToken = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    if (userToken) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: { user } } = await userClient.auth.getUser(userToken);
      userId = user?.id || null;
    }

    const { data: cauHinh } = await supabase
      .from("cau_hinh").select("value").eq("key", mau_key).maybeSingle();
    if (!cauHinh?.value) {
      return new Response(JSON.stringify({ error: `Không tìm thấy mẫu (key: ${mau_key})` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { url: templateUrl } = JSON.parse(cauHinh.value) as { name: string; url: string };

    const bgData = await queryOne(
      `SELECT bg.*, kh.ten_cong_ty
       FROM bao_gia bg LEFT JOIN khach_hang kh ON bg.khach_hang_id = kh.id WHERE bg.id = ?`,
      [bao_gia_id]
    );
    if (!bgData) {
      return new Response(JSON.stringify({ error: `Không tìm thấy báo giá id=${bao_gia_id}` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items: any[] = await queryAll(
      "SELECT * FROM bao_gia_chi_tiet WHERE bao_gia_id = ? ORDER BY id",
      [bao_gia_id]
    );

    const cheDoVC  = Number(bgData.che_do_van_chuyen ?? 1);
    const phiVC    = Number(bgData.phi_van_chuyen || 0);

    // Tính giá bán thực tế xuất ra Excel (chỉ tính VC khi mode=1: phân bổ vào giá bán)
    const itemsWithGia = items.map((item) => {
      const giaCoBan = Number(item.gia_ban_co_ban) || Number(item.gia_ban_thuc_te) || 0;
      return { ...item, _gia_co_ban: giaCoBan };
    });

    const tongCoBan = itemsWithGia.reduce((s, i) => s + Number(i.so_luong) * i._gia_co_ban, 0);

    const itemsWithGiaBan = itemsWithGia.map((item) => {
      const giaCoBan = item._gia_co_ban;
      if (cheDoVC === 1 && phiVC > 0 && tongCoBan > 0 && Number(item.so_luong) > 0) {
        const tyLe     = (Number(item.so_luong) * giaCoBan) / tongCoBan;
        const vcDonGia = Math.round((phiVC * tyLe) / Number(item.so_luong) / 1000) * 1000;
        return { ...item, _gia_xuat: giaCoBan + vcDonGia };
      }
      return { ...item, _gia_xuat: giaCoBan };
    });

    // Tính tổng dựa trên giá xuất thực tế
    const tongTruocVAT = itemsWithGiaBan.reduce((s, i) => s + Number(i.so_luong) * i._gia_xuat, 0);
    const vat10 = itemsWithGiaBan.filter(i => Number(i.thue_suat) === 10)
      .reduce((s, i) => s + Number(i.so_luong) * i._gia_xuat * 0.1, 0);
    const vat8 = itemsWithGiaBan.filter(i => Number(i.thue_suat) === 8)
      .reduce((s, i) => s + Number(i.so_luong) * i._gia_xuat * 0.08, 0);
    // mode=0 (Riêng): cộng phí VC vào tổng TT; mode=1/2: VC đã tính trong giá/vốn
    const tongThanhToan = tongTruocVAT + vat10 + vat8 + (cheDoVC === 0 ? phiVC : 0);

    const resp = await fetch(templateUrl);
    if (!resp.ok) throw new Error("Không thể tải file mẫu");

    const zip = await JSZip.loadAsync(await resp.arrayBuffer());
    const sheetKeys = Object.keys(zip.files).filter(k => /xl\/worksheets\/sheet\d+\.xml$/.test(k));
    if (!sheetKeys.length) throw new Error("Không tìm thấy sheet XML");

    const ssFile = zip.file("xl/sharedStrings.xml");
    if (!ssFile) throw new Error("Không tìm thấy sharedStrings.xml");

    const [ssXmlOrig, sheetXmlOrig] = await Promise.all([
      ssFile.async("string"),
      zip.file(sheetKeys[0])!.async("string"),
    ]);

    const ssTexts    = parseSharedStrings(ssXmlOrig);
    const newSsTexts = [...ssTexts];
    const addSs      = (text: string): number => { const i = newSsTexts.length; newSsTexts.push(text); return i; };

    const headerMap: Record<string, string> = {
      "{{so_bao_gia}}":      bgData.so_bao_gia || "",
      "{{ngay_bao_gia}}":    fmtDate(bgData.ngay_bao_gia),
      "{{ten_du_an}}":       bgData.ten_du_an || "",
      "{{ten_cong_ty}}":     bgData.ten_cong_ty || bgData.ten_khach_hang || "",
      "{{tong_truoc_vat}}":  "",
      "{{tong_thanh_toan}}": "",
      "{{VAT_10}}":          fmtNum(vat10),
      "{{VAT_8}}":           fmtNum(vat8),
    };
    for (let i = 0; i < newSsTexts.length; i++) {
      if (headerMap[newSsTexts[i]] !== undefined) newSsTexts[i] = headerMap[newSsTexts[i]];
    }

    const sttSsIdx = ssTexts.indexOf("{{stt}}");

    const allRows = parseRows(sheetXmlOrig);

    // Tìm template row: ưu tiên sharedStrings, fallback tìm text inline trong XML row
    let templateRow = sttSsIdx !== -1
      ? allRows.find(row =>
          parseCells(row.xml).some(c => c.type === "s" && parseInt(c.value) === sttSsIdx)
        )
      : undefined;

    // Nếu không tìm được qua sharedStrings, tìm trực tiếp trong XML của row (inline string)
    if (!templateRow) {
      templateRow = allRows.find(row => row.xml.includes("{{stt}}"));
    }

    if (!templateRow) throw new Error("Không tìm thấy dòng template chứa {{stt}} trong file mẫu");

    const phToCol: Record<string, string> = {};
    for (const cell of parseCells(templateRow.xml)) {
      if (cell.type === "s" && cell.value !== "") {
        const text = ssTexts[parseInt(cell.value)];
        if (text) phToCol[text] = cell.col;
      }
      // Inline string: tìm placeholder trực tiếp trong XML cell
      if (cell.type === "inlineStr" || cell.type === "") {
        const inlineText = cell.fullXml.match(/{{[^}]+}}/)?.[0];
        if (inlineText) phToCol[inlineText] = cell.col;
      }
    }
    // Fallback: tìm placeholder trực tiếp trong raw XML của template row
    const rawPlaceholders = templateRow.xml.match(/\{\{[^}]+\}\}/g) || [];
    for (const ph of rawPlaceholders) {
      if (!phToCol[ph]) {
        // Tìm column của cell chứa placeholder này
        const cells = parseCells(templateRow.xml);
        for (const cell of cells) {
          if (cell.fullXml.includes(ph)) {
            phToCol[ph] = cell.col;
            break;
          }
        }
      }
    }

    const COL_STT        = phToCol["{{stt}}"]          || "A";
    const COL_TEN        = phToCol["{{ten_san_pham}}"]  || "B";
    const COL_DVT        = phToCol["{{don_vi}}"]        || "C";
    const COL_SL         = phToCol["{{so_luong}}"]      || "F";
    const COL_DON_GIA    = phToCol["{{gia_ban}}"]       || "G";
    const COL_THANH_TIEN = phToCol["{{thanh_tien}}"]    || "H";
    const COL_THUE       = phToCol["{{thue_suat}}"]     || "I";

    const tmplRowNum = templateRow.rowNum;
    const numItems   = items.length;
    const numExtra   = numItems - 1;

    const itemRowXmls: string[] = [];
    for (let i = 0; i < numItems; i++) {
      const item      = itemsWithGiaBan[i];
      const soLuong   = Number(item.so_luong) || 0;
      const giaBan    = item._gia_xuat;
      const thanhTien = soLuong * giaBan;
      const thueSuat  = Number(item.thue_suat) || 0;

      const ssReplace: Record<string, number> = {
        [COL_STT]:  addSs(String(i + 1)),
        [COL_TEN]:  addSs(item.ten_san_pham || ""),
        [COL_DVT]:  addSs(item.don_vi || ""),
        [COL_THUE]: addSs(`${thueSuat}%`),
      };
      const numericReplace: Record<string, number> = {
        [COL_SL]:         soLuong,
        [COL_DON_GIA]:    giaBan,
        [COL_THANH_TIEN]: thanhTien,
      };
      itemRowXmls.push(buildItemRow(templateRow.xml, tmplRowNum + i, ssReplace, numericReplace));
    }

    const before       = sheetXmlOrig.slice(0, templateRow.start);
    const after        = sheetXmlOrig.slice(templateRow.end);
    const shiftedAfter = shiftAllRowNums(after, numExtra);
    let combined       = before + itemRowXmls.join("") + shiftedAfter;

    combined = shiftMerges(combined, tmplRowNum, numExtra);

    if (numExtra > 0) {
      const origMergeRe = /<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g;
      const newMerges: string[] = [];
      let mm: RegExpExecArray | null;
      while ((mm = origMergeRe.exec(sheetXmlOrig)) !== null) {
        const r1 = parseInt(mm[2]), r2 = parseInt(mm[4]);
        if (r1 <= tmplRowNum && r2 >= tmplRowNum) {
          for (let i = 1; i < numItems; i++) {
            newMerges.push(
              `<mergeCell ref="${mm[1]}${r1 === tmplRowNum ? tmplRowNum + i : r1 + i}:${mm[3]}${r2 === tmplRowNum ? tmplRowNum + i : r2 + i}"/>`
            );
          }
        }
      }
      if (newMerges.length) {
        combined = combined.replace("</mergeCells>", newMerges.join("") + "</mergeCells>");
        combined = combined.replace(/<mergeCells count="(\d+)"/, (_: string, n: string) =>
          `<mergeCells count="${parseInt(n) + newMerges.length}"`
        );
      }
    }

    const summaryStyle = "40";
    const row12 = tmplRowNum + numItems;
    const row15 = tmplRowNum + numItems + 3;

    combined = upsertSsCellInRow(combined, row12, "G", addSs(fmtNum(tongTruocVAT)),  summaryStyle);
    combined = upsertSsCellInRow(combined, row15, "G", addSs(fmtNum(tongThanhToan)), summaryStyle);

    zip.file("xl/sharedStrings.xml", rebuildSharedStrings(ssXmlOrig, newSsTexts));
    zip.file(sheetKeys[0], combined);

    const outBuffer = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const safeName = (bgData.so_bao_gia || "bao-gia")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${safeName}.xlsx`;

    // ---- Try upload to Google Drive if user has token ----
    let driveLink: string | null = null;
    if (userId) {
      try {
        const { data: driveToken } = await supabase
          .from("google_drive_tokens")
          .select("access_token, refresh_token, token_expiry")
          .eq("user_id", userId)
          .maybeSingle();

        if (driveToken) {
          let accessToken = driveToken.access_token;

          // Refresh if expired or expiring soon
          const expiry = driveToken.token_expiry ? new Date(driveToken.token_expiry) : null;
          const needsRefresh = !expiry || expiry.getTime() - Date.now() < 60_000;
          if (needsRefresh && driveToken.refresh_token) {
            const refreshed = await refreshGoogleToken(driveToken.refresh_token);
            if (refreshed) {
              accessToken = refreshed.access_token;
              const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
              await supabase.from("google_drive_tokens").update({
                access_token: accessToken,
                token_expiry: newExpiry,
                updated_at: new Date().toISOString(),
              }).eq("user_id", userId);
            }
          }

          const driveFile = await uploadToDrive(accessToken, fileName, outBuffer);
          if (driveFile?.webViewLink) driveLink = driveFile.webViewLink;
        }
      } catch (driveErr) {
        console.error("Drive upload error (non-fatal):", driveErr);
      }
    }

    // Return file + optional drive link header
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    };
    if (driveLink) responseHeaders["X-Drive-Link"] = driveLink;

    return new Response(outBuffer, { status: 200, headers: responseHeaders });

  } catch (err: any) {
    console.error("xuat-bao-gia-excel error:", err);
    return new Response(JSON.stringify({ error: err.message || "Lỗi server" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
