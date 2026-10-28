// Fetches Amharic Bible text from the public magna25/amharic-bible-json dataset
// via the jsDelivr CDN. Returns the verses for one chapter plus the book's
// chapter count so the client can populate the chapter selector.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const BASE = "https://cdn.jsdelivr.net/gh/magna25/amharic-bible-json@main/individual_books/";

export default async function(req: Request): Promise<Response> {
  try {
    // Require an authenticated app user — the Bible reader is members-only,
    // so anonymous callers must not be able to proxy this endpoint.
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const file = String(body?.file || "").trim();
    const chapter = Number(body?.chapter) || 1;

    if (!file || !/^\d{2}_.+\.json$/.test(file)) {
      return Response.json({ error: "Invalid book file." }, { status: 400 });
    }

    const res = await fetch(BASE + encodeURIComponent(file), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return Response.json({ error: "Bible source unavailable." }, { status: 502 });
    }
    const book = await res.json();
    const chapters = Array.isArray(book?.chapters) ? book.chapters : [];
    const chapterCount = chapters.length;
    if (chapterCount === 0) {
      return Response.json({ error: "Book has no chapters." }, { status: 404 });
    }

    const idx = Math.min(Math.max(chapter, 1), chapterCount) - 1;
    const ch = chapters[idx] || {};
    const verses = Array.isArray(ch?.verses) ? ch.verses : [];

    return Response.json({
      title: book?.title || "",
      chapter: idx + 1,
      chapterCount,
      verses,
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Failed to fetch chapter." }, { status: 500 });
  }
}