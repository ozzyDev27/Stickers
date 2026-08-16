let password = null

const gate = document.getElementById("gate")
const gateForm = document.getElementById("gateForm")
const gateInput = document.getElementById("gateInput")
const gateError = document.getElementById("gateError")
const board = document.getElementById("board")
const circle = document.getElementById("circle")
const grid = document.getElementById("grid")
const viewer = document.getElementById("viewer")
const viewerImg = document.getElementById("viewerImg")
const viewerClose = document.getElementById("viewerClose")

gateForm.addEventListener("submit", async e => {
	e.preventDefault()
	const pw = gateInput.value.trim()
	if (!pw) return
	const res = await fetch("/api/enter", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ password: pw })
	})
	if (res.ok) {
		password = pw
		gate.hidden = true
		board.hidden = false
		loadGrid()
	} else {
		gateError.hidden = false
		gateError.style.animation = "none"
		void gateError.offsetWidth
		gateError.style.animation = ""
	}
})

async function loadGrid() {
	const res = await fetch("/api/list?pw=" + encodeURIComponent(password))
	if (!res.ok) return
	const data = await res.json()
	grid.replaceChildren()
	for (const file of data.stickers) {
		grid.appendChild(makeCell(file))
	}
}

function makeCell(file) {
	const btn = document.createElement("button")
	const img = document.createElement("img")
	img.loading = "lazy"
	img.alt = "sticker"
	img.src = "/api/img/" + encodeURIComponent(password) + "/" + file
	btn.appendChild(img)
	btn.addEventListener("click", () => {
		viewerImg.src = img.src
		viewer.hidden = false
	})
	return btn
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
		const res = await fetch("/api/upload?pw=" + encodeURIComponent(password), {
			method: "POST",
			headers: { "Content-Type": "image/png" },
			body: png
		})
		if (res.ok) {
			const data = await res.json()
			grid.prepend(makeCell(data.file))
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
