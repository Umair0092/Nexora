# Nexora — AI-Powered Interview Preparation Platform

Nexora is a full-stack platform that helps candidates prepare for technical interviews through mock sessions, real-time nonverbal analysis, and AI-driven verbal feedback. It combines computer vision, speech transcription, and large language models to evaluate both what you say and how you present yourself.

---

## Features

- **Mock Interviews** — Domain-specific sessions (Data Science, ML, Software Engineering, etc.) with configurable difficulty and question count
- **Resume Parsing** — Upload a PDF resume; Nexora extracts your background and generates tailored interview questions
- **AI Answer Evaluation** — Each response is scored 0–100 with detailed strengths, weaknesses, and feedback powered by Gemini 2.0 via OpenRouter
- **Real-Time Nonverbal Analysis** — Live webcam tracking of gaze, head pose, eye openness, blink rate, facial expressions, and hand movement via MediaPipe
- **Attention Scoring** — Continuous attentiveness score (ATTENTIVE / PARTIALLY ATTENTIVE / DISENGAGED) streamed over WebSocket
- **Performance Reports** — Post-session reports with overall, verbal, and nonverbal scores plus behavioral notes and improvement recommendations
- **Session History** — Dashboard to review past sessions and track progress over time

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
| Express Gateway + React | 5000 | Proxy routing, auth, static assets |
| Rails API | 3000 | Users, sessions, answers, reports (REST) |
| Resume AI Service | 8000 | PDF parsing, LLM interview sessions, Whisper transcription |
| Interview Feedback | 8001 | CSV-based quiz questions, AI answer scoring |
| Nonverbal Cues | 8765 | Real-time MediaPipe + OpenCV analysis over WebSocket |
| PostgreSQL | 5432 | Primary database for all services |

---

## Tech Stack

**Frontend**
- React 19 + TypeScript, Vite, Tailwind CSS
- Radix UI, Framer Motion, Recharts, Lucide React
- React Query, React Hook Form + Zod, Wouter

**Gateway / Backend**
- Express.js (TypeScript), Drizzle ORM, Zod, Passport.js, WebSockets
- Rails 8.1 (Ruby), Puma, JWT, Bcrypt, PostgreSQL

**AI / ML Microservices**
- FastAPI + Uvicorn (Python)
- LangChain + OpenRouter (Gemini 2.0 Flash)
- Groq Whisper API (speech transcription)
- MediaPipe (pose, hands, face mesh)
- OpenCV (video processing)

---

## Prerequisites

- **Node.js** 20+ and **npm**
- **Ruby** 3.3+ and **Bundler**
- **Python** 3.11+
- **PostgreSQL** 15+
- API keys: OpenRouter, Groq

---

## Getting Started

### 1. Clone and install root dependencies

```bash
git clone <repo-url>
cd nexora
npm install
```

### 2. Configure environment variables

Copy the example and fill in your API keys:

```bash
cp server/services/ai/.env.example server/services/ai/.env
```

Required variables:

```bash
# Resume AI Service
RESUME_OPENROUTER_API_KEY=sk-or-...
RESUME_GEMINI_MODEL=google/gemini-2.0-flash-001
GROQ_API_KEY=gsk_...

# Interview Feedback Service
FEEDBACK_OPENROUTER_API_KEY=sk-or-...
FEEDBACK_GEMINI_MODEL=google/gemini-2.0-flash-001

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/nexora
```

### 3. Set up the database

```bash
# Run Drizzle migrations (Express schema)
npm run db:push

# Run Rails migrations
cd Backend
bundle install
rails db:migrate
```

### 4. Start each service

**Express Gateway + React (port 5000)**
```bash
npm run dev
```

**Rails API (port 3000)**
```bash
cd Backend
rails s
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
pip install -r ../requirement.txt
uvicorn ws_server:app --host 0.0.0.0 --port 8765 --reload
```

---

## Docker (Recommended)

Bring up all services with a single command:

```bash
# Create a .env.docker with your credentials (same variables as above)
docker-compose up
```

Services started: `postgres`, `rails`, `ai-resume`, `ai-feedback`, `ai-nonverbal`, `gateway`.

---

## Available Scripts (root)

| Command | Description |
|---|---|
| `npm run dev` | Start gateway + React in development mode |
| `npm run build` | Build server (esbuild) + client (Vite) |
| `npm start` | Run built server in production |
| `npm run check` | TypeScript type check |
| `npm run db:push` | Apply Drizzle schema migrations |

---

## API Routes

The Express gateway proxies requests as follows:

| Pattern | Forwarded To | Purpose |
|---|---|---|
| `GET /api/auth/user` | Gateway | Current authenticated user |
| `GET /api/domains` | Gateway / Rails | Available interview domains |
| `GET /api/sessions` | Gateway | User's interview history |
| `POST /api/sessions` | Gateway | Create new session |
| `POST /api/sessions/:id/answers/:answerId` | Gateway → AI | Submit answer for evaluation |
| `POST /api/sessions/:id/complete` | Gateway | Finalize session & generate report |
| `POST /api/ai/*` | Resume AI (8000) | PDF parsing, LLM interview |
| `POST /api/quiz/*` | Feedback (8001) | Quiz questions & scoring |
| `WS /ws/nonverbal` | Nonverbal (8765) | Real-time video analysis |
| `POST /api/v1/auth/*` | Rails (3000) | Register / login |
| `GET /api/v1/reports/:id` | Rails (3000) | Performance report |

---

## Project Structure

```
Nexora/
├── Backend/                  # Rails 8 REST API
│   ├── app/controllers/      # auth, profile, sessions, reports
│   ├── app/models/
│   └── db/migrate/
├── front-end/                # (legacy) standalone React app
├── server/                   # Express gateway + AI microservices
│   ├── index.ts              # Server entry point
│   ├── routes.ts             # API route handlers
│   ├── storage.ts            # Drizzle DB abstraction
│   └── services/ai/
│       ├── resumeaiservice/  # Resume parsing + LLM interview (port 8000)
│       ├── interview_feedback/ # Quiz & evaluation (port 8001)
│       └── nonverbal_cues/   # MediaPipe WebSocket server (port 8765)
├── client/                   # React 19 frontend (served by gateway)
│   └── src/
│       ├── pages/
│       └── components/
├── shared/
│   └── schema.ts             # Drizzle schema + shared TypeScript types
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
