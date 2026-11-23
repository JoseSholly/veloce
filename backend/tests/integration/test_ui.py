async def test_ui_index_is_served(anonymous_client):
    response = await anonymous_client.get("/ui/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "app.js" in response.text


async def test_ui_assets_are_served(anonymous_client):
    for path, content_type in (
        ("/ui/app.js", "javascript"),
        ("/ui/app.css", "text/css"),
    ):
        response = await anonymous_client.get(path)

        assert response.status_code == 200
        assert content_type in response.headers["content-type"]
