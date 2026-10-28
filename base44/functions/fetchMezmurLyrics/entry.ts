import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// WikiMezmur (https://wikimezmur.org) is a MediaWiki site. Song pages live at
// /am/{Artist}/{Album}/{Song} and the lyrics are inside <div class="poem">.
// We search via the Special:Search pretty-URL, walk the top result links,
// fetch each song page, and extract the clean Amharic lyrics.

const BASE = 'https://wikimezmur.org/am';
const UA = 'Mozilla/5.0 (compatible; SempereChoirLyricsBot/1.0; +https://semperechoir.base44.app)';

async function fetchText(url, ms = 8000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' },
    signal: AbortSignal.timeout(ms),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}

// Pull the lyrics text out of a song page's <div class="poem"> block.
function extractPoem(html) {
  const m = html.match(/<div class="poem">([\s\S]*?)<\/div>/);
  if (!m) return '';
  let body = m[1];
  body = body.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
  body = body.replace(/<[^>]+>/g, '');
  body = decodeEntities(body);
  body = body.replace(/፡/g, ' ');
  body = body.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n');
  body = body.replace(/\n{3,}/g, '\n\n').trim();
  return body;
}

const hasAmharic = (s) => /[\u1200-\u137F]/.test(s || '');
const norm = (s) => (s || '').replace(/፡/g, ' ').replace(/[\s\u1361.,!?;:'"()]/g, '');

function isSongPageUrl(url) {
  try {
    const u = new URL(url);
    // SSRF guard: only crawl pages on wikimezmur.org. Search-result HTML is
    // user-editable wiki content and may contain outbound links to attacker
    // hosts; without this check the backend would fetch those URLs server-side.
    if (u.hostname !== 'wikimezmur.org') return false;
    const p = decodeURIComponent(u.pathname).replace(/^\/am\//, '');
    if (!p || p.includes(':')) return false;
    if (/(Special|Category|File|Help|Index|Property|Concept|Wikimezmur|Home|Gospel_Singers|Classics|Jobs|Copyright|Tigrinya|Oromiffa)$/.test(p)) return false;
    return p.split('/').length >= 2;
  } catch { return false; }
}

function rankCandidates(searchHtml, title, artist) {
  let section = searchHtml;
  const idx = searchHtml.indexOf('mw-search-results');
  if (idx >= 0) section = searchHtml.slice(idx, idx + 20000);

  const re = /<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const seen = new Set();
  const out = [];
  let m;
  const tn = norm(title);
  const an = norm(artist);
  while ((m = re.exec(section)) !== null) {
    const href = m[1];
    let url;
    try {
      url = href.startsWith('http')
        ? href
        : (href.startsWith('/') ? `https://wikimezmur.org${href}` : `https://wikimezmur.org/${href}`);
      if (href.includes('index.php?title=')) {
        const t = new URLSearchParams(href.split('?')[1]).get('title');
        if (t && !t.includes(':')) url = `${BASE}/${t.replace(/ /g, '_')}`;
      }
    } catch { continue; }
    if (!isSongPageUrl(url) || seen.has(url)) continue;
    seen.add(url);
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' '));
    const tn2 = norm(text);
    let score = (url.match(/\//g) || []).length;
    if (tn && tn2.includes(tn)) score += 4;
    if (an && tn2.includes(an)) score += 2;
    out.push({ url, score, text });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

async function findLyrics(title, artist) {
  const queries = [title, `${title} ${artist || ''}`.trim()];
  for (const q of queries) {
    if (!q) continue;
    const searchUrl = `${BASE}/Special:Search?search=${encodeURIComponent(q)}&fulltext=1`;
    let searchHtml;
    try { searchHtml = await fetchText(searchUrl); }
    catch { continue; }
    // Fast path: an exact "go" match may return the song page directly.
    const direct = extractPoem(searchHtml);
    if (direct && hasAmharic(direct) && direct.length > 40) {
      return { lyrics: direct, source: searchUrl };
    }
    for (const c of rankCandidates(searchHtml, title, artist)) {
      try {
        const html = await fetchText(c.url);
        const lyrics = extractPoem(html);
        if (lyrics && hasAmharic(lyrics) && lyrics.length > 40) {
          return { lyrics, source: c.url };
        }
      } catch { /* try next */ }
    }
  }
  return null;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const title = (body.title || '').toString().trim();
    const artist = (body.artist || body.composer || '').toString().trim();
    if (!title) return Response.json({ error: 'title is required' }, { status: 400 });
    if (title.length > 120 || artist.length > 120) {
      return Response.json({ error: 'query too long' }, { status: 400 });
    }

    const found = await findLyrics(title, artist);
    if (!found) {
      return Response.json({
        found: false,
        message: 'መዝሙሩ በዊኪመዝሙር ላይ አልተገኘም፤ እባክዎ በእጅ ያስገቡ።',
      });
    }
    return Response.json({ found: true, lyrics: found.lyrics, source: found.source });
  } catch (error) {
    return Response.json({
      found: false,
      message: 'መዝሙሩ በዊኪመዝሙር ላይ አልተገኘም፤ እባክዎ በእጅ ያስገቡ።',
      error: String(error?.message || error).slice(0, 200),
    }, { status: 200 });
  }
}