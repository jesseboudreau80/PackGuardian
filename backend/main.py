from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
import pandas as pd
import pdfkit
import os

from database import engine, get_db, Base
from models import Incident
from schemas import IncidentCreate, IncidentUpdate, IncidentResponse

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="PAWSitiveOps OSHA Tracker", version="0.1")

UPLOAD_DIR = "uploads"
PDF_DIR = "pdf_reports"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PDF_DIR, exist_ok=True)


# ==================== Incident CRUD Endpoints ====================

@app.post("/incidents/", response_model=IncidentResponse)
def create_incident(incident: IncidentCreate, db: Session = Depends(get_db)):
    """Create a new OSHA incident report."""
    db_incident = Incident(
        employee_name=incident.employee_name,
        incident_date=incident.incident_date,
        description=incident.description,
        severity=incident.severity.value,
    )
    db.add(db_incident)
    db.commit()
    db.refresh(db_incident)
    return db_incident


@app.get("/incidents/", response_model=list[IncidentResponse])
def list_incidents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all OSHA incidents with pagination."""
    incidents = db.query(Incident).offset(skip).limit(limit).all()
    return incidents


@app.get("/incidents/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    """Get a specific incident by ID."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@app.put("/incidents/{incident_id}", response_model=IncidentResponse)
def update_incident(incident_id: int, incident: IncidentUpdate, db: Session = Depends(get_db)):
    """Update an existing incident."""
    db_incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not db_incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    update_data = incident.model_dump(exclude_unset=True)
    if "severity" in update_data and update_data["severity"]:
        update_data["severity"] = update_data["severity"].value
    
    for field, value in update_data.items():
        setattr(db_incident, field, value)
    
    db.commit()
    db.refresh(db_incident)
    return db_incident


@app.delete("/incidents/{incident_id}")
def delete_incident(incident_id: int, db: Session = Depends(get_db)):
    """Delete an incident."""
    db_incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not db_incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    db.delete(db_incident)
    db.commit()
    return {"message": "Incident deleted successfully"}


# ==================== File Upload Endpoints ====================

@app.post("/upload_excel/")
async def upload_excel(file: UploadFile = File(...)):
    try:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())

        df = pd.read_excel(file_path)
        records = df.to_dict(orient="records")
        return {"message": "Excel file uploaded successfully", "rows": len(records)}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/generate_pdf/")
async def generate_pdf(title: str = Form(...), content: str = Form(...)):
    try:
        html_content = f"<h1>{title}</h1><p>{content}</p>"
        pdf_path = os.path.join(PDF_DIR, f"{title.replace(' ', '_')}.pdf")
        pdfkit.from_string(html_content, pdf_path)
        return FileResponse(pdf_path, media_type="application/pdf", filename=os.path.basename(pdf_path))
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/")
def root():
    return {"message": "Welcome to the PAWSitiveOps OSHA Tracker API"}
