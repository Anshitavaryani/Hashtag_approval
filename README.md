# HashtagBillionaire approval page

The page customers open from the "Your artwork is ready to review" email. It shows
every item of their order with the artwork previews (mockups) the team sent, and lets
them approve each item or everything at once, reject an item with a note and
pictures, go back to an earlier version, and undo their last choice. There is no
login: the link itself carries a secret key. The team's side is in the admin panel
(Orders > Artwork approval).

It is a static site (Next.js `output: "export"`): plain files that Apache serves,
with no Node process on the server. The page talks to the backend's public
approval API, `/api/v1/approval`.

## How it works

- **The link** is the backend's `APPROVAL_SITE_URL` setting, then `#`, then a
  64-character key: `https://hashtagbillionaire.com/approval/#3f9c…`. Browsers never
  send the part after `#` to a server, so the key stays out of every access log.
- **The key** is read from the address bar and sent only in the `X-Approval-Token`
  header. It is never stored: no cookies, no localStorage. Requests use `fetch` with
  `cache: "no-store"` and `credentials: "omit"`.
- **The layout:** a summary at the top (what to do in one sentence, progress, Approve
  all), then every item as a card with a small picture and its status. Choosing a
  card opens that item's review: beside the list on wide screens, full screen with
  All items / Previous / Next on phones. An order with one item opens its review
  straight away. Pictures stay small on the page (at most 420 px tall, 320 px on
  phones) and open full size, with zoom, in a viewer. Each item lists its versions
  with where each stands (New · waiting for you, Approved, Rejected, Replaced).
- **What the customer can do** (the buttons come from the API's `actions` for each item):
  - approve the newest version of an item;
  - reject it: a box for what to change and up to 5 PNG or JPG pictures of up to
    10 MB each, then Submit (a note or a picture is needed);
  - go back to an earlier version ("Go back to Version 1": it approves Version 1 and
    rejects the newer ones). With only Version 1 there is nothing to go back to;
  - undo their last choice on an item, until the team locks the order for production;
  - Approve all, which approves the newest version of every item still waiting (it
    lists them first), and undo that Approve all;
  - read each item's history.
- **Words:** the page says "artwork preview", "Version 2", Approve, Reject, Go back and
  Undo; never "proof", "draft", "token" or "Request changes".
- **Read-only:** once the team locks the order for production, or the order ships or
  is cancelled, the page shows why and offers nothing to change.
- **Two people on one link:** an action on an out-of-date page gets a 409 from the API
  with the latest state. The page shows it and says "This was just updated". The page
  also reloads its data when the window regains focus (not while the Reject box or the
  Approve all sheet is open: choosing pictures leaves the page and comes back).
- **Private:** every page says `noindex, nofollow` and `referrer: no-referrer`, and
  `robots.txt` disallows everything (it only counts on a subdomain; see below). No
  analytics, and nothing is loaded from another host except the API's files: the Inter
  font is built in from `@fontsource-variable/inter`.
- **Times** show in the viewer's own time zone, with its abbreviation.

## Environment

Copy `.env.example` to `.env.local`. Every `NEXT_PUBLIC_` value is compiled into the
page that customers download, so never put a secret there. The Deploy workflow sets
its own values in its Build step.

| Variable                 | Required | What it is |
| ------------------------ | -------- | ---------- |
| `NEXT_PUBLIC_API_URL`    | Yes      | The backend API root with `/api/v1/` and the trailing slash. Production: `https://node.hashtagbillionaire.com/api/v1/`. Without it the build warns and the page shows a setup error. |
| `NEXT_PUBLIC_BASE_PATH`  | No       | The path the site is served under. Defaults to `/approval`. Set it to nothing (`NEXT_PUBLIC_BASE_PATH=`) when the site has its own subdomain. |

## Local development

Requires Node.js 20.9 or later (the workflow uses Node 26).

```sh
npm install
cp .env.example .env.local   # points at a local backend on port 5050
npm run dev                  # http://localhost:3001/approval/
```

- The page needs the backend running locally with the approval feature. The backend
  only answers browsers from origins in its `ACCESSDOMAINS`; `http://localhost:3001`
  is in its example list.
- **A link to test with:** in the local admin panel, open an order's Artwork approval
  page, add an artwork preview and press Send to customer, or use Copy link. Keep everything from `#` on and open
  `http://localhost:3001/approval/#<key>`. Or set "Approval page address" on the local
  Settings page to `http://localhost:3001/approval/`, and the emailed links open here.
- Without a key the page shows "This link isn't complete".

| Command             | What it does |
| ------------------- | ------------ |
| `npm run dev`       | Dev server on port 3001 |
| `npm run build`     | Static export into `out/` |
| `npm run lint`      | ESLint (Next's rules, `eslint.config.mjs`) |
| `npm run typecheck` | Generates Next's route types, then `tsc --noEmit` |

To look at a build locally under its base path (the API must allow the origin):

```sh
npm run build
mkdir -p /tmp/approval-preview && ln -sfn "$PWD/out" /tmp/approval-preview/approval
python3 -m http.server 8080 --directory /tmp/approval-preview   # http://localhost:8080/approval/
```

## Project layout

```
src/app/          layout (font, toasts, noindex), the page, not-found and error screens, icon
src/components/   ApprovalApp: the link's key, the view, every action and the layout
                  Hero (summary, progress), ItemsOverview (the item cards),
                  ReviewPanel (one item: pictures, Approve / Reject, Go back, Undo,
                  history), VersionList, RejectSheet (the Reject box), ReviewSheet (the
                  review full screen on phones), ImageStage and ImageViewer (the picture
                  on the page, the full-size viewer), LineHistory, SummaryBar (Approve
                  all, the slim bar, the confirm sheet), StatusBadge, Screens, SiteChrome, ui/
src/lib/          api.ts (fetch, errors, reading the view), lines.ts (what each item
                  shows), media.ts, token.ts, format.ts, types.ts
public/robots.txt
scripts/deploy.sh             uploads out/ and switches the site to it
.github/workflows/deploy.yml  build, then deploy
```

## Deploying

Every push to `main` puts the site live through the
[Deploy workflow](.github/workflows/deploy.yml), the same way the admin panel deploys:

1. **Build:** `npm ci`, lint, type-check and `npm run build`, with the `NEXT_PUBLIC_`
   values set in the workflow. If any step fails, nothing is deployed.
2. **Deploy:** uploads `out/` to a new folder on the server, then switches the site
   to it in one step, so nobody sees a half-copied site. If `APPROVAL_URL` is set, it
   then checks that the site serves the new build.

**Before the server is ready**, the deploy job passes without deploying and says
"Not deployed: the DEPLOY_ secrets aren't set yet". If only some of the five
required secrets are set, it fails and names the missing ones.

Pushes that change only Markdown files don't deploy. To deploy without a push, open
Actions > Deploy > Run workflow.

### Settings

In GitHub, under Settings > Environments > `production`, allow only the `main`
branch under Deployment branches, and add these secrets:

| Secret            | Value |
| ----------------- | ----- |
| `DEPLOY_HOST`     | The server's address |
| `DEPLOY_USER`     | `approval-deploy` (see the setup below) |
| `DEPLOY_PATH`     | The folder the web server serves for the site: `/var/www/approval` |
| `DEPLOY_SSH_KEY`  | The deploy key's private half |
| `DEPLOY_HOST_KEY` | The server's `/etc/ssh/ssh_host_ed25519_key.pub` |
| `APPROVAL_URL`    | Optional. The site's address, checked after each deploy: `https://hashtagbillionaire.com/approval/` |
| `DEPLOY_PORT`     | Optional. The SSH port, if it isn't 22 |

### On the server

`<DEPLOY_PATH>-releases/` holds the last five builds, named by time and commit, and
its `current` link points to the live one. `DEPLOY_PATH` itself is a link to
`current`, so the web server has to follow links (in Apache, `Options
FollowSymLinks`). Don't build or edit files on the server: the next deploy replaces
them.

### Rolling back

- **From GitHub:** open the Deploy run of the commit you want back and choose Re-run
  all jobs. It rebuilds that commit and deploys it.
- **On the server, at once:** as root or the deploy user, point `current` at an
  earlier build:

  ```sh
  cd /var/www/approval-releases && ls     # builds are named <time>-<commit>
  ln -sfn <build> .current.tmp && mv -Tf .current.tmp current
  ```

### One-time server setup

None of this has been done yet. Run it as root, and read the shop's Apache site
first: a mistake there takes the live shop down.

1. **A deploy key**, made on your own computer, without a passphrase:
   `ssh-keygen -t ed25519 -N "" -C github-actions-approval -f approval_deploy_key`
2. **A deploy user of its own.** Not the admin panel's `deploy` user: this key must
   not be able to overwrite the admin panel.

   ```sh
   useradd --create-home --shell /bin/bash approval-deploy
   usermod --password '*' approval-deploy
   install -d -m 700 -o approval-deploy -g approval-deploy /home/approval-deploy/.ssh
   echo "restrict ssh-ed25519 AAAA... github-actions-approval" >> /home/approval-deploy/.ssh/authorized_keys
   chown approval-deploy:approval-deploy /home/approval-deploy/.ssh/authorized_keys
   chmod 600 /home/approval-deploy/.ssh/authorized_keys
   ```

   Use the line from `approval_deploy_key.pub` after `restrict`. If `sshd -T` shows
   `allowusers` or `allowgroups`, add `approval-deploy` there and run
   `systemctl reload ssh`.
3. **The folders.** The link points nowhere until the first deploy creates `current`.

   ```sh
   install -d -m 755 -o approval-deploy -g approval-deploy /var/www/approval-releases
   ln -s approval-releases/current /var/www/approval
   ```

4. **Apache.** In the shop's site for the address in the backend's
   `APPROVAL_SITE_URL` setting (by default `https://hashtagbillionaire.com`), add these
   lines above its `ProxyPass /` line, so `/approval` is served from the files instead
   of the shop's Next server. They need `mod_headers` (`a2enmod headers`).

   ```apache
   # The approval page (Hashtag_approval repo): static files, not the shop's Next server.
   ProxyPass /approval !
   Alias /approval /var/www/approval
   <Directory /var/www/approval>
       Options FollowSymLinks
       AllowOverride None
       Require all granted
       DirectoryIndex index.html
       ErrorDocument 404 /approval/404.html
   </Directory>
   <Location /approval>
       Header always set X-Robots-Tag "noindex, nofollow"
       Header always set Referrer-Policy "no-referrer"
       Header always set X-Content-Type-Options "nosniff"
       Header always set X-Frame-Options "DENY"
       Header set Cache-Control "no-cache"
   </Location>
   # File names under _next/static change with their contents, so they can be kept for a year.
   <LocationMatch "^/approval/_next/static/">
       Header set Cache-Control "public, max-age=31536000, immutable"
   </LocationMatch>
   ```

   Then `apache2ctl configtest && systemctl reload apache2`. A Content-Security-Policy
   can be added in the same `<Location>`; try it as `Content-Security-Policy-Report-Only`
   first, as the page's inline Next scripts and the toast styles need `'unsafe-inline'`:
   `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: https://node.hashtagbillionaire.com; connect-src https://node.hashtagbillionaire.com; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
5. **The secrets** in GitHub (above), with the contents of `approval_deploy_key` as
   `DEPLOY_SSH_KEY`. Then delete both key files.
6. **The first deploy:** Actions > Deploy > Run workflow. Then
   `https://hashtagbillionaire.com/approval/` should show "This link isn't complete".
7. **Backend:** the page's origin is the shop's, which is already in `ACCESSDOMAINS`.
   The "Approval page address" setting defaults to `<FRONTEND_URL>/approval`; set it to
   `https://hashtagbillionaire.com/approval/` (with the slash) to save a redirect.
8. **Search engines:** `robots.txt` here only counts at a host's root. Ask the website
   team to add `Disallow: /approval` to the shop's robots file. Until then the
   `noindex` tag and the `X-Robots-Tag` header keep the page out of search results.

### Serving it from a subdomain instead

For example `approval.hashtagbillionaire.com`:

1. A proxied DNS record in the client's Cloudflare account, and a certificate for
   the name, set up like the other sites on the server.
2. An Apache site instead of step 4 above:

   ```apache
   <VirtualHost *:443>
       ServerName approval.hashtagbillionaire.com
       DocumentRoot /var/www/approval
       <Directory /var/www/approval>
           Options FollowSymLinks
           AllowOverride None
           Require all granted
       </Directory>
       ErrorDocument 404 /404.html
       Header always set X-Robots-Tag "noindex, nofollow"
       Header always set Referrer-Policy "no-referrer"
       Header always set X-Content-Type-Options "nosniff"
       Header always set X-Frame-Options "DENY"
       # plus the certificate lines the other sites use
   </VirtualHost>
   ```

3. In the workflow's Build step, set `NEXT_PUBLIC_BASE_PATH: ""`.
4. On the backend: add `https://approval.hashtagbillionaire.com` to `ACCESSDOMAINS`
   in `/var/www/backend/.env`, run `pm2 restart backend` (check `pm2 env` if it
   doesn't take), and set "Approval page address" to
   `https://approval.hashtagbillionaire.com/`.
5. `APPROVAL_URL` becomes `https://approval.hashtagbillionaire.com/`. This repo's
   `robots.txt` then applies on its own.
