"use client"

import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "lucide-react"
import {
  DayPicker,
  type DayButton,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("group/calendar p-4", className)}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        // === UI elements (override ALL to prevent rdp-* classes) ===
        root: "w-full",
        months: "flex flex-col md:flex-row gap-6 relative",
        month: "flex flex-col w-full gap-3",
        month_grid: "w-full border-collapse border-spacing-0 mt-1",
        month_caption:
          "flex items-center justify-center h-8 w-full px-10",
        caption_label: cn(
          "select-none font-semibold tracking-wide text-earth-800",
          captionLayout === "label"
            ? "text-sm"
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-earth-400 [&>svg]:size-3.5"
        ),
        nav: "flex items-center w-full absolute top-0 inset-x-0 justify-between px-1",
        button_previous:
          "inline-flex items-center justify-center size-8 rounded-full border border-earth-200 text-earth-500 hover:bg-earth-50 hover:text-earth-900 hover:border-earth-300 transition-all aria-disabled:opacity-30 aria-disabled:pointer-events-none select-none",
        button_next:
          "inline-flex items-center justify-center size-8 rounded-full border border-earth-200 text-earth-500 hover:bg-earth-50 hover:text-earth-900 hover:border-earth-300 transition-all aria-disabled:opacity-30 aria-disabled:pointer-events-none select-none",
        dropdowns:
          "w-full flex items-center text-sm font-semibold tracking-wide justify-center h-8 gap-1.5 text-earth-800",
        dropdown_root:
          "relative has-focus:ring-2 has-focus:ring-brand/10 rounded-md",
        dropdown:
          "absolute inset-0 opacity-0 cursor-pointer",
        months_dropdown: "",
        years_dropdown: "",
        weekdays: "flex",
        weekday:
          "flex-1 text-[0.7rem] font-semibold uppercase tracking-widest text-earth-400 text-center py-2 select-none",
        week: "flex w-full",
        weeks: "",
        week_number_header: "select-none w-9",
        week_number:
          "text-[0.75rem] select-none text-earth-300 flex items-center justify-center w-9",
        day: "relative flex-1 p-0 flex items-center justify-center group/day select-none",
        day_button: "",
        chevron: "",
        footer: "",
        // === DayFlag modifiers ===
        today:
          "[&_.day-btn]:font-bold [&_.day-btn]:bg-earth-300 [&_.day-btn]:text-white [&_.day-btn]:rounded-full [&_.day-btn]:hover:bg-earth-400",
        outside: "[&_.day-btn]:text-earth-300 [&_.day-btn]:hover:text-earth-400",
        disabled:
          "[&_.day-btn]:text-earth-300 [&_.day-btn]:opacity-50 [&_.day-btn]:cursor-not-allowed [&_.day-btn]:hover:bg-transparent",
        hidden: "invisible",
        focused: "",
        // === SelectionState modifiers ===
        selected: "",
        range_start: "bg-gradient-to-r from-transparent from-50% to-brand-100 to-50% [&_.day-btn]:bg-brand [&_.day-btn]:text-white [&_.day-btn]:rounded-full [&_.day-btn]:hover:bg-brand-hover",
        range_middle: "bg-brand-100 [&_.day-btn]:bg-transparent [&_.day-btn]:text-earth-900 [&_.day-btn]:rounded-full",
        range_end: "bg-gradient-to-l from-transparent from-50% to-brand-100 to-50% [&_.day-btn]:bg-brand [&_.day-btn]:text-white [&_.day-btn]:rounded-full [&_.day-btn]:hover:bg-brand-hover",
        // === Animation (prevent rdp animation classes) ===
        weeks_before_enter: "",
        weeks_before_exit: "",
        weeks_after_enter: "",
        weeks_after_exit: "",
        caption_before_enter: "",
        caption_before_exit: "",
        caption_after_enter: "",
        caption_after_exit: "",
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => (
          <div
            data-slot="calendar"
            ref={rootRef}
            className={cn(className)}
            {...props}
          />
        ),
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left")
            return <ChevronLeftIcon className={cn("size-4", className)} {...props} />
          if (orientation === "right")
            return <ChevronRightIcon className={cn("size-4", className)} {...props} />
          return <ChevronDownIcon className={cn("size-4", className)} {...props} />
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => (
          <td {...props}>
            <div className="flex size-9 items-center justify-center">
              {children}
            </div>
          </td>
        ),
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "day-btn",
        "relative flex size-10 items-center justify-center rounded-full text-sm font-medium transition-all duration-150",
        "text-earth-700 hover:bg-earth-100 hover:text-earth-900",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:ring-offset-1",
        "data-[selected-single=true]:bg-brand data-[selected-single=true]:text-white data-[selected-single=true]:shadow-sm data-[selected-single=true]:hover:bg-brand-hover",
        "[&>span]:text-[0.65rem] [&>span]:opacity-60",
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
