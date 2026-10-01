// The public booking flow (and the customer account behind it) knows exactly
// three genders. A fourth "prefer not to say" option used to sit here, but it
// could not be mapped to a service list — tbl_itemmaster.MOF only ever holds
// M / F / O — so a customer who picked it saw every service of every branch.
// "Other" is the neutral answer: it shows the whole list.
export const GENDER_OPTIONS = [
  { value: 'male',   label: 'Male'   },
  { value: 'female', label: 'Female' },
  { value: 'other',  label: 'Other'  },
] as const;

export type GenderValue = typeof GENDER_OPTIONS[number]['value'];

/** The MOF code stored on each service item. */
export const GENDER_MOF: Record<GenderValue, string> = {
  male:   'M',
  female: 'F',
  other:  'O',
};

/** Accepts a POSTed gender and folds anything unknown onto "other". */
export function normalizeGender(raw: unknown): GenderValue | null {
  const value = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!value) return null;
  if (value === 'm' || value === 'male'   || value === 'her_sanctuary') return 'male';
  if (value === 'f' || value === 'female' || value === 'his_retreat')   return 'female';
  if (value === 'o' || value === 'other'  || value === 'unisex')         return 'other';
  return null;
}

/** The legacy tbl_itemmaster.MOF value → the gender the public page asks for. */
export function genderFromMof(raw: unknown): GenderValue {
  const mof = String(raw ?? '').trim().toUpperCase().charAt(0);
  if (mof === 'M') return 'male';
  if (mof === 'F') return 'female';
  return 'other';
}
