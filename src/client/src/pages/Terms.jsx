import { Link } from 'react-router-dom';
import { Icon } from '../icons.jsx';

const UPDATED = 'November 26, 2026';
const REPO = 'https://github.com/alibelhrak/GVSU-CIS641-AIStudyAssistant';

/** Terms of Service: the agreement a student accepts when creating an account */
export default function Terms() {
  return (
    <div className="legal">
      <header className="legal-top">
        <Link to="/" className="btn ghost"><Icon name="back" size={16} /> StudyPilot</Link>
      </header>
      <article className="legal-body">
        <h1>Terms of Service</h1>
        <p className="legal-date">Last updated: {UPDATED}</p>
        <p>StudyPilot (also called AI Study Assistant) is a free study planner made by Ali Belhrak as a term project for CIS 641 at Grand Valley State University. It is a personal student project, not a service of the university. By creating an account or using the app, you agree to these terms, the <Link to="/guidelines">community guidelines</Link> and the <Link to="/privacy">privacy policy</Link>. If you don't agree, please don't use the app.</p>

        <h2>1. Who can use it</h2>
        <ul>
          <li>You must be <b>13 years old or older</b>. If you are under 18, you need a parent's or guardian's permission.</li>
          <li>Use your own email address, keep your password private, and don't let others use your account. You are responsible for what happens in your account.</li>
          <li>One person, one account. Don't create accounts for others or pretend to be someone else.</li>
        </ul>

        <h2>2. Your content</h2>
        <ul>
          <li><b>What you create stays yours:</b> courses, notes, files, messages and everything else you add.</li>
          <li>So that the app can work, you allow it to store, copy and show your content to you and to the people <b>you</b> choose to share it with (classmates, study groups, or anyone with a public link you turn on). This permission ends when you delete the content or your account, except for copies already shared that others keep, and short backups.</li>
          <li>You are responsible for what you write, upload and share. Only share content you have the right to share, and follow the <Link to="/guidelines">community guidelines</Link>.</li>
        </ul>

        <h2>3. Things you must not do</h2>
        <ul>
          <li>Break the law, or the community guidelines (harassment, hate speech, sexual content, threats, spam, sharing other people's private information).</li>
          <li>Upload material you don't have the right to share, such as whole textbooks, paid course content or someone else's work.</li>
          <li>Use the app to cheat, for example to share exam answers, or in ways your school or course does not allow.</li>
          <li>Try to get into other people's accounts or data, break or overload the app, get around its limits, or use automated tools to collect data from it.</li>
          <li>Upload viruses or harmful code. (Code you run in Notes runs only in your own browser.)</li>
        </ul>

        <h2>4. AI features</h2>
        <p>The study advice, Ask AI, Notes AI and code suggestions are produced by an AI model and <b>can be wrong, incomplete or out of date</b>. Check important information yourself, especially dates, grades and anything you hand in. You are responsible for how you use AI answers, including following your school's rules on using AI in coursework. What you send to the AI is handled as described in the <Link to="/privacy">privacy policy</Link>.</p>

        <h2>5. Reports, removal and closing accounts</h2>
        <ul>
          <li>Anyone can report content that breaks these terms or the guidelines with the 🚩 Report button. Reports are reviewed, and content may be removed or unshared.</li>
          <li>Accounts that seriously or repeatedly break these terms may be suspended or closed. Content that seems illegal may be reported to the authorities.</li>
          <li><b>Copyright:</b> if you think content in the app uses your work without permission, report it in the app or open an issue on the project's <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">GitHub page</a> with a link to the content and proof that you own the work. It will be removed if the claim is valid.</li>
          <li>You can stop using the app and delete your account at any time from Settings or the <Link to="/privacy#delete-account">privacy page</Link>.</li>
        </ul>

        <h2>6. The app is provided "as is"</h2>
        <p>StudyPilot is a free student project. It is provided <b>"as is" and "as available"</b>, without warranties of any kind, express or implied, including that it will always be available, be free of errors, or keep your data safe from every loss. It may change, be paused or be shut down at any time. <b>Keep your own copy of anything important</b>: you can download all your data in Settings › Data &amp; privacy.</p>

        <h2>7. Limitation of liability</h2>
        <p>To the fullest extent allowed by law, the maker of StudyPilot is not liable for any indirect, incidental, special or consequential damages, or for lost data, missed deadlines, grades or other losses, arising from your use of the app, from content shared by other users, or from AI answers. Where liability can't be excluded, it is limited to the amount you paid to use the app, which is zero. Some places do not allow these limits, so they may not all apply to you.</p>

        <h2>8. Other users</h2>
        <p>Content shared by other students is theirs, not StudyPilot's. It is not checked before it is shared. Be careful with links and files from others, and report anything harmful.</p>

        <h2>9. Changes to these terms</h2>
        <p>These terms may be updated as the app changes. The date at the top shows the latest version. If a change is important, the app will tell you. Using the app after a change means you accept the new terms.</p>

        <h2>10. Law and contact</h2>
        <p>These terms are governed by the laws of the State of Michigan, USA, without regard to its conflict-of-law rules. For questions, open an issue on the project's <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">GitHub page</a>.</p>
      </article>
    </div>
  );
}
