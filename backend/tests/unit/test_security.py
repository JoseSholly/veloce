from datetime import timedelta

import pytest
from fastapi import HTTPException

from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from tests.helpers import forge_token

# --- Passwords --------------------------------------------------------------


def test_hash_is_not_the_plain_password():
    hashed = hash_password("password123")

    assert hashed != "password123"
    assert "password123" not in hashed
    assert hashed.startswith("$argon2")


def test_correct_password_verifies():
    assert verify_password("password123", hash_password("password123")) is True


def test_wrong_password_does_not_verify():
    assert verify_password("wrong-password", hash_password("password123")) is False


def test_same_password_gives_different_hashes_because_of_the_salt():
    assert hash_password("password123") != hash_password("password123")


# --- Tokens -----------------------------------------------------------------


def test_valid_token_decodes():
    payload = decode_access_token(create_access_token("42"))

    assert payload["sub"] == "42"
    assert {"exp", "iat"} <= payload.keys()


def assert_rejected(token: str) -> None:
    with pytest.raises(HTTPException) as error:
        decode_access_token(token)

    assert error.value.status_code == 401
    assert error.value.headers == {"WWW-Authenticate": "Bearer"}


def test_malformed_token_is_rejected():
    assert_rejected("this-is-not-a-jwt")


def test_empty_token_is_rejected():
    assert_rejected("")


def test_expired_token_is_rejected():
    assert_rejected(forge_token(expires_in=timedelta(minutes=-5)))


def test_token_signed_with_another_key_is_rejected():
    assert_rejected(forge_token(key="a-different-secret-key-of-32-bytes!!"))


def test_token_signed_with_another_algorithm_is_rejected():
    # Same secret, but HS512. Only the configured algorithm is accepted.
    assert_rejected(forge_token(algorithm="HS512"))


def test_token_without_subject_is_rejected():
    assert_rejected(forge_token(omit=("sub",)))


def test_token_without_expiry_is_rejected():
    assert_rejected(forge_token(omit=("exp",)))


def test_tampered_token_is_rejected():
    token = forge_token()
    header, payload, signature = token.split(".")
    tampered = ".".join([header, payload[:-2] + "AA", signature])

    assert_rejected(tampered)


# --- Refresh tokens ---------------------------------------------------------


def test_refresh_tokens_are_random_and_long():
    first, second = generate_refresh_token(), generate_refresh_token()

    assert first != second
    assert len(first) >= 64


def test_refresh_token_hash_is_stable_and_hides_the_token():
    token = generate_refresh_token()

    assert hash_refresh_token(token) == hash_refresh_token(token)
    assert hash_refresh_token(token) != token
    assert token not in hash_refresh_token(token)
    assert len(hash_refresh_token(token)) == 64


def test_different_refresh_tokens_have_different_hashes():
    assert hash_refresh_token("token-one") != hash_refresh_token("token-two")


def test_refresh_token_is_not_a_jwt():
    # It must not be accepted as an access token, and it carries no readable data.
    with pytest.raises(HTTPException):
        decode_access_token(generate_refresh_token())
