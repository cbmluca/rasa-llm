"""Configuration helpers that load environment-driven defaults for the action server."""

import os
from dotenv import load_dotenv
load_dotenv()  # load .env from project root

# DR daily news
DR_RSS_URL   = os.getenv(
    "DR_RSS_URL", 
    "https://www.dr.dk/nyheder/service/feeds/allenyheder",
    )
DR_RSS_LIMIT = int(os.getenv("DR_RSS_LIMIT", "5"))

# Topic news
NEWS_API_KEY        = os.getenv("NEWS_API_KEY", "").strip()
NEWS_SEARCH_LIMIT   = int(os.getenv("NEWS_SEARCH_LIMIT", "5"))
NEWS_SEARCH_DAYS    = int(os.getenv("NEWS_SEARCH_DAYS", "3"))
NEWS_LOCAL_DAYS     = int(os.getenv("NEWS_LOCAL_DAYS", str(NEWS_SEARCH_DAYS)))
NEWS_USER_AGENT     = os.getenv("NEWS_USER_AGENT", "Mozilla/5.0")

# OpenAI
OPENAI_API_KEY      = os.getenv("OPENAI_API_KEY", "").strip()
MODEL               = os.getenv("MODEL", "gpt-4o-mini")