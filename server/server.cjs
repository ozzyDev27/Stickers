const http = require("http")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const port = Number(process.env.PORT) || 8130
const dbDir = path.join(process.env.HOME || "/home/ozzy", "databases", "stickers")
const imgDir = path.join(dbDir, "img")
const indexFile = path.join(dbDir, "stickers.json")
const meUrl = "https://ozzyabc.xyz/api/me"
const maxUpload = 5 * 1024 * 1024
const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const fileRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/

fs.mkdirSync(imgDir, { recursive: true })

function readIndex() {
	try {
		return JSON.parse(fs.readFileSync(indexFile, "utf8"))
	} catch {
		return []
	}
}

function writeIndex(list) {
	const tmp = indexFile + ".tmp"
	fs.writeFileSync(tmp, JSON.stringify(list, null, "\t"))
	fs.renameSync(tmp, indexFile)
}

async function whoAmI(req) {
	const cookie = req.headers.cookie
	if (!cookie) return { loggedIn: false }
	try {
		const res = await fetch(meUrl, { headers: { cookie } })
		if (!res.ok) return { loggedIn: false }
		return await res.json()
	} catch {
		return { loggedIn: false }
	}
}

function hasAccess(me) {
	return me.loggedIn === true && me.access && Object.prototype.hasOwnProperty.call(me.access, "2")
}

function send(res, code, body, headers) {
	res.writeHead(code, {
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
		"Content-Type": "application/json",
		...headers
	})
	res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

function okOrigin(req) {
	const origin = req.headers.origin
	if (!origin) return true
	try {
		const host = new URL(origin).hostname
		return host === "ozzyabc.xyz" || host.endsWith(".ozzyabc.xyz") || host === "localhost" || host === "127.0.0.1"
	} catch {
		return false
	}
}

function readBody(req, limit) {
	return new Promise((resolve, reject) => {
		const chunks = []
		let size = 0
		req.on("data", chunk => {
			size += chunk.length
			if (size > limit) {
				reject(new Error("too big"))
				req.destroy()
				return
			}
			chunks.push(chunk)
		})
		req.on("end", () => resolve(Buffer.concat(chunks)))
		req.on("error", reject)
	})
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, "http://localhost")

	if (req.method === "GET" && url.pathname === "/api/session") {
		const me = await whoAmI(req)
		send(res, 200, {
			loggedIn: me.loggedIn === true,
			hasAccess: hasAccess(me),
			name: me.name || null,
			picture: me.picture || null
		})
		return
	}

	if (req.method === "GET" && url.pathname === "/api/list") {
		const me = await whoAmI(req)
		if (!hasAccess(me)) {
			send(res, 401, { ok: false })
			return
		}
		const stickers = readIndex().filter(s => fileRe.test(s.file) && fs.existsSync(path.join(imgDir, s.file)))
		stickers.reverse()
		send(res, 200, { stickers })
		return
	}

	if (req.method === "GET" && url.pathname.startsWith("/api/img/")) {
		const me = await whoAmI(req)
		if (!hasAccess(me)) {
			send(res, 401, { ok: false })
			return
		}
		const file = url.pathname.slice("/api/img/".length)
		if (!fileRe.test(file)) {
			send(res, 404, { ok: false })
			return
		}
		fs.readFile(path.join(imgDir, file), (err, data) => {
			if (err) {
				send(res, 404, { ok: false })
				return
			}
			res.writeHead(200, {
				"Content-Type": "image/png",
				"X-Content-Type-Options": "nosniff",
				"Content-Disposition": "inline",
				"Cache-Control": "private, max-age=31536000, immutable"
			})
			res.end(data)
		})
		return
	}

	if (req.method === "POST" && url.pathname === "/api/upload") {
		if (!okOrigin(req)) {
			send(res, 403, { ok: false })
			return
		}
		const me = await whoAmI(req)
		if (!hasAccess(me)) {
			send(res, 401, { ok: false })
			return
		}
		let body
		try {
			body = await readBody(req, maxUpload)
		} catch {
			send(res, 413, { ok: false })
			return
		}
		if (body.length < 8 || !body.subarray(0, 8).equals(pngMagic)) {
			send(res, 415, { ok: false })
			return
		}
		const file = crypto.randomUUID() + ".png"
		fs.writeFileSync(path.join(imgDir, file), body)
		const entry = { file, name: me.name || "someone", picture: me.picture || "", time: Math.floor(Date.now() / 1000) }
		const list = readIndex()
		list.push(entry)
		writeIndex(list)
		send(res, 200, { ok: true, sticker: entry })
		return
	}

	send(res, 404, { ok: false })
})

server.listen(port, "127.0.0.1", () => {
	console.log("stickers server on " + port)
})
