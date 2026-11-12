# Thmanyah fonts (not in Git)

Place the licensed Thmanyah `.woff2` files here on each development or build machine:

- thmanyahsans-Light.woff2 (300), thmanyahsans-Regular.woff2 (400), thmanyahsans-Medium.woff2 (500),
  thmanyahsans-Bold.woff2 (700), thmanyahsans-Black.woff2 (900)
- thmanyahserifdisplay-Bold.woff2 (700), thmanyahserifdisplay-Black.woff2 (900)

Download them from https://font.thmanyah.com and accept the Thmanyah licence. The licence allows embedding in a
bundled web application but forbids uploading or hosting the font files, so they are git-ignored and must never be
committed or attached to issues/PRs. Without them the app uses the bundled Noto Sans Arabic fallback.
