# everyversepainted.com

Static site for Every Verse Painted, the King James Bible painted, animated and narrated word for word.

- `index.html` is the landing page (hero, promise, Genesis 1 gallery with KJV captions, coming first, FAQ).
- `assets/img/` holds images rendered from `../bible-animation` stills (800/1600 widths, OG card 1200x630, icons).
- `CNAME`, `robots.txt`, `sitemap.xml`, `404.html`.

Preview locally: `python -m http.server 8765` then open http://127.0.0.1:8765/

## To do
- Host: GitHub Pages (CNAME is already set) or Cloudflare Pages, then Namecheap DNS (A records to GitHub Pages IPs plus a www CNAME).
- Analytics: free Cloudflare Web Analytics or GoatCounter (needs Evan's account); paste the snippet before `</head>`.
- Email signup (Buttondown or Kit, double opt-in) once Evan creates the account.
- Phase 2: one page per chapter at `/<book>/<chapter>/` with the embedded video and full KJV text with verse anchors, generated from the bible-animation data.
