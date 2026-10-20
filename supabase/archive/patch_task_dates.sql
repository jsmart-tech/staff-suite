ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS start_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS due_date date;

UPDATE public.tasks
SET start_date = COALESCE(start_date, date_worked)
WHERE start_date IS NULL;
