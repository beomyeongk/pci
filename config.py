import os
from dotenv import load_dotenv
from datetime import datetime
from zoneinfo import ZoneInfo
from string import Template

current_dttm = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%dT%H:%M")

# Load .env
load_dotenv()

# Load system prompt
with open('.system_prompt', 'r', encoding='utf-8') as f:
    prompt = f.read()

SYSTEM_PROMPT = Template(prompt).substitute(current_dttm=current_dttm)

MODEL_NAME = os.getenv("MODEL_NAME", "/data/model/gemma-4-31B-it")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "3600"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "1.1"))
TOP_P = float(os.getenv("TOP_P", "0.95"))
TOP_K = int(os.getenv("TOP_K", "64"))
THINKING_BUDGET = int(os.getenv("THINKING_BUDGET", "200"))
VISION_TOKEN_BUDGET = int(os.getenv("VISION_TOKEN_BUDGET", "1120"))
VLLM_URL = os.getenv("VLLM_URL", "http://localhost:8000/v1/chat/completions")
PORT = int(os.getenv("PORT", "8889"))
