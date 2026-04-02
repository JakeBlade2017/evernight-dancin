const vid = document.getElementById("bgVideo");
let audioContext, sourceNode, gainNode, intervalId;

document.getElementById("audioFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    document.body.style.backgroundColor = "black";

    if (sourceNode) {
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        sourceNode.stop(audioContext.currentTime + 0.5);
    }

    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get Channel Data
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // 1. Detect first beat and BPM
    const analysis = analyzeAudio(channelData, sampleRate);
    const firstBeatTime = analysis.firstBeatTime;
    const msPerBeat = analysis.msPerBeat;

    console.log(`Detected BPM: ${analysis.bpm.toFixed(2)} | Interval: ${msPerBeat.toFixed(0)}ms`);

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0.01, audioContext.currentTime);
    sourceNode.connect(gainNode).connect(audioContext.destination);
    sourceNode.start();
    gainNode.gain.exponentialRampToValueAtTime(1, audioContext.currentTime + 1);

    vid.pause();
    vid.currentTime = 0;

    const startDelay = firstBeatTime * 1000;
    
    // 2. Schedule dynamic animation
    setTimeout(() => {
        let isBlack = true;
        vid.play();
        
        // Use the calculated msPerBeat instead of 500ms
        intervalId = setInterval(() => {
            document.body.style.backgroundColor = isBlack ? "rgb(123, 88, 122)" : "black";
            isBlack = !isBlack;
        }, msPerBeat); 

        sourceNode.onended = () => {
            clearInterval(intervalId);
            intervalId = null;
            vid.pause();
            vid.currentTime = 0;
            document.body.style.backgroundColor = "black";
        };
    }, startDelay);
});

/* Combined function to find the first beat and calculate BPM */
function analyzeAudio(channelData, sampleRate) {
    const frameSize = 2048;
    const hopSize = 512;
    let energies = [];

    // Calculate energy across the track
    for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
        let sum = 0;
        for (let j = 0; j < frameSize; j++) {
            sum += channelData[i + j] ** 2;
        }
        energies.push(sum / frameSize);
    }

    const maxEnergy = Math.max(...energies);
    const threshold = maxEnergy * 0.3; // Adjust sensitivity here

    let peaks = [];
    let firstBeatTime = 0;

    // Find all peaks that cross threshold and are local maxima
    for (let i = 1; i < energies.length - 1; i++) {
        if (energies[i] > threshold && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
            const time = (i * hopSize) / sampleRate;
            peaks.push(time);
            if (peaks.length === 1) firstBeatTime = time;
        }
    }

    // Calculate average interval between peaks (Dynamic BPM)
    let intervals = [];
    for (let i = 1; i < peaks.length; i++) {
        const diff = peaks[i] - peaks[i - 1];
        // Filter out intervals that are too small (noise) or too large (gaps)
        // 0.3s to 1s covers roughly 60BPM to 200BPM
        if (diff > 0.3 && diff < 1.0) {
            intervals.push(diff);
        }
    }

    const avgInterval = intervals.length > 0 
        ? intervals.reduce((a, b) => a + b) / intervals.length 
        : 0.5; // Fallback to 500ms if detection fails

    return {
        firstBeatTime: firstBeatTime,
        msPerBeat: avgInterval * 1000,
        bpm: 60 / avgInterval
    };
}

// UI Update
const input = document.getElementById("audioFile");
const fileName = document.getElementById("fileName");

input.addEventListener("change", () => {
    fileName.textContent = input.files.length ? input.files[0].name : "No files selected";
});