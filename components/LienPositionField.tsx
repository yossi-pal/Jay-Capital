import { lienPositionLabel } from '@/lib/format';

/** First / second position picker for the new and edit loan forms. */
export default function LienPositionField({ defaultValue }: { defaultValue?: number | null }) {
  return (
    <div className="field-wrap">
      <label>Lien Position *</label>
      <select className="field" name="lien_position" defaultValue={defaultValue ? String(defaultValue) : ''} required>
        <option value="" disabled>Choose…</option>
        <option value="1">{lienPositionLabel(1)}</option>
        <option value="2">{lienPositionLabel(2)}</option>
      </select>
    </div>
  );
}
