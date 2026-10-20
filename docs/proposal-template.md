Team name: AIStudyAssistant

Team members: Ali Belhrak

# Introduction

I propose the AI Study Assistant, a web application that puts a student's courses, assignments, exams, deadlines, study schedule, and course materials in one place. Students today spread their school work across many tools: the learning management system for due dates, a calendar or paper planner for study time, a notes app or cloud folder for slides and readings, and usually nothing at all for how much they have studied each course. Because these tools do not share information, a student can see that an exam is coming but not that they have studied that course much less than the others, and they often notice the gap only a day or two before the exam.

The system lets a student create courses, add assignments, exams, quizzes, projects, and readings with due dates and priorities, build a weekly study schedule, upload and organize course files and links, and log study time. It shows upcoming deadlines, reminds the student about work due within two days, and tracks hours studied against a weekly goal for each course.

The main feature is an AI study assistant. For each upcoming task, the system compares the study hours the task needs with the hours the student has already studied and planned for that course. It then recommends up to three courses to focus on, each with a short reason and a suggested plan of study sessions. For example, if a student has an exam in three days and has not studied for that course, the system recommends that course first. The student can accept the recommendation, which adds the sessions to the schedule, or dismiss it.

The recommender is a hybrid. Fixed rules calculate the study gap, rank the tasks, and build the session plan, and a pretrained large language model (LLM) only writes the explanation the student reads. Because the LLM never sets the numbers, an invented hour or date cannot reach the student's schedule, and if the LLM is slow or unavailable, rule-based text is used instead.

# Anticipated Technologies

* **Front end:** React with Vite and React Router
* **Back end:** Node.js with Express, JSON Web Tokens for login, Multer for file uploads
* **Database:** MongoDB with Mongoose
* **AI:** a rule-based recommendation engine, plus a pretrained LLM through an OpenAI-compatible API (Llama 3.2 run locally with Ollama by default, at no cost)
* **Deployment:** Docker and Docker Compose, with nginx serving the front end
* **Tools:** Git and GitHub, the Node.js test runner for unit tests, GitHub Pages for the project website

# Method/Approach

I will follow the system analysis and design process from the course, finishing analysis and design before most of the coding starts:

1. **Requirements:** define the functional and non-functional requirements and organize them by feature in a Software Requirements Specification.
2. **Analysis:** model the system with use cases, a UML class diagram, and CRC cards.
3. **Design:** design the architecture (React client, Express API, MongoDB, LLM service), the database models, and the user interface, and model behavior with sequence and state machine diagrams.
4. **Build the core features:** accounts, courses, tasks and deadlines, study schedule, course materials, progress tracking, and reminders.
5. **Build the AI recommendations:** the rule engine first, with unit tests, then the LLM service with validation and a rule-based fallback.
6. **Test and fix:** check each objective, for example that a student with an exam in 3 days and 0 hours studied gets that course recommended first.
7. **Document and demonstrate:** final report and in-class demo.

The scope is one student managing their own work through a web browser. Importing data from Blackboard or Canvas, instructor or administrator roles, group study, and native mobile apps are out of scope.

# Estimated Timeline

| Milestone | Weeks | Estimated completion |
| --- | --- | --- |
| Proposal and requirements | 1 - 2 | Proposal approved at the end of week 2 |
| Analysis: use cases, UML class diagram, CRC cards | 3 - 4 | End of week 4 |
| Design: architecture, database, user interface | 5 - 6 | Design review at the end of week 6 |
| Core features | 6 - 9 | End of week 9 |
| AI recommendations | 8 - 10 | Working prototype at the end of week 10 |
| Testing and fixes | 10 - 11 | End of week 11 |
| Final report and demo | 12 | Week 12 |

# Anticipated Problems

* **The LLM may write wrong or invented facts.** The LLM only words the advice; all numbers and plans come from the rule engine, and its replies are checked before they are used.
* **The LLM may be slow, unavailable, or cost money.** The system falls back to rule-based text, and a free local model through Ollama is used by default.
* **Students may not enter their study hours.** Finishing a session takes one click, and study time can be logged from the dashboard, so progress stays accurate with little effort.
* **Students may give poor time estimates for tasks.** Each recommendation shows the estimate it used, so the student can correct it.
* **Scope may grow during the semester.** The scope above is fixed; new ideas go to a future-work list.
* **Working alone limits how much can be built.** I will finish the analysis and design deliverables first and build the features in priority order, so the most important parts are done even if time runs short.
* **Personal data must stay private.** Passwords are stored as hashes, each student can only access their own data, and no personal information is sent to the LLM.
