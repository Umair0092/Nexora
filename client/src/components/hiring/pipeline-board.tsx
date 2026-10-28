import { useState } from "react";
import { Link } from "wouter";
import { GripVertical, MessageSquare, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BOARD_COLUMNS, COLUMN_LABELS, stageFor, type CandidateRow, type Column, type Stage } from "@/lib/hiring";
import { cn } from "@/lib/utils";

// Where a card can be moved from its menu. Invited and To review both mean
// "no stage", so only the one that matches the candidate's status is offered.
function targets(c: CandidateRow): Column[] {
  const home: Column = c.status === "completed" ? "review" : "invited";
  return BOARD_COLUMNS.filter((col) => col !== c.column && (stageFor(col) !== null || col === home));
}

function Card({
  c,
  selected,
  onToggle,
  onMove,
}: {
  c: CandidateRow;
  selected: boolean;
  onToggle: () => void;
  onMove: (stage: Stage | null) => void;
}) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/candidate", String(c.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group rounded-xl border bg-card p-3 shadow-sm transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
      )}
      data-testid={`card-candidate-${c.id}`}
    >
      <div className="flex items-start gap-2">
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${c.name}`} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <Link href={`/hiring/candidates/${c.id}`} className="block truncate font-semibold hover:text-primary hover:underline">
            {c.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{c.status === "in_progress" ? "Answering now" : c.email}</p>
        </div>
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden="true" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <dl className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {c.aiScore != null && (
            <div><dt className="inline">AI </dt><dd className="inline font-semibold tabular-nums text-foreground">{Math.round(c.aiScore)}</dd></div>
          )}
          {c.scorecardAverage != null && (
            <div><dt className="inline">Team </dt><dd className="inline font-semibold tabular-nums text-foreground">{c.scorecardAverage}</dd></div>
          )}
          {c.resumeScore != null && (
            <div><dt className="inline">CV </dt><dd className="inline font-semibold tabular-nums text-foreground">{c.resumeScore}%</dd></div>
          )}
          {c.noteCount > 0 && (
            <div className="flex items-center gap-0.5">
              <dt><MessageSquare className="h-3 w-3" aria-label="Notes" /></dt>
              <dd className="tabular-nums">{c.noteCount}</dd>
            </div>
          )}
        </dl>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move ${c.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {targets(c).map((col) => (
              <DropdownMenuItem key={col} onSelect={() => onMove(stageFor(col))}>
                {COLUMN_LABELS[col]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

// The job's candidates in a column per stage. Cards move by dragging or from
// their menu (which works with a keyboard and on phones).
export function PipelineBoard({
  candidates,
  selected,
  onToggle,
  onMove,
}: {
  candidates: CandidateRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onMove: (candidate: CandidateRow, stage: Stage | null) => void;
}) {
  const [over, setOver] = useState<Column | null>(null);

  const drop = (col: Column, id: number) => {
    const c = candidates.find((x) => x.id === id);
    if (!c || c.column === col || c.column === "withdrawn") return;
    // Invited and To review follow the candidate's status, so dropping on
    // either just clears the stage.
    if (stageFor(col) === null && c.stage === null) return;
    onMove(c, stageFor(col));
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-3">
        {BOARD_COLUMNS.map((col) => {
          const cards = candidates.filter((c) => c.column === col);
          return (
            <section
              key={col}
              aria-label={COLUMN_LABELS[col]}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                drop(col, Number(e.dataTransfer.getData("text/candidate")));
              }}
              className={cn(
                "flex w-60 flex-col rounded-2xl bg-muted/50 p-2 transition-colors",
                over === col && "bg-primary/10 ring-2 ring-primary/40",
              )}
            >
              <h3 className="flex items-center justify-between px-1.5 pb-2 pt-1 text-sm font-semibold">
                {COLUMN_LABELS[col]}
                <span className="rounded-full bg-background px-2 text-xs font-medium tabular-nums text-muted-foreground">{cards.length}</span>
              </h3>
              <ul className="flex min-h-24 flex-col gap-2">
                {cards.map((c) => (
                  <Card key={c.id} c={c} selected={selected.has(c.id)} onToggle={() => onToggle(c.id)} onMove={(stage) => onMove(c, stage)} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
