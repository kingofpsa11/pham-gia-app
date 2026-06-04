import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const { mau_key } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: cauHinh } = await supabase.from("cau_hinh").select("value").eq("key", mau_key).maybeSingle();
    if (!cauHinh?.value) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { url } = JSON.parse(cauHinh.value);
    const resp = await fetch(url);
    const zip = await JSZip.loadAsync(await resp.arrayBuffer());

    const sheetKeys = Object.keys(zip.files).filter(k => /xl\/worksheets\/sheet\d+\.xml$/.test(k));
    const sheetXml = await zip.file(sheetKeys[0])!.async("string");
    const ssXml = await zip.file("xl/sharedStrings.xml")!.async("string");
    const stylesXml = await zip.file("xl/styles.xml")!.async("string");

    // Parse shared strings
    const ss: string[] = [];
    let pos = 0;
    while (true) {
      const s = ssXml.indexOf("<si>", pos);
      if (s === -1) break;
      const e = ssXml.indexOf("</si>", s);
      if (e === -1) break;
      const block = ssXml.slice(s + 4, e);
      const texts: string[] = [];
      let tp = 0;
      while (true) {
        const ts = block.indexOf("<t", tp);
        if (ts === -1) break;
        const te = block.indexOf("</t>", ts);
        if (te === -1) break;
        const tagEnd = block.indexOf(">", ts);
        texts.push(block.slice(tagEnd + 1, te));
        tp = te + 4;
      }
      ss.push(texts.join("").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">"));
      pos = e + 5;
    }

    // Return all shared strings
    const allSs = ss.map((t, i) => ({ i, t }));

    // Return all rows from sheet (just row number + cell refs + ss indices)
    const rowSummaries: any[] = [];
    let rpos = 0;
    while (true) {
      const rs = sheetXml.indexOf("<row ", rpos);
      if (rs === -1) break;
      const re = sheetXml.indexOf("</row>", rs);
      if (re === -1) break;
      const rowXml = sheetXml.slice(rs, re + 6);
      const rm = rowXml.match(/\br="(\d+)"/);
      if (rm) {
        const rowNum = parseInt(rm[1]);
        // Extract all cells: ref, type, value
        const cellRe = /<c\s[^>]*r="([A-Z]+)(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g;
        let cm: RegExpExecArray | null;
        const cells: any[] = [];
        while ((cm = cellRe.exec(rowXml)) !== null) {
          const cxml = cm[0];
          const col = cm[1];
          const typeM = cxml.match(/\bt="([^"]*)"/);
          const valM = cxml.match(/<v>([^<]*)<\/v>/);
          const styleM = cxml.match(/\bs="(\d+)"/);
          const t = typeM ? typeM[1] : "";
          const v = valM ? valM[1] : "";
          let display = v;
          if (t === "s") display = `[SS:${v}] "${ss[parseInt(v)] || ""}"`;
          else if (t === "inlineStr" || t === "str") {
            const tM = cxml.match(/<t[^>]*>([^<]*)<\/t>/);
            display = tM ? `[inline] "${tM[1]}"` : "[inline empty]";
          }
          cells.push({ col: col + rowNum, s: styleM ? styleM[1] : "", display });
        }
        rowSummaries.push({ row: rowNum, cells });
      }
      rpos = re + 6;
    }

    // Also get merge cells
    const merges: string[] = [];
    const mergeRe = /<mergeCell ref="([^"]+)"\/>/g;
    let mm: RegExpExecArray | null;
    while ((mm = mergeRe.exec(sheetXml)) !== null) merges.push(mm[1]);

    // Number formats from styles
    const numFmts: any[] = [];
    const nfRe = /<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g;
    let nfm: RegExpExecArray | null;
    while ((nfm = nfRe.exec(stylesXml)) !== null) numFmts.push({ id: nfm[1], code: nfm[2] });

    // xf (cell formats) - just the numFmtId for each style index
    const xfIds: string[] = [];
    const xfRe = /<xf[^>]*numFmtId="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g;
    let xfm: RegExpExecArray | null;
    while ((xfm = xfRe.exec(stylesXml)) !== null) xfIds.push(xfm[1]);

    return new Response(JSON.stringify({ sharedStrings: allSs, rows: rowSummaries, merges, numFmts, xfIds, totalSs: ss.length }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
