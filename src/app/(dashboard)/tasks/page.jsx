'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, Check, ChevronDown, ChevronRight, User } from 'lucide-react';

const PRIORITY_SECTIONS = [
  { key: 'highest', label: 'HIGHEST PRIORITY', color: 'bg-emerald-500', maxTasks: 3 },
  { key: 'medium',  label: 'MEDIUM PRIORITY',  color: 'bg-blue-500',    maxTasks: 5 },
  { key: 'low',     label: 'LOW PRIORITY',      color: 'bg-gray-400',    maxTasks: null },
];

const ASSIGNEE_PRESETS = ['Dhruv', 'Bhuvan', 'Both'];

const ASSIGNEE_COLORS = {
  dhruv:  'bg-violet-100 text-violet-700 border-violet-200',
  bhuvan: 'bg-amber-100 text-amber-700 border-amber-200',
  both:   'bg-blue-100 text-blue-700 border-blue-200',
};

function getAssigneeStyle(assignee) {
  if (!assignee) return '';
  return ASSIGNEE_COLORS[assignee.toLowerCase()] || 'bg-gray-100 text-gray-600 border-gray-200';
}

function AssigneeTag({ assignee, onClick }) {
  if (!assignee) {
    return (
      <button
        onClick={onClick}
        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 transition-all duration-200"
        title="Assign"
      >
        <User size={14} />
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-2 py-0.5 rounded-full border transition-colors hover:opacity-80 ${getAssigneeStyle(assignee)}`}
    >
      {assignee}
    </button>
  );
}

function AssigneePicker({ current, onSelect, onClose }) {
  const [customValue, setCustomValue] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[140px]">
      {ASSIGNEE_PRESETS.map(name => (
        <button
          key={name}
          onClick={() => { onSelect(name); onClose(); }}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${
            current?.toLowerCase() === name.toLowerCase() ? 'font-semibold' : ''
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${getAssigneeStyle(name).split(' ')[0]}`} />
          {name}
        </button>
      ))}
      <div className="border-t border-gray-100 mt-1 pt-1 px-2 pb-1">
        <div className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Other..."
            value={customValue}
            onChange={e => setCustomValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && customValue.trim()) { onSelect(customValue.trim()); onClose(); }
              if (e.key === 'Escape') onClose();
            }}
            className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 min-w-0"
          />
        </div>
      </div>
      {current && (
        <button
          onClick={() => { onSelect(''); onClose(); }}
          className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors border-t border-gray-100 mt-1"
        >
          Remove assignee
        </button>
      )}
    </div>
  );
}

export default function TaskBoardPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [addingSubtask, setAddingSubtask] = useState(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(null);
  const editRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (Array.isArray(data)) setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const tasksByPriority = (key) => tasks.filter(t => t.priority === key);
  const totalOpen = tasks.filter(t => !t.done).length;

  // --- Task CRUD ---

  const getMaxForPriority = (priority) => PRIORITY_SECTIONS.find(s => s.key === priority)?.maxTasks ?? null;

  const handleAddTask = async (priority, { keepOpen = false } = {}) => {
    if (!newTaskTitle.trim()) return;
    const max = getMaxForPriority(priority);
    const currentCount = tasks.filter(t => t.priority === priority).length;
    if (max && currentCount >= max) return;
    const title = newTaskTitle.trim();
    setNewTaskTitle('');
    const willBeAtCapacity = max && currentCount + 1 >= max;
    if (!keepOpen || willBeAtCapacity) setAdding(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority }),
      });
      const created = await res.json();
      if (res.ok) setTasks(prev => [...prev, created]);
    } catch (err) {
      console.error('Failed to add task', err);
    }
  };

  const toggleDone = async (id, currentDone) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !currentDone } : t));
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, done: !currentDone }),
      });
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, done: currentDone } : t));
    }
  };

  const removeTask = async (id) => {
    const prev = tasks;
    setTasks(t => t.filter(x => x.id !== id));
    try {
      await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' });
    } catch (err) {
      setTasks(prev);
    }
  };

  const startEditing = (task) => {
    setEditingId(task.id);
    setEditingTitle(task.title);
    setEditingNotes(task.notes || '');
  };

  const saveEdit = async (id, { thenAddTask = false } = {}) => {
    const task = tasks.find(t => t.id === id);
    if (!task) { setEditingId(null); return; }

    const newTitle = editingTitle.trim() || task.title;
    const newNotes = editingNotes.trim();
    const titleChanged = newTitle !== task.title;
    const notesChanged = newNotes !== (task.notes || '');

    setEditingId(null);

    if (thenAddTask) {
      const max = getMaxForPriority(task.priority);
      if (!max || tasks.filter(t => t.priority === task.priority).length < max) {
        setAdding(task.priority);
        setNewTaskTitle('');
      }
    }

    if (!titleChanged && !notesChanged) return;

    const updates = {};
    if (titleChanged) updates.title = newTitle;
    if (notesChanged) updates.notes = newNotes;

    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, title: task.title, notes: task.notes } : t));
    }
  };

  const updateAssignee = async (id, assignee) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, assignee } : t));
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, assignee }),
      });
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, assignee: task.assignee } : t));
    }
  };

  // --- Subtask helpers ---

  const toggleExpanded = (id) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateSubtasks = async (taskId, subtasks) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks } : t));
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, subtasks }),
      });
    } catch (err) {
      fetchTasks();
    }
  };

  const addSubtask = (taskId, { keepOpen = false } = {}) => {
    if (!newSubtaskTitle.trim()) return;
    const task = tasks.find(t => t.id === taskId);
    const subtasks = [...(task.subtasks || []), { id: Date.now(), title: newSubtaskTitle.trim(), done: false }];
    updateSubtasks(taskId, subtasks);
    setNewSubtaskTitle('');
    if (!keepOpen) setAddingSubtask(null);
  };

  const toggleSubtask = (taskId, subtaskId) => {
    const task = tasks.find(t => t.id === taskId);
    const subtasks = (task.subtasks || []).map(s => s.id === subtaskId ? { ...s, done: !s.done } : s);
    updateSubtasks(taskId, subtasks);
  };

  const removeSubtask = (taskId, subtaskId) => {
    const task = tasks.find(t => t.id === taskId);
    const subtasks = (task.subtasks || []).filter(s => s.id !== subtaskId);
    updateSubtasks(taskId, subtasks);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Task Board</h1>
        <p className="text-sm text-gray-500 mt-1">{totalOpen} open task{totalOpen !== 1 ? 's' : ''}</p>
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-48 mb-6" />
              <div className="h-4 bg-gray-100 rounded w-32 mx-auto" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {PRIORITY_SECTIONS.map(({ key, label, color, maxTasks }) => {
            const sectionTasks = tasksByPriority(key);
            const openCount = sectionTasks.filter(t => !t.done).length;
            const atCapacity = maxTasks ? sectionTasks.length >= maxTasks : false;
            const countLabel = maxTasks ? `${sectionTasks.length} / ${maxTasks}` : `${openCount}`;

            return (
              <div key={key} className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
                {/* Section Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${color}`} />
                    <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{label}</h2>
                    <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${
                      atCapacity ? 'text-red-500 border-red-200 bg-red-50' : 'text-gray-500 border-gray-200'
                    }`}>
                      {countLabel}
                    </span>
                  </div>
                  {!atCapacity && (
                    <button
                      onClick={() => { setAdding(key); setNewTaskTitle(''); }}
                      className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      <Plus size={16} />
                      Add Task
                    </button>
                  )}
                </div>

                {/* Task List */}
                {sectionTasks.length === 0 && adding !== key ? (
                  <p className="text-center text-gray-400 py-8">No tasks yet</p>
                ) : (
                  <div className="space-y-2">
                    {sectionTasks.map(task => {
                      const subtasks = task.subtasks || [];
                      const hasSubtasks = subtasks.length > 0;
                      const isExpanded = expandedTasks.has(task.id);
                      const doneSubtasks = subtasks.filter(s => s.done).length;
                      const isEditing = editingId === task.id;

                      return (
                        <div key={task.id}>
                          {/* Main Task Row */}
                          <div
                            className={`rounded-xl border transition-all duration-200 ${
                              isEditing
                                ? 'bg-white border-emerald-200 shadow-sm'
                                : 'bg-gray-50/70 border-gray-100 hover:border-gray-200 group'
                            }`}
                          >
                            <div className="flex items-center gap-3 px-4 py-3">
                              {/* Expand toggle */}
                              <button
                                onClick={() => toggleExpanded(task.id)}
                                className="flex-shrink-0 w-4 text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                {hasSubtasks ? (
                                  isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                                ) : (
                                  <span className="w-[14px]" />
                                )}
                              </button>

                              {/* Checkbox */}
                              <button
                                onClick={() => toggleDone(task.id, task.done)}
                                className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                                  task.done
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-gray-300 hover:border-emerald-400'
                                }`}
                              >
                                {task.done && <Check size={12} strokeWidth={3} />}
                              </button>

                              {/* Title */}
                              {isEditing ? (
                                <input
                                  ref={editRef}
                                  type="text"
                                  value={editingTitle}
                                  onChange={e => setEditingTitle(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveEdit(task.id, { thenAddTask: true });
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  className="flex-1 bg-transparent text-sm text-gray-900 outline-none"
                                />
                              ) : (
                                <span
                                  onClick={() => startEditing(task)}
                                  className={`flex-1 text-sm cursor-text ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}
                                >
                                  {task.title}
                                </span>
                              )}

                              {/* Subtask count badge */}
                              {hasSubtasks && !isEditing && (
                                <span className="text-xs text-gray-400">
                                  {doneSubtasks}/{subtasks.length}
                                </span>
                              )}

                              {/* Assignee tag */}
                              <div className="relative flex-shrink-0">
                                <AssigneeTag
                                  assignee={task.assignee}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAssigneePickerOpen(assigneePickerOpen === task.id ? null : task.id);
                                  }}
                                />
                                {assigneePickerOpen === task.id && (
                                  <AssigneePicker
                                    current={task.assignee}
                                    onSelect={(val) => updateAssignee(task.id, val)}
                                    onClose={() => setAssigneePickerOpen(null)}
                                  />
                                )}
                              </div>

                              {/* Actions */}
                              {!isEditing && (
                                <>
                                  <button
                                    onClick={() => {
                                      setAddingSubtask(task.id);
                                      setNewSubtaskTitle('');
                                      if (!expandedTasks.has(task.id)) toggleExpanded(task.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-all duration-200"
                                    title="Add subtask"
                                  >
                                    <Plus size={14} />
                                  </button>
                                  <button
                                    onClick={() => removeTask(task.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all duration-200"
                                    title="Delete task"
                                  >
                                    <X size={14} />
                                  </button>
                                </>
                              )}
                            </div>

                            {/* Notes area */}
                            {isEditing ? (
                              <div className="px-4 pb-3 pl-16">
                                <textarea
                                  value={editingNotes}
                                  onChange={e => setEditingNotes(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  placeholder="Add a note..."
                                  rows={2}
                                  className="w-full bg-gray-50/80 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 placeholder-gray-400 outline-none focus:ring-1 focus:ring-emerald-500 focus:border-transparent resize-none transition-all duration-200"
                                />
                                <div className="flex items-center gap-2 mt-2">
                                  <button
                                    onClick={() => saveEdit(task.id)}
                                    className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="px-3 py-1 text-gray-500 hover:text-gray-700 text-xs font-medium transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <span className="text-[10px] text-gray-400 ml-auto">Enter to save & add new task</span>
                                </div>
                              </div>
                            ) : (
                              task.notes && (
                                <div
                                  onClick={() => startEditing(task)}
                                  className="px-4 pb-3 pl-16 cursor-text"
                                >
                                  <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{task.notes}</p>
                                </div>
                              )
                            )}
                          </div>

                          {/* Subtasks */}
                          {isExpanded && (
                            <div className="ml-10 mt-1 space-y-1">
                              {subtasks.map(sub => (
                                <div
                                  key={sub.id}
                                  className="flex items-center gap-3 px-4 py-2 rounded-lg group/sub hover:bg-gray-50 transition-colors"
                                >
                                  <button
                                    onClick={() => toggleSubtask(task.id, sub.id)}
                                    className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all duration-200 ${
                                      sub.done
                                        ? 'bg-emerald-500 border-emerald-500 text-white'
                                        : 'border-gray-300 hover:border-emerald-400'
                                    }`}
                                  >
                                    {sub.done && <Check size={10} strokeWidth={3} />}
                                  </button>
                                  <span className={`flex-1 text-sm ${sub.done ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                                    {sub.title}
                                  </span>
                                  <button
                                    onClick={() => removeSubtask(task.id, sub.id)}
                                    className="opacity-0 group-hover/sub:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all duration-200"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}

                              {/* Add subtask input */}
                              {addingSubtask === task.id && (
                                <div className="flex items-center gap-2 px-4 py-1.5">
                                  <input
                                    autoFocus
                                    type="text"
                                    placeholder="Subtask title..."
                                    value={newSubtaskTitle}
                                    onChange={e => setNewSubtaskTitle(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') addSubtask(task.id, { keepOpen: true });
                                      if (e.key === 'Escape') setAddingSubtask(null);
                                    }}
                                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                                  />
                                  <button
                                    onClick={() => addSubtask(task.id)}
                                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors"
                                  >
                                    Add
                                  </button>
                                  <button
                                    onClick={() => setAddingSubtask(null)}
                                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Task Input — always at bottom of section */}
                {adding === key && !atCapacity && (
                  <div className="flex items-center gap-3 mt-3">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Task title..."
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddTask(key, { keepOpen: true });
                        if (e.key === 'Escape') setAdding(null);
                      }}
                      className="flex-1 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                    />
                    <button
                      onClick={() => handleAddTask(key)}
                      className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setAdding(null)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
