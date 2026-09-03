# Address autocomplete

The application form's address fields suggest as you type. Which service does
the suggesting is chosen by environment variable, so switching provider is a
Vercel change and a redeploy -- no code edit.

## Choosing

Set ONE key. The provider is inferred from whichever is present:

| Provider | Variable | Free tier | Card to sign up |
|---|---|---|---|
| Radar | `NEXT_PUBLIC_RADAR_KEY` | 100,000 requests/month | check at signup |
| Mapbox | `NEXT_PUBLIC_MAPBOX_TOKEN` | 100,000 geocoding/month | no |
| Google | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ~10,000/month per SKU | yes |
| Photon | *(none needed)* | free, fair use | no |

With no key at all it falls back to Photon (OpenStreetMap), which needs no
account but has patchier US house-number coverage.

To force one explicitly, set `NEXT_PUBLIC_ADDRESS_PROVIDER` to `radar`,
`mapbox`, `google` or `photon`.

## Keys are public

All of these are PUBLISHABLE keys and appear in the page source -- that is how
browser autocomplete works everywhere. Restrict the key to the site's domain in
the provider's dashboard:

* Radar: use the **publishable** key (`prj_live_pk_...`), not the secret one,
  and set the allowed domains.
* Mapbox: create a scoped public token with a URL restriction.
* Google: restrict by HTTP referrer and cap the daily quota.

## If suggestions stop working

Nothing breaks. Every provider path falls back to a plain text input, so an
outage, a rate limit or a bad key costs suggestions and never the ability to
type an address and submit the form.
