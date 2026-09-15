# HireMailer — Frontend

**Live demo:** [hiremailer-frontend.vercel.app](https://hiremailer-frontend.vercel.app/)

HireMailer is a web app that lets a company send a single email template to a whole list of job applicants at once — with each recipient's **name** and **role** automatically swapped in — straight from the company's own connected Gmail account.

This repository is the **frontend** (React + Vite). It talks to a separate FastAPI backend, which handles Google OAuth, storing applicants, and actually sending the emails through the Gmail API.

## How it works

1. **Connect Gmail** — the company signs in with Google and grants permission to send email on their behalf (OAuth2).
2. **Upload applicants** — a CSV or Excel file with `name`, `role`, and `email` columns. Duplicate rows and files that exceed Gmail's daily sending limit are flagged automatically.
3. **Compose** — write one subject and body using `{{name}}` and `{{role}}` placeholders, with a live preview of exactly what the first applicant will receive.
4. **Dispatch** — emails go out one at a time with a short delay between each, so nothing trips Gmail's spam or rate-limit protections. Progress updates live, and a batch can be stopped mid-send if needed.

## Tech stack

- **React** (Vite)
- Plain CSS — a custom "mailroom / dispatch ledger" visual identity (no UI framework)
- Talks to the backend over a REST API, authenticated with a signed session token issued after the Google OAuth flow

## Local development

```bash
git clone https://github.com/hamaisahmed862-netizen/hiremailer-frontend.git
cd hiremailer-frontend
npm install
npm run dev
```

The app expects a backend to be running and reachable — see the [backend repo](https://github.com/hamaisahmed862-netizen/hiremailer) for setup.

### Environment variables

Create a `.env` file in the project root (or set this in your deployment platform):

| Variable | Description | Example |
|---|---|---|
| `VITE_BACKEND_URL` | Base URL of the running backend API | `http://localhost:8000` (local) or your deployed backend URL |

If unset, it defaults to `http://localhost:8000` for local development.

## Project structure

```
frontend/
├── src/
│   ├── App.jsx       # main app — all steps (connect, upload, compose, dispatch)
│   ├── App.css       # visual styling
│   ├── index.css     # global base styles
│   ├── main.jsx      # React entry point
│   └── assets/       # static images (hero image, default icons)
├── index.html
└── package.json
```

## Related repository

- **Backend (FastAPI, Google OAuth, Gmail API, database):** [hiremailer](https://github.com/hamaisahmed862-netizen/hiremailer)

## Status

Actively developed as a personal/portfolio project.