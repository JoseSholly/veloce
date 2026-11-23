from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str
    TEST_DATABASE_URL: str | None = None
    REDIS_URL: str = "redis://localhost:6380/0"

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Logging. JSON lines by default; set LOG_JSON=false for readable dev output.
    LOG_LEVEL: str = "INFO"
    LOG_JSON: bool = True
    # Log every SQL statement (very noisy, for debugging only).
    SQL_ECHO: bool = False

    # How long a readiness probe waits for each dependency.
    HEALTH_CHECK_TIMEOUT_SECONDS: float = 2.0


settings = Settings()
