// Shared gender-aware birthday wording for the Sempere Choir. Used by both
// the scheduled Telegram dispatch and the ad-hoc edit/re-send tool so the
// on-screen card and the Telegram post never drift apart.

export const SIGNATURE = "— የሰንፔር መዘምራን በሙሉ";

export function isFemale(m) {
  const g = String(m?.gender || "").toLowerCase();
  return g === "female" || g === "ሴት";
}

// Returns gender-aware { header, body } for one celebrant. Female members use
// feminine Amharic pronouns (ልደትሽ / ዓመትሽ / ልሽ); male members use masculine
// (ልደትህ / ዓመትህ / ልህ). {full_name} is substituted with the roster name.
export function blockForMember(m) {
  const name = m?.full_name || "";
  if (isFemale(m)) {
    return {
      header: `መልካም የልደት በዓል ለ${name}!`,
      body: "ዛሬ ልደትሽ ነው። ይህ የተጨመረልሽ አዲሱ ዓመትሽ በጸጋ፣ በጤና እና በደስታ የተሞላ የአገልግሎት ዘመን እንዲሆንልሽ እንመኛለን!",
    };
  }
  return {
    header: `መልካም የልደት በዓል ለ${name}!`,
    body: "ዛሬ ልደትህ ነው። ይህ የተጨመረልህ አዲሱ ዓመትህ በጸጋ፣ በጤና እና በደስታ የተሞላ የአገልግሎት ዘመን እንዲሆንልህ እንመኛለን!",
  };
}

export function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// HTML-formatted Telegram block for one celebrant, matching the on-screen
// card verbatim (header + 🎉, blank line, body, blank line, signature).
export function telegramBlockForMember(m) {
  const { header, body } = blockForMember(m);
  return `🎂 <b>${esc(header)} 🎉</b>\n\n${esc(body)}\n\n${esc(SIGNATURE)}`;
}

// HTML-formatted Telegram post for one or more celebrants.
export function buildBirthdayTelegramMessage(members) {
  return members.map(telegramBlockForMember).join("\n\n");
}