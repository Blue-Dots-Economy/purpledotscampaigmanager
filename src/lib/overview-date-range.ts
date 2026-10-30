import { format, subDays } from "date-fns";

/** Matches the date control's inclusive Last 30 days preset, in local time. */
export function overviewDefaultDateRange(today = new Date()) {
  return {
    dateFrom: format(subDays(today, 29), "yyyy-MM-dd"),
    dateTo: format(today, "yyyy-MM-dd"),
  };
}