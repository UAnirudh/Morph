"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUP_LABELS, componentLabel, type MorphConfig, type MorphComponent } from "@/lib/morph/config";
import type { ConfigData } from "@/lib/crm/data";
import type { FormOptions } from "@/lib/crm/form-options";
import type { JobRole } from "@/lib/morph/config";
import { CanvasFilterContext, MorphWidget, type FilterState, type WidgetContext } from "./widgets";

const GAP: Record<string, string> = {
  sm: "0.75rem",
  md: "1rem",
  lg: "1.5rem",
};

function visibleComponents(config: MorphConfig, role: JobRole): MorphComponent[] {
  return config.components.filter((component) => {
    if (component.hidden) return false;
    if (component.visibleFor && !component.visibleFor.includes(role)) return false;
    return true;
  });
}

function SortableCard({
  component,
  children,
  editable,
  reduced,
}: {
  component: MorphComponent;
  children: React.ReactNode;
  editable: boolean;
  reduced: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: component.id,
    disabled: !editable,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    "--span": component.span,
    zIndex: isDragging ? 30 : undefined,
  } as unknown as React.CSSProperties;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/card relative flex flex-col rounded-lg border border-border/80 bg-card/70 p-4 shadow-card backdrop-blur-sm transition-[border-color,box-shadow] duration-200",
        isDragging && "border-primary/60 shadow-glow",
        editable && "hover:border-border",
        component.span >= 8 ? "min-h-[180px]" : "min-h-[132px]",
      )}
      aria-label={componentLabel(component)}
    >
      {(component.title || editable) && (
        <header className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {component.title ? (
              <h3 className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                {component.title}
              </h3>
            ) : (
              <h3 className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                {componentLabel(component)}
              </h3>
            )}
            {component.description && !reduced ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{component.description}</p>
            ) : null}
          </div>
          {editable ? (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${componentLabel(component)}`}
              className="cursor-grab touch-none rounded-md p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100 active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" />
            </button>
          ) : null}
        </header>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </article>
  );
}

export interface CanvasProps {
  config: MorphConfig;
  data: ConfigData;
  options: FormOptions;
  role: JobRole;
  currentUserName: string;
  editable?: boolean;
  onReorder?: (components: MorphComponent[]) => void;
  banner?: React.ReactNode;
}

export function MorphCanvas({
  config,
  data,
  options,
  role,
  currentUserName,
  editable = true,
  onReorder,
  banner,
}: CanvasProps) {
  const [filters, setFilters] = React.useState<Record<string, FilterState | undefined>>({});
  const components = React.useMemo(() => visibleComponents(config, role), [config, role]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filterValue = React.useMemo(
    () => ({
      filters,
      setFilter: (dataset: string, filter: FilterState | undefined) =>
        setFilters((current) => ({ ...current, [dataset]: filter })),
    }),
    [filters],
  );

  const widgetContext: WidgetContext = { options, role, currentUserName };
  const reduced = config.accessibility.reduceClutter;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const all = [...config.components];
    const from = all.findIndex((component) => component.id === active.id);
    const to = all.findIndex((component) => component.id === over.id);
    if (from === -1 || to === -1) return;
    const [moved] = all.splice(from, 1);
    if (!moved) return;
    all.splice(to, 0, moved);
    // The widget joins the section it was dropped into so headings stay coherent.
    const neighbour = all[to - 1] ?? all[to + 1];
    if (neighbour && neighbour.id !== moved.id) {
      all[to] = { ...moved, group: neighbour.group };
    }
    onReorder(all);
  };

  const showHeadings = config.layout.showGroupHeadings && !reduced;

  if (components.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
        <Sparkles className="size-5 text-primary" />
        <p className="text-sm font-medium">This interface is empty</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Ask Morph to build a starting layout, or restore a previous version from the version history.
        </p>
      </div>
    );
  }

  let lastGroup: string | null = null;

  return (
    <CanvasFilterContext.Provider value={filterValue}>
      {banner}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={components.map((component) => component.id)} strategy={verticalListSortingStrategy}>
          <div
            className="morph-canvas"
            style={{ gap: GAP[config.layout.gap] ?? "1rem" }}
            data-density={config.layout.density}
          >
            {components.map((component) => {
              const startsGroup = showHeadings && component.group !== lastGroup;
              lastGroup = component.group;
              return (
                <React.Fragment key={component.id}>
                  {startsGroup ? (
                    <div
                      className="col-span-12 mt-2 flex items-center gap-3 first:mt-0"
                      style={{ gridColumn: "span 12 / span 12" }}
                    >
                      <span className="label-caps">{GROUP_LABELS[component.group]}</span>
                      <span className="h-px flex-1 bg-border/60" />
                    </div>
                  ) : null}
                  <SortableCard component={component} editable={editable} reduced={reduced}>
                    <MorphWidget component={component} data={data} context={widgetContext} />
                  </SortableCard>
                </React.Fragment>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </CanvasFilterContext.Provider>
  );
}
