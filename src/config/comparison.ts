import type { TranslationKey } from "../i18n/ui";

export const comparisonStatuses = ["native", "nativeWeb", "web", "partial", "unsupported"] as const;
export type ComparisonStatus = (typeof comparisonStatuses)[number];

interface ComparisonCell {
  status: ComparisonStatus;
  note?: TranslationKey;
}

interface ComparisonRow {
  label: TranslationKey;
  luotopia: ComparisonCell;
  smartLuojia: ComparisonCell;
}

interface ComparisonGroup {
  id: string;
  title: TranslationKey;
  note?: TranslationKey;
  rows: readonly ComparisonRow[];
}

export const comparisonStatusKeys: Record<ComparisonStatus, TranslationKey> = {
  native: "comparison.status.native",
  nativeWeb: "comparison.status.nativeWeb",
  web: "comparison.status.web",
  unsupported: "comparison.status.unsupported",
  partial: "comparison.status.partial",
};

export const comparisonStatusIcons: Record<ComparisonStatus, string> = {
  native: "check_circle-fill",
  nativeWeb: "check_circle",
  web: "radio_button_unchecked",
  unsupported: "cancel",
  partial: "adjust",
};

export const comparisonGroups: readonly ComparisonGroup[] = [
  {
    id: "study",
    title: "comparison.group.study",
    rows: [
      { label: "features.item.timetable.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.freeClassrooms.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.grades.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.universityCalendar.title", luotopia: { status: "native" }, smartLuojia: { status: "unsupported", note: "comparison.cell.calendar" } },
      { label: "features.item.librarySeats.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.libraryLoans.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.sportsVenues.title", luotopia: { status: "nativeWeb", note: "comparison.cell.checkout" }, smartLuojia: { status: "web" } },
      { label: "features.item.universityTimetable.title", luotopia: { status: "native" }, smartLuojia: { status: "partial", note: "comparison.cell.timetable" } },
      { label: "features.item.courseReviews.title", luotopia: { status: "native" }, smartLuojia: { status: "unsupported" } },
      { label: "features.item.agenda.title", luotopia: { status: "native" }, smartLuojia: { status: "web", note: "comparison.cell.schedule" } },
    ],
  },
  {
    id: "campus",
    title: "comparison.group.campus",
    rows: [
      { label: "features.item.ecard.title", luotopia: { status: "nativeWeb", note: "comparison.cell.ecard" }, smartLuojia: { status: "web" } },
      { label: "features.item.shuttleBus.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.campusMap.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.hospital.title", luotopia: { status: "nativeWeb", note: "comparison.cell.medical" }, smartLuojia: { status: "unsupported", note: "comparison.cell.hospital" } },
      { label: "features.item.utilities.title", luotopia: { status: "nativeWeb", note: "comparison.cell.checkout" }, smartLuojia: { status: "web" } },
      { label: "features.item.campusNetwork.title", luotopia: { status: "nativeWeb", note: "comparison.cell.network" }, smartLuojia: { status: "web" } },
      { label: "features.item.coremail.title", luotopia: { status: "native", note: "comparison.cell.mail" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.tickets", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.aiAssistant.title", luotopia: { status: "native" }, smartLuojia: { status: "partial", note: "comparison.cell.ai" } },
      { label: "comparison.row.scan", luotopia: { status: "native" }, smartLuojia: { status: "native" } },
    ],
  },
  {
    id: "services",
    title: "comparison.group.services",
    rows: [
      { label: "features.item.notifications.title", luotopia: { status: "nativeWeb", note: "comparison.cell.workflow" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.enrollment", luotopia: { status: "unsupported", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.certificates", luotopia: { status: "unsupported", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.finance", luotopia: { status: "unsupported", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.research", luotopia: { status: "unsupported", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.career", luotopia: { status: "unsupported", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.access", luotopia: { status: "unsupported", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.repairs", luotopia: { status: "unsupported", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
    ],
  },
  {
    id: "devices",
    title: "comparison.group.devices",
    rows: [
      { label: "features.item.widgets.title", luotopia: { status: "native" }, smartLuojia: { status: "unsupported" } },
      { label: "comparison.row.quickActions", luotopia: { status: "native" }, smartLuojia: { status: "native" } },
      { label: "features.item.watch.title", luotopia: { status: "native" }, smartLuojia: { status: "unsupported" } },
      { label: "features.item.appleShortcuts.title", luotopia: { status: "native" }, smartLuojia: { status: "unsupported" } },
      { label: "features.item.multiAccount.title", luotopia: { status: "native" }, smartLuojia: { status: "unsupported", note: "comparison.cell.relogin" } },
      { label: "features.item.languages.title", luotopia: { status: "native" }, smartLuojia: { status: "partial", note: "comparison.cell.languages" } },
      { label: "comparison.row.desktop", luotopia: { status: "native" }, smartLuojia: { status: "unsupported" } },
      { label: "comparison.row.browser", luotopia: { status: "unsupported", note: "comparison.cell.planned" }, smartLuojia: { status: "web" } },
    ],
  },
];
