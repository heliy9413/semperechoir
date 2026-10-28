// @ts-ignore
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from "base44:runtime";
import { renderScriptureCardPng } from "../../shared/scriptureCard.ts";

const CDN_BASE = "https://cdn.jsdelivr.net/gh/magna25/amharic-bible-json@main/individual_books/";

const REFERENCES = [
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 100, fromV: 1, toV: 2, ref: "መዝሙረ ዳዊት 100:1-2", takeaway: "የመዝሙር አገልግሎታችን የደስታና የምስጋና ምንጭ ነው።", imageUrl: "https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "50_ወደ ፊልጵስዩስ ሰዎች.json", chapter: 4, fromV: 6, toV: 7, ref: "ወደ ፊልጵስዩስ ሰዎች 4:6-7", takeaway: "እያንዳንዱን ሥራ በጸሎትና በምስጋና እንጀምር።", imageUrl: "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "23_ትንቢተ ኢሳይያስ.json", chapter: 40, fromV: 31, toV: 31, ref: "ትንቢተ ኢሳይያስ 40:31", takeaway: "በእምነት እንደገና ኃይላችንን እናገኛለን።", imageUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 95, fromV: 1, toV: 1, ref: "መዝሙረ ዳዊት 95:1", takeaway: "አብረን በምስጋና እግዚአብሔርን እናመስግን።", imageUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 150, fromV: 6, toV: 6, ref: "መዝሙረ ዳዊት 150:6", takeaway: "የልብ ምስጋና ሁልጊዜ ይኑረን።", imageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "51_ወደ ቆላስይስ ሰዎች.json", chapter: 3, fromV: 16, toV: 16, ref: "ወደ ቆላስይስ ሰዎች 3:16", takeaway: "መዝሙር ቃሉን በልባችን ያቅርብ።", imageUrl: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 121, fromV: 1, toV: 2, ref: "መዝሙረ ዳዊት 121:1-2", takeaway: "እርዳታችን ከፈጣሪ ይመጣል።", imageUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "40_የማቴዎስ ወንጌል.json", chapter: 5, fromV: 16, toV: 16, ref: "የማቴዎስ ወንጌል 5:16", takeaway: "አገልግሎታችን ለሰው ብርሃን ይሁን።", imageUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 19, fromV: 1, toV: 1, ref: "መዝሙረ ዳዊት 19:1", takeaway: "መዝሙራችን ፍጥረቱን ያመሰግናል።", imageUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "58_ወደ ዕብራውያን.json", chapter: 13, fromV: 15, toV: 15, ref: "ወደ ዕብራውያን 13:15", takeaway: "ምስጋናችን ዘወትር መስዋዕት ይሁን።", imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 147, fromV: 1, toV: 1, ref: "መዝሙረ ዳዊት 147:1", takeaway: "ምስጋና ሁልጊዜ የተገባ ነው።", imageUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "26_ትንቢተ ሕዝቅኤል.json", chapter: 36, fromV: 26, toV: 26, ref: "ትንቢተ ሕዝቅኤል 36:26", takeaway: "እግዚአብሔር አዲስ ልብና አዲስ መንፈስ በውስጣችን ያኖራል።", imageUrl: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 33, fromV: 3, toV: 3, ref: "መዝሙረ ዳዊት 33:3", takeaway: "አዲስ መዝሙር በደስታ እንዘምር።", imageUrl: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "43_የዮሐንስ ወንጌል.json", chapter: 14, fromV: 27, toV: 27, ref: "የዮሐንስ ወንጌል 14:27", takeaway: "የእግዚአብሔር ሰላም ልባችንን ይሞላል።", imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 23, fromV: 1, toV: 1, ref: "መዝሙረ ዳዊት 23:1", takeaway: "ጌታ እንደ እረኛ ይንከባከበናል።", imageUrl: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "49_ወደ ኤፌሶን ሰዎች.json", chapter: 5, fromV: 19, toV: 19, ref: "ወደ ኤፌሶን ሰዎች 5:19", takeaway: "በመንፈስ ምስጋና እንዘምር።", imageUrl: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 96, fromV: 1, toV: 1, ref: "መዝሙረ ዳዊት 96:1", takeaway: "አዲስ መዝሙር ለጌታ እንዘምራለን።", imageUrl: "https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "58_ወደ ዕብራውያን.json", chapter: 11, fromV: 1, toV: 1, ref: "ወደ ዕብራውያን 11:1", takeaway: "በእምነት እንኖራለን።", imageUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 28, fromV: 7, toV: 7, ref: "መዝሙረ ዳዊት 28:7", takeaway: "ኃይላችን እግዚአብሔር ነው።", imageUrl: "https://images.unsplash.com/photo-1434725039720-aaad6dd32dfe?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "45_ወደ ሮሜ ሰዎች.json", chapter: 12, fromV: 11, toV: 11, ref: "ወደ ሮሜ ሰዎች 12:11", takeaway: "በመንፈስ አገልግሎት እንሰራለን።", imageUrl: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 104, fromV: 33, toV: 33, ref: "መዝሙረ ዳዊት 104:33", takeaway: "ሕይወታችን ምስጋና ይሁን።", imageUrl: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "06_መጽሐፈ ኢያሱ ወልደ ነዌ.json", chapter: 1, fromV: 9, toV: 9, ref: "መጽሐፈ ኢያሱ 1:9", takeaway: "ቃሉን በልብ እንጠብቃለን።", imageUrl: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 119, fromV: 105, toV: 105, ref: "መዝሙረ ዳዊት 119:105", takeaway: "ሕግህ ለእግሬ መብራት፥ ለመንገዴም ብርሃን ነው።", imageUrl: "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "23_ትንቢተ ኢሳይያስ.json", chapter: 41, fromV: 10, toV: 10, ref: "ትንቢተ ኢሳይያስ 41:10", takeaway: "እግዚአብሔር ከእኛ ጋር ነው።", imageUrl: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 91, fromV: 1, toV: 2, ref: "መዝሙረ ዳዊት 91:1-2", takeaway: "በልዑል መጠጊያ የሚኖር ሁሉን በሚችል አምላክ ጥላ ሥር ያድራል።", imageUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "40_የማቴዎስ ወንጌል.json", chapter: 6, fromV: 33, toV: 33, ref: "የማቴዎስ ወንጌል 6:33", takeaway: "መንግሥቱን አስቀድመን እንፈልጋለን።", imageUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 34, fromV: 1, toV: 2, ref: "መዝሙረ ዳዊት 34:1-2", takeaway: "ምስጋና በአፋችን ይብራ።", imageUrl: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "46_1ኛ ወደ ቆሮንቶስ ሰዎች.json", chapter: 15, fromV: 58, toV: 58, ref: "1ኛ ወደ ቆሮንቶስ ሰዎች 15:58", takeaway: "አገልግሎታችን አይናወጥም።", imageUrl: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80" },
  { bookFile: "19_መዝሙረ ዳዊት.json", chapter: 103, fromV: 1, toV: 2, ref: "መዝሙረ ዳዊት 103:1-2", takeaway: "ሁሉንም እግዚአብሔርን አመስግን።", imageUrl: "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=1200&q=80" },
];

// Reads a credential from Base44 secrets first, falling back to env vars.
function getSecret(key: string): string {
  try {
    // @ts-ignore
    const v = secrets?.get?.(key);
    if (v) return String(v).trim();
  } catch {}
  try {
    // @ts-ignore
    if (typeof Deno !== "undefined" && Deno?.env?.get) return (Deno.env.get(key) || "").trim();
  } catch {}
  try {
    // @ts-ignore
    if (typeof process !== "undefined" && process?.env) return (process.env[key] || "").trim();
  } catch {}
  return "";
}

// ጠዋት 12:00 ሰዓት (6:00 AM EAT) ላይ የሚያዞር ትክክለኛ የቀን ስሌት
function referenceForDate(now = new Date()) {
  const dayKey = Math.floor((now.getTime() - (3 * 3600 * 1000)) / 86400000);
  const i = ((dayKey % REFERENCES.length) + REFERENCES.length) % REFERENCES.length;
  return REFERENCES[i];
}

async function fetchVerseText(ref: any) {
  const res = await fetch(CDN_BASE + encodeURIComponent(ref.bookFile), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return "";
  const book = await res.json();
  const chapters = Array.isArray(book?.chapters) ? book.chapters : [];
  const ch = chapters[ref.chapter - 1] || {};
  const verses = Array.isArray(ch?.verses) ? ch.verses : [];
  const from = Math.max(1, Math.min(ref.fromV, verses.length));
  const to = Math.max(from, Math.min(ref.toV, verses.length));
  const parts = [];
  for (let i = from; i <= to; i++) parts.push(verses[i - 1]);
  return parts.join(" ");
}

const escHtml = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Telegram caption limit is 1024 characters — bound the verse portion so the
// full branded caption always fits.
function buildCaption(title: string, ref: any, verseText: string): string {
  const verse = verseText.length > 700 ? `${verseText.slice(0, 700)}…` : verseText;
  return (
    `📖 <b>${escHtml(title)}</b>\n` +
    `━━━━━━━━━━━━━━━\n\n` +
    `📜 <b>${escHtml(ref.ref)}</b>\n` +
    `<i>«${escHtml(verse)}»</i>\n\n` +
    `💡 <b>የዕለቱ ትምህርት፦</b> ${escHtml(ref.takeaway)}\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🎶 <b>የሰምፔር መዘምራን</b> · <i>Sempere Choir</i>\n` +
    `✨ <i>መልካም የቃልና የምስጋና ቀን ይሁንላችሁ!</i>`
  ).slice(0, 1024);
}

async function telegramErrorDetail(res: Response): Promise<string> {
  let detail = `HTTP ${res.status}`;
  try {
    const d = await res.json();
    if (d?.description) detail = d.description;
  } catch {}
  return detail;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const isForced = url.searchParams.get("force") === "true";

    const tgToken = getSecret("TELEGRAM_BOT_TOKEN");
    const tgChatId = getSecret("TELEGRAM_CHAT_ID");
    console.log(`[dailyScripture] dispatch start | token=${tgToken ? "configured" : "MISSING"} | chatId=${tgChatId ? "configured" : "MISSING"}`);

    const now = new Date();
    const ref = referenceForDate(now);
    const rawVerseText = await fetchVerseText(ref).catch((e) => {
      console.error(`[dailyScripture] verse fetch failed: ${e?.message || e}`);
      return "";
    });
    const verseText = rawVerseText || ref.takeaway;
    const title = "የዕለቱ ቃል ማዕድ";
    const deepLink = `/bible?book=${encodeURIComponent(ref.bookFile)}&chapter=${ref.chapter}&verse=${ref.fromV}`;
    console.log(`[dailyScripture] ${ref.ref} | verse ${verseText.length} chars`);

    // 1. በዳሽቦርዱ ኖቲፊኬሽን ውስጥ ማስቀመጥ (በ20 ሰዓት ውስጥ አንዴ ብቻ)
    const since = new Date(Date.now() - (20 * 3600 * 1000)).toISOString();
    const existing = await base44.asServiceRole.entities.Notification.filter(
      { category: "scripture", audience: "all" }, "-created_date", 5
    );
    const dup = (existing || []).find((n: any) => (n.created_date || "") >= since);

    if (!dup || isForced) {
      await base44.asServiceRole.entities.Notification.create({
        category: "scripture",
        title,
        body: `${ref.ref} — ${verseText}`.slice(0, 480),
        link_path: deepLink,
        priority: "normal",
        audience: "all",
        actor_name: "Daily Scripture",
        image_url: ref.imageUrl,
      });
      console.log("[dailyScripture] in-app notification created");
    } else {
      console.log("[dailyScripture] in-app notification skipped (already sent in last 20h)");
    }

    // 2. ወደ ቴሌግራም መላክ — የዳሽቦርዱ ካርድ ምስል + ግሩም ጽሑፍ
    let telegramSent = false;
    let telegramMode = "";
    let telegramError = "";

    if (!tgToken || !tgChatId) {
      telegramError = "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret is not configured";
      console.error(`[dailyScripture] ${telegramError}`);
    } else {
      // 2a. ትክክለኛውን የዳሽቦርዱ ካርድ ምስል መስራት
      try {
        const png = await renderScriptureCardPng({
          verse: verseText,
          reference: ref.ref,
          takeaway: ref.takeaway,
        });
        console.log(`[dailyScripture] scripture card rendered (${png.length} bytes)`);

        const form = new FormData();
        form.append("chat_id", tgChatId);
        // Image-only post: the card itself carries the full scripture, so the
        // caption is a single clean line (no duplicated verse text).
        form.append("caption", "📖 የዕለቱ ቃል ማዕድ · Sempere Choir");
        form.append("photo", new Blob([png], { type: "image/png" }), "daily-scripture.png");

        const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendPhoto`, {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(30000),
        });

        if (!tgRes.ok) throw new Error(await telegramErrorDetail(tgRes));
        telegramSent = true;
        telegramMode = "photo";
        console.log("[dailyScripture] Telegram sendPhoto OK");
      } catch (err: any) {
        telegramError = err?.message || "photo dispatch failed";
        console.error(`[dailyScripture] photo dispatch failed: ${telegramError} — falling back to text`);

        // 2b. ምስሉ ካልሰራ የተጠበረ ጽሑፍ ብቻ ይላካል፤ የዕለቱ ልጥፍ በጭራሽ አይዘልም
        try {
          const caption = buildCaption(title, ref, verseText);
          const textRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: tgChatId, text: caption, parse_mode: "HTML" }),
            signal: AbortSignal.timeout(15000),
          });
          if (!textRes.ok) throw new Error(await telegramErrorDetail(textRes));
          telegramSent = true;
          telegramMode = "text";
          telegramError = "";
          console.log("[dailyScripture] Telegram sendMessage fallback OK");
        } catch (err2: any) {
          telegramError = err2?.message || "text dispatch failed";
          console.error(`[dailyScripture] Telegram text fallback failed: ${telegramError}`);
        }
      }
    }

    if (telegramSent) {
      console.log(`[dailyScripture] dispatch complete | mode=${telegramMode} | ${ref.ref}`);
    } else {
      console.error(`[dailyScripture] dispatch FAILED for ${ref.ref}: ${telegramError}`);
    }

    return Response.json({
      ok: true,
      ref: ref.ref,
      telegramSent,
      telegramMode,
      telegramError: telegramError || null,
      tokenConfigured: !!tgToken,
      chatIdConfigured: !!tgChatId,
    });
  } catch (error: any) {
    console.error(`[dailyScripture] unhandled error: ${error?.message || error}`);
    return Response.json({ error: error?.message || "Failed to execute" }, { status: 500 });
  }
}