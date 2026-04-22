const labelText = document.getElementById("labelText");
const trailColor = document.getElementById("trailColor");
const clearTrailBtn = document.getElementById("clearTrailBtn");
const startRecordingBtn = document.getElementById("startRecordingBtn");
const endRecordingBtn = document.getElementById("endRecordingBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const nextImageBtn = document.getElementById("nextImageBtn");
const pauseBtn = document.getElementById("pauseBtn");
const taskContainer = document.getElementById("taskContainer");
const timer = document.getElementById("timer");
const imageProgress = document.getElementById("imageProgress");
const statusText = document.getElementById("statusText");
const frame = document.getElementById("frame");
const activeImage = document.getElementById("activeImage");
const trailCanvas = document.getElementById("trailCanvas");
const labelsLayer = document.getElementById("labelsLayer");

const tasks = [
	`Click 'Start Recording' to begin recording your screen and audio, and to start the timer and annotations. 

Click on the point in the photo to add an annotation. 

Make sure the audio is being recorded and can be heard.

Task: annotate the three images objectively. As you annotate them, describe the photo aloud and explain how you have decided to annotate those elements. 

Time limit: 90 seconds

Upload the screen recording to the Google Forms form and answer the other two questions`,
	`Click 'Start Recording' to begin recording your screen and audio, and to start the timer and annotations. 

Click on the point in the photo to add an annotation. 

Make sure the audio is being recorded and can be heard.

Task: annotate the three images objectively. As you annotate them, describe your interpretation of the photo out loud. 

Time limit: 90 seconds

Upload the screen recording to the Google Forms and answer the other two questions`,
	`Click 'Start Recording' to begin recording your screen and audio, and to start the timer and annotations. 

Click on the point in the photo to add an annotation. 

Make sure the audio is being recorded and can be heard.

Task: annotate the three images objectively. As you annotate them, describe your interpretation of the photo out loud. 

Time limit: 60 seconds

Upload the screen recording to the Google Forms and answer the other two questions`,
	`Click 'Start Recording' to begin recording your screen and audio, and to start the timer and annotations. 

Click on the point in the photo to add an annotation. 

Make sure the audio is being recorded and can be heard.

Task: annotate these images giving a verbal interpretation of the emotions that shine through people's faces.

Time limit: none

Upload the screen recording to the Google Forms and answer the other two questions`
];

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
let currentTaskIndex = -1;
let remainingSeconds = 30;
let annotationTimerInterval = null;
let annotationsEnabled = false;
let lastPoint = null;
let sequenceActive = false;
let isPaused = false;

let displayStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingDownloadUrl = null;
let recordingFileName = "";

function loadImage(src) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
		image.src = src;
	});
}

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

function updatePauseButtonUI() {
	pauseBtn.textContent = isPaused ? "Resume" : "Pause";
	pauseBtn.disabled = !sequenceActive;
}

function stopAnnotationTimer() {
	clearInterval(annotationTimerInterval);
	annotationTimerInterval = null;
}

function startAnnotationTimer() {
	stopAnnotationTimer();

	if (currentTaskIndex === 3) {
		remainingSeconds = 0;
		updateTimerUI();
		nextImageBtn.classList.remove("is-hidden");
		nextImageBtn.disabled = false;
		return;
	}

	const timerDuration = (currentTaskIndex === 2) ? 20 : 30;
	remainingSeconds = timerDuration;
	updateTimerUI();
	nextImageBtn.classList.add("is-hidden");
	nextImageBtn.disabled = true;

	annotationTimerInterval = setInterval(() => {
		if (isPaused) {
			return;
		}

		remainingSeconds -= 1;
		updateTimerUI();

		if (remainingSeconds <= 0) {
			advanceToNextImage();
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

	activeImage.src = selected.url;
	activeImage.alt = selected.name;
	imageProgress.textContent = `Photo ${currentImageIndex + 1} of ${images.length}`;

	requestAnimationFrame(() => {
		resizeCanvasToFrame();
		restoreTrailForSelectedImage();
		renderLabels();
	});
}

function completeSequence() {
	annotationsEnabled = false;
	sequenceActive = false;
	isPaused = false;
	updatePauseButtonUI();
	stopAnnotationTimer();
	remainingSeconds = 0;
	updateTimerUI();
	setStatus("Annotation completed for all photos. Stopping recording...");

	if (mediaRecorder && mediaRecorder.state === "recording") {
		mediaRecorder.stop();
	}
}

function startCurrentImageWindow() {
	if (!sequenceActive) {
		return;
	}

	annotationsEnabled = true;
	isPaused = false;
	updatePauseButtonUI();
	const selected = images[currentImageIndex];

	if (currentTaskIndex === 3) {
		setStatus(`Annotating ${selected.name}. Click 'Next Image' when done.`);
	} else {
		const timerDuration = (currentTaskIndex === 2) ? 20 : 30;
		setStatus(`Annotating ${selected.name}. You have ${timerDuration} seconds.`);
	}

	startAnnotationTimer();
}

function advanceToNextImage() {
	saveTrailForSelectedImage();
	annotationsEnabled = false;
	nextImageBtn.classList.add("is-hidden");
	nextImageBtn.disabled = true;

	if (currentImageIndex < images.length - 1) {
		setSelectedImage(currentImageIndex + 1);
		startCurrentImageWindow();
		return;
	}

	completeSequence();
}

function clearAllAnnotations() {
	labelsByImage.clear();
	trailByImage.clear();
	labelsLayer.innerHTML = "";
	clearCanvas();
}

function triggerBlobDownload(blob, fileName) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();

	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 1500);
}

async function buildAnnotatedPhotoBlob(imageEntry) {
	const baseImage = await loadImage(imageEntry.url);
	const outputCanvas = document.createElement("canvas");
	outputCanvas.width = baseImage.naturalWidth;
	outputCanvas.height = baseImage.naturalHeight;

	const outputCtx = outputCanvas.getContext("2d");
	outputCtx.drawImage(baseImage, 0, 0, outputCanvas.width, outputCanvas.height);

	const trailDataUrl = trailByImage.get(imageEntry.id);
	if (trailDataUrl) {
		const trailImage = await loadImage(trailDataUrl);
		outputCtx.drawImage(trailImage, 0, 0, outputCanvas.width, outputCanvas.height);
	}

	const labels = labelsByImage.get(imageEntry.id) || [];
	labels.forEach((label) => {
		const centerX = label.x * outputCanvas.width;
		const centerY = label.y * outputCanvas.height;

		const fontSize = Math.max(16, Math.round(outputCanvas.width * 0.02));
		const xPadding = Math.max(8, Math.round(fontSize * 0.45));
		const yPadding = Math.max(6, Math.round(fontSize * 0.32));

		outputCtx.font = `600 ${fontSize}px Space Grotesk, Segoe UI, sans-serif`;
		const textWidth = outputCtx.measureText(label.text).width;
		const chipWidth = textWidth + xPadding * 2;
		const chipHeight = fontSize + yPadding * 2;
		const chipX = centerX - chipWidth / 2;
		const chipY = centerY - chipHeight / 2;

		outputCtx.fillStyle = "rgba(0, 0, 0, 0.72)";
		outputCtx.beginPath();
		outputCtx.roundRect(chipX, chipY, chipWidth, chipHeight, Math.round(chipHeight / 2));
		outputCtx.fill();

		outputCtx.strokeStyle = "rgba(255, 255, 255, 0.28)";
		outputCtx.lineWidth = Math.max(1, Math.round(outputCanvas.width * 0.0015));
		outputCtx.stroke();

		outputCtx.fillStyle = "#ffffff";
		outputCtx.textAlign = "left";
		outputCtx.textBaseline = "middle";
		outputCtx.fillText(label.text, chipX + xPadding, centerY);
	});

	return new Promise((resolve, reject) => {
		outputCanvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error("Unable to generate photo blob."));
				return;
			}

			resolve(blob);
		}, "image/png");
	});
}

async function downloadAllFiles() {
	if (!recordingDownloadUrl) {
		setStatus("No recording available to download.");
		return;
	}

	try {
		setStatus("Downloading recording and images...");

		const recordingBlob = await fetch(recordingDownloadUrl).then((res) => res.blob());
		triggerBlobDownload(recordingBlob, recordingFileName || "session-recording.webm");

	for (let i = 0; i < images.length; i++) {
		await new Promise((resolve) => setTimeout(resolve, 800));
		try {
			const imageEntry = images[i];
			const photoBlob = await buildAnnotatedPhotoBlob(imageEntry);
			const baseName = imageEntry.name.replace(/\.[^.]+$/, "");
			triggerBlobDownload(photoBlob, `${baseName}-annotated.png`);
		} catch (error) {
			setStatus(`Unable to export photo ${i + 1}: ${error.message}`);
		}
	}

		setStatus("Download complete. Recording and all annotated photos saved.");
	} catch (error) {
		setStatus(`Download error: ${error.message}`);
	}
}

function showLabelInput(event) {
	if (!annotationsEnabled || !selectedImageId) {
		return;
	}

	const rect = frame.getBoundingClientRect();
	const clickX = event.clientX - rect.left;
	const clickY = event.clientY - rect.top;
	const relativeX = clickX / rect.width;
	const relativeY = clickY / rect.height;

	if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) {
		return;
	}

	const input = document.createElement("input");
	input.type = "text";
	input.placeholder = "Label text...";
	input.style.position = "absolute";
	input.style.left = `${clickX}px`;
	input.style.top = `${clickY}px`;
	input.style.transform = "translate(-50%, -50%)";
	input.style.padding = "6px 8px";
	input.style.borderRadius = "6px";
	input.style.border = "1px solid #ff5a3d";
	input.style.backgroundColor = "#f7fbff";
	input.style.color = "#09203f";
	input.style.fontSize = "13px";
	input.style.fontWeight = "600";
	input.style.zIndex = "10";
	input.style.minWidth = "120px";
	input.style.outline = "none";

	frame.appendChild(input);
	input.focus();

	const handleSubmit = () => {
		const text = input.value.trim() || `Label ${(labelsByImage.get(selectedImageId) || []).length + 1}`;
		const labels = labelsByImage.get(selectedImageId) || [];
		labels.push({ text, x: relativeX, y: relativeY });
		labelsByImage.set(selectedImageId, labels);
		renderLabels();
		input.remove();
	};

	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			handleSubmit();
		}
	});

	input.addEventListener("blur", () => {
		setTimeout(() => {
			if (input.parentNode === frame) {
				input.remove();
			}
		}, 100);
	});
}

function addLabelAtClick(event) {
	showLabelInput(event);
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
		downloadAllBtn.classList.add("is-hidden");
		downloadAllBtn.disabled = true;
		return;
	}

	const mimeType = mediaRecorder ? mediaRecorder.mimeType : "video/webm";
	const blob = new Blob(recordedChunks, { type: mimeType });

	if (recordingDownloadUrl) {
		URL.revokeObjectURL(recordingDownloadUrl);
	}

	recordingDownloadUrl = URL.createObjectURL(blob);
	recordingFileName = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;

	downloadAllBtn.classList.remove("is-hidden");
	downloadAllBtn.disabled = false;
	setStatus("Recording completed. Click 'download recording and images'.");
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

		if (recordingDownloadUrl) {
			URL.revokeObjectURL(recordingDownloadUrl);
			recordingDownloadUrl = null;
			recordingFileName = "";
		}

		downloadAllBtn.classList.add("is-hidden");
		downloadAllBtn.disabled = true;
		nextImageBtn.classList.add("is-hidden");
		nextImageBtn.disabled = true;

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
			stopAnnotationTimer();
			annotationsEnabled = false;
			sequenceActive = false;
			isPaused = false;
			updatePauseButtonUI();
			nextImageBtn.classList.add("is-hidden");
			nextImageBtn.disabled = true;
			finishRecording();

			startRecordingBtn.disabled = false;
			endRecordingBtn.disabled = true;
		});

		displayStream.getVideoTracks()[0].addEventListener("ended", () => {
			if (mediaRecorder && mediaRecorder.state === "recording") {
				mediaRecorder.stop();
			}
		});

		clearAllAnnotations();
		currentImageIndex = 0;
		setSelectedImage(currentImageIndex);
		sequenceActive = true;
		isPaused = false;
		updatePauseButtonUI();
		startCurrentImageWindow();

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

	sequenceActive = false;
	annotationsEnabled = false;
	isPaused = false;
	updatePauseButtonUI();
	stopAnnotationTimer();
	mediaRecorder.stop();
}

function togglePause() {
	if (!sequenceActive) {
		return;
	}

	isPaused = !isPaused;
	updatePauseButtonUI();

	if (isPaused) {
		annotationsEnabled = false;
		lastPoint = null;
		setStatus("Timer paused. Annotations are disabled.");
		return;
	}

	annotationsEnabled = true;
	setStatus(`Annotating ${images[currentImageIndex].name}. You have ${remainingSeconds} seconds.`);
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
pauseBtn.addEventListener("click", togglePause);
nextImageBtn.addEventListener("click", advanceToNextImage);
downloadAllBtn.addEventListener("click", downloadAllFiles);

window.addEventListener("resize", () => {
	if (!selectedImageId) {
		return;
	}

	saveTrailForSelectedImage();
	resizeCanvasToFrame();
	restoreTrailForSelectedImage();
	renderLabels();
});

function displayRandomTask() {
	currentTaskIndex = Math.floor(Math.random() * tasks.length);
	taskContainer.textContent = tasks[currentTaskIndex];
}

if (images.length > 0) {
	setSelectedImage(0);
	setStatus("Press Start Recording to begin the 30-second timer for each photo.");
	updateTimerUI();
	updatePauseButtonUI();
	displayRandomTask();
} else {
	setStatus("No images found in the folder.");
	annotationsEnabled = false;
	stopAnnotationTimer();
	remainingSeconds = 0;
	updateTimerUI();
	updatePauseButtonUI();
	displayRandomTask();
}
