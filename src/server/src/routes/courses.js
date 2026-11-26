import { Course, Recommendation } from '../models/index.js';
import { crud } from './crud.js';

// Removing a course moves it to the Trash with its tasks, sessions, logged hours and materials
// (services/trash.js). Notes are kept; they just lose the course tag until the course is restored.
export default crud(Course, ['code', 'name', 'weeklyGoalHours', 'color'], {
  trash: 'course',
  afterDelete: (course) => Recommendation.deleteMany({ course: course._id }),
});