import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from .conf import NEWS_USER_AGENT

_session = requests.Session()
_session.headers.update({
    "User-Agent": NEWS_USER_AGENT or "Mozilla/5.0",
    "Accept": "*/*",
})
retry = Retry(total=3, backoff_factor=0.2, status_forcelist=[429, 500, 502, 503, 504])
_session.mount("https://", HTTPAdapter(max_retries=retry))
_session.mount("http://", HTTPAdapter(max_retries=retry))

def get(url: str, **kwargs):
# Wrapper around session.get with sane defaults
    kwargs.setdefault("timeout", 8)
    return _session.get(url, **kwargs)