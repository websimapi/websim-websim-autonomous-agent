// Utility to capture the current screen/tab
// Returns a blob of the screenshot
export async function captureTab() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                displaySurface: "browser", // Prefer browser tab
            },
            audio: false,
            selfBrowserSurface: "include", // Allow capturing the current tab
            preferCurrentTab: true
        });

        const track = stream.getVideoTracks()[0];
        const imageCapture = new ImageCapture(track);
        
        // Grab a frame
        const bitmap = await imageCapture.grabFrame();
        
        // Stop the stream immediately
        track.stop();

        // Convert to Blob via Canvas
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    } catch (err) {
        console.error("Screen capture failed:", err);
        throw err;
    }
}

// Upload file to Websim storage
export async function uploadToWebsim(blob) {
    // Create a file object from blob
    const file = new File([blob], `screenshot_${Date.now()}.png`, { type: 'image/png' });
    try {
        const url = await window.websim.upload(file);
        return url;
    } catch (error) {
        console.error('Upload failed:', error);
        throw error;
    }
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}