import type { TranslationKey } from "../i18n/ui";

export const comparisonStatuses = ["native", "nativeWeb", "web", "unsupported", "unknown"] as const;
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
  unknown: "comparison.status.unknown",
};

export const comparisonStatusIcons: Record<ComparisonStatus, string> = {
  native: "check_circle",
  nativeWeb: "check_circle-fill",
  web: "radio_button_unchecked",
  unsupported: "cancel",
  unknown: "help",
};

export const comparisonGroups: readonly ComparisonGroup[] = [
  {
    id: "study",
    title: "comparison.group.study",
    rows: [
      { label: "features.item.timetable.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.freeClassrooms.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.grades.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.universityCalendar.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.librarySeats.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.libraryLoans.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.sportsVenues.title", luotopia: { status: "nativeWeb", note: "comparison.cell.checkout" }, smartLuojia: { status: "web" } },
      { label: "features.item.universityTimetable.title", luotopia: { status: "native" }, smartLuojia: { status: "unknown" } },
      { label: "features.item.courseReviews.title", luotopia: { status: "native" }, smartLuojia: { status: "unknown" } },
      { label: "features.item.agenda.title", luotopia: { status: "native" }, smartLuojia: { status: "web", note: "comparison.cell.schedule" } },
    ],
  },
  {
    id: "campus",
    title: "comparison.group.campus",
    note: "comparison.note.campus",
    rows: [
      { label: "features.item.ecard.title", luotopia: { status: "nativeWeb", note: "comparison.cell.ecard" }, smartLuojia: { status: "web" } },
      { label: "features.item.shuttleBus.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.campusMap.title", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.hospital.title", luotopia: { status: "nativeWeb", note: "comparison.cell.medical" }, smartLuojia: { status: "web" } },
      { label: "features.item.utilities.title", luotopia: { status: "nativeWeb", note: "comparison.cell.checkout" }, smartLuojia: { status: "web" } },
      { label: "features.item.campusNetwork.title", luotopia: { status: "nativeWeb" }, smartLuojia: { status: "web" } },
      { label: "features.item.coremail.title", luotopia: { status: "nativeWeb", note: "comparison.cell.mail" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.tickets", luotopia: { status: "native" }, smartLuojia: { status: "web" } },
      { label: "features.item.aiAssistant.title", luotopia: { status: "native" }, smartLuojia: { status: "web", note: "comparison.cell.ai" } },
      { label: "comparison.row.scan", luotopia: { status: "native" }, smartLuojia: { status: "native", note: "comparison.cell.bridge" } },
    ],
  },
  {
    id: "services",
    title: "comparison.group.services",
    note: "comparison.note.services",
    rows: [
      { label: "features.item.notifications.title", luotopia: { status: "nativeWeb", note: "comparison.cell.workflow" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.enrollment", luotopia: { status: "web", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.certificates", luotopia: { status: "web", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.finance", luotopia: { status: "web", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.research", luotopia: { status: "web", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.career", luotopia: { status: "web", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.access", luotopia: { status: "web", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
      { label: "comparison.row.repairs", luotopia: { status: "web", note: "comparison.cell.portal" }, smartLuojia: { status: "web" } },
    ],
  },
  {
    id: "devices",
    title: "comparison.group.devices",
    note: "comparison.note.devices",
    rows: [
      { label: "features.item.widgets.title", luotopia: { status: "native", note: "comparison.cell.platform" }, smartLuojia: { status: "unknown" } },
      { label: "features.item.watch.title", luotopia: { status: "native", note: "comparison.cell.platform" }, smartLuojia: { status: "unknown" } },
      { label: "features.item.appleShortcuts.title", luotopia: { status: "native", note: "comparison.cell.platform" }, smartLuojia: { status: "unknown" } },
      { label: "features.item.multiAccount.title", luotopia: { status: "native" }, smartLuojia: { status: "unknown" } },
      { label: "features.item.languages.title", luotopia: { status: "native" }, smartLuojia: { status: "unknown" } },
      { label: "comparison.row.desktop", luotopia: { status: "native", note: "comparison.cell.platform" }, smartLuojia: { status: "unknown" } },
      { label: "comparison.row.browser", luotopia: { status: "unsupported", note: "comparison.cell.planned" }, smartLuojia: { status: "web" } },
    ],
  },
];
