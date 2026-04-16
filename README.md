# Nexora — AI-Powered Interview Preparation Platform

Nexora is a full-stack web application that helps job candidates practice and improve their interview skills through AI-driven simulated interviews with real-time feedback and performance analysis.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            USER BROWSER                             │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │              React Frontend  (Vite + TypeScript)            │   │
│   │                                                             │   │
│   │  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  │   │
│   │  │ Landing  │  │Dashboard │  │ Interview │  │ Reports  │  │   │
│   │  │   Page   │  │          │  │  Session  │  │          │  │   │
│   │  └──────────┘  └──────────┘  └───────────┘  └──────────┘  │   │
│   │                                                             │   │
│   │         TanStack Query · Wouter · shadcn/ui · Tailwind      │   │
│   └────────────────────────┬────────────────────────────────────┘   │
│                            │  HTTP / WebSocket                      │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Express.js Server  (Node 20)                     │
│                                                                     │
│   ┌─────────────┐   ┌──────────────┐   ┌───────────────────────┐   │
│   │  REST API   │   │  WebSocket   │   │   Static File Serve   │   │
│   │  /api/*     │   │  (ws)        │   │   (Vite build output) │   │
│   └──────┬──────┘   └──────┬───────┘   └───────────────────────┘   │
│          │                 │                                        │
│   ┌──────▼─────────────────▼──────┐   ┌───────────────────────┐   │
│   │     Passport.js Auth          │   │   Drizzle ORM          │   │
│   │  (Local + OpenID Sessions)    │   │   (Type-safe queries)  │   │
│   └───────────────────────────────┘   └───────────┬───────────┘   │
└───────────────────────────┬───────────────────────┼────────────────┘
                            │                       │
               ┌────────────▼──────┐      ┌─────────▼──────────┐
               │   OpenAI API      │      │    PostgreSQL 16    │
               │   (GPT-5)         │      │                    │
               │   Interview &     │      │  users · domains   │
               │   answer analysis │      │  sessions · answers│
               └───────────────────┘      │  questions·reports │
                                          └────────────────────┘
                            │
               ┌────────────▼──────────────┐
               │   Python AI Microservice  │
               │   FastAPI + LangChain     │
               │   (Resume analysis &      │
               │    Google GenAI)          │
               └───────────────────────────┘
```

**Request flow:**
1. User interacts with the React SPA in the browser
2. REST calls hit the Express server on port 5000
3. Passport handles session-based authentication (PostgreSQL session store)
4. Drizzle ORM reads/writes to PostgreSQL
5. Interview answers are forwarded to OpenAI GPT-5 for scoring
6. WebSocket streams real-time behavioral feedback during live sessions
7. Resume uploads are processed by the FastAPI Python microservice

---

## Features

- **AI-Powered Analysis** — Interview responses analyzed using OpenAI GPT-5 for verbal and non-verbal feedback
- **Multi-Domain Interviews** — Practice across Software Engineering, Marketing, Finance, HR, and more
- **Difficulty Levels** — Beginner, Intermediate, and Advanced question sets
- **Real-Time Feedback** — Live behavioral indicators during interview sessions (posture, eye contact)
- **Performance Reports** — Detailed post-interview scoring with verbal/non-verbal breakdowns
- **Session History** — Track progress across multiple interview sessions
- **Resume AI Service** — FastAPI microservice for resume-aware interview personalization
- **Dark/Light Theme** — Full theme toggle support
- **Multilingual Support** — Built for diverse users

---

## Tech Stack

### Frontend
| Technology | Version |
|---|---|
| React | 18.3.1 |
| TypeScript | 5.6.3 |
| Vite | 5.4.20 |
| Tailwind CSS | 3.4.17 |
| shadcn/ui + Radix UI | latest |
| TanStack React Query | 5.60.5 |
| Framer Motion | 11.13.1 |
| Wouter (routing) | 3.3.5 |

### Backend
| Technology | Version |
|---|---|
| Node.js | 20 |
| Express.js | 4.21.2 |
| PostgreSQL | 16 |
| Drizzle ORM | 0.39.3 |
| Passport.js | 0.7.0 |
| WebSocket (ws) | 8.18.0 |

### AI Microservice
| Technology | Purpose |
|---|---|
| FastAPI | Python API server |
| LangChain + Google GenAI | AI processing |
| PyPDF | Resume parsing |

---

## Project Structure

```
Nexora/
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── pages/           # Landing, Dashboard, Interview, Reports
│       ├── components/      # Reusable UI components
│       ├── hooks/           # Custom React hooks
│       └── lib/             # Utilities, query client
├── server/                  # Express backend
│   ├── index.ts             # Server entry point
│   ├── routes.ts            # API routes
│   ├── db.ts                # Drizzle ORM connection
│   ├── storage.ts           # Database operations
│   └── services/            # AI/Resume microservices
├── shared/                  # Shared TypeScript types & schema
│   └── schema.ts            # Drizzle schema + Zod validation
├── render.yaml              # Render.com deployment config
├── drizzle.config.ts        # ORM migration config
└── tailwind.config.ts       # Tailwind CSS config
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Python 3.10+ (for the AI microservice)
- An OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/Umair0092/Nexora.git
cd Nexora

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/nexora
OPENAI_API_KEY=your_openai_api_key
PORT=5000
```

### Database Setup

```bash
# Push schema to PostgreSQL
npm run db:push
```

### Running in Development

```bash
npm run dev
```

This starts the Express server with Vite HMR on [http://localhost:5000](http://localhost:5000).

### Building for Production

```bash
npm run build
npm run start
```

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/auth/user` | Get current authenticated user |
| GET | `/api/domains` | List available interview domains |
| GET | `/api/sessions` | Get user's interview history |
| POST | `/api/sessions` | Start a new interview session |
| GET | `/api/sessions/:id` | Get session details |
| GET | `/api/sessions/stats` | Get user performance statistics |
| POST | `/api/answers` | Submit an interview answer |
| GET | `/api/reports/:sessionId` | Get performance report |

WebSocket is available for real-time feedback during live interview sessions.

---

## Database Schema

Core tables:

- **users** — User profiles, skills, resume URL
- **domains** — Interview domains and categories
- **questions** — Questions by domain and difficulty
- **interviewSessions** — Session metadata, scores, timing
- **answers** — Responses with AI feedback and behavioral scores
- **reports** — Detailed performance reports

---

## Deployment

### Render.com (Recommended)

The `render.yaml` file includes a complete deployment configuration with a managed PostgreSQL database.

1. Push to GitHub
2. Connect to [Render.com](https://render.com)
3. Import the repository — Render auto-detects `render.yaml`
4. Add environment variables in the Render dashboard

### Replit

The `.replit` config is included for one-click development on Replit. Set `DATABASE_URL` and `OPENAI_API_KEY` in Replit Secrets.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push and open a Pull Request

---

## License

This project is developed as a semester project. See the repository for licensing details.

---

## Links

- **GitHub**: [https://github.com/Umair0092/Nexora](https://github.com/Umair0092/Nexora)
- **Design Guidelines**: [design_guidelines.md](design_guidelines.md)
