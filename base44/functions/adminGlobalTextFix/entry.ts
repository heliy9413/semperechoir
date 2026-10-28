import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Super-Admin-only: applies a natural-language text-correction instruction
// across every content-bearing entity in the system. The admin types an
// Amharic/English instruction (e.g. "ሰንፔርን በሰምፔር ቀይር"), the LLM converts it
// into exact find→replace substring pairs, and those pairs are applied to
// every editable string field of every entity (service-role, RLS bypassed).

const ENTITY_NAMES = [
  "Member", "AnnualGoal", "CalendarEvent", "PrayerRequest", "LeadershipNotice",
  "Poll", "MusicMinistry", "ConcertProject", "ProjectMilestone", "OutreachLog",
  "FinancePlan", "FinanceStrategy", "FinanceReport", "PlanDocument",
  "BibleQuestion", "Notification", "ChoirProfile", "DeptPlan", "WeeklyReport",
  "FastingSession", "AbsenceAlert", "PrayerPair", "VoiceNote",
  "UniformComment", "UniformProposal", "UniformAsset", "QuarterlyOutreach",
  "TreasuryCampaign", "TreasuryTransaction", "ContributionRecord", "FinanceLedger",
  "QuizResult",
];

function isEditableTextField(name, schemaDef) {
  if (!schemaDef || schemaDef.type !== "string") return false;
  const n = String(name).toLowerCase();
  // Skip structured JSON / identifiers / urls / timestamps — only real text.
  if (n.endsWith("_json")) return false;
  if (n.endsWith("_url") || n.endsWith("_uri")) return false;
  if (n.endsWith("_id")) return false;
  if (n.endsWith("_at")) return false;
  if (["endpoint", "p256dh", "auth"].includes(n)) return false;
  return true;
}

function applyReplacements(value, pairs) {
  if (typeof value !== "string" || value.length === 0) return value;
  let out = value;
  for (const p of pairs) {
    if (!p.find || p.find === p.replace) continue;
    out = out.split(p.find).join(p.replace);
  }
  return out;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const choirRole = user.data && user.data.choir_role;
    const isSuper = user.role === "admin" || choirRole === "super_admin";
    if (!isSuper) {
      return Response.json({ error: "Forbidden — ይህ ለዋናው አድሚን (Super Admin) ብቻ ነው።" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const instruction = String(body?.instruction || "").trim();
    if (!instruction) {
      return Response.json({ error: "እባክዎ የማስተካከያ ትዕዛዝ ያስገቡ።" }, { status: 400 });
    }

    // 1) Convert the admin's instruction into exact find→replace pairs.
    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt:
        "You are a text-correction assistant for an Amharic/English Ethiopian church choir app. " +
        "The Super Admin gave a natural-language instruction to fix or replace text across the whole system. " +
        "Convert it into a JSON list of EXACT find→replace substring pairs. " +
        "Only include pairs the admin clearly requested. Preserve Amharic characters exactly (do not transliterate). " +
        "Keep find and replace as literal substrings. If the instruction is unclear or asks for nothing, return an empty list.\n\n" +
        "Instruction: \"\"\"" + instruction + "\"\"\"\n\n" +
        "Respond as JSON: {\"replacements\":[{\"find\":\"...\",\"replace\":\"...\"}]}",
      response_json_schema: {
        type: "object",
        properties: {
          replacements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                find: { type: "string" },
                replace: { type: "string" },
              },
              required: ["find", "replace"],
            },
          },
        },
        required: ["replacements"],
      },
    });
    const pairs = (llmRes && Array.isArray(llmRes.replacements)) ? llmRes.replacements : [];
    if (!pairs.length) {
      return Response.json({
        ok: true,
        replacements: [],
        changedRecords: 0,
        entities: [],
        message: "ምንም ግልጽ የሆነ የመቀየሪያ ጥንድ አልተገኘም። ትዕዛዙን ይሌላገቡ።",
      });
    }

    // 2) Apply the pairs across all content-bearing entities.
    const report = [];
    let totalChanged = 0;
    for (const name of ENTITY_NAMES) {
      let schema;
      try {
        schema = await base44.asServiceRole.entities[name].schema();
      } catch { continue; }
      const fields = Object.keys(schema.properties || {}).filter((f) =>
        isEditableTextField(f, schema.properties[f])
      );
      if (!fields.length) continue;

      let records;
      try {
        records = await base44.asServiceRole.entities[name].list(undefined, 500);
      } catch { continue; }
      if (!Array.isArray(records) || !records.length) continue;

      const changed = [];
      for (const rec of records) {
        const upd = { id: rec.id };
        let did = false;
        for (const f of fields) {
          const orig = rec[f];
          if (typeof orig !== "string") continue;
          const next = applyReplacements(orig, pairs);
          if (next !== orig) { upd[f] = next; did = true; }
        }
        if (did) changed.push(upd);
      }
      if (changed.length) {
        try {
          await base44.asServiceRole.entities[name].bulkUpdate(changed);
          totalChanged += changed.length;
          report.push({ entity: name, changed: changed.length });
        } catch { /* ignore per-entity failure, continue */ }
      }
    }

    return Response.json({
      ok: true,
      replacements: pairs,
      changedRecords: totalChanged,
      entities: report,
      message: totalChanged > 0
        ? `በ ${report.length} አይነት መዝገብ ላይ ${totalChanged} ሪኮርድ ተስተካክሏል።`
        : "ምንም የሚቀየር ፅሁ፭ አልተገኘም።",
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Failed to apply text fix." }, { status: 500 });
  }
}