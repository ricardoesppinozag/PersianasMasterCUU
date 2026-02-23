from fastapi import FastAPI, APIRouter, HTTPException, Response, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
from bson import ObjectId
import io
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Helper function to convert ObjectId to string
def serialize_doc(doc):
    if doc is None:
        return None
    doc['id'] = str(doc['_id'])
    del doc['_id']
    return doc

# ============== MODELS ==============

# Color/Model variant for products
class ProductColor(BaseModel):
    name: str
    code: Optional[str] = None  # Optional color code like #FFFFFF

class ProductBase(BaseModel):
    name: str
    description: str
    distributor_price: float  # Price per m² for distributor
    client_price: float  # Price per m² for client
    colors: List[ProductColor] = []  # Available colors/models

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    distributor_price: Optional[float] = None
    client_price: Optional[float] = None
    colors: Optional[List[ProductColor]] = None

class Product(ProductBase):
    id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Business Configuration
class BusinessConfigBase(BaseModel):
    business_name: str = "Persianas Premium"
    phone: str = "+52 555 123 4567"
    email: str = "contacto@persianaspremium.mx"
    address: str = "Av. Reforma 123, Col. Centro, CDMX"
    logo_base64: Optional[str] = None

class BusinessConfigUpdate(BaseModel):
    business_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    logo_base64: Optional[str] = None

class BusinessConfig(BusinessConfigBase):
    id: str

# Quote Item with additional options
class QuoteItemCreate(BaseModel):
    product_id: str
    product_name: str
    color: Optional[str] = None  # Selected color (free text)
    width: float  # in meters
    height: float  # in meters
    unit_price: float  # price per m²
    chain_orientation: str = "Derecha"  # Izquierda or Derecha
    fascia_type: str = "Redonda"  # Redonda, Cuadrada sin forrar, Cuadrada forrada
    fascia_color: str = "Blanca"  # Negra, Blanca, Gris, Café, Ivory
    fascia_price: float = 0.0  # Optional fascia cost
    installation_price: float = 0.0  # Optional installation cost

class QuoteItemResponse(BaseModel):
    product_id: str
    product_name: str
    color: Optional[str] = None
    width: float
    height: float
    square_meters: float
    unit_price: float
    subtotal: float
    chain_orientation: str = "Derecha"
    fascia_type: str = "Redonda"
    fascia_color: str = "Blanca"
    fascia_price: float = 0.0
    installation_price: float = 0.0

class QuoteCreate(BaseModel):
    items: List[QuoteItemCreate]
    client_type: str  # 'distributor' or 'client'
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    notes: Optional[str] = None

class Quote(BaseModel):
    id: str
    items: List[QuoteItemResponse]
    total: float
    client_type: str
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

# ============== ROUTES ==============

@api_router.get("/")
async def root():
    return {"message": "API de Cotización de Persianas Enrollables"}

# ---------- BUSINESS CONFIG ----------

@api_router.get("/config", response_model=BusinessConfig)
async def get_business_config():
    config = await db.business_config.find_one()
    if not config:
        # Create default config
        default_config = {
            "business_name": "Persianas Premium",
            "phone": "+52 555 123 4567",
            "email": "contacto@persianaspremium.mx",
            "address": "Av. Reforma 123, Col. Centro, CDMX",
            "logo_base64": None
        }
        result = await db.business_config.insert_one(default_config)
        default_config['id'] = str(result.inserted_id)
        return BusinessConfig(**default_config)
    
    return BusinessConfig(**serialize_doc(config))

@api_router.put("/config", response_model=BusinessConfig)
async def update_business_config(config: BusinessConfigUpdate):
    existing = await db.business_config.find_one()
    
    if not existing:
        # Create new config
        config_dict = config.dict(exclude_none=True)
        if not config_dict:
            config_dict = {
                "business_name": "Persianas Premium",
                "phone": "+52 555 123 4567",
                "email": "contacto@persianaspremium.mx",
                "address": "Av. Reforma 123, Col. Centro, CDMX",
                "logo_base64": None
            }
        result = await db.business_config.insert_one(config_dict)
        config_dict['id'] = str(result.inserted_id)
        return BusinessConfig(**config_dict)
    
    update_data = {k: v for k, v in config.dict().items() if v is not None}
    
    if update_data:
        await db.business_config.update_one(
            {"_id": existing["_id"]},
            {"$set": update_data}
        )
    
    updated = await db.business_config.find_one({"_id": existing["_id"]})
    return BusinessConfig(**serialize_doc(updated))

# ---------- PRODUCTS ----------

@api_router.get("/products", response_model=List[Product])
async def get_products():
    products = await db.products.find().to_list(1000)
    return [Product(**serialize_doc(p)) for p in products]

@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    try:
        product = await db.products.find_one({"_id": ObjectId(product_id)})
    except:
        raise HTTPException(status_code=400, detail="ID de producto inválido")
    
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    return Product(**serialize_doc(product))

@api_router.post("/products", response_model=Product)
async def create_product(product: ProductCreate):
    product_dict = product.dict()
    product_dict['created_at'] = datetime.utcnow()
    
    result = await db.products.insert_one(product_dict)
    product_dict['id'] = str(result.inserted_id)
    
    return Product(**product_dict)

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, product: ProductUpdate):
    try:
        existing = await db.products.find_one({"_id": ObjectId(product_id)})
    except:
        raise HTTPException(status_code=400, detail="ID de producto inválido")
    
    if not existing:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    update_data = {k: v for k, v in product.dict().items() if v is not None}
    
    if update_data:
        await db.products.update_one(
            {"_id": ObjectId(product_id)},
            {"$set": update_data}
        )
    
    updated = await db.products.find_one({"_id": ObjectId(product_id)})
    return Product(**serialize_doc(updated))

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    try:
        result = await db.products.delete_one({"_id": ObjectId(product_id)})
    except:
        raise HTTPException(status_code=400, detail="ID de producto inválido")
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    return {"message": "Producto eliminado exitosamente"}

# ---------- SEED PRODUCTS ----------

@api_router.post("/products/seed")
async def seed_products():
    # Check if products already exist
    count = await db.products.count_documents({})
    if count > 0:
        return {"message": f"Ya existen {count} productos en la base de datos"}
    
    sample_products = [
        {
            "name": "Persiana Enrollable Blackout",
            "description": "Bloqueo total de luz, ideal para recámaras. Tela de alta densidad con respaldo térmico.",
            "distributor_price": 450.0,
            "client_price": 585.0,
            "colors": [
                {"name": "Blanco", "code": "#FFFFFF"},
                {"name": "Beige", "code": "#F5F5DC"},
                {"name": "Gris", "code": "#808080"},
                {"name": "Negro", "code": "#000000"},
                {"name": "Azul Marino", "code": "#000080"}
            ],
            "created_at": datetime.utcnow()
        },
        {
            "name": "Persiana Enrollable Traslúcida",
            "description": "Permite el paso de luz difusa, perfecta para salas y comedores. Disponible en múltiples colores.",
            "distributor_price": 350.0,
            "client_price": 455.0,
            "colors": [
                {"name": "Blanco", "code": "#FFFFFF"},
                {"name": "Crema", "code": "#FFFDD0"},
                {"name": "Arena", "code": "#C2B280"},
                {"name": "Gris Claro", "code": "#D3D3D3"}
            ],
            "created_at": datetime.utcnow()
        },
        {
            "name": "Persiana Screen 5%",
            "description": "Visibilidad hacia el exterior con protección solar. Reduce el calor y rayos UV.",
            "distributor_price": 520.0,
            "client_price": 676.0,
            "colors": [
                {"name": "Blanco/Gris", "code": "#E8E8E8"},
                {"name": "Gris/Negro", "code": "#4A4A4A"},
                {"name": "Beige/Bronce", "code": "#C4A484"},
                {"name": "Charcoal", "code": "#36454F"}
            ],
            "created_at": datetime.utcnow()
        },
        {
            "name": "Persiana Día/Noche",
            "description": "Sistema dual con franjas alternas para control preciso de luz y privacidad.",
            "distributor_price": 480.0,
            "client_price": 624.0,
            "colors": [
                {"name": "Blanco", "code": "#FFFFFF"},
                {"name": "Marfil", "code": "#FFFFF0"},
                {"name": "Gris", "code": "#808080"},
                {"name": "Chocolate", "code": "#7B3F00"}
            ],
            "created_at": datetime.utcnow()
        },
        {
            "name": "Persiana Decorativa Premium",
            "description": "Diseños exclusivos con texturas y patrones. Acabado de lujo para espacios elegantes.",
            "distributor_price": 400.0,
            "client_price": 520.0,
            "colors": [
                {"name": "Lino Natural", "code": "#FAF0E6"},
                {"name": "Textura Gris", "code": "#A9A9A9"},
                {"name": "Damasco", "code": "#FFCBA4"},
                {"name": "Perla", "code": "#EAE0C8"}
            ],
            "created_at": datetime.utcnow()
        }
    ]
    
    result = await db.products.insert_many(sample_products)
    return {"message": f"Se crearon {len(result.inserted_ids)} productos de ejemplo con colores"}

# ---------- QUOTES ----------

@api_router.post("/quotes", response_model=Quote)
async def create_quote(quote: QuoteCreate):
    items_with_calculations = []
    total = 0
    
    for item in quote.items:
        square_meters = round(item.width * item.height, 2)
        product_subtotal = round(square_meters * item.unit_price, 2)
        fascia_cost = round(item.fascia_price, 2) if item.fascia_price else 0.0
        installation_cost = round(item.installation_price, 2) if item.installation_price else 0.0
        subtotal = product_subtotal + fascia_cost + installation_cost
        total += subtotal
        
        items_with_calculations.append({
            "product_id": item.product_id,
            "product_name": item.product_name,
            "color": item.color,
            "width": item.width,
            "height": item.height,
            "square_meters": square_meters,
            "unit_price": item.unit_price,
            "subtotal": subtotal,
            "chain_orientation": item.chain_orientation,
            "fascia_type": item.fascia_type,
            "fascia_color": item.fascia_color,
            "fascia_price": fascia_cost,
            "installation_price": installation_cost
        })
    
    quote_dict = {
        "items": items_with_calculations,
        "total": round(total, 2),
        "client_type": quote.client_type,
        "client_name": quote.client_name,
        "client_phone": quote.client_phone,
        "client_email": quote.client_email,
        "notes": quote.notes,
        "created_at": datetime.utcnow()
    }
    
    result = await db.quotes.insert_one(quote_dict)
    quote_dict['id'] = str(result.inserted_id)
    
    return Quote(**quote_dict)

@api_router.get("/quotes", response_model=List[Quote])
async def get_quotes():
    quotes = await db.quotes.find().sort("created_at", -1).to_list(100)
    return [Quote(**serialize_doc(q)) for q in quotes]

@api_router.get("/quotes/{quote_id}", response_model=Quote)
async def get_quote(quote_id: str):
    try:
        quote = await db.quotes.find_one({"_id": ObjectId(quote_id)})
    except:
        raise HTTPException(status_code=400, detail="ID de cotización inválido")
    
    if not quote:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    
    return Quote(**serialize_doc(quote))

@api_router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str):
    try:
        result = await db.quotes.delete_one({"_id": ObjectId(quote_id)})
    except:
        raise HTTPException(status_code=400, detail="ID de cotización inválido")
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    
    return {"message": "Cotización eliminada exitosamente"}

# ---------- PDF GENERATION ----------

@api_router.get("/quotes/{quote_id}/pdf")
async def generate_quote_pdf(quote_id: str):
    try:
        quote = await db.quotes.find_one({"_id": ObjectId(quote_id)})
    except:
        raise HTTPException(status_code=400, detail="ID de cotización inválido")
    
    if not quote:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    
    quote_data = serialize_doc(quote)
    
    # Get business config
    config = await db.business_config.find_one()
    if not config:
        config = {
            "business_name": "Persianas Premium",
            "phone": "+52 555 123 4567",
            "email": "contacto@persianaspremium.mx",
            "address": "Av. Reforma 123, Col. Centro, CDMX",
            "logo_base64": None
        }
    
    # Create PDF in memory
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        alignment=TA_CENTER,
        spaceAfter=12,
        textColor=colors.HexColor('#2C3E50')
    )
    
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        alignment=TA_CENTER,
        spaceAfter=20,
        textColor=colors.HexColor('#7F8C8D')
    )
    
    info_style = ParagraphStyle(
        'InfoStyle',
        parent=styles['Normal'],
        fontSize=10,
        alignment=TA_LEFT,
        spaceAfter=6
    )
    
    elements = []
    
    # Company Header with custom name
    business_name = config.get('business_name', 'Persianas Premium')
    elements.append(Paragraph(business_name.upper(), title_style))
    elements.append(Paragraph("Cotización de Persianas Enrollables", subtitle_style))
    
    # Company info
    company_info = f"""
    <b>Teléfono:</b> {config.get('phone', '+52 555 123 4567')} | <b>Email:</b> {config.get('email', 'contacto@persianaspremium.mx')}<br/>
    <b>Dirección:</b> {config.get('address', 'Av. Reforma 123, Col. Centro, CDMX')}
    """
    elements.append(Paragraph(company_info, info_style))
    elements.append(Spacer(1, 20))
    
    # Quote details
    quote_date = quote_data.get('created_at', datetime.utcnow())
    if isinstance(quote_date, str):
        quote_date = datetime.fromisoformat(quote_date.replace('Z', '+00:00'))
    
    client_type_label = "DISTRIBUIDOR" if quote_data['client_type'] == 'distributor' else "CLIENTE"
    
    quote_info = f"""
    <b>Folio:</b> {quote_data['id'][:8].upper()}<br/>
    <b>Fecha:</b> {quote_date.strftime('%d/%m/%Y %H:%M')}<br/>
    <b>Tipo de Cliente:</b> {client_type_label}
    """
    
    if quote_data.get('client_name'):
        quote_info += f"<br/><b>Cliente:</b> {quote_data['client_name']}"
    if quote_data.get('client_phone'):
        quote_info += f"<br/><b>Teléfono:</b> {quote_data['client_phone']}"
    if quote_data.get('client_email'):
        quote_info += f"<br/><b>Email:</b> {quote_data['client_email']}"
    
    elements.append(Paragraph(quote_info, info_style))
    elements.append(Spacer(1, 20))
    
    # Items Table with new columns
    table_data = [
        ['#', 'Producto', 'Color', 'Medidas', 'M²', 'Cadena', 'Fascia', 'Extras', 'Subtotal']
    ]
    
    for idx, item in enumerate(quote_data['items'], 1):
        color = item.get('color', '-')
        chain = item.get('chain_orientation', 'Der.')[:3] + '.'
        fascia = item.get('fascia_type', 'Redonda')
        fascia_color = item.get('fascia_color', '-')
        fascia_price = item.get('fascia_price', 0)
        installation_price = item.get('installation_price', 0)
        
        if fascia == "Cuadrada sin forrar":
            fascia = "C. s/f"
        elif fascia == "Cuadrada forrada":
            fascia = "C. forr."
        elif fascia == "Redonda":
            fascia = "Red."
        
        # Build extras string
        extras = []
        if fascia_price > 0:
            extras.append(f"F:${fascia_price:,.0f}")
        if installation_price > 0:
            extras.append(f"I:${installation_price:,.0f}")
        extras_str = " ".join(extras) if extras else "-"
        
        fascia_info = f"{fascia} ({fascia_color[:4]})" if fascia_color else fascia
        
        table_data.append([
            str(idx),
            item['product_name'][:16],
            color[:10] if color else '-',
            f"{item['width']:.2f}x{item['height']:.2f}",
            f"{item['square_meters']:.2f}",
            chain,
            fascia_info,
            extras_str,
            f"${item['subtotal']:,.2f}"
        ])
    
    # Add total row
    table_data.append(['', '', '', '', '', '', '', 'TOTAL:', f"${quote_data['total']:,.2f}"])
    
    table = Table(table_data, colWidths=[0.25*inch, 1.0*inch, 0.65*inch, 0.7*inch, 0.4*inch, 0.4*inch, 0.7*inch, 0.65*inch, 0.7*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498DB')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -2), colors.HexColor('#ECF0F1')),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#2C3E50')),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('ALIGN', (1, 1), (1, -1), 'LEFT'),
        ('GRID', (0, 0), (-1, -2), 1, colors.HexColor('#BDC3C7')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#2C3E50')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.whitesmoke),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 10),
        ('TOPPADDING', (0, -1), (-1, -1), 10),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 10),
    ]))
    
    elements.append(table)
    elements.append(Spacer(1, 20))
    
    # Notes
    if quote_data.get('notes'):
        notes_style = ParagraphStyle(
            'NotesStyle',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#7F8C8D')
        )
        elements.append(Paragraph(f"<b>Notas:</b> {quote_data['notes']}", notes_style))
        elements.append(Spacer(1, 20))
    
    # Footer
    footer_style = ParagraphStyle(
        'FooterStyle',
        parent=styles['Normal'],
        fontSize=9,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#95A5A6')
    )
    elements.append(Spacer(1, 30))
    elements.append(Paragraph("Esta cotización tiene una vigencia de 15 días.", footer_style))
    elements.append(Paragraph("Precios sujetos a cambio sin previo aviso.", footer_style))
    elements.append(Paragraph("¡Gracias por su preferencia!", footer_style))
    
    doc.build(elements)
    
    pdf_data = buffer.getvalue()
    buffer.close()
    
    # Return PDF as base64 for mobile app consumption
    pdf_base64 = base64.b64encode(pdf_data).decode('utf-8')
    
    return {
        "pdf_base64": pdf_base64,
        "filename": f"cotizacion_{quote_data['id'][:8]}.pdf"
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
