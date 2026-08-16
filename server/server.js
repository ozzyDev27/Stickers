const http = require("http")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const DB_ROOT = process.env.STICKERS_DB_PATH || "/home/ozzy/db/stickers"
const PORT = process.env.PORT || 3002
const MAX_BYTES = 10 * 1024 * 1024

function validPassword(pw) {
	if (typeof pw !== "string") return false
	if (pw.length < 1 || pw.length > 64) return false
	return /^[a-zA-Z0-9_-]+$/.test(pw)
}

function boardDir(pw) {
	if (!validPassword(pw)) return null
	const dir = path.join(DB_ROOT, pw)
	if (!fs.existsSync(dir)) return null
	if (!fs.statSync(dir).isDirectory()) return null
	return dir
}

function json(res, code, obj) {
	const body = JSON.stringify(obj)
	res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) })
	res.end(body)
}

function readBody(req, limit) {
	return new Promise((resolve, reject) => {
		const chunks = []
		let total = 0
		req.on("data", chunk => {
			total += chunk.length
			if (total > limit) {
				reject(new Error("too large"))
				req.destroy()
				return
			}
			chunks.push(chunk)
		})
		req.on("end", () => resolve(Buffer.concat(chunks)))
		req.on("error", reject)
	})
}

function isPng(buf) {
	if (buf.length < 8) return false
	return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, "http://localhost")
	const parts = url.pathname.split("/").filter(Boolean)

	if (req.method === "POST" && url.pathname === "/api/enter") {
		let body
		try {
			body = await readBody(req, 4096)
		} catch (e) {
			json(res, 413, { error: "too large" })
			return
		}
		let pw
		try {
			pw = JSON.parse(body.toString()).password
		} catch (e) {
			json(res, 400, { error: "bad request" })
			return
		}
		if (boardDir(pw)) {
			json(res, 200, { ok: true })
		} else {
			json(res, 403, { error: "wrong password" })
		}
		return
	}

	if (req.method === "GET" && url.pathname === "/api/list") {
		const dir = boardDir(url.searchParams.get("pw"))
		if (!dir) {
			json(res, 403, { error: "wrong password" })
			return
		}
		const files = fs.readdirSync(dir).filter(f => f.endsWith(".png"))
		files.sort().reverse()
		json(res, 200, { stickers: files })
		return
	}

	if (req.method === "POST" && url.pathname === "/api/upload") {
		const dir = boardDir(url.searchParams.get("pw"))
		if (!dir) {
			json(res, 403, { error: "wrong password" })
			return
		}
		let body
		try {
			body = await readBody(req, MAX_BYTES)
		} catch (e) {
			json(res, 413, { error: "too large" })
			return
		}
		if (!isPng(body)) {
			json(res, 400, { error: "not a png" })
			return
		}
		const name = Date.now() + "-" + crypto.randomBytes(4).toString("hex") + ".png"
		fs.writeFileSync(path.join(dir, name), body)
		json(res, 200, { file: name })
		return
	}

	if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "img") {
		const dir = boardDir(parts[2])
		const file = parts[3]
		if (!dir || !/^[a-zA-Z0-9-]+\.png$/.test(file)) {
			json(res, 403, { error: "nope" })
			return
		}
		const full = path.join(dir, file)
		if (!fs.existsSync(full)) {
			json(res, 404, { error: "not found" })
			return
		}
		const data = fs.readFileSync(full)
		res.writeHead(200, { "Content-Type": "image/png", "Content-Length": data.length, "Cache-Control": "public, max-age=31536000, immutable" })
		res.end(data)
		return
	}

	json(res, 404, { error: "not found" })
})

server.listen(PORT, "127.0.0.1", () => {
	console.log("stickers backend on " + PORT)
})
