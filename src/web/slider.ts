/**
 * VIS, Sliders: the filled share of a slider's track. The track spans exactly the thumb's travel, so the share is the
 * value's position in its range: none at the least value and all of the track at the greatest.
 */
export function sliderFill(value: number, min: number, max: number): string {
  if (max <= min) {
    return '0%';
  }
  const share = (Math.min(max, Math.max(min, value)) - min) / (max - min);
  return `${share * 100}%`;
}
