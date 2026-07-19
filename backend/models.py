from sqlalchemy import Column, Integer, String, Text, Date, DateTime
from sqlalchemy.sql import func
from database import Base


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    employee_name = Column(String(255), nullable=False)
    incident_date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(10), nullable=False)  # Low, Medium, High
    created_at = Column(DateTime(timezone=True), server_default=func.now())
