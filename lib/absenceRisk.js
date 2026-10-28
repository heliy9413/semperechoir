// Attendance risk engine for Sempere Choir.
// A member is flagged "at risk" when they are:
//   - Absent for 3+ consecutive sessions in time order (across any program), OR
//   - Absent more than 4 times (>=5) within a single Ethiopian month.

const SESSION_ORDER = { tuesday: 1, wednesday: 2, fasting: 3, sunday: 4 };

// Returns a map: { [memberId]: { atRisk, severe, consecutive, monthly, reasons[] } }
export function computeMemberRisk(members, records, ethYear, monthIndex) {
  const map = {};
  members.forEach((m) => {
    const recs = (records || [])
      .filter(
        (r) =>
          r.member_id === m.id &&
          r.eth_year === ethYear &&
          r.month_index === monthIndex
      )
      .sort(
        (a, b) =>
          (a.day - b.day) ||
          ((SESSION_ORDER[a.session_type] ?? 9) - (SESSION_ORDER[b.session_type] ?? 9))
      );

    const monthly = recs.filter((r) => r.status === "absent").length;

    // Longest run of consecutive "absent" sessions in time order.
    let longest = 0;
    let cur = 0;
    recs.forEach((r) => {
      if (r.status === "absent") {
        cur += 1;
        if (cur > longest) longest = cur;
      } else {
        cur = 0;
      }
    });

    const reasons = [];
    if (longest >= 3) reasons.push("consecutive_3");
    if (monthly > 4) reasons.push("monthly_5");

    const atRisk = reasons.length > 0;
    const severe = longest >= 4 || monthly >= 6;

    map[m.id] = { atRisk, severe, consecutive: longest, monthly, reasons };
  });
  return map;
}

// Sorted list of at-risk members (highest monthly absences first).
export function atRiskMembers(members, riskMap) {
  return members
    .map((m) => ({ member: m, risk: riskMap[m.id] }))
    .filter((x) => x.risk && x.risk.atRisk)
    .sort(
      (a, b) =>
        (b.risk.monthly - a.risk.monthly) ||
        (b.risk.consecutive - a.risk.consecutive)
    );
}