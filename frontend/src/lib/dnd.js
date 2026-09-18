import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/** Pointer/touch sensors that ignore small movements so clicks still work. */
export function useSortSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

export function dragIds(event) {
  const fromId = event.active?.id != null ? String(event.active.id) : '';
  const toId = event.over?.id != null ? String(event.over.id) : '';
  if (!fromId || !toId || fromId === toId) return null;
  return { fromId, toId };
}
