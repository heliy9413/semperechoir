import React, { useEffect, useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { canEdit, logAction, effectiveRole } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CalendarCheck, Search, Download, Lock, Unlock, Save, ShieldAlert, Sparkles, AlertTriangle, WifiOff } from "lucide-react";
import { computeMemberRisk } from "@/lib/absenceRisk";
import { fireAttendanceAlerts } from "@/lib/attendanceAlerts";
import { enqueueMark, syncQueue, queueLength } from "@/lib/attendanceQueue";
import {
  ETHIOPIAN_MONTHS, SESSIONS, ATTENDANCE_STATUS, ROLES,
  getMonthSessions, currentEthiopianYear, currentEthiopianMonth, currentEthiopianDay,
  ethiopianToGregorian, getWeekday, ETHIOPIAN_WEEKDAYS,
} from "@/lib/ethiopianCalendar";

const bySlot = (a, b) => (a.slot_number || 99) - (b.slot_number || 99);

// Map JS weekday (0=Sun…6=Sat) to the Attendance program key
const WEEKDAY_TO_PROGRAM = { 0: "sunday", 2: "tuesday", 3: "wednesday", 6: "fasting" };

const PROGRAM_TABS = [
  { key: "tuesday", label: "ማክሰኞ", sub: "አዳዲስ ፕሮግራም", en: "Tuesday — New Song Program" },
  { key: "wednesday", label: "ረቡዕ", sub: "መደበኛ የቤተ ክርስቲያን ፕሮግራም", en: "Wednesday — Regular Church Program" },
  { key: "sunday", label: "እሁድ", sub: "መደበኛ የቤተ ክርስቲያን ፕሮግራም", en: "Sunday Service" },
  { key: "fasting", label: "ቅዳሜ", sub: "ወርሃዊ የጾም ጸሎት", en: "Monthly Fasting & Prayer" },
];

const STATUS_COLS = [
  { key: "present", label: "ተገኝቷል", en: "Present" },
  { key: "absent", label: "አልተገኘም", en: "Absent" },
  { key: "permission", label: "ፍቃድ", en: "Excused" },
  { key: "late", label: "ዘግይቷል", en: "Late" },
];

export default function Attendance() {
  const { user } = useAuth();
  const isSuperAdmin = effectiveRole(user) === "super_admin";
  const canEditAttendance = canEdit(user, "attendance");
  const userName = user?.full_name || user?.email || "Unknown";

  const [ethYear] = useState(currentEthiopianYear());
  const [monthIndex, setMonthIndex] = useState(currentEthiopianMonth());
  const [program, setProgram] = useState(WEEKDAY_TO_PROGRAM[new Date().getDay()] || "tuesday");
  const [selectedDay, setSelectedDay] = useState(null);
  const [members, setMembers] = useState([]);
  const [records, setRecords] = useState([]);
  const [fastingSessions, setFastingSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [toggling, setToggling] = useState(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  const [notesDraft, setNotesDraft] = useState({});
  const [offlineQueue, setOfflineQueue] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, r, fs] = await Promise.all([
        base44.entities.Member.list(),
        base44.entities.AttendanceRecord.filter({ eth_year: ethYear, month_index: monthIndex }),
        base44.entities.FastingSession.filter({ eth_year: ethYear, month_index: monthIndex }),
      ]);
      setMembers([...m].sort(bySlot));
      setRecords(r);
      setFastingSessions(fs);
    } finally {
      setLoading(false);
    }
  }, [ethYear, monthIndex]);

  useEffect(() => { load(); }, [load]);

  // Auto-sync: when a fasting session is created in the Prayer module, refresh immediately.
  useEffect(() => {
    const unsub = base44.entities.FastingSession.subscribe(() => { load(); });
    return unsub;
  }, [load]);

  // Offline attendance queue: flush to server when connectivity is restored.
  useEffect(() => {
    setOfflineQueue(queueLength());
    const onOnline = async () => {
      const res = await syncQueue();
      setOfflineQueue(res.remaining);
      if (res.synced > 0) await load();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  const sessionMeta = useMemo(() => SESSIONS.find((s) => s.key === program), [program]);
  const tabMeta = useMemo(() => PROGRAM_TABS.find((t) => t.key === program), [program]);

  // Available dates for the selected program in the selected month
  const availableDates = useMemo(() => {
    const wname = (d) => ETHIOPIAN_WEEKDAYS[getWeekday(ethYear, monthIndex, d)];
    if (program === "fasting") {
      return fastingSessions
        .slice()
        .sort((a, b) => a.day - b.day)
        .map((f) => ({
          day: f.day,
          label: `${wname(f.day)} — ${ETHIOPIAN_MONTHS[monthIndex].am} ${f.day}${f.title ? " · " + f.title : ""}${f.venue ? " · " + f.venue : ""}`,
          fasting: f,
        }));
    }
    const monthSessions = getMonthSessions(ethYear, monthIndex);
    const sess = monthSessions.find((s) => s.key === program);
    return (sess?.days || []).map((d) => ({
      day: d,
      label: `${wname(d)} — ${ETHIOPIAN_MONTHS[monthIndex].am} ${d}, ${ethYear} EC (${ethiopianToGregorian(ethYear, monthIndex, d).toLocaleDateString()})`,
    }));
  }, [program, fastingSessions, ethYear, monthIndex]);

  const isCurrentMonth = ethYear === currentEthiopianYear() && monthIndex === currentEthiopianMonth();
  const todayEthDay = currentEthiopianDay();
  const daySignature = availableDates.map((d) => d.day).join(",");
  useEffect(() => {
    if (!availableDates.length) {
      setSelectedDay(null);
      return;
    }
    // Default to TODAY when viewing the current month; otherwise first available.
    if (isCurrentMonth && availableDates.some((d) => d.day === todayEthDay)) {
      setSelectedDay(todayEthDay);
      return;
    }
    if (isCurrentMonth) {
      const upcoming = availableDates.filter((d) => d.day >= todayEthDay);
      setSelectedDay(upcoming.length ? upcoming[0].day : availableDates[availableDates.length - 1].day);
      return;
    }
    setSelectedDay(availableDates[0].day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, daySignature, isCurrentMonth, todayEthDay]);

  const jumpToToday = () => {
    setMonthIndex(currentEthiopianMonth());
    setProgram(WEEKDAY_TO_PROGRAM[new Date().getDay()] || "tuesday");
  };

  // Records for the selected day/program only
  const dayRecords = useMemo(() => {
    if (!selectedDay) return [];
    return records.filter((r) => r.session_type === program && r.day === selectedDay);
  }, [records, program, selectedDay]);

  const recordMap = useMemo(() => {
    const map = {};
    dayRecords.forEach((r) => { map[r.member_id] = r; });
    return map;
  }, [dayRecords]);

  const isLocked = useMemo(() => dayRecords.some((r) => r.locked), [dayRecords]);
  const lockInfo = useMemo(() => dayRecords.find((r) => r.locked), [dayRecords]);

  // Month-wide absence risk per member (3 consecutive absences or >4 in the month).
  const riskMap = useMemo(
    () => computeMemberRisk(members, records, ethYear, monthIndex),
    [members, records, ethYear, monthIndex]
  );

  const filteredMembers = useMemo(
    () =>
      members.filter((m) => {
        const ms = m.full_name?.toLowerCase().includes(search.toLowerCase());
        const mv = roleFilter === "all" || m.role === roleFilter;
        return ms && mv;
      }),
    [members, search, roleFilter]
  );

  const setStatus = async (member, status) => {
    if (isLocked || !canEditAttendance || !selectedDay) return;
    const existing = recordMap[member.id];
    setToggling(member.id);
    try {
      if (!navigator.onLine) {
        enqueueMark({
          member_id: member.id, eth_year: ethYear, month_index: monthIndex, day: selectedDay,
          session_type: program, status, notes: existing?.notes || "", existing_id: existing?.id,
        });
        setOfflineQueue(queueLength());
        setRecords((prev) => existing
          ? prev.map((r) => (r.id === existing.id ? { ...r, status } : r))
          : [...prev, { id: `local-${member.id}-${program}-${selectedDay}`, member_id: member.id, eth_year: ethYear, month_index: monthIndex, day: selectedDay, session_type: program, status, notes: "" }]);
        return;
      }
      if (existing) {
        await base44.entities.AttendanceRecord.update(existing.id, { status });
        setRecords((prev) => prev.map((r) => (r.id === existing.id ? { ...r, status } : r)));
      } else {
        const created = await base44.entities.AttendanceRecord.create({
          member_id: member.id, eth_year: ethYear, month_index: monthIndex, day: selectedDay,
          session_type: program, status,
        });
        setRecords((prev) => [...prev, created]);
      }
    } finally {
      setToggling(null);
    }
  };

  const saveNote = async (member) => {
    if (isLocked || !canEditAttendance) return;
    const existing = recordMap[member.id];
    const note = notesDraft[member.id] ?? existing?.notes ?? "";
    if (existing && existing.notes !== note) {
      await base44.entities.AttendanceRecord.update(existing.id, { notes: note });
      setRecords((prev) => prev.map((r) => (r.id === existing.id ? { ...r, notes: note } : r)));
    }
  };

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, permission: 0, late: 0 };
    members.forEach((m) => {
      const st = recordMap[m.id]?.status || "absent";
      c[st] = (c[st] || 0) + 1;
    });
    return c;
  }, [members, recordMap]);

  const saveLock = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const existingByMember = {};
      dayRecords.forEach((r) => (existingByMember[r.member_id] = r));
      const toCreate = members
        .filter((m) => !existingByMember[m.id])
        .map((m) => ({
          member_id: m.id, eth_year: ethYear, month_index: monthIndex, day: selectedDay,
          session_type: program, status: "absent", locked: true, saved_by_name: userName, saved_at: now,
        }));
      if (dayRecords.length) {
        // Locking must NEVER touch saved_at — it holds the member's original
        // scan time, and overwriting it destroys the real check-in record.
        await base44.entities.AttendanceRecord.bulkUpdate(
          dayRecords.map((r) => ({ id: r.id, locked: true, saved_by_name: userName }))
        );
      }
      if (toCreate.length) {
        await base44.entities.AttendanceRecord.bulkCreate(toCreate);
      }
      const greg = ethiopianToGregorian(ethYear, monthIndex, selectedDay);
      setSummary({
        program: tabMeta?.en,
        dateLabel: `${ETHIOPIAN_WEEKDAYS[getWeekday(ethYear, monthIndex, selectedDay)]}, ${ETHIOPIAN_MONTHS[monthIndex].am} ${selectedDay}, ${ethYear} EC (${greg.toLocaleDateString()})`,
        counts,
        total: members.length,
        savedBy: userName,
        savedAt: now,
      });
      await logAction(
        user, "attendance_locked", "AttendanceRecord",
        `${program}-${selectedDay}`,
        `Locked ${tabMeta?.en} (day ${selectedDay}) — Present ${counts.present}, Absent ${counts.absent}, Excused ${counts.permission}, Late ${counts.late}`,
        "የአቴንዳንስ ክፍል"
      );
      await load();
      // Automated leadership Telegram alerts: 2 consecutive rehearsal absences or a missed major fasting program.
      try {
        const fasting = program === "fasting" ? fastingSessions.find((f) => f.day === selectedDay) : null;
        await fireAttendanceAlerts({
          members,
          program,
          day: selectedDay,
          ethYear,
          monthIndex,
          fastingTitle: fasting?.title,
          venue: fasting?.venue,
          savedByName: userName,
        });
      } catch {}
    } finally {
      setSaving(false);
      setConfirmSave(false);
    }
  };

  const unlock = async () => {
    if (!isSuperAdmin || !isLocked) return;
    if (!confirm("Unlock this attendance record for editing? This action will be logged to the audit trail.")) return;
    const locked = dayRecords.filter((r) => r.locked);
    if (locked.length) {
      await base44.entities.AttendanceRecord.bulkUpdate(locked.map((r) => ({ id: r.id, locked: false })));
    }
    await logAction(
      user, "attendance_unlocked", "AttendanceRecord",
      `${program}-${selectedDay}`,
      `Unlocked ${tabMeta?.en} (day ${selectedDay}); originally saved by ${lockInfo?.saved_by_name || "—"}`,
      "የአቴንዳንስ ክፍል"
    );
    await load();
  };

  const exportCSV = () => {
    if (!selectedDay) return;
    const header = ["#", "Member", "Phone", "Role", "Status", "Notes"];
    const rows = filteredMembers.map((m) => {
      const rec = recordMap[m.id];
      const st = ATTENDANCE_STATUS[rec?.status || "absent"];
      return [m.slot_number || "", m.full_name, m.phone || "—", m.role || "", `${st.en} (${st.am})`, rec?.notes || ""];
    });
    const csv = [header, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${program}-${ETHIOPIAN_MONTHS[monthIndex].en}-${selectedDay}-${ethYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {(!navigator.onLine || offlineQueue > 0) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-center gap-2 text-sm text-amber-800">
          <WifiOff size={16} />
          {navigator.onLine
            ? `${offlineQueue} offline attendance mark(s) queued — will sync automatically.`
            : `You're offline. Attendance is being queued locally (${offlineQueue} pending) and will sync when reconnected.`}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy tracking-tight flex items-center gap-2">
            <CalendarCheck size={24} /> Attendance Tracker
          </h1>
          <p className="text-sm text-slate-500 mt-1">በየፕሮግራሙ ቀን የተከፋፈለ እይታ — Program-based session view</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={!selectedDay}>
            <Download size={16} className="mr-1" /> Export Day
          </Button>
        </div>
      </div>

      {/* Program filter tabs */}
      <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1.5 w-full overflow-x-auto scrollbar-thin">
        {PROGRAM_TABS.map((t) => {
          const active = program === t.key;
          const meta = SESSIONS.find((s) => s.key === t.key);
          return (
            <button
              key={t.key}
              onClick={() => setProgram(t.key)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition whitespace-nowrap flex-1 min-w-[180px] ${
                active ? "text-white shadow-sm" : "text-slate-600 hover:text-slate-800 bg-white/50"
              }`}
              style={active ? { background: meta.color } : {}}
            >
              {t.key === "fasting" ? <Sparkles size={16} /> : <CalendarCheck size={16} />}
              <span className="flex flex-col items-start leading-tight">
                <span className="font-semibold">{t.label}</span>
                <span className={`text-[10px] ${active ? "text-white/80" : "text-slate-400"}`}>{t.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Month + date selectors */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={String(monthIndex)} onValueChange={(v) => setMonthIndex(Number(v))}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Select month" /></SelectTrigger>
          <SelectContent>
            {ETHIOPIAN_MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i)}>{m.am} ({m.en})</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedDay ? String(selectedDay) : ""} onValueChange={(v) => setSelectedDay(Number(v))}>
          <SelectTrigger className="w-full sm:flex-1">
            <SelectValue placeholder={availableDates.length ? "Select a date for this program" : "No dates scheduled"} />
          </SelectTrigger>
          <SelectContent>
            {availableDates.map((d) => (
              <SelectItem key={d.day} value={String(d.day)}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={jumpToToday} className="sm:w-auto shrink-0" title="ወደ ዛሬ ተመለስ">
          <CalendarCheck size={16} className="mr-1" /> ዛሬ (Today)
        </Button>

        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search member..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLES.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Fasting auto-sync hint */}
      {program === "fasting" && availableDates.length === 0 && !loading && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 flex items-center gap-3">
          <Sparkles size={18} className="text-violet-600 shrink-0" />
          <p className="text-sm text-violet-800">
            No fasting session is scheduled for this month yet. When the Prayer Department Coordinator (Ashenafi Degefu) or Super Admin assigns a fasting day in the <span className="font-semibold">Fasting &amp; Prayer</span> module, it will automatically appear here.
          </p>
        </div>
      )}

      {/* Saved summary banner */}
      {summary && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-navy font-semibold">
                <Save size={16} className="text-gold-dark" /> Attendance Saved &amp; Locked
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{summary.dateLabel}</p>
            </div>
            <button onClick={() => setSummary(null)} className="text-xs text-slate-400 hover:text-slate-600">dismiss</button>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-sm">
            <div className="rounded-lg bg-white border border-slate-200 p-2"><div className="text-lg font-bold text-green-600">{summary.counts.present}</div><div className="text-[11px] text-slate-500">Present</div></div>
            <div className="rounded-lg bg-white border border-slate-200 p-2"><div className="text-lg font-bold text-red-600">{summary.counts.absent}</div><div className="text-[11px] text-slate-500">Absent</div></div>
            <div className="rounded-lg bg-white border border-slate-200 p-2"><div className="text-lg font-bold text-amber-600">{summary.counts.permission}</div><div className="text-[11px] text-slate-500">Excused</div></div>
            <div className="rounded-lg bg-white border border-slate-200 p-2"><div className="text-lg font-bold text-sky-600">{summary.counts.late}</div><div className="text-[11px] text-slate-500">Late</div></div>
            <div className="rounded-lg bg-white border border-slate-200 p-2"><div className="text-lg font-bold text-navy">{summary.total}</div><div className="text-[11px] text-slate-500">Total</div></div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Program: <span className="font-medium text-slate-700">{summary.program}</span> · Saved by <span className="font-medium text-slate-700">{summary.savedBy}</span> · {new Date(summary.savedAt).toLocaleString()}</p>
        </div>
      )}

      {/* Single-day attendance sheet */}
      {selectedDay ? (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden" style={{ borderColor: `${sessionMeta.color}55` }}>
          {/* Program-colored header bar */}
          <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ background: sessionMeta.color }}>
            <div className="text-white">
              <h2 className="font-semibold flex items-center gap-2">
                {program === "fasting" ? <Sparkles size={18} /> : <CalendarCheck size={18} />}
                {tabMeta.label} — {tabMeta.sub}
              </h2>
              <p className="text-[12px] text-white/80">
                {ETHIOPIAN_WEEKDAYS[getWeekday(ethYear, monthIndex, selectedDay)]}, {ETHIOPIAN_MONTHS[monthIndex].am} {selectedDay}, {ethYear} EC · {ethiopianToGregorian(ethYear, monthIndex, selectedDay).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isLocked ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900/80 text-white px-3 py-1.5 text-xs font-semibold" title={`Locked by ${lockInfo?.saved_by_name || "—"}${lockInfo?.saved_at ? " at " + new Date(lockInfo.saved_at).toLocaleString() : ""}`}>
                    <Lock size={13} /> የተቆለፈ (LOCKED)
                  </span>
                  {isSuperAdmin && (
                    <button onClick={unlock} className="inline-flex items-center gap-1.5 rounded-lg bg-white text-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100">
                      <Unlock size={13} /> Unlock &amp; Edit Record
                    </button>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 text-white px-3 py-1.5 text-xs font-medium">
                  <Unlock size={13} /> Open for editing
                </span>
              )}
            </div>
          </div>

          {/* Day summary chips */}
          <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-5 gap-2 border-b" style={{ background: sessionMeta.tint, borderColor: `${sessionMeta.color}33` }}>
            <div className="text-center"><div className="text-lg font-bold text-green-600">{counts.present}</div><div className="text-[11px] text-slate-500">ተገኝቷል</div></div>
            <div className="text-center"><div className="text-lg font-bold text-red-600">{counts.absent}</div><div className="text-[11px] text-slate-500">አልተገኘም</div></div>
            <div className="text-center"><div className="text-lg font-bold text-amber-600">{counts.permission}</div><div className="text-[11px] text-slate-500">ፍቃድ</div></div>
            <div className="text-center"><div className="text-lg font-bold text-sky-600">{counts.late}</div><div className="text-[11px] text-slate-500">ዘግይቷል</div></div>
            <div className="text-center"><div className="text-lg font-bold text-navy">{members.length}</div><div className="text-[11px] text-slate-500">Total</div></div>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="border-collapse text-sm min-w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-medium text-slate-600 w-12">ተ.ቁ</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 min-w-[160px]">ሙሉ ስም</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 min-w-[120px]">ስልክ ቁጥር</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 min-w-[140px]">የአገልግሎት ድርሻ</th>
                  {STATUS_COLS.map((sc) => (
                    <th key={sc.key} className="px-2 py-2 text-center font-medium text-slate-600 min-w-[90px]">
                      <div className="flex flex-col leading-tight">
                        <span>{sc.label}</span>
                        <span className="text-[10px] text-slate-400">{sc.en}</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium text-slate-600 min-w-[180px]">ማስታወሻ</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400">Loading…</td></tr>
                )}
                {!loading && filteredMembers.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400">No members</td></tr>
                )}
                {filteredMembers.map((m) => {
                  const rec = recordMap[m.id];
                  const current = rec?.status;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50 border-b border-slate-100">
                      <td className="px-3 py-2">
                        <span className="grid place-items-center h-6 w-6 rounded-md bg-navy/10 text-[11px] font-bold text-navy">{m.slot_number || "—"}</span>
                      </td>
                      <td className="px-3 py-2 font-medium text-navy">
                        <span className="flex items-center gap-1.5">
                          {m.full_name}
                          {riskMap[m.id]?.atRisk && (
                            <span
                              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white ${riskMap[m.id].severe ? "bg-red-600" : "bg-amber-500"}`}
                              title={`አደጋ ማስጠንቀቂያ — ተከታታይ ጠፋ: ${riskMap[m.id].consecutive} · በወር ጠፋ: ${riskMap[m.id].monthly}`}
                            >
                              <AlertTriangle size={9} /> አደጋ
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{m.phone || "—"}</td>
                      <td className="px-3 py-2 text-gold-dark text-xs">{m.role || "—"}</td>
                      {STATUS_COLS.map((sc) => {
                        const st = ATTENDANCE_STATUS[sc.key];
                        const active = current === sc.key;
                        return (
                          <td key={sc.key} className="px-2 py-2 text-center">
                            <button
                              onClick={() => setStatus(m, sc.key)}
                              disabled={toggling === m.id || isLocked || !canEditAttendance}
                              className="grid place-items-center h-8 w-8 rounded-full text-xs font-bold transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 mx-auto"
                              style={active ? { background: st.color, color: "#fff" } : { background: "transparent", color: st.color, border: `1.5px solid ${st.color}55` }}
                              title={`${st.en} (${st.am})`}
                            >
                              {st.symbol}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2">
                        <Input
                          value={notesDraft[m.id] ?? rec?.notes ?? ""}
                          onChange={(e) => setNotesDraft((prev) => ({ ...prev, [m.id]: e.target.value }))}
                          onBlur={() => saveNote(m)}
                          disabled={isLocked || !canEditAttendance}
                          placeholder="—"
                          className="h-8 text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Save & Lock bar */}
          <div className="px-5 py-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ background: sessionMeta.tint, borderColor: `${sessionMeta.color}33` }}>
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              {STATUS_COLS.map((sc) => {
                const st = ATTENDANCE_STATUS[sc.key];
                return (
                  <div key={sc.key} className="flex items-center gap-1.5">
                    <span className="grid place-items-center h-5 w-5 rounded-full text-white text-[10px] font-bold" style={{ background: st.color }}>{st.symbol}</span>
                    {sc.label}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              {!canEditAttendance && (
                <p className="text-slate-400 text-xs flex items-center gap-1"><ShieldAlert size={12} /> View only</p>
              )}
              {canEditAttendance && !isLocked && (
                <Button onClick={() => setConfirmSave(true)} className="bg-navy hover:bg-navy-dark text-white">
                  <Save size={16} className="mr-1" /> SAVE ATTENDANCE
                </Button>
              )}
              {isLocked && isSuperAdmin && (
                <Button onClick={unlock} variant="outline" className="border-navy text-navy hover:bg-navy/5">
                  <Unlock size={16} className="mr-1" /> Unlock &amp; Edit Record
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : !loading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center text-sm text-slate-400">
          {program === "fasting"
            ? "No fasting session scheduled for this month. Assign one in the Fasting & Prayer module."
            : "No sessions of this program fall in the selected month."}
        </div>
      )}

      {/* Save & Lock confirmation dialog */}
      <Dialog open={confirmSave} onOpenChange={(o) => !o && setConfirmSave(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy flex items-center gap-2"><Lock size={18} /> Save Attendance</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            You are about to save attendance for{" "}
            <span className="font-semibold text-navy">{tabMeta?.label} — {ETHIOPIAN_MONTHS[monthIndex].am} {selectedDay}, {ethYear} EC</span>.
            After saving, this record will be <span className="font-semibold">locked</span>. Only the Super Admin (Haileab Demissie) can unlock it for further editing.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSave(false)}>Cancel</Button>
            <Button onClick={saveLock} disabled={saving} className="bg-navy hover:bg-navy-dark text-white">
              {saving ? "Saving…" : "Confirm & Lock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}