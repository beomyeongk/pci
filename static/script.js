let chatHistory = [];
let selectedImageBase64 = null;
let isSending = false;
let currentAbortController = null;

window.cancelRequest = function () {
    if (currentAbortController) {
        currentAbortController.abort();
    }
};

window.addEventListener('DOMContentLoaded', (event) => {
    chatHistory = [];
    console.log("Frontend Context Initialized");

    const options = {
        throwOnError: false,
        displayMode: true
    };
    marked.use(markedKatex(options));

    const input = document.getElementById('userInput');

    // Image preview function
    window.previewImage = function (input) {
        const file = input.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                selectedImageBase64 = e.target.result;
                document.getElementById('imagePreview').src = selectedImageBase64;
                document.getElementById('imagePreviewContainer').style.display = 'block';
            }
            reader.readAsDataURL(file);
        }
    };

    // Image reset function
    window.clearImage = function () {
        selectedImageBase64 = null;
        document.getElementById('imageInput').value = '';
        document.getElementById('imagePreviewContainer').style.display = 'none';
    };

    // Handle clipboard image paste (Ctrl+V)
    input.addEventListener('paste', function (event) {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                event.preventDefault(); // Prevent default text paste
                const file = item.getAsFile();
                const reader = new FileReader();
                reader.onload = function (e) {
                    selectedImageBase64 = e.target.result;
                    document.getElementById('imagePreview').src = selectedImageBase64;
                    document.getElementById('imagePreviewContainer').style.display = 'block';
                };
                reader.readAsDataURL(file);
                return; // Stop after processing image (prevent fallback to text paste)
            }
        }
        // Allow default behavior (text paste) if no image is present
    });

    // Auto-adjust input field height
    input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Send on Enter (desktop), allow new line on mobile
    input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            // Check if device is mobile
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            if (!isMobile) {
                event.preventDefault(); // Prevent default new line
                send();
            }
        }
    });
});

async function send() {
    if (isSending) return;

    const input = document.getElementById('userInput');
    const chatbox = document.getElementById('chatbox');
    if (!input.value && !selectedImageBase64) return;

    isSending = true;
    currentAbortController = new AbortController();
    const sendBtn = document.querySelector('.send-btn');
    if (sendBtn) sendBtn.disabled = true;
    const cancelOverlay = document.getElementById('cancelOverlay');
    if (cancelOverlay) cancelOverlay.style.display = 'flex';

    try {
        const userMsg = input.value;
        const currentImage = selectedImageBase64; // Capture current image at time of sending
        const enableReasoning = document.getElementById('enableReasoning').checked;

        // Only store text in history (images are treated as one-time artifacts per user feedback)
        chatHistory.push({ "role": "user", "content": userMsg });

        // UI Display (include image if present)
        const userMsgDiv = document.createElement('div');
        userMsgDiv.className = 'msg user';

        if (currentImage) {
            const img = document.createElement('img');
            img.src = currentImage;
            userMsgDiv.appendChild(img);
        }

        if (userMsg) {
            const textSpan = document.createElement('span');
            textSpan.textContent = userMsg;
            userMsgDiv.appendChild(textSpan);
        }

        chatbox.appendChild(userMsgDiv);

        const payload = {
            messages: chatHistory,
            enableReasoning: enableReasoning,
            image: currentImage // Send image only for this turn
        };

        input.value = '';
        input.style.height = 'auto';
        clearImage();
        chatbox.scrollTop = chatbox.scrollHeight;

        const response = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: currentAbortController.signal
        });

        const botMsgDiv = document.createElement('div');
        botMsgDiv.className = 'msg bot';
        chatbox.appendChild(botMsgDiv);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulatedText = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            accumulatedText += decoder.decode(value, { stream: true });

            // Prevent tilde (~) markdown parsing issues by dynamically adding backslash (\) for escaping
            let safeText = accumulatedText.replace(/~/g, String.fromCharCode(92) + '~');
            let displayHTML = safeText;

            // Handle connection/server error from server
            if (safeText.includes("__CONNECTION_ERROR__") || safeText.includes("__SERVER_ERROR__")) {
                botMsgDiv.innerHTML = safeText.includes("__CONNECTION_ERROR__") ? '<em>AI 서버가 미가동중입니다.</em>' : '<em>서버 내부 오류 발생</em>';
                botMsgDiv.style.color = '#ffaa00';
                chatHistory.pop(); // Remove the user message from history
                break;
            }

            // Hide hidden metadata from UI to maintain frontend UX
            if (safeText.includes("__END_OF_TURN__")) {
                displayHTML = safeText.split("__END_OF_TURN__")[0];
            }

            botMsgDiv.innerHTML = marked.parse(displayHTML);
            chatbox.scrollTop = chatbox.scrollHeight;
        }

        // After stream completes, add the pure response to history
        if (accumulatedText.includes("__END_OF_TURN__")) {
            let parts = accumulatedText.split("__END_OF_TURN__");
            try {
                let fullReply = JSON.parse(parts[1]);
                chatHistory.push({ "role": "assistant", "content": fullReply });
            } catch (e) { }
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('Request aborted by user');
            const abortMsgDiv = document.createElement('div');
            abortMsgDiv.className = 'msg bot';
            abortMsgDiv.style.color = '#ffaa00';
            abortMsgDiv.innerHTML = '<em>요청이 취소되었습니다.</em>';
            chatbox.appendChild(abortMsgDiv);
            chatbox.scrollTop = chatbox.scrollHeight;
            chatHistory.pop(); // Remove the user message from history since the assistant didn't reply
        } else {
            console.error('Error in send():', e);
        }
    } finally {
        isSending = false;
        currentAbortController = null;
        if (sendBtn) sendBtn.disabled = false;
        const cancelOverlay = document.getElementById('cancelOverlay');
        if (cancelOverlay) cancelOverlay.style.display = 'none';
    }
}
