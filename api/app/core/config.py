from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "PackGuardian"
    app_version: str = "0.1.0"
    env: str = "prod"  # "dev" or "prod"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "https://packguardian.jesseboudreau.com",
    ]
    database_url: str = "postgresql+psycopg2://user:password@localhost:5432/packguardian"
    # JWT — override JWT_SECRET in production via environment variable
    jwt_secret: str = "CHANGE-THIS-SECRET-IN-PRODUCTION"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24
    upload_dir: str = "/tmp/packguardian_uploads"

    class Config:
        env_file = ".env"


settings = Settings()
