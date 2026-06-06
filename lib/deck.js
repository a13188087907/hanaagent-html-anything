const SLIDE_RE = /<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi;

export function isDeck(html) {
  if (!html) return false;
  SLIDE_RE.lastIndex = 0;
  return SLIDE_RE.test(html);
}

function pick(re, src) {
  const m = re.exec(src);
  return m ? m[1] : "";
}

function extractAttr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i");
  return pick(re, tag);
}

function stripTags(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDeck(fullHtml) {
  if (!isDeck(fullHtml)) return { isDeck: false, slides: [] };

  const head = pick(/<head\b[^>]*>([\s\S]*?)<\/head>/i, fullHtml);
  const bodyTag = pick(/<body\b([^>]*)>/i, fullHtml);
  const bodyClass = extractAttr(bodyTag, "class");
  const bodyStyle = extractAttr(bodyTag, "style");
  const title = stripTags(pick(/<title\b[^>]*>([\s\S]*?)<\/title>/i, head)) || "deck";

  const slides = [];
  SLIDE_RE.lastIndex = 0;
  let m;
  let idx = 0;

  while ((m = SLIDE_RE.exec(fullHtml))) {
    idx += 1;
    const sectionHtml = m[0];
    const openTag = pick(/<section\b[^>]*>/i, sectionHtml);
    const dataId = extractAttr(openTag, "data-slide-id");
    const inlineStyle = extractAttr(openTag, "style");
    const bg = pick(/background(?:-color)?\s*:\s*([^;"']+)/i, inlineStyle).trim() || undefined;

    let notes = "";
    const slideForRender = sectionHtml.replace(
      /<aside\b[^>]*\bclass\s*=\s*["'][^"']*\bnotes\b[^"']*["'][^>]*>([\s\S]*?)<\/aside>/i,
      (_full, inner) => {
        notes = stripTags(inner);
        return "";
      },
    );

    const standalone =
      `<!DOCTYPE html><html><head>${head}\n` +
      `<style>
  html, body { margin:0; padding:0; }
  body { display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .slide { transform-origin: center center !important; }
</style></head>` +
      `<body class="${bodyClass}" style="${bodyStyle}">${slideForRender}</body></html>`;

    slides.push({ html: standalone, notes, id: dataId || String(idx), bg });
  }

  return { isDeck: slides.length > 0, slides, head, bodyClass, bodyStyle, title };
}
