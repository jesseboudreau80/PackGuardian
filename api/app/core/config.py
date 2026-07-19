from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "PackGuardian"
    app_version: str = "0.1.0"
    env: str = "prod"  # "dev" or "prod"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3005",
        "https://packguardian.jesseboudreau.com",
    ]
    demo_tenant_id: str = "00000000-0000-0000-0000-000000000001"
    database_url: str = "postgresql+psycopg2://user:password@localhost:5432/packguardian"
    # JWT — override JWT_SECRET in production via environment variable
    jwt_secret: str = "CHANGE-THIS-SECRET-IN-PRODUCTION"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24
    upload_dir: str = "/tmp/packguardian_uploads"
    anthropic_api_key: str = ""  # Set ANTHROPIC_API_KEY in .env to enable Claude extraction

    # Slack — #packguardian-lab wiki channel
    # Set SLACK_WEBHOOK_PACKGUARDIAN_LAB=https://hooks.slack.com/services/... in api/.env
    slack_webhook_packguardian_lab: str = ""
    # Signing secret for verifying inbound Slack events/commands
    slack_signing_secret: str = ""

    # Aegis integration — internal API base for event emission
    # Set AEGIS_API_URL=http://127.0.0.1:8102 in api/.env to enable
    aegis_api_url: str = "http://127.0.0.1:8102"
    aegis_enabled: bool = False  # Enable when service-to-service auth is wired

    # Internal API key — shared secret for Aegis agent service-to-service calls
    # Set PACKGUARDIAN_INTERNAL_KEY=<random 32+ char string> in api/.env
    packguardian_internal_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
