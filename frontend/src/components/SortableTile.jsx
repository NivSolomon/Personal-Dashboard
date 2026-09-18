import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripIcon } from './icons.jsx';
import { useT, widgetTitle } from '../lib/i18n.jsx';

export default function SortableTile({ id, className = '', children, disabled = false }) {
  const { t, language } = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const title = widgetTitle(id, language) || t('widget.card');

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`relative ${className} ${isDragging ? 'z-20 opacity-80' : ''}`}
    >
      {!disabled && (
        <button
          type="button"
          title={t('widget.drag')}
          aria-label={t('widget.dragNamed', { title })}
          className="border-border bg-surface/95 text-muted hover:text-foreground absolute top-0 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center rounded-full border px-2 py-1 shadow-sm opacity-80 active:cursor-grabbing hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripIcon className="size-4" />
        </button>
      )}
      {children}
    </div>
  );
}
