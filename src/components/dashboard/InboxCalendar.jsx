import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

function toDayStart(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
}

function toDateKey(dateValue) {
  const year = dateValue.getFullYear();
  const month = `${dateValue.getMonth() + 1}`.padStart(2, "0");
  const day = `${dateValue.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getGridDates(activeMonthDate) {
  const monthStart = new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth(), 1);
  const monthEnd = new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth() + 1, 0);

  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - mondayOffset);

  const sundayOffset = 6 - ((monthEnd.getDay() + 6) % 7);
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + sundayOffset);

  const dates = [];
  let cursor = toDayStart(gridStart);

  while (cursor <= gridEnd) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function InboxCalendar({
  activeMonth,
  onMonthChange,
  selectedDate,
  onSelectDate,
  minSelectableDate,
  highlightedDateKeys,
  isLoading = false,
  containerClassName,
  emphasizeSelectableHover = false
}) {
  const safeActiveMonth = activeMonth instanceof Date ? activeMonth : new Date();
  const monthStart = new Date(safeActiveMonth.getFullYear(), safeActiveMonth.getMonth(), 1);
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(monthStart);

  const selectedKey = selectedDate ? toDateKey(selectedDate) : "";
  const dates = getGridDates(monthStart);
  const minSelectableDay = minSelectableDate instanceof Date && !Number.isNaN(minSelectableDate.getTime())
    ? toDayStart(minSelectableDate)
    : null;

  return (
    <section
      className={classNames(
        "w-56 rounded-2xl p-2",
        containerClassName ?? "border border-white/40 bg-white/20 shadow-2xl backdrop-blur-[64px] backdrop-saturate-150"
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onMonthChange?.(-1);
            }}
            aria-label="Previous month"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/35 bg-white/15 text-white shadow-[0_6px_18px_rgba(15,23,42,0.2)] backdrop-blur-[64px] backdrop-saturate-150 transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ChevronLeft size={12} strokeWidth={2.3} />
          </button>

          <p className="min-w-[6.4rem] text-center text-[10px] font-semibold text-white/90">{monthLabel}</p>

          <button
            type="button"
            onClick={() => {
              onMonthChange?.(1);
            }}
            aria-label="Next month"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/35 bg-white/15 text-white shadow-[0_6px_18px_rgba(15,23,42,0.2)] backdrop-blur-[64px] backdrop-saturate-150 transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ChevronRight size={12} strokeWidth={2.3} />
          </button>
        </div>

        {isLoading && <span className="text-[9px] text-white/75">...</span>}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            className="pb-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.04em] text-white/70"
          >
            {label[0]}
          </span>
        ))}

        {dates.map((cellDate) => {
          const isCurrentMonth = cellDate.getMonth() === monthStart.getMonth();
          const dateKey = toDateKey(cellDate);
          const formattedDay = new Date(cellDate).toLocaleDateString("en-CA");
          const isSelected = selectedKey === dateKey;
          const hasMessages = Array.isArray(highlightedDateKeys)
            ? highlightedDateKeys.includes(formattedDay)
            : Boolean(highlightedDateKeys?.has?.(formattedDay) || highlightedDateKeys?.has?.(dateKey));
          const isBeforeMinSelectableDate = Boolean(
            minSelectableDay && toDayStart(cellDate).getTime() < minSelectableDay.getTime()
          );
          const isSelectable = !isBeforeMinSelectableDate;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => {
                if (isBeforeMinSelectableDate) {
                  return;
                }

                onSelectDate?.(new Date(cellDate));
              }}
              disabled={isBeforeMinSelectableDate}
              aria-disabled={isBeforeMinSelectableDate}
              className={classNames(
                "flex w-full aspect-square items-center justify-center rounded-md border text-[10px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                hasMessages
                  ? "bg-emerald-500/20 border-emerald-500/50 backdrop-blur-[64px] backdrop-saturate-150 text-emerald-400"
                  : "bg-white/15 border-white/25 backdrop-blur-[64px] backdrop-saturate-150 text-white",
                emphasizeSelectableHover && isSelectable
                  ? "hover:bg-emerald-500/28 hover:border-emerald-300/75 hover:text-white hover:shadow-[0_8px_20px_rgba(16,185,129,0.3)]"
                  : "",
                isSelected ? "ring-2 ring-white/80" : "",
                !isCurrentMonth ? "opacity-45" : "opacity-100",
                isBeforeMinSelectableDate ? "opacity-30 cursor-not-allowed pointer-events-none" : ""
              )}
            >
              {cellDate.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}
