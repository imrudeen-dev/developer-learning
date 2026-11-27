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
