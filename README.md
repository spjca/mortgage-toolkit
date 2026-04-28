# Mortgage Toolkit

Static mortgage affordability + amortization calculator.

## Live deployment

This project is already deployed on GitHub Pages at:

- https://spjca.github.io/mortgage-toolkit/

## Run locally

Because this is a static app, you can run it from any static file server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Host from GitHub

If you need to redeploy from this repo, use **GitHub Pages**:

1. Push to GitHub.
2. In repository **Settings → Pages**.
3. Set source to **Deploy from a branch**.
4. Choose your default branch and `/ (root)`.
5. Save; your site will publish to the same URL above.

No backend is required.

## Merge conflict guidance

Short answer: **do not blindly choose “Incoming” for every conflict**.

Use this checklist:

1. If the conflict is in files you intentionally changed in your branch, prefer **Current** and manually merge needed parts from Incoming.
2. If the conflict is in files only touched upstream (and unrelated to your change), prefer **Incoming**.
3. For shared files (`src/app.js`, `index.html`, styles), do a manual merge and keep:
   - your bug fix,
   - upstream structural updates,
   - and rerun tests before commit.

For this repo’s recent vendor-loader issues, choosing Incoming everywhere can reintroduce the old path/loader behavior.
