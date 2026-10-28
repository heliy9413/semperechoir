import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { can, logAction, DEPARTMENTS, isSuperAdmin } from "@/lib/rbac";
import AccessDenied from "@/components/AccessDenied";
import PlanComparison, { ALIGN_AM, alignColor } from "@/components/PlanComparison";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ETHIOPIAN_MONTHS } from "@/lib/ethiopianCalendar";
import { 
  ShieldCheck, Activity, Search, RefreshCw, 
  Layers, CheckCircle2, AlertCircle, FileText, Calendar
} from "lucide-react";
import TextFixerCard from "@/components/admin/TextFixerCard";
import OrphanLinkCleanup from "@/components/admin/OrphanLinkCleanup";

const GOAL_MONTHS = ETHIOPIAN_MONTHS.slice(0, 11);

const actionBadgeStyles = {
  create: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300",
  update: "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300",
  delete: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300",
};

export default function AdminHub() {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(0);
  const [deptFilter, setDeptFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [g, l] = await Promise.all([
        base44.entities.AnnualGoal.list(),
        base44.entities.AuditLog.list("-created_date", 100),
      ]);
      setGoals(g || []);
      setLogs(l || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const masterGoals = useMemo(() => goals.filter((g) => g.plan_type !== "department"), [goals]);
  
  const deptGoals = useMemo(() => {
    let list = goals.filter((g) => g.plan_type === "department");
    if (deptFilter !== "all") list = list.filter((g) => g.department === deptFilter);
    return list;
  }, [goals, deptFilter]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const matchesDept = deptFilter === "all" || l.department === deptFilter;
      const matchesAction = actionFilter === "all" || (l.action || "").startsWith(actionFilter);
      const matchesSearch = searchQuery.trim() === "" ||
        (l.actor_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.details || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.target_type || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.department || "").toLowerCase().includes(searchQuery.toLowerCase());

      return matchesDept && matchesAction && matchesSearch;
    });
  }, [logs, deptFilter, actionFilter, searchQuery]);

  const setAlignment = async (g, value) => {
    await base44.entities.AnnualGoal.update(g.id, { alignment: value });
    await logAction(user, "update_alignment", "AnnualGoal", g.id, `${g.title} → ${value}`, g.department);
    setGoals((p) => p.map((x) => (x.id === g.id ? { ...x, alignment: value } : x)));
  };

  const resetFilters = () => {
    setDeptFilter("all");
    setActionFilter("all");
    setSearchQuery("");
  };

  if (!can(user, "admin_hub")) {
    return <AccessDenied message="Only the Super Admin can access the Admin Audit Hub." />;
  }

  const isSuper = isSuperAdmin(user);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header & Summary Stats */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-navy via-slate-900 to-indigo-950 p-6 sm:p-8 text-white shadow-lg border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold backdrop-blur-md border border-white/10">
              <ShieldCheck size={14} />
              <span>Super Admin Management</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              የመሪዎች የስራ ግምገማና ኦዲት
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-xl">
              Inspect department submissions, verify plan alignment, and review system audit history in real-time.
            </p>
          </div>

          {/* Quick Counter Badges */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center backdrop-blur-xs">
              <span className="text-[10px] sm:text-xs text-slate-400 block font-medium">ጠቅላላ እቅዶች</span>
              <span className="text-lg sm:text-2xl font-black text-amber-300">{goals.length}</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center backdrop-blur-xs">
              <span className="text-[10px] sm:text-xs text-slate-400 block font-medium">የክፍላት እቅዶች</span>
              <span className="text-lg sm:text-2xl font-black text-emerald-400">{deptGoals.length}</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center backdrop-blur-xs">
              <span className="text-[10px] sm:text-xs text-slate-400 block font-medium">የኦዲት መዝገቦች</span>
              <span className="text-lg sm:text-2xl font-black text-sky-400">{logs.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Controls & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mr-1">
            <Calendar size={15} className="text-amber-600" />
            <span>ወር ምረጥ፦</span>
          </div>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36 h-9 rounded-xl text-xs font-semibold bg-slate-50 border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GOAL_MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i)} className="text-xs">
                  {m.am}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-44 h-9 rounded-xl text-xs font-semibold bg-slate-50 border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">ሁሉንም ክፍላት</SelectItem>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={load}
          disabled={loading}
          className="rounded-xl text-xs text-slate-600 hover:text-navy hover:bg-slate-100 h-9 px-3"
          title="ዳታውን አድስ"
        >
          <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin text-amber-600" : ""}`} />
          ዳታ አድስ
        </Button>
      </div>

      {/* 3. Comparison Matrix Section */}
      <div className="rounded-3xl border border-slate-200/80 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="font-bold text-base sm:text-lg text-navy dark:text-white flex items-center gap-2">
              <Layers size={19} className="text-amber-600" />
              <span>የእቅዶች ንጽጽር ሰሌዳ (Plan Comparison)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">የዋናውን እና የክፍላት እቅዶችን ትስስር ይገምግሙ</p>
          </div>
        </div>

        {!loading ? (
          <PlanComparison
            masterGoals={masterGoals}
            deptGoals={deptGoals}
            monthIndex={month}
            onSetAlignment={setAlignment}
          />
        ) : (
          <div className="py-16 text-center text-xs text-slate-400">እቅዶች በመጫን ላይ ናቸው…</div>
        )}

        <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] font-bold text-slate-400 mr-1">የደረጃ ማብራሪያ፦</span>
          {Object.keys(ALIGN_AM).map((a) => (
            <Badge key={a} variant="outline" className={`px-2.5 py-0.5 rounded-lg font-semibold ${alignColor[a]}`}>
              {a} ({ALIGN_AM[a]})
            </Badge>
          ))}
        </div>
      </div>

      {/* 4. Super Admin Tools */}
      {isSuper && (
        <div className="space-y-4">
          <TextFixerCard />
          <OrphanLinkCleanup />
        </div>
      )}

      {/* 5. Activity / Audit Log Table */}
      {isSuper && (
        <div className="rounded-3xl border border-slate-200/80 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          {/* Header & Log Controls */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-base sm:text-lg text-navy dark:text-white flex items-center gap-2">
                <Activity size={19} className="text-amber-600" />
                <span>የእንቅስቃሴ መዝገብ (Activity / Audit Log)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">በሲስተሙ የተከናወኑ አዳዲስ ለውጦች ክትትል</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search Bar */}
              <div className="relative w-full sm:w-56">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ፈልግ (ስም፣ ክፍል፣ ተግባር)…"
                  className="pl-8 h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                />
              </div>

              {/* Action Filter */}
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-32 h-9 rounded-xl text-xs font-semibold bg-slate-50 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">ሁሉንም ድርጊት</SelectItem>
                  <SelectItem value="create" className="text-xs">አዲስ የተፈጠሩ</SelectItem>
                  <SelectItem value="update" className="text-xs">የተቀየሩ</SelectItem>
                  <SelectItem value="delete" className="text-xs">የተሰረዙ</SelectItem>
                </SelectContent>
              </Select>

              {(searchQuery || actionFilter !== "all" || deptFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="text-xs text-slate-400 hover:text-rose-600 h-9 px-2"
                >
                  አጣራ አጥፋ
                </Button>
              )}
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3.5">ሰዓት / ቀን</th>
                  <th className="px-5 py-3.5">ፈጻሚው</th>
                  <th className="px-5 py-3.5">ተግባር</th>
                  <th className="px-5 py-3.5">አይነት</th>
                  <th className="px-5 py-3.5">ዝርዝር</th>
                  <th className="px-5 py-3.5">ክፍል</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      የኦዲት መረጃ በመጫን ላይ ነው…
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      ምንም አይነት የተመዘገበ እንቅስቃሴ አልተገኘም።
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((l) => {
                    const kind = (l.action || "").includes("delete")
                      ? "delete"
                      : (l.action || "").includes("create")
                      ? "create"
                      : "update";

                    return (
                      <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          {new Date(l.created_date).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 font-bold text-navy dark:text-slate-100 whitespace-nowrap">
                          {l.actor_name || "System"}
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant="outline" className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${actionBadgeStyles[kind]}`}>
                            {l.action}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300 font-medium">
                          {l.target_type || "—"}
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={l.details}>
                          {l.details || "—"}
                        </td>
                        <td className="px-5 py-3 text-slate-400 font-medium">
                          {l.department || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Responsive Cards View */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-2">
            {loading ? (
              <div className="text-center py-8 text-xs text-slate-400">መረጃ በመጫን ላይ ነው…</div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">ምንም መዝገብ አልተገኘም</div>
            ) : (
              filteredLogs.map((l) => {
                const kind = (l.action || "").includes("delete")
                  ? "delete"
                  : (l.action || "").includes("create")
                  ? "create"
                  : "update";

                return (
                  <div key={l.id} className="p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-navy dark:text-white text-sm">
                        {l.actor_name || "System"}
                      </span>
                      <Badge variant="outline" className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${actionBadgeStyles[kind]}`}>
                        {l.action}
                      </Badge>
                    </div>

                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                      {l.details || l.target_type || "ምንም ዝርዝር የለም"}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100/60 dark:border-slate-800">
                      <span>{l.department || "አጠቃላይ"}</span>
                      <span className="font-mono">{new Date(l.created_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}