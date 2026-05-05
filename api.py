from flask import Blueprint, request, Response, stream_with_context
import requests
import json
import time
from config import SYSTEM_PROMPT, MODEL_NAME, MAX_TOKENS, TEMPERATURE, TOP_P, TOP_K, THINKING_BUDGET, VISION_TOKEN_BUDGET, VLLM_URL

api_bp = Blueprint('api', __name__)

@api_bp.route('/ask', methods=['POST'])
def ask():
    data = request.json
    messages = data.get('messages', [])
    enable_reasoning = data.get('enableReasoning', True)
    image_data = data.get('image')

    # Convert messages to vLLM/OpenAI multimodal format
    server_messages = []
    for i, msg in enumerate(messages):
        # If last message and image exists, use multimodal format
        if i == len(messages) - 1 and image_data:
            text_content = msg["content"] if msg["content"] else "이미지를 분석하시오"
            server_messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": text_content},
                    {"type": "image_url", "image_url": {"url": image_data}}
                ]
            })
        else:
            server_messages.append(msg)

    system_prompt_section = [{
        "role": "system",
        "content": SYSTEM_PROMPT
    }]
    server_messages = system_prompt_section + server_messages

    payload = {
        "model": MODEL_NAME,
        "messages": server_messages,
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
        "top_p": TOP_P,
        "top_k": TOP_K,
        "chat_template_kwargs": {
            "enable_thinking": enable_reasoning,
            "thinking_budget": THINKING_BUDGET
        },
        "stream": True,
        "stream_options": {"include_usage": True},
        "mm_processor_kwargs": {
            "vision_token_budget": VISION_TOKEN_BUDGET
        },
    }

    def generate():
        full_reply = ""
        full_reasoning = "" # Variable to store reasoning process
        start_time = time.time()
        first_token_time = None
        is_thinking = False # Flag to check if model is thinking

        try:
            with requests.post(VLLM_URL, json=payload, stream=True) as res:
                for line in res.iter_lines():
                    if line:
                        line = line.decode('utf-8')
                        if line.startswith('data: '):
                            data_str = line[6:]
                            if data_str == '[DONE]':
                                if is_thinking: # Close block if thinking when stream ends
                                    yield "</span>\n\n"
                                break
                            data = json.loads(data_str)

                            choices = data.get('choices', [])
                            if choices:
                                delta = choices[0].get('delta', {})

                                # 1. Handle Reasoning process
                                if 'reasoning' in delta:
                                    if not is_thinking:
                                        is_thinking = True
                                        # Apply style to distinguish thinking in UI
                                        yield "\n\n<span style=\"font-size: 0.85em; color: #9e9e9e; line-height: 1.2; display: block;\">**Thinking:**<br>"

                                    reasoning_chunk = delta['reasoning']
                                    full_reasoning += reasoning_chunk
                                    # Replace \n with <br> to prevent markdown block parsing (like lists)
                                    yield reasoning_chunk.replace("\n", "<br>")

                                # 2. Handle actual Content
                                if 'content' in delta:
                                    if is_thinking:
                                        is_thinking = False
                                        yield "</span>\n\n---\n\n" # Separator between thinking and content

                                    if first_token_time is None:
                                        first_token_time = time.time()

                                    chunk = delta['content']
                                    full_reply += chunk
                                    yield chunk

                            # Handle metrics (maintain existing logic)
                            usage = data.get('usage')
                            if usage:
                                end_time = time.time()
                                completion_tokens = usage.get('completion_tokens', 0)
                                prompt_tokens = usage.get('prompt_tokens', 0)
                                
                                cached_tokens = 0
                                prompt_details = usage.get('prompt_tokens_details')
                                if prompt_details:
                                    cached_tokens = prompt_details.get('cached_tokens', 0)

                                if first_token_time is not None:
                                    ttft = first_token_time - start_time
                                    tg_time = end_time - first_token_time
                                    tg_speed = completion_tokens / tg_time if tg_time > 0 else 0

                                    stats_msg = f"\n\n---\n<span style=\"font-size: 0.85em; color: #9e9e9e;\">**FT:** {ttft:.2f}s | **TG:** {tg_speed:.2f} t/s | ↑{prompt_tokens}↓{completion_tokens} ↻{cached_tokens} </span>"
                                    yield stats_msg

            # Pass pure content to frontend for history management
            yield f"__END_OF_TURN__{json.dumps(full_reply)}"
        except requests.exceptions.RequestException as e:
            print(f"Connection Error: {e}")
            yield "__CONNECTION_ERROR__"
        except Exception as e:
            print(f"Internal Server Error: {e}")
            yield "__SERVER_ERROR__"

    return Response(stream_with_context(generate()), mimetype='text/plain')
