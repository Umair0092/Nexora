# Nexora — AI-Powered Interview Preparation Platform

Nexora is a full-stack platform that helps candidates prepare for technical interviews through mock sessions, real-time nonverbal analysis, and AI-driven verbal feedback. It combines computer vision, speech transcription, and large language models to evaluate both what you say and how you present yourself.

---

## Features

- **Mock Interviews** — Domain-specific sessions (Data Science, ML, Software Engineering, etc.) with configurable difficulty and question count
- **Resume Parsing** — Upload a PDF resume; Nexora extracts your background and generates tailored interview questions
- **AI Answer Evaluation** — Each response is scored 0–100 with detailed strengths, weaknesses, and feedback powered by an LLM on Groq (gpt-oss-120b by default; any OpenAI-compatible provider works)
- **Real-Time Nonverbal Analysis** — Live webcam tracking of gaze, head pose, eye openness, blink rate, facial expressions, and hand movement via MediaPipe
- **Attention Scoring** — Continuous attentiveness score (ATTENTIVE / PARTIALLY ATTENTIVE / DISENGAGED) streamed over WebSocket
- **Performance Reports** — Post-session reports with overall, verbal, and nonverbal scores plus behavioral notes and improvement recommendations
- **Session History** — Dashboard to review past sessions and track progress over time
- **Job-targeted interviews** — Paste a job description and the interviewer probes its requirements, especially the ones your CV covers least; the report adds a "Fit for this job" assessment
- **Behavioral (STAR) interviews** — "Tell me about a time…" questions, with each answer checked for Situation, Task, Action and Result
- **Speaking feedback** — Pace (words per minute), filler words and long pauses from Whisper word timestamps, per answer and overall
- **Practise weak answers** — Re-answer any report question and see the new score next to the old one; or see a stronger version of your own answer, and the model answer for quiz questions
- **Progress chart, streaks and weekly goal** — Scores over time on the dashboard, plus optional email reminders after 3 days without practice
- **Share links** — A read-only public link to a report that you can turn off at any time
- **Account** — Password reset and email confirmation by email, data export (JSON) and account deletion

---

## Architecture

```
                         ┌─────────────────────────────┐
                         │    Browser (React + Vite)   │
                         └──────────────┬──────────────┘
                                        │ HTTP / WebSocket
                         ┌──────────────▼──────────────┐
                         │  Express Gateway  (port 5000) │
                         └──┬──────────┬───────────┬───┘
                /api/ai/*   │          │ /api/*    │ /ws/nonverbal
     ┌──────────────────────▼──┐  ┌────▼────────┐  ┌─▼──────────────────┐
     │  Resume AI Service      │  │ Rails API   │  │ Nonverbal Service   │
     │  FastAPI  (port 8000)   │  │ (port 3000) │  │ FastAPI + WS (8765) │
     └─────────────────────────┘  └─────────────┘  └────────────────────┘
                /api/quiz/*
     ┌──────────────────────────┐
     │  Interview Feedback Svc  │
     │  FastAPI  (port 8001)    │
     └──────────────────────────┘
                         ┌─────────────────────────────┐
                         │    PostgreSQL  (port 5432)  │
                         └─────────────────────────────┘
```

| Service | Port | Responsibility |
|---|---|---|
| Express Gateway + React | 5000 | Proxy routing, JWT checks, rate limits, static assets |
| Rails API | 3000 | Users, sessions, answers, reports (REST) |
| Resume AI Service | 8000 | PDF parsing, LLM interview sessions, Whisper transcription |
| Interview Feedback | 8001 | CSV-based quiz questions, AI answer scoring |
| Nonverbal Cues | 8765 | Real-time MediaPipe + OpenCV analysis over WebSocket |
| PostgreSQL | 5432 | Primary database for all services |

---

## Tech Stack

**Frontend**
- React 18 + TypeScript, Vite, Tailwind CSS
- Radix UI, Framer Motion, Recharts, Lucide React
- React Query, React Hook Form + Zod, Wouter

**Gateway / Backend**
- Express.js (TypeScript) gateway, http-proxy-middleware
- Rails 8.1 (Ruby), Puma, JWT, Bcrypt, PostgreSQL

**AI / ML Microservices**
- FastAPI + Uvicorn (Python)
- LangChain + Groq (gpt-oss-120b; swappable via LLM_BASE_URL / LLM_MODEL)
- Groq Whisper API (speech transcription)
- MediaPipe (pose, hands, face mesh)
- OpenCV (video processing)

---

## Prerequisites

- **Node.js** 20+ and **npm**
- **Ruby** 3.3+ and **Bundler**
- **Python** 3.11+
- **PostgreSQL** 15+
- A free Groq API key (console.groq.com)

---

## Getting Started

### 1. Clone and install root dependencies

```bash
git clone <repo-url>
cd nexora
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.docker                                  # Docker stack
cp server/services/ai/.env.example server/services/ai/.env   # running AI services locally
```

Generate a shared JWT secret: Rails signs tokens with it and the gateway verifies them before forwarding anything to the AI services.

```bash
echo "JWT_SECRET=$(openssl rand -hex 48)" >> .env.docker
```

Never commit real keys. `.env*` files are git-ignored; only the `.example` files are tracked.

**Email** (password resets, confirmation links, reminders): set `SMTP_ADDRESS`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` and `MAIL_FROM` for any SMTP provider (Brevo and Resend have free tiers), and `APP_URL` to the address people open the app at. Without SMTP, emails are written to `Backend/tmp/mails/<address>` (inside the `rails` container under Docker) and their links are logged, so resets still work locally.

### 3. Set up the database

```bash
cd Backend
bundle install
bin/rails db:prepare
```

Rails owns the whole schema. The gateway has no database of its own.

### 4. Start each service

Export the same `JWT_SECRET` in the shells for Rails and the gateway.

**Express Gateway + React (port 5000)**
```bash
npm run dev
```

**Rails API (port 3000)**
```bash
cd Backend
bin/rails s
```

**Resume AI Service (port 8000)**
```bash
cd server/services/ai/resumeaiservice
pip install -r req.txt
uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```

**Interview Feedback Service (port 8001)**
```bash
cd server/services/ai/interview_feedback
pip install -r requirements.txt
uvicorn api:app --host 127.0.0.1 --port 8001 --reload
```

**Nonverbal Cues Service (port 8765)**
```bash
cd server/services/ai/nonverbal_cues
pip install -r requirements.txt
uvicorn ws_server:app --host 127.0.0.1 --port 8765 --reload
```

---

## Docker (Recommended)

```bash
docker compose up --build        # app on http://localhost:5001
```

Services: `db`, `rails`, `ai-resume`, `ai-feedback`, `ai-nonverbal`, `gateway`. Postgres is not published to the host; use `docker compose exec db psql -U nexora nexora_production` for a shell.

- In-progress interviews are stored in Postgres (`ai_sessions`), so restarting or redeploying the AI services doesn't lose them.
- Background jobs run inside the Rails web process (`SOLID_QUEUE_IN_PUMA`), including the daily practice-reminder email at 9am. Run it by hand with `docker compose exec rails bin/rails nexora:send_reminders`.

A public ngrok tunnel is opt-in: `docker compose --profile tunnel up`. Anyone with the URL can reach the app, so only run it when you need to.

Rails serves plain HTTP behind the gateway. Set `RAILS_FORCE_SSL=true` only when Rails itself sits behind HTTPS; otherwise its HSTS header pins `localhost` to HTTPS in your browser. If that has already happened, clear it at `chrome://net-internals/#hsts` (delete the domain `localhost`).

---

## Tests

```bash
npm run check                                              # TypeScript
cd Backend && bin/rails test                               # Rails API (needs Postgres)
cd server/services/ai/interview_feedback && pytest tests   # quiz service
cd server/services/ai/resumeaiservice && pytest tests      # resume / CV interview service
```

Run each Python suite from its own folder: both services have modules named `api` and `session`. CI runs all of these on every pull request. The session-store tests also run against Postgres when you set `TEST_DATABASE_URL` (e.g. `createdb nexora_ai_test && TEST_DATABASE_URL=postgresql:///nexora_ai_test pytest tests`).

---

## Available Scripts (root)

| Command | Description |
|---|---|
| `npm run dev` | Start gateway + React in development mode |
| `npm run build` | Build client (Vite) + gateway bundle (esbuild) |
| `npm start` | Run built gateway in production |
| `npm run check` | TypeScript type check |

---

## Routing and security

The Express gateway is the only public entry point. It serves the React app and proxies:

| Pattern | Forwarded to | Auth |
|---|---|---|
| `/api/v1/*` | Rails (3000) | Rails verifies the JWT itself |
| `/api/ai/*` | Resume AI (8000) | Gateway verifies the JWT and forwards `X-User-Id` |
| `/api/quiz/*` | Quiz service (8001) | Gateway verifies the JWT and forwards `X-User-Id` |
| `WS /ws/nonverbal?token=…` | Nonverbal (8765) | Gateway verifies the token and checks Origin on upgrade |

Other protections:

- **AI sessions** are bound to the user who created them; any other user gets a 404.
- **Scores come from the server.** When an interview is saved, Rails fetches the evaluation from the AI services itself (server-to-server, as that user), so the browser can't submit or edit scores. Retries and rewrites are scored the same way.
- **Rate limits:**
  - LLM and transcription calls are limited per user at the gateway.
  - Login, register and password reset are limited per IP in Rails; saving, retrying and rewriting answers are limited per user.
- **Security headers:** the gateway sets CSP, X-Frame-Options, nosniff and Referrer-Policy.

Main Rails endpoints:

| Method and path | Purpose |
|---|---|
| `POST /api/v1/register`, `POST /api/v1/login` | Returns `{ token, user }` |
| `GET /api/v1/me`, `GET/PUT /api/v1/profile` | Current user (camelCase keys) |
| `GET /api/v1/sessions`, `GET /api/v1/sessions/stats` | Interview history |
| `POST /api/v1/sessions/sync_ai_session` | Save a finished interview from `{ cvSessionId?, quizSessionId?, nonverbalReport }`; Rails fetches and sanitises the evaluation |
| `GET /api/v1/sessions/progress` | One point per finished interview for the progress chart |
| `GET /api/v1/sessions/stats?tz=Area/City` | Totals, streaks and weekly goal progress in the user's timezone |
| `GET /api/v1/sessions/:id/report` | Full report for one interview |
| `POST /api/v1/sessions/:id/answers/:answer_id/attempts` | Retry one question; scored by the AI service |
| `POST /api/v1/sessions/:id/answers/:answer_id/improve` | A stronger version of the answer (generated once, then cached) |
| `POST/DELETE /api/v1/sessions/:id/share`, `GET /api/v1/shared/:token` | Create or revoke a share link; read a shared report without signing in |
| `POST /api/v1/password/forgot`, `POST /api/v1/password/reset` | Password reset by email |
| `POST /api/v1/email/verify`, `POST /api/v1/email/resend` | Email confirmation |
| `GET /api/v1/profile/export`, `DELETE /api/v1/profile` | Download all data; delete the account (needs the password) |

---

## Project Structure

```
Nexora/
├── Backend/                    # Rails 8 REST API (users, sessions, reports)
│   ├── app/controllers/api/v1/
│   ├── app/serializers/
│   ├── db/migrate/
│   └── test/integration/
├── server/
│   ├── index.ts                # Gateway: proxying, auth, rate limits, headers
│   ├── auth.ts                 # JWT verification + rate limiter
│   └── services/ai/
│       ├── resumeaiservice/    # CV parsing, CV interview, Whisper (port 8000)
│       ├── interview_feedback/ # Technical quiz + evaluation (port 8001)
│       └── nonverbal_cues/     # MediaPipe WebSocket server (port 8765)
├── client/src/
│   ├── pages/
│   ├── components/             # app components + ui/ (shadcn)
│   └── lib/                    # api client, types
├── docker-compose.yml
└── package.json
```

---

## Nonverbal Metrics

The nonverbal service streams the following metrics live during an interview:

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
