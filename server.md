# How the Server Works

This document tells you how the Raspberry Pi server works.

## Hardware

- Host name: strawberrypi
- User: ozzy
- Tailscale address: 100.76.152.46

## Folders

The home folder has these folders:

- `/home/ozzy/meta` is a clone of the Lemon repository. It holds the lmn command and its helper files.
- `/home/ozzy/sites` holds one folder for each project. Each folder is a full clone of the project repository.
- `/home/ozzy/databases` holds one folder for each project that has a database. Each folder holds the live database file and a backups folder. The file `databases/config.json` sets the backup rules for each project.
- `/home/ozzy/projects.json` is the list of all projects. The lmn command manages this file. The backup timer makes backups of this file in `databases/meta/backups`.

The folder `/var/www` holds the published files of each project. Caddy serves these files.

## Request Flow

```text
Browser
  |
Cloudflare
  |
cloudflared tunnel
  |
Caddy on port 8080
  |
/var/www/<project>  (static files)
  or
localhost:<port>    (project server)
```

Caddy listens on one port, 8080. Caddy reads the host name of each request and sends the request to the correct project. Each host name in the cloudflared configuration points to port 8080.

## The Main Site

The portfolio project is the root site. It serves https://ozzyabc.xyz. The host www.ozzyabc.xyz redirects to https://ozzyabc.xyz. All other projects serve on a subdomain, for example https://wordle.ozzyabc.xyz. An alias redirects to the main subdomain of its project.

## Project Servers

A project can have servers. A server is a file in the project repository that must always run, for example a Python file or a Node file.

Each server runs as a systemd unit. The unit name is `lemon-<project>-<number>.service`. The unit runs the server from the sites folder. Systemd restarts the server if it stops with an error.

A server can have a public route, for example `/api/*`. Caddy sends requests on that route to the port of the server.

Use `lmn server` to start, stop, and restart servers. Use `lmn status` to see all servers.

## Databases

A database is a file in `databases/<project>/`. The usual format is JSON. The file `types.json` and the code make it easy to add more formats.

A systemd timer runs every 5 minutes. It reads `databases/config.json`. For each project, it looks at the backup interval. The default interval is 60 minutes. If the interval has passed, and the database file is different from the newest backup, the timer makes a new backup. If the file is the same as the newest backup, the timer does not make a backup.

Backups go in `databases/<project>/backups/`. A backup name has the form `<name>.<timestamp>.<extension>`.

## Deploys

All deploys are manual. There is no deploy on a push to GitHub. Type `lmn deploy <name>` to deploy.

A deploy pulls the repository, builds it if needed, copies the output to /var/www, installs server dependencies, restarts the servers, and writes the Caddy and cloudflared configurations. If a step before the copy fails, the live site does not change.

## The Meta System

The folder `/home/ozzy/meta` is a git clone of the Lemon repository. The repository holds:

- `lmn` - the main command
- `meta.py` - the update script
- `dbbackup.py` - the backup script that the timer runs
- `status.py` - the live status view
- `types.json` - the list of project types
- `descriptions.json` - the descriptions that lmn status shows
- `lmn.md` and `server.md` - the documents
- `secrets.json` - credentials. This file is not in git. Make it by hand:

```json
{
	"cf_token": "cloudflare api token with cache purge permission",
	"cf_zone": "zone id from the cloudflare overview page for ozzyabc.xyz",
	"gh_token": "github fine-grained token with read-only metadata permission"
}
```

The cf values are for `lmn cache`. The gh value lets `lmn create` autocomplete private repository names.

### How to change the lemon code

Do not edit the files in /home/ozzy/meta on the Pi. The Pi only pulls. The Pi never pushes.

Do these steps:

1. Edit the files in the Lemon repository on your computer.
2. Commit and push to GitHub with git.
3. Type `lmn meta` on the Pi.

The `lmn meta` command pulls the repository and then runs the new meta.py. The new meta.py installs the lmn link in /usr/local/bin, writes the backup timer units, and enables the timer. Because ~/meta is the clone itself, meta.py also updates itself in the pull.

If you edit a file on the Pi directly, the next `lmn meta` can fail or remove your change. Always edit on your computer and push.

## First Installation

Do these steps one time on a new Pi:

```bash
git clone git@github.com:ozzyDev27/Lemon.git ~/meta
python3 ~/meta/meta.py
```

## Services That Are Not Lemon

These services also run on the Pi:

- caddy - the web server
- cloudflared - the tunnel to Cloudflare
- tailscaled - the Tailscale agent

Do not remove these services.
