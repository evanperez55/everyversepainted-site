# Every Verse Painted site — agent instructions

Static marketing site for https://everyversepainted.com (the Bible animation project lives in `../bible-animation`).

- Plain HTML/CSS, no framework, no build step. Every word must be in the served HTML (no JS-rendered content).
- Every page sets its OWN `<link rel="canonical">` (neurovai.org shipped every page canonical to "/"; don't repeat it).
- Every Scripture quote must match the KJV exactly. Verify against `../bible-animation/data/kjv/verses.jsonl` before committing (mid-sentence quotes keep lowercase and a leading ellipsis).
- CTAs only point at things that exist. No placeholder email forms: when email signup is added, use a provider with double opt-in plus a honeypot (bot signups flooded the dopamine app).
- URL scheme is permanent from day one: chapter pages will live at `/<book>/<chapter>/` (e.g. `/genesis/1/`).
- Update `sitemap.xml` lastmod when content changes; keep `robots.txt` pointing at it.
- Publishing (pushing to the live host, DNS changes) needs Evan's explicit OK.
