import { memo, useCallback, useEffect, useId, useState } from 'react';
import { Spinner } from './BusyStatus.jsx';
import Card from './Card.jsx';
import Modal from './Modal.jsx';
import ConfirmDelete from './ConfirmDelete.jsx';
import Toast from './Toast.jsx';
import TimeSelect from './TimeSelect.jsx';
import AddressInput from './AddressInput.jsx';
import { CheckCircleIcon, PlusIcon, TrashIcon } from './icons.jsx';
import { dueLabel } from '../lib/format.js';
import { api, LOGIN_URL } from '../lib/api.js';
import { eventIssueText } from '../lib/errors.js';
import { clockFloor, hasIssues, isClockBeforeNow, localDateKey, taskFormIssues } from '../lib/validate.js';
import { citedItemClass, isSourceActive, useHighlight } from '../lib/highlight.jsx';
import { useT } from '../lib/i18n.jsx';
import { SCAN_PREVIEW } from '../lib/widgets.js';

const DUE_TONES = {
  overdue: 'bg-tone-rose text-tone-rose-fg',
  today: 'bg-tone-amber text-tone-amber-fg',
  upcoming: 'bg-tone-neutral text-tone-neutral-fg',
};

const fieldClass =
  'border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm';

function TasksCard({ tasks = [], timeZone, loading, error, onChanged, places }) {
  const { t } = useT();
  const { active, openedWidget } = useHighlight();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [location, setLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [completingId, setCompletingId] = useState(null);
  const [doneIds, setDoneIds] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingComplete, setPendingComplete] = useState(null);
  const [toast, setToast] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const titleFieldId = useId();
  const dueFieldId = useId();
  const errorId = useId();

  const visible = tasks.filter((task) => !doneIds.includes(task.id) && !removedIds.includes(task.id));

  useEffect(() => {
    if (openedWidget?.widget !== 'tasks') return undefined;
    const sourceId = String(openedWidget.sourceId || '');
    if (!sourceId.startsWith('task:')) return undefined;
    setListOpen(true);
    const timer = window.setTimeout(() => {
      const escaped =
        typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(sourceId) : sourceId.replace(/"/g, '\\"');
      document
        .querySelector(`[data-task-placement="list"][data-source-id="${escaped}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [openedWidget]);
  const preview = visible.slice(0, SCAN_PREVIEW);
  const extraCount = Math.max(0, visible.length - preview.length);

  const fail = (error) => {
    setActionError(
      error?.code === 'insufficient_scope' ? 'scope' : error?.needsLogin ? 'login' : 'unavailable',
    );
  };

  const closeForm = () => {
    setOpen(false);
    setTitle('');
    setDue('');
    setDueTime('');
    setLocation('');
    setActionError(null);
    setAttempted(false);
  };

  const issues = taskFormIssues({ title, due, dueTime, location }, { timeZone });
  const canSubmit = !hasIssues(issues);
  const showIssue = (field) => attempted && issues[field];

  const addTask = async (event) => {
    event.preventDefault();
    setAttempted(true);
    if (!canSubmit || creating) return;
    setCreating(true);
    setActionError(null);
    try {
      await api.createTask({
        title: title.trim(),
        due: due || undefined,
        time: dueTime || undefined,
        location: location.trim() || undefined,
      });
      setTitle('');
      setDue('');
      setDueTime('');
      setLocation('');
      setOpen(false);
      await onChanged?.();
    } catch (error) {
      if (
        error?.code === 'due_in_past' ||
        error?.code === 'time_in_past' ||
        error?.code === 'invalid_due' ||
        error?.code === 'invalid_time' ||
        error?.code === 'invalid_title'
      ) {
        setActionError('invalid');
      } else {
        fail(error);
      }
    } finally {
      setCreating(false);
    }
  };

  const dismissToast = useCallback(() => setToast(null), []);

  const markDone = async () => {
    const task = pendingComplete;
    if (!task || completingId) return;
    setCompletingId(task.id);
    setActionError(null);
    try {
      await api.completeTask(task.listId, task.id);
      setDoneIds((ids) => [...ids, task.id]);
      setPendingComplete(null);
      setToast({ task });
      await onChanged?.();
    } catch (error) {
      fail(error);
    } finally {
      setCompletingId(null);
    }
  };

  const removeTask = async () => {
    const task = pendingDelete;
    if (!task || completingId) return;
    setCompletingId(task.id);
    setActionError(null);
    try {
      await api.deleteTask(task.listId, task.id);
      setRemovedIds((ids) => [...ids, task.id]);
      setPendingDelete(null);
      await onChanged?.();
    } catch (error) {
      fail(error);
    } finally {
      setCompletingId(null);
    }
  };

  const undoDone = async () => {
    if (!toast?.task || undoing) return;
    setUndoing(true);
    try {
      await api.reopenTask(toast.task.listId, toast.task.id);
      setDoneIds((ids) => ids.filter((id) => id !== toast.task.id));
      setToast(null);
      await onChanged?.();
    } catch (error) {
      fail(error);
    } finally {
      setUndoing(false);
    }
  };

  const taskRow = (task, placement) => {
    const dueInfo = dueLabel(task.due, timeZone);
    const busy = completingId === task.id;
    return (
      <li
        key={task.id}
        data-source-id={`task:${task.id}`}
        data-task-placement={placement}
        className={`flex items-start gap-3 rounded-lg ${citedItemClass(isSourceActive(active, `task:${task.id}`))}`}
      >
        <button
          type="button"
          aria-label={t('tasks.completeNamed', { title: task.title })}
          disabled={busy}
          onClick={() => setPendingComplete(task)}
          className="border-tone-green-fg/60 text-tone-green-fg hover:bg-tone-green mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 disabled:opacity-50"
        >
          {busy ? <Spinner className="size-2.5" /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-foreground font-medium">{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-subtle text-xs">{task.listTitle}</span>
            {dueInfo && (
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${DUE_TONES[dueInfo.tone]}`}>
                {dueInfo.text}
              </span>
            )}
          </div>
          {task.notes && <p className="text-muted mt-1 line-clamp-2 text-xs">{task.notes}</p>}
        </div>
        <button
          type="button"
          title={t('tasks.deleteTask')}
          aria-label={t('tasks.deleteNamed', { title: task.title })}
          disabled={busy}
          onClick={() => setPendingDelete(task)}
          className="text-muted hover:text-tone-rose-fg mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg disabled:opacity-50"
        >
          <TrashIcon className="size-3.5" />
        </button>
      </li>
    );
  };

  return (
    <>
      <Card
        title={t('widget.tasks.title')}
        icon={<CheckCircleIcon className="size-4.5" />}
        tone="green"
        count={visible.length}
        loading={loading}
        error={error}
        skeleton="checklist"
        emptyText={t('tasks.empty')}
        footer={
          actionError && !open ? (
            <p role="alert" className="text-tone-rose-fg text-sm">
              {actionError === 'scope' ? (
                <>
                  {t('tasks.needScopeUpdate')}{' '}
                  <a href={LOGIN_URL} className="font-medium underline">
                    {t('grantAgain')}
                  </a>
                </>
              ) : actionError === 'login' ? (
                <>
                  {t('tasks.needLogin')}{' '}
                  <a href={LOGIN_URL} className="font-medium underline">
                    {t('signIn')}
                  </a>
                </>
              ) : (
                t('tasks.updateFail')
              )}
            </p>
          ) : extraCount > 0 ? (
            <button
              type="button"
              onClick={() => setListOpen(true)}
              className="text-muted hover:text-foreground text-xs font-medium"
            >
              {t('scan.moreItems', { n: extraCount })}
            </button>
          ) : null
        }
        action={
          !loading && (
            <div className="flex items-center gap-1.5">
              {visible.length > 0 && (
                <button
                  type="button"
                  onClick={() => setListOpen(true)}
                  className="border-border text-foreground hover:bg-surface-hover rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                >
                  {t('scan.open')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="bg-tone-green text-tone-green-fg inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
              >
                <PlusIcon className="size-3.5" />
                {t('tasks.add')}
              </button>
            </div>
          )
        }
      >
        {preview.map((task) => taskRow(task, 'preview'))}
      </Card>

      <Modal
        open={listOpen}
        size="lg"
        title={t('widget.tasks.title')}
        description={t('widget.tasks.desc')}
        onClose={() => setListOpen(false)}
      >
        <ul className="scroll-area max-h-[min(70vh,36rem)] space-y-4 overflow-y-auto">
          {visible.map((task) => taskRow(task, 'list'))}
        </ul>
      </Modal>

      <Modal
        open={open}
        title={t('tasks.new')}
        description={t('tasks.newHint')}
        onClose={closeForm}
      >
        <form className="space-y-4" onSubmit={addTask}>
          <div>
            <label htmlFor={titleFieldId} className="text-foreground mb-1.5 block text-sm font-medium">
              {t('tasks.title')}
            </label>
            <input
              id={titleFieldId}
              className={fieldClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('tasks.titlePlaceholder')}
              maxLength={200}
              required
              autoFocus
              disabled={creating}
              aria-invalid={showIssue('title') ? true : undefined}
              aria-describedby={showIssue('title') ? `${errorId}-title` : actionError ? errorId : undefined}
            />
            {showIssue('title') && (
              <p id={`${errorId}-title`} role="alert" className="text-tone-rose-fg mt-1 text-xs">
                {eventIssueText('title', issues.title)}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={dueFieldId} className="text-foreground mb-1.5 block text-sm font-medium">
              {t('tasks.due')}
              <span className="text-muted font-normal"> · {t('optional')}</span>
            </label>
            <input
              id={dueFieldId}
              className={`${fieldClass} text-muted`}
              type="date"
              min={localDateKey(timeZone)}
              value={due}
              onChange={(event) => {
                const next = event.target.value;
                setDue(next);
                if (!next) setDueTime('');
                else if (dueTime && isClockBeforeNow(next, dueTime, timeZone)) setDueTime('');
              }}
              aria-invalid={showIssue('due') ? true : undefined}
              disabled={creating}
            />
            {showIssue('due') && (
              <p role="alert" className="text-tone-rose-fg mt-1 text-xs">
                {eventIssueText('due', issues.due)}
              </p>
            )}
          </div>
          {due ? (
            <div>
              <TimeSelect
                id="task-due-time"
                name="dueTime"
                label={t('tasks.dueTime')}
                emptyLabel={t('time.none')}
                value={dueTime}
                onChange={setDueTime}
                minTime={due === localDateKey(timeZone) ? clockFloor(timeZone) : null}
                invalid={Boolean(showIssue('dueTime'))}
                disabled={creating}
              />
              {showIssue('dueTime') && (
                <p role="alert" className="text-tone-rose-fg mt-1 text-xs">
                  {eventIssueText('dueTime', issues.dueTime)}
                </p>
              )}
              <p className="text-muted mt-1.5 text-xs">
                {t('tasks.timeHint')}
              </p>
            </div>
          ) : null}
          <AddressInput
            label={
              <>
                {t('tasks.location')}
                <span className="text-muted font-normal"> · {t('optional')}</span>
              </>
            }
            value={location}
            onChange={setLocation}
            placeholder={t('tasks.locationPlaceholder')}
            inputClassName={fieldClass}
            savedPlaces={places}
            disabled={creating}
          />
          {showIssue('location') && (
            <p role="alert" className="text-tone-rose-fg -mt-2 text-xs">
              {eventIssueText('location', issues.location)}
            </p>
          )}
          {actionError === 'scope' && (
            <p id={errorId} role="alert" className="text-tone-rose-fg text-sm">
              {t('tasks.needScopeCreate')}{' '}
              <a href={LOGIN_URL} className="font-medium underline">
                {t('grantAgain')}
              </a>
            </p>
          )}
          {actionError === 'login' && (
            <p id={errorId} role="alert" className="text-tone-rose-fg text-sm">
              {t('tasks.needLoginCreate')}{' '}
              <a href={LOGIN_URL} className="font-medium underline">
                {t('signIn')}
              </a>
            </p>
          )}
          {actionError === 'invalid' && (
            <p id={errorId} role="alert" className="text-tone-rose-fg text-sm">
              {t('form.checkFields')}
            </p>
          )}
          {actionError === 'unavailable' && (
            <p id={errorId} role="alert" className="text-tone-rose-fg text-sm">
              {t('tasks.saveFail')}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeForm}
              disabled={creating}
              className="border-border text-foreground hover:bg-surface-hover rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="bg-tone-green text-tone-green-fg inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {creating && <Spinner className="size-3.5" />}
              {creating ? t('tasks.adding') : t('tasks.add')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDelete
        open={Boolean(pendingComplete)}
        title={t('tasks.completeTitle')}
        description={
          pendingComplete ? t('tasks.completeConfirm', { title: pendingComplete.title }) : ''
        }
        confirmLabel={t('tasks.completeAction')}
        busyLabel={t('tasks.completing')}
        tone="green"
        busy={Boolean(pendingComplete && completingId === pendingComplete.id)}
        onConfirm={markDone}
        onClose={() => {
          if (!completingId) setPendingComplete(null);
        }}
      />

      <ConfirmDelete
        open={Boolean(pendingDelete)}
        title={t('tasks.deleteTitle')}
        description={
          pendingDelete ? t('tasks.deleteConfirm', { title: pendingDelete.title }) : ''
        }
        busy={Boolean(pendingDelete && completingId === pendingDelete.id)}
        onConfirm={removeTask}
        onClose={() => {
          if (!completingId) setPendingDelete(null);
        }}
      />

      <Toast
        open={Boolean(toast)}
        message={toast ? t('tasks.doneToast', { title: toast.task.title }) : ''}
        actionLabel={t('undo')}
        busy={undoing}
        onAction={undoDone}
        onClose={dismissToast}
      />
    </>
  );
}

export default memo(TasksCard);
