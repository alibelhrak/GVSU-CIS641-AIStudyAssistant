# AIStudyAssistant

The AI Study Assistant is a web application that helps students organize their school work in one place. Students can manage their courses, assignments, exams, deadlines, study schedules, and course materials, and track how many hours they study for each course. The AI part looks at the student's upcoming deadlines and study progress and recommends what to study next, with a suggested plan of study sessions that the student can accept or dismiss.

## Team Members and Roles

* [Ali Belhrak](https://github.com/alibelhrak/CIS641-HW2-Belhrak) (Project Manager, Analyst, Designer, Developer)

## Prerequisites

* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
* [Git](https://git-scm.com/)
* Optional: [Ollama](https://ollama.com/) to run a local language model for the recommendation text

## Run Instructions

The project is in the analysis and design stage, and the source code will be added to the `src` folder as it is built. When it is ready, the whole system will start with one command:

```
git clone https://github.com/alibelhrak/GVSU-CIS641-AIStudyAssistant.git
cd GVSU-CIS641-AIStudyAssistant
docker compose up -d --build
```

Then open http://localhost:8080 in a browser.

## Project Documents and Artifacts

* [Project Proposal](docs/proposal-template.md) ([PDF version](docs/project_proposal.pdf))
* [Software Requirements Specification](docs/software_requirements_specification.md)
* [UML Class Diagram](artifacts/class_diagram.md)
* [CRC Cards](artifacts/crc_cards.md)
* [Sequence Diagram](artifacts/sequence_diagram.md)
* [State Machine Diagram](artifacts/state_machine_diagram.md)
