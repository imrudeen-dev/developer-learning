export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  listing_type: 'SELL' | 'RENT';
  category: string;
  price: number;
  rent_period: 'DAY' | 'WEEK' | 'MONTH' | null;
  security_deposit: number | null;
  city: string;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  status: 'ACTIVE' | 'SOLD' | 'RENTED';
  created_at: string;
  profiles?: {
    full_name: string | null;
    phone: string | null;
    city: string | null;
  } | null;
}

export function formatINR(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

export function formatListingPrice(listing: Pick<Listing, 'listing_type' | 'price' | 'rent_period'>): string {
  const base = formatINR(listing.price);
  if (listing.listing_type !== 'RENT') return base;
  const suffix =
    listing.rent_period === 'DAY'
      ? '/ day'
      : listing.rent_period === 'WEEK'
      ? '/ week'
      : listing.rent_period === 'MONTH'
      ? '/ month'
      : '';
  return `${base} ${suffix}`.trim();
}

export function formatTimeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}