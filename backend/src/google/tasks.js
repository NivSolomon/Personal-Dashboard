import { google } from 'googleapis';

function shapeTask(task, list) {
  return {
    id: task.id,
    title: (task.title || '').trim(),
    notes: task.notes || null,
    due: task.due || null,
    listId: list.id,
    listTitle: list.title || 'Tasks',
    webViewLink: task.webViewLink || null,
  };
}

/** Open (not completed, not hidden) tasks across every task list. */
export async function fetchOpenTasks(auth, { maxPerList = 100 } = {}) {
  const service = google.tasks({ version: 'v1', auth });
  const { data: lists } = await service.tasklists.list({ maxResults: 50 });

  const perList = await Promise.all(
    (lists.items || []).map(async (list) => {
      const { data } = await service.tasks.list({
        tasklist: list.id,
        showCompleted: false,
        showHidden: false,
        maxResults: maxPerList,
      });

      return (data.items || [])
        .filter((task) => task.status !== 'completed' && task.title?.trim())
        .map((task) => shapeTask(task, list));
    }),
  );

  // Tasks with a due date first (soonest first), then the undated backlog.
  return perList.flat().sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.title.localeCompare(b.title, 'he');
  });
}

/** Appears in Google Calendar's Tasks pane; uses the user's primary list. */
export async function createTask(auth, { title, due = null, notes = null }) {
  const service = google.tasks({ version: 'v1', auth });
  const { data: lists } = await service.tasklists.list({ maxResults: 1 });
  const list = lists.items?.[0] || { id: '@default', title: 'Tasks' };

  const { data } = await service.tasks.insert({
    tasklist: list.id,
    requestBody: {
      title: title.trim(),
      ...(due ? { due } : {}),
      ...(notes ? { notes } : {}),
    },
  });

  return shapeTask(data, list);
}

export async function completeTask(auth, { listId, taskId }) {
  const service = google.tasks({ version: 'v1', auth });
  await service.tasks.patch({
    tasklist: listId,
    task: taskId,
    requestBody: { status: 'completed' },
  });
}

export async function reopenTask(auth, { listId, taskId }) {
  const service = google.tasks({ version: 'v1', auth });
  await service.tasks.patch({
    tasklist: listId,
    task: taskId,
    requestBody: { status: 'needsAction', hidden: false },
  });
}

export async function deleteTask(auth, { listId, taskId }) {
  const service = google.tasks({ version: 'v1', auth });
  await service.tasks.delete({
    tasklist: listId,
    task: taskId,
  });
}

export function isTasksScopeError(reason) {
  if (reason?.response?.status !== 403 && reason?.code !== 403) return false;
  return /insufficient/i.test(JSON.stringify(reason?.response?.data ?? reason?.message ?? ''));
}
