const board = document.getElementById("board")
const circle = document.getElementById("circle")
const grid = document.getElementById("grid")
const viewer = document.getElementById("viewer")
const viewerImg = document.getElementById("viewerImg")
const viewerClose = document.getElementById("viewerClose")

async function init() {
	if (location.search.includes("grant=")) {
		history.replaceState(null, "", location.pathname)
	}
	let session = { loggedIn: false, hasAccess: false }
	try {
		const res = await fetch("/api/session", { credentials: "include" })
		if (res.ok) session = await res.json()
	} catch {}
	if (!session.loggedIn) {
		location.href = "https://ozzyabc.xyz/login?2"
		return
	}
	if (!session.hasAccess) {
		location.href = "https://ozzyabc.xyz/password/2"
		return
	}
	board.hidden = false
	loadGrid()
}

async function loadGrid() {
	const res = await fetch("/api/list", { credentials: "include" })
	if (!res.ok) return
	const data = await res.json()
	grid.replaceChildren()
	for (const sticker of data.stickers) {
		grid.appendChild(makeCell(sticker))
	}
}

function makeCell(sticker) {
	const cell = document.createElement("div")
	cell.className = "cell"
	const btn = document.createElement("button")
	const img = document.createElement("img")
	img.loading = "lazy"
	img.alt = "sticker"
	img.src = "/api/img/" + encodeURIComponent(sticker.file)
	img.addEventListener("error", () => cell.remove())
	btn.appendChild(img)
	btn.addEventListener("click", () => {
		viewerImg.src = img.src
		viewer.hidden = false
	})
	const by = document.createElement("p")
	by.className = "uploader"
	if (sticker.picture) {
		const pic = document.createElement("img")
		pic.src = sticker.picture
		pic.alt = ""
		pic.referrerPolicy = "no-referrer"
		by.appendChild(pic)
	}
	by.appendChild(document.createTextNode(sticker.name || "someone"))
	cell.append(btn, by)
	return cell
}

viewerClose.addEventListener("click", () => {
	viewer.hidden = true
	viewerImg.src = ""
})

viewer.addEventListener("click", e => {
	if (e.target === viewer) viewerClose.click()
})

document.addEventListener("keydown", e => {
	if (e.key === "Escape" && !viewer.hidden) viewerClose.click()
})

async function toPngBlob(blob) {
	const bitmap = await createImageBitmap(blob)
	const canvas = document.createElement("canvas")
	canvas.width = bitmap.width
	canvas.height = bitmap.height
	canvas.getContext("2d").drawImage(bitmap, 0, 0)
	return new Promise(resolve => canvas.toBlob(resolve, "image/png"))
}

async function upload(blob) {
	circle.classList.add("busy")
	try {
		const png = await toPngBlob(blob)
		const res = await fetch("/api/upload", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "image/png" },
			body: png
		})
		if (res.ok) {
			const data = await res.json()
			grid.prepend(makeCell(data.sticker))
		}
	} finally {
		circle.classList.remove("busy")
		circle.replaceChildren()
	}
}

circle.addEventListener("paste", e => {
	const items = e.clipboardData && e.clipboardData.items
	if (!items) return
	for (const item of items) {
		if (item.type.startsWith("image/")) {
			e.preventDefault()
			upload(item.getAsFile())
			return
		}
	}
	e.preventDefault()
})

const watcher = new MutationObserver(() => {
	const imgs = circle.querySelectorAll("img")
	for (const img of imgs) {
		const src = img.getAttribute("src")
		if (!src) continue
		img.remove()
		fetch(src).then(r => r.blob()).then(upload)
	}
})
watcher.observe(circle, { childList: true, subtree: true })

circle.addEventListener("keydown", e => {
	if (e.key === "Enter") {
		e.preventDefault()
		circle.blur()
	}
})

circle.addEventListener("input", () => {
	if (!circle.querySelector("img") && circle.textContent) {
		circle.textContent = ""
	}
})

init()
