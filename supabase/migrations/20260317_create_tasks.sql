CREATE TABLE IF NOT EXISTS tasks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  priority    TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  due_date    DATE,
  assigned_to TEXT CHECK (assigned_to IN ('bhuvan', 'dhruv')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subtasks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT false,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON tasks FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON subtasks FOR ALL USING (true);
