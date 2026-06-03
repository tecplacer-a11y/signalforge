import { useState, KeyboardEvent } from "react";
import { Chip } from "@/components/common";
import { cn } from "@/lib/utils";

export function ChipInput({
  values,
  onChange,
  placeholder = "Type and press Enter",
  testId,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  testId?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-2 py-2 min-h-9",
      )}
    >
      {values.map((v, i) => (
        <Chip key={`${v}-${i}`} onRemove={() => onChange(values.filter((_, j) => j !== i))} testId={`chip-${testId}-${i}`}>
          {v}
        </Chip>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => add(draft)}
        placeholder={values.length ? "" : placeholder}
        className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        data-testid={`input-${testId}`}
      />
    </div>
  );
}
