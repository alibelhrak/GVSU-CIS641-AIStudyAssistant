import { Link } from 'react-router-dom';
import { Icon } from '../icons.jsx';

const UPDATED = 'November 26, 2026';
const REPO = 'https://github.com/alibelhrak/GVSU-CIS641-AIStudyAssistant';

/** The rules for everything students share with each other: shared pages, public links and group chats */
export default function Guidelines() {
  return (
    <div className="legal">
      <header className="legal-top">
        <Link to="/" className="btn ghost"><Icon name="back" size={16} /> StudyPilot</Link>
      </header>
      <article className="legal-body">
        <h1>Community guidelines</h1>
        <p className="legal-date">Last updated: {UPDATED}</p>
        <p>StudyPilot lets you share note pages with classmates, edit them together, work in study groups with a group chat, and publish a page with a public link. These rules apply to everything you share that way. Your private pages, courses and chats with the AI are yours alone and are not seen by anyone else.</p>

        <h2>Be a good classmate</h2>
        <ul>
          <li><b>Be respectful.</b> No harassment, bullying, threats, or insults aimed at a person or a group.</li>
          <li><b>No hate speech</b> about race, ethnicity, religion, gender, sexual orientation, disability, nationality or any other part of who someone is.</li>
          <li><b>No sexual content, no graphic violence,</b> and nothing that encourages self-harm or dangerous acts.</li>
          <li><b>No spam or scams:</b> no advertising, chain messages, misleading links or attempts to get someone's password or money.</li>
          <li><b>Keep private information private.</b> Don't share someone else's phone number, address, photos, grades or messages without their permission.</li>
          <li><b>Nothing illegal,</b> including sharing copyrighted material you don't have the right to share (for example whole textbooks or paid course content).</li>
        </ul>

        <h2>Academic honesty</h2>
        <p>Study groups are for learning together. Follow your school's academic integrity rules and each course's rules on collaboration. Don't use StudyPilot to share exam or quiz answers, or to hand in someone else's work as your own.</p>

        <h2>Your content and who sees it</h2>
        <ul>
          <li>You are responsible for what you write and share. Only share a page or a public link if you are comfortable with everyone who receives it seeing it.</li>
          <li>People you share a page with, and members of your study groups, see your name, email address and profile picture.</li>
          <li>A public link can be opened by anyone who has it. Turn off <b>Share to web</b> to stop it working.</li>
          <li>You can stop sharing a page, leave a page or a group, or remove someone, at any time.</li>
        </ul>

        <h2>Reporting</h2>
        <p>If you see something that breaks these rules, report it:</p>
        <ul>
          <li><b>A shared page:</b> click the owner's name at the top of the page, then <b>Report this page</b>, or use the flag button next to it.</li>
          <li><b>A public page:</b> click <b>Report</b> at the top of the page. You don't need an account.</li>
          <li><b>A group chat message:</b> point at the message and click the flag button.</li>
        </ul>
        <p>Every report is reviewed. The person you report is not told who reported them. You can also leave the page or group right away.</p>

        <h2>What happens when the rules are broken</h2>
        <p>Content that breaks these rules is removed: a page stops being shared (its owner keeps it) and a message is deleted. Repeated or serious violations can lead to the account being closed. Content that seems illegal may be reported to the authorities.</p>

        <h2>Questions</h2>
        <p>These guidelines are part of the <Link to="/terms">Terms of Service</Link>. See the <Link to="/privacy">privacy policy</Link> for what the app stores, or open an issue on the project's <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">GitHub page</a>.</p>
      </article>
    </div>
  );
}
