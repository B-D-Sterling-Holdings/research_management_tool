import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/*
  Supabase table required — run this SQL in the Supabase SQL Editor:

  CREATE TABLE tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'low',
    done BOOLEAN DEFAULT false,
    notes TEXT DEFAULT '',
    assignee TEXT DEFAULT '',
    subtasks JSONB DEFAULT '[]'::jsonb,
    position INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE INDEX idx_tasks_priority ON tasks(priority);

  -- If you already created the table, add missing columns:
  -- ALTER TABLE tasks ADD COLUMN subtasks JSONB DEFAULT '[]'::jsonb;
  -- ALTER TABLE tasks ADD COLUMN notes TEXT DEFAULT '';
  -- ALTER TABLE tasks ADD COLUMN assignee TEXT DEFAULT '';
*/

const TABLE = 'tasks';

// GET — fetch all tasks
export async function GET() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST — create a new task
export async function POST(req) {
  const body = await req.json();
  const { title, priority = 'low' } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Get next position for this priority
  const { data: existing } = await supabase
    .from(TABLE)
    .select('position')
    .eq('priority', priority)
    .order('position', { ascending: false })
    .limit(1);

  const nextPos = existing?.length ? (existing[0].position || 0) + 1 : 0;

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ title: title.trim(), priority, position: nextPos, subtasks: [], updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PUT — update a task (toggle done, rename, subtasks, etc.)
export async function PUT(req) {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove a task
export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase.from(TABLE).delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
