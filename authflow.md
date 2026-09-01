# Authentication Flow

This document tells you how the login system and the password system work. The API server is the file `server/server.cjs` in the portfolio repository. The server runs on the Raspberry Pi. It answers on the route `/api/*` of `ozzyabc.xyz`.

## The Data Files

The server reads and writes these files:

- `/home/ozzy/sites/portfolio/secrets.json` — the credentials. It has `googleClientId`, `googleClientSecret`, and `sessionSecret`. The server makes `sessionSecret` on the first run. This file is not in git.
- `/home/ozzy/databases/portfolio/passwords.json` — the password entries. This file is not in git. The web server does not serve this file.
- `/home/ozzy/databases/portfolio/users.json` — the user records. This file is not in git. The web server does not serve this file.

### The Format of passwords.json

```json
{
	"2": {
		"site": "stickers.ozzyabc.xyz",
		"passwords": {
			"stickersyippee": "default"
		}
	}
}
```

- The top key ("2") is the site number. Each site has one number.
- `site` is the host name of the site. The value must end with `ozzyabc.xyz`.
- `passwords` is a map. Each map key is one plaintext password. Each map value is a label. The label tells the site which password the user entered. One site can have many passwords.

### The Format of users.json

```json
{
	"103846917235": {
		"name": "Ozzy",
		"email": "ozzy@example.com",
		"picture": "https://lh3.googleusercontent.com/...",
		"muted": false,
		"access": {
			"2": "default"
		}
	}
}
```

- The top key is the Google account id (the `sub` claim).
- `muted` is the state of the volume button.
- `access` is a map. A map key is a site number from passwords.json. The map value is the label of the password that the user entered. If the map has the key, the user has access to that site.

## The Signed Token Format

The server makes all tokens with one procedure. A token is two parts with a dot between them:

```
base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
```

The signature is HMAC-SHA256 of the first part. The key is `sessionSecret`. The server refuses a token if the signature does not match or if the `exp` time (unix seconds) is in the past. The comparison is constant-time.

## The Login System

### The Cookie

The name of the login cookie is `session`. The value is a signed token. The payload is:

```json
{ "sub": "<Google account id>", "exp": 1234567890 }
```

The cookie attributes are: `HttpOnly`, `Secure`, `SameSite=Lax`, `Domain=.ozzyabc.xyz`, `Max-Age=34560000` (400 days). Because of the Domain attribute, all subdomains of ozzyabc.xyz receive this cookie.

Warning: do not read the payload without a check of the signature. Do not put the signature check in new code. Use the `/api/me` endpoint. It does the check for you.

### The Login Steps

1. The user opens `https://ozzyabc.xyz/login.html?N`. N is a site number from passwords.json. If N is not given, N is 1.
2. The user clicks "Log in with Google". The browser goes to `/api/auth/google?cb=N`.
3. The server makes a random state value. The server puts the state value and N in a signed token. The server sets this token as the cookie `oauthState` (10 minutes, HttpOnly, Secure, SameSite=Lax). The server sends the browser to Google.
4. Google sends the browser back to `https://ozzyabc.xyz/api/auth/callback` with a code and the state.
5. The server compares the state with the `oauthState` cookie. If they do not match, the server sends the browser to `/login.html`.
6. The server exchanges the code for an access token. The server gets the profile (`sub`, `name`, `email`, `picture`) from Google.
7. The server writes the user record in users.json. The record keeps the old `muted` and `access` values.
8. The server sets the `session` cookie. The server sends the browser to the site for N.

### The Endpoints

- `GET /api/auth/google?cb=N` — starts the login. N is the site number for the return trip.
- `GET /api/auth/callback` — only Google uses this.
- `GET /api/me` — returns the state of the current user. Send the request with the user's cookies. The response is:

```json
{ "loggedIn": true, "name": "Ozzy", "picture": "https://...", "muted": false, "access": { "2": "default" } }
```

If the user is not logged in, the response is `{ "loggedIn": false }`. The email is not in the response.

- `POST /api/user/mute` — body `{ "muted": true }`. Writes the mute state of the logged-in user.

## The Password System

### The Steps

1. The user opens `https://ozzyabc.xyz/password/N`. N is the site number. (This route needs a Caddy rewrite to password.html.)
2. The user types a password and presses Enter. The page sends `POST /api/password` with the body `{ "index": N, "password": "..." }`.
3. The server compares the password with each password of entry N. The comparison is constant-time. The limit is 15 tries for each IP in 10 minutes.
4. If no password matches, the response is 401. The page shows a red border.
5. If a password matches, and the user is logged in, the server writes `access[N] = label` in the user record.
6. The server makes a grant token. The payload is `{ "idx": N, "key": "<label>", "exp": <now + 300 seconds> }`. The response is:

```json
{ "ok": true, "redirect": "https://stickers.ozzyabc.xyz/?grant=<token>" }
```

7. The page sends the browser to the redirect address.

### How a Site Verifies a Grant

The grant token is in the URL parameter `grant`. The token is valid for 5 minutes. To verify it, send:

```
GET https://ozzyabc.xyz/api/grant?grant=<token>
```

The response is `{ "ok": true, "index": 2, "key": "default" }` or a 401 with `{ "ok": false }`. The `key` tells you which password the user entered. Use the key to select the correct content.

### The Recommended Check for a Protected Site

Do these steps on a protected subdomain:

1. Send the user's cookies to `GET https://ozzyabc.xyz/api/me`.
2. If `loggedIn` is true and `access` has your site number, let the user in. Use the label as the content selector.
3. If not, look for `?grant=` in the URL. Verify it with `/api/grant`. If it is valid, let the user in. Set your own session if you need the access to survive the 5 minutes.
4. If both checks fail, send the user to `https://ozzyabc.xyz/password/N`.

## Security Rules

- The server binds to 127.0.0.1 only. Caddy sends `/api/*` requests to it.
- All POST endpoints refuse requests from origins outside `*.ozzyabc.xyz` and localhost.
- Request bodies over 4096 bytes are refused.
- Passwords never go in URLs. Only signed grant tokens go in URLs.
- API responses have `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- A resource that does not exist gets a 404 JSON response.
