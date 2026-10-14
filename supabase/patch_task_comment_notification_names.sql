-- Backfill task-comment notification titles with the comment author's name.
-- Safe to run more than once: only the old generic titles are changed.

UPDATE public.notifications AS n
SET title = COALESCE(NULLIF(BTRIM(author.full_name), ''), 'A team member')
  || ' replied on your task: '
  || task.title
FROM public.task_comments AS comment
JOIN public.profiles AS author ON author.id = comment.author_id
JOIN public.tasks AS task ON task.id = comment.task_id
WHERE n.type = 'task_comment'
  AND n.event_key = 'task-comment:' || comment.id
  AND (
    n.title LIKE 'User replied on your task:%'
    OR n.title LIKE 'Admin commented on your task:%'
  );
