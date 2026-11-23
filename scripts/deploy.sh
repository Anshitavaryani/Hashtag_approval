#!/usr/bin/env bash
# Puts a built approval site live. The Deploy workflow (.github/workflows/deploy.yml)
# runs it after the build. README.md, "Deploying", covers the settings and the
# one-time server setup. It works like the admin panel's scripts/deploy.sh.
#
#   scripts/deploy.sh [build folder]          default: out
#
# Settings, from the environment:
#   DEPLOY_HOST       server address
#   DEPLOY_USER       the user that deploys; it owns only <DEPLOY_PATH>-releases
#   DEPLOY_PATH       the folder the web server serves, e.g. /var/www/approval
#   DEPLOY_SSH_KEY    that user's private key
#   DEPLOY_HOST_KEY   the server's public host key (/etc/ssh/ssh_host_ed25519_key.pub)
#   DEPLOY_PORT       SSH port, default 22
#   DEPLOY_KEEP       builds to keep on the server, default 5
#   APPROVAL_URL      the site's address, e.g. https://hashtagbillionaire.com/approval/;
#                     when set, checks that it serves the new build
#
# With none of the five required DEPLOY_ settings (a new repo whose server isn't
# ready yet) it deploys nothing and ends without an error. With only some of them
# it stops with an error that names the missing ones.
#
# Each build is uploaded to its own folder, <DEPLOY_PATH>-releases/<time>-<commit>.
# <DEPLOY_PATH>-releases/current links to the live build and DEPLOY_PATH links to
# current, so going live is a single rename and nobody sees a half-copied site.
set -euo pipefail
export LC_ALL=C

fail() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::$*"; else echo "error: $*"; fi >&2
  exit 1
}

dist=${1:-out}
port=${DEPLOY_PORT:-22}
keep=${DEPLOY_KEEP:-5}

required=(DEPLOY_HOST DEPLOY_USER DEPLOY_PATH DEPLOY_SSH_KEY DEPLOY_HOST_KEY)
missing=()
for name in "${required[@]}"; do
  [ -n "${!name:-}" ] || missing+=("$name")
done
if [ ${#missing[@]} -eq ${#required[@]} ]; then
  message="Not deployed: the DEPLOY_ secrets aren't set yet (README.md, Deploying). The build itself passed."
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::notice::$message"; else echo "$message"; fi
  [ -z "${GITHUB_STEP_SUMMARY:-}" ] || echo "$message" >>"$GITHUB_STEP_SUMMARY"
  exit 0
fi
[ ${#missing[@]} -eq 0 ] ||
  fail "Missing secrets: ${missing[*]}. Add them to the production environment (README.md, Deploying)."

live=$DEPLOY_PATH
while [ "${live%/}" != "$live" ]; do live=${live%/}; done
[[ $live =~ ^(/[A-Za-z0-9._-]+){2,}$ && /$live/ != */../* ]] ||
  fail "DEPLOY_PATH must be a full path such as /var/www/approval, using only letters, digits, '.', '_' and '-'."
[[ $DEPLOY_USER =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "DEPLOY_USER isn't a valid user name."
[[ $DEPLOY_HOST =~ ^[A-Za-z0-9.-]+$ ]] || fail "DEPLOY_HOST must be a host name or an IPv4 address."
[[ $port =~ ^[0-9]+$ ]] || fail "DEPLOY_PORT must be a number."
[[ $keep =~ ^[1-9][0-9]*$ ]] || fail "DEPLOY_KEEP must be a number above 0."
[ -f "$dist/index.html" ] || fail "There's no build in $dist (no index.html)."

commit=${GITHUB_SHA:-$(git rev-parse --verify -q HEAD 2>/dev/null || echo manual)}
release="$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:7}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

key=$work/id
(umask 077 && printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' >"$key")
ssh-keygen -y -P '' -f "$key" >/dev/null 2>&1 ||
  fail "DEPLOY_SSH_KEY isn't a usable private key. Paste the whole key file, including its BEGIN and END lines. The key can't have a passphrase."

# Trust only the server's own key. Accepts a .pub file's line or a known_hosts line.
if [ "$port" = 22 ]; then pattern=$DEPLOY_HOST; else pattern="[$DEPLOY_HOST]:$port"; fi
while read -r first rest; do
  case $first in
    '' | '#'*) ;;
    ssh-* | ecdsa-* | sk-*) printf '%s %s %s\n' "$pattern" "$first" "$rest" ;;
    *) printf '%s %s\n' "$pattern" "$rest" ;;
  esac
done < <(printf '%s\n' "$DEPLOY_HOST_KEY" | tr -d '\r') >"$work/known_hosts"
fingerprints=$(ssh-keygen -l -f "$work/known_hosts" 2>/dev/null) ||
  fail "DEPLOY_HOST_KEY isn't a public key. Use the line in /etc/ssh/ssh_host_ed25519_key.pub on the server."
echo "Server key: $(awk '{print $2}' <<<"$fingerprints" | paste -sd ' ' -)"

ssh_opts=(
  -i "$key" -p "$port"
  -o IdentitiesOnly=yes -o BatchMode=yes
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$work/known_hosts" -o GlobalKnownHostsFile=/dev/null
  -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4
)

# Runs on the server as DEPLOY_USER, with the build as a .tar.gz on stdin.
# Arguments: DEPLOY_PATH, the release name, how many builds to keep.
server_side() {
  set -euo pipefail
  export LC_ALL=C
  live=$1 release=$2 keep=$3
  releases=$live-releases
  name=${releases##*/}
  stop() {
    echo "$*" >&2
    exit 1
  }

  [ -d "$releases" ] && [ -w "$releases" ] ||
    stop "$releases is missing, or $(id -un) can't write to it. Do the one-time server setup in README.md first."
  [ "$(readlink -- "$live" || true)" = "$name/current" ] ||
    stop "$live should link to $name/current. Do the one-time server setup in README.md first."

  exec 9>"$releases/.deploy.lock"
  flock -n 9 || stop "Another deploy is running on the server."

  dir=$releases/$release
  mkdir -- "$dir"
  trap 'rm -rf -- "$dir"' EXIT
  tar -xzf - --no-same-owner -C "$dir"
  [ -f "$dir/index.html" ] || stop "The upload has no index.html."
  chmod -R u=rwX,go=rX -- "$dir"

  # Going live: a new link renamed over the old one, which is atomic.
  ln -sfn -- "$release" "$releases/.current.tmp"
  mv -Tf -- "$releases/.current.tmp" "$releases/current"
  trap - EXIT
  echo "Live: $release"

  # Keep the newest builds.
  shopt -s nullglob
  builds=("$releases"/[0-9]*T[0-9]*Z-*/)
  for ((i = 0; i < ${#builds[@]} - keep; i++)); do
    old=${builds[i]%/}
    [ "${old##*/}" = "$release" ] || rm -rf -- "$old" || echo "Couldn't remove the old build ${old##*/}." >&2
  done
}

payload=$(printf '%s\nserver_side "$@"\n' "$(declare -f server_side)" | base64 | tr -d '\n')

echo "Uploading $(du -sh "$dist" | cut -f1) as $release"
set +e
# The payload and arguments are meant to expand here, before they're sent.
# shellcheck disable=SC2029
tar -czf - -C "$dist" . 2>"$work/tar.log" |
  ssh "${ssh_opts[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
    "bash -c \"\$(printf %s $payload | base64 -d)\" deploy $live $release $keep"
codes=("${PIPESTATUS[@]}")
set -e
# When the server stops reading, tar only reports the broken pipe; leave that out.
grep -vE 'Child returned status 141|Error is not recoverable' "$work/tar.log" >&2 || true
case ${codes[1]} in
  0) ;;
  255) fail "Couldn't sign in to the server (see above). Check DEPLOY_HOST, DEPLOY_PORT, DEPLOY_USER, DEPLOY_SSH_KEY and DEPLOY_HOST_KEY. The live site didn't change." ;;
  *) fail "The server stopped the deploy (see above). The live site didn't change." ;;
esac
[ "${codes[0]}" = 0 ] || fail "Packing the build failed (see above)."

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "Deployed \`${commit:0:7}\` as \`$release\`." >>"$GITHUB_STEP_SUMMARY"
fi

# Check that the site now serves this build: its page names every script of the new
# build (Next's file names change with their contents), and one comes back as JavaScript.
if [ -z "${APPROVAL_URL:-}" ]; then
  echo "APPROVAL_URL isn't set, so the live site wasn't checked."
  exit 0
fi
url=${APPROVAL_URL%/}
scripts=()
while IFS= read -r src; do scripts+=("$src"); done < <(
  grep -oE '<script[^>]+src="[^"]+\.js"' "$dist/index.html" | sed -E 's/.*src="([^"]+)".*/\1/' || true
)
if [ ${#scripts[@]} -eq 0 ]; then
  echo "The build's index.html names no script, so the live site wasn't checked."
  exit 0
fi
case ${scripts[0]} in
  http://* | https://*) asset=${scripts[0]} ;;
  /*) asset="$(sed -E 's#^(https?://[^/]+).*#\1#' <<<"$url")${scripts[0]}" ;;
  *) asset="$url/${scripts[0]}" ;;
esac

served='' status=''
for _ in 1 2 3 4 5 6; do
  page=$(curl -sSL --max-time 15 -H 'Cache-Control: no-cache' -w '\n%{http_code}' "$url/?release=$release" 2>/dev/null) || page=
  status=${page##*$'\n'}
  if [ "$status" = 200 ]; then
    served=1
    for src in "${scripts[@]}"; do
      grep -qF "$src" <<<"${page%$'\n'*}" || served=''
    done
    [ -z "$served" ] || break
  fi
  sleep 5
done
if [ -z "$served" ]; then
  [ "$status" = 200 ] ||
    fail "The new build went live on the server, but the check couldn't load APPROVAL_URL (${status:+HTTP }${status:-no answer}). If a firewall or Cloudflare blocks GitHub's servers, remove the APPROVAL_URL secret to skip the check."
  fail "The new build is on the server, but APPROVAL_URL still serves another page. Check that DEPLOY_PATH is the folder the web server serves for the site, and that the build's NEXT_PUBLIC_BASE_PATH matches the address."
fi
type=$(curl -fsS --max-time 15 -o /dev/null -w '%{content_type}' "$asset" 2>/dev/null) || type=
case $type in
  *javascript*) echo "Checked: the site serves the new build." ;;
  *) fail "The site's page is new, but its script came back as '${type:-an error}', not JavaScript. Check how the web server serves /_next." ;;
esac
