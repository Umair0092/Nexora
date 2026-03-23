# Nexora: AI-Powered Interview Prep Platform

Nexora is a comprehensive AI-driven interview preparation platform that offers personalized interview experiences based on custom CVs or target roles. It features real-time voice transcription, automatic AI interviewer speech, and detailed performance evaluation matrices.

## 🚀 Architecture Overview

Nexora is built as a microservices-based application:

1.  **Frontend (React/Vite)**: Located in `/client`. A modern, responsive UI built with Tailwind CSS and Shadcn UI.
2.  **Backend (Rails 8.1)**: Located in `/Backend`. Manages user authentication, profile data, and persists interview history/reports.
3.  **AI Microservice (FastAPI)**: Located in `/server/services/ai/resumeaiservice`. Handles resume parsing, dynamic interview generation, and evaluation using LLMs.
4.  **Gateway Proxy (Node.js/Express)**: Located in the root. Orchestrates requests between the frontend and the two backend services.

---

## 🛠️ Prerequisites

- **Ruby**: 3.2+
- **Node.js**: 20+
- **Python**: 3.10+
- **PostgreSQL**: 14+
- **API Keys**:
    - [OpenRouter API Key](https://openrouter.ai/) (for LLM logic)
    - [Groq API Key](https://console.groq.com/) (for free high-speed Whisper transcription)

---

## ⚙️ Installation & Setup

### 1. Backend (Rails)
```bash
cd Backend
bundle install
rails db:create db:migrate
rails s -p 3000
```

### 2. AI Service (Python)
```bash
cd server/services/ai/resumeaiservice
pip install -r req.txt
```
Create a `.env` file in this directory:
```env
OPENROUTER_API_KEY="your_key"
GROQ_API_KEY="your_key"
GEMINI_MODEL="google/gemini-2.0-flash-001"
```
Run the service:
```bash
uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend & Gateway
From the root directory:
```bash
npm install
npm run dev
```
The gateway will run on **http://localhost:5001**. This is the URL you should use to access the application.

---

## 💡 Important Instructions

- **Always use the Gateway**: Access the app via port `5001`. Do not try to access the React dev server or Rails directly, as the proxy handles critical API routing.
- **Microphone Support**: Ensure your browser has microphone permissions enabled. We use **Groq Whisper** for high-fidelity transcription.
- **CV Parsing**: Upload resumes in PDF format. The AI will extract skills and experience to tailor the interview.
- **Session Persistence**: Currently, AI sessions are stored in-memory in the Python service. Restarting the Python server will wipe active interview progress.

## 📦 Tech Stack
- **Frontend**: React, TanStack Query, Tailwind CSS, Lucide Icons.
- **Rails Backend**: Rails 8, PostgreSQL, Devise-style Auth.
- **AI Backend**: FastAPI, Pydantic, LangChain, OpenAI/Groq SDKs.
- **Proxy**: Express, http-proxy-middleware.
