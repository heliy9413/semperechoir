import React, { useEffect, useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdmin } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BarChart3, Search, Download, ChevronRight } from "lucide-react";
import {
  ETHIOPIAN_MONTHS, ROLES, ATTENDANCE_STATUS, currentEthiopianYear,
} from "@/lib/ethiopianCalendar";
import MemberHistoryDialog from "@/components/stats/MemberHistoryDialog";
import AttendanceBadges from "@/components/attendance/AttendanceBadges";

const bySlot = (a, b) => (a.slot_number || 99) - (b.slot_number || 99);

const STATUS_COLS = [
  { key: "present", label: "ተገኝቷል", en: "Present", color: "#16a34a" },
  { key: "absent", label: "አልተገኘም", en: "Absent", color: "#dc2626" },
  { key: "permission", label: "ፍቃድ", en: "Excused", color: "#ca8a04" },
  { key: "late", label: "ዘግይቷል", en: "Late", color: "#0ea5e9" },
];

export default function AttendanceStats() {
  const { user } = useAuth();
  const canManage = isSuperAdmin(user);
  const currentYear = currentEthiopianYear();
  const [year, setYear] = useState("all");
  const [members, setMembers] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedMember, setSelectedMember] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, r] = await Promise.all([
        base44.entities.Member.list(),
        year === "all"
          ? base44.entities.AttendanceRecord.list("-eth_year,-month_index,-day", 2000)
          : base44.entities.AttendanceRecord.filter({ eth_year: Number(year) }),
      ]);
      setMembers([...m].sort(bySlot));
      setRecords(r || []);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const map = {};
    members.forEach((m) => {
      map[m.id] = { present: 0, absent: 0, permission: 0, late: 0, total: 0, records: [] };
    });
    records.forEach((r) => {
      const s = map[r.member_id];
      if (!s) return;
      if (s[r.status] !== undefined) s[r.status] += 1;
      s.total += 1;
      s.records.push(r);
    });
    Object.values(map).forEach((s) => {
      const attended = s.present + s.late;
      s.rate = s.total ? Math.round((attended / s.total) * 100) : null;
      s.records.sort((a, b) =>
        (b.eth_year - a.eth_year) || (b.month_index - a.month_index) || (b.day - a.day)
      );
    });
    return map;
  }, [members, records]);

  const filteredMembers = useMemo(
    () => members.filter((m) => {
      const ms = m.full_name?.toLowerCase().includes(search.toLowerCase());
      const mv = roleFilter === "all" || m.role === roleFilter;
      return ms && mv;
    }),
    [members, search, roleFilter]
  );

  const totals = useMemo(() => {
    const t = { present: 0, absent: 0, permission: 0, late: 0, total: 0 };
    filteredMembers.forEach((m) => {
      const s = stats[m.id] || {};
      t.present += s.present || 0;
      t.absent += s.absent || 0;
      t.permission += s.permission || 0;
      t.late += s.late || 0;
      t.total += s.total || 0;
    });
    return t;
  }, [filteredMembers, stats]);

  const yearOptions = [];
  for (let y = currentYear; y >= 2019; y--) yearOptions.push(y);

  const exportCSV = () => {
    const header = ["#", "Member", "Role", "Present", "Absent", "Excused", "Late", "Total", "Rate%"];
    const rows = filteredMembers.map((m) => {
      const s = stats[m.id] || {};
      return [
        m.slot_number || "", m.full_name, m.role || "",
        s.present || 0, s.absent || 0, s.permission || 0, s.late || 0, s.total || 0,
        s.rate == null ? "—" : `${s.rate}%`,
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-stats-${year === "all" ? "all" : year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rateColor = (rate) => {
    if (rate == null) return "text-slate-400";
    if (rate >= 80) return "text-green-600";
    if (rate >= 60) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy tracking-tight flex items-center gap-2">
            <BarChart3 size={24} /> የመገኘት ስታቲስቲክስ
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            የእያንዳንዱ መዘምራን የመገኘት ማጠቃለያ — Attendance statistics for every member
          </p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={!members.length}>
          <Download size={16} className="mr-1" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={String(year)} onValueChange={(v) => setYear(v === "all" ? "all" : Number(v))}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ሁሉም ዓመታት (All years)</SelectItem>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>{y} ዓ.ም.</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="መዘምራንን ይፈልጉ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="ሚና" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ሁሉም ሚናዎች</SelectItem>
            {ROLES.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-green-600">{totals.present}</div>
          <div className="text-[11px] text-slate-500">ተገኝቷል</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-red-600">{totals.absent}</div>
          <div className="text-[11px] text-slate-500">አልተገኘም</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-amber-600">{totals.permission}</div>
          <div className="text-[11px] text-slate-500">ፍቃድ</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-sky-600">{totals.late}</div>
          <div className="text-[11px] text-slate-500">ዘግይቷል</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-navy">{totals.total}</div>
          <div className="text-[11px] text-slate-500">ጠቅላላ መዝገብ</div>
        </div>
      </div>

      {/* Stats table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="border-collapse text-sm min-w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 w-12">ተ.ቁ</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[160px]">ሙሉ ስም</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[120px]">ሚና</th>
                {STATUS_COLS.map((sc) => (
                  <th key={sc.key} className="px-3 py-2.5 text-center font-medium text-slate-600 min-w-[90px]">
                    <div className="flex flex-col leading-tight">
                      <span>{sc.label}</span>
                      <span className="text-[10px] text-slate-400">{sc.en}</span>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center font-medium text-slate-600 min-w-[70px]">ጠቅላላ</th>
                <th className="px-3 py-2.5 text-center font-medium text-slate-600 min-w-[80px]">ድግግሜ %</th>
                <th className="px-3 py-2.5 text-center font-medium text-slate-600 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="text-center py-10 text-slate-400">በመጫን ላይ…</td></tr>
              )}
              {!loading && filteredMembers.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-slate-400">አባላት አልተገኙም</td></tr>
              )}
              {!loading && filteredMembers.map((m) => {
                const s = stats[m.id] || {};
                return (
                  <tr
                    key={m.id}
                    onClick={() => setSelectedMember({ ...m, records: s.records || [] })}
                    className="hover:bg-slate-50/70 border-b border-slate-100 cursor-pointer"
                  >
                    <td className="px-3 py-2">
                      <span className="grid place-items-center h-6 w-6 rounded-md bg-navy/10 text-[11px] font-bold text-navy">{m.slot_number || "—"}</span>
                    </td>
                    <td className="px-3 py-2 font-medium text-navy">{m.full_name}</td>
                    <td className="px-3 py-2 text-gold-dark text-xs">{m.role || "—"}</td>
                    {STATUS_COLS.map((sc) => (
                      <td key={sc.key} className="px-3 py-2 text-center">
                        <span className="font-semibold" style={{ color: s[sc.key] ? sc.color : "#cbd5e1" }}>
                          {s[sc.key] || 0}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center font-semibold text-navy">{s.total || 0}</td>
                    <td className={`px-3 py-2 text-center font-bold ${rateColor(s.rate)}`}>
                      {s.rate == null ? "—" : `${s.rate}%`}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-300">
                      <ChevronRight size={16} className="mx-auto" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        ምንም የመገኘት መዝገብ የሌለው አባል «—» ይታያል። የድግግሜ መጠን (ተገኝቷል + ዘግይቷል) ÷ ጠቅላላ ነው።
      </p>

      <AttendanceBadges />

      <MemberHistoryDialog
        member={selectedMember}
        records={selectedMember?.records}
        canManage={canManage}
        onChange={async () => {
          await load();
          if (selectedMember) {
            const refreshed = await base44.entities.AttendanceRecord.filter({ member_id: selectedMember.id });
            setSelectedMember({ ...selectedMember, records: refreshed });
          }
        }}
        onClose={() => setSelectedMember(null)}
      />
    </div>
  );
}