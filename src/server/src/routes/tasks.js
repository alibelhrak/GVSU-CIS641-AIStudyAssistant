import { Task, Recommendation } from '../models/index.js';
import { crud } from './crud.js';

export default crud(Task, ['title', 'course', 'type', 'dueDate', 'priority', 'hoursNeeded', 'done'], {
  sort: { dueDate: 1 },
  afterDelete: (task) => Recommendation.deleteMany({ task: task._id }),
});