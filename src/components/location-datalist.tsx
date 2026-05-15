import { getLocationSuggestions } from "@/lib/location-suggestions";

export const LOCATION_DATALIST_ID = "rex-loc-suggestions";

/**
 * Invisible `<datalist>` of every distinct city / country / location string
 * the site knows about. Inputs across the lane pages reference it via
 * `list="rex-loc-suggestions"` to get free native autocomplete — zero JS,
 * zero added bundle weight.
 */
export async function LocationDatalist() {
  let options: string[] = [];
  try {
    options = await getLocationSuggestions();
  } catch {
    // Suggestions are a nice-to-have; never crash a page render over them.
    options = [];
  }
  if (options.length === 0) return null;
  return (
    <datalist id={LOCATION_DATALIST_ID}>
      {options.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}
