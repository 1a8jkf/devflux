export function terminalSheetHeights(availableHeight: number, bottomInset: number) {
  const min = 50 + Math.max(0, bottomInset);
  const max = Math.max(min, availableHeight - 16);
  return [min, Math.max(min, max * 0.65), max];
}
