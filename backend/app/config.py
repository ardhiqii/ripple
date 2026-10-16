from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
ModelProvider = Literal["synthetic", "gemini_developer", "vertex"]


class Settings(BaseSettings):
    """Environment-backed settings for the API process."""

    app_name: str = "Ripple API"
    app_version: str = "0.1.0"
    environment: Literal["local", "preview", "test", "staging", "production"] = "local"
    log_level: LogLevel = "INFO"
    demo_actor_id: str = "demo-planner"
    demo_scenario_id: str = "A-12-base"
    synthetic_preview_extraction_enabled: bool = True
    model_provider: ModelProvider = "synthetic"
    intake_model: str = ""
    gemini_api_key: SecretStr | None = None
    vertex_project: str | None = None
    vertex_location: str = "us-central1"
    model_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    model_retry_attempts: int = Field(default=1, ge=0, le=2)
    database_url: str | None = None
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=3, ge=0, le=50)
    db_pool_timeout_seconds: float = Field(default=3.0, gt=0, le=60)
    db_statement_timeout_seconds: float = Field(default=3.0, gt=0, le=60)
    solver_max_workers: int = Field(default=1, ge=1, le=8)
    cloud_run_concurrency: int = Field(default=8, ge=1, le=1000)
    cloud_run_timeout_seconds: int = Field(default=90, ge=1, le=900)
    demo_capabilities: list[str] = Field(
        default_factory=lambda: ["planner.read", "planner.write", "planner.approve"]
    )
    request_size_limit_bytes: int = 1_048_576
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    cors_origin_regex: str | None = None

    model_config = SettingsConfigDict(
        env_prefix="RIPPLE_",
        env_file=".env",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
