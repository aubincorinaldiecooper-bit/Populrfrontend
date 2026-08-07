/**
 * One spelling per tag.
 *
 * Tags drive the Contacts filters, so `warm_lead`, `warmlead` and `Warm Lead`
 * being three different tags quietly breaks the thing tags exist for. Anything
 * a creator types is folded to the form the product stores, which is what lets
 * the tag picker offer an existing tag instead of creating its twin.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
}
