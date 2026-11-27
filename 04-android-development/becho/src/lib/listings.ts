export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  category: string;
  price: number;
  city: string;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  status: 'ACTIVE' | 'SOLD';
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

export function formatListingPrice(listing: Pick<Listing, 'price'>): string {
  return formatINR(listing.price);
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