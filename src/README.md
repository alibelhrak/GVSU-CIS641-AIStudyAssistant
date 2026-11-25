# AI Study Assistant

A web app where students manage courses, assignments, exams, study sessions and course
materials in one place, with AI recommendations on what to study next.

**Stack:** MongoDB · Express · React (Vite) · Node.js · Docker Compose · Llama 3.2 via Ollama (optional)

## Run it with Docker

```bash
cd src
cp .env.example .env            # Windows: copy .env.example .env  — then set JWT_SECRET
docker compose up -d --build
```

Open http://localhost:8080, create an account, add a course, then add an exam with
"study hours needed". The Dashboard shows the recommendation.

### Turn on the LLM (optional)
Install Ollama, run `ollama pull llama3.2`, then set in `.env`:
```
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.2
```
and run `docker compose up -d`. Without an LLM the app still works and uses rule-based text.

## How the AI recommendation works

1. **Rules find the study gap** for every open task due in the next 14 days:
   `gap = hours needed − hours studied − hours planned`
2. **Rules rank and plan:** score = gap × priority × task type × urgency; the top 3 get a plan
   of sessions of up to 2 hours before the deadline.
3. **The LLM writes the message and reason** from those numbers only. If it is off, slow or
   returns invalid output, rule-based text is used.
4. **The student accepts** (sessions are added to the schedule) **or dismisses** the advice.

The LLM never decides hours or dates, so it cannot invent numbers in the student's schedule.

## Run it for development

```bash
docker run -d --name study-mongo -p 27017:27017 mongo:7
cd src/server && npm install && npm run dev     # API on :5000
cd src/client && npm install && npm run dev     # app on http://localhost:5173
```

## Tests

```bash
cd src/server
npm test
```

## Project structure

```
src/
  docker-compose.yml
  server/   Express API: auth, courses, tasks, sessions, logs, materials, recommendations
    src/services/recommendationEngine.js   rules (gap, ranking, plan)
    src/services/llm.js                    LLM text with rule-based fallback
    test/engine.test.js                    unit tests
  client/   React app: Dashboard, Courses, Assignments & Exams, Study Schedule, Materials
```
