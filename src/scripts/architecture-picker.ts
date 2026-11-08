import { escapeHtml } from "./download-ui";

export function architecturePickerHtml(platform: string, choices: string[], selected: string, label: string): string {
  if (choices.length < 2) return "";
  return `<div data-arch-picker="${escapeHtml(platform)}" role="group" aria-label="${escapeHtml(label)}" class="inline-flex items-center gap-0.5 rounded-full lt-inset p-0.5">${choices.map((choice) =>
    `<button type="button" data-arch="${escapeHtml(choice)}" aria-pressed="${choice === selected}" class="state-layer rounded-full px-2.5 py-0.5 text-label-medium cursor-pointer ${choice === selected ? "lt-inset-raised text-primary" : "bg-transparent text-on-surface-variant"}">${escapeHtml(choice)}</button>`).join("")}</div>`;
}

export function bindArchitecturePicker(root: HTMLElement, signal: AbortSignal, onChange: (platform: string, arch: string) => void): void {
  root.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-arch]");
    const group = button?.closest<HTMLElement>("[data-arch-picker]");
    if (!button || !group || !root.contains(group)) return;
    const platform = group.dataset.archPicker!;
    const arch = button.dataset.arch!;
    const hadFocus = root.contains(document.activeElement);
    onChange(platform, arch);
    if (hadFocus) {
      const restored = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-arch]")).find((candidate) =>
        candidate.dataset.arch === arch && candidate.closest<HTMLElement>("[data-arch-picker]")?.dataset.archPicker === platform);
      restored?.focus({ preventScroll: true });
    }
  }, { signal });
}
