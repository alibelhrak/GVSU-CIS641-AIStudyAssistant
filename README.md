<p align="center">
  <img src="src/client/public/logo.png" alt="AI Study Assistant logo" width="96" height="96" />
</p>

<h1 align="center">AI Study Assistant</h1>

<p align="center">
  A study planner for university students: courses, deadlines, study hours and an AI study coach, all in one place.<br />
  <a href="https://gvsu-cis641-aistudyassistant.onrender.com"><b>Open the live app</b></a>
  ·
  <a href="src/README.md">Developer guide</a>
  ·
  <a href="docs/software_requirements_specification.md">Requirements</a>
</p>

---

The AI Study Assistant is a web application that helps students organize their school work in one place. Students manage their courses, assignments, exams, study schedule and course materials, and track how many hours they study for each course. The app works out where the student is behind, recommends what to study next with a concrete plan of study sessions, and includes an AI chat coach that knows the student's own deadlines and hours.

Built for **CIS 641 (Software Engineering)** at Grand Valley State University.

> The live app runs on a free server that sleeps when unused. The first visit can take about a minute to wake up.

## Features

| Area | What the student can do |
|---|---|
| **Dashboard** | See what to study next, hours studied this week against each course's goal, and what is due soon |
| **Courses** | Add courses with a weekly study-hour goal and a color |
| **Assignments & Exams** | Add tasks with a type, due date, priority and the hours they need; mark them done |
| **Study Schedule** | Plan study sessions for the week and tick them off; log extra study time |
| **Materials** | Upload files (PDFs, slides, notes, up to 20 MB) or save links for each course |
| **AI recommendations** | Get advice on what to study next, with a session plan the student can **accept** (added to the schedule) or **dismiss** |
| **Ask AI** | Chat with an AI study coach that sees the student's courses, deadlines, hours and study gaps; it plans, explains concepts and quizzes the student, with answers that appear word by word |
| **Accounts** | Sign up, sign in, and reset a forgotten password through an emailed link (valid for 30 minutes, works once) |
| **Themes** | Light, Dark, Paper, Midnight or System theme, plus five accent colors |
| **Phone app** | Install it from the browser to the home screen on iPhone or Android; it opens full screen like a normal app |

## How the AI works

The AI recommendations are designed so that the language model **can never invent hours or dates**:

1. **Rules find the study gap** for every open task due in the next 14 days:
   `gap = hours needed − hours studied − hours planned`
2. **Rules rank the tasks and build the plan:** score = gap × priority × task type × urgency. The top three get a plan of study sessions of up to 2 hours each, placed before the deadline.
3. **A language model writes the message** from those numbers only. If the model is off, slow or gives an invalid answer, the app uses rule-based text instead.
4. **The student decides:** accepting adds the sessions to the schedule; dismissing hides the advice.

The **Ask AI** chat sends the model a short summary of the student's own data (courses, open tasks, the computed study gaps and planned sessions) with each question. It is told to use only that data for personal questions and never to make up courses or deadlines.

Any OpenAI-compatible model works: [Groq](https://console.groq.com) (free, used online), OpenAI, or a local model through [Ollama](https://ollama.com). Without a model, the app still works and uses rule-based text; only the chat is turned off.

## Tech stack

| Part | Technology |
|---|---|
| Front end | React 18, Vite, React Router, plain CSS (no UI library) |
| Back end | Node.js 22, Express 5, JSON Web Token login, bcrypt password hashing, Multer file uploads |
| Database | MongoDB (MongoDB Atlas online), Mongoose |
| AI | Any OpenAI-compatible chat API (Groq `llama-3.3-70b-versatile` online) |
| Email | Brevo email API (password reset emails) |
| Hosting | Render (one web service serves the API and the built React app) |
| Local deployment | Docker Compose (MongoDB, API, and nginx serving the app) |

## Team Members and Roles

* [Ali Belhrak](https://github.com/alibelhrak/CIS641-HW2-Belhrak) (Project Manager, Analyst, Designer, Developer)

## Prerequisites

* [Git](https://git-scm.com/)
* **Either** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (simplest: runs everything with one command)
* **Or** [Node.js 22](https://nodejs.org/) and a MongoDB database (a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster or a local MongoDB)
* Optional: a free [Groq](https://console.groq.com) API key (or [Ollama](https://ollama.com)) for the AI text and the chat
* Optional: a free [Brevo](https://www.brevo.com) account to send password reset emails

## Run Instructions

### Option 1: Docker (one command)

```
git clone https://github.com/alibelhrak/GVSU-CIS641-AIStudyAssistant.git
cd GVSU-CIS641-AIStudyAssistant/src
copy .env.example .env        (macOS/Linux: cp .env.example .env)
docker compose up -d --build
```

Open http://localhost:8080, create an account, add a course, then add an exam with the study hours it needs. The Dashboard shows the recommendation.

### Option 2: Node.js (for development)

1. Create `src/server/.env` with at least:
   ```
   MONGO_URI=your MongoDB connection string
   JWT_SECRET=any long random text
   ```
2. Start the API (port 5000):
   ```
   cd src/server
   npm install
   npm run dev
   ```
3. In a second terminal, start the web app (port 5173):
   ```
   cd src/client
   npm install
   npm run dev
   ```
4. Open http://localhost:5173.

All settings (AI, email, and others) are listed in the [developer guide](src/README.md#settings).

### Run the tests

```
cd src/server
npm test
```

## Project Documents and Artifacts

* [Project Proposal](docs/proposal-template.md) ([PDF version](docs/project_proposal.pdf))
* [Software Requirements Specification](docs/software_requirements_specification.md)
* [Midterm Presentation](docs/AI_Study_Assistant_Midterm.pptx)
* [UML Class Diagram](artifacts/class_diagram.md)
* [CRC Cards](artifacts/crc_cards.md)
* [Sequence Diagram](artifacts/sequence_diagram.md)
* [State Machine Diagram](artifacts/state_machine_diagram.md)
* [Developer Guide](src/README.md): settings, API routes, deployment and project structure
