# Nexora — AI-Powered Interview Preparation Platform

Nexora is a full-stack platform that helps candidates prepare for technical interviews through mock sessions, real-time nonverbal analysis, and AI-driven verbal feedback. It combines computer vision, speech transcription, and large language models to evaluate both what you say and how you present yourself.

---

## Features

- **Mock Interviews** — Domain-specific sessions (Data Science, ML, Software Engineering, etc.) with configurable difficulty and question count
- **Resume Parsing** — Upload a PDF resume; Nexora extracts your background and generates tailored interview questions
- **AI Answer Evaluation** — Each response is scored 0–100 with detailed strengths, weaknesses, and feedback powered by an LLM on Groq (gpt-oss-120b by default; any OpenAI-compatible provider works)
- **Real-Time Nonverbal Analysis** — Webcam tracking of gaze, head pose, eye openness, blink rate, facial expressions and hand movement with MediaPipe, run entirely in the browser: video never leaves your device, only the end-of-interview summary is saved
- **Attention Scoring** — Continuous attentiveness score (ATTENTIVE / PARTIALLY ATTENTIVE / DISENGAGED) shown live during the interview
- **Performance Reports** — Post-session reports with overall, verbal, and nonverbal scores plus behavioral notes and improvement recommendations
- **Session History** — Dashboard to review past sessions and track progress over time
- **Job-targeted interviews** — Paste a job description and the interviewer probes its requirements, especially the ones your CV covers least; the report adds a "Fit for this job" assessment
- **Behavioral (STAR) interviews** — "Tell me about a time…" questions, with each answer checked for Situation, Task, Action and Result
- **Natural interviewer voice** — Questions are read aloud with a neural voice (Groq Orpheus, cached per question); browsers fall back to their most natural built-in voice if it's unavailable
- **Speaking feedback** — Pace (words per minute), filler words and long pauses from Whisper word timestamps, per answer and overall
- **Practise weak answers** — Re-answer any report question and see the new score next to the old one; or see a stronger version of your own answer, and the model answer for quiz questions
- **Progress chart, streaks and weekly goal** — Scores over time on the dashboard, plus optional email reminders after 3 days without practice
- **Share links** — A read-only public link to a report that you can turn off at any time
- **Account** — Password reset and email confirmation by email, data export (JSON) and account deletion

---

## Architecture

One Rails app and Postgres. Rails serves the JSON API and the built React app on the same port, and talks to the AI provider directly.

```
   Browser: React app + MediaPipe (camera analysis stays on the device)
        │  HTTPS (one origin)
   ┌────▼──────────────────────────────────────────┐        ┌─────────────────────┐
   │  Rails 8 (Puma behind Thruster)               │ ─────► │ Groq (or any        │
   │  • /api/v1/*  JSON API                        │        │ OpenAI-compatible   │
   │  • everything else: the React app (public/)   │        │ API): chat, Whisper │
   │  • background jobs (Solid Queue, in Puma)     │        └─────────────────────┘
   └────┬──────────────────────────────────────────┘
   ┌────▼───────┐
   │ PostgreSQL │  users, interviews in progress, reports, job queue
   └────────────┘
```

| Part | Where | Responsibility |
|---|---|---|
| React client | `client/` | UI; camera analysis with MediaPipe in the browser (`client/src/lib/nonverbal.ts`) |
| Rails app | `Backend/` | Accounts, interviews and quizzes in progress, AI calls, scoring, reports, email, jobs |
| PostgreSQL | | The only datastore |

The AI code lives in `Backend/app/services`: `Llm` (HTTP client with retries), `CvInterview` (CV and behavioral interviews), `QuizRun` (question-bank quizzes), `AnswerCoach` (retries and rewrites), `ResumeParser` and `SpeechMetrics`. Interviews in progress are `LiveInterview` rows, so restarts and deploys don't lose them.

---

## Tech Stack

**Frontend**
- React 18 + TypeScript, Vite, Tailwind CSS
- Radix UI, Framer Motion, Lucide React
- React Query, React Hook Form + Zod, Wouter
- MediaPipe Tasks (face and hand landmarks, WebAssembly)

**Backend**
- Rails 8.1 (Ruby), Puma + Thruster, JWT, Bcrypt, PostgreSQL, Solid Queue
- Groq: gpt-oss-120b for interviews and scoring (swappable via `LLM_BASE_URL` / `LLM_MODEL`), Whisper for transcription, Orpheus for the interviewer's voice
- pdf-reader for CVs

---

## Getting Started

### With Docker (simplest)

```bash
cp .env.example .env.docker      # then fill in GROQ_API_KEY, passwords and JWT_SECRET
echo "JWT_SECRET=$(openssl rand -hex 48)" >> .env.docker
docker compose up --build        # http://127.0.0.1:5001
```

Two containers: `app` and `db`. Postgres is not published to the host; use `docker compose exec db psql -U nexora nexora_production` for a shell. Background jobs (the daily practice reminder at 9am, cleanup of abandoned interviews) run inside the app process; send reminders by hand with `docker compose exec app bin/rails nexora:send_reminders`.

A public ngrok tunnel is opt-in: `docker compose --profile tunnel up`. Anyone with the URL can reach the app, so only run it when you need to.

The app serves plain HTTP. Set `RAILS_FORCE_SSL=true` only when it sits behind HTTPS; otherwise its HSTS header pins `localhost` to HTTPS in your browser. If that has already happened, clear it at `chrome://net-internals/#hsts` (delete the domain `localhost`).

### For development

Needs Node.js 20+, Ruby 4.0 (see Backend/.ruby-version), PostgreSQL 15+ and a free Groq API key (console.groq.com).

```bash
npm install
cd Backend && bundle install && bin/rails db:prepare && cd ..
cp .env.example .env             # set GROQ_API_KEY; DATABASE_URL can point at your local Postgres
bin/dev                          # Rails on :3000, Vite on :5173 -> open http://127.0.0.1:5173
```

`bin/dev` loads `.env`, runs Rails and the Vite dev server (hot reload), and Vite forwards `/api` to Rails. Use `RAILS_PORT=3100 VITE_PORT=5180 bin/dev` if those ports are taken. Never commit real keys: `.env*` files are git-ignored; only `.env.example` is tracked.

**Email** (password resets, confirmation links, reminders): set `SMTP_ADDRESS`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` and `MAIL_FROM` for any SMTP provider (Brevo and Resend have free tiers), and `APP_URL` to the address people open the app at. Without SMTP, emails are written to `Backend/tmp/mails/<address>` and their links are logged, so resets still work locally.

---

## Tests

```bash
npm run check                    # TypeScript
npm run build                    # client build (into Backend/public)
cd Backend && bin/rails test     # Rails, including all AI code with the model stubbed (needs Postgres)
```

CI runs both on every push and pull request, plus RuboCop, Brakeman and bundler-audit.

---

## Available Scripts (root)

| Command | Description |
|---|---|
| `bin/dev` | Rails + Vite for development |
| `npm run dev` | Vite only (expects Rails on :3000, or `RAILS_URL`) |
| `npm run build` | Build the client into `Backend/public` |
| `npm run check` | TypeScript type check |

---

## Routing and security

Everything is served from one origin by Rails: `/api/v1/*` is the JSON API (JWT in the `Authorization` header), and every other path returns the React app.

- **Interviews in progress** belong to the user who started them; any other user gets a 404. Abandoned ones are deleted after 3 hours idle.
- **Scores come from the server.** Saving an interview scores it in Rails from the stored conversation, so the browser can't submit or edit scores. Retries and rewrites are scored the same way.
- **Camera video never leaves the device.** MediaPipe runs in the browser; only the summary (attention distribution, hand activity) is sent with the report.
- **Rate limits:** login, register and password reset per IP; starting interviews, answering, uploads, saving, retrying and rewriting per user.
- **Uploads:** CVs must be real PDFs (checked by content, max 10 MB); audio max 15 MB. Thruster rejects bodies over 20 MB in Docker.
- **Security headers** on every response: CSP (allowing WebAssembly for MediaPipe), `X-Frame-Options: DENY`, nosniff, Referrer-Policy and Permissions-Policy.

Main Rails endpoints:

| Method and path | Purpose |
|---|---|
| `POST /api/v1/register`, `POST /api/v1/login` | Returns `{ token, user }` |
| `GET /api/v1/me`, `GET/PUT /api/v1/profile` | Current user (camelCase keys) |
| `GET /api/v1/sessions`, `GET /api/v1/sessions/stats` | Interview history |
| `POST /api/v1/interviews`, `GET /api/v1/interviews/:id`, `POST /api/v1/interviews/:id/answer` | CV or behavioral interview in progress |
| `GET /api/v1/quizzes/categories`, `POST /api/v1/quizzes`, `GET /api/v1/quizzes/:id`, `POST /api/v1/quizzes/:id/answer` | Technical quiz in progress |
| `POST /api/v1/resume/parse`, `POST /api/v1/transcriptions` | Read a CV PDF; transcribe an answer with speech metrics |
| `POST /api/v1/speech` | The interviewer's voice: `{ text }` in, WAV out (503 when unavailable, so the browser falls back) |
| `POST /api/v1/sessions/sync_ai_session` | Save a finished interview from `{ cvSessionId?, quizSessionId?, nonverbalReport }`; Rails scores it and deletes the live interview |
| `GET /api/v1/sessions/progress` | One point per finished interview for the progress chart |
| `GET /api/v1/sessions/stats?tz=Area/City` | Totals, streaks and weekly goal progress in the user's timezone |
| `GET /api/v1/sessions/:id/report` | Full report for one interview |
| `POST /api/v1/sessions/:id/answers/:answer_id/attempts` | Retry one question; scored on the server |
| `POST /api/v1/sessions/:id/answers/:answer_id/improve` | A stronger version of the answer (generated once, then cached) |
| `POST/DELETE /api/v1/sessions/:id/share`, `GET /api/v1/shared/:token` | Create or revoke a share link; read a shared report without signing in |
| `POST /api/v1/password/forgot`, `POST /api/v1/password/reset` | Password reset by email |
| `POST /api/v1/email/verify`, `POST /api/v1/email/resend` | Email confirmation |
| `GET /api/v1/profile/export`, `DELETE /api/v1/profile` | Download all data; delete the account (needs the password) |

---

## Project Structure

```
Nexora/
├── Backend/                    # Rails app: API, AI services, jobs, mailers
│   ├── app/controllers/api/v1/
│   ├── app/services/           # Llm, CvInterview, QuizRun, AnswerCoach, ResumeParser, SpeechMetrics
│   ├── app/models/             # incl. LiveInterview (interviews in progress)
│   ├── db/data/question_bank.csv
│   └── test/
├── client/
│   ├── public/models/          # MediaPipe face and hand models
│   └── src/                    # pages, components, lib (api, nonverbal, speech)
├── bin/dev                     # development: Rails + Vite
├── Dockerfile                  # one image: builds the client, runs Rails
└── docker-compose.yml          # app + db
```

---

## Nonverbal Metrics

The browser computes these metrics live during an interview (about two frames a second):

| Metric | States |
|---|---|
| Attention | ATTENTIVE / PARTIALLY ATTENTIVE / DISENGAGED |
| Gaze | Attentive / Partial / Away |
| Head Pose | Forward / Partial / Down |
| Eye Openness | Alert / Drowsy / Half-closed |
| Blink Rate | Normal / Excessive (baseline 10–20 bpm) |
| Facial Expression | Smile / Frown / Yawn / Brow furrow |
| Hand Movement | Calm / Moderate / Excessive |

---

## License

MIT
