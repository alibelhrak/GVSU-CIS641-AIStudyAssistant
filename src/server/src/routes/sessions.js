import { StudySession } from '../models/index.js';
import { crud } from './crud.js';

export default crud(StudySession, ['course', 'date', 'startTime', 'hours', 'note', 'done'], {
  sort: { date: 1, startTime: 1 },
  trash: 'session',
});