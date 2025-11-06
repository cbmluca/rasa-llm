import core.news_service as news


def test_topic_news_search_prefers_danish_rss(monkeypatch):
    captured = {}

    def fake_rss(query, *, lang, country, limit, days):
        captured.setdefault("calls", []).append((query, lang, country, limit, days))
        if lang == "da":
            return [{"title": "DK headline", "url": "https://example.dk"}]
        return []

    def fake_newsapi(*args, **kwargs):
        return []

    monkeypatch.setattr(news, "_google_news_rss", fake_rss)
    monkeypatch.setattr(news, "_newsapi_search", fake_newsapi)

    result = news.topic_news_search("nyheder om dansk politik", limit=3)

    assert result == [{"title": "DK headline", "url": "https://example.dk"}]
    query, lang, country, limit, days = captured["calls"][0]
    assert lang == "da"
    assert country == "DK"


def test_topic_news_search_english_uses_newsapi(monkeypatch):
    english_payload = [{"title": "Quantum Breakthrough", "url": "https://example.com"}]

    def fake_newsapi(query, *, limit, days, language):
        assert language == "en"
        return english_payload

    def fake_rss(*args, **kwargs):
        return []

    monkeypatch.setattr(news, "_newsapi_search", fake_newsapi)
    monkeypatch.setattr(news, "_google_news_rss", fake_rss)

    result = news.topic_news_search("quantum computing")

    assert result == english_payload


def test_topic_news_search_falls_back_to_rss_when_newsapi_empty(monkeypatch):
    def fake_newsapi(*args, **kwargs):
        return []

    def fake_rss(query, *, lang, country, limit, days):
        return [{"title": f"RSS: {query}", "url": "https://example.com/rss"}]

    monkeypatch.setattr(news, "_newsapi_search", fake_newsapi)
    monkeypatch.setattr(news, "_google_news_rss", fake_rss)

    result = news.topic_news_search("latest ai")

    assert result[0]["title"].startswith("RSS: latest ai")


def test_news_search_limit_matches_config(monkeypatch):
    monkeypatch.setattr(news, "_NEWS_SEARCH_LIMIT", 7)
    assert news.news_search_limit() == 7
