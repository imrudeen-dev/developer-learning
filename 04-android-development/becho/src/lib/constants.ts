export const BECHO_CATEGORIES = [
  'Mobiles',
  'Electronics',
  'Vehicles',
  'Property',
  'Furniture',
  'Bikes',
  'Appliances',
  'Fashion',
  'Books & Sports',
  'Tools & Gear',
] as const;

export type BechoCategory = (typeof BECHO_CATEGORIES)[number];

export const RENT_PERIODS: { label: string; value: 'DAY' | 'WEEK' | 'MONTH' }[] = [
  { label: 'Per Day', value: 'DAY' },
  { label: 'Per Week', value: 'WEEK' },
  { label: 'Per Month', value: 'MONTH' },
];