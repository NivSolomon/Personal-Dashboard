import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDownIcon, ChevronUpIcon, GripIcon } from './icons.jsx';
import { dragIds, useSortSensors } from '../lib/dnd.js';
import { WIDGET_META, isWidgetAvailable } from '../lib/widgets.js';
import { useT, widgetDescription, widgetTitle } from '../lib/i18n.jsx';

function SortableRow({ widget, index, total, available, disabled, onChange }) {
  const { t, language } = useT();
  const meta = WIDGET_META[widget.id];
  const title = widgetTitle(widget.id, language);
  const description = widgetDescription(widget.id, language);
  const pinned = Boolean(meta?.pin);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: disabled || pinned,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex flex-wrap items-center gap-3 py-3 ${isDragging ? 'bg-surface-hover relative z-10 rounded-lg opacity-80' : ''}`}
    >
      {!pinned && (
        <button
          type="button"
          title={t('widget.drag')}
          aria-label={t('widget.dragNamed', { title })}
          disabled={disabled}
          className="text-muted hover:text-foreground grid size-8 shrink-0 cursor-grab place-items-center rounded-lg touch-none disabled:opacity-30 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripIcon className="size-4" />
        </button>
      )}
      {pinned && <span className="size-8 shrink-0" aria-hidden="true" />}
      <label className="flex min-w-0 flex-1 items-start gap-3">
        <input
          type="checkbox"
          className="accent-ring mt-1 size-4"
          checked={widget.enabled}
          disabled={disabled}
          onChange={(event) => onChange(widget.id, { enabled: event.target.checked })}
        />
        <span className="min-w-0">
          <span className="text-foreground block text-sm font-medium">{title}</span>
          <span className="text-muted block text-xs">
            {available ? description : t('widget.unavailable')}
          </span>
        </span>
      </label>
      {!pinned && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={t('widget.moveUp')}
            aria-label={t('widget.moveUpNamed', { title })}
            disabled={disabled || index === 0}
            onClick={() => onChange(widget.id, { move: -1 })}
            className="border-border text-muted hover:text-foreground hover:bg-surface-hover grid size-8 place-items-center rounded-lg border disabled:opacity-30"
          >
            <ChevronUpIcon className="size-4" />
          </button>
          <button
            type="button"
            title={t('widget.moveDown')}
            aria-label={t('widget.moveDownNamed', { title })}
            disabled={disabled || index === total - 1}
            onClick={() => onChange(widget.id, { move: 1 })}
            className="border-border text-muted hover:text-foreground hover:bg-surface-hover grid size-8 place-items-center rounded-lg border disabled:opacity-30"
          >
            <ChevronDownIcon className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}

export default function LayoutPicker({ layout, session, onChange, disabled }) {
  const widgets = (layout?.widgets || []).filter((widget) => WIDGET_META[widget.id]);
  const sensors = useSortSensors();

  const handleDragEnd = (event) => {
    if (disabled) return;
    const ids = dragIds(event);
    if (ids) onChange(ids.fromId, { overId: ids.toId });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={widgets.map((widget) => widget.id)} strategy={verticalListSortingStrategy}>
        <ul className="divide-border-subtle divide-y">
          {widgets.map((widget, index) => (
            <SortableRow
              key={widget.id}
              widget={widget}
              index={index}
              total={widgets.length}
              available={isWidgetAvailable(widget.id, session)}
              disabled={disabled}
              onChange={onChange}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
