export type TaskRowLike = {
  id: string | number;
};

export function jobBelongsToTask(job: any, task: TaskRowLike): boolean {
  const jobTaskId = job?.job_data?.task_id;
  if (jobTaskId == null || task?.id == null) return false;
  return String(jobTaskId) === String(task.id);
}
