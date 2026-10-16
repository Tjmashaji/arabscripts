"use client";
// قائمة مشاهد قابلة لإعادة الترتيب بالسحب والإفلات وبلوحة المفاتيح (dnd-kit).
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { sceneStarts } from "@/lib/timing";
import type { Scene } from "./project-context";
import { cx } from "./ui";

function Row({ scene, children, disabled }: { scene: Scene; children: ReactNode; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx("relative", isDragging && "z-10 opacity-80")}>
      <div className="flex gap-2">
        <button {...attributes} {...listeners} disabled={disabled} className="mt-4 h-8 w-6 shrink-0 grid place-items-center rounded-md text-muted hover:bg-surface-2 cursor-grab disabled:cursor-not-allowed" aria-label={`نقل المشهد ${scene.position + 1}. استخدم المسافة ثم الأسهم للنقل بلوحة المفاتيح.`}>
          <GripVertical className="size-4" aria-hidden />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </li>
  );
}

export function SceneList({ scenes, onReorder, render, disabled }: { scenes: Scene[]; onReorder: (ids: string[]) => void; render: (s: Scene, startMs: number) => ReactNode; disabled?: boolean }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function end(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = scenes.map((s) => s.id);
    onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  }
  const starts = sceneStarts(scenes.map((s) => s.duration_ms));
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-3">
          {scenes.map((s, i) => (
            <Row key={s.id} scene={s} disabled={disabled}>
              {render(s, starts[i])}
            </Row>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
