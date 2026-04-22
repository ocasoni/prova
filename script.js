const labelText = document.getElementById("labelText");
const trailColor = document.getElementById("trailColor");
const clearTrailBtn = document.getElementById("clearTrailBtn");
const startRecordingBtn = document.getElementById("startRecordingBtn");
const endRecordingBtn = document.getElementById("endRecordingBtn");
const timer = document.getElementById("timer");
const imageProgress = document.getElementById("imageProgress");
const statusText = document.getElementById("statusText");
const frame = document.getElementById("frame");
const activeImage = document.getElementById("activeImage");
const trailCanvas = document.getElementById("trailCanvas");
const labelsLayer = document.getElementById("labelsLayer");

const trailCtx = trailCanvas.getContext("2d");

const images = [
	{ id: "img-1", name: "protesta1.avif", url: "protesta1.avif" },
	{ id: "img-2", name: "protesta2.jpeg", url: "protesta2.jpeg" },
	{ id: "img-3", name: "protesta3.jpeg", url: "protesta3.jpeg" }
];

const labelsByImage = new Map();
const trailByImage = new Map();

let selectedImageId = null;
let currentImageIndex = 0;
let remainingSeconds = 30;
let annotationTimerInterval = null;
let annotationsEnabled = true;
let lastPoint = null;

let displayStream = null;
let mediaRecorder = null;
let recordedChunks = [];

function setStatus(message) {
	statusText.textContent = message;
}

function formatSeconds(totalSeconds) {
	const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
	const seconds = String(totalSeconds % 60).padStart(2, "0");
	return `${minutes}:${seconds}`;
}

function updateTimerUI() {
	timer.textContent = formatSeconds(remainingSeconds);
}

function stopAnnotationTimer() {
	clearInterval(annotationTimerInterval);
	annotationTimerInterval = null;
}

function startAnnotationTimer() {
	stopAnnotationTimer();
	remainingSeconds = 30;
	updateTimerUI();

	annotationTimerInterval = setInterval(() => {
		remainingSeconds -= 1;
		updateTimerUI();

		if (remainingSeconds <= 0) {
			goToNextImage();
		}
	}, 1000);
}

function resizeCanvasToFrame() {
	const rect = frame.getBoundingClientRect();
	trailCanvas.width = Math.max(1, Math.floor(rect.width));
	trailCanvas.height = Math.max(1, Math.floor(rect.height));
}

function clearCanvas() {
	trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
}

function saveTrailForSelectedImage() {
	if (!selectedImageId) {
		return;
	}
	trailByImage.set(selectedImageId, trailCanvas.toDataURL("image/png"));
}

function restoreTrailForSelectedImage() {
	clearCanvas();

	if (!selectedImageId) {
		return;
	}

	const dataUrl = trailByImage.get(selectedImageId);
	if (!dataUrl) {
		return;
	}

	const restored = new Image();
	restored.onload = () => {
		trailCtx.drawImage(restored, 0, 0, trailCanvas.width, trailCanvas.height);
	};
	restored.src = dataUrl;
}

function renderLabels() {
	labelsLayer.innerHTML = "";
	const labels = labelsByImage.get(selectedImageId) || [];

	labels.forEach((label) => {
		const chip = document.createElement("div");
		chip.className = "label-chip";
		chip.textContent = label.text;
		chip.style.left = `${label.x * 100}%`;
		chip.style.top = `${label.y * 100}%`;
		labelsLayer.appendChild(chip);
	});
}

function setSelectedImage(index) {
	if (selectedImageId) {
		saveTrailForSelectedImage();
	}

	currentImageIndex = index;
	const selected = images[currentImageIndex];
	selectedImageId = selected.id;
	annotationsEnabled = true;

	activeImage.src = selected.url;
	activeImage.alt = selected.name;
	imageProgress.textContent = `Photo ${currentImageIndex + 1} of ${images.length}`;

	requestAnimationFrame(() => {
		resizeCanvasToFrame();
		restoreTrailForSelectedImage();
		renderLabels();
	});

	setStatus(`Annotating ${selected.name}. You have 30 seconds.`);
	startAnnotationTimer();
}

function completeSequence() {
	annotationsEnabled = false;
	stopAnnotationTimer();
	remainingSeconds = 0;
	updateTimerUI();
	setStatus("Annotation completed for all photos.");
}

function goToNextImage() {
	saveTrailForSelectedImage();

	if (currentImageIndex < images.length - 1) {
		setSelectedImage(currentImageIndex + 1);
		return;
	}

	completeSequence();
}

function addLabelAtClick(event) {
	if (!annotationsEnabled || !selectedImageId) {
		return;
	}

	const rect = frame.getBoundingClientRect();
	const x = (event.clientX - rect.left) / rect.width;
	const y = (event.clientY - rect.top) / rect.height;

	if (x < 0 || x > 1 || y < 0 || y > 1) {
		return;
	}

	const labels = labelsByImage.get(selectedImageId) || [];
	const text = labelText.value.trim() || `Label ${labels.length + 1}`;
	labels.push({ text, x, y });
	labelsByImage.set(selectedImageId, labels);
	renderLabels();
}

function drawTrail(event) {
	if (!annotationsEnabled || !selectedImageId) {
		return;
	}

	const rect = frame.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;

	if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
		lastPoint = null;
		return;
	}

	if (!lastPoint) {
		lastPoint = { x, y };
		return;
	}

	trailCtx.strokeStyle = trailColor.value;
	trailCtx.lineWidth = 4;
	trailCtx.lineCap = "round";
	trailCtx.lineJoin = "round";
	trailCtx.beginPath();
	trailCtx.moveTo(lastPoint.x, lastPoint.y);
	trailCtx.lineTo(x, y);
	trailCtx.stroke();

	lastPoint = { x, y };
}

function endTrailStroke() {
	lastPoint = null;
	saveTrailForSelectedImage();
}

function pickSupportedMimeType() {
	const options = [
		"video/webm;codecs=vp9,opus",
		"video/webm;codecs=vp8,opus",
		"video/webm"
	];

	return options.find((type) => MediaRecorder.isTypeSupported(type)) || "video/webm";
}

function stopDisplayTracks() {
	if (!displayStream) {
		return;
	}

	displayStream.getTracks().forEach((track) => track.stop());
	displayStream = null;
}

function finishRecording() {
	if (recordedChunks.length === 0) {
		setStatus("Recording stopped, but no data was captured.");
		return;
	}

	const mimeType = mediaRecorder ? mediaRecorder.mimeType : "video/webm";
	const blob = new Blob(recordedChunks, { type: mimeType });
	const url = URL.createObjectURL(blob);
	const fileName = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;

	const downloadLink = document.createElement("a");
	downloadLink.href = url;
	downloadLink.download = fileName;
	downloadLink.click();

	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 2000);

	setStatus(`Recording saved as ${fileName}.`);
}

async function startRecording() {
	if (mediaRecorder && mediaRecorder.state === "recording") {
		return;
	}

	try {
		displayStream = await navigator.mediaDevices.getDisplayMedia({
			video: { frameRate: 30 },
			audio: true
		});

		const hasAudio = displayStream.getAudioTracks().length > 0;
		if (!hasAudio) {
			setStatus("Screen sharing started. No system audio track was provided by the browser selection.");
		} else {
			setStatus("Recording screen and computer audio...");
		}

		const mimeType = pickSupportedMimeType();
		recordedChunks = [];
		mediaRecorder = new MediaRecorder(displayStream, { mimeType });

		mediaRecorder.addEventListener("dataavailable", (event) => {
			if (event.data && event.data.size > 0) {
				recordedChunks.push(event.data);
			}
		});

		mediaRecorder.addEventListener("stop", () => {
			stopDisplayTracks();
			finishRecording();

			startRecordingBtn.disabled = false;
			endRecordingBtn.disabled = true;
		});

		displayStream.getVideoTracks()[0].addEventListener("ended", () => {
			if (mediaRecorder && mediaRecorder.state === "recording") {
				mediaRecorder.stop();
			}
		});

		mediaRecorder.start(200);
		startRecordingBtn.disabled = true;
		endRecordingBtn.disabled = false;
	} catch (error) {
		setStatus(`Unable to start recording: ${error.message}`);
		stopDisplayTracks();
	}
}

function endRecording() {
	if (!mediaRecorder || mediaRecorder.state !== "recording") {
		return;
	}

	mediaRecorder.stop();
}

frame.addEventListener("click", addLabelAtClick);
frame.addEventListener("mousemove", drawTrail);
frame.addEventListener("mouseleave", endTrailStroke);
frame.addEventListener("mouseenter", () => {
	lastPoint = null;
});

clearTrailBtn.addEventListener("click", () => {
	if (!selectedImageId) {
		return;
	}

	clearCanvas();
	trailByImage.delete(selectedImageId);
	setStatus("Trail cleared for current image.");
});

startRecordingBtn.addEventListener("click", startRecording);
endRecordingBtn.addEventListener("click", endRecording);

window.addEventListener("resize", () => {
	if (!selectedImageId) {
		return;
	}

	saveTrailForSelectedImage();
	resizeCanvasToFrame();
	restoreTrailForSelectedImage();
	renderLabels();
});

if (images.length > 0) {
	setSelectedImage(0);
} else {
	setStatus("No images found in the folder.");
	annotationsEnabled = false;
	stopAnnotationTimer();
	remainingSeconds = 0;
	updateTimerUI();
}
