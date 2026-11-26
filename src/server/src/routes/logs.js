import { StudyLog } from '../models/index.js';
import { crud } from './crud.js';

export default crud(StudyLog, ['course', 'date', 'hours'], { sort: { date: 1 }, trash: 'log' });