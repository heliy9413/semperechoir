import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin, logAction, DEPARTMENTS } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Pencil, Save, X, Lock, Trash2, Printer } from "lucide-react";

const DOC_TITLE = "የሰምፔር አምልኮ ህብረት የ2019 ዓመታዊ ዕቅድ";
const DOC_FOOTER = "የሰምፔር አምልኮ ህብረት የ2019 ዓመታዊ ይፋዊ ዕቅድ ሰነድ";
const DEFAULT_LEADER = "ሀይለአብ ደምሴ እና ተስፋነሽ ኃይሌ";

const DEPT_BY_NO = {
  1: "አጠቃላይ", 2: "የመዝሙር ጥናት ክፍል", 3: "የመዝሙር ጥናት ክፍል", 4: "የጸሎት ክፍል",
  5: "የአቴንዳንስ ክፍል", 6: "የመዝሙር ጥናት ክፍል", 7: "የገንዘብ ክፍል", 8: "የመዝሙር ጥናት ክፍል",
  9: "የመዝሙር ጥናት ክፍል", 10: "የኮንሰርትና ወንጌል ስርጭት ክፍል", 11: "የጸሎት ክፍል",
  12: "የመዝሙር ጥናት ክፍል", 13: "የኮንሰርትና ወንጌል ስርጭት ክፍል", 14: "አጠቃላይ",
};

const DEFAULT_GOALS = [
  { no: 1, main: "የአባላትን ቁጥር አብዝቶ መጨመር", strategy: ["የተመረጡ አባላትን ማግኘት", "የቴክኒክ ስልጠናዎችን መስጠት", "መንፈሳዊ ስልጠናዎች እንዲሰጣቸው"], metric: "በቁጥር", baseline: "27", annual: "27/54", department: DEPT_BY_NO[1] },
  { no: 2, main: "መዝሙር የሚመሩ አገልጋዮትን ማፍራት", strategy: ["በተለያዩ ስልጠናዎች እና እድልን መስጠት", "በራሳቸው ላይ እንዲሰሩ በማበረታታት", "አቅማቸውን በመለየት"], metric: "በቁጥር", baseline: "4", annual: "4", department: DEPT_BY_NO[2] },
  { no: 3, main: "አገልግሎቱን ማላቅ", strategy: ["የመዝሙር ምርጫን ማሻሻል", "አቀራረብን ማሻሻል", "የአለባበስ ሁኔታን ማሻሻል", "የሠዓት አጠቃቀምን ማሻሻል"], metric: "በቁጥር / በዓመት", baseline: "52", annual: "52", department: DEPT_BY_NO[3] },
  { no: 4, main: "የህብረቱ አባላትን መንፈሳዊ ህይወት ማላቅና ማሳደግ", strategy: ["የመፅሐፍ ቅዱስ ጥናት ጊዜ ማድረግ", "መንፈሳዊ ትምህርቶች እና ስልጠናዎችን በማዘጋጀት"], metric: "በቁጥር", baseline: "12", annual: "በወር 2 ጊዜ (24)", department: DEPT_BY_NO[4] },
  { no: 5, main: "የአባላቱን በሁሉም አገልግሎት ላይ ተሳትፎን እና መገኘትን እውን ማድረግ", strategy: ["የቤ/ክ መደበኛ የአገልግሎት ጊዜዎች የሁሉም አገልጋዮች ኃላፊነት እና ግዴታ እንደሆነ እንዲረዱ በማንቃት", "መረጃዎችን በተገቢው ጊዜና ሁኔታ መለዋወጥን በማጠናከር"], metric: "በቁጥር", baseline: "18/104 አባላት", annual: "27/104 (ሙሉ አባላት እንዲገኙ መስራት)", department: DEPT_BY_NO[5] },
  { no: 6, main: "የመድረክ አገልግሎቶች ግልፅ በሚሆኑበት ሁኔታ መስራት", strategy: ["በቂ የጥናት ጊዜ ማድረግ", "ከሚዲያ ክፍል አገልጋዮች ጋር ተገቢውን የሆነ ግንኙነት በመፍጠር", "የሚዳስ ይዘት እቅድን በማዘጋጀት"], metric: "በቁጥር", baseline: "0", annual: "52 (የአገልግሎት ጊዜዎችን በጥራት መሰራት)", department: DEPT_BY_NO[6] },
  { no: 7, main: "ህብረቱ የራሱ የሆኑ የሙዚቃ ማቴሪያሎች እንዲኖሩት ማድረግ", strategy: ["እርስ በእርስ በሚሆን መዋጮ", "የህብረቱን ቋሚ የገቢ ምንጭ በመፍጠር", "ስፖንሰር በመፈለግ"], metric: "በዓይነት", baseline: "አልባህስ ያሉን", annual: "Box Guitar መግዛት / ልብስ ማስፋት", department: DEPT_BY_NO[7] },
  { no: 8, main: "በቴክኒካዊ ክህሎት የበቁ አባላትን ማፍራት", strategy: ["የድምፅ አገልግሎቶችን በቋሚነት በባለሙያ መስጠት", "የግጥም እና የዜማ ስልጠና መስጠት", "የሙዚቃ ስልጠናዎችን በመስጠት እና ጠንካራ ያለ ልምምድ በማድረግ"], metric: "በቁጥር", baseline: "0", annual: "በዓመት 4 ጊዜ ስልጠና መስጠት", department: DEPT_BY_NO[8] },
  { no: 9, main: "የበቁ ብሎ ዘማሪዎችን ማፍራት", strategy: ["እድሎችን በመፍጠር", "ስልጠናዎችን በመስጠት", "ውስጣቸው ያለወን ፀጋ እንዲያወጡ በመጎልበት"], metric: "በቁጥር", baseline: "1", annual: "2", department: DEPT_BY_NO[9] },
  { no: 10, main: "በዓመት 4 የወንጌል ስርጭት (ስብከት) ድግኞች ማዘጋጀትና ማካሄድ፤ በ3 ወር አንድ ጊዜ ወደ ተለያዩ ቦታዎችና ክፍሎች ወንጌል ለማስተማር መውጣት፤ አባላትን በምስክርነት ሕይወታቸው ማበረታታት፤ የተዳረሱ ነፍሳትና የተገቡ መልስ ቁጥር በመዝገብ ማስፈረም።", strategy: ["የስርጭት ቦታዎችን አስቀድሞ መለየትና የቦታ ስርዓት ማድረግ", "የምስክርነትና የስብከት ስልጠና መስጠት", "የወንጌል ቁሳቁሶችን ማዘጋጀት", "ከሚዲያ ክፍል ጋር ተባብሮ ማስታወቂያ ማድረግ", "ከሌሎች ባለድርሻ አካላት ጋር በቅንጅት መስራት"], metric: "በቁጥር (የተደረጉ ድግኞችና የተዳረሱ ነፍሳት)", baseline: "በዓመት 2 ጊዜ", annual: "በዓመት 4 ጊዜ (በ3 ወር 1 ጊዜ) — ቢያንስ 4 ቦታዎች መድረስ", department: DEPT_BY_NO[10] },
  { no: 11, main: "በየወሩ የጾም ጸሎትን ማድረግ", strategy: ["በየወሩ አንድ ጊዜ እቅድ ይዞ በመጸለይ"], metric: "በቁጥር", baseline: "በወር 1", annual: "በወር 1 (በዓመት 12 ጊዜ)", department: DEPT_BY_NO[11] },
  { no: 12, main: "ህብረቱ የራሱ መዝሙር እንዲኖረው ማድረግ", strategy: ["የግጥምና ዜማ ስልጠና በመስጠት", "ተሰጥኦአቸውን በመለየት የመዝሙር ግጥምና ዜማዎችን ከእግዚአብሔር በመቀበል"], metric: "በቁጥር", baseline: "4", annual: "2", department: DEPT_BY_NO[12] },
  { no: 13, main: "በዓመት 2 የአምልኮ ቀን (ኮንሰርት) የዝማሬ ድግስ ማዘጋጀት፤ የመዝሙር ምርጫ አስቀድሞ ማድረግ፤ በቂ ጥናትና ልምምድ ማድረግ፤ ሁለቱ ህብረቶች በቅንጅት ማዘጋጀት፤ የቲኬት፣ የስርዓትና የአከባቢ አስተዳደር ማድረግ።", strategy: ["የመዝሙር ምርጫ ቀድሞ ማድረግና የጥናት መዝገብ ማዘጋጀት", "ከሚዲያ፣ አቴንዳንስና ገንዘብ ክፍሎች ጋር ተባብሮ መስራት", "የድምፅና የመቅረድ ስርጭት ማዘጋጀት", "ሁለቱ ህብረቶች በቅንጅት ሙሉ ዝማሬ ማሳደግ"], metric: "በቁጥር (የተደረጉ ኮንሰርቶች)", baseline: "0", annual: "2 (በዓመት ሁለት ጊዜ) — ሙሉ ዝማሬና የድምፅ ስርጭት ጋር", department: DEPT_BY_NO[13] },
  { no: 14, main: "ተተኪ መሪ ማፍራት", strategy: ["በውስጥ ስራዎች ላይ ሃላፊነት በመስጠት", "በመምከር", "በስነ ልቦና ዝግጁ እንዲሆኑ በማስተማር"], metric: "በቁጥር", baseline: "2", annual: "4", department: DEPT_BY_NO[14] },
];

const COLUMNS = [
  { key: "no", am: "ተ.ቁ", en: "No.", width: "min-w-[50px] w-12" },
  { key: "main", am: "ዋና ዋና ስራዎች", en: "Key Activities", width: "min-w-[260px]" },
  { key: "strategy", am: "የማስፈጸሚያ ዘዴ", en: "Strategy", width: "min-w-[260px]" },
  { key: "metric", am: "መለኪያ", en: "Indicator", width: "min-w-[130px]" },
  { key: "baseline", am: "መነሻ", en: "Baseline", width: "min-w-[110px]" },
  { key: "annual", am: "አመታዊ ኢላማ", en: "Annual Target", width: "min-w-[140px]" },
  { key: "department", am: "የፈጻሚ ክፍል", en: "Responsible Dept", width: "min-w-[170px]" },
];

function strategyAsArray(s) {
  if (Array.isArray(s)) return s;
  if (!s) return [];
  return String(s).split(/[\/\n]/).map((x) => x.trim()).filter(Boolean);
}

function GoalRow({ g, editing, onChange }) {
  const cell = "px-3 py-2.5 border border-slate-300 dark:border-slate-700 align-top text-xs";
  const set = (f, v) => onChange(g.no - 1, f, v);

  const renderView = (key) => {
    if (key === "no") return <span className="font-bold text-navy dark:text-amber-400 text-center block">{g.no}</span>;
    if (key === "strategy") {
      const items = strategyAsArray(g.strategy);
      return items.length ? (
        <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
          {items.map((s, i) => <li key={i} className="leading-snug">{s}</li>)}
        </ul>
      ) : <span className="text-slate-400">—</span>;
    }
    if (key === "department") {
      return (
        <span className="inline-block px-2 py-0.5 rounded-md font-semibold text-xs bg-amber-500/10 text-amber-900 dark:text-amber-300 border border-amber-500/20 whitespace-nowrap">
          {g.department || DEPT_BY_NO[g.no] || "—"}
        </span>
      );
    }
    if (key === "annual") {
      return <span className="font-bold text-navy dark:text-white leading-relaxed">{g.annual || "—"}</span>;
    }
    return <span className="text-slate-700 dark:text-slate-200 leading-relaxed">{g[key] || <span className="text-slate-400">—</span>}</span>;
  };

  const renderEdit = (key) => {
    if (key === "no") return <span className="font-bold text-center block pt-2">{g.no}</span>;
    
    // በስልክ ኪቦርድ ሲከፈት Zoom In እንዳያደርግ የፎንት መጠኑ text-base (16px) ሆኖ በኮምፒውተር sm:text-xs ሆኗል
    const inputStyle = "text-base sm:text-xs bg-white dark:bg-slate-800 rounded-lg border-slate-300 dark:border-slate-600 focus:ring-1 focus:ring-amber-500 w-full";

    if (key === "strategy") {
      const items = strategyAsArray(g.strategy);
      return (
        <Textarea
          value={items.join("\n")}
          onChange={(e) => set("strategy", e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))}
          className={`min-h-[85px] leading-relaxed p-2 ${inputStyle}`}
          placeholder="አንድ ዘዴ በየመስመሩ"
        />
      );
    }
    if (key === "department") {
      return (
        <Select value={g.department || DEPT_BY_NO[g.no] || "አጠቃላይ"} onValueChange={(v) => set("department", v)}>
          <SelectTrigger className={`h-9 sm:h-8 ${inputStyle}`}><SelectValue /></SelectTrigger>
          <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d} className="text-sm sm:text-xs">{d}</SelectItem>)}</SelectContent>
        </Select>
      );
    }
    return key === "main" ? (
      <Textarea 
        value={g[key] || ""} 
        onChange={(e) => set(key, e.target.value)} 
        className={`min-h-[70px] leading-relaxed p-2 ${inputStyle}`} 
      />
    ) : (
      <Input 
        value={g[key] || ""} 
        onChange={(e) => set(key, e.target.value)} 
        className={`h-9 sm:h-8 px-2.5 ${inputStyle}`} 
      />
    );
  };

  return (
    <tr className={g.no % 2 === 0 ? "bg-white dark:bg-slate-900 hover:bg-amber-50/20" : "bg-slate-50/75 dark:bg-slate-800/40 hover:bg-amber-50/20"}>
      {COLUMNS.map((c) => (
        <td key={c.key} className={`${cell} ${c.key === "no" ? "text-center font-bold" : ""}`}>
          {editing ? renderEdit(c.key) : renderView(c.key)}
        </td>
      ))}
    </tr>
  );
}

function GoalTable({ rows, editing, onChange }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs">
      <table className="w-full border-collapse text-xs min-w-[950px]">
        <thead>
          <tr className="bg-slate-900 text-white dark:bg-slate-950">
            {COLUMNS.map((c) => (
              <th key={c.key} className={`px-3 py-2.5 text-left border border-slate-700 font-bold whitespace-nowrap ${c.width}`}>
                <div className="leading-tight text-amber-300">{c.am}</div>
                <div className="text-[10px] font-normal text-slate-300">{c.en}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <GoalRow key={g.no} g={g} editing={editing} onChange={onChange} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnnualMasterPlan() {
  const { user } = useAuth();
  const canEditPlan = isSuperAdmin(user);
  const userName = user?.full_name || user?.email || "Unknown";

  const [doc, setDoc] = useState(null);
  const [rows, setRows] = useState(DEFAULT_GOALS);
  const [leaderName, setLeaderName] = useState(DEFAULT_LEADER);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await base44.entities.PlanDocument.list();
      if (all.length > 0) {
        const d = all[0];
        setDoc(d);
        let parsed = DEFAULT_GOALS;
        if (d.plan_rows_json) {
          try {
            const raw = JSON.parse(d.plan_rows_json);
            parsed = raw.map((r) => ({
              ...r,
              no: r.no || (parsed.findIndex ? parsed.length + 1 : 1),
              strategy: strategyAsArray(r.strategy),
              department: r.department || DEPT_BY_NO[r.no] || "አጠቃላይ",
            }));
          } catch { /* keep defaults */ }
        }
        setRows(parsed);
        setLeaderName(d.leader_name || DEFAULT_LEADER);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateRow = (i, field, value) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const handlePrint = () => {
    window.print();
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        title: `${DOC_TITLE} ሰነድ`,
        leader_name: leaderName,
        plan_rows_json: JSON.stringify(rows),
        updated_by_name: userName,
      };
      if (doc) {
        await base44.entities.PlanDocument.update(doc.id, payload);
        await logAction(user, "edit_annual_master_plan", "PlanDocument", doc.id, "Updated Annual Master Plan document", "አጠቃላይ");
      } else {
        const created = await base44.entities.PlanDocument.create(payload);
        setDoc(created);
        await logAction(user, "edit_annual_master_plan", "PlanDocument", created.id, "Created Annual Master Plan document", "አጠቃላይ");
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const deleteDoc = async () => {
    if (!doc) return;
    if (!confirm("ይህን የዕቅድ ሰነድ ሰርዝ? ሰነዱ ወደ መነሻ ይመለሳል።")) return;
    setSaving(true);
    try {
      await base44.entities.PlanDocument.delete(doc.id);
      await logAction(user, "delete_annual_master_plan", "PlanDocument", doc.id, "Deleted Annual Master Plan document", "አጠቃላይ");
      setDoc(null);
      setRows(DEFAULT_GOALS);
      setLeaderName(DEFAULT_LEADER);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-16">
      {/* የላይኛው ራስጌ እና መቆጣጠሪያ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-navy dark:text-white tracking-tight flex items-center gap-2">
            <FileText size={22} className="text-amber-600" />
            <span>ዓመታዊ ማስተር ፕላን (Annual Master Plan)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            የሰምፔር አምልኮ ህብረት የ2019 ዓመታዊ ይፋዊ ዕቅድ ሰነድ — ወጥ ሰንጠረዥ
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="rounded-xl text-xs font-bold h-9 border-slate-200 hover:bg-slate-100"
          >
            <Printer size={15} className="mr-1.5 text-slate-600" /> Print
          </Button>

          {canEditPlan && !loading && (
            editing ? (
              <div className="flex gap-1.5">
                <Button onClick={save} disabled={saving} size="sm" className="bg-navy hover:bg-navy-dark text-white rounded-xl text-xs font-bold h-9">
                  <Save size={15} className="mr-1.5" /> {saving ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="rounded-xl text-xs h-9">
                  <X size={15} className="mr-1" /> Cancel
                </Button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <Button onClick={() => setEditing(true)} size="sm" className="bg-navy hover:bg-navy-dark text-white rounded-xl text-xs font-bold h-9">
                  <Pencil size={15} className="mr-1.5" /> Edit
                </Button>
                {doc && (
                  <Button onClick={deleteDoc} disabled={saving} size="sm" variant="outline" className="text-rose-600 hover:bg-rose-50 border-rose-200 rounded-xl text-xs h-9">
                    <Trash2 size={15} />
                  </Button>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* ዋናው የሰነድ ሰሌዳ — ከአንድ እስከ 14 ወጥ ሰንጠረዥ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-800 p-4 sm:p-8 shadow-md">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-navy rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ይፋዊ የቤተክርስቲያን ራስጌ */}
            <div className="text-center border-b-2 border-slate-800 pb-5 mb-6 space-y-1">
              <p className="text-xs font-black tracking-widest text-slate-800 dark:text-slate-200 uppercase">FAITH ARMY CHURCH</p>
              <p className="text-xs font-black tracking-widest text-slate-800 dark:text-slate-200 uppercase">FA INTERNATIONAL CHURCH</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">ፌይዝ አርሚ ዓለም አቀፍ ቤተ ክርስቲያን</p>
              <p className="text-3xl font-black tracking-[0.35em] text-navy dark:text-amber-400 pt-1">FA</p>
              <h2 className="text-lg sm:text-xl font-extrabold text-navy dark:text-white pt-2">{DOC_TITLE}</h2>
            </div>

            {/* ወጥ የሆነ ከአንድ እስከ 14 ያሉት ዕቅዶች ሙሉ ሰንጠረዥ */}
            <GoalTable rows={rows} editing={editing} onChange={updateRow} />

            {/* የፊርማ እና የማጠቃለያ ክፍል */}
            <div className="mt-8 border-t-2 border-slate-800 pt-6 space-y-3 text-xs text-slate-800 dark:text-slate-200">
              {editing ? (
                <div className="max-w-md">
                  <label className="text-xs font-bold text-slate-600 block mb-1">የህብረቱ መሪ (Leaders)</label>
                  <Input value={leaderName} onChange={(e) => setLeaderName(e.target.value)} className="rounded-xl text-base sm:text-xs h-9 bg-white dark:bg-slate-800" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-1.5">
                    <p><span className="font-bold text-navy dark:text-amber-400">የህብረቱ መሪ፡</span> {leaderName}</p>
                    <p className="text-slate-500">ፊርማ፡ _____________________________</p>
                  </div>
                  <div className="space-y-1.5">
                    <p><span className="font-bold text-navy dark:text-amber-400">ያጸደቀው የቤ/ክ አመራር፡</span> ___________________</p>
                    <p className="text-slate-500">ፊርማ፡ _____________________________</p>
                  </div>
                </div>
              )}
              <p className="text-center text-xs text-slate-500 italic pt-4">{DOC_FOOTER}</p>
            </div>

            {!canEditPlan && (
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                <Lock size={12} /> View only — ይዘቱን ማረም የሚችሉት ሱፐር አድሚን ብቻ ናቸው።
              </div>
            )}
            {doc?.updated_by_name && (
              <p className="text-[11px] text-slate-400 mt-1">የመጨረሻ ማሻሻያ የተደረገው በ፦ {doc.updated_by_name}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}