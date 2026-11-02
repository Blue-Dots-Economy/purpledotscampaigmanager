import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_DISTRICTS, DISTRICT_LIST } from "@/lib/ecosystem-data";

/** district === ALL_DISTRICTS (state "") is the national roll-up. */
export interface RegionValue {
  state: string;
  district: string;
}

export const NATIONAL_REGION: RegionValue = { state: "", district: ALL_DISTRICTS };

export function RegionSelector({
  value,
  onChange,
  disabled,
}: {
  value: RegionValue;
  onChange: (v: RegionValue) => void;
  /** Live data has no location field yet, so the selector ships disabled. */
  disabled?: boolean;
}) {
  return (
    <Select
      disabled={disabled}
      value={value.district}
      onValueChange={(d) => {
        const entry = DISTRICT_LIST.find((x) => x.name === d);
        onChange(entry ? { state: entry.state, district: entry.name } : NATIONAL_REGION);
      }}
    >
      <SelectTrigger className="h-8 w-[220px] text-xs">
        <SelectValue placeholder="District" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_DISTRICTS}>All districts</SelectItem>
        {DISTRICT_LIST.map((d) => (
          <SelectItem key={d.name} value={d.name}>
            {d.name} <span className="text-muted-foreground">· {d.state}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
